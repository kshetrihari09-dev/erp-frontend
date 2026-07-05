import { useState, useEffect, useCallback } from 'react'
import {
  RotateCcw, FilePlus, List, Search, X,
  CheckCircle2, AlertCircle, Printer, ArrowDownLeft,
} from 'lucide-react'
import { purchaseReturnsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Badge, Pagination,
  SkeletonRows, Empty, Modal,
} from '@/components/ui'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { fmt, fmtDate, today } from '@/utils'

const LIMIT = 20

// ─── Flash ────────────────────────────────────────────────────────────────────
function Flash({ type, msg, onClose }: { type: 'success'|'danger'; msg: string; onClose: () => void }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium mb-4 ${
      type === 'success'
        ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300'
        : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
    }`}>
      {type === 'success'
        ? <CheckCircle2 size={16} className="text-green-500 shrink-0" />
        : <AlertCircle  size={16} className="text-red-500 shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1">{children}</label>
}

// ─── Bill search modal ────────────────────────────────────────────────────────
interface BillSearchModalProps {
  open:     boolean
  onClose:  () => void
  onSelect: (purchase: any) => void
}

function BillSearchModal({ open, onClose, onSelect }: BillSearchModalProps) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (query: string) => {
    setLoading(true)
    try {
      const r = await purchaseReturnsAPI.listPurchases({ search: query, limit: 20, status: 'active' })
      setResults(r.data?.data ?? [])
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => search(q), 350)
    return () => clearTimeout(t)
  }, [q, open, search])

  useEffect(() => { if (open) { setQ(''); search('') } }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Select Original Purchase Bill" size="lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            className="erp-input pl-8 w-full"
            placeholder="Search by bill no, supplier name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] hover:text-[var(--text)]">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="border border-[var(--border)] rounded-xl max-h-80 overflow-y-auto overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-[var(--text-3)]">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-3)]">No purchase bills found</div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="td-right">Amount</th>
                  <th>Mode</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-[var(--surface-2)]" onClick={() => { onSelect(p); onClose() }}>
                    <td className="td-mono text-brand">{p.bill_no}</td>
                    <td className="td-mono">{fmtDate(p.date_ad)}</td>
                    <td>{p.party_name ?? '—'}</td>
                    <td className="td-right">{fmt(p.net_total)}</td>
                    <td><Badge status={p.payment_mode} /></td>
                    <td>
                      <Button variant="primary" size="sm">Select</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Return item row type ─────────────────────────────────────────────────────
interface ReturnItem {
  product_id:   string
  product_name: string
  original_qty: number
  qty:          number
  rate:         number
  batch_no:     string
  expiry:       string
  amount:       number
  error?:       string
}

// ─── New Purchase Return Form ─────────────────────────────────────────────────
function NewReturnForm() {
  const { success, error } = useUIStore()

  const [showSearch,       setShowSearch]       = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null)
  const [items,            setItems]            = useState<ReturnItem[]>([])
  const [dateAd,           setDateAd]           = useState(today())
  const [narration,        setNarration]        = useState('')
  const [saving,           setSaving]           = useState(false)
  const [flash,            setFlash]            = useState<{type:'success'|'danger'; msg:string}|null>(null)
  const [printData,        setPrintData]        = useState<PrintData|null>(null)
  const [loadingItems,     setLoadingItems]     = useState(false)

  const handlePurchaseSelect = useCallback(async (purchase: any) => {
    setSelectedPurchase(purchase)
    setLoadingItems(true)
    try {
      const r              = await purchaseReturnsAPI.getPurchase(purchase.id)
      const purchaseDetail = r.data?.data ?? purchase
      const purchaseItems  = purchaseDetail.items ?? []
      setItems(purchaseItems.map((i: any) => ({
        product_id:   i.product_id,
        product_name: i.product_name ?? i.name ?? 'Unknown',
        original_qty: Number(i.qty) || 0,
        qty:          0,
        rate:         Number(i.rate) || 0,
        batch_no:     i.batch_no ?? '',
        expiry:       i.expiry   ?? '',
        amount:       0,
        error:        undefined,
      })))
    } catch {
      error('Failed to load purchase items')
      setItems([])
    }
    finally { setLoadingItems(false) }
  }, [error])

  const clearPurchase = () => { setSelectedPurchase(null); setItems([]) }

  const updateQty = (idx: number, val: string) => {
    const qty = Number(val) || 0
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const err = qty > it.original_qty
        ? `Max returnable: ${it.original_qty}`
        : qty < 0 ? 'Cannot be negative' : undefined
      return { ...it, qty, amount: qty * it.rate, error: err }
    }))
  }

  const totalAmount = items.reduce((s, i) => s + i.amount, 0)
  const hasItems    = items.some(i => i.qty > 0)
  const hasErrors   = items.some(i => !!i.error)

  const handleSubmit = async () => {
    if (!hasItems) { setFlash({ type: 'danger', msg: 'Enter at least one return quantity' }); return }
    if (hasErrors)  { setFlash({ type: 'danger', msg: 'Fix quantity errors before saving' }); return }

    setSaving(true)
    try {
      const payload = {
        purchase_id: selectedPurchase?.id,
        party_id:    selectedPurchase?.party_id,
        date_ad:     dateAd,
        narration:   narration || `Purchase Return — ${selectedPurchase?.bill_no ?? 'Manual'}`,
        items: items
          .filter(i => i.qty > 0)
          .map(i => ({ product_id: i.product_id, qty: i.qty, rate: i.rate, batch_no: i.batch_no })),
      }
      const r    = await purchaseReturnsAPI.create(payload)
      const data = r.data?.data ?? {}

      setFlash({ type: 'success', msg: `Purchase return saved${data.accounting?.voucher_no ? ` — ${data.accounting.voucher_no}` : ''}` })
      success('Purchase return recorded')

      setPrintData({
        voucherNo:   data.accounting?.voucher_no ?? `PR-${Date.now()}`,
        type:        'PURCHASE_RETURN',
        date:        dateAd,
        referenceNo: selectedPurchase?.bill_no,
        partyName:   selectedPurchase?.party_name,
        narration:   narration || undefined,
        netTotal:    totalAmount,
        items: items.filter(i => i.qty > 0).map(i => ({
          product_name: i.product_name,
          batch_no:     i.batch_no || undefined,
          expiry:       i.expiry   || undefined,
          qty:          i.qty,
          rate:         i.rate,
          amount:       i.amount,
        })),
      })

      clearPurchase()
      setNarration('')
      setDateAd(today())
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Failed to save return'
      setFlash({ type: 'danger', msg })
    } finally { setSaving(false) }
  }

  return (
    <div>
      {flash && <Flash type={flash.type} msg={flash.msg} onClose={() => setFlash(null)} />}

      {/* ── Bill selector ──────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
        <div className="pr-selector-head flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Original Purchase Bill</h3>
          {!selectedPurchase && (
            <Button variant="outline" size="sm" icon={<Search size={13}/>} onClick={() => setShowSearch(true)}>
              Search Bill
            </Button>
          )}
          {selectedPurchase && (
            <Button variant="danger" size="sm" icon={<X size={13}/>} onClick={clearPurchase}>
              Clear
            </Button>
          )}
        </div>

        {selectedPurchase ? (
          <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div>
              <p className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Bill No</p>
              <p className="font-mono font-bold text-brand">{selectedPurchase.bill_no}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Supplier</p>
              <p className="font-medium">{selectedPurchase.party_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Date</p>
              <p className="font-mono">{fmtDate(selectedPurchase.date_ad)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Original Amount</p>
              <p className="font-semibold">{fmt(selectedPurchase.net_total)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Payment</p>
              <Badge status={selectedPurchase.payment_mode} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-[var(--text-3)]">
            <Search size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Search and select the original purchase bill to create a return</p>
          </div>
        )}
      </div>

      {/* ── Return items table ─────────────────────────────────────────────── */}
      {selectedPurchase && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-4 shadow-card overflow-hidden">
          <div className="pr-table-head px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-1">
            <h3 className="text-sm font-semibold">Return Items</h3>
            <p className="text-xs text-[var(--text-3)]">Enter quantities to return to supplier (max = original purchased quantity)</p>
          </div>

          {loadingItems ? (
            <div className="p-6 text-center text-sm text-[var(--text-3)]">Loading items…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-3)]">No items found for this bill</div>
          ) : (
            <>
              {/* Desktop / tablet: table (unchanged) */}
              <div className="pr-desktop-table overflow-x-auto">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Batch / Expiry</th>
                      <th className="td-right">Purchased Qty</th>
                      <th className="td-right" style={{ width: 120 }}>Return Qty</th>
                      <th className="td-right">Rate</th>
                      <th className="td-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className={item.error ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                        <td className="font-medium">{item.product_name}</td>
                        <td className="td-mono text-[var(--text-3)]">
                          {item.batch_no || '—'}
                          {item.expiry && <span className="ml-1 text-xs">({item.expiry})</span>}
                        </td>
                        <td className="td-right font-mono">{item.original_qty}</td>
                        <td className="td-right">
                          <div className="flex flex-col items-end gap-1">
                            <input
                              type="number"
                              min={0}
                              max={item.original_qty}
                              value={item.qty || ''}
                              onChange={e => updateQty(idx, e.target.value)}
                              placeholder="0"
                              className={`erp-input text-right w-24 ${item.error ? 'border-red-400' : ''}`}
                            />
                            {item.error && (
                              <span className="text-[10px] text-red-500">{item.error}</span>
                            )}
                          </div>
                        </td>
                        <td className="td-right font-mono">{fmt(item.rate)}</td>
                        <td className="td-right font-mono font-semibold">
                          {item.qty > 0 ? fmt(item.amount) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-2)]">
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold text-sm">Total Return Amount</td>
                      <td className="px-3 py-2 text-right font-bold text-brand font-mono">{fmt(totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile: touch-friendly cards, same data + same updateQty handler */}
              <div className="pr-mobile-list">
                {items.map((item, idx) => (
                  <div key={idx} className={`pr-item-card${item.error ? ' has-error' : ''}`}>
                    <div className="pr-item-top">
                      <span className="pr-item-name">{item.product_name}</span>
                      <span className="pr-item-meta">
                        {item.batch_no || '—'}{item.expiry ? ` (${item.expiry})` : ''}
                      </span>
                    </div>
                    <div className="pr-item-grid">
                      <div>
                        <div className="pr-item-stat-label">Purchased Qty</div>
                        <div className="pr-item-stat-value">{item.original_qty}</div>
                      </div>
                      <div>
                        <div className="pr-item-stat-label">Rate</div>
                        <div className="pr-item-stat-value">{fmt(item.rate)}</div>
                      </div>
                      <div className="span2">
                        <div className="pr-item-stat-label">Return Qty</div>
                        <input
                          type="number"
                          min={0}
                          max={item.original_qty}
                          value={item.qty || ''}
                          onChange={e => updateQty(idx, e.target.value)}
                          placeholder="0"
                          className={`erp-input pr-item-qty-input ${item.error ? 'border-red-400' : ''}`}
                        />
                        {item.error && (
                          <span className="text-[10px] text-red-500">{item.error}</span>
                        )}
                      </div>
                    </div>
                    <div className="pr-item-amount-row">
                      <span className="text-[var(--text-3)]">Amount</span>
                      <b>{item.qty > 0 ? fmt(item.amount) : '—'}</b>
                    </div>
                  </div>
                ))}
                <div className="pr-item-amount-row" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', border: 'none' }}>
                  <span className="font-semibold">Total Return Amount</span>
                  <b style={{ fontSize: 15 }}>{fmt(totalAmount)}</b>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Form fields ────────────────────────────────────────────────────── */}
      {selectedPurchase && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
          <div className="form-grid">
            <div>
              <Label>Return Date</Label>
              <input type="date" className="erp-input w-full" value={dateAd} onChange={e => setDateAd(e.target.value)} />
            </div>
            <div>
              <Label>Narration (optional)</Label>
              <input
                className="erp-input w-full"
                placeholder={`Purchase Return — ${selectedPurchase.bill_no}`}
                value={narration}
                onChange={e => setNarration(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      {selectedPurchase && (
        <div className="pr-action-bar flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-[var(--text-3)]">
            {hasItems
              ? <span className="text-green-600 font-medium flex items-center gap-1.5"><CheckCircle2 size={14}/> {items.filter(i=>i.qty>0).length} item(s) to return • {fmt(totalAmount)}</span>
              : 'Enter return quantities above'
            }
          </div>
          <div className="pr-action-buttons flex gap-2">
            <Button variant="secondary" onClick={clearPurchase}>Cancel</Button>
            <Button
              variant="primary"
              icon={<ArrowDownLeft size={14}/>}
              loading={saving}
              disabled={!hasItems || hasErrors}
              onClick={handleSubmit}
            >
              Save Purchase Return
            </Button>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <BillSearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={handlePurchaseSelect}
      />
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  )
}

// ─── Returns List ─────────────────────────────────────────────────────────────
function ReturnsList() {
  const [list,      setList]    = useState<any[]>([])
  const [total,     setTotal]   = useState(0)
  const [page,      setPage]    = useState(1)
  const [loading,   setLoading] = useState(false)
  const [printData, setPrint]   = useState<PrintData|null>(null)
  const { error }               = useUIStore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r    = await purchaseReturnsAPI.list({ page, limit: LIMIT })
      const body = r.data
      setList(body?.data ?? [])
      setTotal(body?.pagination?.total ?? body?.total ?? 0)
    } catch { error('Failed to load returns') }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="table-card">
        {/* Desktop / tablet: table (unchanged) */}
        <div className="pr-desktop-table overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Return No</th>
                <th>Date</th>
                <th>Original Bill</th>
                <th>Supplier</th>
                <th className="td-right">Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={7} />
              ) : list.length === 0 ? (
                <tr><td colSpan={7}><Empty message="No purchase returns yet" /></td></tr>
              ) : list.map(r => (
                <tr key={r.id}>
                  <td className="td-mono text-brand">{r.voucher_no}</td>
                  <td className="td-mono">{fmtDate(r.voucher_date)}</td>
                  <td className="td-mono text-[var(--text-2)]">{r.reference_no ?? '—'}</td>
                  <td>{r.party_name ?? '—'}</td>
                  <td className="td-right font-mono">{fmt(r.total_amount)}</td>
                  <td><Badge status={(r.status ?? 'posted').toLowerCase()} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <Button
                      variant="secondary" size="sm"
                      icon={<Printer size={12}/>}
                      onClick={() => setPrint({
                        voucherNo:   r.voucher_no,
                        type:        'PURCHASE_RETURN',
                        date:        r.voucher_date,
                        referenceNo: r.reference_no ?? undefined,
                        partyName:   r.party_name   ?? undefined,
                        narration:   r.narration    ?? undefined,
                        netTotal:    Number(r.total_amount) || 0,
                      })}
                    >Print</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: touch-friendly cards, same data + same print handler */}
        <div className="pr-mobile-list">
          {loading ? (
            <div className="acc-mobile-skel-wrap">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="acc-mobile-card-skel" />)}
            </div>
          ) : list.length === 0 ? (
            <Empty message="No purchase returns yet" />
          ) : list.map(r => (
            <div key={r.id} className="pr-hist-card">
              <div className="pr-hist-top">
                <span className="pr-hist-no">{r.voucher_no}</span>
                <span className="pr-hist-amount">{fmt(r.total_amount)}</span>
              </div>
              <div className="pr-hist-sub">
                <span className="pr-hist-party">{r.party_name ?? '—'}</span>
                <span className="pr-hist-date">{fmtDate(r.voucher_date)}</span>
              </div>
              <div className="pr-hist-sub">
                <span className="text-xs text-[var(--text-3)]">Ref: {r.reference_no ?? '—'}</span>
                <Badge status={(r.status ?? 'posted').toLowerCase()} />
              </div>
              <div className="pr-hist-actions">
                <span />
                <Button
                  variant="secondary" size="sm"
                  icon={<Printer size={12}/>}
                  onClick={() => setPrint({
                    voucherNo:   r.voucher_no,
                    type:        'PURCHASE_RETURN',
                    date:        r.voucher_date,
                    referenceNo: r.reference_no ?? undefined,
                    partyName:   r.party_name   ?? undefined,
                    narration:   r.narration    ?? undefined,
                    netTotal:    Number(r.total_amount) || 0,
                  })}
                >Print</Button>
              </div>
            </div>
          ))}
        </div>

        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
      <PrintPreviewModal data={printData} open={!!printData} onClose={() => setPrint(null)} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PurchaseReturnPage() {
  const [tab, setTab] = useState('new')
  const tabs = [
    { id: 'new',  label: 'New Return',  icon: <FilePlus     size={14}/> },
    { id: 'list', label: 'All Returns', icon: <List         size={14}/> },
  ]

  return (
    <div className="pr-page">
      <style>{`
        /* ── Purchase Return — mobile/tablet responsive (self-contained, additive) ── */
        .pr-page { max-width: 100%; overflow-x: hidden; }

        @media (min-width: 768px) and (max-width: 1024px) {
          .pr-desktop-table { overflow-x: auto; }
          .pr-desktop-table table { min-width: 640px; font-size: 12.5px; }
        }

        @media (max-width: 767px) {
          .pr-page .h-7, .pr-page .h-8, .pr-page .h-10 {
            min-height: 44px !important; height: auto !important;
            padding-top: 8px !important; padding-bottom: 8px !important;
          }
          .pr-page .erp-table { min-width: 520px; }

          .pr-selector-head { flex-wrap: wrap; row-gap: 8px; }
          .pr-selector-head > button { width: 100%; justify-content: center; }

          .pr-table-head { flex-wrap: wrap; row-gap: 4px; }

          .pr-action-bar { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
          .pr-action-buttons { width: 100%; display: flex; gap: 8px; }
          .pr-action-buttons button { flex: 1; justify-content: center; }

          .pr-desktop-table { display: none !important; }
          .pr-mobile-list   { display: flex !important; flex-direction: column; gap: 10px; padding: 4px 2px; }

          .pr-item-card {
            background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px;
            padding: 12px; display: flex; flex-direction: column; gap: 10px;
          }
          .pr-item-card.has-error { border-color: #f87171; }
          .pr-item-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
          .pr-item-name { font-weight: 600; font-size: 13px; color: var(--text); }
          .pr-item-meta { font-size: 11px; color: var(--text-3); font-family: var(--font-mono, monospace); flex-shrink: 0; text-align: right; }
          .pr-item-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .pr-item-grid .span2 { grid-column: span 2; }
          .pr-item-stat-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
          .pr-item-stat-value { font-size: 13px; font-weight: 600; color: var(--text); font-family: var(--font-mono, monospace); }
          .pr-item-qty-input { width: 100%; min-height: 44px; box-sizing: border-box; }
          .pr-item-amount-row { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border); font-size: 13px; }
          .pr-item-amount-row b { font-family: var(--font-mono, monospace); color: var(--brand); }

          .pr-hist-card {
            background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px;
            padding: 11px 13px; display: flex; flex-direction: column; gap: 6px;
          }
          .pr-hist-top, .pr-hist-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
          .pr-hist-no { font-family: var(--font-mono, monospace); font-size: 12.5px; font-weight: 700; color: var(--brand); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .pr-hist-amount { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 800; color: var(--text); flex-shrink: 0; }
          .pr-hist-party { font-size: 12.5px; font-weight: 500; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
          .pr-hist-date { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-3); flex-shrink: 0; }
          .pr-hist-actions { display: flex; gap: 7px; padding-top: 7px; border-top: 1px solid var(--border); align-items: center; justify-content: space-between; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Purchase Returns</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownLeft size={15} className="text-[var(--text-3)]" />
          <span className="text-xs text-[var(--text-3)]">Debit Note</span>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === 'new'  && <NewReturnForm />}
        {tab === 'list' && <ReturnsList  />}
      </div>
    </div>
  )
}
