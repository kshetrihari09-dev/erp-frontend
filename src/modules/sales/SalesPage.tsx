/**
 * SalesPage.tsx — Responsive redesign.
 *
 * DESKTOP (≥769px): Every div, className, prop and layout is identical to the
 *   original. Zero visual difference for desktop users.
 *
 * MOBILE (≤768px): Mobile-only elements (total bar, product cards, sticky
 *   action bar) are toggled purely by CSS classes defined in globals.css.
 *   No JS breakpoint detection. No inline style overrides.
 *
 * Business logic, calculations, API calls, validation — 100% unchanged.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import ScanButton from '@/components/scanner/ScanButton'
import type { ScanResult } from '@/types/scanner'
import { useForm } from 'react-hook-form'
import {
  Printer, FilePlus, List, FileText, ShoppingCart,
  CalendarDays, CreditCard, User, MapPin, Hash,
  Phone as PhoneIcon, ChevronDown, AlertCircle,
  CheckCircle2, RotateCcw, Save, Plus, UserPlus,
} from 'lucide-react'
import { salesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Modal, Badge, Pagination,
  SkeletonRows, Empty, SearchInput, ConfirmDialog, Kbd, Spinner, Alert,
} from '@/components/ui'
import TransactionSuccessAlert, { type TransactionSuccessInfo } from '@/components/shared/TransactionSuccessAlert'
import InvoiceRowsTable, { newRow, type InvoiceRow, type InvoiceRowsTableHandle } from '@/components/forms/InvoiceRowsTable'
import ProductSearchCell from '@/components/forms/ProductSearchCell'
import BatchSelect from '@/components/forms/BatchSelect'
import QtyGate from '@/components/forms/QtyGate'
import QuickAddPartyModal from '@/components/forms/QuickAddPartyModal'
import { fmt, fmtDate, calcRowAmount } from '@/utils'
import DiscountReviewModal from '@/components/forms/discount/DiscountReviewModal'
import {
  computeItemDiscounts, computeTotals, emptyDiscount, validRows as validDiscountRows,
  type DiscountScope, type DiscountEntry,
} from '@/components/forms/discount/discountUtils'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import AutoCloudBackup from '@/components/cloudStorage/AutoCloudBackup'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Sale } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

const LIMIT = 20

/* ── Flash — now the same Alert/TransactionSuccessAlert used by Purchase ──
 * (see PurchasePage.tsx). The bespoke local component that used to live
 * here has been removed so both pages share one implementation instead of
 * duplicating the success/error banner markup. */
type Flash =
  | { type: 'danger';  msg:  string }
  | { type: 'info';    msg:  string }
  | { type: 'success'; info: TransactionSuccessInfo }

/* ── FieldLabel — IDENTICAL to original ─────────────────────────────────── */
function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-1.5">
      <span className="text-[var(--text-4)]">{icon}</span>
      {children}
    </label>
  )
}

