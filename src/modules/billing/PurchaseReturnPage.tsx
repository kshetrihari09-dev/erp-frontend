/**
 * PurchaseReturnPage.tsx — Purchase Return
 *
 * Route: /purchase-return, /purchase-returns   (unchanged)
 *
 *   - New Return  → PurchaseReturnBilling: the Purchase billing screen in reverse. Opens straight into supplier +
 *                   product entry; NO original bill is searched or picked. The server links each returned unit to
 *                   the supplier's real earlier bill (original rate, discount, VAT, batch) and only lets goods that
 *                   are still in stock go back.
 *   - All Returns → searchable / filterable / paginated list, view detail, print / reprint
 *
 * The page never decides money: pricing, tax, rounding, returnable quantity, stock check, settlement limits and
 * voucher numbers all come from the backend (services/purchaseReturnService.js).
 */
import { useState, useEffect, useRef } from 'react'
import { RotateCcw, FilePlus, List, Search, X, Printer, Eye } from 'lucide-react'
import { purchaseReturnsAPI, partiesAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Tabs, Badge, Pagination, SkeletonRows, Empty, Modal } from '@/components/ui'
import { DateRangeFilter } from '@/components/ui/DateRangePopup'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { formatDisplayDate } from '@/utils/dateSystem'
import { fmt } from '@/utils'
import PurchaseReturnBilling from './PurchaseReturnBilling'
import {
  type Settlement, type PurchaseReturnDetail as ReturnDetail, PSETTLE_LABEL as SETTLE_LABEL,
  num, d10, errMsg, purchaseSettlementText as settlementText, purchaseReturnToPrintData,
} from './purchaseReturnShared'

export { purchaseReturnToPrintData }

const LIMIT = 20
interface SupplierOpt { id: string; name: string; phone?: string; code?: string }

// ─── Searchable supplier picker (existing /parties/suppliers search) ─────────────
function SupplierPicker({ value, onChange }: { value: SupplierOpt | null; onChange: (c: SupplierOpt | null) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<SupplierOpt[]>([])
  const [busy, setBusy] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await partiesAPI.suppliers({ search: q || undefined, limit: 20 })
        if (live) setRows((r.data?.data ?? []) as unknown as SupplierOpt[])
      } catch { if (live) setRows([]) } finally { if (live) setBusy(false) }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q, open])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm">
        <span className="truncate font-medium">{value.name}{value.phone ? <span className="text-[var(--text-4)] font-normal"> · {value.phone}</span> : null}</span>
        <button type="button" aria-label="Clear supplier" onClick={() => onChange(null)} className="text-[var(--text-4)] hover:text-[var(--text)]"><X size={14} /></button>
      </div>
    )
  }
  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          placeholder="Search supplier by name, phone or code…" aria-label="Search supplier"
          className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm outline-none focus:border-brand" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {busy && <div className="px-3 py-2 text-xs text-[var(--text-4)]">Searching…</div>}
          {!busy && rows.length === 0 && <div className="px-3 py-2 text-xs text-[var(--text-4)]">No suppliers found</div>}
          {rows.map(c => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-3)] flex justify-between gap-2">
              <span className="truncate">{c.name}</span><span className="text-xs text-[var(--text-4)]">{c.phone ?? c.code ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const payBadge = (s: string) => <Badge status={s === 'paid' ? 'paid' : s === 'partial' ? 'partial' : 'unpaid'} />

// ─── New Return ──────────────────────────────────────────────────────────────────

function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return <div className={`flex justify-between ${cls ?? ''}`}><span className="text-[var(--text-3)]">{k}</span><span>{v}</span></div>
}

// ─── All Returns ─────────────────────────────────────────────────────────────────
interface ListRow {
  id: string; voucher_no: string; voucher_date: string; narration?: string; total_amount: number; status: string
  party_name?: string; party_id?: string; original_invoice_no?: string; purchase_return_id?: string | null
  settlement?: Settlement | null; refund_amount?: number | null
}

