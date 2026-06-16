import { useState, useEffect, useCallback, useMemo, memo } from 'react'
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
  ArrowUpRight, ArrowDownRight, Filter, X,
  CheckCircle, Clock, XCircle, MinusCircle,
} from 'lucide-react'

// ─── Color system ───────────────────────────────────────────────────────────
const C = {
  primary:   '#2563EB',
  success:   '#16A34A',
  warning:   '#F59E0B',
  danger:    '#DC2626',
  purple:    '#7C3AED',
  cyan:      '#0891B2',
  bg:        '#F8FAFC',
  border:    '#E2E8F0',
  text:      '#0F172A',
  text2:     '#475569',
  text3:     '#94A3B8',
  surface:   '#FFFFFF',
  surface2:  '#F1F5F9',
}

// ─── Shared style helpers ────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
}

const REPORT_TABS = [
  { id: 'sales',      label: 'Sales',          icon: <FileText   size={14}/> },
  { id: 'purchases',  label: 'Purchases',      icon: <Package    size={14}/> },
  { id: 'pnl',        label: 'Profit & Loss',  icon: <BarChart2  size={14}/> },
  { id: 'stock',      label: 'Stock',          icon: <PieIcon    size={14}/> },
  { id: 'expiry',     label: 'Expiry',         icon: <AlertCircle size={14}/> },
  { id: 'party_bal',  label: 'Party Balances', icon: <Users      size={14}/> },
]

// ─── Quick range helpers ─────────────────────────────────────────────────────
function getRange(key: string): [string, string] {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'today':    return [fmt(now), fmt(now)]
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay())
      return [fmt(d), fmt(now)]
    }
    case 'month':    return [fmt(new Date(y, m, 1)), fmt(now)]
    case 'quarter': {
      const q = Math.floor(m / 3)
      return [fmt(new Date(y, q * 3, 1)), fmt(now)]
    }
    case 'year':     return [fmt(new Date(y, 0, 1)), fmt(now)]
    default:         return [fmt(new Date(y, 0, 1)), fmt(now)]
  }
}

// ─── Badge components ────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
  active:    { bg: '#DCFCE7', color: '#15803D', icon: <CheckCircle size={10}/>,  label: 'Active' },
  paid:      { bg: '#DCFCE7', color: '#15803D', icon: <CheckCircle size={10}/>,  label: 'Paid' },
  pending:   { bg: '#FEF9C3', color: '#A16207', icon: <Clock size={10}/>,        label: 'Pending' },
  draft:     { bg: '#F1F5F9', color: '#475569', icon: <MinusCircle size={10}/>,  label: 'Draft' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C', icon: <XCircle size={10}/>,     label: 'Cancelled' },
  credit:    { bg: '#FEF3C7', color: '#B45309', icon: null, label: 'Credit' },
  cash:      { bg: '#DCFCE7', color: '#15803D', icon: null, label: 'Cash' },
  bank:      { bg: '#DBEAFE', color: '#1D4ED8', icon: null, label: 'Bank' },
  card:      { bg: '#EDE9FE', color: '#6D28D9', icon: null, label: 'Card' },
  online:    { bg: '#CFFAFE', color: '#0E7490', icon: null, label: 'Online' },
}

