import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, ChevronLeft, ChevronRight, ArrowUpRight, X } from 'lucide-react'
import { useSales } from '@/hooks/useQuery'
import { fmt } from '@/utils'
import { PATHS } from '@/constants'
import { dateLabel, paymentColor, paymentName } from './dashboardUtils'

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/12 text-emerald-300', returned: 'bg-amber-500/12 text-amber-300', cancelled: 'bg-rose-500/12 text-rose-300',
}
function StatusPill({ status }: { status?: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[String(status)] ?? 'bg-white/5 text-[var(--text-2)]'}`}>{status || '—'}</span>
}
function ModePill({ mode }: { mode?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-white/[.05] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: paymentColor(mode || 'cash', 0) }} aria-hidden />{paymentName(mode)}
    </span>
  )
}

const PAGE_SIZE = 8
const STATUSES = [{ id: '', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'returned', label: 'Returned' }, { id: 'cancelled', label: 'Cancelled' }]

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export default function RecentSales() {
  const navigate = useNavigate()
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1)
  const search = useDebounced(q.trim())
  useEffect(() => { setPage(1) }, [search, status])

  const { data, isLoading, isError } = useSales({ page, limit: PAGE_SIZE, ...(search && { search }), ...(status && { status }) })
  const rows = ((data?.data as any[]) ?? [])
  const pg = (data?.pagination as { total?: number; totalPages?: number } | undefined) ?? {}
  const total = Number(pg.total) || 0, pages = Math.max(1, Number(pg.totalPages) || 1)
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(page * PAGE_SIZE, total)
  const filtered = !!(search || status)
  const open = () => navigate(PATHS.SALES)

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]" aria-label="Recent sales">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3 md:px-5 md:pt-5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-[var(--text)]"><ShoppingCart size={16} className="text-[#60a5fa]" aria-hidden />Recent sales</h2>
        <button type="button" onClick={open} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[#93c5fd] transition-colors hover:bg-[var(--brand-light)]">View all<ArrowUpRight size={13} aria-hidden /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-5">
        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">Search invoices</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoice or customer"
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-9 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--brand)]" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--text-3)] hover:text-[var(--text)]"><X size={14} /></button>}
        </label>
        <div role="group" aria-label="Status filter" className="inline-flex rounded-lg bg-[var(--surface-2)] p-0.5">
          {STATUSES.map(s => (
            <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}
              className={`h-9 rounded-md px-2.5 text-xs font-semibold transition-colors ${status === s.id ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text)]'}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* table — md and up */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-[13px]">
          <thead>
            <tr className="border-y border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
              <th className="w-[19%] py-2.5 pl-5 pr-2 font-semibold">Invoice</th>
              <th className="py-2.5 pr-2 font-semibold">Customer</th>
              <th className="hidden w-[15%] py-2.5 pr-2 font-semibold lg:table-cell">Date</th>
              <th className="hidden w-[15%] py-2.5 pr-2 font-semibold lg:table-cell">Mode</th>
              <th className="w-[14%] py-2.5 pr-2 font-semibold">Status</th>
              <th className="w-[16%] py-2.5 pl-2 pr-5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--border)]"><td colSpan={6} className="px-5 py-3"><div className="h-5 animate-pulse rounded bg-[var(--surface-3)]" /></td></tr>
            )) : rows.map(s => (
              <tr key={s.id} onClick={open} className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-white/[.03]">
                <td className="truncate py-3 pl-5 pr-2 font-mono text-[12px] font-semibold text-[#93c5fd]">{s.invoice_no}</td>
                <td className="truncate py-3 pr-2 font-medium text-[var(--text)]" title={s.party_name || 'Walk-in'}>{s.party_name || <span className="text-[var(--text-3)]">Walk-in</span>}</td>
                <td className="hidden whitespace-nowrap py-3 pr-2 text-[var(--text-3)] lg:table-cell">{dateLabel(s.date_ad)}</td>
                <td className="hidden py-3 pr-2 lg:table-cell"><ModePill mode={s.payment_mode} /></td>
                <td className="py-3 pr-2"><StatusPill status={s.status} /></td>
                <td className="py-3 pl-2 pr-5 text-right font-semibold tabular-nums text-[var(--text)]">{fmt(s.net_total ?? s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* cards — below md */}
      <ul className="grid gap-2 px-4 pb-1 md:hidden">
        {isLoading ? [1, 2, 3].map(i => <li key={i} className="h-[78px] animate-pulse rounded-xl bg-[var(--surface-2)]" />) : rows.map(s => (
          <li key={s.id}>
            <button type="button" onClick={open} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition-colors active:bg-[var(--surface-3)]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] font-semibold text-[#93c5fd]">{s.invoice_no}</span>
                <b className="tabular-nums text-[var(--text)]">{fmt(s.net_total ?? s.total)}</b>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
                <span className="truncate">{s.party_name || 'Walk-in'}</span><span className="shrink-0">{dateLabel(s.date_ad)}</span>
              </div>
              <div className="mt-2 flex gap-1.5"><ModePill mode={s.payment_mode} /><StatusPill status={s.status} /></div>
            </button>
          </li>
        ))}
      </ul>

      {!isLoading && rows.length === 0 && (
        <div className="px-4 py-10 text-center md:px-5">
          <div className="text-sm font-semibold text-[var(--text-2)]">{isError ? 'Couldn’t load sales' : filtered ? 'No invoices match your search' : 'No sales yet'}</div>
          <div className="mt-1 text-xs text-[var(--text-3)]">{isError ? 'Check your connection and try again.' : filtered ? 'Try a different invoice number, customer or status.' : 'Create your first invoice to see it here.'}</div>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 md:px-5">
          <span className="text-xs tabular-nums text-[var(--text-3)]">{from}–{to} of {total}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors hover:border-[var(--border-2)] disabled:pointer-events-none disabled:opacity-35"><ChevronLeft size={16} /></button>
            <span className="min-w-[56px] text-center text-xs tabular-nums text-[var(--text-3)]">{page} / {pages}</span>
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors hover:border-[var(--border-2)] disabled:pointer-events-none disabled:opacity-35"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </section>
  )
}
