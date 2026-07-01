/**
 * TrialBalTab — Premium Enterprise Trial Balance
 * Theme-aware: adapts to light and dark mode via useUIStore.
 * All accounting logic, hook, API endpoint, and TrialBalanceRow calculations unchanged.
 */
import { useState, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTrialBalance } from '@/hooks/useQuery'
import { fmt, downloadCSV, fmtDate } from '@/utils'
import useAuthStore from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import {
  Search, Download, Printer, FileSpreadsheet,
  TrendingUp, TrendingDown, Scale, Hash, ChevronDown,
  AlertTriangle, CheckCircle2, RefreshCw, Eye, EyeOff,
  ArrowUpDown, ArrowUp, ArrowDown, LayoutList, AlignJustify,
} from 'lucide-react'
import type { TrialBalanceRow } from '@/types'
import { useAccResponsive } from '../useAccResponsive'

// ── Theme tokens ──────────────────────────────────────────────────────────────
function useTokens() {
  const { theme } = useUIStore()
  const dark = theme === 'dark'
  return {
    dark,
    // card surfaces
    cardBg:     dark ? 'rgba(15,23,42,0.82)' : 'var(--surface)',
    cardBorder: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)',
    cardBlur:   dark ? 'blur(14px)' : undefined,
    cardShadow: dark ? undefined : 'var(--shadow-sm)',
    // inner surfaces
    innerBg:     dark ? 'rgba(255,255,255,0.025)' : 'var(--surface-2)',
    innerBorder: dark ? 'rgba(255,255,255,0.06)'  : 'var(--border)',
    // thead
    theadBg:     dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-2)',
    theadBorder: dark ? 'rgba(255,255,255,0.07)' : 'var(--border)',
    // rows
    rowAlt:      dark ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.016)',
    rowHover:    dark ? 'rgba(59,130,246,0.07)'   : 'rgba(37,99,235,0.04)',
    rowAbnormal: dark ? 'rgba(245,158,11,0.06)'   : 'rgba(245,158,11,0.05)',
    rowAbnormalHover: dark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.09)',
    // tfoot
    tfootBg:     dark ? 'rgba(255,255,255,0.04)' : 'var(--surface-2)',
    tfootBorder: dark ? 'rgba(255,255,255,0.12)' : 'var(--border)',
    // text
    text:       dark ? '#f1f5f9'                : 'var(--text)',
    text2:      dark ? 'rgba(226,232,240,0.88)' : 'var(--text-2)',
    textMuted:  dark ? 'rgba(148,163,184,0.65)' : 'var(--text-3)',
    textFaint:  dark ? 'rgba(148,163,184,0.35)' : 'var(--text-4)',
    // accent
    codeColor:  dark ? '#60a5fa' : '#2563eb',
    debitColor: dark ? '#f87171' : '#dc2626',
    creditColor:dark ? '#34d399' : '#059669',
    // badge type colors (same in both modes — uses transparent tints that work on any bg)
    typeColors: {
      asset:     { bg: 'rgba(59,130,246,0.12)',  color: dark ? '#60a5fa' : '#1d4ed8', border: 'rgba(59,130,246,0.25)' },
      liability: { bg: 'rgba(139,92,246,0.12)',  color: dark ? '#a78bfa' : '#6d28d9', border: 'rgba(139,92,246,0.25)' },
      equity:    { bg: 'rgba(16,185,129,0.12)',  color: dark ? '#34d399' : '#047857', border: 'rgba(16,185,129,0.25)' },
      income:    { bg: 'rgba(20,184,166,0.12)',  color: dark ? '#2dd4bf' : '#0f766e', border: 'rgba(20,184,166,0.25)' },
      expense:   { bg: 'rgba(249,115,22,0.12)',  color: dark ? '#fb923c' : '#c2410c', border: 'rgba(249,115,22,0.25)' },
      other:     { bg: 'rgba(100,116,139,0.1)',  color: dark ? '#94a3b8' : '#475569', border: 'rgba(100,116,139,0.2)' },
    } as Record<string, { bg: string; color: string; border: string }>,
    // toolbar buttons
    btnBorder:    dark ? 'rgba(255,255,255,0.1)' : 'var(--border)',
    btnText:      dark ? 'rgba(148,163,184,0.75)' : 'var(--text-3)',
    btnHoverBg:   dark ? 'rgba(255,255,255,0.06)' : 'var(--surface-3)',
    btnActiveBg:  dark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.08)',
    btnActiveText:dark ? '#93c5fd' : '#2563eb',
    btnActiveBorder: dark ? 'rgba(59,130,246,0.5)' : 'rgba(37,99,235,0.4)',
    // skeleton
    skeletonBg:  dark ? 'rgba(255,255,255,0.06)' : 'var(--surface-3)',
    // report header card
    reportCardBg: dark ? 'rgba(15,23,42,0.7)' : 'var(--surface)',
    reportTitle:  dark ? '#93c5fd' : '#1d4ed8',
  }
}

