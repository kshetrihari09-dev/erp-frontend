/**
 * PurchasePage.tsx — mirrors SalesPage.tsx's layout, responsive two-step
 * mobile flow, CC % column, and Invoice/Company/Product discount workflow
 * (Next → Discount Review → confirm → post).
 *
 * What is deliberately NOT carried over from Sales: tender/change, credit
 * risk check, offline queue, previous-invoice-date rule, sale-rate defaults.
 * What is kept from the original Purchase page: supplier selection, purchase
 * rates, free-typed batch/expiry, Supplier Bill No, Scan Purchase Bill (OCR)
 * linking via source_scan_id, and the purchase-mode batch/qty components.
 *
 * Calculation order is identical to Sales and to the backend
 * (utils/purchaseCalc.js): row amount = qty × rate × (1 − disc%) + CC,
 * discount resolved per scope into discount_pct, net = round(Σ amounts).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  FilePlus, List, Printer, ChevronDown, Plus, Truck, ScanLine, AlertTriangle,
  CheckCircle2, HelpCircle, XCircle, FileText, ShoppingCart, CalendarDays,
  CreditCard, User, MapPin, Hash, Home, Phone as PhoneIcon, RotateCcw, Save,
  ArrowLeft, Trash2,
} from 'lucide-react'
import UnifiedProductInput, { type UnifiedProductInputHandle } from '@/components/forms/UnifiedProductInput'
import ProductNotFoundDialog from '@/components/scanner/ProductNotFoundDialog'
import { playSuccessBeep, playErrorBeep } from '@/utils/beep'
import ScanPurchaseBillModal from './ScanPurchaseBillModal'
import { purchasesAPI, partiesAPI, productsAPI, purchaseScansAPI } from '@/services/api'
import http from '@/services/http'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Modal, Badge, Pagination,
  SkeletonRows, Alert, Empty, SearchInput, ConfirmDialog, Kbd,
} from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow, type InvoiceRowsTableHandle } from '@/components/forms/InvoiceRowsTable'
import ProductSearchCell from '@/components/forms/ProductSearchCell'
import BatchSelect from '@/components/forms/BatchSelect'
import QtyGate from '@/components/forms/QtyGate'
import QuickAddPartyModal from '@/components/forms/QuickAddPartyModal'
import DiscountReviewModal from '@/components/forms/discount/DiscountReviewModal'
import {
  computeItemDiscounts, computeTotals, emptyDiscount, validRows as validDiscountRows,
  derivePrintDiscount, grossItemAmount,
  type DiscountScope, type DiscountEntry,
} from '@/components/forms/discount/discountUtils'
import { fmt, calcRowAmount, productCcPct } from '@/utils'
import { formatDisplayDate } from '@/utils/dateSystem'
import DateSystemInput from '@/components/shared/DateSystemInput'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Purchase } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import AutoCloudBackup from '@/components/cloudStorage/AutoCloudBackup'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import TransactionSuccessAlert, { type TransactionSuccessInfo } from '@/components/shared/TransactionSuccessAlert'

const LIMIT = 20

type Flash =
  | { type: 'danger';  msg:  string }
  | { type: 'info';    msg:  string }
  | { type: 'success'; info: TransactionSuccessInfo }

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-1.5">
      <span className="text-[var(--text-4)]">{icon}</span>
      {children}
    </label>
  )
}

/** Same Android-keyboard scroll helper SalesPage uses on its mobile rows. */
function scrollFocusedIntoView(e: React.FocusEvent<HTMLElement>) {
  const el = e.target
  setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 300)
}

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

/**
 * Builds PrintData from a saved purchase (POST response, list row or detail
 * fetch) — the same recovery SalesPage does: the saved `subtotal`/line
 * `amount` are net of discount, so the gross subtotal + discount shown on
 * the printout are derived from the saved lines (derivePrintDiscount),
 * never recomputed independently. Bills saved before discounts existed
 * simply derive a 0 discount.
 */
function buildPurchasePrint(d: any, partyName?: string): PrintData {
  const items: any[] = d.items || []
  const { grossSubtotal, discountAmt } = derivePrintDiscount(items)
  const itemCC = items.reduce((s, it) => s + (Number(it.cc_amount) || 0), 0)
  return {
    voucherNo:   d.bill_no,
    type:        'PURCHASE',
    date:        d.date_ad,
    paymentMode: d.payment_mode,
    partyName:   partyName ?? (d.party_name || '—'),
    narration:   d.supplier_bill_no ? `Supplier Bill: ${d.supplier_bill_no}` : undefined,
    items: items.map((it: any) => ({
      product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
      qty: Number(it.qty), bonus: Number(it.bonus) || 0, rate: Number(it.rate),
      discount_pct: Number(it.discount_pct) || 0, cc_pct: Number(it.cc_pct) || 0,
      cc_amount: Number(it.cc_amount) || 0, amount: grossItemAmount(it.qty, it.rate),
    })),
    subtotal:    grossSubtotal,
    discountAmt,
    ccAmount:    Number(d.cc_amount) || itemCC,
    roundOff:    Number(d.round_off) || 0,
    netTotal:    Number(d.net_total),
    paidAmount:  Number(d.paid_amount),
    dueAmount:   Number(d.due_amount),
  }
}

