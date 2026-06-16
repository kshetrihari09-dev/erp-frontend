
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileText, Package, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, ShoppingBag, Users,
  BarChart2, Clock, ArrowUpRight, Zap, Download, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useDashboard, useSales } from '@/hooks/useQuery'
import useAuthStore from '@/store/authStore'
import { fmt, fmtCompact, fmtDate } from '@/utils'
import { Badge, SkeletonRows } from '@/components/ui'
import { PATHS } from '@/constants'

const fade = (delay = 0) => ({
  initial:    { opacity: 0, y: 12 },
  animate:    { opacity: 1, y: 0 },
  transition: { delay, duration: .26, ease: 'easeOut' },
})

/* ── Chart tooltip — no currency symbol ────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || '#fff', fontSize: 13, fontWeight: 700, marginTop: 3 }}>
          {p.name && (
            <span style={{ opacity: .65, fontSize: 11, marginRight: 6, fontWeight: 500 }}>{p.name}</span>
          )}
          {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

/* ── Sparkline bars ─────────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  return (
    <div className="sparkline-bar" style={{ '--card-accent': color } as any}>
      {data.map((v, i) => (
        <div
          key={i}
          className="sparkline-bar-item"
          style={{ height: `${Math.max(15, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/* ── KPI Card ── overflow-safe, compact number display ─────────────────── */
interface KPIProps {
  label:       string
  value:       string
  sub?:        string
  icon:        React.ReactNode
  color:       string
  accentClass: string
  sparkData?:  number[]
  onClick?:    () => void
  delay?:      number
}

