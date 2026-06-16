import { useState, useEffect, useCallback, useRef } from 'react'
import ScanButton from '@/components/scanner/ScanButton'
import type { ScanResult } from '@/types/scanner'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Printer, FilePlus, List, FileText, ShoppingCart,
  CalendarDays, CreditCard, User, MapPin, Hash,
  Phone as PhoneIcon, ChevronDown, AlertCircle,
  CheckCircle2, RotateCcw, Save,
} from 'lucide-react'
import { salesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Modal, Badge, Pagination,
  SkeletonRows, Empty, SearchInput, ConfirmDialog,
} from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import { fmt, fmtDate, calcInvoiceTotals, fmtN } from '@/utils'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Sale } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'

const LIMIT = 20

/* ── tiny inline Flash component ────────────────────────────────────────── */
function Flash({ type, msg, onClose }: { type: 'success'|'danger'; msg: string; onClose: () => void }) {
  const isOk = type === 'success'
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium mb-4 ${
        isOk
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      {isOk
        ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
        : <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
      }
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100 transition-opacity text-lg leading-none">×</button>
    </motion.div>
  )
}

/* ── field label ─────────────────────────────────────────────────────────── */
function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-1.5">
      <span className="text-[var(--text-4)]">{icon}</span>
      {children}
    </label>
  )
}