export default function PurchasePage() {
  const { error, info, theme, dateMode } = useUIStore()
  const [tab, setTab] = useState('new')
  const tableRef = useRef<InvoiceRowsTableHandle>(null)

  const [suppliers,  setSuppliers]  = useState<Party[]>([])
  const [products,   setProducts]   = useState<Product[]>([])
  const [purchases,  setPurchases]  = useState<Purchase[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [rows,       setRows]       = useState<InvoiceRow[]>([newRow()])
  const [saving,     setSaving]     = useState(false)
  const [flash,      setFlash]      = useState<Flash | null>(null)
  const [printData,  setPrintData]  = useState<PrintData | null>(null)
  const [detailId,   setDetailId]   = useState<string | null>(null)
  const [detail,     setDetail]     = useState<Purchase | null>(null)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [showNewSupplier, setShowNewSupplier] = useState(false)

  // ── Scan Purchase Bill (OCR review state) ────────────────────────────
  // sourceScanId is threaded onto purchasesAPI.create() as source_scan_id —
  // the ONLY effect a scan has on saving a purchase. scanReview is purely
  // for the banner below and never reaches the API payload.
  const [showScanModal, setShowScanModal] = useState(false)
  const [sourceScanId, setSourceScanId] = useState<string | null>(null)
  const [scanReview, setScanReview] = useState<any | null>(null)

  // Mobile: which rows have Batch/Expiry expanded (batch is free-typed on a
  // purchase, so unlike Sales it needs a visible field — see the row below).
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Phone-width detection — same pattern/cutoff as SalesPage (drives only
  // the scan input's placeholder text).
  const [barcodeInputWidth, setBarcodeInputWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  useEffect(() => {
    const onResize = () => setBarcodeInputWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  const isPhoneWidth = barcodeInputWidth <= 767

  // Mobile accordion + two-step flow (UI-only; desktop ignores — see
  // globals.css `.sales-two-step`).
  const [supplierOpen, setSupplierOpen] = useState(true)
  const [billingOpen,  setBillingOpen]  = useState(true)
  const [mobileStep, setMobileStep] = useState<1 | 2>(1)

  // ── Discount Review workflow (identical state shape to SalesPage) ─────
  const [discountScope,     setDiscountScope]     = useState<DiscountScope>('invoice')
  const [invoiceDiscount,   setInvoiceDiscount]   = useState<DiscountEntry>(emptyDiscount())
  const [companyDiscounts,  setCompanyDiscounts]  = useState<Record<string, DiscountEntry>>({})
  const [productDiscounts,  setProductDiscounts]  = useState<Record<number, DiscountEntry>>({})
  const [discountModalOpen, setDiscountModalOpen] = useState(false)

  // ── Unified product entry (scan / search / camera / QR) ───────────────
  const unifiedInputRef = useRef<UnifiedProductInputHandle>(null)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [accountMismatchMsg, setAccountMismatchMsg] = useState<string | null>(null)
  const [flashRowId,   setFlashRowId]   = useState<number | undefined>(undefined)
  const flashTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashRow(id: number) {
    setFlashRowId(id)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashRowId(undefined), 600)
  }

  useEffect(() => {
    unifiedInputRef.current?.focus()
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }
  }, [])

  /**
   * Single resolution point for every way a product enters the bill.
   * Same dedupe-by-qty behaviour as SalesPage, but the rate defaults to the
   * product's PURCHASE rate. Batch stays blank so the purchase-mode
   * BatchSelect resolves it for the row (free-typed, nothing is silently
   * locked in).
   */
  const handleProductSelected = useCallback((p: Product) => {
    playSuccessBeep()

    const existingIdx = rows.findIndex(r => r.product_id === p.id && Number(r.qty) > 0)
    if (existingIdx !== -1) {
      const next = rows.map((r, i) => {
        if (i !== existingIdx) return r
        const qty = Number(r.qty || 0) + 1
        const { amount, cc_amount } = calcRowAmount({
          qty, rate: Number(r.rate), bonus: Number(r.bonus) || 0,
          discount_pct: Number(r.discount_pct) || 0, cc_pct: Number(r.cc_pct) || 0,
        })
        return { ...r, qty, amount, cc_amount }
      })
      setRows(next)
      setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])
      flashRow(next[existingIdx]._id)
      requestAnimationFrame(() => unifiedInputRef.current?.focusSilently())
      return
    }

    const row: InvoiceRow = { ...newRow(), _scanned: true }
    row.product_id   = p.id
    row.product_name = p.name
    row.rate         = p.purchase_rate
    row.cc_pct       = productCcPct(p)
    const { amount, cc_amount } = calcRowAmount({
      qty: row.qty, rate: Number(row.rate), bonus: 0,
      discount_pct: 0, cc_pct: Number(row.cc_pct) || 0,
    })
    row.amount = amount
    row.cc_amount = cc_amount

    const last = rows[rows.length - 1]
    const next = (last && !last.product_id) ? [...rows.slice(0, -1), row] : [...rows, row]
    setRows(next)
    setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])
    flashRow(row._id)
    requestAnimationFrame(() => unifiedInputRef.current?.focusSilently())
  }, [rows])

  const handleProductNotFound = useCallback((code: string) => {
    playErrorBeep()
    setNotFoundCode(code)
  }, [])

  const handleAccountMismatch = useCallback((message: string) => {
    playErrorBeep()
    setAccountMismatchMsg(message)
  }, [])

  function closeAccountMismatchDialog() {
    setAccountMismatchMsg(null)
    requestAnimationFrame(() => unifiedInputRef.current?.focus())
  }

  function closeNotFoundDialog() {
    setNotFoundCode(null)
    requestAnimationFrame(() => unifiedInputRef.current?.focus())
  }

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      supplier_id: '', date: new Date().toISOString().split('T')[0],
      payment_mode: 'credit', supplier_bill_no: '', notes: '',
    },
  })

  /**
   * Populates the SAME form/rows state manual entry uses. rate/qty/bonus/
   * cc_pct are copied in as scanned; calcRowAmount computes amount/
   * cc_amount exactly as it would for a row typed by hand, and the backend
   * recomputes again from scratch on save. The scanner never writes a
   * pre-computed amount into a row.
   */
  function handleScanExtracted(scanId: string, extracted: any) {
    const supplierId = extracted?.supplier_match?.party_id
    if (supplierId) setValue('supplier_id', supplierId)
    const invDate = extracted?.header?.invoice_date?.value
    if (invDate && /^\d{4}-\d{2}-\d{2}$/.test(invDate)) setValue('date', invDate)
    const invoiceNo = extracted?.header?.invoice_no?.value
    if (invoiceNo) setValue('supplier_bill_no', invoiceNo)

    const items = extracted?.items || []
    if (items.length) {
      const newRows: InvoiceRow[] = items.map((it: any) => {
        const productId = it.match?.product_id || ''
        const { amount, cc_amount } = calcRowAmount({
          qty: Number(it.qty) || 0, rate: Number(it.rate) || 0,
          bonus: Number(it.free_qty) || 0, discount_pct: 0, cc_pct: Number(it.cc_pct) || 0,
        })
        return {
          ...newRow(),
          product_id: productId,
          // Kept even when unmatched — the scanned name is what the user
          // needs to see to pick the right product manually.
          product_name: it.product_name || '',
          batch_no: it.batch_no || '',
          expiry: it.expiry || '',
          qty: Number(it.qty) || 1,
          bonus: Number(it.free_qty) || 0,
          rate: it.rate ?? '',
          cc_pct: Number(it.cc_pct) || 0,
          amount,
          cc_amount,
        }
      })
      setRows(newRows)
    }

    // A fresh scan starts from a clean discount state — values entered for
    // the previous rows no longer refer to anything.
    resetDiscounts()
    setSourceScanId(scanId)
    setScanReview(extracted)
  }

  function resetDiscounts() {
    setDiscountModalOpen(false)
    setDiscountScope('invoice'); setInvoiceDiscount(emptyDiscount())
    setCompanyDiscounts({}); setProductDiscounts({})
  }

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

  // ── Calculations — same order as SalesPage ───────────────────────────
  const supplierId       = watch('supplier_id')
  const currentPayMode   = watch('payment_mode')
  const selectedSupplier = suppliers.find(s => s.id === supplierId)
  const subtotal         = rows.reduce((s, r) => s + r.amount, 0)
  const ccTotal          = rows.reduce((s, r) => s + (Number(r.cc_amount) || 0), 0)
  const itemCount        = rows.filter(r => r.product_id).length

  const { totalDiscount: discountAmt } = computeItemDiscounts(
    rows, products, discountScope, invoiceDiscount, companyDiscounts, productDiscounts,
  )
  // Display only — the server recomputes the authoritative round off
  // (same nearest-whole-number rule) and saves it with the bill.
  const { roundOff, grandTotal } = computeTotals(rows, discountAmt)

  const supplierInitials = selectedSupplier?.name
    ? selectedSupplier.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : ''

  // Collapse supplier accordion + jump to product entry once a supplier is chosen (mobile).
  const prevSupId = useRef(supplierId)
  useEffect(() => {
    if (prevSupId.current === '' && supplierId !== '') {
      setSupplierOpen(false)
      setTimeout(() => document.querySelector<HTMLElement>('.psc-input,.psc-trigger')?.focus(), 350)
    }
    prevSupId.current = supplierId
  }, [supplierId])

  // ── Submit ────────────────────────────────────────────────────────────
  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (!data.payment_mode) { setFlash({ type: 'danger', msg: 'Please select a payment mode.' }); return }
    setSaving(true); setFlash(null)
    // Final per-line discount_pct from whichever scope is active.
    const { pctById } = computeItemDiscounts(
      rows, products, discountScope, invoiceDiscount, companyDiscounts, productDiscounts,
    )
    try {
      const res = await purchasesAPI.create({
        party_id:         data.supplier_id || undefined,
        date_ad:          data.date,
        payment_mode:     data.payment_mode,
        supplier_bill_no: data.supplier_bill_no || undefined,
        notes:            data.notes || undefined,
        // Links the purchase back to its Scan Purchase Bill session; the
        // only thing that differs between manual and scanned purchases.
        source_scan_id:   sourceScanId || undefined,
        items: validRows.map(r => ({
          product_id:   r.product_id,
          product_name: r.product_name,
          batch_no:     r.batch_no  || undefined,
          expiry:       r.expiry    || undefined,
          qty:          Number(r.qty),
          bonus:        Number(r.bonus)   || 0,
          rate:         Number(r.rate),
          cc_pct:       Number(r.cc_pct)  || 0,
          discount_pct: pctById[r._id] || 0,
          amount:       r.amount,
        })),
      })
      const saved = res.data.data
      const supplierName = suppliers.find(s => s.id === data.supplier_id)?.name
      // Prefer the server's saved items (carrying the applied discount_pct /
      // amount) so the print preview matches exactly what was posted.
      const savedItems: any[] = Array.isArray(saved.items) && saved.items.length ? saved.items : validRows
      setPrintData(buildPurchasePrint(
        { ...saved, items: savedItems, supplier_bill_no: saved.supplier_bill_no ?? data.supplier_bill_no, date_ad: saved.date_ad || data.date },
        supplierName,
      ))
      // Success only fires after the backend confirmed the save.
      setFlash({
        type: 'success',
        info: {
          voucherLabel: 'Purchase Bill',
          voucherNo:    saved.bill_no,
          partyLabel:   'Supplier',
          partyName:    supplierName,
          grandTotal:   Number(saved.net_total),
        },
      })
      resetAfterSave()
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  function resetAfterSave() {
    reset(); setRows([newRow()])
    setSourceScanId(null); setScanReview(null)
    resetDiscounts()
    setMobileStep(1)
    requestAnimationFrame(() => unifiedInputRef.current?.focus())
  }

  function saveDraft() { setFlash({ type: 'info', msg: 'Draft saved locally.' }) }

  function clearForm() {
    setPrintData(null)
    setFlash(null)
    reset({ supplier_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'credit', supplier_bill_no: '', notes: '' })
    setRows([newRow()])
    setSourceScanId(null); setScanReview(null)
    setSupplierOpen(true)
    resetDiscounts()
    setMobileStep(1)
    requestAnimationFrame(() => unifiedInputRef.current?.focus())
  }

  // "Next (F12)" — validates the bill, then opens the Discount Review popup;
  // the popup's Post button opens the confirm dialog, which posts.
  function handleNextClick() {
    const v = validDiscountRows(rows)
    if (!v.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (!currentPayMode) { setFlash({ type: 'danger', msg: 'Please select a payment mode.' }); return }
    setFlash(null)
    setDiscountModalOpen(true)
  }

  // Mobile/tablet Step 1 → Step 2 (payment mode is chosen on Step 2; onSubmit re-validates everything).
  function goToStep2() {
    const v = validDiscountRows(rows)
    if (!v.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    setFlash(null)
    setMobileStep(2)
  }

  function handlePostClick() { setConfirmCreate(true) }

  // Changing scope clears entered discount values (confirms only if something would be lost).
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

  /* ── Keyboard shortcuts (New Purchase tab only) ───────────────────────── */
  useKeyboardShortcuts([
    { combo: 'f2',       description: 'Product search',      handler: () => tableRef.current?.focusProductSearch() },
    { combo: 'ctrl+f',   description: 'Product search',      handler: () => tableRef.current?.focusProductSearch() },
    { combo: 'f3',       description: 'Supplier search',     handler: () => document.getElementById('pur-supplier-select')?.focus() },
    { combo: 'f4',       description: 'Batch selection',     handler: () => tableRef.current?.openBatchSelect() },
    { combo: 'ctrl+b',   description: 'Batch selection',     handler: () => tableRef.current?.openBatchSelect() },
    { combo: 'f5',       description: 'New product',         handler: () => tableRef.current?.openCreateProduct() },
    { combo: 'f6',       description: 'New supplier',        handler: () => setShowNewSupplier(true) },
    { combo: 'f7',       description: 'Apply discount',      handler: handleNextClick },
    { combo: 'f8',       description: 'Payment mode',        handler: () => document.getElementById('pur-payment-mode-first')?.focus() },
    { combo: 'f9',       description: 'Next',                handler: handleNextClick },
    { combo: 'ctrl+s',   description: 'Next',                handler: handleNextClick },
    { combo: 'f12',      description: 'Next',                handler: handleNextClick },
    {
      combo: 'f10', description: 'Print bill',
      handler: () => { if (!printData) info('Nothing to print yet', 'Post a purchase first.'); },
    },
    {
      combo: 'ctrl+p', description: 'Print',
      handler: () => { if (!printData) info('Nothing to print yet', 'Post a purchase first.'); },
    },
    { combo: 'ctrl+n',     description: 'New bill',            handler: clearForm },
    { combo: 'ctrl+l',     description: 'Clear current bill',  handler: () => setRows([newRow()]) },
    { combo: 'ctrl+d',     description: 'Delete current line', handler: () => tableRef.current?.deleteRow() },
    { combo: 'ctrl+enter', description: 'Add new row',         handler: () => tableRef.current?.addRow() },
  ], { enabled: tab === 'new' })

  const tabList = [
    { id: 'new',  label: 'New Purchase',  icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Purchases', icon: <List    size={14}/> },
  ]

  async function handleListPrint(p: Purchase) {
    const full = await purchasesAPI.get(p.id).then(r => r.data.data).catch(() => null)
    setPrintData(buildPurchasePrint(full ?? p))
  }

  const scopeOptions = [
    { id: 'invoice', label: 'Invoice' },
    { id: 'company', label: 'Company / Manufacturer' },
    { id: 'product', label: 'Product' },
  ] as const

  return (
    // pos-theme + sales-two-step: the exact same scoped responsive rules
    // SalesPage uses (desktop grid, two-step mobile flow, compact item rows).
    <div
      className={`pos-theme sales-two-step ${theme === 'dark' ? 'dark' : ''}`}
      data-pos-step={mobileStep}
    >
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Purchase</h1>
        </div>
      </div>
      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {/* ══════════════════════════ NEW PURCHASE ══════════════════════════ */}
      {tab === 'new' && (
        <div className="space-y-4">
          {flash && (
            flash.type === 'success'
              ? <TransactionSuccessAlert info={flash.info} onClose={() => setFlash(null)} />
              : <Alert type={flash.type} message={flash.msg} onClose={() => setFlash(null)} />
          )}

          {/* ROW 1: Supplier info card + Total payable card */}
          <div className="pos-grid-main">

            <div className="pos-card pos-step1-only">
              <div
                className="pos-card-title pos-accordion-header"
                onClick={() => setSupplierOpen(v => !v)}
              >
                <Truck size={14} className="text-brand" />
                Supplier Information

                <div className="pos-customer-summary pos-mobile-only">
                  <div className="pos-customer-summary-avatar">{supplierInitials}</div>
                  <div>
                    <div className="pos-customer-summary-name">{selectedSupplier?.name || ''}</div>
                    {selectedSupplier?.phone && (
                      <div className="pos-customer-summary-meta">{selectedSupplier.phone}</div>
                    )}
                  </div>
                </div>

                {/* Scanner is only an input method — hidden once a scan is attached
                    (Ctrl+N / Clear brings it back). stopPropagation so tapping it
                    doesn't toggle the accordion. */}
                {!sourceScanId && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setShowScanModal(true) }}
                    className="ml-auto flex items-center gap-1.5 text-xs font-bold text-brand px-2.5 py-1.5 rounded-lg border border-brand/30 hover:bg-brand/5"
                  >
                    <ScanLine size={14} /> Scan Purchase Bill
                  </button>
                )}

                <ChevronDown
                  size={16}
                  className="pos-accordion-chevron pos-mobile-only-chevron"
                  style={{ transform: supplierOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .22s' }}
                />
              </div>

              <div className={`pos-accordion-body ${supplierOpen ? 'pos-accordion-body--open' : 'pos-accordion-body--closed'}`}>
                <div className="pos-customer-grid">

                  <div className="pos-span2">
                    <FieldLabel icon={<Truck size={11}/>}>Supplier</FieldLabel>
                    <div className="flex gap-2 items-stretch pos-cf-party-row">
                      <div className="relative flex-1 pos-cf-select-wrap">
                        <User size={16} className="pos-cf-lead-icon" aria-hidden="true" />
                        <select id="pur-supplier-select" className="erp-input pos-select pos-cf-select" {...register('supplier_id')}>
                          <option value="">Select supplier…</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.code ? `${s.code} - ` : ''}{s.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] pos-cf-chevron" />
                      </div>
                      <button
                        type="button"
                        className="pos-party-add-btn pos-cf-add-btn"
                        onClick={() => setShowNewSupplier(true)}
                        title="New Supplier (F6)"
                        aria-label="New Supplier"
                      >
                        <Truck size={15}/>
                      </button>
                    </div>
                  </div>

                  <div className="pos-span2 pos-cf-quad">
                    <div className="pos-cf-field pos-cf-address">
                      <FieldLabel icon={<MapPin size={11}/>}>Address</FieldLabel>
                      <div className="erp-input pos-readonly pos-cf-readonly">
                        <Home size={14} className="pos-cf-lead-icon-static" aria-hidden="true" />
                        <span className="pos-cf-readonly-text">
                          {selectedSupplier?.address || <span className="text-[var(--text-4)]">—</span>}
                        </span>
                      </div>
                    </div>

                    <div className="pos-cf-field pos-cf-pan">
                      <FieldLabel icon={<Hash size={11}/>}>PAN</FieldLabel>
                      <div className="erp-input pos-readonly pos-cf-readonly">
                        <span className="pos-cf-readonly-text">
                          {selectedSupplier?.pan_no || <span className="text-[var(--text-4)]">—</span>}
                        </span>
                      </div>
                    </div>

                    <div className="pos-cf-field pos-cf-phone">
                      <FieldLabel icon={<PhoneIcon size={11}/>}>Telephone</FieldLabel>
                      <div className="erp-input pos-readonly pos-cf-readonly">
                        <span className="pos-cf-readonly-text">
                          {selectedSupplier?.phone || <span className="text-[var(--text-4)]">—</span>}
                        </span>
                        <PhoneIcon size={14} className="pos-cf-trailing-icon" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="pos-cf-field pos-cf-date">
                      <FieldLabel icon={<CalendarDays size={11}/>}>Date</FieldLabel>
                      <div className="pos-cf-date-wrap">
                        <DateSystemInput
                          className="erp-input pos-cf-date-input"
                          valueAD={watch('date')}
                          onChangeAD={(ad) => setValue('date', ad)}
                        />
                        <CalendarDays size={14} className="pos-cf-trailing-icon pos-cf-date-icon" aria-hidden="true" />
                      </div>
                    </div>
                  </div>

                  {/* Purchase-specific: the supplier's own bill number. */}
                  <div className="pos-span2">
                    <FieldLabel icon={<FileText size={11}/>}>Supplier Bill No</FieldLabel>
                    <input
                      className="erp-input w-full"
                      placeholder="Supplier's bill number"
                      {...register('supplier_bill_no')}
                    />
                  </div>

                  {/* Payment mode — desktop here; re-rendered on Step 2 for mobile/tablet. */}
                  <div className="pos-span2 pos-mt-hide">
                    <FieldLabel icon={<CreditCard size={11}/>}>Payment Mode <Kbd>F8</Kbd></FieldLabel>
                    <div className="flex gap-2 flex-wrap">
                      {PAYMENT_MODES.map((m, i) => (
                        <button
                          key={m.value}
                          id={i === 0 ? 'pur-payment-mode-first' : undefined}
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

          {/* Scan review banner — read-only summary; every value is still the same editable row below. */}
          {scanReview && (
            <div className={`pos-card border-2 ${scanReview.needs_review || scanReview.duplicate_warning ? 'border-amber-300' : 'border-green-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <ScanLine size={15} className="text-brand" />
                <span className="text-xs font-extrabold uppercase tracking-wide">Scanned Bill — Review Before Confirming</span>
              </div>

              {scanReview.duplicate_warning && (
                <div className="flex items-start gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    ⚠️ Possible Duplicate Purchase — this supplier already has bill{' '}
                    <strong>{scanReview.duplicate_warning.bill_no}</strong> dated {scanReview.duplicate_warning.date_ad} for the same invoice number.
                  </span>
                </div>
              )}

              {scanReview.flags?.grand_total_mismatch && (
                <div className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    ⚠️ CC / total mismatch — review required. Scanned Grand Total:{' '}
                    <strong>{fmt(scanReview.header?.grand_total?.value)}</strong> · Calculated Grand Total:{' '}
                    <strong>{fmt(scanReview.calculated?.grand_total)}</strong>
                  </span>
                </div>
              )}

              {!scanReview.needs_review && !scanReview.duplicate_warning && (
                <div className="flex items-center gap-2 text-xs font-semibold text-green-700">
                  <CheckCircle2 size={14} /> Scanned totals match this app's calculations.
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-2">
                {(scanReview.items || []).map((it: any, i: number) => {
                  const status = it.match?.status
                  const Icon = status === 'matched' ? CheckCircle2 : status === 'possible_match' ? HelpCircle : XCircle
                  const cls = status === 'matched' ? 'text-green-700 bg-green-50 border-green-200'
                    : status === 'possible_match' ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                  const label = status === 'matched' ? 'Matched' : status === 'possible_match' ? 'Possible Match' : 'Not Found'
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
                      <Icon size={10} /> Line {i + 1}: {label}
                      {it.flags?.cc_amount_mismatch && ' · CC ⚠️'}
                    </span>
                  )
                })}
              </div>
              <p className="text-[10px] text-[var(--text-4)] mt-2">
                Every field below is editable — fix anything the scan got wrong before confirming.
              </p>
            </div>
          )}

          {/* INVOICE ITEMS */}
          <div className="pos-card pos-step1-only">
            <div className="flex items-center justify-between mb-4 pos-invoice-header">
              <div className="pos-card-title">
                <ShoppingCart size={14} className="text-brand" />
                Purchase Items
              </div>
              <div className="flex items-center gap-3 pos-invoice-actions">
                <UnifiedProductInput
                  ref={unifiedInputRef}
                  context="purchase"
                  autoFocus
                  onProductResolved={handleProductSelected}
                  onNotFound={handleProductNotFound}
                  onAccountMismatch={handleAccountMismatch}
                  placeholder={isPhoneWidth ? 'Scan or search product…' : undefined}
                />
                <div className="pos-kbd-hints flex items-center gap-3 text-xs text-[var(--text-4)]" title="F2 Product · F3 Supplier · F4 Batch · F5 New Product · F6 New Supplier · F7 Discount · F8 Payment · F9 Next · F10 Print · Esc Close">
                  <span className="flex items-center gap-1"><Kbd>F2</Kbd> Product</span>
                  <span className="flex items-center gap-1"><Kbd>F9</Kbd> Next</span>
                  <span className="flex items-center gap-1"><Kbd>↵</Kbd> Add row</span>
                  <span className="flex items-center gap-1"><Kbd>Tab</Kbd> Next field</span>
                </div>
              </div>
            </div>

            {/* Desktop table — CC % / C.C Amount columns now on, like Sales. */}
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
                mode="purchase"
                onBarcodeRowResolved={() => unifiedInputRef.current?.focus()}
                flashRowId={flashRowId}
              />
            </div>

            {/* Mobile/tablet compact table — same pmic-row2 layout as Sales, plus a
                Batch · Expiry toggle row (batch is typed on a purchase, so it can't be hidden). */}
            <div className="pos-mobile-items pmic-table">
              {rows.length > 0 && (
                <div className="pmic-thead" aria-hidden="true">
                  <div className="pmic-th pmic-th-product">Product</div>
                  <div className="pmic-th">Qty</div>
                  <div className="pmic-th">Bonus</div>
                  <div className="pmic-th">Rate</div>
                  <div className="pmic-th">Amount</div>
                  <div className="pmic-th pmic-th-action">Action</div>
                </div>
              )}

              {rows.map((row, idx) => {
                const expanded  = expandedRows.has(row._id)
                const toggleExp = () => setExpandedRows(prev => {
                  const next = new Set(prev)
                  next.has(row._id) ? next.delete(row._id) : next.add(row._id)
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
                  <div key={row._id} className="pmic-row2" onFocusCapture={scrollFocusedIntoView}>
                    <div className="pmic-row2-product">
                      <ProductSearchCell
                        value={row.product_id}
                        products={products}
                        onChange={p => {
                          // CC% is taken from the newly selected product (not the
                          // row's previous one) and drives cc_amount below.
                          const cc_pct = productCcPct(p)
                          const { amount, cc_amount } = reCalc({ rate: Number(p.purchase_rate), cc_pct })
                          updateRow({ product_id: p.id, product_name: p.name, rate: p.purchase_rate, cc_pct, amount, cc_amount, batch_no: '', expiry: '' })
                          setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])
                        }}
                        onCreated={p => setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])}
                      />

                      <div className="pmic-row2-cc-wrap">
                        <span className="pmic-row2-cc-label">CC%</span>
                        <input
                          type="number" inputMode="decimal" min={0} step="0.01"
                          className="pmic-row2-cc-input"
                          aria-label="C.C %"
                          value={row.cc_pct === 0 ? '' : row.cc_pct}
                          placeholder="0"
                          onChange={e => {
                            const cc_pct = e.target.value === '' ? 0 : Number(e.target.value)
                            updateRow({ cc_pct, ...reCalc({ cc_pct }) })
                          }}
                        />
                      </div>
                    </div>

                    <QtyGate
                      productId={row.product_id}
                      value={row.qty === 0 ? '' : row.qty}
                      mode="purchase"
                      className="pmic-row2-input"
                      onChange={v => {
                        const qty = v === '' ? 0 : v
                        updateRow({ qty, ...reCalc({ qty }) })
                      }}
                    />

                    <input
                      type="number" inputMode="numeric" min={0} step="1"
                      className="pmic-row2-input"
                      aria-label="Bonus"
                      value={row.bonus === 0 ? '' : row.bonus}
                      placeholder="0"
                      onChange={e => {
                        const bonus = e.target.value === '' ? 0 : Number(e.target.value)
                        updateRow({ bonus, ...reCalc({ bonus }) })
                      }}
                    />

                    <input
                      type="number" inputMode="decimal" min={0} step="0.01"
                      className="pmic-row2-input"
                      aria-label="Rate"
                      value={row.rate === 0 ? '' : row.rate}
                      placeholder="0.00"
                      onChange={e => {
                        const rate = e.target.value === '' ? 0 : Number(e.target.value)
                        updateRow({ rate, ...reCalc({ rate }) })
                      }}
                    />

                    <div className="pmic-row2-amount">{fmt(row.amount)}</div>

                    <button
                      type="button"
                      className="pmic-row2-remove"
                      onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>

                    <button type="button" className="pmic-row2-extra-toggle" onClick={toggleExp}>
                      <ChevronDown
                        size={12}
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
                      />
                      {expanded ? 'Hide' : 'Show'} Batch · Expiry
                      {!expanded && (row.batch_no || row.expiry) && (
                        <span className="pmic-row2-extra-summary">{[row.batch_no, row.expiry].filter(Boolean).join(' · ')}</span>
                      )}
                    </button>

                    {expanded && (
                      <div className="pmic-row2-extra">
                        <div className="pmic-field">
                          <label>Batch</label>
                          <BatchSelect
                            productId={row.product_id}
                            productName={row.product_name}
                            value={row.batch_no}
                            mode="purchase"
                            onSelect={batch => updateRow({
                              batch_no: batch.batch_no || '',
                              expiry:   batch.expiry_date || batch.expiry || '',
                            })}
                            onTextChange={text => updateRow({ batch_no: text })}
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

              <button
                type="button"
                className="pmic-add-btn"
                onClick={() => setRows(prev => [...prev, newRow()])}
              >
                <Plus size={15}/> Add Product
              </button>
            </div>
          </div>

          {/* STEP 1 — running subtotal (mobile/tablet only) */}
          <div className="pos-card pos-step1-only pos-step1-subtotal">
            <SummaryRow label="Subtotal" value={fmt(subtotal)} highlight large />
          </div>

          {/* BILLING SUMMARY (desktop; Step 2 holds the mobile equivalent) */}
          <div className="pos-card pos-mt-hide">
            <div
              className="pos-card-title pos-accordion-header mb-4"
              onClick={() => setBillingOpen(v => !v)}
            >
              <CreditCard size={14} className="text-brand"/>
              Billing Summary
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
              <div className="pos-mobile-only w-full space-y-0.5 mb-4">
                <SummaryRow label="Sub Total"     value={fmt(subtotal)} />
                <SummaryRow label="Discount"      value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
                <SummaryRow label="Round Off"     value={`${roundOff >= 0 ? '+' : '-'}${fmt(Math.abs(roundOff))}`} muted={roundOff === 0} />
                <SummaryRow label="Total Payable" value={fmt(grandTotal)} highlight large />
              </div>

              <div className="pos-billing-grid">
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
                        {scopeOptions.map(opt => (
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

                {/* Sales' Tender/Change block has no purchase equivalent (the bill is
                    paid to a supplier, not received at a till) — CC charge sits here instead. */}
                <div className="pos-summary-block">
                  <div className="pos-summary-block-icon" style={{ background: '#f0fdf4' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="#16a34a" strokeWidth="1.5"/>
                      <path d="M8 5v1.5M8 9.5V11M6.5 8a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 9.5 8 1.5 1.5 0 0 0 8 6.5" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-0.5">CC Charge (incl. in Sub Total)</div>
                      <div className="text-lg font-bold text-[var(--text)]">{fmt(ccTotal)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-0.5">Payment</div>
                      <div className="text-sm font-bold text-[var(--text)] capitalize">{currentPayMode || '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS (desktop) */}
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

          {/* MOBILE/TABLET STEP 1: sticky action bar */}
          <div className="pos-mobile-actionbar pos-step1-only">
            <div className="pma-row">
              <button type="button" className="pma-draft" onClick={saveDraft} title="Save Draft">
                <Save size={20}/>
              </button>
              <button type="button" className="pma-post" onClick={goToStep2} disabled={saving}>
                <span className="pma-stack">
                  <span className="pma-stack-label"><FileText size={14}/> Next →</span>
                  <span className="pma-stack-sub">{itemCount} item{itemCount === 1 ? '' : 's'} • {fmt(subtotal)}</span>
                </span>
              </button>
            </div>
          </div>

          {/* STEP 2 (MOBILE/TABLET): Payment Mode → Discount → Billing Summary → Back / Post.
              Same state and handlers as the desktop blocks above. */}
          <div className="pos-step2-only pos-step2-topbar">
            <button type="button" onClick={() => setMobileStep(1)} aria-label="Back" className="pos-step2-topbar-back">
              <ArrowLeft size={20}/>
            </button>
            <div className="pos-step2-topbar-title">Payment &amp; Billing</div>
            <span
              className="pos-step2-topbar-help"
              title="Pick a payment mode, review or adjust the discount, then confirm the totals before posting."
              aria-hidden="true"
            >
              <HelpCircle size={18}/>
            </span>
          </div>
          <div className="pos-step2-only space-y-3">

            <div className="pos-card">
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

            <div className="pos-card">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1" title="Shortcut: F7">
                Discount Scope <Kbd>F7</Kbd>
              </div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {scopeOptions.map(opt => (
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
              <button type="button" className="pos-discount-tap-row" onClick={handleNextClick}>
                <span>Discount Amount</span>
                <span className="pos-discount-tap-value">{fmt(discountAmt)}</span>
              </button>
            </div>

            {/* CC is already inside `subtotal` (row.amount = base + cc), so the mobile
                breakdown splits it out for display only — Total Payable is still grandTotal. */}
            <div className="pos-card">
              <div className="pos-card-title mb-3">
                <span aria-hidden="true" style={{ fontSize: 14 }}>🧾</span> Billing Summary
              </div>
              <SummaryRow label="Subtotal"      value={fmt(subtotal - ccTotal)} />
              <SummaryRow label="Discount"      value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
              <SummaryRow label="CC Charge"     value={fmt(ccTotal)} muted={ccTotal === 0} />
              <SummaryRow label="Round Off"     value={`${roundOff >= 0 ? '+' : '-'}${fmt(Math.abs(roundOff))}`} muted={roundOff === 0} />
              <SummaryRow label="Total Payable" value={fmt(grandTotal)} highlight large />
            </div>
          </div>

          <div className="pos-mobile-actionbar pos-step2-only">
            <div className="pma-row">
              <button type="button" className="pma-draft" onClick={() => setMobileStep(1)} title="Back" aria-label="Back">
                <ArrowLeft size={20}/>
              </button>
              <button type="button" className="pma-post" onClick={handlePostClick} disabled={saving}>
                {saving ? (
                  <><span className="pos-spinner"/> Posting…</>
                ) : (
                  <span className="pma-stack">
                    <span className="pma-stack-label"><FileText size={14}/> Post Purchase →</span>
                    <span className="pma-stack-sub">{itemCount} item{itemCount === 1 ? '' : 's'} • {fmt(grandTotal)}</span>
                  </span>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════ PURCHASE LIST ══════════════════════════ */}
      {tab === 'list' && (
        <div>
          <div className="sil-search-bar">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="sil-search-input"/>
          </div>

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
                            <td className="td-mono">{formatDisplayDate(p.date_ad, dateMode)}</td>
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
                  <div className="sil-card-top">
                    <span className="sil-card-invno">{p.bill_no}</span>
                    <span className="sil-card-total">{fmt(p.net_total)}</span>
                  </div>
                  <div className="sil-card-sub">
                    <span className="sil-card-customer">{p.party_name || 'Unknown Supplier'}</span>
                    <span className="sil-card-date">{formatDisplayDate(p.date_ad, dateMode)}</span>
                  </div>
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
              setTimeout(() => setPrintData(buildPurchasePrint(d)), 50)
            }}>
            Print Bill
          </Button>
        )}
      >
        {detail && (() => {
          const dItems: any[] = detail.items || []
          const { discountAmt: dDiscount } = derivePrintDiscount(dItems as any)
          const dCC = Number(detail.cc_amount) || dItems.reduce((s, it) => s + (Number(it.cc_amount) || 0), 0)
          const showDisc = dItems.some(it => Number(it.discount_pct) > 0)
          const showCCCols = dItems.some(it => Number(it.cc_pct) > 0)
          const colSpan = 6 + (showDisc ? 1 : 0) + (showCCCols ? 1 : 0)
          return (
          <div>
            {/* Only present when this purchase came from Scan Purchase Bill — fetched as an
                authenticated blob (bearer-token auth), see ViewOriginalScanLink below. */}
            {detail.source === 'scanned' && detail.source_scan_id && (
              <div className="mb-3">
                <ViewOriginalScanLink scanId={detail.source_scan_id} />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                ['Supplier',  detail.party_name || '—'],
                ['Date',      formatDisplayDate(detail.date_ad, dateMode)],
                ['Discount',  `-${fmt(dDiscount)}`],
                ['CC Charge', fmt(dCC)],
                ['Round Off', fmt(detail.round_off ?? 0)],
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
                    <th className="td-right">Rate</th>
                    {showDisc && <th className="td-right">Disc %</th>}
                    {showCCCols && <th className="td-right">CC %</th>}
                    <th className="td-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {dItems.map((it, i) => (
                    <tr key={i}>
                      <td>{it.product_name}</td>
                      <td className="td-mono">{it.batch_no || '—'}</td>
                      <td className="td-mono">{it.expiry   || '—'}</td>
                      <td className="td-right">{it.qty}</td>
                      <td className="td-right">{it.bonus || 0}</td>
                      <td className="td-right">{fmt(it.rate)}</td>
                      {showDisc && <td className="td-right">{Number(it.discount_pct || 0).toFixed(2)}</td>}
                      {showCCCols && <td className="td-right">{Number(it.cc_pct || 0)}</td>}
                      <td className="td-right font-semibold">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {Number(detail.round_off) !== 0 && (
                    <tr>
                      <td colSpan={colSpan} className="text-right font-semibold text-xs pr-3 text-[var(--text-3)]">ROUND OFF</td>
                      <td className="td-right font-semibold text-xs text-[var(--text-3)]">
                        {Number(detail.round_off) > 0 ? '+' : '−'}{fmt(Math.abs(Number(detail.round_off)))}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={colSpan} className="text-right font-bold text-sm pr-3">NET TOTAL</td>
                    <td className="td-right font-bold text-brand">{fmt(detail.net_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          )
        })()}
      </Modal>

      <ScanPurchaseBillModal
        open={showScanModal}
        onClose={() => setShowScanModal(false)}
        onExtracted={handleScanExtracted}
      />

      <ProductNotFoundDialog code={notFoundCode} onClose={closeNotFoundDialog} />
      <ProductNotFoundDialog
        code={accountMismatchMsg}
        onClose={closeAccountMismatchDialog}
        title="QR Code Not Valid Here"
        message={accountMismatchMsg ?? undefined}
      />

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
        onPost={handlePostClick}
        posting={saving}
      />

      <ConfirmDialog
        open={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        onConfirm={onSubmit}
        title="Create Purchase"
        message={
          scanReview?.duplicate_warning
            ? `⚠️ Possible duplicate: this supplier + invoice number matches an existing purchase (${scanReview.duplicate_warning.bill_no}, dated ${scanReview.duplicate_warning.date_ad}). Create this purchase anyway?`
            : scanReview?.needs_review
              ? '⚠️ Some scanned values didn\u2019t match this app\u2019s calculations and were flagged for review above. Are you sure the figures are correct?'
              : 'Are you sure you want to create this purchase? This will update your inventory and accounts.'
        }
      />
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => setPrintData(null)}
        onNextBill={() => { setPrintData(null); clearForm() }}
      />
      <AutoCloudBackup data={printData} />

      {showNewSupplier && (
        <QuickAddPartyModal
          type="supplier"
          existingNames={suppliers.map(s => s.name)}
          onClose={() => setShowNewSupplier(false)}
          onSave={party => {
            setSuppliers(prev => prev.some(x => x.id === party.id) ? prev : [...prev, party])
            setValue('supplier_id', party.id)
            setShowNewSupplier(false)
            // The supplierId watcher above collapses the accordion and focuses
            // product entry once supplier_id goes from '' to a real value.
          }}
        />
      )}
    </div>
  )
}

/**
 * ViewOriginalScanLink — opens page 1 of a purchase's source scan
 * (spec #11's "open the original document later from Purchase History").
 *
 * Fetched as a blob via the app's own authenticated `http` client rather
 * than rendered as `<img src="...">` or `<a href="...">`: this app's
 * auth is a bearer token attached by an axios interceptor
 * (services/http.ts), which a plain browser-native src/href request
 * never carries — that request would hit the backend with no
 * Authorization header and 401. Fetching through `http` and handing the
 * browser an object URL is the only way this actually works with this
 * app's auth model.
 *
 * Multi-page bills: this opens page 1 only, with a note if there's
 * more — a full paged viewer is more UI than a "here's the original"
 * link needs, and every field on it is already editable in the form
 * that was built from it.
 */
function ViewOriginalScanLink({ scanId }: { scanId: string }) {
  const [loading, setLoading] = useState(false)
  const [pageCount, setPageCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    purchaseScansAPI.get(scanId).then(r => {
      if (!cancelled) setPageCount(r.data.data?.pages?.length ?? 1)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [scanId])

  async function open() {
    setLoading(true)
    try {
      const res = await http.get(purchaseScansAPI.pagePath(scanId, 1), { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank')
      // Revoke well after the new tab has had time to load it — an
      // immediate revoke can race the new tab's own fetch of the blob:
      // URL and leave it showing a broken image.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      // The scan's files may have been cleaned up independently of the
      // purchase record itself — fail quietly rather than blocking the
      // rest of the purchase detail view over a missing attachment.
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs font-bold text-brand px-2.5 py-1.5 rounded-lg border border-brand/30 hover:bg-brand/5 disabled:opacity-50"
    >
      <ScanLine size={13} />
      {loading ? 'Opening…' : 'View Original Scanned Bill'}
      {pageCount && pageCount > 1 && <span className="text-[10px] font-medium text-[var(--text-4)]">(page 1 of {pageCount})</span>}
    </button>
  )
}