function KPICard({ label, value, sub, icon, color, accentClass, sparkData, onClick, delay = 0 }: KPIProps) {
  return (
    <motion.div {...fade(delay)}>
      <div
        className={`stat-card ${accentClass}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      >
        {/* Top row: icon + sparkline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div
            className="kpi-icon"
            style={{ background: `${color}18`, boxShadow: `0 0 12px ${color}14` }}
          >
            <div style={{ color }}>{icon}</div>
          </div>
          <Sparkline data={sparkData || [0,0,0,0,0,0,0]} color={color} />
        </div>

        {/* Value — clamped to prevent overflow */}
        <div className="kpi-value kpi-value--clamp">{value}</div>
        <div className="kpi-label">{label}</div>

        {sub && (
          <div style={{
            fontSize: 10.5, color: 'var(--text-4)',
            marginTop: 5, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {sub}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ── Quick action card ──────────────────────────────────────────────────── */
function QACard({ label, path, color, icon, delay = 0 }:
  { label: string; path: string; color: string; icon: React.ReactNode; delay?: number }) {
  const navigate = useNavigate()
  return (
    <motion.div {...fade(delay)}>
      <button className="qa-card" style={{ '--qa-color': color } as any} onClick={() => navigate(path)}>
        <div className="qa-icon" style={{ background: `${color}18` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <span className="qa-label">{label}</span>
      </button>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { user, company }          = useAuthStore()
  const { data: stats, isLoading } = useDashboard()
  const { data: salesData }        = useSales({ limit: 8, page: 1 })
  const recentSales                = (salesData?.data as any[]) || []
  const navigate                   = useNavigate()
  const [chartPeriod, setPeriod]   = useState<'7d' | '30d' | '12m'>('7d')

  /* Chart data — uses real today values, zeroes for past (no history API yet) */
  const chartData = [
    { day: 'Mon', sales: 0, purchases: 0 },
    { day: 'Tue', sales: 0, purchases: 0 },
    { day: 'Wed', sales: 0, purchases: 0 },
    { day: 'Thu', sales: 0, purchases: 0 },
    { day: 'Fri', sales: 0, purchases: 0 },
    { day: 'Sat', sales: 0, purchases: 0 },
    { day: 'Today', sales: stats?.today?.sales_total || 0, purchases: stats?.today?.purchase_total || 0 },
  ]

  /* Payment mode — real data from stats.payment_modes, empty-safe */
  const MODE_COLORS: Record<string, string> = {
    cash:   '#10B981',
    credit: '#F59E0B',
    online: '#2563EB',
    card:   '#8B5CF6',
    bank:   '#0D9488',
  }
  const DEFAULT_COLORS = ['#10B981', '#F59E0B', '#2563EB', '#8B5CF6', '#0D9488', '#EF4444']

  const payMode = (stats?.payment_modes && stats.payment_modes.length > 0)
    ? stats.payment_modes.map((m, i) => ({
        name:  m.name,
        value: m.percent,
        total: m.total,
        count: m.count,
        color: MODE_COLORS[m.name.toLowerCase()] || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      }))
    : []   // truly empty when there are no sales today

  const salesSpark = [0, 0, 0, 0, 0, 0, stats?.today?.sales_total    || 0]
  const revSpark   = [0, 0, 0, 0, 0, 0, stats?.this_month?.revenue    || 0]

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const loading  = isLoading

  /* ── Compact Y-axis formatter — no symbol ────────────────────────────── */
  const yFmt = (v: number) => v === 0 ? '0' : fmtCompact(v)

  return (
    <div style={{ maxWidth: '100%', overflow: 'hidden' }}>

      {/* ══ HERO — compact, 40% shorter ══════════════════════════════════ */}
      <motion.div {...fade(0)}>
        <div className="dash-greeting" style={{ marginBottom: 20 }}>
          {/* Single horizontal row: greeting | stats | cta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="dash-greeting-title" style={{ fontSize: 16 }}>
                {greeting}, {user?.name?.split(' ')[0] || 'there'} 👋
              </div>
              <div className="dash-greeting-sub" style={{ fontSize: 11, marginTop: 2 }}>
                {company?.name || 'MediERP'} · {new Date().toLocaleDateString('en-NP', { dateStyle: 'medium' })}
              </div>
            </div>

            {/* Compact stats */}
            <div className="dash-greeting-stats" style={{ margin: 0, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="dash-greeting-stat-val" style={{ fontSize: 16 }}>
                  {loading ? '—' : fmtCompact(stats?.today?.sales_total)}
                </div>
                <div className="dash-greeting-stat-label">Revenue</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,.1)', alignSelf: 'stretch' }}/>
              <div>
                <div className="dash-greeting-stat-val" style={{ fontSize: 16 }}>
                  {loading ? '—' : stats?.today?.sales_count || 0}
                </div>
                <div className="dash-greeting-stat-label">Invoices</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,.1)', alignSelf: 'stretch' }}/>
              <div>
                <div className="dash-greeting-stat-val" style={{ fontSize: 16, color: (stats?.low_stock_items || 0) > 0 ? '#F59E0B' : '#fff' }}>
                  {loading ? '—' : stats?.low_stock_items || 0}
                </div>
                <div className="dash-greeting-stat-label">Low Stock</div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate(PATHS.SALES)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#2563EB', color: '#fff', border: 'none',
                borderRadius: 9, padding: '8px 16px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 0 16px rgba(37,99,235,.45)',
                transition: 'transform .15s, box-shadow .15s',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(37,99,235,.6)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(37,99,235,.45)' }}
            >
              <Zap size={13}/> New Invoice
            </button>
          </div>
        </div>
      </motion.div>

      {/* ══ KPI GRID — responsive, overflow-safe ═════════════════════════ */}
      <div className="kpi-grid mb-5">
        <KPICard
          label="Today's Sales"   value={loading ? '—' : fmtCompact(stats?.today?.sales_total)}
          sub={`${stats?.today?.sales_count || 0} invoices`}
          icon={<FileText size={17} strokeWidth={1.8}/>}
          color="#2563EB" accentClass="kpi-blue"
          sparkData={salesSpark}
          onClick={() => navigate(PATHS.SALES)} delay={0}
        />
        <KPICard
          label="Monthly Revenue" value={loading ? '—' : fmtCompact(stats?.this_month?.revenue)}
          icon={<TrendingUp size={17} strokeWidth={1.8}/>}
          color="#10B981" accentClass="kpi-green"
          sparkData={revSpark} delay={.05}
        />
        <KPICard
          label="Receivable"      value={loading ? '—' : fmtCompact(stats?.receivable)}
          icon={<DollarSign size={17} strokeWidth={1.8}/>}
          color="#F59E0B" accentClass="kpi-amber" delay={.10}
        />
        <KPICard
          label="Payable"         value={loading ? '—' : fmtCompact(stats?.payable)}
          icon={<TrendingDown size={17} strokeWidth={1.8}/>}
          color="#EF4444" accentClass="kpi-red" delay={.15}
        />
        <KPICard
          label="Stock Value"     value={loading ? '—' : fmtCompact(stats?.stock_value)}
          icon={<Package size={17} strokeWidth={1.8}/>}
          color="#8B5CF6" accentClass="kpi-purple" delay={.20}
        />
        <KPICard
          label="Low Stock"       value={loading ? '—' : String(stats?.low_stock_items || 0)}
          icon={<AlertTriangle size={17} strokeWidth={1.8}/>}
          color="#0D9488" accentClass="kpi-teal"
          onClick={() => navigate(PATHS.PRODUCTS)} delay={.25}
        />
      </div>

      {/* ══ CHARTS ROW ════════════════════════════════════════════════════ */}
      <div className="dash-charts-grid mb-4">

        {/* Revenue area chart */}
        <motion.div {...fade(.1)} className="dash-chart-main">
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">
                  <Activity size={14} style={{ color: '#2563EB' }}/>
                  Revenue Overview
                </div>
                <div className="dash-card-sub">Sales vs Purchases (this week)</div>
              </div>
              <div className="period-tabs">
                {(['7d', '30d', '12m'] as const).map(p => (
                  <button
                    key={p}
                    className={`period-tab ${chartPeriod === p ? 'period-tab--active' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p === '7d' ? '7D' : p === '30d' ? '30D' : '12M'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 4px 8px' }}>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={.28}/>
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gPur" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={.22}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false}/>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: '#4b5563', fontFamily: 'var(--font-mono)' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#4b5563' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={yFmt}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip/>}/>
                  <Area type="monotone" dataKey="sales"     name="Sales"     stroke="#2563EB" strokeWidth={2} fill="url(#gSales)" dot={false}/>
                  <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#8B5CF6" strokeWidth={2} fill="url(#gPur)"   dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Payment mode donut — real data, empty-state handled */}
        <motion.div {...fade(.15)} className="dash-chart-side">
          <div className="dash-card" style={{ height: '100%' }}>
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">
                  <BarChart2 size={14} style={{ color: '#10B981' }}/>
                  Payment Modes
                </div>
                <div className="dash-card-sub">
                  {payMode.length > 0
                    ? `${payMode.reduce((s, m) => s + (m.count || 0), 0)} invoices today`
                    : 'No sales today yet'}
                </div>
              </div>
            </div>

            {payMode.length === 0 ? (
              /* ── Empty state ── */
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '32px 20px', gap: 8,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BarChart2 size={22} style={{ color: 'var(--text-4)' }}/>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>
                  No payment data yet
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-4)', opacity: .6, textAlign: 'center' }}>
                  Data will appear after first sale
                </div>
              </div>
            ) : (
              /* ── Chart + legend ── */
              <div style={{ padding: '12px 16px 16px', display: 'flex', alignItems: 'center', gap: 4 }}>

                {/* Donut */}
                <div style={{ flexShrink: 0, width: 120 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie
                        data={payMode}
                        cx="50%" cy="50%"
                        innerRadius={34} outerRadius={52}
                        paddingAngle={3} dataKey="value"
                        startAngle={90} endAngle={-270}
                      >
                        {payMode.map((e, i) => (
                          <Cell key={i} fill={e.color} stroke="transparent"/>
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any, props: any) => [
                          `${value}%  (${fmt(props.payload.total)})`,
                          props.payload.name,
                        ]}
                        contentStyle={{
                          background: '#1e2d45',
                          border: '1px solid rgba(255,255,255,.1)',
                          borderRadius: 8, fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {payMode.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {/* Color dot */}
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: d.color, flexShrink: 0,
                        boxShadow: `0 0 6px ${d.color}80`,
                      }}/>
                      {/* Name + amount */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {d.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {fmt(d.total)}
                        </div>
                      </div>
                      {/* Percentage badge */}
                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        color: d.color, flexShrink: 0,
                        background: `${d.color}14`,
                        padding: '1px 6px', borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {d.value}%
                      </span>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ══ BOTTOM ROW: Sales table + Quick actions + Low stock ═══════════ */}
      <div className="dash-bottom-grid mb-4">

        {/* Recent Sales — fluid width, no overflow */}
        <motion.div {...fade(.18)} className="dash-bottom-main">
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">
                  <ShoppingCart size={14} style={{ color: '#2563EB' }}/>
                  Recent Sales
                </div>
                <div className="dash-card-sub">Latest invoices</div>
              </div>
              <button
                onClick={() => navigate(PATHS.SALES)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: 'var(--brand)',
                  background: 'rgba(37,99,235,.08)', border: 'none',
                  borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,.14)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,.08)')}
              >
                View all <ArrowUpRight size={11}/>
              </button>
            </div>

            {/* Scrollable table container — prevent page-level overflow */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="erp-table dash-table" style={{ fontSize: 12, minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Party</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Mode</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <SkeletonRows cols={6} rows={5}/>
                    : recentSales.length
                      ? recentSales.map((s: any) => (
                          <tr key={s.id} className="clickable" onClick={() => navigate(PATHS.SALES)}>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {s.invoice_no}
                            </td>
                            <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.party_name || 'Walk-in'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {fmtDate(s.date_ad)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                              {fmt(s.net_total || s.total)}
                            </td>
                            <td><Badge status={s.payment_mode}/></td>
                            <td><Badge status={s.status}/></td>
                          </tr>
                        ))
                      : (
                          <tr>
                            <td colSpan={6}>
                              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-4)', fontSize: 13 }}>
                                No sales yet — create your first invoice
                              </div>
                            </td>
                          </tr>
                        )
                  }
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Right sidebar: Quick Actions + Low Stock */}
        <div className="dash-bottom-side">

          {/* Quick Actions */}
          <motion.div {...fade(.2)}>
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">
                  <Zap size={14} style={{ color: '#F59E0B' }}/> Quick Actions
                </div>
              </div>
              <div style={{ padding: 12 }}>
                <div className="qa-grid">
                  <QACard label="Invoice"  path={PATHS.SALES}     color="#2563EB" icon={<FileText    size={16} strokeWidth={1.8}/>} delay={.22}/>
                  <QACard label="Purchase" path={PATHS.PURCHASE}  color="#8B5CF6" icon={<ShoppingBag size={16} strokeWidth={1.8}/>} delay={.24}/>
                  <QACard label="Customer" path={PATHS.CUSTOMERS} color="#0D9488" icon={<Users       size={16} strokeWidth={1.8}/>} delay={.26}/>
                  <QACard label="Product"  path={PATHS.PRODUCTS}  color="#10B981" icon={<Package     size={16} strokeWidth={1.8}/>} delay={.28}/>
                  <QACard label="Receive"  path={PATHS.RECEIVES}  color="#F59E0B" icon={<Download    size={16} strokeWidth={1.8}/>} delay={.30}/>
                  <QACard label="Reports"  path={PATHS.REPORTS}   color="#EF4444" icon={<BarChart2   size={16} strokeWidth={1.8}/>} delay={.32}/>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Low Stock Panel */}
          {(stats?.low_stock_items || 0) > 0 && (
            <motion.div {...fade(.25)} style={{ marginTop: 14 }}>
              <div className="dash-card">
                <div className="dash-card-header">
                  <div className="dash-card-title">
                    <AlertTriangle size={14} style={{ color: '#EF4444' }}/> Low Stock
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: 'rgba(239,68,68,.1)', color: '#EF4444',
                    padding: '2px 7px', borderRadius: 5,
                    border: '1px solid rgba(239,68,68,.2)',
                  }}>
                    {stats!.low_stock_items}
                  </span>
                </div>
                <div style={{ padding: '4px 14px 12px' }}>
                  {[
                    { name: 'Critical item', qty: 1, level: 'critical' },
                    { name: 'Low item',      qty: 3, level: 'warning'  },
                    { name: 'Near limit',    qty: 6, level: 'ok'       },
                  ].map((item, i) => (
                    <div key={i} className="stock-row">
                      <div className="stock-name">{item.name}</div>
                      <span className="stock-qty" style={{
                        color: item.level === 'critical' ? '#EF4444' : item.level === 'warning' ? '#F59E0B' : '#10B981',
                      }}>
                        {item.qty}
                      </span>
                      <span className={`stock-badge stock-badge--${item.level}`}>
                        {item.level === 'critical' ? 'Critical' : item.level === 'warning' ? 'Low' : 'Ok'}
                      </span>
                    </div>
                  ))}
                  <button
                    onClick={() => navigate(PATHS.PRODUCTS)}
                    style={{
                      width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 7,
                      border: '1px solid var(--border)', background: 'transparent',
                      fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                      cursor: 'pointer', transition: 'all .13s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)' }}
                  >
                    View products <ArrowUpRight size={10}/>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ══ ALERT BANNERS ════════════════════════════════════════════════ */}
      {((stats?.low_stock_items || 0) > 0 || (stats?.expiry_alerts || 0) > 0) && (
        <motion.div {...fade(.3)} className="dash-alerts-grid">
          {(stats?.low_stock_items || 0) > 0 && (
            <div className="dash-alert dash-alert--amber" onClick={() => navigate(PATHS.PRODUCTS)}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: 'rgba(245,158,11,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={16} style={{ color: '#F59E0B' }}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats!.low_stock_items} items below minimum stock
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,158,11,.55)', marginTop: 1 }}>
                  Review and reorder
                </div>
              </div>
              <ArrowUpRight size={13} style={{ color: 'rgba(245,158,11,.4)', flexShrink: 0 }}/>
            </div>
          )}
          {(stats?.expiry_alerts || 0) > 0 && (
            <div className="dash-alert dash-alert--red" onClick={() => navigate(PATHS.STOCK)}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: 'rgba(239,68,68,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={16} style={{ color: '#EF4444' }}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: '#ef4444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats!.expiry_alerts} batches expiring within 30 days
                </div>
                <div style={{ fontSize: 11, color: 'rgba(239,68,68,.55)', marginTop: 1 }}>
                  Review stock immediately
                </div>
              </div>
              <ArrowUpRight size={13} style={{ color: 'rgba(239,68,68,.4)', flexShrink: 0 }}/>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
