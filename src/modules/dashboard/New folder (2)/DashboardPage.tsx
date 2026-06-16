/**
 * DashboardPage.tsx — Premium dark SaaS dashboard
 *
 * All API calls, hooks, and data bindings are IDENTICAL to the original.
 * Only the visual presentation is upgraded.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileText, Package, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, ShoppingBag, Users, BookOpen,
  BarChart2, Clock, ArrowUpRight, Zap, Download,
  RotateCcw, Truck, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'
import { useDashboard, useSales } from '@/hooks/useQuery'
import useAuthStore from '@/store/authStore'
import { fmt, fmtDate } from '@/utils'
import { Badge, SkeletonRows } from '@/components/ui'
import { PATHS } from '@/constants'

/* ── Stagger animation preset ───────────────────────────────────────────── */
const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: .28, ease: 'easeOut' },
})

/* ── Custom recharts tooltip ────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || '#fff', fontSize: 13, fontWeight: 700, marginTop: 2 }}>
          {p.name && <span style={{ opacity: .7, fontSize: 11, marginRight: 6 }}>{p.name}</span>}
          {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

/* ── Mini sparkline bars ────────────────────────────────────────────────── */
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

/* ── KPI card ───────────────────────────────────────────────────────────── */
interface KPIProps {
  label: string
  value: string
  sub?: string
  delta?: number   // positive = up, negative = down, undefined = loading
  icon: React.ReactNode
  color: string
  accentClass: string
  sparkData?: number[]
  onClick?: () => void
  delay?: number
}