type SortKey = 'account_code' | 'name' | 'account_type' | 'closing_debit' | 'closing_credit'
type SortDir = 'asc' | 'desc'
type Density = 'compact' | 'comfortable'

// ── Print CSS ─────────────────────────────────────────────────────────────────
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #tb-print-area, #tb-print-area * { visibility: visible !important; }
  #tb-print-area { position: fixed; inset: 0; padding: 24px; background: white; color: black; }
  #tb-no-print { display: none !important; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
}
`

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonTBRows({ n = 8, skBg }: { n?: number; skBg: string }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={i}>
          {[28, 48, 20, 16, 16, 12].map((w, j) => (
            <td key={j} style={{ padding: '10px 16px', textAlign: j > 3 ? 'right' : 'left' }}>
              <div style={{ height: 11, width: `${w}%`, marginLeft: j > 3 ? 'auto' : 0, borderRadius: 4, background: skBg, opacity: 0.4 + (i % 3) * 0.1 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── Summary KPI Card ──────────────────────────────────────────────────────────
interface SummaryCardProps {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: string
  sub?: string
  valColor?: string
  delay?: number
}
const SummaryCard = memo(({ icon, iconBg, iconColor, label, value, sub, valColor, delay = 0 }: SummaryCardProps) => {
  const tk = useTokens()
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: tk.cardBg,
        border: tk.cardBorder,
        backdropFilter: tk.cardBlur,
        WebkitBackdropFilter: tk.cardBlur,
        boxShadow: tk.cardShadow,
        borderRadius: 14,
        padding: '18px 20px',
        minWidth: 0,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 'clamp(15px, 4.5vw, 19px)', fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', color: valColor ?? tk.text, overflowWrap: 'anywhere' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: tk.textFaint, marginTop: 3 }}>{sub}</div>}
    </motion.div>
  )
})
SummaryCard.displayName = 'SummaryCard'

// ── Group header row ──────────────────────────────────────────────────────────
function GroupHeaderRow({ type, rows, expanded, onToggle, density, tk }: {
  type: string; rows: TrialBalanceRow[]; expanded: boolean; onToggle: () => void; density: Density; tk: ReturnType<typeof useTokens>
}) {
  const dr = rows.reduce((s, r) => s + (r.closing_debit  || 0), 0)
  const cr = rows.reduce((s, r) => s + (r.closing_credit || 0), 0)
  const t = tk.typeColors[type.toLowerCase()] ?? tk.typeColors.other
  const py = density === 'compact' ? '7px' : '11px'
  return (
    <tr
      onClick={onToggle}
      style={{
        cursor: 'pointer', userSelect: 'none',
        background: tk.innerBg,
        borderTop: `1px solid ${tk.innerBorder}`,
        borderBottom: `1px solid ${tk.innerBorder}`,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = tk.rowHover }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = tk.innerBg }}
    >
      <td colSpan={2} style={{ padding: `${py} 16px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tk.textMuted, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s' }}>
            <ChevronDown size={13} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}`, letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
            {type.toUpperCase()}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: tk.textFaint }}>{rows.length} account{rows.length !== 1 ? 's' : ''}</span>
        </div>
      </td>
      <td style={{ padding: `${py} 16px` }} />
      <td style={{ padding: `${py} 16px`, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: tk.debitColor }}>
        {dr > 0 ? `₹${fmt(dr)}` : '—'}
      </td>
      <td style={{ padding: `${py} 16px`, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: tk.creditColor }}>
        {cr > 0 ? `₹${fmt(cr)}` : '—'}
      </td>
      <td style={{ padding: `${py} 16px` }} />
    </tr>
  )
}

// ── Account Row ───────────────────────────────────────────────────────────────
const AccountRow = memo(({ row: r, i, density, tk }: { row: TrialBalanceRow; i: number; density: Density; tk: ReturnType<typeof useTokens> }) => {
  const t = tk.typeColors[r.account_type?.toLowerCase?.()] ?? tk.typeColors.other
  const abnormalDr = ['liability','equity','income'].includes(r.account_type?.toLowerCase?.()) && r.closing_debit > 0.01
  const abnormalCr = ['asset','expense'].includes(r.account_type?.toLowerCase?.())            && r.closing_credit > 0.01
  const isAbnormal = abnormalDr || abnormalCr
  const py = density === 'compact' ? '6px' : '10px'
  const baseBg = isAbnormal ? tk.rowAbnormal : i % 2 === 0 ? 'transparent' : tk.rowAlt
  const hoverBg = isAbnormal ? tk.rowAbnormalHover : tk.rowHover

  return (
    <tr
      style={{ borderBottom: `1px solid ${tk.innerBorder}`, background: baseBg, transition: 'background 0.1s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = hoverBg }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = baseBg }}
    >
      <td style={{ padding: `${py} 16px`, fontFamily: 'var(--font-mono)', fontSize: 12, color: tk.codeColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {r.account_code}
      </td>
      <td style={{ padding: `${py} 16px` }}>
        <span style={{ fontWeight: 500, color: isAbnormal ? '#f59e0b' : tk.text2, fontSize: 13 }}>
          {r.name}
        </span>
        {isAbnormal && (
          <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>
            <AlertTriangle size={9} /> Abnormal
          </span>
        )}
      </td>
      <td style={{ padding: `${py} 16px` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}`, fontFamily: 'var(--font-mono)' }}>
          {r.account_type}
        </span>
      </td>
      <td style={{ padding: `${py} 16px`, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: r.closing_debit > 0 ? tk.debitColor : tk.textFaint, fontWeight: r.closing_debit > 0 ? 700 : 400 }}>
        {r.closing_debit > 0 ? `₹${fmt(r.closing_debit)}` : '—'}
      </td>
      <td style={{ padding: `${py} 16px`, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: r.closing_credit > 0 ? tk.creditColor : tk.textFaint, fontWeight: r.closing_credit > 0 ? 700 : 400 }}>
        {r.closing_credit > 0 ? `₹${fmt(r.closing_credit)}` : '—'}
      </td>
      <td style={{ padding: `${py} 16px`, textAlign: 'right' }}>
        {(r.period_debit > 0 || r.period_credit > 0) && (
          <span style={{ fontSize: 10, color: tk.textFaint, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            Δ {r.period_debit > r.period_credit ? `+Dr ${fmt(r.period_debit)}` : `+Cr ${fmt(r.period_credit)}`}
          </span>
        )}
      </td>
    </tr>
  )
})
AccountRow.displayName = 'AccountRow'

// ── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  const tk = useTokens()
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 32, padding: '0 12px', borderRadius: 8,
        border: `1px solid ${active ? tk.btnActiveBorder : tk.btnBorder}`,
        background: active ? tk.btnActiveBg : 'transparent',
        color: active ? tk.btnActiveText : tk.btnText,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'var(--font)', transition: 'all 0.14s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = tk.btnHoverBg }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function TrialBalTab() {
  const { user, company } = useAuthStore()
  const tk = useTokens()
  const { isMobile, isTablet } = useAccResponsive()

  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [dateTo,   setDateTo  ] = useState(new Date().toISOString().split('T')[0])
  const [query,    setQuery   ] = useState<{ date_from: string; as_of_date: string } | null>(null)

  const [search,         setSearch        ] = useState('')
  const [typeFilter,     setTypeFilter    ] = useState('')
  const [showZero,       setShowZero      ] = useState(false)
  const [groupBy,        setGroupBy       ] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [sortKey,        setSortKey       ] = useState<SortKey>('account_code')
  const [sortDir,        setSortDir       ] = useState<SortDir>('asc')
  const [density,        setDensity       ] = useState<Density>('comfortable')
  const [generatedAt,    setGeneratedAt   ] = useState<Date | null>(null)

  const { data: rows, isLoading, isFetching } = useTrialBalance(
    query ? { date_from: query.date_from, as_of_date: query.as_of_date } : undefined
  )
  const data = (rows as TrialBalanceRow[]) || []

  const totalDr = useMemo(() => data.reduce((s, r) => s + (r.closing_debit  || 0), 0), [data])
  const totalCr = useMemo(() => data.reduce((s, r) => s + (r.closing_credit || 0), 0), [data])
  const diff    = Math.abs(totalDr - totalCr)
  const balanced = diff < 0.01

  const accountTypes = useMemo(() => Array.from(new Set(data.map(r => r.account_type))).sort(), [data])

  const filtered = useMemo(() => {
    let r = data
    if (!showZero) r = r.filter(row => (row.closing_debit || 0) + (row.closing_credit || 0) > 0)
    if (typeFilter) r = r.filter(row => row.account_type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(row => row.name.toLowerCase().includes(q) || row.account_code.toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey]
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0)
    })
  }, [data, showZero, typeFilter, search, sortKey, sortDir])

  const grouped = useMemo(() => {
    const map: Record<string, TrialBalanceRow[]> = {}
    filtered.forEach(r => { const k = r.account_type || 'other'; if (!map[k]) map[k] = []; map[k].push(r) })
    return map
  }, [filtered])

  const allGroups = Object.keys(grouped)
  const effectiveExpanded = useMemo(() => {
    const out: Record<string, boolean> = {}
    allGroups.forEach(g => { out[g] = expandedGroups[g] !== false })
    return out
  }, [grouped, expandedGroups])

  function toggleGroup(type: string) { setExpandedGroups(prev => ({ ...prev, [type]: !effectiveExpanded[type] })) }
  function expandAll()   { setExpandedGroups({}) }
  function collapseAll() { const c: Record<string,boolean> = {}; allGroups.forEach(g => c[g] = false); setExpandedGroups(c) }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  function generate() { setQuery({ date_from: dateFrom, as_of_date: dateTo }); setGeneratedAt(new Date()); setExpandedGroups({}) }
  function handleExportCSV() { downloadCSV(filtered as any, `trial-balance-${dateFrom}-${dateTo}`) }
  function handleExportExcel() {
    const headers = ['Code','Account Name','Type','Closing Dr','Closing Cr']
    const rowsHtml = filtered.map(r => `<tr><td>${r.account_code}</td><td>${r.name}</td><td>${r.account_type}</td><td>${r.closing_debit||0}</td><td>${r.closing_credit||0}</td></tr>`).join('')
    const html = `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' })); a.download = `trial-balance-${dateFrom}-${dateTo}.xls`; a.click()
  }
  function handlePrint() {
    const s = document.createElement('style'); s.innerHTML = PRINT_CSS; document.head.appendChild(s)
    window.print(); setTimeout(() => document.head.removeChild(s), 2000)
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={10} style={{ color: tk.textFaint, marginLeft: 3, display: 'inline' }} />
    return sortDir === 'asc'
      ? <ArrowUp   size={10} style={{ color: '#3b82f6', marginLeft: 3, display: 'inline' }} />
      : <ArrowDown size={10} style={{ color: '#3b82f6', marginLeft: 3, display: 'inline' }} />
  }

  const hasData    = data.length > 0
  const isQueried  = !!query
  const cardStyle: React.CSSProperties = {
    background: tk.cardBg, border: tk.cardBorder,
    backdropFilter: tk.cardBlur, WebkitBackdropFilter: tk.cardBlur,
    boxShadow: tk.cardShadow, borderRadius: 14,
  }

  // Summary icon colours — shared tints work on both themes
  const summaryCards = [
    { icon: <TrendingUp  size={20} />, iconBg: 'rgba(239,68,68,0.12)',  iconColor: tk.debitColor,  label: 'Total Debit',  value: isLoading ? '…' : `₹${fmt(totalDr)}`, sub: 'Closing debit balance',   valColor: tk.debitColor,  delay: 0.05 },
    { icon: <TrendingDown size={20}/>, iconBg: 'rgba(16,185,129,0.12)', iconColor: tk.creditColor, label: 'Total Credit', value: isLoading ? '…' : `₹${fmt(totalCr)}`, sub: 'Closing credit balance',  valColor: tk.creditColor, delay: 0.1  },
    {
      icon: balanced ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />,
      iconBg:    balanced ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      iconColor: balanced ? tk.creditColor          : tk.debitColor,
      label: 'Difference',
      value: isLoading ? '…' : balanced ? 'Balanced ✓' : `₹${fmt(diff)}`,
      sub:  balanced ? 'Dr = Cr' : 'Imbalance detected',
      valColor: balanced ? tk.creditColor : tk.debitColor,
      delay: 0.15,
    },
    { icon: <Hash size={20} />, iconBg: 'rgba(59,130,246,0.12)', iconColor: '#60a5fa', label: 'Accounts', value: isLoading ? '…' : String(filtered.length), sub: `of ${data.length} total`, delay: 0.2 },
  ]

  return (
    <div id="tb-print-area">

      {/* ── Filter Card ────────────────────────────────────────────────────── */}
      <motion.div id="tb-no-print" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ ...cardStyle, padding: '18px 20px', marginBottom: 16 }}
      >
        <div className="acc-tb-filter-row" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch' } : {}) }}>
          {[
            { label: 'From Date',     value: dateFrom, onChange: setDateFrom, width: 155 },
            { label: 'As of Date',    value: dateTo,   onChange: setDateTo,   width: 155 },
          ].map(f => (
            <div key={f.label} className="acc-tb-filter-field" style={isMobile ? { width: '100%' } : undefined}>
              <label style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>{f.label}</label>
              <input type="date" className="erp-input" style={{ width: isMobile ? '100%' : f.width, minHeight: isMobile ? 44 : undefined, boxSizing: 'border-box' }} value={f.value} onChange={e => f.onChange(e.target.value)} />
            </div>
          ))}
          <div className="acc-tb-filter-field" style={isMobile ? { width: '100%' } : undefined}>
            <label style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Account Type</label>
            <select className="erp-input" style={{ width: isMobile ? '100%' : 148, minHeight: isMobile ? 44 : undefined, boxSizing: 'border-box' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {accountTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="acc-tb-filter-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}>
            <button
              onClick={generate} disabled={isLoading || isFetching}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: isMobile ? 44 : 35, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 9, color: '#fff', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 2px 10px rgba(37,99,235,.35)', opacity: (isLoading||isFetching) ? 0.6 : 1, transition: 'opacity 0.15s', flex: isMobile ? '1 1 auto' : undefined }}
            >
              {(isLoading || isFetching) ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={13} />}
              Generate
            </button>
            {hasData && (
              <>
                <button onClick={handlePrint}        className="btn btn-secondary" style={{ height: isMobile ? 40 : 35, flex: isMobile ? '1 1 calc(33% - 6px)' : undefined, justifyContent: 'center' }}><Printer size={13} /> Print</button>
                <button onClick={handleExportExcel}  className="btn btn-secondary" style={{ height: isMobile ? 40 : 35, flex: isMobile ? '1 1 calc(33% - 6px)' : undefined, justifyContent: 'center' }}><FileSpreadsheet size={13} /> Excel</button>
                <button onClick={handleExportCSV}    className="btn btn-secondary" style={{ height: isMobile ? 40 : 35, flex: isMobile ? '1 1 calc(33% - 6px)' : undefined, justifyContent: 'center' }}><Download size={13} /> CSV</button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Empty Prompt ────────────────────────────────────────────────────── */}
      {!isQueried && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', textAlign: 'center' }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 16 }}>⚖️</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: tk.text2, marginBottom: 6 }}>Select Date Range and Generate</div>
          <div style={{ fontSize: 13, color: tk.textMuted }}>Set From and To dates, then click <strong>Generate</strong></div>
        </motion.div>
      )}

      <AnimatePresence>
        {(isQueried || hasData) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* ── Report Header ─────────────────────────────────────────────── */}
            <div style={{ ...cardStyle, padding: '18px 22px', marginBottom: 14, textAlign: 'center' }}>
              {company?.name && <div style={{ fontSize: 16, fontWeight: 800, color: tk.text }}>{company.name}</div>}
              <div style={{ fontSize: 18, fontWeight: 800, color: tk.reportTitle, letterSpacing: '-0.02em', marginTop: 2 }}>Trial Balance</div>
              <div style={{ fontSize: 13, color: tk.textMuted, marginTop: 4 }}>
                {query?.date_from && query?.as_of_date ? `Period: ${fmtDate(query.date_from)} — ${fmtDate(query.as_of_date)}` : 'All Periods'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${tk.innerBorder}`, fontSize: 11, color: tk.textFaint }}>
                <span>Generated: {generatedAt?.toLocaleString('en-NP') ?? '—'}</span>
                {user?.name && <span>By: {user.name}</span>}
              </div>
            </div>

            {/* ── Imbalance Warning ─────────────────────────────────────────── */}
            <AnimatePresence>
              {hasData && !balanced && !isLoading && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  Trial Balance is out of balance by ₹{fmt(diff)} — review your posting engine configuration.
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── KPI Summary Cards ─────────────────────────────────────────── */}
            <div className="acc-tb-kpi-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 8 : 12, marginBottom: 16, minWidth: 0 }} id="tb-no-print">
              {summaryCards.map(sc => <SummaryCard key={sc.label} {...sc} />)}
            </div>

            {/* ── Table Card ───────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
              style={{ ...cardStyle, overflow: 'hidden' }}
            >
              {/* Toolbar */}
              <div id="tb-no-print" className="acc-tb-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${tk.theadBorder}`, flexWrap: 'wrap', ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch' } : {}) }}>
                <div className="acc-tb-search-wrap" style={{ position: 'relative', width: isMobile ? '100%' : undefined }}>
                  <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: tk.textFaint, pointerEvents: 'none' }} />
                  <input placeholder="Search accounts…" className="erp-input" style={{ width: isMobile ? '100%' : 210, paddingLeft: 32, minHeight: isMobile ? 44 : undefined, boxSizing: 'border-box' }} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="acc-tb-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
                  <TBtn active={showZero} onClick={() => setShowZero(v => !v)} title={showZero ? 'Hide zero balances' : 'Show zero balances'}>
                    {showZero ? <Eye size={12} /> : <EyeOff size={12} />} Zero
                  </TBtn>
                  <TBtn active={groupBy} onClick={() => setGroupBy(v => !v)}>
                    <LayoutList size={12} /> Group
                  </TBtn>
                  <TBtn onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}>
                    <AlignJustify size={12} /> {density === 'compact' ? 'Compact' : 'Comfy'}
                  </TBtn>
                  {groupBy && (
                    <>
                      <TBtn onClick={expandAll}>Expand All</TBtn>
                      <TBtn onClick={collapseAll}>Collapse All</TBtn>
                    </>
                  )}
                  <span style={{ fontSize: 12, color: tk.textFaint, paddingLeft: 4 }}>
                    <strong style={{ color: tk.text2 }}>{filtered.length}</strong> accounts
                  </span>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: tk.theadBg, borderBottom: `1px solid ${tk.theadBorder}` }}>
                      {[
                        { key: 'account_code'   as SortKey, label: 'Code',        align: 'left'  },
                        { key: 'name'           as SortKey, label: 'Account Name', align: 'left'  },
                        { key: 'account_type'   as SortKey, label: 'Type',         align: 'left'  },
                        { key: 'closing_debit'  as SortKey, label: 'Debit (₹)',    align: 'right' },
                        { key: 'closing_credit' as SortKey, label: 'Credit (₹)',   align: 'right' },
                        { key: null,                         label: '',             align: 'right' },
                      ].map((col, i) => (
                        <th key={i} onClick={col.key ? () => handleSort(col.key!) : undefined}
                          style={{ padding: density === 'compact' ? '8px 16px' : '11px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: tk.textMuted, textAlign: col.align === 'right' ? 'right' : 'left', cursor: col.key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}
                        >
                          {col.label}{col.key && <SortIcon col={col.key} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <SkeletonTBRows n={10} skBg={tk.skeletonBg} />
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '64px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: tk.textFaint }}>
                            <Scale size={28} style={{ opacity: 0.4 }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>No accounts match your filters</span>
                          </div>
                        </td>
                      </tr>
                    ) : groupBy ? (
                      Object.entries(grouped).map(([type, typeRows]) => (
                        <>
                          <GroupHeaderRow key={`hdr-${type}`} type={type} rows={typeRows} expanded={effectiveExpanded[type]} onToggle={() => toggleGroup(type)} density={density} tk={tk} />
                          <AnimatePresence>
                            {effectiveExpanded[type] && typeRows.map((r, i) => (
                              <AccountRow key={r.account_id} row={r} i={i} density={density} tk={tk} />
                            ))}
                          </AnimatePresence>
                        </>
                      ))
                    ) : (
                      filtered.map((r, i) => <AccountRow key={r.account_id} row={r} i={i} density={density} tk={tk} />)
                    )}
                  </tbody>
                  {hasData && !isLoading && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${tk.tfootBorder}`, background: tk.tfootBg }}>
                        <td colSpan={3} style={{ padding: '12px 16px', paddingRight: 24, textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: tk.textMuted, fontFamily: 'var(--font-mono)' }}>
                          Grand Total
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 14, color: tk.debitColor }}>
                          ₹{fmt(totalDr)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 14, color: balanced ? tk.creditColor : tk.debitColor }}>
                          ₹{fmt(totalCr)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: balanced ? tk.creditColor : tk.debitColor }}>
                          {balanced
                            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}><CheckCircle2 size={13} />Balanced</span>
                            : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}><AlertTriangle size={13} />Off by ₹{fmt(diff)}</span>
                          }
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
