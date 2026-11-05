import { Activity, LineChart as LineChartIcon } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { DashboardRange, DashboardTrend } from '@/types'
import { fmt, fmtCompact } from '@/utils'
import { bucketLabel, pctChange } from './dashboardUtils'
import { TrendPill } from './KpiCard'

const SALES = '#3b82f6', PURCHASES = '#8b5cf6'
const RANGES: Array<{ id: DashboardRange; label: string; prev: string }> = [
  { id: '7d', label: '7D', prev: 'previous 7 days' }, { id: '30d', label: '30D', prev: 'previous 30 days' }, { id: '12m', label: '12M', prev: 'previous 12 months' },
]

function Tip({ active, payload, label, gran }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--shadow-md)]">
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text-3)]">{bucketLabel(String(label), gran, true)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-2)]"><i className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <b className="tabular-nums text-[var(--text)]">{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

function Total({ label, color, value, previous, prevLabel }: { label: string; color: string; value: number; previous: number; prevLabel: string }) {
  const pct = pctChange(value, previous)
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]"><i className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lg font-bold tabular-nums text-[var(--text)]">{fmtCompact(value)}</span>
        {pct !== null && <><TrendPill pct={pct} /><span className="hidden text-[11px] text-[var(--text-3)] sm:inline">vs {prevLabel}</span></>}
      </div>
    </div>
  )
}

interface Props { range: DashboardRange; onRange: (r: DashboardRange) => void; trend?: DashboardTrend; loading: boolean; error: boolean }

export default function RevenueChart({ range, onRange, trend, loading, error }: Props) {
  const gran = trend?.granularity ?? (range === '12m' ? 'month' : 'day')
  const empty = !!trend && trend.totals.sales === 0 && trend.totals.purchases === 0
  const prevLabel = RANGES.find(r => r.id === range)!.prev
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] md:p-5" aria-label="Revenue overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--text)]"><Activity size={16} className="text-[#3b82f6]" aria-hidden />Revenue overview</h2>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">Sales vs purchases</p>
        </div>
        <div role="tablist" aria-label="Chart period" className="inline-flex rounded-lg bg-[var(--surface-2)] p-0.5">
          {RANGES.map(r => (
            <button key={r.id} role="tab" type="button" aria-selected={range === r.id} onClick={() => onRange(r.id)}
              className={`h-10 min-w-[48px] rounded-md px-3.5 text-xs font-semibold lg:h-8 lg:min-w-[44px] lg:px-3 transition-colors ${range === r.id ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text)]'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {trend && !error && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
          <Total label="Sales" color={SALES} value={trend.totals.sales} previous={trend.previous.sales} prevLabel={prevLabel} />
          <Total label="Purchases" color={PURCHASES} value={trend.totals.purchases} previous={trend.previous.purchases} prevLabel={prevLabel} />
        </div>
      )}

      <div className="mt-3 h-[230px] sm:h-[270px]" role="img" aria-label={trend ? `Sales ${fmt(trend.totals.sales)} and purchases ${fmt(trend.totals.purchases)} over the selected period` : 'Revenue chart'}>
        {loading && !trend ? (
          <div className="h-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
        ) : error || empty ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-[var(--border-2)]">
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--text-3)]"><LineChartIcon size={20} aria-hidden /></span>
              <div className="text-sm font-semibold text-[var(--text-2)]">{error ? 'Couldn’t load revenue data' : 'No sales or purchases in this period'}</div>
              <div className="text-xs text-[var(--text-3)]">{error ? 'Check your connection and try again.' : 'Recorded invoices and bills will be charted here.'}</div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend!.buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dgS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SALES} stopOpacity={.34} /><stop offset="100%" stopColor={SALES} stopOpacity={0} /></linearGradient>
                <linearGradient id="dgP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PURCHASES} stopOpacity={.24} /><stop offset="100%" stopColor={PURCHASES} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border-2)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="key" tickFormatter={(k: string) => bucketLabel(k, gran)} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} minTickGap={18} tickMargin={8} />
              <YAxis tickFormatter={(v: number) => (v === 0 ? '0' : fmtCompact(v))} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<Tip gran={gran} />} cursor={{ stroke: 'rgba(148,163,184,.35)', strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="purchases" name="Purchases" stroke={PURCHASES} strokeWidth={2} fill="url(#dgP)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} animationDuration={650} />
              <Area type="monotone" dataKey="sales" name="Sales" stroke={SALES} strokeWidth={2.2} fill="url(#dgS)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} animationDuration={650} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
