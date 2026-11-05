import { PieChart as PieIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { DashboardStats } from '@/types'
import { fmt, fmtCompact } from '@/utils'
import { paymentColor, paymentName } from './dashboardUtils'

interface Props { modes?: DashboardStats['payment_modes']; loading: boolean }

export default function PaymentModes({ modes, loading }: Props) {
  const rows = (modes ?? []).map((m, i) => ({ ...m, label: paymentName(m.name), color: paymentColor(m.name, i) }))
  const total = rows.reduce((n, r) => n + r.total, 0)
  const invoices = rows.reduce((n, r) => n + (r.count || 0), 0)
  return (
    <section className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] md:p-5" aria-label="Payment modes">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--text)]"><PieIcon size={16} className="text-[#10b981]" aria-hidden />Payment modes</h2>
      <p className="mt-0.5 text-xs text-[var(--text-3)]">{rows.length ? `Today · ${invoices} invoice${invoices === 1 ? '' : 's'}` : 'Today'}</p>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      ) : rows.length === 0 ? (
        <div className="grid flex-1 place-items-center py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden>
              <circle cx="46" cy="46" r="34" fill="none" stroke="var(--surface-3)" strokeWidth="12" />
              <circle cx="46" cy="46" r="34" fill="none" stroke="rgba(148,163,184,.35)" strokeWidth="12" strokeDasharray="10 14" strokeLinecap="round" transform="rotate(-90 46 46)" />
            </svg>
            <div className="text-sm font-semibold text-[var(--text-2)]">No payments today</div>
            <div className="max-w-[200px] text-xs text-[var(--text-3)]">The split between cash, credit and bank appears after the first sale.</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
          <div className="relative h-[150px] w-[150px] shrink-0" role="img" aria-label={`Payment modes today, total ${fmt(total)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="total" nameKey="label" innerRadius={50} outerRadius={70} paddingAngle={rows.length > 1 ? 3 : 0} startAngle={90} endAngle={-270} stroke="none" animationDuration={650}>
                  {rows.map(r => <Cell key={r.name} fill={r.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, _n: any, p: any) => [`${fmt(v)} (${p.payload.percent}%)`, p.payload.label]}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 12 }} itemStyle={{ color: 'var(--text)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Total</div><div className="text-lg font-bold tabular-nums text-[var(--text)]">{fmtCompact(total)}</div></div>
            </div>
          </div>
          <ul className="grid w-full min-w-0 flex-1 gap-2.5">
            {rows.map(r => (
              <li key={r.name} className="flex items-center gap-2.5">
                <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[var(--text-2)]">{r.label}</div>
                  <div className="text-[11px] tabular-nums text-[var(--text-3)]">{fmt(r.total)}</div>
                </div>
                <span className="text-[13px] font-bold tabular-nums text-[var(--text)]">{r.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
