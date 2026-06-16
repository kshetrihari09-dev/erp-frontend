/**
 * TrialBalTab — Premium Enterprise Trial Balance
 *
 * UI/UX completely redesigned. All accounting logic, hook, API endpoint,
 * and TrialBalanceRow calculations are 100% unchanged.
 */
import { useState, useMemo, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTrialBalance } from '@/hooks/useQuery'
import { Button, Empty } from '@/components/ui'
import { fmt, downloadCSV, fmtDate } from '@/utils'
import useAuthStore from '@/store/authStore'
import {
  Search, Download, Printer, FileSpreadsheet, FileText,
  TrendingUp, TrendingDown, Scale, Hash, ChevronDown,
  ChevronRight as ChevronRightIcon, AlertTriangle, CheckCircle2,
  RefreshCw, Eye, EyeOff, SlidersHorizontal, ArrowUpDown,
  ArrowUp, ArrowDown, LayoutList, AlignJustify,
} from 'lucide-react'
import type { TrialBalanceRow, AccountType } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700 border-blue-200',
  liability: 'bg-violet-50 text-violet-700 border-violet-200',
  equity:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  income:    'bg-teal-50 text-teal-700 border-teal-200',
  expense:   'bg-orange-50 text-orange-700 border-orange-200',
}

type SortKey = 'account_code' | 'name' | 'account_type' | 'closing_debit' | 'closing_credit'
type SortDir = 'asc' | 'desc'
type Density = 'compact' | 'comfortable'