function KPICard({ label, value, sub, delta, icon, color, accentClass, sparkData, onClick, delay = 0 }: KPIProps) {
  const hasDelta = delta !== undefined
  const isUp     = (delta || 0) >= 0
  const zeros    = [0, 0, 0, 0, 0, 0, 0]

  return (
    <motion.div {...fade(delay)}>
      <div
        className={`stat-card ${accentClass}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : undefined }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          {/* Icon */}
          <div
            className="kpi-icon"
            style={{ background: `${color}18`, boxShadow: `0 0 16px ${color}18` }}
          >
            <div style={{ color }}>{icon}</div>
          </div>
          {/* Sparkline */}
          <Sparkline data={sparkData || zeros} color={color} />
        </div>

        {/* Value */}
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>

        {/* Delta + sub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {hasDelta && (
            <span className={`kpi-delta ${isUp ? 'kpi-delta--up' : 'kpi-delta--down'}`}>
              {isUp ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
              {Math.abs(delta!).toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{sub}</span>}
        </div>
      </div>
    </motion.div>
  )
}

/* ── Quick action card ──────────────────────────────────────────────────── */
function QACard({
  label, path, color, icon, delay = 0,
}: { label: string; path: string; color: string; icon: React.ReactNode; delay?: number }) {
  const navigate = useNavigate()
  return (
    <motion.div {...fade(delay)}>
      <button
        className="qa-card"
        style={{ '--qa-color': color } as any}
        onClick={() => navigate(path)}
      >
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
  const { user, company } = useAuthStore()
  const { data: stats, isLoading } = useDashboard()
  const { data: salesData }        = useSales({ limit: 8, page: 1 })
  const recentSales = (salesData?.data as any[]) || []
  const navigate = useNavigate()

  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '12m'>('7d')

  // Mock chart data — in production wire to reportsAPI.sales()
  const chartData7d = [
    { day: 'Mon', sales: 0, purchases: 0 },
    { day: 'Tue', sales: 0, purchases: 0 },
    { day: 'Wed', sales: 0, purchases: 0 },
    { day: 'Thu', sales: 0, purchases: 0 },
    { day: 'Fri', sales: 0, purchases: 0 },
    { day: 'Sat', sales: 0, purchases: 0 },
    { day: 'Sun', sales: stats?.today?.sales_total || 0, purchases: stats?.today?.purchase_total || 0 },
  ]

  const paymentModeData = [
    { name: 'Cash',   value: 60, color: '#10B981' },
    { name: 'Credit', value: 28, color: '#F59E0B' },
    { name: 'Online', value: 12, color: '#2563EB' },
  ]

  const salesSpark  = [0, 0, 0, 0, 0, 0, stats?.today?.sales_total || 0]
  const revSpark    = [0, 0, 0, 0, 0, 0, stats?.this_month?.revenue || 0]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>

      {/* ── Greeting hero ──────────────────────────────────────────────── */}
      <motion.div {...fade(0)} className="dash-greeting" style={{ marginBottom: 24 }}>
        <div className="dash-greeting-title">
          {greeting}, {user?.name?.split(' ')[0] || 'there'} 👋
        </div>
        <div className="dash-greeting-sub">
          {company?.name} · Here's what's happening today
        </div>
        <div className="dash-greeting-stats">
          <div>
            <div className="dash-greeting-stat-val">
              {isLoading ? '—' : fmt(stats?.today?.sales_total)}
            </div>
            <div className="dash-greeting-stat-label">Today's Revenue</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,.12)', margin: '0 4px' }}/>
          <div>
            <div className="dash-greeting-stat-val">
              {isLoading ? '—' : stats?.today?.sales_count || 0}
            </div>
            <div className="dash-greeting-stat-label">Invoices</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,.12)', margin: '0 4px' }}/>
          <div>
            <div className="dash-greeting-stat-val">
              {isLoading ? '—' : stats?.low_stock_items || 0}
            </div>
            <div className="dash-greeting-stat-label">Low Stock</div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate(PATHS.SALES)}
          style={{
            position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: 7,
            background: '#2563EB', color: '#fff',
            border: 'none', borderRadius: 10, padding: '9px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(37,99,235,.5)',
            transition: 'all .15s',
            zIndex: 2,
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-50%) scale(1.04)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(-50%) scale(1)')}
        >
          <Zap size={14}/> New Invoice
        </button>
      </motion.div>

      {/* ── KPI Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KPICard
          label="Today's Sales"   value={isLoading ? '—' : fmt(stats?.today?.sales_total)}
          sub={`${stats?.today?.sales_count || 0} invoices`}
          icon={<FileText size={18} strokeWidth={1.8}/>}
          color="#2563EB" accentClass="kpi-blue"
          sparkData={salesSpark}
          onClick={() => navigate(PATHS.SALES)}  delay={0}
        />
        <KPICard
          label="Monthly Revenue" value={isLoading ? '—' : fmt(stats?.this_month?.revenue)}
          icon={<TrendingUp size={18} strokeWidth={1.8}/>}
          color="#10B981" accentClass="kpi-green"
          sparkData={revSpark}
          delay={.05}
        />
        <KPICard
          label="Receivable"      value={isLoading ? '—' : fmt(stats?.receivable)}
          icon={<DollarSign size={18} strokeWidth={1.8}/>}
          color="#F59E0B" accentClass="kpi-amber"
          delay={.10}
        />
        <KPICard
          label="Payable"         value={isLoading ? '—' : fmt(stats?.payable)}
          icon={<TrendingDown size={18} strokeWidth={1.8}/>}
          color="#EF4444" accentClass="kpi-red"
          delay={.15}
        />
        <KPICard
          label="Stock Value"     value={isLoading ? '—' : fmt(stats?.stock_value)}
          icon={<Package size={18} strokeWidth={1.8}/>}
          color="#8B5CF6" accentClass="kpi-purple"
          delay={.20}
        />
        <KPICard
          label="Low Stock"       value={isLoading ? '—' : String(stats?.low_stock_items || 0)}
          icon={<AlertTriangle size={18} strokeWidth={1.8}/>}
          color="#0D9488" accentClass="kpi-teal"
          onClick={() => navigate(PATHS.PRODUCTS)} delay={.25}
        />
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

        {/* Revenue chart — 2/3 width */}
        <motion.div {...fade(.1)} className="xl:col-span-2">
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">
                  <Activity size={14} style={{ color: '#2563EB' }}/>
                  Revenue Overview
                </div>
                <div className="dash-card-sub">Sales vs Purchases</div>
              </div>
              {/* Period tabs */}
              <div className="period-tabs">
                {(['7d', '30d', '12m'] as const).map(p => (
                  <button
                    key={p}
                    className={`period-tab ${chartPeriod === p ? 'period-tab--active' : ''}`}
                    onClick={() => setChartPeriod(p)}
                  >
                    {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '12 months'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 8px 8px' }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData7d} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={.3}/>
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="purGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={.25}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false}/>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '0' : fmt(v)}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Area type="monotone" dataKey="sales"     name="Sales"     stroke="#2563EB" strokeWidth={2} fill="url(#salesGrad)" dot={false}/>
                  <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#8B5CF6" strokeWidth={2} fill="url(#purGrad)"   dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Payment mode doughnut — 1/3 width */}
        <motion.div {...fade(.15)}>
          <div className="dash-card" style={{ height: '100%' }}>
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">
                  <BarChart2 size={14} style={{ color: '#10B981' }}/>
                  Payment Modes
                </div>
                <div className="dash-card-sub">Distribution today</div>
              </div>
            </div>
            <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={paymentModeData} cx="50%" cy="50%" innerRadius={42} outerRadius={62}
                    paddingAngle={3} dataKey="value">
                    {paymentModeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent"/>
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v}%`}/>
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '0 20px 8px' }}>
                {paymentModeData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                      <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                      {d.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Second row: recent sales + quick actions + low stock ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

        {/* Recent Sales table — 2/3 */}
        <motion.div {...fade(.18)} className="xl:col-span-2">
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
                  transition: 'all .13s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,.14)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,.08)')}
              >
                View all <ArrowUpRight size={11}/>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table dash-table" style={{ fontSize: 12 }}>
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
                  {isLoading
                    ? <SkeletonRows cols={6} rows={5}/>
                    : recentSales.length
                      ? recentSales.map((s: any) => (
                          <tr
                            key={s.id}
                            className="clickable"
                            onClick={() => navigate(PATHS.SALES)}
                          >
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontSize: 11 }}>
                              {s.invoice_no}
                            </td>
                            <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.party_name || 'Walk-in'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                              {fmtDate(s.date_ad)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                              {fmt(s.net_total || s.total)}
                            </td>
                            <td><Badge status={s.payment_mode}/></td>
                            <td><Badge status={s.status}/></td>
                          </tr>
                        ))
                      : (
                          <tr>
                            <td colSpan={6}>
                              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-4)', fontSize: 13 }}>
                                No sales yet
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

        {/* Right column: Quick actions + Low stock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Quick Actions grid */}
          <motion.div {...fade(.2)}>
            <div className="dash-card">
              <div className="dash-card-header">
                <div className="dash-card-title">
                  <Zap size={14} style={{ color: '#F59E0B' }}/>
                  Quick Actions
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div className="grid grid-cols-3 gap-2">
                  <QACard label="Invoice"   path={PATHS.SALES}      color="#2563EB" icon={<FileText   size={17} strokeWidth={1.8}/>} delay={.22}/>
                  <QACard label="Purchase"  path={PATHS.PURCHASE}   color="#8B5CF6" icon={<ShoppingBag size={17} strokeWidth={1.8}/>} delay={.24}/>
                  <QACard label="Customer"  path={PATHS.CUSTOMERS}  color="#0D9488" icon={<Users       size={17} strokeWidth={1.8}/>} delay={.26}/>
                  <QACard label="Product"   path={PATHS.PRODUCTS}   color="#10B981" icon={<Package     size={17} strokeWidth={1.8}/>} delay={.28}/>
                  <QACard label="Receive"   path={PATHS.RECEIVES}   color="#F59E0B" icon={<Download    size={17} strokeWidth={1.8}/>} delay={.30}/>
                  <QACard label="Reports"   path={PATHS.REPORTS}    color="#EF4444" icon={<BarChart2   size={17} strokeWidth={1.8}/>} delay={.32}/>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Low stock panel */}
          {(stats?.low_stock_items || 0) > 0 && (
            <motion.div {...fade(.25)}>
              <div className="dash-card">
                <div className="dash-card-header">
                  <div className="dash-card-title">
                    <AlertTriangle size={14} style={{ color: '#EF4444' }}/>
                    Low Stock Alert
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,.1)',
                    color: '#EF4444', padding: '3px 7px', borderRadius: 5,
                    border: '1px solid rgba(239,68,68,.2)',
                  }}>
                    {stats!.low_stock_items} items
                  </span>
                </div>
                <div style={{ padding: '0 16px 12px' }}>
                  {/* Placeholder rows — wire to real data when available */}
                  {[1, 2, 3].map(i => (
                    <div key={i} className="stock-row">
                      <div className="stock-name" style={{ background: 'var(--surface-2)', borderRadius: 4, height: 12, width: `${60 + i * 10}%` }}/>
                      <span className="stock-qty" style={{ color: i === 1 ? '#EF4444' : i === 2 ? '#F59E0B' : '#10B981' }}>
                        {i}
                      </span>
                      <span className={`stock-badge ${i === 1 ? 'stock-badge--critical' : i === 2 ? 'stock-badge--warning' : 'stock-badge--ok'}`}>
                        {i === 1 ? 'Critical' : i === 2 ? 'Low' : 'Ok'}
                      </span>
                    </div>
                  ))}
                  <button
                    onClick={() => navigate(PATHS.PRODUCTS)}
                    style={{
                      width: '100%', marginTop: 10,
                      padding: '7px 0', borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent', fontSize: 11, fontWeight: 600,
                      color: 'var(--text-3)', cursor: 'pointer',
                      transition: 'all .13s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)' }}
                  >
                    View all products <ArrowUpRight size={11}/>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Alerts row ─────────────────────────────────────────────────── */}
      {((stats?.low_stock_items || 0) > 0 || (stats?.expiry_alerts || 0) > 0) && (
        <motion.div {...fade(.3)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(stats?.low_stock_items || 0) > 0 && (
            <div className="dash-alert dash-alert--amber" onClick={() => navigate(PATHS.PRODUCTS)}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(245,158,11,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertTriangle size={17} style={{ color: '#F59E0B' }}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b' }}>
                  {stats!.low_stock_items} items below minimum stock
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,158,11,.6)', marginTop: 2 }}>
                  Click to review products
                </div>
              </div>
              <ArrowUpRight size={14} style={{ color: 'rgba(245,158,11,.5)', flexShrink: 0 }}/>
            </div>
          )}
          {(stats?.expiry_alerts || 0) > 0 && (
            <div className="dash-alert dash-alert--red" onClick={() => navigate(PATHS.STOCK)}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(239,68,68,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Clock size={17} style={{ color: '#EF4444' }}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#ef4444' }}>
                  {stats!.expiry_alerts} batches expiring within 30 days
                </div>
                <div style={{ fontSize: 11, color: 'rgba(239,68,68,.6)', marginTop: 2 }}>
                  Click to review stock
                </div>
              </div>
              <ArrowUpRight size={14} style={{ color: 'rgba(239,68,68,.5)', flexShrink: 0 }}/>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
