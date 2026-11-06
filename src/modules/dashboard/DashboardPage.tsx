import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, TrendingUp, Wallet, CreditCard, Package, AlertTriangle } from 'lucide-react'
import { useDashboard, useDashboardTrend } from '@/hooks/useQuery'
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboard()
  const [range, setRange] = useState<DashboardRange>('7d')
  const trend = useDashboardTrend(range)
  // fixed windows feeding the KPI sparklines (shared cache with the chart when it is on the same range)
  const week  = useDashboardTrend('7d')
  const month = useDashboardTrend('30d')

  const lowStock = Number(stats?.low_stock_items) || 0
  const val = (n?: number) => fmtCompact(n)

  const salesTrend = stats?.compare ? { pct: pctChange(stats.today?.sales_total ?? 0, stats.compare.yesterday_sales), label: 'vs yesterday' } : undefined
  const revTrend   = stats?.compare ? { pct: pctChange(stats.this_month?.revenue ?? 0, stats.compare.last_month_revenue), label: 'vs last month' } : undefined

  return (
    <div className="dash mx-auto max-w-[1600px] space-y-4 text-[var(--text)] md:space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Today’s sales" value={val(stats?.today?.sales_total)} loading={isLoading} icon={<FileText size={17} strokeWidth={1.9} />} accent="#3b82f6"
          hint={`${stats?.today?.sales_count || 0} invoice${stats?.today?.sales_count === 1 ? '' : 's'}`} trend={salesTrend} spark={week.data?.buckets.map(b => b.sales)} onClick={() => navigate(PATHS.SALES)} />
        <KpiCard label="Monthly revenue" value={val(stats?.this_month?.revenue)} loading={isLoading} icon={<TrendingUp size={17} strokeWidth={1.9} />} accent="#10b981"
          hint="This month" trend={revTrend} spark={month.data?.buckets.map(b => b.sales)} />
        <KpiCard label="Receivable" value={val(stats?.receivable)} loading={isLoading} icon={<Wallet size={17} strokeWidth={1.9} />} accent="#f59e0b" hint="Owed by customers" />
        <KpiCard label="Payable" value={val(stats?.payable)} loading={isLoading} icon={<CreditCard size={17} strokeWidth={1.9} />} accent="#f43f5e" hint="Owed to suppliers" />
        <KpiCard label="Stock value" value={val(stats?.stock_value)} loading={isLoading} icon={<Package size={17} strokeWidth={1.9} />} accent="#8b5cf6" hint="At cost" />
        <KpiCard label="Low stock" value={String(lowStock)} loading={isLoading} icon={<AlertTriangle size={17} strokeWidth={1.9} />} accent={lowStock > 0 ? '#f59e0b' : '#14b8a6'}
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
      <h1 className="sr-only">Dashboard</h1>
    </div>
  )
}
