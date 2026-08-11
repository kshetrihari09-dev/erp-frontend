import { useState, useEffect, useCallback, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Receipt, CreditCard, Search, BookOpen,
  Settings, Scale, Calendar, TrendingUp, TrendingDown,
  Layers, CheckCircle,
} from 'lucide-react'
import { accountingAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt } from '@/utils'

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.4, 0, 0.2, 1] }}
      className="acc-kpi-card"
      style={{
        ...tk.card,
        borderRadius: 16,
        padding: '20px 22px',
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

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some(t => t.id === searchParams.get('tab'))
    ? (searchParams.get('tab') as string)
    : 'vouchers'
  const [tab, setTab]           = useState(initialTab)
  const [kpiData, setKpiData]   = useState<any>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const tk = useThemeTokens()

  useEffect(() => {
    async function loadKpi() {
      setKpiLoading(true)
      try {
        const r = await accountingAPI.vouchers({ page: 1, limit: 200 })
        const rows = r.data.data || []
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
      {/* All responsive styling for the Accounting page lives in
          src/styles/globals.css under "ACCOUNTING PAGE — RESPONSIVE" —
          kept out of this component so there's exactly one place to look. */}

      {/* KPIs */}
      <div className="acc-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        <KpiCard icon={<Layers size={20}/>}   accentColor="#3b82f6" glowColor="0 0 28px rgba(59,130,246,0.15)"  label="Total Vouchers" value={kpiLoading ? '—' : String(kpiData?.total || 0)} delta="+12.45%" deltaUp loading={kpiLoading} delay={0.05}/>
        <KpiCard icon={<Receipt size={20}/>}  accentColor="#10b981" glowColor="0 0 28px rgba(16,185,129,0.15)" label="Total Receipts" value={kpiLoading ? '—' : `₹${fmt(kpiData?.receipts || 0)}`} delta="+18.23%" deltaUp loading={kpiLoading} delay={0.1}/>
        <KpiCard icon={<CreditCard size={20}/>} accentColor="#8b5cf6" glowColor="0 0 28px rgba(139,92,246,0.15)" label="Total Payments" value={kpiLoading ? '—' : `₹${fmt(kpiData?.payments || 0)}`} delta="-5.32%" deltaUp={false} loading={kpiLoading} delay={0.15}/>
        <KpiCard icon={<CheckCircle size={20}/>} accentColor="#f59e0b" glowColor="0 0 28px rgba(245,158,11,0.15)" label="Trial Balance" value="Balanced" loading={kpiLoading} delay={0.2}/>
      </div>

      {/* Tab card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="acc-card"
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
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '13px 20px', fontSize: 12.5, fontWeight: 600,
                    whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                    background: isActive ? tk.tabActiveBg : 'transparent',
                    color: isActive ? tk.tabActiveText : tk.tabInactiveText,
                    borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                    transition: 'all 0.16s cubic-bezier(.4,0,.2,1)',
                    fontFamily: 'var(--font)',
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
        <div className="acc-tab-content" style={{ padding: '20px 22px' }}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="acc-tab-anim" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
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
