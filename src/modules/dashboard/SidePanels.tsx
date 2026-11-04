import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, FileText, ShoppingBag, Users, Package, BarChart2, AlertTriangle, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react'
import { useLowStockItems } from '@/hooks/useQuery'
import { fmt } from '@/utils'
import { PATHS } from '@/constants'
import { stockSeverity, type StockSeverity } from './dashboardUtils'

const card = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] md:p-5'

const ACTIONS: Array<{ label: string; path: string; color: string; icon: ReactNode }> = [
  { label: 'Invoice',  path: PATHS.SALES,     color: '#60a5fa', icon: <FileText size={18} strokeWidth={1.8} /> },
  { label: 'Purchase', path: PATHS.PURCHASE,  color: '#a78bfa', icon: <ShoppingBag size={18} strokeWidth={1.8} /> },
  { label: 'Customer', path: PATHS.CUSTOMERS, color: '#2dd4bf', icon: <Users size={18} strokeWidth={1.8} /> },
  { label: 'Product',  path: PATHS.PRODUCTS,  color: '#34d399', icon: <Package size={18} strokeWidth={1.8} /> },
  { label: 'Reports',  path: PATHS.REPORTS,   color: '#fbbf24', icon: <BarChart2 size={18} strokeWidth={1.8} /> },
]

export function QuickActions() {
  const navigate = useNavigate()
  return (
    <section className={card} aria-label="Quick actions">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--text)]"><Zap size={16} className="text-[#fbbf24]" aria-hidden />Quick actions</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3">
        {ACTIONS.map((a, i) => (
          <button key={a.label} type="button" onClick={() => navigate(a.path)}
            className={`${i === ACTIONS.length - 1 ? 'col-span-2 sm:col-span-1 xl:col-span-2' : ''} group flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-3 text-[12px] font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]`}>
            <span className="grid h-9 w-9 place-items-center rounded-lg transition-transform group-hover:scale-105" style={{ background: `${a.color}1f`, color: a.color }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </section>
  )
}

const SEV: Record<StockSeverity, { label: string; chip: string; dot: string }> = {
  out:      { label: 'Out',      chip: 'bg-rose-500/12 text-rose-300',   dot: '#fb7185' },
  critical: { label: 'Critical', chip: 'bg-rose-500/12 text-rose-300',   dot: '#fb7185' },
  low:      { label: 'Low',      chip: 'bg-amber-500/12 text-amber-300', dot: '#fbbf24' },
}

export function LowStockPanel({ count }: { count: number }) {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useLowStockItems()
  const items = (data ?? []).slice(0, 6)
  const total = data?.length ?? count
  return (
    <section className={card} aria-label="Low stock">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--text)]"><AlertTriangle size={16} className="text-[#fbbf24]" aria-hidden />Low stock</h2>
        {total > 0 && <span className="rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-300">{total}</span>}
      </div>

      {isLoading ? (
        <div className="mt-3 grid gap-2">{[1, 2, 3].map(i => <div key={i} className="h-11 animate-pulse rounded-lg bg-[var(--surface-2)]" />)}</div>
      ) : isError ? (
        <p className="mt-4 text-xs text-[var(--text-3)]">Couldn’t load low-stock items.</p>
      ) : items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={26} className="text-emerald-400" aria-hidden />
          <div className="text-sm font-semibold text-[var(--text-2)]">Stock levels look healthy</div>
          <div className="text-xs text-[var(--text-3)]">Nothing is below its minimum.</div>
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {items.map(it => {
              const sev = stockSeverity(it.current_stock, it.min_stock), s = SEV[sev]
              return (
                <li key={it.id}>
                  <button type="button" onClick={() => navigate(PATHS.PRODUCTS)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-white/[.03]">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-[var(--text)]">{it.name}</div>
                      <div className="text-[11px] tabular-nums text-[var(--text-3)]">{fmt(it.current_stock)} left · min {fmt(it.min_stock)}{it.unit ? ` ${it.unit}` : ''}</div>
                    </div>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${s.chip}`}>{s.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => navigate(PATHS.PRODUCTS)} className="mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--text-2)] transition-colors hover:border-[var(--border-2)] hover:text-[var(--text)]">
            {total > items.length ? `View all ${total} products` : 'View products'}<ArrowUpRight size={13} aria-hidden />
          </button>
        </>
      )}
    </section>
  )
}

export function ExpiryAlert({ count }: { count: number }) {
  const navigate = useNavigate()
  if (count <= 0) return null
  return (
    <button type="button" onClick={() => navigate(PATHS.STOCK)}
      className="flex w-full items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[.07] p-3.5 text-left transition-colors hover:bg-rose-500/[.11]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-300"><Clock size={17} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-rose-200">{count} batch{count === 1 ? '' : 'es'} expiring within 30 days</span>
        <span className="block text-[11px] text-rose-200/70">Review stock</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-rose-300/70" aria-hidden />
    </button>
  )
}
