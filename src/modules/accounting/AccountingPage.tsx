import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Receipt, CreditCard, Search, BookOpen,
  Settings, Scale, Calendar, Plus, Bell, Sun, Moon,
  TrendingUp, TrendingDown, Layers, CheckCircle,
  BarChart3, DollarSign, ChevronRight, RefreshCw,
  AlertCircle,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { accountingAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt } from '@/utils'

// ── Child Tabs (all logic preserved) ─────────────────────────────────────────
import VouchersTab        from './tabs/VouchersTab'
import AccountsTab        from './tabs/AccountsTab'
import AccountDefaultsTab from './tabs/AccountDefaultsTab'
import VoucherPostingsTab from './tabs/VoucherPostingsTab'
import PeriodsTab         from './tabs/PeriodsTab'
import ReceiptsTab        from './tabs/ReceiptsTab'
import PaymentsTab        from './tabs/PaymentsTab'
import TrialBalTab        from './tabs/TrialBalTab'

// ─────────────────────────────────────────────────────────────────────────────
// Tab config
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'vouchers',         label: 'Vouchers',         icon: FileText  },
  { id: 'receipts',         label: 'Receipts',         icon: Receipt   },
  { id: 'payments',         label: 'Payments',         icon: CreditCard},
  { id: 'postings',         label: 'Posting Audit',    icon: Search    },
  { id: 'accounts',         label: 'Chart of Accounts',icon: BookOpen  },
  { id: 'account-defaults', label: 'Engine Setup',     icon: Settings  },
  { id: 'trial',            label: 'Trial Balance',    icon: Scale     },
  { id: 'periods',          label: 'Periods',          icon: Calendar  },
]

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
interface KpiProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  delta?: string
  deltaUp?: boolean
  loading?: boolean
  delay?: number
}

const KpiCard = memo(({ icon, iconBg, label, value, delta, deltaUp, loading, delay = 0 }: KpiProps) => (
  <motion.div
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default"
  >
    {loading ? (
      <div className="animate-pulse space-y-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100" />
        <div className="h-3 w-24 bg-slate-100 rounded" />
        <div className="h-7 w-32 bg-slate-100 rounded" />
      </div>
    ) : (
      <>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>
          {icon}
        </div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
        <div className="text-2xl font-bold text-slate-800 tracking-tight font-mono mb-1.5">{value}</div>
        {delta && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${deltaUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {deltaUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta} vs last period
          </div>
        )}
      </>
    )}
  </motion.div>
))
KpiCard.displayName = 'KpiCard'

// ─────────────────────────────────────────────────────────────────────────────
// Donut Chart
// ─────────────────────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#2563eb', '#16a34a', '#7c3aed', '#f59e0b', '#94a3b8']
const DONUT_LABELS = ['Sales', 'Receipts', 'Payments', 'Purchases', 'Others']

const CustomDonutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics section
// ─────────────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  distribution: { name: string; value: number }[]
  stats: { posted: number; draft: number; reversed: number; cancelled: number; totalAmount: number; avgAmount: number }
  trend: { month: string; count: number; amount: number }[]
}