/* ── SummaryRow — IDENTICAL to original ─────────────────────────────────── */
function SummaryRow({
  label, value, highlight = false, muted = false, large = false,
}: {
  label: string; value: string; highlight?: boolean; muted?: boolean; large?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'border-t-2 border-[var(--border)] mt-1 pt-3' : ''}`}>
      <span className={`text-xs font-semibold uppercase tracking-wide ${muted ? 'text-[var(--text-4)]' : 'text-[var(--text-3)]'}`}>
        {label}
      </span>
      <span className={`font-bold tabular-nums ${large ? 'text-xl text-brand' : highlight ? 'text-base text-brand' : 'text-sm text-[var(--text)]'}`}>
        {value}
      </span>
    </div>
  )
}

/* ── EditablePaymentMode — Sales List inline editor ─────────────────────────
 * UI-only enhancement. Badge → click → compact dropdown + Save/Cancel.
 * Calls the dedicated PUT /sales/:id/payment-mode endpoint, which updates
 * only that one column server-side. This component never recalculates
 * totals, and never touches stock, accounting, vouchers, tax, or discounts —
 * it only ever sends/receives `payment_mode`. */
function EditablePaymentMode({
  sale, onSaved,
}: { sale: Sale; onSaved: (id: string, mode: string) => void }) {
  const { success, error } = useUIStore()
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState<string>(sale.payment_mode)
  const [saving,  setSaving]  = useState(false)

  if (!editing) {
    return (
      <Badge
        status={sale.payment_mode}
        className="cursor-pointer hover:opacity-70"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          setValue(sale.payment_mode)
          setEditing(true)
        }}
      />
    )
  }

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setValue(sale.payment_mode)
    setEditing(false)
  }

  const saveEdit = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    // Unchanged value — exit edit mode without an API call.
    if (value === sale.payment_mode) { setEditing(false); return }
    setSaving(true)
    try {
      const res     = await salesAPI.updatePaymentMode(sale.id, value)
      const updated = res.data?.data?.payment_mode ?? value
      onSaved(sale.id, updated)
      setEditing(false)
      success('Payment mode updated', `Invoice ${sale.invoice_no} is now ${updated}.`)
    } catch (e: any) {
      error('Update failed', e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
      <select
        className="erp-input"
        style={{ height: 28, padding: '2px 6px', fontSize: 12, minWidth: 90 }}
        value={value}
        disabled={saving}
        autoFocus
        onChange={e => setValue(e.target.value)}
      >
        {PAYMENT_MODES.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <Button type="button" variant="primary" size="sm" disabled={saving} onClick={saveEdit}>
        {saving ? <Spinner size={12}/> : 'Save'}
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={cancelEdit}>
        Cancel
      </Button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function SalesPage() {
  const { success, error, info, theme } = useUIStore()
  const [tab, setTab] = useState('new')

  const [customers, setCustomers] = useState<Party[]>([])
  const [products,  setProducts]  = useState<Product[]>([])

  const [sales,   setSales]   = useState<Sale[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(false)

  const [rows,        setRows]        = useState<InvoiceRow[]>([newRow()])
  const tableRef = useRef<InvoiceRowsTableHandle>(null)
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState<Flash | null>(null)
  const [lastInvDate, setLastInvDate] = useState<string | null>(null)
  const [printData,   setPrintData]   = useState<PrintData | null>(null)
  const [detailId,    setDetailId]    = useState<string | null>(null)
  const [detail,      setDetail]      = useState<Sale | null>(null)
  const [tender,      setTender]      = useState<number | ''>('')

  // Mobile accordion states (ignored on desktop — CSS keeps bodies visible)
  const [customerOpen, setCustomerOpen] = useState(true)
  const [billingOpen,  setBillingOpen]  = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  // ── Discount Review workflow ────────────────────────────────────────────
  // Next (F12) opens the review popup; the popup's own Post Invoice button
  // is what actually posts (see onSubmit below). Only one scope is active
  // at a time — see handleDiscountScopeChange for the "clear on switch" rule.
  const [discountScope,     setDiscountScope]     = useState<DiscountScope>('invoice')
  const [invoiceDiscount,   setInvoiceDiscount]   = useState<DiscountEntry>(emptyDiscount())
  const [companyDiscounts,  setCompanyDiscounts]  = useState<Record<string, DiscountEntry>>({})
  const [productDiscounts,  setProductDiscounts]  = useState<Record<number, DiscountEntry>>({})
  const [discountModalOpen, setDiscountModalOpen] = useState(false)

  // ── Scanner ─────────────────────────────────────────────────────────────
  // Batch is intentionally left blank here: BatchSelect (rendered for this
  // row once it mounts) picks up the fresh product_id and runs the same
  // auto-select/auto-open logic used for search and keyboard selection —
  // a scanned product goes through the exact same batch popup, so a
  // scan never silently locks in a batch the user didn't confirm.
  const handleScanResult = useCallback((result: ScanResult) => {
    const p   = result.product
    const row = newRow()
    row.product_id   = p.id
    row.product_name = p.name
    row.rate         = p.sales_rate
    row.cc_pct       = p.cc_pct ?? 0
    setRows(prev => {
      const last = prev[prev.length - 1]
      if (last && !last.product_id) return [...prev.slice(0, -1), row]
      return [...prev, row]
    })
    setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p as any])
  }, [])

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      customer_id: '', date: new Date().toISOString().split('T')[0],
      payment_mode: 'cash', notes: '',
    },
  })

  useEffect(() => {
    partiesAPI.customers({ limit: 500 }).then(r => setCustomers(r.data.data || [])).catch(() => {})
    productsAPI.list({ limit: 500 }).then(r => setProducts(r.data.data || [])).catch(() => {})
  }, [])

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

  // Patches the one changed field locally so the list doesn't need a full
  // reload after an inline Payment Mode edit in the Sales List.
  const handlePaymentModeSaved = useCallback((id: string, mode: string) => {
    setSales(prev => prev.map(s => s.id === id ? { ...s, payment_mode: mode as Sale['payment_mode'] } : s))
  }, [])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    salesAPI.get(detailId).then(r => setDetail(r.data.data)).catch(() => setDetail(null))
  }, [detailId])

  useEffect(() => {
    salesAPI.list({ limit: 1, status: 'active' })
      .then(r => {
        const list = r.data?.data ?? []
        // date_ad comes back as a full ISO timestamp (e.g.
        // "2026-07-07T00:00:00.000Z"), but the date <input> and
        // `data.date` below are plain YYYY-MM-DD. Comparing those two
        // formats directly as strings both breaks same-day posting
        // (a 10-char date string is lexicographically "less than" a
        // longer ISO string sharing that same prefix) and shows the raw
        // timestamp in the error message. Slicing to the date part fixes
        // both.
        if (list.length && list[0].date_ad) setLastInvDate(String(list[0].date_ad).slice(0, 10))
      }).catch(() => {})
  }, [])

  // ── Calculations ─────────────────────────────────────────────────────
  const customerId       = watch('customer_id')
  const currentPayMode   = watch('payment_mode')
  const selectedCustomer = customers.find(c => c.id === customerId)
  const subtotal         = rows.reduce((s, r) => s + r.amount, 0)

  // Discount — resolved per the active scope (Invoice / Company / Product)
  // into a per-line discount_pct, exactly what gets posted to the backend.
  // See discountUtils.ts for the full rationale.
  const { totalDiscount: discountAmt } = computeItemDiscounts(
    rows, products, discountScope, invoiceDiscount, companyDiscounts, productDiscounts,
  )
  // ── Round Off — display only; the authoritative value is computed
  // server-side (same nearest-whole-number rule) and saved with the
  // invoice. Shown here so the on-screen Grand Total matches what gets
  // posted. When netTotal is already a whole number, roundOff is 0 and
  // grandTotal === netTotal — Grand Total only changes when a round off
  // is actually applied.
  const { roundOff, grandTotal } = computeTotals(rows, discountAmt)
  const change            = typeof tender === 'number' && tender > 0 ? Math.max(0, tender - grandTotal) : 0

  // Auto-collapse customer accordion + focus product search on mobile
  const prevCustId = useRef(customerId)
  useEffect(() => {
    if (prevCustId.current === '' && customerId !== '') {
      setCustomerOpen(false)
      setTimeout(() => document.querySelector<HTMLElement>('.psc-input,.psc-trigger')?.focus(), 350)
    }
    prevCustId.current = customerId
  }, [customerId])

  // ── onSubmit — now requires a customer to be selected before posting ────
  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (!data.customer_id) { setFlash({ type: 'danger', msg: 'Select a customer before posting the sale' }); setCustomerOpen(true); return }
    if (lastInvDate && data.date && data.date < lastInvDate) {
      setFlash({ type: 'danger', msg: `Date cannot be earlier than the previous invoice date (${fmtDate(lastInvDate)}).` })
      return
    }
    setSaving(true); setFlash(null)
    try {
      // Resolve the final per-line discount_pct from whichever scope is
      // active (Invoice / Company / Product) — see discountUtils.ts.
      const { pctById } = computeItemDiscounts(
        rows, products, discountScope, invoiceDiscount, companyDiscounts, productDiscounts,
      )
      const res = await salesAPI.create({
        party_id: data.customer_id || undefined,
        date_ad: data.date, payment_mode: data.payment_mode,
        notes: data.notes,
        items: validRows.map(r => ({
          product_id: r.product_id, product_name: r.product_name,
          batch_no: r.batch_no || undefined, batch_id: r.batch_id || undefined, expiry: r.expiry || undefined,
          qty: Number(r.qty), bonus: Number(r.bonus) || 0,
          rate: Number(r.rate), cc_pct: Number(r.cc_pct) || 0,
          amount: r.amount, cc_amount: r.cc_amount,
          discount_pct: pctById[r._id] || 0,
        })),
      })
      const saved      = res.data.data
      // Prefer the server's saved items (already carrying the applied
      // discount_pct/amount) so the print preview matches exactly what was
      // posted; validRows is only a fallback for older/unexpected responses.
      const savedItems: any[] = Array.isArray(saved.items) && saved.items.length ? saved.items : validRows
      setPrintData({
        voucherNo: saved.invoice_no, type: 'SALE',
        date: saved.date_ad || saved.date_bs || data.date,
        paymentMode: saved.payment_mode,
        partyName: customers.find(c => c.id === data.customer_id)?.name,
        items: savedItems.map((it: any) => ({
          product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
          qty: Number(it.qty), bonus: Number(it.bonus) || 0, rate: Number(it.rate),
          discount_pct: Number(it.discount_pct) || 0, cc_pct: Number(it.cc_pct) || 0,
          cc_amount: Number(it.cc_amount) || 0, amount: Number(it.amount),
        })),
        subtotal: saved.subtotal, ccAmount: saved.cc_amount,
        roundOff: Number(saved.round_off) || 0,
        netTotal: saved.net_total, paidAmount: saved.paid_amount, dueAmount: saved.due_amount,
      })
      // Success confirmation only fires here, after the backend has
      // actually confirmed the sale was saved (res.data.data above) —
      // same rule PurchasePage.tsx follows for its own success alert.
      setFlash({
        type: 'success',
        info: {
          voucherLabel: 'Invoice',
          voucherNo:    saved.invoice_no,
          partyLabel:   'Customer',
          partyName:    customers.find(c => c.id === data.customer_id)?.name,
          grandTotal:   Number(saved.net_total),
        },
      })
      reset(); setRows([newRow()]); setTender('')
      setDiscountModalOpen(false)
      setDiscountScope('invoice'); setInvoiceDiscount(emptyDiscount())
      setCompanyDiscounts({}); setProductDiscounts({})
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  function saveDraft() { setFlash({ type: 'info', msg: 'Draft saved locally.' }) }

  function clearForm() {
    reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', notes: '' })
    setRows([newRow()]); setTender(''); setFlash(null); setCustomerOpen(true)
    setDiscountModalOpen(false)
    setDiscountScope('invoice'); setInvoiceDiscount(emptyDiscount())
    setCompanyDiscounts({}); setProductDiscounts({})
  }

  async function cancelSale(id: string) {
    try { await salesAPI.cancel(id); success('Sale cancelled'); loadList() }
    catch (e: any) { error('Cannot cancel', e.message) }
  }

  // "Next (F12)" — validates the invoice itself (same checks onSubmit used
  // to run before posting), then opens the Discount Review popup. The
  // Sale page no longer posts directly; the popup's own Post Invoice
  // button is what actually calls onSubmit.
  function handleNextClick() {
    const v = validDiscountRows(rows)
    if (!v.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (!customerId) { setFlash({ type: 'danger', msg: 'Select a customer before posting the sale' }); setCustomerOpen(true); return }
    setFlash(null)
    setDiscountModalOpen(true)
  }

  // Changing the discount scope clears any previously entered discount
  // values (per the spec) — but only asks for confirmation if something
  // would actually be lost.
  function handleDiscountScopeChange(next: DiscountScope) {
    if (next === discountScope) return
    const hasEntries =
      invoiceDiscount.value > 0 ||
      Object.values(companyDiscounts).some(d => d.value > 0) ||
      Object.values(productDiscounts).some(d => d.value > 0)
    if (hasEntries && !window.confirm('Switching discount scope will clear the discount values you\'ve entered. Continue?')) {
      return
    }
    setInvoiceDiscount(emptyDiscount())
    setCompanyDiscounts({})
    setProductDiscounts({})
    setDiscountScope(next)
  }

  function handleClearDiscount() {
    if (discountScope === 'invoice') setInvoiceDiscount(emptyDiscount())
    else if (discountScope === 'company') setCompanyDiscounts({})
    else setProductDiscounts({})
  }

  /* ── Keyboard shortcuts (New Invoice tab only) ─────────────────────────
   * See hooks/useKeyboardShortcuts.ts for the shared manager. Popups
   * (Quick Add modals, Batch Selection, Print Preview) each register their
   * own scope, so these automatically go quiet while any of them is open —
   * nothing here needs an "is a modal open" check. */
  useKeyboardShortcuts([
    { combo: 'f2',         description: 'Product search',    handler: () => tableRef.current?.focusProductSearch() },
    { combo: 'ctrl+f',     description: 'Product search',    handler: () => tableRef.current?.focusProductSearch() },
    { combo: 'f3',         description: 'Customer search',   handler: () => document.getElementById('pos-customer-select')?.focus() },
    { combo: 'f4',         description: 'Batch selection',   handler: () => tableRef.current?.openBatchSelect() },
    { combo: 'ctrl+b',     description: 'Batch selection',   handler: () => tableRef.current?.openBatchSelect() },
    { combo: 'f5',         description: 'New product',       handler: () => tableRef.current?.openCreateProduct() },
    { combo: 'f6',         description: 'New customer',      handler: () => setShowNewCustomer(true) },
    { combo: 'f7',         description: 'Apply discount',    handler: handleNextClick },
    { combo: 'f8',         description: 'Payment',           handler: () => document.getElementById('pos-tender-input')?.focus() },
    { combo: 'f9',         description: 'Next',              handler: handleNextClick },
    { combo: 'ctrl+s',     description: 'Next',              handler: handleNextClick },
    { combo: 'f12',        description: 'Next',              handler: handleNextClick },
    {
      combo: 'f10', description: 'Print invoice',
      handler: () => { if (!printData) info('Nothing to print yet', 'Post a sale first.'); },
      // PrintPreviewModal auto-opens (and grabs the scope) the instant
      // printData is set — this only needs to handle "no invoice yet".
    },
    {
      combo: 'ctrl+p', description: 'Print',
      handler: () => { if (!printData) info('Nothing to print yet', 'Post a sale first.'); },
    },
    { combo: 'ctrl+n',       description: 'New bill',          handler: clearForm },
    { combo: 'ctrl+l',       description: 'Clear current bill', handler: () => setRows([newRow()]) },
    { combo: 'ctrl+d',       description: 'Delete current line', handler: () => tableRef.current?.deleteRow() },
    { combo: 'ctrl+enter',   description: 'Add new row',       handler: () => tableRef.current?.addRow() },
  ], { enabled: tab === 'new' })

  const tabList = [
    { id: 'new',  label: 'New Invoice',  icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Invoices', icon: <List size={14}/> },
  ]

  // Initials for mobile customer avatar
  const customerInitials = selectedCustomer?.name
    ? selectedCustomer.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : ''

  return (
    // pos-theme activates ALL scoped CSS variables and responsive rules in globals.css
    <div className={`pos-theme ${theme === 'dark' ? 'dark' : ''}`}>

      {/* ── Page header — IDENTICAL to original ─────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Sales / POS</h1>
        </div>
      </div>

      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {/* ════════════════════════════════════════════════════════════════
          NEW INVOICE TAB
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'new' && (
        <div className="space-y-4">

          {flash && (
            flash.type === 'success'
              ? <TransactionSuccessAlert info={flash.info} onClose={() => setFlash(null)} />
              : <Alert type={flash.type} message={flash.msg} onClose={() => setFlash(null)} />
          )}

          {/* ── MOBILE ONLY: sticky total bar ─────────────────────────
              display:none on desktop via CSS (.pos-mobile-total-bar)   */}
          <div className="pos-mobile-total-bar">
            <div>
              <div className="pmb-label">Total Payable</div>
              <div className="pmb-amount">{fmt(grandTotal)}</div>
            </div>
            <div className="pmb-meta">
              {rows.filter(r => r.product_id).length} item(s)
              {discountAmt > 0 && ` · −${fmt(discountAmt)} off`}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              ROW 1: Customer info card + Total payable card
              DESKTOP: "1fr 280px" grid — pixel-perfect to original
              MOBILE:  pos-grid-main collapses to 1fr; pos-total-card-desktop hidden
          ════════════════════════════════════════════════════════════ */}
          <div className="pos-grid-main">

            {/* ── Customer info card ──────────────────────────────────── */}
            <div className="pos-card">

              {/* Card title — on mobile also acts as accordion toggle */}
              <div
                className="pos-card-title pos-accordion-header"
                onClick={() => setCustomerOpen(v => !v)}
              >
                <User size={14} className="text-brand" />
                Customer Information

                {/* MOBILE ONLY: compact summary when collapsed */}
                <div className="pos-customer-summary pos-mobile-only">
                  <div className="pos-customer-summary-avatar">{customerInitials}</div>
                  <div>
                    <div className="pos-customer-summary-name">
                      {selectedCustomer?.name || ''}
                    </div>
                    {selectedCustomer?.phone && (
                      <div className="pos-customer-summary-meta">{selectedCustomer.phone}</div>
                    )}
                  </div>
                </div>

                {/* MOBILE ONLY: chevron */}
                <ChevronDown
                  size={16}
                  className="pos-accordion-chevron pos-mobile-only-chevron"
                  style={{ transform: customerOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .22s' }}
                />
              </div>

              {/* Body — always visible on desktop; collapses on mobile */}
              <div className={`pos-accordion-body ${customerOpen ? 'pos-accordion-body--open' : 'pos-accordion-body--closed'}`}>
                <div className="pos-customer-grid">

                  {/* Party selector — now required (see onSubmit validation below) */}
                  <div className="pos-span2">
                    <FieldLabel icon={<User size={11}/>}>Party <span style={{ color: 'var(--danger,#dc2626)' }}>*</span></FieldLabel>
                    <div className="flex gap-2 items-stretch">
                      <div className="relative flex-1">
                        <select id="pos-customer-select" className="erp-input pos-select" required {...register('customer_id')}>
                          <option value="">Select a customer…</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.code ? `${c.code} - ` : ''}{c.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
                      </div>
                      <button
                        type="button"
                        className="pos-party-add-btn"
                        onClick={() => setShowNewCustomer(true)}
                        title="New Customer (F6)"
                        aria-label="New Customer"
                      >
                        <UserPlus size={15}/>
                      </button>
                    </div>
                  </div>

                  {/* Address — IDENTICAL to original */}
                  <div>
                    <FieldLabel icon={<MapPin size={11}/>}>Address</FieldLabel>
                    <div className="erp-input pos-readonly">
                      {selectedCustomer?.address || <span className="text-[var(--text-4)]">—</span>}
                    </div>
                  </div>

                  {/* PAN — IDENTICAL to original */}
                  <div>
                    <FieldLabel icon={<Hash size={11}/>}>PAN</FieldLabel>
                    <div className="erp-input pos-readonly">
                      {selectedCustomer?.pan_no || <span className="text-[var(--text-4)]">—</span>}
                    </div>
                  </div>

                  {/* Telephone — IDENTICAL to original */}
                  <div>
                    <FieldLabel icon={<PhoneIcon size={11}/>}>Telephone</FieldLabel>
                    <div className="erp-input pos-readonly">
                      {selectedCustomer?.phone || <span className="text-[var(--text-4)]">—</span>}
                    </div>
                  </div>

                  {/* Date — IDENTICAL to original */}
                  <div>
                    <FieldLabel icon={<CalendarDays size={11}/>}>Date</FieldLabel>
                    <input
                      type="date" className="erp-input"
                      min={lastInvDate || undefined}
                      {...register('date')}
                    />
                  </div>

                  {/* Payment mode — IDENTICAL to original */}
                  <div className="pos-span2">
                    <FieldLabel icon={<CreditCard size={11}/>}>Payment Mode</FieldLabel>
                    <div className="flex gap-2 flex-wrap">
                      {PAYMENT_MODES.map(m => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setValue('payment_mode', m.value)}
                          className={`pos-mode-pill ${currentPayMode === m.value ? 'pos-mode-pill--active' : ''}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* ── Total payable card ──────────────────────────────────────
                pos-total-card-desktop: hidden on mobile via CSS addendum   */}
            <div className="pos-total-card pos-total-card-desktop">
              <div className="text-[11px] font-bold uppercase tracking-widest text-brand/80 mb-2">
                Total Payable
              </div>
              <div className="pos-total-amount">{fmt(grandTotal)}</div>
              <div className="w-full mt-4 space-y-0.5">
                <SummaryRow label="Sub Total"     value={fmt(subtotal)} />
                <SummaryRow label="Discount"      value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
                <SummaryRow label="Round Off"     value={`${roundOff >= 0 ? '+' : '-'}${fmt(Math.abs(roundOff))}`} muted={roundOff === 0} />
                <SummaryRow label="Total Payable" value={fmt(grandTotal)} highlight large />
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              INVOICE ITEMS
              DESKTOP: InvoiceRowsTable — IDENTICAL to original
              MOBILE:  pos-table-wrap.pos-desktop-only hidden; pos-mobile-items shown
          ════════════════════════════════════════════════════════════ */}
          <div className="pos-card">
            <div className="flex items-center justify-between mb-4">
              <div className="pos-card-title">
                <ShoppingCart size={14} className="text-brand" />
                Invoice Items
              </div>
              <div className="flex items-center gap-3">
                <ScanButton context="sales" onResult={handleScanResult} />
                {/* pos-kbd-hints: hidden on mobile via CSS addendum */}
                <div className="pos-kbd-hints flex items-center gap-3 text-xs text-[var(--text-4)]" title="F2 Product · F3 Customer · F4 Batch · F5 New Product · F6 New Customer · F7 Discount · F8 Payment · F9 Save · F10 Print · Esc Close">
                  <span className="flex items-center gap-1">
                    <Kbd>F2</Kbd> Product
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>F9</Kbd> Save
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>↵</Kbd> Add row
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>Tab</Kbd> Next field
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop table — hidden on mobile */}
            <div className="pos-table-wrap pos-desktop-only">
              <InvoiceRowsTable
                ref={tableRef}
                rows={rows}
                products={products}
                onChange={setRows}
                onProductsChange={setProducts}
                showBonus
                showCC
                showDiscount={false}
              />
            </div>

            {/* Mobile product cards — hidden on desktop */}
            <div className="pos-mobile-items">
              {rows.map((row, idx) => {
                const expanded = expandedRows.has(idx)
                const toggleExpand = () => setExpandedRows(prev => {
                  const next = new Set(prev)
                  next.has(idx) ? next.delete(idx) : next.add(idx)
                  return next
                })
                const updateRow = (patch: Partial<InvoiceRow>) =>
                  setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))

                const reCalc = (overrides: Partial<{qty:number;rate:number;bonus:number;cc_pct:number}>) => {
                  const { amount, cc_amount } = calcRowAmount({
                    qty:          Number(overrides.qty   ?? row.qty),
                    rate:         Number(overrides.rate  ?? row.rate),
                    bonus:        Number(overrides.bonus ?? row.bonus) || 0,
                    discount_pct: Number(row.discount_pct) || 0,
                    cc_pct:       Number(overrides.cc_pct ?? row.cc_pct) || 0,
                  })
                  return { amount, cc_amount }
                }

                return (
                  <div key={idx} className="pmic">

                    {/* ── Row 1: Product search + remove button ── */}
                    <div className="pmic-header">
                      <div className="pmic-product-label">Product</div>
                      <button
                        type="button"
                        className="pmic-remove"
                        onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove item"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <div className="pmic-psc-wrap">
                      <ProductSearchCell
                        value={row.product_id}
                        products={products}
                        onChange={p => {
                          const { amount, cc_amount } = reCalc({ rate: Number(p.sales_rate) })
                          // batch_no/expiry cleared: they belonged to whatever
                          // product was previously in this row, if any.
                          updateRow({ product_id: p.id, product_name: p.name, rate: p.sales_rate, amount, cc_amount, batch_no: '', expiry: '' })
                        }}
                        onCreated={p => setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])}
                      />
                    </div>

                    {/* ── Row 2: Qty · Rate · Bonus ── */}
                    <div className="pmic-fields-3">
                      <div className="pmic-field">
                        <label>Qty</label>
                        <QtyGate
                          productId={row.product_id}
                          value={row.qty === 0 ? '' : row.qty}
                          onChange={v => {
                            const qty = v === '' ? 0 : v
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

                    {/* ── Amount bar ── */}
                    <div className="pmic-amount-bar">
                      <span className="pmic-amount-label">Amount</span>
                      <span className="pmic-amount-value">{fmt(row.amount)}</span>
                    </div>

                    {/* ── Expand toggle ── */}
                    <button type="button" className="pmic-toggle" onClick={toggleExpand}>
                      <ChevronDown
                        size={13}
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
                      />
                      {expanded ? 'Hide' : 'Show'} Batch · Expiry · C.C %
                    </button>

                    {/* ── Expanded: Batch · Expiry · C.C% ── */}
                    {expanded && (
                      <div className="pmic-fields-3 pmic-extra">
                        <div className="pmic-field">
                          <label>Batch</label>
                          <BatchSelect
                            productId={row.product_id}
                            productName={row.product_name}
                            value={row.batch_no}
                            onSelect={batch => updateRow({
                              batch_no: batch.batch_no || '',
                              expiry:   batch.expiry_date || batch.expiry || '',
                            })}
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
                        <div className="pmic-field">
                          <label>C.C %</label>
                          <input
                            type="number" inputMode="decimal" min={0} step="0.01"
                            value={row.cc_pct === 0 ? '' : row.cc_pct}
                            placeholder="0"
                            onChange={e => {
                              const cc_pct = e.target.value === '' ? 0 : Number(e.target.value)
                              updateRow({ cc_pct, ...reCalc({ cc_pct }) })
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add Product button */}
              <button
                type="button"
                className="pmic-add-btn"
                onClick={() => setRows(prev => [...prev, newRow()])}
              >
                <Plus size={15}/> Add Product
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              BILLING SUMMARY          {/* ════════════════════════════════════════════════════════════
              BILLING SUMMARY — IDENTICAL to original on desktop
              Mobile: collapsible accordion
          ════════════════════════════════════════════════════════════ */}
          <div className="pos-card">
            {/* Title — on mobile also acts as accordion toggle */}
            <div
              className="pos-card-title pos-accordion-header mb-4"
              onClick={() => setBillingOpen(v => !v)}
            >
              <CreditCard size={14} className="text-brand"/>
              Billing Summary
              {/* Mobile only: grand total preview when collapsed */}
              {!billingOpen && (
                <span className="pos-mobile-only ml-auto font-mono font-bold text-sm text-[var(--text)]">
                  {fmt(grandTotal)}
                </span>
              )}
              <ChevronDown
                size={16}
                className="pos-accordion-chevron pos-mobile-only-chevron"
                style={{ transform: billingOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .22s' }}
              />
            </div>

            <div className={`pos-accordion-body ${billingOpen ? 'pos-accordion-body--open' : 'pos-accordion-body--closed'}`}>
              {/* Totals breakdown — mobile only. On desktop this same
                  breakdown already lives in the sidebar Total Payable card
                  (.pos-total-card-desktop); showing it again here too would
                  duplicate it, since that card is hidden on mobile. */}
              <div className="pos-mobile-only w-full space-y-0.5 mb-4">
                <SummaryRow label="Sub Total"     value={fmt(subtotal)} />
                <SummaryRow label="Discount"      value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
                <SummaryRow label="Round Off"     value={`${roundOff >= 0 ? '+' : '-'}${fmt(Math.abs(roundOff))}`} muted={roundOff === 0} />
                <SummaryRow label="Total Payable" value={fmt(grandTotal)} highlight large />
              </div>

              {/* Grid — IDENTICAL to original */}
              <div className="pos-billing-grid">

                {/* Discount Scope selector — replaces the old inline % input.
                    Actual discount values are entered in the Discount
                    Review popup (Next / F7 / F12) once the invoice is
                    complete. Only one scope can be active at a time. */}
                <div className="pos-summary-block">
                  <div className="pos-summary-block-icon" style={{ background: '#fef3c7' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8h12M8 2v12" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="5" cy="5" r="1.5" fill="#d97706" opacity=".5"/>
                      <circle cx="11" cy="11" r="1.5" fill="#d97706" opacity=".5"/>
                    </svg>
                  </div>
                  <div className="space-y-3 w-full">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1" title="Shortcut: F7">Discount Scope <Kbd>F7</Kbd></div>
                      <div className="flex gap-1.5 flex-wrap">
                        {([
                          { id: 'invoice', label: 'Invoice' },
                          { id: 'company', label: 'Company / Manufacturer' },
                          { id: 'product', label: 'Product' },
                        ] as const).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleDiscountScopeChange(opt.id)}
                            className={`pos-mode-pill ${discountScope === opt.id ? 'pos-mode-pill--active' : ''}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-0.5">Discount Amount</div>
                      <div className="text-lg font-bold text-amber-600">{fmt(discountAmt)}</div>
                    </div>
                  </div>
                </div>

                {/* Payment / Tender block — IDENTICAL to original */}
                <div className="pos-summary-block">
                  <div className="pos-summary-block-icon" style={{ background: '#f0fdf4' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="#16a34a" strokeWidth="1.5"/>
                      <path d="M8 5v1.5M8 9.5V11M6.5 8a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 9.5 8 1.5 1.5 0 0 0 8 6.5" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1" title="Shortcut: F8">Tender Amount <Kbd>F8</Kbd></div>
                      <input
                        id="pos-tender-input"
                        type="number" className="erp-input pmic-billing-input text-right"
                        step="0.01" min="0" placeholder="0.00"
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

              {!tender && (
                <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-4)]">
                  <AlertCircle size={12}/>
                  Enter tender amount to calculate change.
                </div>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
              ACTION BUTTONS
              DESKTOP: shown — IDENTICAL to original
              MOBILE:  hidden via CSS (.pos-desktop-actions)
          ════════════════════════════════════════════════════════════ */}
          <div className="pos-desktop-actions flex items-center justify-between pt-1 pb-2">
            <button type="button" onClick={clearForm} className="pos-action-btn pos-action-btn--clear" title="Clear (Ctrl+N)">
              <RotateCcw size={14}/> Clear
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDraft} className="pos-action-btn pos-action-btn--draft" title="Save Draft">
                <Save size={14}/> Save Draft
              </button>
              <button
                type="button" onClick={handleNextClick} disabled={saving}
                className="pos-action-btn pos-action-btn--post" title="Next — Review Discount (F12)"
              >
                {saving ? <span className="pos-spinner"/> : <FileText size={14}/>}
                {saving ? 'Posting…' : 'Next (F12)'}
              </button>
            </div>
          </div>

          {/* ── MOBILE ONLY: FAB ──────────────────────────────────────── */}
          <button type="button" className="pos-fab" onClick={() => setRows(prev => [...prev, newRow()])} aria-label="Add product">
            <Plus size={22}/>
          </button>

          {/* ── MOBILE ONLY: sticky bottom action bar ─────────────────── */}
          <div className="pos-mobile-actionbar">
            <button type="button" className="pma-draft" onClick={saveDraft} title="Save Draft">
              <Save size={20}/>
            </button>
            <button type="button" className="pma-post" onClick={handleNextClick} disabled={saving}>
              {saving
                ? <><span className="pos-spinner"/> Posting…</>
                : <><FileText size={16}/> Next — {fmt(grandTotal)}</>
              }
            </button>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          INVOICE LIST
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div>
          {/* Search bar — full width on mobile */}
          <div className="sil-search-bar">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="sil-search-input"/>
          </div>

          {/* ── DESKTOP: full table ─────────────────────────────────── */}
          <div className="table-card sil-desktop-table">
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
                    ? <SkeletonRows cols={10}/>
                    : sales.length
                      ? sales.map(s => (
                          <tr key={s.id} className="clickable" onClick={() => setDetailId(s.id)}>
                            <td className="td-mono text-brand">{s.invoice_no}</td>
                            <td className="td-mono">{fmtDate(s.date_ad)}</td>
                            <td>{s.party_name}</td>
                            <td className="td-right">{fmt(s.net_total)}</td>
                            <td className="td-right text-green-700">{fmt(s.paid_amount)}</td>
                            <td className={`td-right ${Number(s.due_amount) > 0 ? 'text-amber-600' : ''}`}>{fmt(s.due_amount)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <EditablePaymentMode sale={s} onSaved={handlePaymentModeSaved}/>
                            </td>
                            <td><Badge status={s.status}/></td>
                            <td onClick={e => e.stopPropagation()}>
                              <PostingStatusBadge sourceType="SALE" sourceId={s.id} compact/>
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                              <Button variant="secondary" size="sm" icon={<Printer size={13}/>}
                                onClick={async () => {
                                  try {
                                    const res = await salesAPI.get(s.id)
                                    const d = res.data.data
                                    setPrintData({
                                      voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
                                      paymentMode: d.payment_mode, partyName: d.party_name,
                                      items: (d.items||[]).map((it: any) => ({
                                        product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
                                        qty: Number(it.qty), bonus: Number(it.bonus)||0, rate: Number(it.rate),
                                        discount_pct: Number(it.discount_pct)||0, cc_pct: Number(it.cc_pct)||0,
                                        cc_amount: Number(it.cc_amount)||0, amount: Number(it.amount),
                                      })),
                                      subtotal: Number(d.subtotal||0), ccAmount: Number(d.cc_amount||0),
                                      roundOff: Number(d.round_off) || 0,
                                      netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount), dueAmount: Number(d.due_amount),
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
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
          </div>

          {/* ── MOBILE: card list ───────────────────────────────────── */}
          <div className="sil-mobile-list">
            {loading ? (
              <div className="sil-loading">
                {[1,2,3,4,5].map(i => <div key={i} className="sil-card sil-card-skeleton"/>)}
              </div>
            ) : sales.length === 0 ? (
              <Empty message="No sales found"/>
            ) : (
              sales.map(s => (
                <div
                  key={s.id}
                  className="sil-card"
                  onClick={() => setDetailId(s.id)}
                >
                  {/* Top row: invoice no + total */}
                  <div className="sil-card-top">
                    <span className="sil-card-invno">{s.invoice_no}</span>
                    <span className="sil-card-total">{fmt(s.net_total)}</span>
                  </div>

                  {/* Customer + date row */}
                  <div className="sil-card-sub">
                    <span className="sil-card-customer">{s.party_name || ''}</span>
                    <span className="sil-card-date">{fmtDate(s.date_ad)}</span>
                  </div>

                  {/* Chips row: mode, status, paid, due */}
                  <div className="sil-card-chips">
                    <EditablePaymentMode sale={s} onSaved={handlePaymentModeSaved}/>
                    <Badge status={s.status}/>
                    {Number(s.paid_amount) > 0 && (
                      <span className="sil-chip sil-chip-paid">Paid {fmt(s.paid_amount)}</span>
                    )}
                    {Number(s.due_amount) > 0 && (
                      <span className="sil-chip sil-chip-due">Due {fmt(s.due_amount)}</span>
                    )}
                    <PostingStatusBadge sourceType="SALE" sourceId={s.id} compact/>
                  </div>

                  {/* Action buttons — stop propagation so tap doesn't open detail */}
                  <div className="sil-card-actions" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="secondary" size="sm" icon={<Printer size={13}/>}
                      onClick={async () => {
                        try {
                          const res = await salesAPI.get(s.id)
                          const d = res.data.data
                          setPrintData({
                            voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
                            paymentMode: d.payment_mode, partyName: d.party_name,
                            items: (d.items||[]).map((it: any) => ({
                              product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
                              qty: Number(it.qty), bonus: Number(it.bonus)||0, rate: Number(it.rate),
                              discount_pct: Number(it.discount_pct)||0, cc_pct: Number(it.cc_pct)||0,
                              cc_amount: Number(it.cc_amount)||0, amount: Number(it.amount),
                            })),
                            subtotal: Number(d.subtotal||0), ccAmount: Number(d.cc_amount||0),
                            roundOff: Number(d.round_off) || 0,
                            netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount), dueAmount: Number(d.due_amount),
                          })
                        } catch (e: any) { error('Print failed', e.message) }
                      }}
                    >Print</Button>
                    {s.status === 'active' && (
                      <Button variant="danger" size="sm" onClick={() => setConfirmCancel(s.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              ))
            )}
            <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}/>
          </div>
        </div>
      )}

      {/* ── Detail modal — IDENTICAL to original ──────────────────────── */}
      <Modal
        open={!!detailId} onClose={() => setDetailId(null)}
        title={detail ? `Invoice: ${detail.invoice_no}` : 'Loading…'} size="lg"
        footer={detail && (
          <Button variant="primary" size="sm" icon={<Printer size={13}/>}
            onClick={() => {
              const d = detail; setDetailId(null)
              setTimeout(() => setPrintData({
                voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
                paymentMode: d.payment_mode, partyName: d.party_name,
                items: (d.items||[]).map((it: any) => ({
                  product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
                  qty: Number(it.qty), bonus: Number(it.bonus)||0, rate: Number(it.rate),
                  discount_pct: Number(it.discount_pct)||0, cc_pct: Number(it.cc_pct)||0,
                  cc_amount: Number(it.cc_amount)||0, amount: Number(it.amount),
                })),
                netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount), dueAmount: Number(d.due_amount),
                roundOff: Number(d.round_off) || 0,
              }), 50)
            }}
          >Print Invoice</Button>
        )}
      >
        {detail && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                ['Party', detail.party_name], ['Date', fmtDate(detail.date_ad)],
                ['Payment', detail.payment_mode], ['Status', ''],
                ['Round Off', fmt(detail.round_off ?? 0)],
                ['Net Total', fmt(detail.net_total)], ['Due', fmt(detail.due_amount)],
              ].map(([label, val], i) => (
                <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">{label}</div>
                  {label === 'Status' ? <Badge status={detail.status}/> : <div className="font-semibold text-sm text-[var(--text)]">{val}</div>}
                </div>
              ))}
            </div>
            <div className="table-card">
              <table className="erp-table items-table">
                <thead><tr>
                  <th>Product</th><th>Batch</th><th>Expiry</th>
                  <th className="td-right">Qty</th><th className="td-right">Rate</th><th className="td-right">Amount</th>
                </tr></thead>
                <tbody>
                  {(detail.items||[]).map((it, i) => (
                    <tr key={i}>
                      <td>{it.product_name}</td>
                      <td className="td-mono">{it.batch_no||'—'}</td>
                      <td className="td-mono">{it.expiry||'—'}</td>
                      <td className="td-right">{it.qty}</td>
                      <td className="td-right">{fmt(it.rate)}</td>
                      <td className="td-right font-semibold">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {Number(detail.round_off) !== 0 && (
                    <tr>
                      <td colSpan={5} className="text-right font-semibold text-xs pr-3 text-[var(--text-3)]">ROUND OFF</td>
                      <td className="td-right font-semibold text-xs text-[var(--text-3)]">
                        {Number(detail.round_off) > 0 ? '+' : '−'}{fmt(Math.abs(Number(detail.round_off)))}
                      </td>
                    </tr>
                  )}
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

      {/* ── Dialogs — IDENTICAL to original ──────────────────────────── */}
      <DiscountReviewModal
        open={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        scope={discountScope}
        rows={rows}
        products={products}
        subtotal={subtotal}
        invoiceDiscount={invoiceDiscount}
        onInvoiceDiscountChange={setInvoiceDiscount}
        companyDiscounts={companyDiscounts}
        onCompanyDiscountChange={(key, entry) => setCompanyDiscounts(prev => ({ ...prev, [key]: entry }))}
        productDiscounts={productDiscounts}
        onProductDiscountChange={(rowId, entry) => setProductDiscounts(prev => ({ ...prev, [rowId]: entry }))}
        onClearAll={handleClearDiscount}
        onPost={onSubmit}
        posting={saving}
      />
      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && cancelSale(confirmCancel)}
        title="Cancel Sale" message="Are you sure you want to cancel this sale? This action cannot be undone." danger
      />
      <PrintPreviewModal
        data={printData} open={!!printData}
        onClose={() => setPrintData(null)}
        onNextBill={() => {
          setPrintData(null); setRows([newRow()]); setTender('')
          reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', notes: '' })
          setDiscountScope('invoice'); setInvoiceDiscount(emptyDiscount())
          setCompanyDiscounts({}); setProductDiscounts({})
        }}
      />
      {/* Fires automatically the moment a sale posts (printData is set in
          onSubmit above), independent of whether the print preview modal
          above is ever opened — see AutoCloudBackup.tsx. */}
      <AutoCloudBackup data={printData} />

      {showNewCustomer && (
        <QuickAddPartyModal
          type="customer"
          existingNames={customers.map(c => c.name)}
          onClose={() => setShowNewCustomer(false)}
          onSave={party => {
            setCustomers(prev => prev.some(x => x.id === party.id) ? prev : [...prev, party])
            setValue('customer_id', party.id)
            setShowNewCustomer(false)
            // No extra focus call needed — the existing customerId watcher
            // above already collapses the accordion and focuses the
            // product search the moment customer_id goes from '' to a
            // real value, regardless of whether that came from the
            // <select> or from here.
          }}
        />
      )}

    </div>
  )
}
