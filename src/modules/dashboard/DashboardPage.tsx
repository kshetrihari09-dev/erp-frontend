import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, TrendingUp, Wallet, CreditCard, Package, AlertTriangle, Plus } from 'lucide-react'
import { useDashboard, useDashboardTrend } from '@/hooks/useQuery'
import useAuthStore from '@/store/authStore'
import { fmtCompact } from '@/utils'
import { PATHS } from '@/constants'
import type { DashboardRange } from '@/types'
import KpiCard from './KpiCard'
import RevenueChart from './RevenueChart'
import PaymentModes from './PaymentModes'
import RecentSales from './RecentSales'
import { QuickActions, LowStockPanel, ExpiryAlert } from './SidePanels'
import { pctChange } from './dashboardUtils'

const COLS = 'xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]'

function HeaderStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className={`text-lg font-bold leading-none tabular-nums ${tone ?? 'text-[var(--text)]'}`}>{value}</div>
      <div className="mt-1 text-[11px] font-medium text-[var(--text-3)]">{label}</div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, company } = useAuthStore()
  const { data: stats, isLoading } = useDashboard()
  const [range, setRange] = useState<DashboardRange>('7d')
  const trend = useDashboardTrend(range)
  // fixed windows feeding the KPI sparklines (shared cache with the chart when it is on the same range)
  const week  = useDashboardTrend('7d')
  const month = useDashboardTrend('30d')

  const lowStock = Number(stats?.low_stock_items) || 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateText = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  const val = (n?: number) => fmtCompact(n)

  const salesTrend = stats?.compare ? { pct: pctChange(stats.today?.sales_total ?? 0, stats.compare.yesterday_sales), label: 'vs yesterday' } : undefined
  const revTrend   = stats?.compare ? { pct: pctChange(stats.this_month?.revenue ?? 0, stats.compare.last_month_revenue), label: 'vs last month' } : undefined

  return (
    <div className="dark dash mx-auto max-w-[1600px] space-y-4 rounded-2xl bg-[var(--bg)] p-3 text-[var(--text)] md:space-y-5 md:p-5">
      {/* header */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{greeting}, {user?.name?.split(' ')[0] || 'there'}</h1>
          <p className="mt-1 truncate text-[13px] text-[var(--text-3)]">{company?.name || 'Zerthix'} · {dateText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-5 sm:gap-6">
            <HeaderStat label="Sales today" value={isLoading ? '—' : val(stats?.today?.sales_total)} />
            <HeaderStat label="Invoices" value={isLoading ? '—' : String(stats?.today?.sales_count || 0)} />
            <HeaderStat label="Low stock" value={isLoading ? '—' : String(lowStock)} tone={lowStock > 0 ? 'text-amber-300' : undefined} />
          </div>
          <button type="button" onClick={() => navigate(PATHS.SALES)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-bold text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,.7)] transition-all hover:brightness-110 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] max-sm:w-full max-sm:justify-center">
            <Plus size={18} strokeWidth={2.4} aria-hidden />New invoice
          </button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Today’s sales" value={val(stats?.today?.sales_total)} loading={isLoading} icon={<FileText size={17} strokeWidth={1.9} />} accent="#60a5fa"
          hint={`${stats?.today?.sales_count || 0} invoice${stats?.today?.sales_count === 1 ? '' : 's'}`} trend={salesTrend} spark={week.data?.buckets.map(b => b.sales)} onClick={() => navigate(PATHS.SALES)} />
        <KpiCard label="Monthly revenue" value={val(stats?.this_month?.revenue)} loading={isLoading} icon={<TrendingUp size={17} strokeWidth={1.9} />} accent="#34d399"
          hint="This month" trend={revTrend} spark={month.data?.buckets.map(b => b.sales)} />
        <KpiCard label="Receivable" value={val(stats?.receivable)} loading={isLoading} icon={<Wallet size={17} strokeWidth={1.9} />} accent="#fbbf24" hint="Owed by customers" />
        <KpiCard label="Payable" value={val(stats?.payable)} loading={isLoading} icon={<CreditCard size={17} strokeWidth={1.9} />} accent="#fb7185" hint="Owed to suppliers" />
        <KpiCard label="Stock value" value={val(stats?.stock_value)} loading={isLoading} icon={<Package size={17} strokeWidth={1.9} />} accent="#a78bfa" hint="At cost" />
        <KpiCard label="Low stock" value={String(lowStock)} loading={isLoading} icon={<AlertTriangle size={17} strokeWidth={1.9} />} accent={lowStock > 0 ? '#fbbf24' : '#2dd4bf'}
          hint={lowStock > 0 ? 'Below minimum' : 'All stocked'} onClick={() => navigate(PATHS.PRODUCTS)} />
      </div>

      {/* charts */}
      <div className={`grid gap-4 md:gap-5 ${COLS}`}>
        <RevenueChart range={range} onRange={setRange} trend={trend.data} loading={trend.isLoading} error={trend.isError && !trend.data} />
        <PaymentModes modes={stats?.payment_modes} loading={isLoading} />
      </div>

      {/* sales + sidebar */}
      <div className={`grid items-start gap-4 md:gap-5 ${COLS}`}>
        <RecentSales />
        <div className="grid gap-4 md:gap-5">
          <QuickActions />
          <LowStockPanel count={lowStock} />
          <ExpiryAlert count={Number(stats?.expiry_alerts) || 0} />
        </div>
      </div>
    </div>
  )
}