function StatusBadge({ value }: { value: string }) {
  const key = (value || '').toLowerCase()
  const cfg = STATUS_CONFIG[key] || { bg: C.surface2, color: C.text2, icon: null, label: value }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, color: cfg.color,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {cfg.icon}{cfg.label || value}
    </span>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, trend }: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; color: string; trend?: number
}) {
  return (
    <div style={{
      ...card,
      padding: 20,
      transition: 'transform 0.15s, box-shadow 0.15s',
      cursor: 'default',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = ''
        ;(e.currentTarget as HTMLElement).style.boxShadow = card.boxShadow as string
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: trend >= 0 ? C.success : C.danger }}>
            {trend >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 13, color: C.text2, marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
const QUICK_RANGES = [
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This Week' },
  { key: 'month',   label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year',    label: 'This Year' },
]

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
    <div style={{ ...card, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {/* Quick range pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK_RANGES.map(r => (
            <button key={r.key} onClick={() => applyRange(r.key)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${active === r.key ? C.primary : C.border}`,
              background: active === r.key ? C.primary + '10' : 'transparent',
              color: active === r.key ? C.primary : C.text2,
              transition: 'all 0.15s',
            }}>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: C.border, margin: '0 4px' }} />

        {/* Date inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} color={C.text3} />
          <input type="date" value={dateFrom}
            onChange={e => { setActive('custom'); onDateChange('from', e.target.value) }}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 13, color: C.text, outline: 'none', background: C.surface }}
          />
          <span style={{ color: C.text3, fontSize: 12 }}>—</span>
          <input type="date" value={dateTo}
            onChange={e => { setActive('custom'); onDateChange('to', e.target.value) }}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 13, color: C.text, outline: 'none', background: C.surface }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button onClick={onReset} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
          }}>
            <X size={13}/> Reset
          </button>
          <button onClick={onGenerate} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none', background: loading ? C.border : C.primary, color: loading ? C.text3 : '#fff',
            transition: 'background 0.15s',
          }}>
            {loading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }}/> : <Search size={13}/>}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Export dropdown ─────────────────────────────────────────────────────────
function ExportMenu({ onCSV, onPrint }: { onCSV: () => void; onPrint: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
      }}>
        <Download size={13}/> Export <ChevronDown size={12}/>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}/>
          <div style={{
            position: 'absolute', right: 0, top: 36, zIndex: 20,
            ...card, padding: 6, minWidth: 140,
          }}>
            {[
              { label: 'Export CSV', icon: <Download size={13}/>, fn: () => { onCSV(); setOpen(false) } },
              { label: 'Print',      icon: <Printer size={13}/>,  fn: () => { onPrint(); setOpen(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.fn} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 10px', border: 'none', background: 'transparent',
                cursor: 'pointer', borderRadius: 6, fontSize: 13, color: C.text,
                textAlign: 'left',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
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

// ─── Table shell ─────────────────────────────────────────────────────────────
function TableCard({ title, count, badge, actions, children }: {
  title?: string; count?: number; badge?: string
  actions?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={card}>
      {(title || actions) && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          {title && <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</div>}
          {count !== undefined && (
            <span style={{ background: C.surface2, color: C.text2, borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
              {count}
            </span>
          )}
          {badge && <span style={{ background: C.primary + '15', color: C.primary, borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{badge}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{actions}</div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Reusable styled table ────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '10px 14px', background: C.surface2,
  borderBottom: `1px solid ${C.border}`,
  fontSize: 11, fontWeight: 700, color: C.text2,
  textTransform: 'uppercase', letterSpacing: '0.6px',
  textAlign: 'left', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  padding: '11px 14px', borderBottom: `1px solid ${C.border}`,
  fontSize: 13, color: C.text, verticalAlign: 'middle',
}
const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }

function MonoCell({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: color || C.primary }}>
      {children}
    </td>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonTable({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>{Array.from({ length: rows }, (_, i) => (
      <tr key={i}>
        {Array.from({ length: cols }, (_, j) => (
          <td key={j} style={TD}>
            <div style={{ height: 14, borderRadius: 4, background: `linear-gradient(90deg, ${C.surface2} 25%, #E8EEF4 50%, ${C.surface2} 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', width: j === 1 ? '60%' : '80%' }}/>
          </td>
        ))}
      </tr>
    ))}</>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <FileText size={22} color={C.text3}/>
      </div>
      <div style={{ fontSize: 14, color: C.text2, fontWeight: 500 }}>{message}</div>
    </div>
  )
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ ...card, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {fmt(p.value)}</div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SALES REPORT
// ════════════════════════════════════════════════════════════════════════════
function SalesReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo]   = useState(getRange('year')[1])
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(false)
  const [search,   setSearch]   = useState('')
  const { error }               = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r = await reportsAPI.sales({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() =>
    rows.filter(r =>
      !search || [r.invoice_no, r.party_name, r.payment_mode, r.status]
        .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const kpi = useMemo(() => {
    const total    = filtered.reduce((s, r) => s + Number(r.net_total || r.total || 0), 0)
    const paid     = filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0)
    const due      = filtered.reduce((s, r) => s + Number(r.due_amount  || 0), 0)
    const avg      = filtered.length ? total / filtered.length : 0
    return { total, paid, due, avg, count: filtered.length, paidPct: total ? Math.round(paid/total*100) : 0 }
  }, [filtered])

  // Build monthly trend from rows
  const trendData = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const month = (r.date_ad || '').slice(0, 7)
      if (month) map[month] = (map[month] || 0) + Number(r.net_total || 0)
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
      .map(([k, v]) => ({ month: k.slice(5) + '/' + k.slice(2,4), amount: v }))
  }, [rows])

  // Top customers
  const topCustomers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => {
      const name = r.party_name || 'Walk-in'
      map[name] = (map[name] || 0) + Number(r.net_total || 0)
    })
    const maxVal = Math.max(...Object.values(map), 1)
    return Object.entries(map)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 5)
      .map(([name, total]) => ({ name, total, pct: Math.round(total/maxVal*100) }))
  }, [rows])

  // Payment mode pie
  const pieData = useMemo(() => {
    if (!kpi.total) return [{ name: 'No Data', value: 1 }]
    return [
      { name: 'Paid',    value: kpi.paid },
      { name: 'Due',     value: kpi.due  },
    ].filter(d => d.value > 0)
  }, [kpi])
  const PIE_COLORS = [C.success, C.warning]

  const hasData = rows.length > 0

  return (
    <>
      <FilterBar
        dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k,v) => k==='from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />

      {/* KPI Cards */}
      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          <KpiCard label="Total Invoices"      value={String(kpi.count)}    sub={`in selected period`}       icon={<FileText size={18}/>}      color={C.primary} />
          <KpiCard label="Total Revenue"       value={fmt(kpi.total)}       sub={`avg ${fmt(kpi.avg)} / invoice`} icon={<TrendingUp size={18}/>}  color={C.success} />
          <KpiCard label="Total Paid"          value={fmt(kpi.paid)}        sub={`${kpi.paidPct}% collection rate`} icon={<CheckCircle size={18}/>} color={C.success} trend={kpi.paidPct - 100} />
          <KpiCard label="Outstanding Due"     value={fmt(kpi.due)}         sub={kpi.due > 0 ? 'Requires follow-up' : 'All cleared'} icon={<AlertCircle size={18}/>} color={kpi.due > 0 ? C.warning : C.success} />
        </div>
      )}

      {/* Charts row */}
      {hasData && trendData.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 260px', gap: 16, marginBottom: 20 }}>
          {/* Trend */}
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 16 }}>Sales Trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v).replace(/\.00$/, '')}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line type="monotone" dataKey="amount" name="Sales" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3, fill: C.primary }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pie */}
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 8 }}>Collection Status</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top customers */}
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Top Customers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCustomers.map((c, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: C.text2, fontWeight: 600 }}>{fmt(c.total)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: C.surface2 }}>
                    <div style={{ height: '100%', borderRadius: 2, background: C.primary, width: `${c.pct}%`, transition: 'width 0.5s' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {hasData && (
        <TableCard
          title="Sales Transactions"
          count={filtered.length}
          badge={fmt(kpi.total)}
          actions={
            <>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.text3 }}/>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search..." style={{ paddingLeft: 28, paddingRight: 8, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, outline: 'none', width: 180, color: C.text }}
                />
              </div>
              <ExportMenu onCSV={() => downloadCSV(filtered, 'sales-report')} onPrint={() => window.print()}/>
            </>
          }
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Invoice No','Date','Party','Total','Paid','Due','Mode','Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: h === 'Total' || h === 'Paid' || h === 'Due' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonTable cols={8}/> : filtered.length === 0 ? (
                <tr><td colSpan={8}><EmptyState message="No records. Adjust the date range and generate."/></td></tr>
              ) : filtered.map((r: any, i: number) => (
                <tr key={i} style={{ background: i % 2 === 0 ? C.surface : C.surface2 + '60' }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.primary + '08')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? C.surface : C.surface2 + '60')}
                >
                  <MonoCell>{r.invoice_no}</MonoCell>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                  <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || 'Walk-in'}</td>
                  <td style={TDR}>{fmt(r.net_total || r.total)}</td>
                  <td style={{ ...TDR, color: C.success }}>{fmt(r.paid_amount || 0)}</td>
                  <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? C.warning : C.text3 }}>{fmt(r.due_amount || 0)}</td>
                  <td style={TD}><StatusBadge value={r.payment_mode}/></td>
                  <td style={TD}><StatusBadge value={r.status}/></td>
                </tr>
              ))}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: C.surface2, fontWeight: 700 }}>
                  <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, color: C.text2 }}>TOTAL</td>
                  <td style={{ ...TDR, fontWeight: 700, color: C.primary }}>{fmt(kpi.total)}</td>
                  <td style={{ ...TDR, fontWeight: 700, color: C.success }}>{fmt(kpi.paid)}</td>
                  <td style={{ ...TDR, fontWeight: 700, color: C.warning }}>{fmt(kpi.due)}</td>
                  <td colSpan={2} style={TD}/>
                </tr>
              </tfoot>
            )}
          </table>
        </TableCard>
      )}

      {!hasData && !loading && (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
          <BarChart2 size={40} color={C.text3} style={{ margin: '0 auto 12px' }}/>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>No data yet</div>
          <div style={{ fontSize: 14, color: C.text2 }}>Select a date range and click Generate to view your sales report.</div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE REPORT
// ════════════════════════════════════════════════════════════════════════════
function PurchaseReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo]   = useState(getRange('year')[1])
  const [rows,     setRows]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(false)
  const [search,   setSearch]   = useState('')
  const { error }               = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r = await reportsAPI.purchases({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() =>
    rows.filter(r => !search || [r.bill_no, r.party_name, r.status]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const total    = useMemo(() => filtered.reduce((s, r) => s + Number(r.net_total || 0), 0), [filtered])
  const totalDue = useMemo(() => filtered.reduce((s, r) => s + Number(r.due_amount || 0), 0), [filtered])

  return (
    <>
      <FilterBar
        dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k,v) => k==='from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Bills"    value={String(filtered.length)} icon={<Package size={18}/>}    color={C.purple}  />
            <KpiCard label="Total Spent"    value={fmt(total)}              icon={<TrendingDown size={18}/>} color={C.danger}  />
            <KpiCard label="Outstanding"    value={fmt(totalDue)}           icon={<AlertCircle size={18}/>} color={C.warning} />
            <KpiCard label="Avg Bill Value" value={fmt(filtered.length ? total/filtered.length : 0)} icon={<BarChart2 size={18}/>} color={C.cyan}/>
          </div>

          <TableCard
            title="Purchase Bills" count={filtered.length} badge={fmt(total)}
            actions={
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.text3 }}/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                    style={{ paddingLeft: 28, paddingRight: 8, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, outline: 'none', width: 180, color: C.text }}
                  />
                </div>
                <ExportMenu onCSV={() => downloadCSV(filtered, 'purchase-report')} onPrint={() => window.print()}/>
              </>
            }
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Bill No','Date','Supplier','Total','Due','Status'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Total','Due'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonTable cols={6}/> : filtered.map((r: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.surface : C.surface2 + '60' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.primary + '08')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? C.surface : C.surface2 + '60')}
                  >
                    <MonoCell>{r.bill_no}</MonoCell>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                    <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || '—'}</td>
                    <td style={TDR}>{fmt(r.net_total)}</td>
                    <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? C.warning : C.text3 }}>{fmt(r.due_amount || 0)}</td>
                    <td style={TD}><StatusBadge value={r.status}/></td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: C.surface2 }}>
                    <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.text2 }}>TOTAL</td>
                    <td style={{ ...TDR, fontWeight: 700, color: C.primary }}>{fmt(total)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: C.warning }}>{fmt(totalDue)}</td>
                    <td style={TD}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
          <Package size={40} color={C.text3} style={{ margin: '0 auto 12px' }}/>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>No purchases loaded</div>
          <div style={{ fontSize: 14, color: C.text2 }}>Select a date range and click Generate.</div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// P&L REPORT