/* ── summary row ─────────────────────────────────────────────────────────── */
function SummaryRow({
  label, value, highlight = false, muted = false, large = false,
}: {
  label: string; value: string; highlight?: boolean; muted?: boolean; large?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${
      highlight ? 'border-t-2 border-[var(--border)] mt-1 pt-3' : ''
    }`}>
      <span className={`text-xs font-semibold uppercase tracking-wide ${
        muted ? 'text-[var(--text-4)]' : 'text-[var(--text-3)]'
      }`}>{label}</span>
      <span className={`font-bold tabular-nums ${
        large ? 'text-xl text-brand' : highlight ? 'text-base text-brand' : 'text-sm text-[var(--text)]'
      }`}>{value}</span>
    </div>
  )
}

export default function SalesPage() {
  const { success, error } = useUIStore()
  const [tab, setTab]      = useState('new')

  // Master data
  const [customers, setCustomers] = useState<Party[]>([])
  const [products,  setProducts]  = useState<Product[]>([])

  // List state
  const [sales,     setSales]     = useState<Sale[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)

  // Form state
  const [rows,      setRows]      = useState<InvoiceRow[]>([newRow()])
  const [saving,    setSaving]    = useState(false)
  const [flash,     setFlash]     = useState<{ type: 'success'|'danger'; msg: string } | null>(null)
  const [lastInvDate, setLastInvDate] = useState<string | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [detailId,  setDetailId]  = useState<string | null>(null)
  const [detail,    setDetail]    = useState<Sale | null>(null)

  // Tender input for change calculation
  const [tender, setTender] = useState<number | ''>('')

  // Confirmation dialogs
  const [confirmPost,   setConfirmPost]   = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  // ── Scanner: receive product from phone, inject as new invoice row ─────────
  const handleScanResult = useCallback((result: ScanResult) => {
    const p = result.product
    const addRow = (prod: typeof p) => {
      const row         = newRow()
      row.product_id    = prod.id
      row.product_name  = prod.name
      row.rate          = prod.sales_rate
      row.cc_pct        = prod.cc_pct ?? 0
      // Pre-fill first available batch if present
      if (prod.batches?.length) {
        row.batch_no = prod.batches[0].batch_no  || ''
        row.expiry   = prod.batches[0].expiry_date || ''
      }
      setRows(prev => {
        const last = prev[prev.length - 1]
        // Replace trailing empty row rather than appending
        if (last && !last.product_id) return [...prev.slice(0, -1), row]
        return [...prev, row]
      })
      // Merge into local products list if not already there
      setProducts(prev => prev.some(x => x.id === prod.id) ? prev : [...prev, prod as any])
    }

    // Product data comes fully hydrated from the server — use it directly
    addRow(p)
  }, [])

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      customer_id: '', date: new Date().toISOString().split('T')[0],
      payment_mode: 'cash', discount_pct: 0, notes: '',
    },
  })

  // Load master data once
  useEffect(() => {
    partiesAPI.customers({ limit: 500 }).then(r => setCustomers(r.data.data || [])).catch(() => {})
    productsAPI.list({ limit: 500 }).then(r => setProducts(r.data.data || [])).catch(() => {})
  }, [])

  // Load list
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await salesAPI.list({ page, limit: LIMIT, search: search || undefined })
      setSales(r.data.data || [])
      setTotal(r.data.pagination?.total || 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])

  // Load detail
  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    salesAPI.get(detailId).then(r => setDetail(r.data.data)).catch(() => setDetail(null))
  }, [detailId])

  // Fetch latest sales invoice date for frontend date validation
  useEffect(() => {
    salesAPI.list({ limit: 1, status: 'active' })
      .then(r => {
        const list = r.data?.data ?? []
        if (list.length && list[0].date_ad) setLastInvDate(list[0].date_ad)
      })
      .catch(() => {})
  }, [])

  const discountPct = Number(watch('discount_pct')) || 0
  const customerId  = watch('customer_id')

  // Derive selected customer info
  const selectedCustomer = customers.find(c => c.id === customerId)

  // Calculate totals — same calcInvoiceTotals logic, extended for tax
  const subtotal    = rows.reduce((s, r) => s + r.amount, 0)
  const discountAmt = subtotal * (discountPct / 100)
  const afterDisc   = subtotal - discountAmt
  const taxAmt      = 0
  const netTotal    = afterDisc
  const change      = typeof tender === 'number' && tender > 0
    ? Math.max(0, tender - netTotal)
    : 0

  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }

    if (lastInvDate && data.date && data.date < lastInvDate) {
      setFlash({
        type: 'danger',
        msg:  `Date cannot be earlier than the previous invoice date (${lastInvDate}).`,
      })
      return
    }

    setSaving(true); setFlash(null)
    try {
      const res = await salesAPI.create({
        party_id:     data.customer_id || undefined,
        date_ad:      data.date,
        payment_mode: data.payment_mode,
        discount_pct: discountPct,
        notes:        data.notes,
        items:        validRows.map(r => ({
          product_id:   r.product_id,
          product_name: r.product_name,
          batch_no:     r.batch_no || undefined,
          expiry:       r.expiry   || undefined,
          qty:          Number(r.qty),
          bonus:        Number(r.bonus) || 0,
          rate:         Number(r.rate),
          cc_pct:       Number(r.cc_pct) || 0,
          amount:       r.amount,
          cc_amount:    r.cc_amount,
        })),
      })
      const saved = res.data.data
      setPrintData({
        voucherNo:   saved.invoice_no,
        type:        'SALE',
        date:        saved.date_ad || saved.date_bs || data.date,
        paymentMode: saved.payment_mode,
        partyName:   customers.find(c => c.id === data.customer_id)?.name,
        items:       validRows.map(r => ({
          product_name: r.product_name,
          batch_no:     r.batch_no,
          expiry:       r.expiry,
          qty:          Number(r.qty),
          bonus:        Number(r.bonus) || 0,
          rate:         Number(r.rate),
          discount_pct: Number(r.discount_pct) || 0,
          cc_pct:       Number(r.cc_pct) || 0,
          cc_amount:    Number(r.cc_amount) || 0,
          amount:       Number(r.amount),
        })),
        subtotal:    saved.subtotal,
        ccAmount:    saved.cc_amount,
        netTotal:    saved.net_total,
        paidAmount:  saved.paid_amount,
        dueAmount:   saved.due_amount,
      })
      setFlash({ type: 'success', msg: `Invoice ${res.data.data.invoice_no} posted!` })
      reset(); setRows([newRow()]); setTender('')
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  async function saveDraft() {
    setFlash({ type: 'success', msg: 'Draft saved locally.' })
  }

  function clearForm() {
    reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', discount_pct: 0, notes: '' })
    setRows([newRow()])
    setTender('')
    setFlash(null)
  }

  async function cancelSale(id: string) {
    try { await salesAPI.cancel(id); success('Sale cancelled'); loadList() }
    catch (e: any) { error('Cannot cancel', e.message) }
  }

  const tabList = [
    { id: 'new',  label: 'New Invoice',  icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Invoices', icon: <List size={14}/> },
  ]

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Sales / POS</h1>
        </div>
      </div>

      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {/* ════════════════════════════════════════════════════════════════════
          NEW INVOICE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'new' && (
        <div className="space-y-4">
          <AnimatePresence>
            {flash && (
              <Flash
                type={flash.type}
                msg={flash.msg}
                onClose={() => setFlash(null)}
              />
            )}
          </AnimatePresence>

          {/* ── Row 1: Customer info card + Total payable card ───────────── */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 280px' }}>

            {/* Customer info */}
            <div className="pos-card">
              <div className="pos-card-title">
                <User size={14} className="text-brand" />
                Customer Information
              </div>

              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {/* Party selector */}
                <div style={{ gridColumn: 'span 2' }}>
                  <FieldLabel icon={<User size={11}/>}>Party</FieldLabel>
                  <div className="relative">
                    <select
                      className="erp-input pos-select"
                      {...register('customer_id')}
                    >
                      <option value="">— Walk-in Customer —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.code ? `${c.code} - ` : ''}{c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
                  </div>
                </div>

                {/* Address — readonly from selected party */}
                <div>
                  <FieldLabel icon={<MapPin size={11}/>}>Address</FieldLabel>
                  <div className="erp-input pos-readonly">
                    {selectedCustomer?.address || <span className="text-[var(--text-4)]">—</span>}
                  </div>
                </div>

                {/* PAN */}
                <div>
                  <FieldLabel icon={<Hash size={11}/>}>PAN</FieldLabel>
                  <div className="erp-input pos-readonly">
                    {selectedCustomer?.pan_no || <span className="text-[var(--text-4)]">—</span>}
                  </div>
                </div>

                {/* Telephone */}
                <div>
                  <FieldLabel icon={<PhoneIcon size={11}/>}>Telephone</FieldLabel>
                  <div className="erp-input pos-readonly">
                    {selectedCustomer?.phone || <span className="text-[var(--text-4)]">—</span>}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <FieldLabel icon={<CalendarDays size={11}/>}>Date</FieldLabel>
                  <input
                    type="date"
                    className="erp-input"
                    min={lastInvDate || undefined}
                    {...register('date')}
                  />
                </div>

                {/* Payment mode */}
                <div style={{ gridColumn: 'span 2' }}>
                  <FieldLabel icon={<CreditCard size={11}/>}>Payment Mode</FieldLabel>
                  <div className="flex gap-2 flex-wrap">
                    {PAYMENT_MODES.map(m => {
                      const currentMode = watch('payment_mode')
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setValue('payment_mode', m.value)}
                          className={`pos-mode-pill ${currentMode === m.value ? 'pos-mode-pill--active' : ''}`}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Total payable card */}
            <div className="pos-total-card">
              <div className="text-[11px] font-bold uppercase tracking-widest text-brand/80 mb-2">
                Total Payable
              </div>
              <div className="pos-total-amount">
                {fmt(netTotal)}
              </div>
              <div className="w-full mt-4 space-y-0.5">
                <SummaryRow label="Sub Total"      value={fmt(subtotal)} />
                <SummaryRow label="Discount"       value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
                <SummaryRow label="Total Payable"  value={fmt(netTotal)}  highlight large />
              </div>
            </div>
          </div>

          {/* ── Invoice Items ─────────────────────────────────────────────── */}
          <div className="pos-card">
            <div className="flex items-center justify-between mb-4">
              <div className="pos-card-title">
                <ShoppingCart size={14} className="text-brand" />
                Invoice Items
              </div>
              <div className="flex items-center gap-3">
                <ScanButton context="sales" onResult={handleScanResult} />
                <div className="flex items-center gap-3 text-xs text-[var(--text-4)]">
                  <span className="flex items-center gap-1">
                    <kbd className="pos-kbd">↵</kbd> Add row
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="pos-kbd">Tab</kbd> Next field
                  </span>
                </div>
              </div>
            </div>

            <InvoiceRowsTable
              rows={rows}
              products={products}
              onChange={setRows}
              onProductsChange={setProducts}
              showBonus
              showCC
              showDiscount={false}
            />
          </div>

          {/* ── Billing summary ───────────────────────────────────────────── */}
          <div className="pos-card">
            <div className="pos-card-title mb-4">
              <CreditCard size={14} className="text-brand" />
              Billing Summary
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>

              {/* Discount block */}
              <div className="pos-summary-block">
                <div className="pos-summary-block-icon" style={{ background: '#fef3c7' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8h12M8 2v12" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="5" cy="5" r="1.5" fill="#d97706" opacity=".5"/>
                    <circle cx="11" cy="11" r="1.5" fill="#d97706" opacity=".5"/>
                  </svg>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">Discount %</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        className="erp-input text-right"
                        style={{ width: 70 }}
                        step="0.01" min="0" max="100"
                        {...register('discount_pct')}
                      />
                      <span className="text-sm text-[var(--text-3)] font-medium">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-0.5">Discount Amount</div>
                    <div className="text-lg font-bold text-amber-600">{fmt(discountAmt)}</div>
                  </div>
                </div>
              </div>


              {/* Payment block */}
              <div className="pos-summary-block">
                <div className="pos-summary-block-icon" style={{ background: '#f0fdf4' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="#16a34a" strokeWidth="1.5"/>
                    <path d="M8 5v1.5M8 9.5V11M6.5 8a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 9.5 8 1.5 1.5 0 0 0 8 6.5" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">Tender Amount</div>
                    <input
                      type="number"
                      className="erp-input text-right"
                      style={{ width: 120 }}
                      step="0.01" min="0"
                      placeholder="0.00"
                      value={tender}
                      onChange={e => setTender(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-0.5">Change</div>
                    <div className={`text-lg font-bold ${change > 0 ? 'text-green-600' : 'text-[var(--text-4)]'}`}>
                      {fmt(change)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tender hint */}
            {!tender && (
              <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-4)]">
                <AlertCircle size={12} />
                Enter tender amount to calculate change.
              </div>
            )}
          </div>

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1 pb-2">
            <button
              type="button"
              onClick={clearForm}
              className="pos-action-btn pos-action-btn--clear"
            >
              <RotateCcw size={14} />
              Clear
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveDraft}
                className="pos-action-btn pos-action-btn--draft"
              >
                <Save size={14} />
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
                  if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
                  setConfirmPost(true)
                }}
                disabled={saving}
                className="pos-action-btn pos-action-btn--post"
              >
                {saving ? (
                  <span className="pos-spinner" />
                ) : (
                  <FileText size={14} />
                )}
                {saving ? 'Posting…' : 'Post Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INVOICE LIST
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="w-64" />
          </div>
          <div className="table-card">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Invoice No</th><th>Date</th><th>Customer</th>
                    <th className="td-right">Total</th><th className="td-right">Paid</th>
                    <th className="td-right">Due</th><th>Mode</th><th>Status</th><th>Posted</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <SkeletonRows cols={10} />
                    : sales.length
                      ? sales.map(s => (
                          <tr key={s.id} className="clickable" onClick={() => setDetailId(s.id)}>
                            <td className="td-mono text-brand">{s.invoice_no}</td>
                            <td className="td-mono">{fmtDate(s.date_ad)}</td>
                            <td>{s.party_name}</td>
                            <td className="td-right">{fmt(s.net_total)}</td>
                            <td className="td-right text-green-700">{fmt(s.paid_amount)}</td>
                            <td className={`td-right ${Number(s.due_amount) > 0 ? 'text-amber-600' : ''}`}>{fmt(s.due_amount)}</td>
                            <td><Badge status={s.payment_mode}/></td>
                            <td><Badge status={s.status}/></td>
                            <td onClick={e => e.stopPropagation()}>
                              <PostingStatusBadge sourceType="SALE" sourceId={s.id} compact />
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                              <Button
                                variant="secondary" size="sm"
                                icon={<Printer size={13}/>}
                                onClick={async () => {
                                  try {
                                    const res = await salesAPI.get(s.id)
                                    const d = res.data.data
                                    setPrintData({
                                      voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
                                      paymentMode: d.payment_mode, partyName: d.party_name,
                                      items: (d.items || []).map((it: any) => ({
                                        product_name: it.product_name, batch_no: it.batch_no,
                                        expiry: it.expiry, qty: Number(it.qty),
                                        bonus: Number(it.bonus) || 0, rate: Number(it.rate),
                                        discount_pct: Number(it.discount_pct) || 0,
                                        cc_pct: Number(it.cc_pct) || 0, cc_amount: Number(it.cc_amount) || 0,
                                        amount: Number(it.amount),
                                      })),
                                      subtotal: Number(d.subtotal || 0), ccAmount: Number(d.cc_amount || 0),
                                      netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount),
                                      dueAmount: Number(d.due_amount),
                                    })
                                  } catch (e: any) { error('Print failed', e.message) }
                                }}
                              >Print</Button>
                              {s.status === 'active' && (
                                <Button variant="danger" size="sm" style={{ marginLeft: 4 }} onClick={() => setConfirmCancel(s.id)}>Cancel</Button>
                              )}
                            </td>
                          </tr>
                        ))
                      : <tr><td colSpan={9}><Empty message="No sales found"/></td></tr>
                  }
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
          </div>
        </div>
      )}

      {/* Sale detail modal */}
      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detail ? `Invoice: ${detail.invoice_no}` : 'Loading…'}
        size="lg"
        footer={detail && (
          <Button variant="primary" size="sm" icon={<Printer size={13}/>}
            onClick={() => {
              const d = detail
              setDetailId(null)
              setTimeout(() => setPrintData({
                voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
                paymentMode: d.payment_mode, partyName: d.party_name,
                items: (d.items || []).map((it: any) => ({
                  product_name: it.product_name, batch_no: it.batch_no,
                  expiry: it.expiry, qty: Number(it.qty),
                  bonus: Number(it.bonus)||0, rate: Number(it.rate),
                  discount_pct: Number(it.discount_pct)||0,
                  cc_pct: Number(it.cc_pct)||0, cc_amount: Number(it.cc_amount)||0,
                  amount: Number(it.amount),
                })),
                netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount),
                dueAmount: Number(d.due_amount),
              }), 50)
            }}
          >Print Invoice</Button>
        )}
      >
        {detail && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                ['Party',     detail.party_name],
                ['Date',      fmtDate(detail.date_ad)],
                ['Payment',   detail.payment_mode],
                ['Status',    ''],
                ['Net Total', fmt(detail.net_total)],
                ['Due',       fmt(detail.due_amount)],
              ].map(([label, val], i) => (
                <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">{label}</div>
                  {label === 'Status'
                    ? <Badge status={detail.status}/>
                    : <div className="font-semibold text-sm text-[var(--text)]">{val}</div>
                  }
                </div>
              ))}
            </div>
            <div className="table-card">
              <table className="erp-table items-table">
                <thead><tr>
                  <th>Product</th><th>Batch</th><th>Expiry</th>
                  <th className="td-right">Qty</th><th className="td-right">Rate</th>
                  <th className="td-right">Amount</th>
                </tr></thead>
                <tbody>
                  {(detail.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.product_name}</td>
                      <td className="td-mono">{it.batch_no || '—'}</td>
                      <td className="td-mono">{it.expiry || '—'}</td>
                      <td className="td-right">{it.qty}</td>
                      <td className="td-right">{fmt(it.rate)}</td>
                      <td className="td-right font-semibold">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="text-right font-bold text-sm pr-3">NET TOTAL</td>
                    <td className="td-right font-bold text-brand">{fmt(detail.net_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Post Invoice confirmation */}
      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={onSubmit}
        title="Post Invoice"
        message={`Post invoice for ${fmt(netTotal)}? This action cannot be undone.`}
      />

      {/* Cancel Sale confirmation */}
      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && cancelSale(confirmCancel)}
        title="Cancel Sale"
        message="Are you sure you want to cancel this sale? This action cannot be undone."
        danger
      />

      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => { setPrintData(null); setFlash(null) }}
        onNextBill={() => {
          setPrintData(null); setFlash(null); setRows([newRow()]); setTender('')
          reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', discount_pct: 0, notes: '' })
        }}
      />
    </div>
  )
}
