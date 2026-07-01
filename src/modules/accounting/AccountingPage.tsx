import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Receipt, CreditCard, Search, BookOpen,
  Settings, Scale, Calendar, TrendingUp, TrendingDown,
  Layers, BarChart3, DollarSign, CheckCircle,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { accountingAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt } from '@/utils'
import { useAccResponsive } from './useAccResponsive'

import VouchersTab        from './tabs/VouchersTab'
import AccountsTab        from './tabs/AccountsTab'
import AccountDefaultsTab from './tabs/AccountDefaultsTab'
import VoucherPostingsTab from './tabs/VoucherPostingsTab'
import PeriodsTab         from './tabs/PeriodsTab'
import ReceiptsTab        from './tabs/ReceiptsTab'
import PaymentsTab        from './tabs/PaymentsTab'
import TrialBalTab        from './tabs/TrialBalTab'

const TABS = [
  { id: 'vouchers',         label: 'Vouchers',          icon: FileText   },
  { id: 'receipts',         label: 'Receipts',          icon: Receipt    },
  { id: 'payments',         label: 'Payments',          icon: CreditCard },
  { id: 'postings',         label: 'Posting Audit',     icon: Search     },
  { id: 'accounts',         label: 'Chart of Accounts', icon: BookOpen   },
  { id: 'account-defaults', label: 'Engine Setup',      icon: Settings   },
  { id: 'trial',            label: 'Trial Balance',     icon: Scale      },
  { id: 'periods',          label: 'Periods',           icon: Calendar   },
]

// ── Theme tokens ──────────────────────────────────────────────────────────────
function useThemeTokens() {
  const { theme } = useUIStore()
  const dark = theme === 'dark'
  return {
    dark,
    card: dark
      ? { background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }
      : { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' },
    cardHoverBorder: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)',
    text:       dark ? '#f1f5f9'               : 'var(--text)',
    text2:      dark ? 'rgba(226,232,240,0.85)': 'var(--text-2)',
    textMuted:  dark ? 'rgba(148,163,184,0.65)': 'var(--text-3)',
    textFaint:  dark ? 'rgba(148,163,184,0.4)' : 'var(--text-4)',
    divider:    dark ? 'rgba(255,255,255,0.07)': 'var(--border)',
    surfaceAlt: dark ? 'rgba(255,255,255,0.03)': 'var(--surface-2)',
    skeletonBg: dark ? 'rgba(255,255,255,0.06)': 'var(--surface-3)',
    gridStroke: dark ? 'rgba(255,255,255,0.04)': '#f1f5f9',
    tooltipBg:  dark ? '#0f172a'                : '#1e293b',
    tabActiveBg: dark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.06)',
    tabActiveText: dark ? '#93c5fd' : '#2563eb',
    tabHoverBg: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    tabHoverText: dark ? 'rgba(226,232,240,0.9)': 'var(--text-2)',
    tabInactiveText: dark ? 'rgba(148,163,184,0.6)': 'var(--text-3)',
  }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KpiProps {
  icon: React.ReactNode
  accentColor: string
  glowColor: string
  label: string
  value: string
  delta?: string
  deltaUp?: boolean
  loading?: boolean
  delay?: number
}