function AllReturns({ refreshKey }: { refreshKey: number }) {
  const { error } = useUIStore()
  const dateMode = useUIStore(s => s.dateMode)
  const [rows, setRows] = useState<ListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [dFrom, setDFrom] = useState('')
  const [dTo, setDTo] = useState('')
  const [supplier, setSupplier] = useState<SupplierOpt | null>(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState<{ row: ListRow; detail: ReturnDetail | null; loading: boolean } | null>(null)
  const [printData, setPrint] = useState<PrintData | null>(null)

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1) }, 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(1) }, [dFrom, dTo, supplier, status])

  useEffect(() => {
    let live = true
    setLoading(true)
    purchaseReturnsAPI.list({ page, limit: LIMIT, search: q || undefined, date_from: dFrom || undefined, date_to: dTo || undefined, party_id: supplier?.id, status: status || undefined })
      .then(r => { if (!live) return; setRows((r.data?.data ?? []) as ListRow[]); setTotal(r.data?.pagination?.total ?? 0) })
      .catch(e => { if (live) error(errMsg(e, 'Could not load returns')) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [page, q, dFrom, dTo, supplier, status, refreshKey, error])

  async function fetchDetail(row: ListRow): Promise<ReturnDetail | null> {
    if (!row.purchase_return_id) return null            // recorded before detailed tracking
    try { return (await purchaseReturnsAPI.detail(row.id)).data?.data as ReturnDetail } catch { return null }
  }
  async function openView(row: ListRow) {
    setView({ row, detail: null, loading: true })
    const d = await fetchDetail(row)
    setView({ row, detail: d, loading: false })
  }
  async function doPrint(row: ListRow) {
    const d = await fetchDetail(row)
    if (d) { setPrint(purchaseReturnToPrintData(d)); return }
    setPrint({   // older return: only the voucher summary exists
      voucherNo: row.voucher_no, type: 'PURCHASE_RETURN', date: d10(row.voucher_date), referenceNo: row.original_invoice_no,
      partyName: row.party_name, narration: row.narration || undefined, netTotal: num(row.total_amount),
    })
  }

  const actions = (r: ListRow) => (
    <div className="flex gap-1 justify-end">
      <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => openView(r)}>View</Button>
      <Button variant="ghost" size="sm" icon={<Printer size={13} />} onClick={() => doPrint(r)}>Print</Button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Return no., bill no., supplier…" aria-label="Search returns"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm outline-none focus:border-brand" />
        </div>
        <div className="md:col-span-2"><SupplierPicker value={supplier} onChange={setSupplier} /></div>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" className="h-9 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm">
          <option value="">All statuses</option><option value="POSTED">Posted</option><option value="REVERSED">Reversed</option><option value="DRAFT">Draft</option>
        </select>
        <div />
        <label className="text-xs text-[var(--text-3)] flex items-center gap-2 md:col-span-4">Date
          <DateRangeFilter fromAD={dFrom} toAD={dTo} emptyLabel="All dates"
            onApply={r => { setDFrom(r.fromAD); setDTo(r.toAD) }} onClear={() => { setDFrom(''); setDTo('') }} />
        </label>
        {(dFrom || dTo || supplier || status || search) && <div><Button variant="ghost" size="sm" onClick={() => { setDFrom(''); setDTo(''); setSupplier(null); setStatus(''); setSearch('') }}>Clear filters</Button></div>}
      </div>

      {/* desktop */}
      <div className="hidden md:block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-[var(--text-4)] text-left"><th className="px-3 py-2">Return No.</th><th>Date</th><th>Bill</th><th>Supplier</th><th>Settlement</th><th className="text-right">Credit</th><th>Status</th><th className="px-3" /></tr></thead>
          <tbody>
            {loading ? <SkeletonRows cols={8} /> : rows.length === 0 ? <tr><td colSpan={8}><Empty message="No purchase returns found" /></td></tr>
              : rows.map(r => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{r.voucher_no}</td><td>{formatDisplayDate(d10(r.voucher_date), dateMode)}</td>
                  <td>{r.original_invoice_no || '—'}</td><td>{r.party_name || 'No supplier'}</td>
                  <td className="text-xs text-[var(--text-3)]">{r.settlement ? SETTLE_LABEL[r.settlement] : '—'}</td>
                  <td className="text-right font-semibold">{fmt(r.total_amount)}</td><td><Badge status={(r.status ?? 'posted').toLowerCase()} /></td>
                  <td className="px-3">{actions(r)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* mobile */}
      <div className="md:hidden space-y-2">
        {loading ? <div className="text-center text-sm text-[var(--text-4)] py-6">Loading…</div> : rows.length === 0 ? <Empty message="No purchase returns found" />
          : rows.map(r => (
            <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-1">
              <div className="flex justify-between"><b>{r.voucher_no}</b><Badge status={(r.status ?? 'posted').toLowerCase()} /></div>
              <div className="text-xs text-[var(--text-3)]">{r.party_name || 'No supplier'} · Inv {r.original_invoice_no || '—'} · {formatDisplayDate(d10(r.voucher_date), dateMode)}</div>
              <div className="flex justify-between items-center"><span className="text-xs text-[var(--text-4)]">{r.settlement ? SETTLE_LABEL[r.settlement] : ''}</span><b>{fmt(r.total_amount)}</b></div>
              {actions(r)}
            </div>
          ))}
      </div>
      {total > LIMIT && <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />}

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Purchase return ${view.row.voucher_no}` : ''} size="lg"
        footer={view && <><Button variant="secondary" onClick={() => setView(null)}>Close</Button><Button variant="primary" icon={<Printer size={14} />} onClick={() => doPrint(view.row)}>Print</Button></>}>
        {view?.loading && <div className="text-sm text-[var(--text-4)]">Loading…</div>}
        {view && !view.loading && !view.detail && (
          <div className="text-sm space-y-1">
            <div>Bill <b>{view.row.original_invoice_no || '—'}</b> · {view.row.party_name || 'No supplier'} · {formatDisplayDate(d10(view.row.voucher_date), dateMode)}</div>
            <div>Credit <b>{fmt(view.row.total_amount)}</b></div>
            <div className="text-xs text-[var(--text-3)]">This return was recorded before line-level tracking, so only the voucher summary is available.</div>
          </div>
        )}
        {view?.detail && (
          <div className="text-sm space-y-3">
            <div>Bill <b>{view.detail.bill_no}</b> · {view.detail.party_name || 'No supplier'} · {formatDisplayDate(d10(view.detail.return_date), dateMode)}</div>
            <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {view.detail.items.map(i => (
                <div key={i.id} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{i.product_name} <span className="text-[var(--text-4)]">· {i.batch_no || '—'}</span></span><span className="whitespace-nowrap">{num(i.qty)} × {fmt(i.rate)} → <b>{fmt(i.net_amount)}</b></span></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-[var(--text-3)]">
              <span>Goods {fmt(view.detail.goods_amount)}</span><span>Discount reversed {fmt(view.detail.discount_amount)}</span>
              <span>VAT {fmt(view.detail.tax_amount)}</span><span>Round off {fmt(view.detail.round_off)}</span>
            </div>
            <div className="flex justify-between text-base font-bold"><span>Net credit</span><span>{fmt(view.detail.net_credit)}</span></div>
            <div className="text-xs text-[var(--text-3)]">{settlementText(view.detail)}{view.detail.refund_voucher_no ? ` · Refund voucher ${view.detail.refund_voucher_no}` : ''}</div>
            {view.detail.narration && <div className="text-xs">Narration: {view.detail.narration}</div>}
          </div>
        )}
      </Modal>
      <PrintPreviewModal data={printData} open={!!printData} onClose={() => setPrint(null)} />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────────
export default function PurchaseReturnPage() {
  const [tab, setTab] = useState('new')
  const [refreshKey, setRefreshKey] = useState(0)
  const theme = useUIStore(s => s.theme)
  return (
    // same shell as the Purchase/Sales pages: pos-theme + sales-two-step give the identical look on desktop and phone
    <div className={`pos-theme sales-two-step ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Purchase Return</h1>
        </div>
      </div>
      <Tabs tabs={[{ id: 'new', label: 'New Return', icon: <FilePlus size={14} /> }, { id: 'all', label: 'All Returns', icon: <List size={14} /> }]} active={tab} onChange={setTab} />
      <div hidden={tab !== 'new'}><PurchaseReturnBilling active={tab === 'new'} onPosted={() => setRefreshKey(k => k + 1)} /></div>
      {tab === 'all' && <AllReturns refreshKey={refreshKey} />}
    </div>
  )
}