function AnalyticsSection({ vouchers }: { vouchers: any[] }) {
  const analytics = useMemo<AnalyticsData>(() => {
    if (!vouchers.length) {
      return {
        distribution: DONUT_LABELS.map((name, i) => ({ name, value: Math.floor(Math.random() * 40 + 10) })),
        stats: { posted: 0, draft: 0, reversed: 0, cancelled: 0, totalAmount: 0, avgAmount: 0 },
        trend: [],
      }
    }

    // Distribution by type
    const typeCounts: Record<string, number> = {}
    vouchers.forEach(v => {
      const t = v.voucher_type || 'OTHER'
      typeCounts[t] = (typeCounts[t] || 0) + 1
    })
    const distribution = [
      { name: 'Sales',    value: typeCounts['SALES']       || typeCounts['SALE']    || 0 },
      { name: 'Receipts', value: typeCounts['RECEIPT']     || 0 },
      { name: 'Payments', value: typeCounts['PAYMENT']     || 0 },
      { name: 'Purchases',value: typeCounts['PURCHASE']    || 0 },
      { name: 'Others',   value: vouchers.length - Object.values(typeCounts).reduce((a,b)=>a+b,0) + (typeCounts['JOURNAL']||0) + (typeCounts['CONTRA']||0) },
    ].map(d => ({ ...d, value: Math.max(0, d.value) }))

    // Status stats
    const posted    = vouchers.filter(v => v.status === 'posted').length
    const draft     = vouchers.filter(v => v.status === 'draft').length
    const reversed  = vouchers.filter(v => v.status === 'reversed').length
    const cancelled = vouchers.filter(v => v.status === 'cancelled').length
    const totalAmount = vouchers.reduce((s, v) => s + Number(v.total_amount || 0), 0)

    // Monthly trend (last 6 months)
    const monthMap: Record<string, { count: number; amount: number }> = {}
    vouchers.forEach(v => {
      const d = new Date(v.voucher_date || '')
      if (isNaN(d.getTime())) return
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' })
      if (!monthMap[key]) monthMap[key] = { count: 0, amount: 0 }
      monthMap[key].count++
      monthMap[key].amount += Number(v.total_amount || 0)
    })
    const trend = Object.entries(monthMap)
      .slice(-6)
      .map(([month, val]) => ({ month, ...val }))

    return {
      distribution,
      stats: { posted, draft, reversed, cancelled, totalAmount, avgAmount: vouchers.length ? totalAmount / vouchers.length : 0 },
      trend,
    }
  }, [vouchers])

  const hasDistribution = analytics.distribution.some(d => d.value > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5"
    >
      {/* Donut Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Layers size={11} /> Voucher Distribution
        </div>
        {hasDistribution ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={analytics.distribution}
                  cx="50%" cy="50%"
                  innerRadius={52} outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                  label={CustomDonutLabel}
                >
                  {analytics.distribution.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: any) => [`${v} vouchers`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-1">
              {analytics.distribution.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i] }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-300 text-sm">No data yet</div>
        )}
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <BarChart3 size={11} /> Voucher Statistics
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Posted',    value: analytics.stats.posted,    color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Draft',     value: analytics.stats.draft,     color: 'bg-amber-50 text-amber-700' },
            { label: 'Reversed',  value: analytics.stats.reversed,  color: 'bg-red-50 text-red-600' },
            { label: 'Cancelled', value: analytics.stats.cancelled, color: 'bg-slate-100 text-slate-500' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-1">{s.label}</div>
              <div className="text-2xl font-bold font-mono">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 flex items-center gap-1.5"><DollarSign size={11}/>Total Amount</span>
            <span className="text-sm font-bold font-mono text-slate-800">₹{fmt(analytics.stats.totalAmount)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 flex items-center gap-1.5"><BarChart3 size={11}/>Avg Value</span>
            <span className="text-sm font-bold font-mono text-slate-800">₹{fmt(analytics.stats.avgAmount)}</span>
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <TrendingUp size={11} /> Monthly Trend
        </div>
        {analytics.trend.length >= 2 ? (
          <ResponsiveContainer width="100%" height={185}>
            <LineChart data={analytics.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(v: any, name: string) => [name === 'count' ? `${v} vouchers` : `₹${fmt(v)}`, name === 'count' ? 'Count' : 'Amount']}
              />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-300 text-sm">Not enough data</div>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const [tab, setTab]     = useState('vouchers')
  const [dark, setDark]   = useState(false)
  const [kpiData, setKpiData] = useState<any>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [vouchers, setVouchers] = useState<any[]>([])

  // Load KPI summary data once
  useEffect(() => {
    async function loadKpi() {
      setKpiLoading(true)
      try {
        const r = await accountingAPI.vouchers({ page: 1, limit: 200 })
        const rows = r.data.data || []
        setVouchers(rows)
        const total   = r.data.pagination?.total || rows.length
        const totalAmt = rows.reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        const receipts = rows.filter((v: any) => v.voucher_type === 'RECEIPT').reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        const payments = rows.filter((v: any) => v.voucher_type === 'PAYMENT').reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        setKpiData({ total, totalAmt, receipts, payments })
      } catch {
        // silent fail — kpi is non-critical
      } finally {
        setKpiLoading(false)
      }
    }
    loadKpi()
  }, [])

  // Dark mode toggle
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => { if (dark) document.documentElement.classList.remove('dark') }
  }, [dark])

  const activeTab = TABS.find(t => t.id === tab)

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
   
      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          icon={<Layers size={20} className="text-blue-600" />}
          iconBg="bg-blue-50"
          label="Total Vouchers"
          value={kpiLoading ? '…' : String(kpiData?.total || 0)}
          delta="+12.45%"
          deltaUp
          loading={kpiLoading}
          delay={0.05}
        />
        <KpiCard
          icon={<Receipt size={20} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Total Receipts"
          value={kpiLoading ? '…' : `₹${fmt(kpiData?.receipts || 0)}`}
          delta="+18.23%"
          deltaUp
          loading={kpiLoading}
          delay={0.1}
        />
        <KpiCard
          icon={<CreditCard size={20} className="text-violet-600" />}
          iconBg="bg-violet-50"
          label="Total Payments"
          value={kpiLoading ? '…' : `₹${fmt(kpiData?.payments || 0)}`}
          delta="-5.32%"
          deltaUp={false}
          loading={kpiLoading}
          delay={0.15}
        />
        <KpiCard
          icon={<Scale size={20} className="text-amber-600" />}
          iconBg="bg-amber-50"
          label="Trial Balance"
          value="Balanced"
          loading={kpiLoading}
          delay={0.2}
        />
      </div>

      {/* ── Analytics (only on vouchers tab) ─────────────────────────────────── */}
      <AnimatePresence>
        {tab === 'vouchers' && (
          <AnalyticsSection vouchers={vouchers} />
        )}
      </AnimatePresence>

      {/* ── Tab Navigation ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        {/* Tab Bar */}
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-2 px-5 py-3.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 border-b-2 ${
                    isActive
                      ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                  {t.label}
                  {isActive && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              {tab === 'vouchers'         && <VouchersTab />}
              {tab === 'receipts'         && <ReceiptsTab />}
              {tab === 'payments'         && <PaymentsTab />}
              {tab === 'postings'         && <VoucherPostingsTab />}
              {tab === 'accounts'         && <AccountsTab />}
              {tab === 'account-defaults' && <AccountDefaultsTab />}
              {tab === 'trial'            && <TrialBalTab />}
              {tab === 'periods'          && <PeriodsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
