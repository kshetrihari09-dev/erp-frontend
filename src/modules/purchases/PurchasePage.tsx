import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { FilePlus, List, Printer } from 'lucide-react'
import ScanButton from '@/components/scanner/ScanButton'
import type { ScanResult } from '@/types/scanner'
import { purchasesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Tabs, Modal, Badge, Pagination, SkeletonRows, Alert, Empty, SearchInput, ConfirmDialog } from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import { fmt, fmtDate, calcInvoiceTotals } from '@/utils'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Purchase } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'

const LIMIT = 20

export default function PurchasePage() {
  const { error } = useUIStore()
  const [tab, setTab] = useState('new')

  const [suppliers, setSuppliers] = useState<Party[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [rows,      setRows]      = useState<InvoiceRow[]>([newRow()])
  const [saving,    setSaving]    = useState(false)
  const [flash,     setFlash]     = useState<{ type: 'success'|'danger'; msg: string } | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [detailId,  setDetailId]  = useState<string | null>(null)
  const [detail,    setDetail]    = useState<Purchase | null>(null)
  const [confirmCreate, setConfirmCreate] = useState(false)

  // ── Scanner: receive product from phone, inject as new purchase row ────────
  const handleScanResult = useCallback((result: ScanResult) => {
    const p   = result.product
    const row = newRow()
    row.product_id   = p.id
    row.product_name = p.name
    row.rate         = p.purchase_rate   // purchase rate, not sales rate
    if (p.batches?.length) {
      row.batch_no = p.batches[0].batch_no   || ''
      row.expiry   = p.batches[0].expiry_date || ''
    }
    setRows(prev => {
      const last = prev[prev.length - 1]
      if (last && !last.product_id) return [...prev.slice(0, -1), row]
      return [...prev, row]
    })
    setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p as any])
  }, [])

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      supplier_id: '', date: new Date().toISOString().split('T')[0],
      payment_mode: 'credit', supplier_bill_no: '', notes: '',
    },
  })

  useEffect(() => {
    partiesAPI.suppliers({ limit: 500 }).then(r => setSuppliers(r.data.data || [])).catch(() => {})
    productsAPI.list({ limit: 500 }).then(r => setProducts(r.data.data || [])).catch(() => {})
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await purchasesAPI.list({ page, limit: LIMIT, search: search || undefined })
      setPurchases(r.data.data || []); setTotal(r.data.pagination?.total || 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    purchasesAPI.get(detailId).then(r => setDetail(r.data.data)).catch(() => setDetail(null))
  }, [detailId])

  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    setSaving(true); setFlash(null)
    try {
      const res = await purchasesAPI.create({
        party_id:         data.supplier_id || undefined,
        date_ad:          data.date,
        payment_mode:     data.payment_mode,
        supplier_bill_no: data.supplier_bill_no || undefined,
        items:            validRows.map(r => ({
          product_id: r.product_id, product_name: r.product_name,
          batch_no: r.batch_no || undefined, expiry: r.expiry || undefined,
          qty: Number(r.qty), bonus: Number(r.bonus) || 0,
          rate: Number(r.rate), vat_pct: Number(r.vat_pct) || 13,
          amount: r.amount,
        })),
      })
      const saved = res.data.data
      setPrintData({
        voucherNo:   saved.bill_no,
        type:        'PURCHASE',
        date:        saved.date_ad || data.date,
        paymentMode: saved.payment_mode,
        partyName:   suppliers.find((s: any) => s.id === data.supplier_id)?.name,
        narration:   data.supplier_bill_no ? `Supplier Bill: ${data.supplier_bill_no}` : undefined,
        items:       validRows.map(r => ({
          product_name: r.product_name,
          batch_no:     r.batch_no, expiry: r.expiry,
          qty:    Number(r.qty), bonus: Number(r.bonus) || 0,
          rate:   Number(r.rate), amount: Number(r.amount),
        })),
        netTotal:    saved.net_total,
        paidAmount:  saved.paid_amount,
        dueAmount:   saved.due_amount,
      })
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  const tabList = [
    { id: 'new',  label: 'New Purchase', icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Purchases', icon: <List size={14}/> },
  ]

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">Transactions</div><h1 className="page-title">Purchase</h1></div>
      </div>
      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {tab === 'new' && (
        <div>
          {flash && <Alert type={flash.type === 'success' ? 'success' : 'danger'} message={flash.msg} onClose={() => setFlash(null)} />}
          
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
            <div className="form-grid">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Supplier</label>
                <select className="erp-input" {...register('supplier_id')}>
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date</label>
                <input type="date" className="erp-input" {...register('date')} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Payment</label>
                <select className="erp-input" {...register('payment_mode')}>
                  {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Supplier Bill No</label>
                <input className="erp-input" placeholder="Supplier's bill number" {...register('supplier_bill_no')} />
              </div>
            </div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm text-[var(--text)]">Purchase Items</div>
              <ScanButton context="purchase" onResult={handleScanResult} />
            </div>
            <InvoiceRowsTable rows={rows} products={products} onChange={setRows} showCC={false} showDiscount={false} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="lg" loading={saving} onClick={() => {
              const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
              if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
              setConfirmCreate(true)
            }}>
              <FilePlus size={15}/> Create Purchase
            </Button>
          </div>
        </div>
      )}

      {tab === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="w-64" />
          </div>
          <div className="table-card">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead><tr><th>Bill No</th><th>Date</th><th>Supplier</th><th className="td-right">Total</th><th className="td-right">Paid</th><th className="td-right">Due</th><th>Mode</th><th>Status</th><th>Posted</th></tr></thead>
                <tbody>
                  {loading
                    ? <SkeletonRows cols={8} />
                    : purchases.length
                      ? purchases.map(p => (
                          <tr key={p.id} className="clickable" onClick={() => setDetailId(p.id)}>
                            <td className="td-mono text-brand">{p.bill_no}</td>
                            <td className="td-mono">{fmtDate(p.date_ad)}</td>
                            <td>{p.party_name || '—'}</td>
                            <td className="td-right">{fmt(p.net_total)}</td>
                            <td className="td-right text-green-700">{fmt(p.paid_amount)}</td>
                            <td className={`td-right ${Number(p.due_amount) > 0 ? 'text-amber-600' : ''}`}>{fmt(p.due_amount)}</td>
                            <td><Badge status={p.payment_mode}/></td>
                            <td><Badge status={p.status || 'active'}/></td>
                            <td onClick={e => e.stopPropagation()}>
                              <PostingStatusBadge sourceType="PURCHASE" sourceId={p.id} compact />
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <Button variant="secondary" size="sm" icon={<Printer size={12}/>}
                                onClick={async () => {
                                  const full = await purchasesAPI.get(p.id).then(r => r.data.data).catch(() => null)
                                  const src  = full ?? p
                                  setPrintData({
                                    voucherNo:   src.bill_no,
                                    type:        'PURCHASE',
                                    date:        src.date_ad,
                                    paymentMode: src.payment_mode,
                                    partyName:   src.party_name || '—',
                                    items: (src.items || []).map((it: any) => ({
                                      product_name: it.product_name,
                                      batch_no:     it.batch_no,
                                      expiry:       it.expiry,
                                      qty:          Number(it.qty),
                                      bonus:        Number(it.bonus) || 0,
                                      rate:         Number(it.rate),
                                      amount:       Number(it.amount),
                                    })),
                                    netTotal:    Number(src.net_total),
                                    paidAmount:  Number(src.paid_amount),
                                    dueAmount:   Number(src.due_amount),
                                  })
                                }}
                              >Print</Button>
                            </td>
                          </tr>
                        ))
                      : <tr><td colSpan={9}><Empty message="No purchases found"/></td></tr>
                  }
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
          </div>
        </div>
      )}

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detail ? `Purchase: ${detail.bill_no}` : 'Loading…'} size="lg"
        footer={detail && (
          <Button variant="primary" size="sm" icon={<Printer size={13}/>}
            onClick={() => {
              const d = detail
              setDetailId(null)
              setTimeout(() => setPrintData({
                voucherNo:   d.bill_no,
                type:        'PURCHASE',
                date:        d.date_ad,
                paymentMode: d.payment_mode,
                partyName:   d.party_name || '—',
                items: (d.items || []).map((it: any) => ({
                  product_name: it.product_name, batch_no: it.batch_no,
                  expiry: it.expiry, qty: Number(it.qty),
                  bonus: Number(it.bonus)||0, rate: Number(it.rate),
                  amount: Number(it.amount),
                })),
                netTotal:   Number(d.net_total),
                paidAmount: Number(d.paid_amount),
                dueAmount:  Number(d.due_amount),
              }), 50)
            }}>Print Bill</Button>
        )}
      >
        {detail && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[['Supplier', detail.party_name || '—'], ['Date', fmtDate(detail.date_ad)], ['Net Total', fmt(detail.net_total)], ['Paid', fmt(detail.paid_amount)], ['Due', fmt(detail.due_amount)]].map(([l, v], i) => (
                <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">{l}</div>
                  <div className="font-semibold text-sm">{v}</div>
                </div>
              ))}
            </div>
            <div className="table-card">
              <table className="erp-table items-table">
                <thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th className="td-right">Qty</th><th className="td-right">Bonus</th><th className="td-right">Rate</th><th className="td-right">Amount</th></tr></thead>
                <tbody>
                  {(detail.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.product_name}</td>
                      <td className="td-mono">{it.batch_no || '—'}</td>
                      <td className="td-mono">{it.expiry || '—'}</td>
                      <td className="td-right">{it.qty}</td>
                      <td className="td-right">{it.bonus || 0}</td>
                      <td className="td-right">{fmt(it.rate)}</td>
                      <td className="td-right font-semibold">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        onConfirm={onSubmit}
        title="Create Purchase"
        message="Are you sure you want to create this purchase? This will update your inventory and accounts."
      />
      <PrintPreviewModal
            data={printData}
            open={!!printData}
            onClose={() => setPrintData(null)}
            onNextBill={() => { setPrintData(null); reset(); setRows([newRow()]) }}
          />
    </div>
  )
}
