import { useId, type ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { fmtPct } from './dashboardUtils'

export interface KpiTrend { pct: number | null; label: string }

/** Tiny area sparkline. Renders nothing when there is no real movement to show. */
function Spark({ values, color }: { values: number[]; color: string }) {
  const id = useId()
  if (values.length < 2 || !values.some(v => v > 0)) return null
  const w = 76, h = 30, pad = 2
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - pad - ((v - min) / span) * (h - pad * 2)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden shrink-0 sm:block" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".32" /><stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TrendPill({ pct }: { pct: number }) {
  const up = pct > 0.05, down = pct < -0.05
  const tone = up ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : down ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-[var(--surface-3)] text-[var(--text-3)]'
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />{fmtPct(pct)}
    </span>
  )
}

interface Props {
  label: string; value: string; icon: ReactNode; accent: string
  loading?: boolean; hint?: string
  trend?: KpiTrend
  spark?: number[]
  onClick?: () => void
}

export default function KpiCard({ label, value, icon, accent, loading, hint, trend, spark, onClick }: Props) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}1f`, color: accent }}>{icon}</span>
        <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-[var(--text-3)]">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {loading
            ? <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-3)]" />
            : <div className="truncate text-[22px] font-bold leading-none tracking-tight tabular-nums text-[var(--text)] sm:text-2xl">{value}</div>}
          <div className="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--text-3)]">
            {loading ? <span className="h-3 w-16 animate-pulse rounded bg-[var(--surface-3)]" />
              : trend && trend.pct !== null ? <><TrendPill pct={trend.pct} /><span>{trend.label}</span></>
              : <span className="truncate">{hint ?? (trend ? 'No earlier data to compare' : '')}</span>}
          </div>
        </div>
        {!loading && spark && <Spark values={spark} color={accent} />}
      </div>
    </>
  )
  const cls = 'block w-full min-h-[118px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left shadow-[var(--shadow-sm)] sm:p-4'
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`${label}: ${value}`} className={`${cls} transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]`}>{body}</button>
    : <div className={cls}>{body}</div>
}
