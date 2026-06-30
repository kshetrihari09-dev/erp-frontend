import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { FilePlus, List, Printer, ChevronDown, Plus } from 'lucide-react'
import ScanButton from '@/components/scanner/ScanButton'
import type { ScanResult } from '@/types/scanner'
import { purchasesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Modal, Badge, Pagination,
  SkeletonRows, Alert, Empty, SearchInput, ConfirmDialog,
} from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import ProductSearchCell from '@/components/forms/ProductSearchCell'
import { fmt, fmtDate, calcRowAmount } from '@/utils'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Purchase } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'

const LIMIT = 20

export default function PurchasePage() {
  const { error, theme } = useUIStore()
  const [tab, setTab] = useState('new')

  const [suppliers,  setSuppliers]  = useState<Party[]>([])
  const [products,   setProducts]   = useState<Product[]>([])
  const [purchases,  setPurchases]  = useState<Purchase[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [rows,       setRows]       = useState<InvoiceRow[]>([newRow()])
  const [saving,     setSaving]     = useState(false)
  const [flash,      setFlash]      = useState<{ type: 'success' | 'danger'; msg: string } | null>(null)
  const [printData,  setPrintData]  = useState<PrintData | null>(null)
  const [detailId,   setDetailId]   = useState<string | null>(null)
  const [detail,     setDetail]     = useState<Purchase | null>(null)
  const [confirmCreate, setConfirmCreate] = useState(false)

  // Mobile: which rows have Batch/Expiry expanded
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // ── Scanner ───────────────────────────────────────────────────────────
  const handleScanResult = useCallback((result: ScanResult) => {
    const p   = result.product
    const row = newRow()
    row.product_id   = p.id
    row.product_name = p.name
    row.rate         = p.purchase_rate
    if (p.batches?.length) {
      row.batch_no = p.batches[0].batch_no    || ''
      row.expiry   = p.batches[0].expiry_date || ''
    }
    setRows(prev => {
      const last = prev[prev.length - 1]
      if (last && !last.product_id) return [...prev.slice(0, -1), row]
      return [...prev, row]
    })
    setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p as any])
  }, [])

  const { register, handleSubmit, reset, watch } = useForm({
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
      setPurchases(r.data.data || [])
      setTotal(r.data.pagination?.total || 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    purchasesAPI.get(detailId).then(r => setDetail(r.data.data)).catch(() => setDetail(null))
  }, [detailId])

  // Subtotal for mobile sticky bar
  const subtotal = rows.reduce((s, r) => s + r.amount, 0)

  // ── Submit ────────────────────────────────────────────────────────────
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
        items: validRows.map(r => ({
          product_id:  r.product_id,
          product_name: r.product_name,
          batch_no:    r.batch_no  || undefined,
          expiry:      r.expiry    || undefined,
          qty:         Number(r.qty),
          bonus:       Number(r.bonus)   || 0,
          rate:        Number(r.rate),
          vat_pct:     Number(r.vat_pct) || 13,
          amount:      r.amount,
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
        items: validRows.map(r => ({
          product_name: r.product_name, batch_no: r.batch_no, expiry: r.expiry,
          qty: Number(r.qty), bonus: Number(r.bonus) || 0,
          rate: Number(r.rate), amount: Number(r.amount),
        })),
        netTotal:   saved.net_total,
        paidAmount: saved.paid_amount,
        dueAmount:  saved.due_amount,
      })
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  function handleCreateClick() {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    setConfirmCreate(true)
  }

  const tabList = [
    { id: 'new',  label: 'New Purchase',  icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Purchases', icon: <List    size={14}/> },
  ]

  // Helper to print from list row
  async function handleListPrint(p: Purchase) {
    const full = await purchasesAPI.get(p.id).then(r => r.data.data).catch(() => null)
    const src  = full ?? p
    setPrintData({
      voucherNo:   src.bill_no,
      type:        'PURCHASE',
      date:        src.date_ad,
      paymentMode: src.payment_mode,
      partyName:   src.party_name || '—',
      items: (src.items || []).map((it: any) => ({
        product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
        qty: Number(it.qty), bonus: Number(it.bonus) || 0,
        rate: Number(it.rate), amount: Number(it.amount),
      })),
      netTotal:   Number(src.net_total),
      paidAmount: Number(src.paid_amount),
      dueAmount:  Number(src.due_amount),
    })
  }

  return (
    <div className={`pos-theme ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Purchase</h1>
        </div>
      </div>
      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {/* ══════════════════════════════════════════════════════════════════
          NEW PURCHASE
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'new' && (
        <div className="inv-has-mobile-bar">
          {flash && (
            <Alert
              type={flash.type === 'success' ? 'success' : 'danger'}
              message={flash.msg}
              onClose={() => setFlash(null)}
            />
          )}

          {/* ── Header form ─────────────────────────────────────────── */}
          <div className="pos-card mb-4">
            {/* pos-customer-grid: 2-col desktop → 1-col mobile */}
            <div className="pos-customer-grid">
              <div>
                <label className="pmic-field-label">Supplier</label>
                <select className="erp-input w-full" {...register('supplier_id')}>
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="pmic-field-label">Date</label>
                <input type="date" className="erp-input w-full" {...register('date')} />
              </div>
              <div>
                <label className="pmic-field-label">Payment Mode</label>
                <select className="erp-input w-full" {...register('payment_mode')}>
                  {PAYMENT_MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="pmic-field-label">Supplier Bill No</label>
                <input
                  className="erp-input w-full"
                  placeholder="Supplier's bill number"
                  {...register('supplier_bill_no')}
                />
              </div>
            </div>
          </div>

          {/* ── Items card ──────────────────────────────────────────── */}
          <div className="pos-card mb-4">
            <div className="purchase-items-header flex items-center justify-between mb-3">
              <div className="pos-card-title">
                Purchase Items
              </div>
              <ScanButton context="purchase" onResult={handleScanResult} />
            </div>

            {/* Desktop table */}
            <div className="purchase-table-wrap">
              <InvoiceRowsTable
                rows={rows}
                products={products}
                onChange={setRows}
                showCC={false}
                showDiscount={false}
              />
            </div>

            {/* Mobile product cards — same pmic pattern as SalesPage */}
            <div className="purchase-cards">
              {rows.map((row, idx) => {
                const expanded   = expandedRows.has(idx)
                const toggleExp  = () => setExpandedRows(prev => {
                  const next = new Set(prev)
                  next.has(idx) ? next.delete(idx) : next.add(idx)
                  return next
                })
                const updateRow  = (patch: Partial<InvoiceRow>) =>
                  setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))

                const reCalc = (overrides: Partial<{ qty: number; rate: number; bonus: number }>) => {
                  const { amount } = calcRowAmount({
                    qty:          Number(overrides.qty   ?? row.qty),
                    rate:         Number(overrides.rate  ?? row.rate),
                    bonus:        Number(overrides.bonus ?? row.bonus) || 0,
                    discount_pct: 0,
                    cc_pct:       0,
                  })
                  return { amount, cc_amount: 0 }
                }

                return (
                  <div key={idx} className="pmic">

                    {/* Product label + remove */}
                    <div className="pmic-header">
                      <div className="pmic-product-label">Product</div>
                      <button
                        type="button"
                        className="pmic-remove"
                        onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>

                    {/* Product search */}
                    <div className="pmic-psc-wrap">
                      <ProductSearchCell
                        value={row.product_id}
                        products={products}
                        onChange={p => {
                          const { amount } = reCalc({ rate: Number(p.purchase_rate) })
                          updateRow({ product_id: p.id, product_name: p.name, rate: p.purchase_rate, amount, cc_amount: 0 })
                        }}
                        onCreated={p => setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])}
                      />
                    </div>

                    {/* Qty · Rate · Bonus */}
                    <div className="pmic-fields-3">
                      <div className="pmic-field">
                        <label>Qty</label>
                        <input
                          type="number" inputMode="numeric" min={0} step="1"
                          value={row.qty === 0 ? '' : row.qty}
                          placeholder="0"
                          onChange={e => {
                            const qty = e.target.value === '' ? 0 : Number(e.target.value)
                            updateRow({ qty, ...reCalc({ qty }) })
                          }}
                        />
                      </div>
                      <div className="pmic-field">
                        <label>Rate</label>
                        <input
                          type="number" inputMode="decimal" min={0} step="0.01"
                          value={row.rate === 0 ? '' : row.rate}
                          placeholder="0.00"
                          onChange={e => {
                            const rate = e.target.value === '' ? 0 : Number(e.target.value)
                            updateRow({ rate, ...reCalc({ rate }) })
                          }}
                        />
                      </div>
                      <div className="pmic-field">
                        <label>Bonus</label>
                        <input
                          type="number" inputMode="numeric" min={0} step="1"
                          value={row.bonus === 0 ? '' : row.bonus}
                          placeholder="0"
                          onChange={e => {
                            const bonus = e.target.value === '' ? 0 : Number(e.target.value)
                            updateRow({ bonus, ...reCalc({ bonus }) })
                          }}
                        />
                      </div>
                    </div>

                    {/* Amount bar */}
                    <div className="pmic-amount-bar">
                      <span className="pmic-amount-label">Amount</span>
                      <span className="pmic-amount-value">{fmt(row.amount)}</span>
                    </div>

                    {/* Expand toggle */}
                    <button type="button" className="pmic-toggle" onClick={toggleExp}>
                      <ChevronDown
                        size={13}
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
                      />
                      {expanded ? 'Hide' : 'Show'} Batch · Expiry
                    </button>

                    {/* Batch + Expiry */}
                    {expanded && (
                      <div className="pmic-fields-3 pmic-extra" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="pmic-field">
                          <label>Batch</label>
                          <input
                            type="text"
                            value={row.batch_no}
                            placeholder="B001"
                            onChange={e => updateRow({ batch_no: e.target.value })}
                          />
                        </div>
                        <div className="pmic-field">
                          <label>Expiry</label>
                          <input
                            type="text"
                            value={row.expiry}
                            placeholder="MM/YY"
                            onChange={e => updateRow({ expiry: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add Product */}
              <button
                type="button"
                className="pmic-add-btn"
                onClick={() => setRows(prev => [...prev, newRow()])}
              >
                <Plus size={15}/> Add Product
              </button>
            </div>
          </div>

          {/* Desktop action bar */}
          <div className="inv-desktop-action flex justify-end mb-4">
            <Button variant="primary" size="lg" loading={saving} onClick={handleCreateClick}>
              <FilePlus size={15}/> Create Purchase
            </Button>
          </div>

          {/* Mobile sticky bar */}
          <div className={`inv-mobile-save-bar ${theme === 'dark' ? 'dark' : ''}`}>
            <button
              className="imsb-main"
              style={{
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? .7 : 1,
              }}
              disabled={saving}
              onClick={handleCreateClick}
            >
              {saving
                ? <><span className="pos-spinner"/> Saving…</>
                : <><FilePlus size={16}/> Create Purchase — {fmt(subtotal)}</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PURCHASE LIST
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div>
          {/* Search */}
          <div className="sil-search-bar">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="sil-search-input"/>
          </div>

          {/* Desktop table */}
          <div className="table-card sil-desktop-table">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Bill No</th><th>Date</th><th>Supplier</th>
                    <th className="td-right">Total</th><th className="td-right">Paid</th>
                    <th className="td-right">Due</th><th>Mode</th><th>Status</th><th>Posted</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <SkeletonRows cols={10}/>
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
                              <PostingStatusBadge sourceType="PURCHASE" sourceId={p.id} compact/>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <Button variant="secondary" size="sm" icon={<Printer size={12}/>}
                                onClick={() => handleListPrint(p)}>
                                Print
                              </Button>
                            </td>
                          </tr>
                        ))
                      : <tr><td colSpan={10}><Empty message="No purchases found"/></td></tr>
                  }
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
          </div>

          {/* Mobile card list */}
          <div className="sil-mobile-list">
            {loading ? (
              <div className="sil-loading">
                {[1,2,3,4,5].map(i => <div key={i} className="sil-card sil-card-skeleton"/>)}
              </div>
            ) : purchases.length === 0 ? (
              <Empty message="No purchases found"/>
            ) : (
              purchases.map(p => (
                <div key={p.id} className="sil-card" onClick={() => setDetailId(p.id)}>
                  {/* Bill no + total */}
                  <div className="sil-card-top">
                    <span className="sil-card-invno">{p.bill_no}</span>
                    <span className="sil-card-total">{fmt(p.net_total)}</span>
                  </div>
                  {/* Supplier + date */}
                  <div className="sil-card-sub">
                    <span className="sil-card-customer">{p.party_name || 'Unknown Supplier'}</span>
                    <span className="sil-card-date">{fmtDate(p.date_ad)}</span>
                  </div>
                  {/* Chips */}
                  <div className="sil-card-chips">
                    <Badge status={p.payment_mode}/>
                    <Badge status={p.status || 'active'}/>
                    {Number(p.paid_amount) > 0 && (
                      <span className="sil-chip sil-chip-paid">Paid {fmt(p.paid_amount)}</span>
                    )}
                    {Number(p.due_amount) > 0 && (
                      <span className="sil-chip sil-chip-due">Due {fmt(p.due_amount)}</span>
                    )}
                    <PostingStatusBadge sourceType="PURCHASE" sourceId={p.id} compact/>
                  </div>
                  {/* Actions */}
                  <div className="sil-card-actions" onClick={e => e.stopPropagation()}>
                    <Button variant="secondary" size="sm" icon={<Printer size={13}/>}
                      onClick={() => handleListPrint(p)}>
                      Print
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
          </div>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────── */}
      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detail ? `Purchase: ${detail.bill_no}` : 'Loading…'}
        size="lg"
        footer={detail && (
          <Button variant="primary" size="sm" icon={<Printer size={13}/>}
            onClick={() => {
              const d = detail; setDetailId(null)
              setTimeout(() => setPrintData({
                voucherNo: d.bill_no, type: 'PURCHASE', date: d.date_ad,
                paymentMode: d.payment_mode, partyName: d.party_name || '—',
                items: (d.items || []).map((it: any) => ({
                  product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
                  qty: Number(it.qty), bonus: Number(it.bonus) || 0,
                  rate: Number(it.rate), amount: Number(it.amount),
                })),
                netTotal: Number(d.net_total),
                paidAmount: Number(d.paid_amount),
                dueAmount: Number(d.due_amount),
              }), 50)
            }}>
            Print Bill
          </Button>
        )}
      >
        {detail && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                ['Supplier',  detail.party_name || '—'],
                ['Date',      fmtDate(detail.date_ad)],
                ['Net Total', fmt(detail.net_total)],
                ['Paid',      fmt(detail.paid_amount)],
                ['Due',       fmt(detail.due_amount)],
              ].map(([l, v], i) => (
                <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">{l}</div>
                  <div className="font-semibold text-sm text-[var(--text)]">{v}</div>
                </div>
              ))}
            </div>
            <div className="table-card overflow-x-auto">
              <table className="erp-table items-table">
                <thead>
                  <tr>
                    <th>Product</th><th>Batch</th><th>Expiry</th>
                    <th className="td-right">Qty</th><th className="td-right">Bonus</th>
                    <th className="td-right">Rate</th><th className="td-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.product_name}</td>
                      <td className="td-mono">{it.batch_no || '—'}</td>
                      <td className="td-mono">{it.expiry   || '—'}</td>
                      <td className="td-right">{it.qty}</td>
                      <td className="td-right">{it.bonus || 0}</td>
                      <td className="td-right">{fmt(it.rate)}</td>
                      <td className="td-right font-semibold">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="text-right font-bold text-sm pr-3">NET TOTAL</td>
                    <td className="td-right font-bold text-brand">{fmt(detail.net_total)}</td>
                  </tr>
                </tfoot>
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
