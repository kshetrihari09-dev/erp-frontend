import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, fmtDate, downloadCSV } from '@/utils'
import {
  FileText, TrendingUp, TrendingDown, AlertCircle, Package,
  Search, Download, RefreshCw, ChevronDown, Printer,
  BarChart2, PieChart as PieIcon, Users, Calendar,
  ArrowUpRight, ArrowDownRight, X,
  CheckCircle, Clock, XCircle, MinusCircle,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────────────
   All surfaces, borders and text use CSS custom properties so the page
   automatically adapts to light / dark mode via globals.css .dark { } vars.
   Only semantic accent colours (#2563eb, #16a34a …) are hardcoded because
   they look correct on both light and dark backgrounds.
───────────────────────────────────────────────────────────────────────────── */

// ── Accent palette (theme-invariant) ─────────────────────────────────────────
const A = {
  primary: '#2563eb',
  success: '#16a34a',
  warning: '#f59e0b',
  danger:  '#dc2626',
  purple:  '#7c3aed',
  cyan:    '#0891b2',
}

// ── Shared card style ─────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 16,
  boxShadow:    'var(--shadow-sm)',
}

// ── Shared table cell styles ──────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.6px',
  textAlign: 'left', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13, color: 'var(--text)',
  verticalAlign: 'middle',
}
const TDR: React.CSSProperties = {
  ...TD, textAlign: 'right',
  fontVariantNumeric: 'tabular-nums', fontWeight: 500,
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const REPORT_TABS = [
  { id: 'sales',     label: 'Sales',          icon: <FileText    size={14}/> },
  { id: 'purchases', label: 'Purchases',      icon: <Package     size={14}/> },
  { id: 'pnl',       label: 'Profit & Loss',  icon: <BarChart2   size={14}/> },
  { id: 'stock',     label: 'Stock',          icon: <PieIcon     size={14}/> },
  { id: 'expiry',    label: 'Expiry',         icon: <AlertCircle size={14}/> },
  { id: 'party_bal', label: 'Party Balances', icon: <Users       size={14}/> },
]

// ── Quick date ranges ─────────────────────────────────────────────────────────
const QUICK_RANGES = [
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This Week' },
  { key: 'month',   label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year',    label: 'This Year' },
]

function getRange(key: string): [string, string] {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'today':   return [iso(now), iso(now)]
    case 'week': {  const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [iso(d), iso(now)] }
    case 'month':   return [iso(new Date(y, m, 1)), iso(now)]
    case 'quarter': return [iso(new Date(y, Math.floor(m/3)*3, 1)), iso(now)]
    case 'year':    return [iso(new Date(y, 0, 1)), iso(now)]
    default:        return [iso(new Date(y, 0, 1)), iso(now)]
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; color: string; icon?: React.ReactNode; label: string }> = {
  active:    { bg: 'rgba(22,163,74,0.12)',   color: '#15803d', icon: <CheckCircle size={10}/>,  label: 'Active' },
  paid:      { bg: 'rgba(22,163,74,0.12)',   color: '#15803d', icon: <CheckCircle size={10}/>,  label: 'Paid' },
  pending:   { bg: 'rgba(245,158,11,0.12)',  color: '#b45309', icon: <Clock size={10}/>,        label: 'Pending' },
  draft:     { bg: 'rgba(100,116,139,0.1)',  color: 'var(--text-3)', icon: <MinusCircle size={10}/>, label: 'Draft' },
  cancelled: { bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c', icon: <XCircle size={10}/>,     label: 'Cancelled' },
  credit:    { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Credit' },
  cash:      { bg: 'rgba(22,163,74,0.12)',  color: '#15803d', label: 'Cash' },
  bank:      { bg: 'rgba(37,99,235,0.12)',  color: '#1d4ed8', label: 'Bank' },
  card:      { bg: 'rgba(124,58,237,0.12)', color: '#6d28d9', label: 'Card' },
  online:    { bg: 'rgba(8,145,178,0.12)',  color: '#0e7490', label: 'Online' },
}

function StatusBadge({ value }: { value: string }) {
  const key = (value || '').toLowerCase()
  const cfg = STATUS_CONFIG[key] || { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-3)', label: value }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {cfg.icon}{cfg.label || value}
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, trend }: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; color: string; trend?: number
}) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', cursor: 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: trend >= 0 ? A.success : A.danger }}>
            {trend >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ dateFrom, dateTo, loading, onDateChange, onGenerate, onReset }: {
  dateFrom: string; dateTo: string; loading: boolean
  onDateChange: (k: 'from'|'to', v: string) => void
  onGenerate: () => void; onReset: () => void
}) {
  const [active, setActive] = useState('year')

  function applyRange(key: string) {
    setActive(key)
    const [f, t] = getRange(key)
    onDateChange('from', f); onDateChange('to', t)
  }

  return (
    <div style={{ ...CARD, padding: '14px 16px', marginBottom: 20 }}>
      {/* Quick range pills — always wrap */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {QUICK_RANGES.map(r => (
          <button key={r.key} onClick={() => applyRange(r.key)} style={{
            padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${active === r.key ? A.primary : 'var(--border)'}`,
            background: active === r.key ? A.primary + '12' : 'transparent',
            color: active === r.key ? A.primary : 'var(--text-2)',
            transition: 'all 0.15s', fontFamily: 'var(--font)',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Date row + actions — stack on small screens */}
      <div className="flex flex-wrap items-center gap-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
          <Calendar size={14} color="var(--text-4)" style={{ flexShrink: 0 }}/>
          <input type="date" value={dateFrom} className="erp-input" style={{ flex: 1, minWidth: 0 }}
            onChange={e => { setActive('custom'); onDateChange('from', e.target.value) }} />
          <span style={{ color: 'var(--text-4)', fontSize: 12, flexShrink: 0 }}>—</span>
          <input type="date" value={dateTo} className="erp-input" style={{ flex: 1, minWidth: 0 }}
            onChange={e => { setActive('custom'); onDateChange('to', e.target.value) }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onReset} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <X size={13}/> Reset
          </button>
          <button onClick={onGenerate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading ? <RefreshCw size={13} className="animate-spin"/> : <Search size={13}/>}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Export dropdown ───────────────────────────────────────────────────────────
function ExportMenu({ onCSV, onPrint }: { onCSV: () => void; onPrint: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <Download size={13}/> Export <ChevronDown size={12}/>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}/>
          <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, ...CARD, borderRadius: 12, padding: 6, minWidth: 140 }}>
            {[
              { label: 'Export CSV', icon: <Download size={13}/>, fn: () => { onCSV(); setOpen(false) } },
              { label: 'Print',      icon: <Printer  size={13}/>, fn: () => { onPrint(); setOpen(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.fn}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--text)', textAlign: 'left', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Table shell ───────────────────────────────────────────────────────────────
function TableCard({ title, count, badge, actions, children }: {
  title?: string; count?: number; badge?: string
  actions?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={CARD}>
      {(title || actions) && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {title && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>}
            {count !== undefined && (
              <span style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{count}</span>
            )}
            {badge && (
              <span style={{ background: A.primary + '15', color: A.primary, borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{badge}</span>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
    </div>
  )
}

// ── Mono table cell ───────────────────────────────────────────────────────────
function MonoCell({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: color || A.primary }}>
      {children}
    </td>
  )
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonTable({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>{Array.from({ length: rows }, (_, i) => (
      <tr key={i}>
        {Array.from({ length: cols }, (_, j) => (
          <td key={j} style={TD}>
            <div style={{ height: 14, borderRadius: 4, background: 'var(--surface-3)', width: j === 1 ? '60%' : '80%' }}/>
          </td>
        ))}
      </tr>
    ))}</>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <FileText size={22} color="var(--text-4)"/>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>{message}</div>
    </div>
  )
}

// ── No-data placeholder ───────────────────────────────────────────────────────
function NoData({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ ...CARD, padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-4)' }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{sub}</div>
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ ...CARD, padding: '10px 14px', fontSize: 12, borderRadius: 10 }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {fmt(p.value)}</div>
      ))}
    </div>
  )
}

// ── Search input helper ───────────────────────────────────────────────────────
function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 0, maxWidth: 220 }}>
      <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}/>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Search…" className="erp-input"
        style={{ paddingLeft: 28, paddingRight: 8, height: 30, width: '100%', fontSize: 12 }}
      />
    </div>
  )
}

// ── Row hover handler builders ────────────────────────────────────────────────
function rowHoverProps(i: number) {
  const base = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
  return {
    style: { background: base } as React.CSSProperties,
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => { (e.currentTarget).style.background = A.primary + '08' },
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => { (e.currentTarget).style.background = base },
  }
}

// ── Mobile card list — shown instead of wide tables on small screens ──────────
// Each report provides its own row→card mapping; this just handles the shell.
function MobileCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
    </div>
  )
}
function MobileRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SALES REPORT
// ════════════════════════════════════════════════════════════════════════════
function SalesReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [rows,     setRows    ] = useState<any[]>([])
  const [loading,  setLoading ] = useState(false)
  const [search,   setSearch  ] = useState('')
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.sales({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() =>
    rows.filter(r => !search || [r.invoice_no, r.party_name, r.payment_mode, r.status]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const kpi = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.net_total || r.total || 0), 0)
    const paid  = filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0)
    const due   = filtered.reduce((s, r) => s + Number(r.due_amount  || 0), 0)
    return { total, paid, due, avg: filtered.length ? total / filtered.length : 0, count: filtered.length, paidPct: total ? Math.round(paid/total*100) : 0 }
  }, [filtered])

  const trendData = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { const m = (r.date_ad||'').slice(0,7); if (m) map[m] = (map[m]||0) + Number(r.net_total||0) })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
      .map(([k, v]) => ({ month: k.slice(5) + '/' + k.slice(2,4), amount: v }))
  }, [rows])

  const topCustomers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { const n = r.party_name || 'Walk-in'; map[n] = (map[n]||0) + Number(r.net_total||0) })
    const maxVal = Math.max(...Object.values(map), 1)
    return Object.entries(map).sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([name, total]) => ({ name, total, pct: Math.round(total/maxVal*100) }))
  }, [rows])

  const pieData  = useMemo(() => [{ name: 'Paid', value: kpi.paid }, { name: 'Due', value: kpi.due }].filter(d => d.value > 0), [kpi])
  const hasData  = rows.length > 0

  return (
    <>
      <FilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />

      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
          <KpiCard label="Total Invoices"  value={String(kpi.count)}   sub="in selected period"          icon={<FileText    size={18}/>} color={A.primary} />
          <KpiCard label="Total Revenue"   value={fmt(kpi.total)}      sub={`avg ${fmt(kpi.avg)} / inv`} icon={<TrendingUp  size={18}/>} color={A.success} />
          <KpiCard label="Total Paid"      value={fmt(kpi.paid)}       sub={`${kpi.paidPct}% collected`} icon={<CheckCircle size={18}/>} color={A.success} trend={kpi.paidPct - 100} />
          <KpiCard label="Outstanding Due" value={fmt(kpi.due)}        sub={kpi.due > 0 ? 'Needs follow-up' : 'All cleared'} icon={<AlertCircle size={18}/>} color={kpi.due > 0 ? A.warning : A.success} />
        </div>
      )}

      {hasData && trendData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_260px] gap-4" style={{ marginBottom: 20 }}>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>Sales Trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-4)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-4)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v).replace(/\.00$/,'')}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line type="monotone" dataKey="amount" name="Sales" stroke={A.primary} strokeWidth={2.5} dot={{ r: 3, fill: A.primary }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>Collection Status</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={[A.success, A.warning][i % 2]}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>Top Customers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCustomers.map((c, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{fmt(c.total)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-3)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: A.primary, width: `${c.pct}%`, transition: 'width 0.5s' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <TableCard title="Sales Transactions" count={filtered.length} badge={fmt(kpi.total)}
          actions={<><SearchInput value={search} onChange={setSearch}/><ExportMenu onCSV={() => downloadCSV(filtered, 'sales-report')} onPrint={() => window.print()}/></>}
        >
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Invoice No','Date','Party','Total','Paid','Due','Mode','Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: ['Total','Paid','Due'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {loading ? <SkeletonTable cols={8}/> : filtered.length === 0
                  ? <tr><td colSpan={8}><EmptyState message="No records. Adjust the date range and generate."/></td></tr>
                  : filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.invoice_no}</MonoCell>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || 'Walk-in'}</td>
                      <td style={TDR}>{fmt(r.net_total || r.total)}</td>
                      <td style={{ ...TDR, color: A.success }}>{fmt(r.paid_amount || 0)}</td>
                      <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? A.warning : 'var(--text-4)' }}>{fmt(r.due_amount || 0)}</td>
                      <td style={TD}><StatusBadge value={r.payment_mode}/></td>
                      <td style={TD}><StatusBadge value={r.status}/></td>
                    </tr>
                  ))
                }
              </tbody>
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                    <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>TOTAL</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.primary }}>{fmt(kpi.total)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.success }}>{fmt(kpi.paid)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.warning }}>{fmt(kpi.due)}</td>
                    <td colSpan={2} style={TD}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Mobile card list */}
          <div className="block sm:hidden">
            {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
              : filtered.length === 0 ? <EmptyState message="No records."/>
              : filtered.map((r: any, i: number) => (
                <MobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.primary }}>{r.invoice_no}</span>
                    <StatusBadge value={r.status}/>
                  </div>
                  <MobileRow label="Party"   value={r.party_name || 'Walk-in'}/>
                  <MobileRow label="Date"    value={fmtDate(r.date_ad)}/>
                  <MobileRow label="Total"   value={fmt(r.net_total || r.total)} color={A.primary}/>
                  <MobileRow label="Paid"    value={fmt(r.paid_amount || 0)} color={A.success}/>
                  {Number(r.due_amount) > 0 && <MobileRow label="Due" value={fmt(r.due_amount)} color={A.warning}/>}
                  <MobileRow label="Mode"    value={<StatusBadge value={r.payment_mode}/>}/>
                </MobileCard>
              ))
            }
          </div>
        </TableCard>
      )}

      {!hasData && !loading && <NoData icon={<BarChart2 size={40}/>} title="No data yet" sub="Select a date range and click Generate to view your sales report."/>}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE REPORT
// ════════════════════════════════════════════════════════════════════════════
function PurchaseReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [rows,     setRows    ] = useState<any[]>([])
  const [loading,  setLoading ] = useState(false)
  const [search,   setSearch  ] = useState('')
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.purchases({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered  = useMemo(() => rows.filter(r => !search || [r.bill_no, r.party_name, r.status].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const total     = useMemo(() => filtered.reduce((s, r) => s + Number(r.net_total  || 0), 0), [filtered])
  const totalDue  = useMemo(() => filtered.reduce((s, r) => s + Number(r.due_amount || 0), 0), [filtered])

  return (
    <>
      <FilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />
      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Bills"    value={String(filtered.length)}                             icon={<Package      size={18}/>} color={A.purple} />
            <KpiCard label="Total Spent"    value={fmt(total)}                                          icon={<TrendingDown size={18}/>} color={A.danger} />
            <KpiCard label="Outstanding"    value={fmt(totalDue)}                                       icon={<AlertCircle  size={18}/>} color={A.warning}/>
            <KpiCard label="Avg Bill Value" value={fmt(filtered.length ? total/filtered.length : 0)}    icon={<BarChart2    size={18}/>} color={A.cyan}   />
          </div>
          <TableCard title="Purchase Bills" count={filtered.length} badge={fmt(total)}
            actions={<><SearchInput value={search} onChange={setSearch}/><ExportMenu onCSV={() => downloadCSV(filtered, 'purchase-report')} onPrint={() => window.print()}/></>}
          >
            <div className="hidden sm:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Bill No','Date','Supplier','Total','Due','Status'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Total','Due'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonTable cols={6}/> : filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.bill_no}</MonoCell>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || '—'}</td>
                      <td style={TDR}>{fmt(r.net_total)}</td>
                      <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? A.warning : 'var(--text-4)' }}>{fmt(r.due_amount || 0)}</td>
                      <td style={TD}><StatusBadge value={r.status}/></td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL</td>
                      <td style={{ ...TDR, fontWeight: 700, color: A.primary }}>{fmt(total)}</td>
                      <td style={{ ...TDR, fontWeight: 700, color: A.warning }}>{fmt(totalDue)}</td>
                      <td style={TD}/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="block sm:hidden">
              {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
                : filtered.map((r: any, i: number) => (
                  <MobileCard key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.purple }}>{r.bill_no}</span>
                      <StatusBadge value={r.status}/>
                    </div>
                    <MobileRow label="Supplier" value={r.party_name || '—'}/>
                    <MobileRow label="Date"     value={fmtDate(r.date_ad)}/>
                    <MobileRow label="Total"    value={fmt(r.net_total)} color={A.primary}/>
                    {Number(r.due_amount) > 0 && <MobileRow label="Due" value={fmt(r.due_amount)} color={A.warning}/>}
                  </MobileCard>
                ))
              }
            </div>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && <NoData icon={<Package size={40}/>} title="No purchases loaded" sub="Select a date range and click Generate."/>}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// P&L REPORT
// ════════════════════════════════════════════════════════════════════════════
function PnLReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [report,   setReport  ] = useState<any>(null)
  const [loading,  setLoading ] = useState(false)
  const { error } = useUIStore()

  async function generate() {
    setLoading(true); setReport(null)
    try {
      const r   = await reportsAPI.profitLoss({ date_from: dateFrom, date_to: dateTo })
      const raw = r.data?.data ?? {}
      setReport({
        incomeRows:   raw.income?.rows  ?? [],
        expenseRows:  raw.expense?.rows ?? [],
        totalIncome:  Number(raw.income?.total)  || 0,
        totalExpense: Number(raw.expense?.total) || 0,
        netProfit:    Number(raw.net_profit)     || 0,
        netPct:       raw.net_profit_pct != null ? Number(raw.net_profit_pct) : null,
        date_from:    raw.date_from || dateFrom,
        date_to:      raw.date_to   || dateTo,
      })
    } catch (e: any) { error('Failed to load P&L', e.message) }
    finally { setLoading(false) }
  }

  const isProfit   = (report?.netProfit ?? 0) >= 0
  const netColor   = isProfit ? A.success : A.danger
  const chartData  = report ? [{ name: 'Income', value: report.totalIncome }, { name: 'Expense', value: report.totalExpense }] : []

  return (
    <>
      <FilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setReport(null) }}
      />

      {!report && !loading && <NoData icon={<BarChart2 size={40}/>} title="Profit & Loss Statement" sub="Select a period and click Generate to view your P&L."/>}

      {report && (
        <>
          {/* Net profit banner */}
          <div style={{ ...CARD, padding: '20px 20px', marginBottom: 20, background: `linear-gradient(135deg, ${netColor}10 0%, ${netColor}05 100%)`, border: `1.5px solid ${netColor}30` }}>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: netColor, marginBottom: 4 }}>
                  NET {isProfit ? 'PROFIT' : 'LOSS'}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: netColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>
                  {isProfit ? '+' : ''}{fmt(report.netProfit)}
                </div>
                {report.netPct != null && (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                    Net margin: <b style={{ color: netColor }}>{report.netPct}%</b>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[{ label: 'Total Revenue', val: report.totalIncome, color: A.success }, { label: 'Total Expenses', val: report.totalExpense, color: A.danger }].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{fmt(s.val)}</div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block" style={{ marginLeft: 'auto' }}>
                <ResponsiveContainer width={140} height={90}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={3} dataKey="value">
                      {chartData.map((_, i) => <Cell key={i} fill={[A.success, A.danger][i]}/>)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <button onClick={() => downloadCSV([
                ...report.incomeRows.map((r: any)  => ({ section: 'Income',  code: r.code, name: r.name, amount: r.amount })),
                ...report.expenseRows.map((r: any) => ({ section: 'Expense', code: r.code, name: r.name, amount: r.amount })),
                { section: 'NET', code: '', name: 'Net Profit / Loss', amount: report.netProfit },
              ], `pnl-${report.date_from}-${report.date_to}`)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Download size={13}/> Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              { title: 'Income',   rows: report.incomeRows,  total: report.totalIncome,  color: A.success, Icon: TrendingUp,   emptyMsg: 'No income accounts in this period',   totalLabel: 'TOTAL INCOME' },
              { title: 'Expenses', rows: report.expenseRows, total: report.totalExpense, color: A.danger,  Icon: TrendingDown, emptyMsg: 'No expense accounts in this period',  totalLabel: 'TOTAL EXPENSES' },
            ].map(sec => (
              <TableCard key={sec.title} title={sec.title} badge={fmt(sec.total)} actions={<sec.Icon size={16} color={sec.color}/>}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['Code','Account','Amount'].map((h, i) => <th key={h} style={{ ...TH, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {sec.rows.length === 0
                      ? <tr><td colSpan={3}><EmptyState message={sec.emptyMsg}/></td></tr>
                      : sec.rows.map((row: any, i: number) => (
                        <tr key={i} style={{ background: row.is_group ? 'var(--surface-2)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)' }}>{row.code || '—'}</td>
                          <td style={{ ...TD, fontWeight: row.is_group ? 700 : 400, paddingLeft: (Number(row.depth)||0)*14 + 14 }}>{row.name}</td>
                          <td style={{ ...TDR, color: sec.color }}>{Number(row.amount) !== 0 ? fmt(Math.abs(Number(row.amount))) : '—'}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{sec.totalLabel}</td>
                      <td style={{ ...TDR, fontWeight: 700, color: sec.color }}>{fmt(sec.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableCard>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// STOCK REPORT
// ════════════════════════════════════════════════════════════════════════════
function StockReport() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch ] = useState('')
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.stock()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered   = useMemo(() => rows.filter(r => !search || [r.item_code, r.name].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const totalValue = useMemo(() => filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0), [filtered])
  const lowStock   = useMemo(() => filtered.filter(r => r.low_stock).length, [filtered])

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <RefreshCw size={13} className="animate-spin"/> : <Search size={13}/>} Load Report
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Products"   value={String(filtered.length)} icon={<Package     size={18}/>} color={A.cyan}   />
            <KpiCard label="Total Stock Value" value={fmt(totalValue)}         icon={<TrendingUp  size={18}/>} color={A.primary}/>
            <KpiCard label="Low Stock Items"   value={String(lowStock)}        icon={<AlertCircle size={18}/>} color={lowStock > 0 ? A.warning : A.success}/>
          </div>
          <TableCard title="Stock Valuation" count={filtered.length} badge={fmt(totalValue)}
            actions={<><SearchInput value={search} onChange={setSearch}/><ExportMenu onCSV={() => downloadCSV(filtered, 'stock-report')} onPrint={() => window.print()}/></>}
          >
            <div className="hidden sm:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Code','Product','Unit','Stock','P.Rate','Value','Status'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Stock','P.Rate','Value'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.item_code}</MonoCell>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.name}</td>
                      <td style={TD}><span style={{ background: 'var(--surface-3)', color: 'var(--text-2)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{r.unit}</span></td>
                      <td style={{ ...TDR, color: r.low_stock ? A.danger : 'var(--text)', fontWeight: 700 }}>{r.current_stock}</td>
                      <td style={TDR}>{fmt(r.purchase_rate)}</td>
                      <td style={{ ...TDR, fontWeight: 700 }}>{fmt(r.stock_value)}</td>
                      <td style={TD}><StatusBadge value={r.low_stock ? 'pending' : 'active'}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="block sm:hidden">
              {filtered.map((r: any, i: number) => (
                <MobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.cyan }}>{r.item_code}</span>
                    <StatusBadge value={r.low_stock ? 'pending' : 'active'}/>
                  </div>
                  <MobileRow label="Product" value={r.name}/>
                  <MobileRow label="Stock"   value={`${r.current_stock} ${r.unit}`} color={r.low_stock ? A.danger : A.success}/>
                  <MobileRow label="Rate"    value={fmt(r.purchase_rate)}/>
                  <MobileRow label="Value"   value={fmt(r.stock_value)} color={A.primary}/>
                </MobileCard>
              ))}
            </div>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && <NoData icon={<Package size={40}/>} title="Stock valuation report" sub="Click Load Report to view current stock values."/>}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// EXPIRY REPORT
// ════════════════════════════════════════════════════════════════════════════
function ExpiryReport() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.expiry()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const expired = rows.filter(r => r.expiry_date && new Date(r.expiry_date) < new Date())
  const nearExp = rows.filter(r => { if (!r.expiry_date) return false; const d = Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000); return d >= 0 && d < 30 })

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <RefreshCw size={13} className="animate-spin"/> : <AlertCircle size={13}/>} Load Expiry Report
        </button>
        {rows.length > 0 && (
          <button onClick={() => downloadCSV(rows, 'expiry-report')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Download size={13}/> Export CSV
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Batches" value={String(rows.length)}    icon={<Package     size={18}/>} color={A.primary}/>
            <KpiCard label="Expired"       value={String(expired.length)} icon={<XCircle     size={18}/>} color={A.danger} />
            <KpiCard label="Expiring Soon" value={String(nearExp.length)} icon={<AlertCircle size={18}/>} color={A.warning}/>
          </div>
          <TableCard title="Expiry Details" count={rows.length}>
            <div className="hidden sm:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Product','Batch','Qty','Expiry','Days Left'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Qty','Days Left'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r: any, i: number) => {
                    const days = r.expiry_date ? Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000) : null
                    const rowBg = days !== null && days < 0 ? 'rgba(220,38,38,0.07)' : days !== null && days < 30 ? 'rgba(245,158,11,0.07)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                    return (
                      <tr key={i} style={{ background: rowBg }}>
                        <td style={{ ...TD, fontWeight: 500 }}>{r.product_name}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.batch_no || '—'}</td>
                        <td style={TDR}>{r.qty_available}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', color: days !== null && days < 30 ? A.danger : 'var(--text)' }}>{r.expiry || '—'}</td>
                        <td style={{ ...TDR, fontWeight: 700, color: days === null ? 'var(--text-4)' : days < 0 ? A.danger : days < 30 ? A.warning : A.success }}>
                          {days !== null ? `${days}d` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="block sm:hidden">
              {rows.map((r: any, i: number) => {
                const days = r.expiry_date ? Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000) : null
                const dColor = days === null ? 'var(--text-4)' : days < 0 ? A.danger : days < 30 ? A.warning : A.success
                return (
                  <MobileCard key={i}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name}</span>
                    {r.batch_no && <MobileRow label="Batch"   value={r.batch_no}/>}
                    <MobileRow label="Qty"     value={String(r.qty_available)}/>
                    <MobileRow label="Expiry"  value={r.expiry || '—'} color={days !== null && days < 30 ? A.danger : undefined}/>
                    <MobileRow label="Days Left" value={days !== null ? `${days}d` : '—'} color={dColor}/>
                  </MobileCard>
                )
              })}
            </div>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && <NoData icon={<AlertCircle size={40}/>} title="Expiry tracking" sub="Click Load Expiry Report to check batch expiry status."/>}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PARTY BALANCE REPORT
// ════════════════════════════════════════════════════════════════════════════
function PartyBalanceReport() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [type,    setType   ] = useState('customer')
  const [search,  setSearch ] = useState('')
  const { error } = useUIStore()

  const load = useCallback(async (t: string) => {
    setLoading(true)
    try {
      const r    = await reportsAPI.partyBalance({ type: t })
      const body = r.data?.data ?? r.data ?? {}
      const arr  = Array.isArray(body) ? body : (body?.data ?? [])
      setRows(arr)
      setSummary({ total_balance: body?.total_balance ?? 0, total_due: body?.total_due ?? 0, count: body?.total ?? arr.length })
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(type) }, [type])

  const filtered      = useMemo(() => rows.filter(r => !search || [r.name, r.code, r.phone].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const totalBalance  = summary?.total_balance ?? filtered.reduce((s, r) => s + Number(r.balance || 0), 0)
  const totalDue      = summary?.total_due     ?? filtered.reduce((s, r) => s + Number(r.total_due || 0), 0)
  const totalInvoiced = filtered.reduce((s, r) => s + Number(r.total_invoiced || 0), 0)

  return (
    <>
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 20 }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3, gap: 2 }}>
            {[{ v: 'customer', l: 'Customers' }, { v: 'supplier', l: 'Suppliers' }].map(opt => (
              <button key={opt.v} onClick={() => setType(opt.v)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: type === opt.v ? 'var(--surface)' : 'transparent',
                color: type === opt.v ? A.primary : 'var(--text-2)',
                boxShadow: type === opt.v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s', fontFamily: 'var(--font)',
              }}>{opt.l}</button>
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch}/>
          <button onClick={() => load(type)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13}/> Refresh
          </button>
          {rows.length > 0 && (
            <button onClick={() => downloadCSV(filtered, `party-balance-${type}`)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Download size={13}/> Export
            </button>
          )}
          {summary && (
            <div style={{ ...CARD, padding: '6px 14px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{type === 'customer' ? 'TOTAL RECEIVABLE' : 'TOTAL PAYABLE'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: Number(totalBalance) > 0 ? A.warning : A.success, fontFamily: 'monospace' }}>
                {fmt(totalBalance)}
              </span>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
          <KpiCard label={`Total ${type === 'customer' ? 'Customers' : 'Suppliers'}`} value={String(filtered.length)} icon={<Users       size={18}/>} color={A.primary}/>
          <KpiCard label="Total Invoiced"  value={fmt(totalInvoiced)} icon={<FileText    size={18}/>} color={A.purple} />
          <KpiCard label="Outstanding Due" value={fmt(totalDue)}      icon={<AlertCircle size={18}/>} color={A.warning}/>
          <KpiCard label="Net Balance"     value={fmt(totalBalance)}  icon={<TrendingUp  size={18}/>} color={Number(totalBalance) > 0 ? A.warning : A.success}/>
        </div>
      )}

      <TableCard title={`${type === 'customer' ? 'Customer' : 'Supplier'} Balances`} count={filtered.length}>
        {/* Desktop table */}
        <div className="hidden sm:block">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Code','Name','Phone','PAN','Total Invoiced','Paid','Due','Balance'].map(h => (
                <th key={h} style={{ ...TH, textAlign: ['Total Invoiced','Paid','Due','Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? <SkeletonTable cols={8}/> : filtered.length === 0
                ? <tr><td colSpan={8}><EmptyState message={`No ${type}s found`}/></td></tr>
                : filtered.map((r: any, i: number) => (
                  <tr key={i} {...rowHoverProps(i)}>
                    <MonoCell color={A.primary}>{r.code || '—'}</MonoCell>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.name}</td>
                    <td style={{ ...TD, color: 'var(--text-2)' }}>{r.phone || '—'}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)' }}>{r.pan_no || '—'}</td>
                    <td style={TDR}>{fmt(r.total_invoiced || 0)}</td>
                    <td style={{ ...TDR, color: A.success }}>{fmt(r.total_paid || 0)}</td>
                    <td style={{ ...TDR, color: Number(r.total_due) > 0 ? A.danger : 'var(--text-4)' }}>{fmt(r.total_due || 0)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: Number(r.balance ?? r.current_balance ?? 0) > 0 ? A.warning : A.success }}>
                      {fmt(r.balance ?? r.current_balance ?? 0)}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <td colSpan={4} style={{ ...TD, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>TOTALS</td>
                <td style={{ ...TDR, fontWeight: 700 }}>{fmt(totalInvoiced)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: A.success }}>{fmt(filtered.reduce((s, r) => s + Number(r.total_paid||0), 0))}</td>
                <td style={{ ...TDR, fontWeight: 700, color: A.danger }}>{fmt(totalDue)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: Number(totalBalance) > 0 ? A.warning : A.success }}>{fmt(totalBalance)}</td>
              </tr>
            </tfoot>
          )}
          </table>
        </div>
        {/* Mobile card list */}
        <div className="block sm:hidden">
          {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
            : filtered.length === 0 ? <EmptyState message={`No ${type}s found`}/>
            : filtered.map((r: any, i: number) => {
              const balance = r.balance ?? r.current_balance ?? 0
              return (
                <MobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: Number(balance) > 0 ? A.warning : A.success }}>{fmt(balance)}</span>
                  </div>
                  {r.phone && <MobileRow label="Phone"    value={r.phone}/>}
                  <MobileRow label="Invoiced" value={fmt(r.total_invoiced || 0)} color={A.primary}/>
                  <MobileRow label="Paid"     value={fmt(r.total_paid || 0)} color={A.success}/>
                  {Number(r.total_due) > 0 && <MobileRow label="Due" value={fmt(r.total_due)} color={A.danger}/>}
                </MobileCard>
              )
            })
          }
        </div>
      </TableCard>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE SHELL
// ════════════════════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const [tab, setTab] = useState('sales')

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Page header + tabs — full bleed via negative margin matching page-content padding */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        marginLeft: 'calc(-1 * var(--page-px, 28px))',
        marginRight: 'calc(-1 * var(--page-px, 28px))',
        paddingLeft: 'var(--page-px, 28px)',
        paddingRight: 'var(--page-px, 28px)',
        paddingTop: 20, marginBottom: 24,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-4)', marginBottom: 3 }}>Analytics</div>
            <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Reports</h1>
          </div>
          <div style={{ background: A.primary + '12', border: `1px solid ${A.primary}30`, borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <BarChart2 size={14} color={A.primary}/>
            <span style={{ fontSize: 11, fontWeight: 600, color: A.primary }}>Live Data</span>
          </div>
        </div>

        {/* Tab strip — scrolls horizontally on mobile, no wrap */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {REPORT_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'transparent', whiteSpace: 'nowrap',
              color: tab === t.id ? A.primary : 'var(--text-2)',
              borderBottom: `2.5px solid ${tab === t.id ? A.primary : 'transparent'}`,
              marginBottom: -1, transition: 'color 0.15s', fontFamily: 'var(--font)',
              flexShrink: 0,
            }}>
              <span style={{ color: tab === t.id ? A.primary : 'var(--text-4)', display: 'flex' }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === 'sales'     && <SalesReport />}
      {tab === 'purchases' && <PurchaseReport />}
      {tab === 'pnl'       && <PnLReport />}
      {tab === 'stock'     && <StockReport />}
      {tab === 'expiry'    && <ExpiryReport />}
      {tab === 'party_bal' && <PartyBalanceReport />}
    </div>
  )
}