// ════════════════════════════════════════════════════════════════════════════
function PnLReport() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo]   = useState(getRange('year')[1])
  const [report,   setReport]   = useState<any>(null)
  const [loading,  setLoading]  = useState(false)
  const { error }               = useUIStore()

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

  const isProfit = (report?.netProfit ?? 0) >= 0

  const chartData = report ? [
    { name: 'Income',  value: report.totalIncome },
    { name: 'Expense', value: report.totalExpense },
  ] : []
  const PNL_COLORS = [C.success, C.danger]

  return (
    <>
      <FilterBar
        dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k,v) => k==='from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setReport(null) }}
      />

      {!report && !loading && (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
          <BarChart2 size={40} color={C.text3} style={{ margin: '0 auto 12px' }}/>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Profit & Loss Statement</div>
          <div style={{ fontSize: 14, color: C.text2 }}>Select a period and click Generate to view your P&L.</div>
        </div>
      )}

      {report && (
        <>
          {/* Net profit banner */}
          <div style={{
            ...card,
            padding: '24px 32px',
            marginBottom: 20,
            background: isProfit
              ? `linear-gradient(135deg, ${C.success}12 0%, ${C.success}06 100%)`
              : `linear-gradient(135deg, ${C.danger}12 0%, ${C.danger}06 100%)`,
            border: `1.5px solid ${isProfit ? C.success : C.danger}30`,
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: isProfit ? C.success : C.danger, marginBottom: 4 }}>
                NET {isProfit ? 'PROFIT' : 'LOSS'}
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: isProfit ? C.success : C.danger, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>
                {isProfit ? '+' : ''}{fmt(report.netProfit)}
              </div>
              {report.netPct != null && (
                <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
                  Net margin: <b style={{ color: isProfit ? C.success : C.danger }}>{report.netPct}%</b>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total Revenue</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.success }}>{fmt(report.totalIncome)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total Expenses</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.danger }}>{fmt(report.totalExpense)}</div>
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ResponsiveContainer width={160} height={100}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={3} dataKey="value">
                    {chartData.map((_, i) => <Cell key={i} fill={PNL_COLORS[i]}/>)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <button onClick={() => downloadCSV([
              ...report.incomeRows.map((r: any) => ({ section: 'Income', code: r.code, name: r.name, amount: r.amount })),
              ...report.expenseRows.map((r: any) => ({ section: 'Expense', code: r.code, name: r.name, amount: r.amount })),
              { section: 'NET', code: '', name: 'Net Profit / Loss', amount: report.netProfit },
            ], `pnl-${report.date_from}-${report.date_to}`)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
            }}>
              <Download size={13}/> Export CSV
            </button>
          </div>

          {/* Income / Expense tables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* Income */}
            <TableCard
              title="Income"
              badge={fmt(report.totalIncome)}
              actions={<TrendingUp size={16} color={C.success}/>}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Code</th>
                    <th style={TH}>Account</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.incomeRows.length === 0
                    ? <tr><td colSpan={3}><EmptyState message="No income accounts in this period"/></td></tr>
                    : report.incomeRows.map((row: any, i: number) => (
                        <tr key={i} style={{ background: row.is_group ? C.surface2 : i % 2 === 0 ? C.surface : C.surface2 + '40' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: C.text3 }}>{row.code || '—'}</td>
                          <td style={{ ...TD, fontWeight: row.is_group ? 700 : 400, paddingLeft: (Number(row.depth)||0)*14 + 14 }}>{row.name}</td>
                          <td style={{ ...TDR, color: C.success }}>{Number(row.amount) !== 0 ? fmt(Math.abs(Number(row.amount))) : '—'}</td>
                        </tr>
                      ))
                  }
                </tbody>
                <tfoot>
                  <tr style={{ background: C.surface2 }}>
                    <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>TOTAL INCOME</td>
                    <td style={{ ...TDR, fontWeight: 700, color: C.success }}>{fmt(report.totalIncome)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableCard>

            {/* Expenses */}
            <TableCard
              title="Expenses"
              badge={fmt(report.totalExpense)}
              actions={<TrendingDown size={16} color={C.danger}/>}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Code</th>
                    <th style={TH}>Account</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenseRows.length === 0
                    ? <tr><td colSpan={3}><EmptyState message="No expense accounts in this period"/></td></tr>
                    : report.expenseRows.map((row: any, i: number) => (
                        <tr key={i} style={{ background: row.is_group ? C.surface2 : i % 2 === 0 ? C.surface : C.surface2 + '40' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: C.text3 }}>{row.code || '—'}</td>
                          <td style={{ ...TD, fontWeight: row.is_group ? 700 : 400, paddingLeft: (Number(row.depth)||0)*14 + 14 }}>{row.name}</td>
                          <td style={{ ...TDR, color: C.danger }}>{Number(row.amount) !== 0 ? fmt(Math.abs(Number(row.amount))) : '—'}</td>
                        </tr>
                      ))
                  }
                </tbody>
                <tfoot>
                  <tr style={{ background: C.surface2 }}>
                    <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>TOTAL EXPENSES</td>
                    <td style={{ ...TDR, fontWeight: 700, color: C.danger }}>{fmt(report.totalExpense)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableCard>
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
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const { error }             = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r = await reportsAPI.stock()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() =>
    rows.filter(r => !search || [r.item_code, r.name]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const totalValue = useMemo(() => filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0), [filtered])
  const lowStock   = useMemo(() => filtered.filter(r => r.low_stock).length, [filtered])

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          border: 'none', background: loading ? C.border : C.primary, color: loading ? C.text3 : '#fff',
        }}>
          {loading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }}/> : <Search size={13}/>}
          Load Report
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Products"   value={String(filtered.length)} icon={<Package size={18}/>}     color={C.cyan}    />
            <KpiCard label="Total Stock Value" value={fmt(totalValue)}         icon={<TrendingUp size={18}/>}  color={C.primary} />
            <KpiCard label="Low Stock Items"   value={String(lowStock)}        icon={<AlertCircle size={18}/>} color={lowStock > 0 ? C.warning : C.success}/>
          </div>

          <TableCard
            title="Stock Valuation"
            count={filtered.length}
            badge={fmt(totalValue)}
            actions={
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.text3 }}/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..."
                    style={{ paddingLeft: 28, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, outline: 'none', width: 180, color: C.text, paddingRight: 8 }}
                  />
                </div>
                <ExportMenu onCSV={() => downloadCSV(filtered, 'stock-report')} onPrint={() => window.print()}/>
              </>
            }
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Code','Product','Unit','Stock','P.Rate','Value','Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: ['Stock','P.Rate','Value'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filtered.map((r: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.surface : C.surface2 + '60' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.primary + '08')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? C.surface : C.surface2 + '60')}
                  >
                    <MonoCell>{r.item_code}</MonoCell>
                    <td style={{ ...TD, fontWeight: 500 }}>{r.name}</td>
                    <td style={TD}><span style={{ background: C.surface2, color: C.text2, borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{r.unit}</span></td>
                    <td style={{ ...TDR, color: r.low_stock ? C.danger : C.text, fontWeight: 700 }}>{r.current_stock}</td>
                    <td style={TDR}>{fmt(r.purchase_rate)}</td>
                    <td style={{ ...TDR, fontWeight: 700 }}>{fmt(r.stock_value)}</td>
                    <td style={TD}>
                      {r.low_stock
                        ? <StatusBadge value="pending"/>
                        : <StatusBadge value="active"/>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
          <Package size={40} color={C.text3} style={{ margin: '0 auto 12px' }}/>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Stock valuation report</div>
          <div style={{ fontSize: 14, color: C.text2 }}>Click Load Report to view current stock values.</div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// EXPIRY REPORT
// ════════════════════════════════════════════════════════════════════════════
function ExpiryReport() {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { error }             = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r = await reportsAPI.expiry()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const expired  = rows.filter(r => r.expiry_date && new Date(r.expiry_date) < new Date())
  const nearExp  = rows.filter(r => {
    if (!r.expiry_date) return false
    const d = Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000)
    return d >= 0 && d < 30
  })

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          border: 'none', background: loading ? C.border : C.primary, color: loading ? C.text3 : '#fff',
        }}>
          {loading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }}/> : <AlertCircle size={13}/>}
          Load Expiry Report
        </button>
        {rows.length > 0 && (
          <button onClick={() => downloadCSV(rows, 'expiry-report')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
          }}>
            <Download size={13}/> Export CSV
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <KpiCard label="Total Batches"  value={String(rows.length)}    icon={<Package size={18}/>}     color={C.primary} />
            <KpiCard label="Expired"        value={String(expired.length)} icon={<XCircle size={18}/>}     color={C.danger}  />
            <KpiCard label="Expiring Soon"  value={String(nearExp.length)} icon={<AlertCircle size={18}/>} color={C.warning} />
          </div>

          <TableCard title="Expiry Details" count={rows.length}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Product','Batch','Qty','Expiry','Days Left'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: ['Qty','Days Left'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => {
                  const days = r.expiry_date
                    ? Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000)
                    : null
                  const rowBg = days !== null && days < 0 ? '#FEE2E2' : days !== null && days < 30 ? '#FEF3C7' : (i % 2 === 0 ? C.surface : C.surface2 + '60')
                  return (
                    <tr key={i} style={{ background: rowBg }}>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.product_name}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.batch_no || '—'}</td>
                      <td style={{ ...TDR }}>{r.qty_available}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', color: days !== null && days < 30 ? C.danger : C.text }}>
                        {r.expiry || '—'}
                      </td>
                      <td style={{ ...TDR, fontWeight: 700, color: days === null ? C.text3 : days < 0 ? C.danger : days < 30 ? C.warning : C.success }}>
                        {days !== null ? `${days}d` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
      {!rows.length && !loading && (
        <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
          <AlertCircle size={40} color={C.text3} style={{ margin: '0 auto 12px' }}/>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Expiry tracking</div>
          <div style={{ fontSize: 14, color: C.text2 }}>Click Load Expiry Report to check batch expiry status.</div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PARTY BALANCE REPORT
// ════════════════════════════════════════════════════════════════════════════
function PartyBalanceReport() {
  const [rows,    setRows]    = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [type,    setType]    = useState('customer')
  const [search,  setSearch]  = useState('')
  const { error }             = useUIStore()

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

  const filtered = useMemo(() =>
    rows.filter(r => !search || [r.name, r.code, r.phone]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const totalBalance = summary?.total_balance ?? filtered.reduce((s, r) => s + Number(r.balance || 0), 0)
  const totalDue     = summary?.total_due     ?? filtered.reduce((s, r) => s + Number(r.total_due || 0), 0)
  const totalInvoiced = filtered.reduce((s, r) => s + Number(r.total_invoiced || 0), 0)

  return (
    <>
      {/* Controls */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: C.surface2, borderRadius: 8, padding: 3, gap: 2 }}>
          {[{v:'customer',l:'Customers'},{v:'supplier',l:'Suppliers'}].map(opt => (
            <button key={opt.v} onClick={() => setType(opt.v)} style={{
              padding: '5px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none',
              background: type === opt.v ? C.surface : 'transparent',
              color: type === opt.v ? C.primary : C.text2,
              boxShadow: type === opt.v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>{opt.l}</button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.text3 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parties..."
            style={{ paddingLeft: 28, paddingRight: 8, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: 'none', width: 200, color: C.text }}
          />
        </div>

        <button onClick={() => load(type)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
        }}>
          <RefreshCw size={13}/> Refresh
        </button>

        {rows.length > 0 && (
          <button onClick={() => downloadCSV(filtered, `party-balance-${type}`)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            border: `1px solid ${C.border}`, background: C.surface, color: C.text2,
          }}>
            <Download size={13}/> Export
          </button>
        )}

        {summary && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <div style={{ ...card, padding: '6px 14px', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>{type === 'customer' ? 'TOTAL RECEIVABLE' : 'TOTAL PAYABLE'} </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: Number(totalBalance) > 0 ? C.warning : C.success, fontFamily: 'monospace' }}>
                {fmt(totalBalance)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
          <KpiCard label={`Total ${type === 'customer' ? 'Customers' : 'Suppliers'}`} value={String(filtered.length)} icon={<Users size={18}/>} color={C.primary}/>
          <KpiCard label="Total Invoiced"   value={fmt(totalInvoiced)} icon={<FileText size={18}/>}      color={C.purple} />
          <KpiCard label="Outstanding Due"  value={fmt(totalDue)}      icon={<AlertCircle size={18}/>}   color={C.warning}/>
          <KpiCard label="Net Balance"      value={fmt(totalBalance)}  icon={<TrendingUp size={18}/>}    color={Number(totalBalance) > 0 ? C.warning : C.success}/>
        </div>
      )}

      <TableCard title={`${type === 'customer' ? 'Customer' : 'Supplier'} Balances`} count={filtered.length}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Code','Name','Phone','PAN','Total Invoiced','Paid','Due','Balance'].map(h => (
              <th key={h} style={{ ...TH, textAlign: ['Total Invoiced','Paid','Due','Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? <SkeletonTable cols={8}/> : filtered.length === 0 ? (
              <tr><td colSpan={8}><EmptyState message={`No ${type}s found`}/></td></tr>
            ) : filtered.map((r: any, i: number) => (
              <tr key={i} style={{ background: i % 2 === 0 ? C.surface : C.surface2 + '60' }}
                onMouseEnter={e => (e.currentTarget.style.background = C.primary + '08')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? C.surface : C.surface2 + '60')}
              >
                <MonoCell color={C.primary}>{r.code || '—'}</MonoCell>
                <td style={{ ...TD, fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...TD, color: C.text2 }}>{r.phone || '—'}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: C.text3 }}>{r.pan_no || '—'}</td>
                <td style={TDR}>{fmt(r.total_invoiced || 0)}</td>
                <td style={{ ...TDR, color: C.success }}>{fmt(r.total_paid || 0)}</td>
                <td style={{ ...TDR, color: Number(r.total_due) > 0 ? C.danger : C.text3 }}>{fmt(r.total_due || 0)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: Number(r.balance ?? r.current_balance ?? 0) > 0 ? C.warning : C.success }}>
                  {fmt(r.balance ?? r.current_balance ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: C.surface2, fontWeight: 700 }}>
                <td colSpan={4} style={{ ...TD, textAlign: 'right', fontSize: 12, color: C.text2 }}>TOTALS</td>
                <td style={{ ...TDR, fontWeight: 700 }}>{fmt(totalInvoiced)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: C.success }}>{fmt(filtered.reduce((s, r) => s + Number(r.total_paid||0), 0))}</td>
                <td style={{ ...TDR, fontWeight: 700, color: C.danger }}>{fmt(totalDue)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: Number(totalBalance) > 0 ? C.warning : C.success }}>{fmt(totalBalance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
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
    <div style={{ background: C.bg, minHeight: '100vh', padding: '0 0 40px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes shimmer { to { background-position: -200% 0 } }
        * { box-sizing: border-box }
      `}</style>

      {/* Page Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 24px 0', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.text3, marginBottom: 4 }}>Analytics</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.5px' }}>Reports</h1>
            <p style={{ fontSize: 14, color: C.text2, margin: '4px 0 0' }}>View and analyze your business performance</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              background: `linear-gradient(135deg, ${C.primary}18 0%, ${C.purple}10 100%)`,
              border: `1px solid ${C.primary}30`,
              borderRadius: 10, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <BarChart2 size={16} color={C.primary}/>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>Live Data</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {REPORT_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'transparent',
              color: tab === t.id ? C.primary : C.text2,
              borderBottom: `2.5px solid ${tab === t.id ? C.primary : 'transparent'}`,
              marginBottom: -1,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: tab === t.id ? C.primary : C.text3 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 24px' }}>
        {tab === 'sales'     && <SalesReport />}
        {tab === 'purchases' && <PurchaseReport />}
        {tab === 'pnl'       && <PnLReport />}
        {tab === 'stock'     && <StockReport />}
        {tab === 'expiry'    && <ExpiryReport />}
        {tab === 'party_bal' && <PartyBalanceReport />}
      </div>
    </div>
  )
}