// ── Animated counter ─────────────────────────────────────────────────────────
function AnimatedAmt({ value }: { value: number }) {
  return <span>₹{fmt(value)}</span>
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonTBRows({ n = 8 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[28, 48, 32, 24, 20, 20].map((w, j) => (
            <td key={j} className={j > 3 ? 'td-right' : ''}>
              <div className={`h-3 bg-slate-100 rounded`} style={{ width: `${w}%`, marginLeft: j > 3 ? 'auto' : 0 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── KPI Summary Card ──────────────────────────────────────────────────────────
interface SummaryCardProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub?: string
  highlight?: 'success' | 'danger' | 'neutral'
  delay?: number
}
const SummaryCard = memo(({ icon, iconBg, label, value, sub, highlight, delay = 0 }: SummaryCardProps) => {
  const valColor =
    highlight === 'success' ? 'text-emerald-600' :
    highlight === 'danger'  ? 'text-red-600'     : 'text-slate-800'
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        {icon}
      </div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono tracking-tight ${valColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </motion.div>
  )
})
SummaryCard.displayName = 'SummaryCard'

// ── Group header row ──────────────────────────────────────────────────────────
function GroupHeaderRow({
  type, rows, expanded, onToggle, density,
}: {
  type: string; rows: TrialBalanceRow[]; expanded: boolean; onToggle: () => void; density: Density
}) {
  const dr = rows.reduce((s, r) => s + (r.closing_debit  || 0), 0)
  const cr = rows.reduce((s, r) => s + (r.closing_credit || 0), 0)
  const badge = ACCOUNT_TYPE_COLORS[type.toLowerCase()] ?? 'bg-slate-100 text-slate-500 border-slate-200'
  const py = density === 'compact' ? 'py-2' : 'py-3'

  return (
    <tr
      className={`cursor-pointer select-none bg-slate-50 hover:bg-slate-100/80 transition-colors duration-150 border-y border-slate-200`}
      onClick={onToggle}
    >
      <td colSpan={2} className={`${py} px-4`}>
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded flex items-center justify-center text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}>
            <ChevronDown size={14} />
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${badge}`}>
            {type.toUpperCase()}
          </span>
          <span className="text-xs font-bold text-slate-600">{rows.length} account{rows.length !== 1 ? 's' : ''}</span>
        </div>
      </td>
      <td className={`${py} px-4`} />
      <td className={`${py} px-4 text-right text-xs font-bold font-mono text-slate-600`}>
        {dr > 0 ? `₹${fmt(dr)}` : '—'}
      </td>
      <td className={`${py} px-4 text-right text-xs font-bold font-mono text-slate-600`}>
        {cr > 0 ? `₹${fmt(cr)}` : '—'}
      </td>
      <td className={`${py} px-4`} />
    </tr>
  )
}

// ── Print Styles (injected into head on print) ────────────────────────────────
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #tb-print-area, #tb-print-area * { visibility: visible !important; }
  #tb-print-area { position: fixed; inset: 0; padding: 24px; background: white; }
  #tb-no-print { display: none !important; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
}
`

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function TrialBalTab() {
  const { user, company } = useAuthStore()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  )
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  // query is the committed filter (what was last clicked "Generate")
  const [query, setQuery]   = useState<{ date_from: string; as_of_date: string } | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState('')
  const [showZero,     setShowZero]     = useState(false)
  const [groupBy,      setGroupBy]      = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [sortKey,      setSortKey]      = useState<SortKey>('account_code')
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')
  const [density,      setDensity]      = useState<Density>('comfortable')
  const [generatedAt,  setGeneratedAt]  = useState<Date | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: rows, isLoading, isFetching } = useTrialBalance(
    query ? { date_from: query.date_from, as_of_date: query.as_of_date } : undefined
  )
  const data = (rows as TrialBalanceRow[]) || []

  // ── Derived totals (pure calculation — unchanged) ─────────────────────────
  const totalDr  = useMemo(() => data.reduce((s, r) => s + (r.closing_debit  || 0), 0), [data])
  const totalCr  = useMemo(() => data.reduce((s, r) => s + (r.closing_credit || 0), 0), [data])
  const diff     = Math.abs(totalDr - totalCr)
  const balanced = diff < 0.01

  // ── Account types list ────────────────────────────────────────────────────
  const accountTypes = useMemo(() =>
    Array.from(new Set(data.map(r => r.account_type))).sort()
  , [data])

  // ── Filtered + sorted rows ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = data
    if (!showZero) r = r.filter(row => (row.closing_debit || 0) + (row.closing_credit || 0) > 0)
    if (typeFilter) r = r.filter(row => row.account_type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(row =>
        row.name.toLowerCase().includes(q) ||
        row.account_code.toLowerCase().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey]
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0)
                                : (av > bv ? -1 : av < bv ? 1 : 0)
    })
  }, [data, showZero, typeFilter, search, sortKey, sortDir])

  // ── Grouped view ──────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map: Record<string, TrialBalanceRow[]> = {}
    filtered.forEach(r => {
      const k = r.account_type || 'other'
      if (!map[k]) map[k] = []
      map[k].push(r)
    })
    return map
  }, [filtered])

  // Initialize all groups as expanded
  const allGroups = Object.keys(grouped)
  const effectiveExpanded = useMemo(() => {
    const out: Record<string, boolean> = {}
    allGroups.forEach(g => { out[g] = expandedGroups[g] !== false })
    return out
  }, [grouped, expandedGroups])

  function toggleGroup(type: string) {
    setExpandedGroups(prev => ({ ...prev, [type]: !effectiveExpanded[type] }))
  }
  function expandAll()  { setExpandedGroups({}) }
  function collapseAll(){ const c: Record<string,boolean> = {}; allGroups.forEach(g => c[g] = false); setExpandedGroups(c) }

  // ── Sorting ───────────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  function generate() {
    setQuery({ date_from: dateFrom, as_of_date: dateTo })
    setGeneratedAt(new Date())
    setExpandedGroups({})
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function handleExportCSV() {
    downloadCSV(filtered as any, `trial-balance-${dateFrom}-${dateTo}`)
  }

  function handleExportExcel() {
    // Build a minimal HTML table and trigger download as .xls
    const headers = ['Code','Account Name','Type','Opening Dr','Opening Cr','Period Dr','Period Cr','Closing Dr','Closing Cr']
    const rowsHtml = filtered.map(r =>
      `<tr><td>${r.account_code}</td><td>${r.name}</td><td>${r.account_type}</td>` +
      `<td>${r.opening_debit||0}</td><td>${r.opening_credit||0}</td>` +
      `<td>${r.period_debit||0}</td><td>${r.period_credit||0}</td>` +
      `<td>${r.closing_debit||0}</td><td>${r.closing_credit||0}</td></tr>`
    ).join('')
    const html = `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trial-balance-${dateFrom}-${dateTo}.xls`
    a.click()
  }

  function handlePrint() {
    const style = document.createElement('style')
    style.innerHTML = PRINT_CSS
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.head.removeChild(style), 2000)
  }

  // ── Sort icon helper ──────────────────────────────────────────────────────
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={11} className="text-slate-300 ml-1 inline" />
    return sortDir === 'asc'
      ? <ArrowUp size={11} className="text-blue-500 ml-1 inline" />
      : <ArrowDown size={11} className="text-blue-500 ml-1 inline" />
  }

  const py = density === 'compact' ? 'py-1.5' : 'py-2.5'
  const hasData = data.length > 0
  const isQueried = !!query

  return (
    <div id="tb-print-area">
      {/* ── Filter Card ─────────────────────────────────────────────────── */}
      <motion.div
        id="tb-no-print"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5"
      >
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">From Date</label>
            <input type="date" className="erp-input" style={{ width: 155 }} value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">As of Date</label>
            <input type="date" className="erp-input" style={{ width: 155 }} value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account Type</label>
            <select className="erp-input" style={{ width: 148 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {accountTypes.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={generate}
              disabled={isLoading || isFetching}
              className="inline-flex items-center gap-2 h-[35px] px-5 text-sm font-semibold rounded-lg text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 2px 8px rgba(37,99,235,.35)' }}
            >
              {(isLoading || isFetching)
                ? <RefreshCw size={13} className="animate-spin" />
                : <Search size={13} />
              }
              Generate
            </button>

            {hasData && (
              <>
                <button onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  <Printer size={13} /> Print
                </button>
                <button onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  <FileSpreadsheet size={13} /> Excel
                </button>
                <button onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  <Download size={13} /> CSV
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Empty Prompt ─────────────────────────────────────────────────── */}
      {!isQueried && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center text-4xl mb-4">⚖️</div>
          <h3 className="font-bold text-slate-700 mb-1">Select Date Range and Generate</h3>
          <p className="text-sm text-slate-400">Set From and To dates, then click <strong>Generate</strong></p>
        </motion.div>
      )}

      <AnimatePresence>
        {(isQueried || hasData) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* ── Report Header (visible in print too) ─────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
              <div className="text-center mb-1">
                {company?.name && (
                  <div className="text-lg font-bold text-slate-800">{company.name}</div>
                )}
                <div className="text-xl font-bold text-blue-700 tracking-tight mt-0.5">Trial Balance</div>
                <div className="text-sm text-slate-500 mt-1">
                  {query?.date_from && query?.as_of_date
                    ? `Period: ${fmtDate(query.date_from)} — ${fmtDate(query.as_of_date)}`
                    : 'All Periods'
                  }
                </div>
              </div>
              <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex-wrap gap-1">
                <span>Generated: {generatedAt?.toLocaleString('en-NP') ?? '—'}</span>
                {user?.name && <span>By: {user.name}</span>}
              </div>
            </div>

            {/* ── Imbalance Warning ────────────────────────────────────── */}
            <AnimatePresence>
              {hasData && !balanced && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold mb-4"
                >
                  <AlertTriangle size={16} className="flex-shrink-0 text-red-500" />
                  Trial Balance is out of balance by ₹{fmt(diff)} — review your posting engine configuration.
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── KPI Summary Cards ────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" id="tb-no-print">
              <SummaryCard
                icon={<TrendingUp size={20} className="text-red-600" />}
                iconBg="bg-red-50"
                label="Total Debit"
                value={isLoading ? '…' : `₹${fmt(totalDr)}`}
                sub="Closing debit balance"
                delay={0.05}
              />
              <SummaryCard
                icon={<TrendingDown size={20} className="text-emerald-600" />}
                iconBg="bg-emerald-50"
                label="Total Credit"
                value={isLoading ? '…' : `₹${fmt(totalCr)}`}
                sub="Closing credit balance"
                delay={0.1}
              />
              <SummaryCard
                icon={
                  balanced
                    ? <CheckCircle2 size={20} className="text-emerald-600" />
                    : <AlertTriangle size={20} className="text-red-500" />
                }
                iconBg={balanced ? 'bg-emerald-50' : 'bg-red-50'}
                label="Difference"
                value={isLoading ? '…' : balanced ? 'Balanced ✓' : `₹${fmt(diff)}`}
                sub={balanced ? 'Dr = Cr' : 'Imbalance detected'}
                highlight={isLoading ? 'neutral' : balanced ? 'success' : 'danger'}
                delay={0.15}
              />
              <SummaryCard
                icon={<Hash size={20} className="text-blue-600" />}
                iconBg="bg-blue-50"
                label="Accounts"
                value={isLoading ? '…' : String(filtered.length)}
                sub={`of ${data.length} total`}
                delay={0.2}
              />
            </div>

            {/* ── Table Card ───────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 flex-wrap" id="tb-no-print">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      placeholder="Search accounts…"
                      className="erp-input pl-8"
                      style={{ width: 220 }}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Show zero toggle */}
                  <button
                    onClick={() => setShowZero(v => !v)}
                    title={showZero ? 'Hide zero-balance accounts' : 'Show zero-balance accounts'}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-all ${
                      showZero
                        ? 'border-blue-400 text-blue-600 bg-blue-50'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {showZero ? <Eye size={12} /> : <EyeOff size={12} />}
                    Zero
                  </button>

                  {/* Group toggle */}
                  <button
                    onClick={() => setGroupBy(v => !v)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-all ${
                      groupBy
                        ? 'border-blue-400 text-blue-600 bg-blue-50'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutList size={12} /> Group
                  </button>

                  {/* Density */}
                  <button
                    onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
                    title="Toggle density"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-all"
                  >
                    <AlignJustify size={12} />
                    {density === 'compact' ? 'Compact' : 'Comfy'}
                  </button>

                  {groupBy && (
                    <>
                      <button onClick={expandAll}
                        className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-all">
                        Expand All
                      </button>
                      <button onClick={collapseAll}
                        className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-all">
                        Collapse All
                      </button>
                    </>
                  )}

                  <span className="text-xs text-slate-400 pl-1">
                    <strong className="text-slate-600">{filtered.length}</strong> accounts
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {[
                        { key: 'account_code' as SortKey, label: 'Code',         align: 'left'  },
                        { key: 'name'         as SortKey, label: 'Account Name',  align: 'left'  },
                        { key: 'account_type' as SortKey, label: 'Type',          align: 'left'  },
                        { key: 'closing_debit' as SortKey,  label: 'Debit (₹)',   align: 'right' },
                        { key: 'closing_credit' as SortKey, label: 'Credit (₹)',  align: 'right' },
                        { key: null,                         label: '',            align: 'right' },
                      ].map((col, i) => (
                        <th
                          key={i}
                          onClick={col.key ? () => handleSort(col.key!) : undefined}
                          className={`
                            ${density === 'compact' ? 'py-2' : 'py-3'} px-4
                            text-[10px] font-bold uppercase tracking-widest text-slate-400
                            ${col.align === 'right' ? 'text-right' : 'text-left'}
                            ${col.key ? 'cursor-pointer hover:text-slate-600 select-none' : ''}
                            whitespace-nowrap
                          `}
                        >
                          {col.label}
                          {col.key && <SortIcon col={col.key} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <SkeletonTBRows n={10} />
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-2 text-slate-400">
                            <Scale size={28} className="opacity-30" />
                            <div className="text-sm font-medium">No accounts match your filters</div>
                          </div>
                        </td>
                      </tr>
                    ) : groupBy ? (
                      // ── Grouped view ────────────────────────────────
                      Object.entries(grouped).map(([type, typeRows]) => (
                        <>
                          <GroupHeaderRow
                            key={`hdr-${type}`}
                            type={type}
                            rows={typeRows}
                            expanded={effectiveExpanded[type]}
                            onToggle={() => toggleGroup(type)}
                            density={density}
                          />
                          <AnimatePresence>
                            {effectiveExpanded[type] && typeRows.map((r, i) => (
                              <AccountRow key={r.account_id} row={r} i={i} py={py} />
                            ))}
                          </AnimatePresence>
                        </>
                      ))
                    ) : (
                      // ── Flat view ───────────────────────────────────
                      filtered.map((r, i) => (
                        <AccountRow key={r.account_id} row={r} i={i} py={py} />
                      ))
                    )}
                  </tbody>

                  {/* Footer totals */}
                  {hasData && !isLoading && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50">
                        <td colSpan={3} className={`${py} px-4 text-right text-xs font-bold uppercase tracking-widest text-slate-500 pr-6`}>
                          Grand Total
                        </td>
                        <td className={`${py} px-4 text-right font-bold font-mono text-base ${balanced ? 'text-slate-800' : 'text-red-600'}`}>
                          ₹{fmt(totalDr)}
                        </td>
                        <td className={`${py} px-4 text-right font-bold font-mono text-base ${balanced ? 'text-slate-800' : 'text-red-600'}`}>
                          ₹{fmt(totalCr)}
                        </td>
                        <td className={`${py} px-4 text-right text-xs font-bold ${balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                          {balanced
                            ? <span className="flex items-center justify-end gap-1"><CheckCircle2 size={13}/>Balanced</span>
                            : <span className="flex items-center justify-end gap-1"><AlertTriangle size={13}/>Off by ₹{fmt(diff)}</span>
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

// ── Account data row (memoized) ───────────────────────────────────────────────
const AccountRow = memo(({ row: r, i, py }: { row: TrialBalanceRow; i: number; py: string }) => {
  const badge = ACCOUNT_TYPE_COLORS[r.account_type?.toLowerCase?.()] ?? 'bg-slate-100 text-slate-500 border-slate-200'
  // Highlight abnormal: asset/expense should have Dr balance; liability/equity/income should have Cr
  const abnormalDr = ['liability','equity','income'].includes(r.account_type?.toLowerCase?.()) && r.closing_debit > 0.01
  const abnormalCr = ['asset','expense'].includes(r.account_type?.toLowerCase?.())            && r.closing_credit > 0.01
  const isAbnormal = abnormalDr || abnormalCr

  return (
    <tr
      className={`border-b border-slate-50 transition-colors duration-100
        ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
        hover:bg-blue-50/30
        ${isAbnormal ? 'bg-amber-50/40 hover:bg-amber-50/60' : ''}
      `}
    >
      <td className={`${py} px-4 font-mono text-[12px] text-blue-600 font-semibold whitespace-nowrap`}>
        {r.account_code}
      </td>
      <td className={`${py} px-4`}>
        <span className={`font-medium text-slate-700 ${isAbnormal ? 'text-amber-700' : ''}`}>
          {r.name}
        </span>
        {isAbnormal && (
          <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-bold">
            <AlertTriangle size={9} /> Abnormal
          </span>
        )}
      </td>
      <td className={`${py} px-4`}>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge}`}>
          {r.account_type}
        </span>
      </td>
      <td className={`${py} px-4 text-right font-mono text-sm ${r.closing_debit > 0 ? 'text-red-600 font-semibold' : 'text-slate-300'}`}>
        {r.closing_debit > 0 ? `₹${fmt(r.closing_debit)}` : '—'}
      </td>
      <td className={`${py} px-4 text-right font-mono text-sm ${r.closing_credit > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-300'}`}>
        {r.closing_credit > 0 ? `₹${fmt(r.closing_credit)}` : '—'}
      </td>
      <td className={`${py} px-4 text-right`}>
        {/* Opening details tooltip-like small badge */}
        {(r.period_debit > 0 || r.period_credit > 0) && (
          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap" title={`Period: Dr ${fmt(r.period_debit)} / Cr ${fmt(r.period_credit)}`}>
            Δ {r.period_debit > r.period_credit
              ? `+Dr ${fmt(r.period_debit)}`
              : `+Cr ${fmt(r.period_credit)}`
            }
          </span>
        )}
      </td>
    </tr>
  )
})
AccountRow.displayName = 'AccountRow'