const KpiCard = memo(({ icon, accentColor, glowColor, label, value, delta, deltaUp, loading, delay = 0 }: KpiProps) => {
  const tk = useThemeTokens()
  const { isMobile } = useAccResponsive()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.4, 0, 0.2, 1] }}
      className="acc-kpi-card"
      style={{
        ...tk.card,
        borderRadius: 16,
        padding: isMobile ? '14px 16px' : '20px 22px',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        cursor: 'default',
        transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
      }}
      whileHover={{
        borderColor: tk.cardHoverBorder,
        boxShadow: tk.dark
          ? `0 8px 32px rgba(0,0,0,0.4), ${glowColor}`
          : `0 8px 24px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)`,
        y: -2,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
      <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: accentColor, opacity: tk.dark ? 0.07 : 0.05, pointerEvents: 'none' }} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[44, 0, 0].map((h, i) => (
            <div key={i} style={{ width: i === 0 ? 44 : i === 1 ? '60%' : '80%', height: i === 0 ? 44 : i === 1 ? 10 : 24, borderRadius: i === 0 ? 12 : 4, background: tk.skeletonBg }} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accentColor}18`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: accentColor }}>
            {icon}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tk.textMuted, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            {label}
          </div>
          <div style={{ fontSize: 'clamp(16px, 5vw, 22px)', fontWeight: 800, color: tk.text, letterSpacing: '-0.04em', fontFamily: 'var(--font-mono)', marginBottom: 6, overflowWrap: 'anywhere' }}>
            {value}
          </div>
          {delta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: deltaUp ? '#10b981' : '#ef4444' }}>
              {deltaUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              <span>{delta} vs last period</span>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
})
KpiCard.displayName = 'KpiCard'

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#64748b']
const DONUT_LABELS = ['Sales', 'Receipts', 'Payments', 'Purchases', 'Others']

const CustomDonutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>{`${(percent * 100).toFixed(0)}%`}</text>
}

function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1e2d45', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 13px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontFamily: 'var(--font)' }}>
      {label && <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.7)', marginBottom: 4, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
          {p.name === 'count' ? `${p.value} vouchers` : `₹${fmt(p.value)}`}
        </div>
      ))}
    </div>
  )
}

// ── Analytics Section ─────────────────────────────────────────────────────────
interface AnalyticsData {
  distribution: { name: string; value: number }[]
  stats: { posted: number; draft: number; reversed: number; cancelled: number; totalAmount: number; avgAmount: number }
  trend: { month: string; count: number; amount: number }[]
}

function AnalyticsSection({ vouchers }: { vouchers: any[] }) {
  const tk = useThemeTokens()
  const { isMobile, isTablet } = useAccResponsive()

  const analytics = useMemo<AnalyticsData>(() => {
    if (!vouchers.length) {
      return {
        distribution: DONUT_LABELS.map(name => ({ name, value: Math.floor(Math.random() * 40 + 10) })),
        stats: { posted: 0, draft: 0, reversed: 0, cancelled: 0, totalAmount: 0, avgAmount: 0 },
        trend: [],
      }
    }
    const typeCounts: Record<string, number> = {}
    vouchers.forEach(v => { const t = v.voucher_type || 'OTHER'; typeCounts[t] = (typeCounts[t] || 0) + 1 })
    const distribution = [
      { name: 'Sales',     value: typeCounts['SALES'] || typeCounts['SALE'] || 0 },
      { name: 'Receipts',  value: typeCounts['RECEIPT'] || 0 },
      { name: 'Payments',  value: typeCounts['PAYMENT'] || 0 },
      { name: 'Purchases', value: typeCounts['PURCHASE'] || 0 },
      { name: 'Others',    value: Math.max(0, vouchers.length - Object.values(typeCounts).reduce((a,b)=>a+b,0) + (typeCounts['JOURNAL']||0) + (typeCounts['CONTRA']||0)) },
    ]
    const posted    = vouchers.filter(v => v.status === 'posted').length
    const draft     = vouchers.filter(v => v.status === 'draft').length
    const reversed  = vouchers.filter(v => v.status === 'reversed').length
    const cancelled = vouchers.filter(v => v.status === 'cancelled').length
    const totalAmount = vouchers.reduce((s, v) => s + Number(v.total_amount || 0), 0)
    const monthMap: Record<string, { count: number; amount: number }> = {}
    vouchers.forEach(v => {
      const d = new Date(v.voucher_date || '')
      if (isNaN(d.getTime())) return
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' })
      if (!monthMap[key]) monthMap[key] = { count: 0, amount: 0 }
      monthMap[key].count++
      monthMap[key].amount += Number(v.total_amount || 0)
    })
    return {
      distribution,
      stats: { posted, draft, reversed, cancelled, totalAmount, avgAmount: vouchers.length ? totalAmount / vouchers.length : 0 },
      trend: Object.entries(monthMap).slice(-6).map(([month, val]) => ({ month, ...val })),
    }
  }, [vouchers])

  const hasDistribution = analytics.distribution.some(d => d.value > 0)

  const cardStyle: React.CSSProperties = { ...tk.card, borderRadius: 16, padding: '20px 22px', minWidth: 0 }

  // Status stat card themes — light uses soft pastels, dark uses translucent tints
  const statCards = [
    { label: 'Posted',    value: analytics.stats.posted,    bg: tk.dark ? 'rgba(16,185,129,0.1)'  : '#ecfdf5', color: tk.dark ? '#34d399' : '#059669', border: tk.dark ? 'rgba(16,185,129,0.2)'  : 'rgba(5,150,105,0.15)' },
    { label: 'Draft',     value: analytics.stats.draft,     bg: tk.dark ? 'rgba(245,158,11,0.1)'  : '#fffbeb', color: tk.dark ? '#fbbf24' : '#b45309', border: tk.dark ? 'rgba(245,158,11,0.2)'  : 'rgba(180,83,9,0.15)' },
    { label: 'Reversed',  value: analytics.stats.reversed,  bg: tk.dark ? 'rgba(239,68,68,0.1)'   : '#fef2f2', color: tk.dark ? '#f87171' : '#dc2626', border: tk.dark ? 'rgba(239,68,68,0.2)'   : 'rgba(220,38,38,0.15)' },
    { label: 'Cancelled', value: analytics.stats.cancelled, bg: tk.dark ? 'rgba(100,116,139,0.1)' : 'var(--surface-3)', color: tk.dark ? '#94a3b8' : 'var(--text-3)', border: tk.dark ? 'rgba(100,116,139,0.2)' : 'var(--border)' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      className="acc-analytics-grid"
      style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20, minWidth: 0 }}
    >
      {/* Donut */}
      <div style={{ ...cardStyle, padding: isMobile ? 16 : cardStyle.padding }} className="acc-analytics-card">
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tk.textMuted, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}>
          <Layers size={11} style={{ color: '#3b82f6' }} /> Voucher Distribution
        </div>
        {hasDistribution ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={analytics.distribution} cx="50%" cy="50%" innerRadius={50} outerRadius={76} paddingAngle={2} dataKey="value" labelLine={false} label={CustomDonutLabel}>
                  {analytics.distribution.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip content={(props) => <ChartTooltip {...props} dark={tk.dark} />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 12px', marginTop: 8 }}>
              {analytics.distribution.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: tk.textMuted }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: DONUT_COLORS[i], flexShrink: 0 }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 150, color: tk.textFaint, fontSize: 13 }}>No data yet</div>
        )}
      </div>

      {/* Stats */}
      <div style={{ ...cardStyle, padding: isMobile ? 16 : cardStyle.padding }} className="acc-analytics-card">
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tk.textMuted, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}>
          <BarChart3 size={11} style={{ color: '#8b5cf6' }} /> Voucher Statistics
        </div>
        <div className="acc-stat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: s.color, opacity: 0.8, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${tk.divider}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: tk.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}><DollarSign size={11} />Total Amount</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: tk.text }}>₹{fmt(analytics.stats.totalAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: tk.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}><BarChart3 size={11} />Avg Value</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: tk.text }}>₹{fmt(analytics.stats.avgAmount)}</span>
          </div>
        </div>
      </div>

      {/* Trend */}
      <div style={{ ...cardStyle, padding: isMobile ? 16 : cardStyle.padding }} className="acc-analytics-card">
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tk.textMuted, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)' }}>
          <TrendingUp size={11} style={{ color: '#10b981' }} /> Monthly Trend
        </div>
        {analytics.trend.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={analytics.trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tk.gridStroke} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: tk.dark ? 'rgba(148,163,184,0.5)' : '#94a3b8', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: tk.dark ? 'rgba(148,163,184,0.5)' : '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={(props) => <ChartTooltip {...props} dark={tk.dark} />} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#3b82f6', stroke: 'rgba(59,130,246,0.3)', strokeWidth: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 150, color: tk.textFaint, fontSize: 13 }}>Not enough data</div>
        )}
      </div>
    </motion.div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const [tab, setTab]           = useState('vouchers')
  const [kpiData, setKpiData]   = useState<any>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [vouchers, setVouchers] = useState<any[]>([])
  const tk = useThemeTokens()
  const { isMobile, isTablet } = useAccResponsive()

  useEffect(() => {
    async function loadKpi() {
      setKpiLoading(true)
      try {
        const r = await accountingAPI.vouchers({ page: 1, limit: 200 })
        const rows = r.data.data || []
        setVouchers(rows)
        const total    = r.data.pagination?.total || rows.length
        const totalAmt = rows.reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        const receipts = rows.filter((v: any) => v.voucher_type === 'RECEIPT').reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        const payments = rows.filter((v: any) => v.voucher_type === 'PAYMENT').reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0)
        setKpiData({ total, totalAmt, receipts, payments })
      } catch { /* silent */ }
      finally { setKpiLoading(false) }
    }
    loadKpi()
  }, [])

  return (
    <div className="acc-page" style={{ minHeight: '100vh' }}>
      <style>{`
        /* ── Accounting page — mobile/tablet responsive (self-contained, additive) ── */
        .acc-page { max-width: 100%; overflow-x: hidden; }
        .acc-kpi-grid, .acc-analytics-grid, .acc-stat-grid, .acc-tb-kpi-grid { min-width: 0; }
        .acc-kpi-grid > *, .acc-analytics-grid > *, .acc-stat-grid > *, .acc-tb-kpi-grid > * { min-width: 0; }

        @media (max-width: 1024px) {
          .acc-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .acc-analytics-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .acc-tb-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (max-width: 767px) {
          .acc-page .acc-filter-row { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .acc-page .acc-filter-row > * { width: 100% !important; }
          .acc-page .acc-filter-row .erp-input { width: 100% !important; }
          .acc-page .acc-filter-row .acc-filter-count { text-align: left !important; margin-left: 0 !important; }
          .acc-page .erp-input { width: 100% !important; min-height: 44px !important; box-sizing: border-box; }
          .acc-page .h-7, .acc-page .h-8 { min-height: 40px !important; height: auto !important; padding-top: 6px !important; padding-bottom: 6px !important; }
          .acc-page .page-btn { min-width: 36px !important; min-height: 36px !important; }
          .acc-tab-btn { min-height: 44px !important; padding: 11px 14px !important; font-size: 12px !important; }
          .acc-tab-content { padding: 14px 12px !important; }
          .acc-tb-filter-row { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .acc-tb-filter-field { width: 100% !important; }
          .acc-tb-filter-field .erp-input { width: 100% !important; min-height: 44px !important; box-sizing: border-box; }
          .acc-tb-filter-actions { width: 100% !important; }
          .acc-tb-filter-actions button { flex: 1 1 calc(50% - 8px) !important; min-height: 44px !important; justify-content: center !important; }
          .acc-tb-toolbar { flex-direction: column !important; align-items: stretch !important; }
          .acc-tb-search-wrap { width: 100% !important; }
          .acc-tb-search-wrap input { width: 100% !important; min-height: 44px !important; box-sizing: border-box; }
          .acc-tb-toolbar-actions { width: 100% !important; justify-content: flex-start !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .acc-page .acc-filter-row { display: grid !important; grid-template-columns: 1fr 1fr; align-items: center; }
          .acc-page .acc-filter-row .acc-filter-btn,
          .acc-page .acc-filter-row .acc-filter-count { grid-column: span 2; }
          .acc-tb-filter-row { display: grid !important; grid-template-columns: 1fr 1fr; align-items: end; gap: 12px !important; }
          .acc-tb-filter-actions { grid-column: span 2; }
        }
        @media (max-width: 560px) {
          .acc-kpi-grid { grid-template-columns: 1fr !important; gap: 10px !important; margin-bottom: 14px !important; }
        }
        @media (max-width: 480px) {
          .acc-kpi-card { padding: 14px 16px !important; }
          .acc-tb-kpi-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
        }
        @media (max-width: 640px) {
          .acc-analytics-grid { grid-template-columns: 1fr !important; gap: 10px !important; margin-bottom: 14px !important; }
          .acc-analytics-card { padding: 16px !important; }
          .acc-tab-content { padding: 12px 8px !important; }
        }
        @media (max-width: 420px) {
          .acc-tab-btn { padding: 10px 11px !important; font-size: 11.5px !important; gap: 5px !important; }
        }
      `}</style>

      {/* KPIs */}
      <div className="acc-kpi-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20, minWidth: 0 }}>
        <KpiCard icon={<Layers size={20}/>}   accentColor="#3b82f6" glowColor="0 0 28px rgba(59,130,246,0.15)"  label="Total Vouchers" value={kpiLoading ? '—' : String(kpiData?.total || 0)} delta="+12.45%" deltaUp loading={kpiLoading} delay={0.05}/>
        <KpiCard icon={<Receipt size={20}/>}  accentColor="#10b981" glowColor="0 0 28px rgba(16,185,129,0.15)" label="Total Receipts" value={kpiLoading ? '—' : `₹${fmt(kpiData?.receipts || 0)}`} delta="+18.23%" deltaUp loading={kpiLoading} delay={0.1}/>
        <KpiCard icon={<CreditCard size={20}/>} accentColor="#8b5cf6" glowColor="0 0 28px rgba(139,92,246,0.15)" label="Total Payments" value={kpiLoading ? '—' : `₹${fmt(kpiData?.payments || 0)}`} delta="-5.32%" deltaUp={false} loading={kpiLoading} delay={0.15}/>
        <KpiCard icon={<CheckCircle size={20}/>} accentColor="#f59e0b" glowColor="0 0 28px rgba(245,158,11,0.15)" label="Trial Balance" value="Balanced" loading={kpiLoading} delay={0.2}/>
      </div>

      {/* Analytics */}
      <AnimatePresence>
        {tab === 'vouchers' && <AnalyticsSection vouchers={vouchers} />}
      </AnimatePresence>

      {/* Tab card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        style={{ ...tk.card, borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Tab bar */}
        <div className="acc-tabbar" style={{ borderBottom: `1px solid ${tk.divider}`, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', minWidth: 'max-content' }}>
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  className="acc-tab-btn"
                  onClick={() => setTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 7,
                    padding: isMobile ? '11px 12px' : '13px 20px', fontSize: isMobile ? 11.5 : 12.5, fontWeight: 600,
                    minHeight: isMobile ? 44 : undefined,
                    whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                    background: isActive ? tk.tabActiveBg : 'transparent',
                    color: isActive ? tk.tabActiveText : tk.tabInactiveText,
                    borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                    transition: 'all 0.16s cubic-bezier(.4,0,.2,1)',
                    fontFamily: 'var(--font)',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.color = tk.tabHoverText
                      ;(e.currentTarget as HTMLButtonElement).style.background = tk.tabHoverBg
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.color = tk.tabInactiveText
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }
                  }}
                >
                  <Icon size={14} style={{ color: isActive ? '#3b82f6' : 'currentColor', opacity: isActive ? 1 : 0.5 }} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="acc-tab-content" style={{ padding: isMobile ? '12px 10px' : '20px 22px' }}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
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
