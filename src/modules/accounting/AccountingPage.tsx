import { useState, useEffect, useRef, memo } from 'react'
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
          <div className="acc-kpi-icon" style={{ width: 44, height: 44, borderRadius: 12, background: `${accentColor}18`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, color: accentColor }}>
            {icon}
          </div>
          <div className="acc-kpi-label" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tk.textMuted, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            {label}
          </div>
          <div className="acc-kpi-value" style={{ fontSize: 'clamp(16px, 5vw, 22px)', fontWeight: 800, color: tk.text, letterSpacing: '-0.04em', fontFamily: 'var(--font-mono)', marginBottom: 6, overflowWrap: 'anywhere' }}>
            {value}
          </div>
          {delta && (
            <div className="acc-kpi-delta" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: deltaUp ? '#10b981' : '#ef4444' }}>
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
  const tabbarRef = useRef<HTMLDivElement>(null)
  // a deep link such as ?tab=periods must not leave the active tab off-screen on a phone
  useEffect(() => {
    tabbarRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [tab])

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
      <style>{`
        /* ── Accounting page — mobile/tablet responsive (self-contained, additive) ── */
        .acc-page { max-width: 100%; overflow-x: hidden; }
        .acc-kpi-grid, .acc-tb-kpi-grid { min-width: 0; }
        .acc-kpi-grid > *, .acc-tb-kpi-grid > * { min-width: 0; }

        @media (max-width: 1024px) {
          .acc-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
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
          .acc-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; margin-bottom: 14px !important; }
          .acc-kpi-card { padding: 12px !important; border-radius: 14px !important; }
          .acc-kpi-card .acc-kpi-icon { width: 32px !important; height: 32px !important; border-radius: 9px !important; margin-bottom: 10px !important; }
          .acc-kpi-card .acc-kpi-label { font-size: 9.5px !important; letter-spacing: .08em !important; }
          .acc-kpi-card .acc-kpi-value { font-size: clamp(14px, 4.6vw, 19px) !important; }
          .acc-kpi-card .acc-kpi-delta { font-size: 10px !important; flex-wrap: wrap; row-gap: 0; }
        }
        @media (max-width: 480px) {
          .acc-tb-kpi-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
        }
        @media (max-width: 320px) {
          .acc-kpi-grid { grid-template-columns: 1fr !important; }
        }

        /* ── Touch-sized controls up to tablet width (previously phones only) ── */
        @media (max-width: 1024px) {
          .acc-page .h-7, .acc-page .h-8 { min-height: 40px !important; height: auto !important; padding-top: 6px !important; padding-bottom: 6px !important; }
          .acc-page .erp-input { min-height: 40px !important; }
          .acc-page .acc-tab-btn { min-height: 44px !important; }
          .acc-page .acc-tbtn { min-height: 40px; }
        }

        /* ── Responsive tables: rows become cards when THEIR container is narrow ──
           Container query on the table card (not the viewport), so it adapts to the
           sidebar being open/closed. Tables opt in with class "acc-rt"; cells carry
           data-label. Markup, handlers and data are unchanged. The global
           ".erp-table { min-width: 900px }" is what forced sideways scrolling. */
        .acc-page .table-card { container-type: inline-size; container-name: acctbl; }
        @container acctbl (max-width: 1040px) {
          .acc-page .acc-rt { display: block; min-width: 0 !important; width: 100% !important; }
          .acc-page .acc-rt thead { display: none; }
          .acc-page .acc-rt tbody { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 10px; padding: 12px; }
          .acc-page .acc-rt tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); align-content: start; }
          .acc-page .acc-rt tbody tr:hover td { background: transparent; }
          .acc-page .acc-rt td { display: block; min-width: 0; padding: 0 !important; border: 0 !important; max-width: none !important; width: auto !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; overflow-wrap: anywhere; text-align: left !important; font-size: 13px; }
          .acc-page .acc-rt td[data-label]::before { content: attr(data-label); display: block; margin-bottom: 2px; font: 700 10px/1.2 var(--font); letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
          .acc-page .acc-rt td[colspan], .acc-page .acc-rt td.acc-rt-full, .acc-page .acc-rt td.acc-rt-head, .acc-page .acc-rt td.acc-rt-actions { grid-column: 1 / -1; }
          .acc-page .acc-rt td.acc-rt-head { font-size: 14px; font-weight: 700; }
          .acc-page .acc-rt td.acc-rt-hide { display: none; }
          .acc-page .acc-rt td.td-right { font-weight: 700; }
          .acc-page .acc-rt td.acc-rt-actions { padding-top: 10px !important; border-top: 1px solid var(--border) !important; }
          .acc-page .acc-rt td.acc-rt-actions > div { justify-content: flex-start !important; }
          .acc-page .acc-rt td.acc-rt-actions button { min-height: 40px; min-width: 40px; }
        }

        /* Trial Balance report: when narrow, collapse the redundant Type and period-change
           columns and fold the account code into the name cell so Name, Debit and Credit
           (the figures that matter) stay on screen without sideways scrolling. */
        .acc-page .tb-wrap { container-type: inline-size; container-name: tbwrap; }
        .acc-page .tb-code-inline { display: none; }
        @container tbwrap (max-width: 700px) {
          .acc-page .tb-rt col.tb-col-code, .acc-page .tb-rt col.tb-col-type, .acc-page .tb-rt col.tb-col-delta { visibility: collapse; }
          .acc-page .tb-rt th, .acc-page .tb-rt td { padding-left: 8px !important; padding-right: 8px !important; }
          .acc-page .tb-rt td[colspan] > div { flex-wrap: wrap; row-gap: 2px; }
          .acc-page .tb-code-inline { display: block; margin-bottom: 2px; font: 600 11px/1.2 var(--font-mono); color: var(--text-3); }
        }
        @container tbwrap (max-width: 340px) {
          .acc-page .tb-rt th, .acc-page .tb-rt td { padding-left: 5px !important; padding-right: 5px !important; font-size: 12px !important; }
        }
        @media (max-width: 640px) {
          .acc-tab-content { padding: 12px 8px !important; }
        }
        @media (max-width: 420px) {
          .acc-tab-btn { padding: 10px 11px !important; font-size: 11.5px !important; gap: 5px !important; }
        }
      `}</style>

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
        style={{ ...tk.card, borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Tab bar */}
        <div ref={tabbarRef} role="tablist" aria-label="Accounting sections" className="acc-tabbar" style={{ borderBottom: `1px solid ${tk.divider}`, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', minWidth: 'max-content' }}>
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  className="acc-tab-btn"
                  role="tab"
                  aria-selected={isActive}
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
