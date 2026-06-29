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
import { motion, AnimatePresence } from 'framer-motion'
import {
  Printer, FilePlus, List, FileText, ShoppingCart,
  CalendarDays, CreditCard, User, MapPin, Hash,
  Phone as PhoneIcon, ChevronDown, AlertCircle,
  CheckCircle2, RotateCcw, Save, Plus,
} from 'lucide-react'
import { salesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import {
  Button, Tabs, Modal, Badge, Pagination,
  SkeletonRows, Empty, SearchInput, ConfirmDialog,
} from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import ProductSearchCell from '@/components/forms/ProductSearchCell'
import { fmt, fmtDate, calcRowAmount } from '@/utils'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { PAYMENT_MODES } from '@/constants'
import type { Product, Party, Sale } from '@/types'
import PostingStatusBadge from '@/components/PostingStatusBadge'

const LIMIT = 20

/* ── Flash — IDENTICAL to original ──────────────────────────────────────── */
function Flash({ type, msg, onClose }: { type: 'success'|'danger'; msg: string; onClose: () => void }) {
  const isOk = type === 'success'
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium mb-4 ${
        isOk ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      {isOk
        ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
        : <AlertCircle   size={16} className="text-red-500 flex-shrink-0" />
      }
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100 transition-opacity text-lg leading-none">×</button>
    </motion.div>
  )
}

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

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function SalesPage() {
  const { success, error, theme } = useUIStore()
  const [tab, setTab] = useState('new')

  const [customers, setCustomers] = useState<Party[]>([])
  const [products,  setProducts]  = useState<Product[]>([])

  const [sales,   setSales]   = useState<Sale[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(false)

  const [rows,        setRows]        = useState<InvoiceRow[]>([newRow()])
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState<{ type: 'success'|'danger'; msg: string } | null>(null)
  const [lastInvDate, setLastInvDate] = useState<string | null>(null)
  const [printData,   setPrintData]   = useState<PrintData | null>(null)
  const [detailId,    setDetailId]    = useState<string | null>(null)
  const [detail,      setDetail]      = useState<Sale | null>(null)
  const [tender,      setTender]      = useState<number | ''>('')

  // Mobile accordion states (ignored on desktop — CSS keeps bodies visible)
  const [customerOpen, setCustomerOpen] = useState(true)
  const [billingOpen,  setBillingOpen]  = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const [confirmPost,   setConfirmPost]   = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  // ── Scanner — UNCHANGED ───────────────────────────────────────────────
  const handleScanResult = useCallback((result: ScanResult) => {
    const p   = result.product
    const row = newRow()
    row.product_id   = p.id
    row.product_name = p.name
    row.rate         = p.sales_rate
    row.cc_pct       = p.cc_pct ?? 0
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

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      customer_id: '', date: new Date().toISOString().split('T')[0],
      payment_mode: 'cash', discount_pct: 0, notes: '',
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

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    salesAPI.get(detailId).then(r => setDetail(r.data.data)).catch(() => setDetail(null))
  }, [detailId])

  useEffect(() => {
    salesAPI.list({ limit: 1, status: 'active' })
      .then(r => {
        const list = r.data?.data ?? []
        if (list.length && list[0].date_ad) setLastInvDate(list[0].date_ad)
      }).catch(() => {})
  }, [])

  // ── Calculations — ALL UNCHANGED ──────────────────────────────────────
  const discountPct      = Number(watch('discount_pct')) || 0
  const customerId       = watch('customer_id')
  const currentPayMode   = watch('payment_mode')
  const selectedCustomer = customers.find(c => c.id === customerId)
  const subtotal         = rows.reduce((s, r) => s + r.amount, 0)
  const discountAmt      = subtotal * (discountPct / 100)
  const netTotal         = subtotal - discountAmt
  const change           = typeof tender === 'number' && tender > 0 ? Math.max(0, tender - netTotal) : 0

  // Auto-collapse customer accordion + focus product search on mobile
  const prevCustId = useRef(customerId)
  useEffect(() => {
    if (prevCustId.current === '' && customerId !== '') {
      setCustomerOpen(false)
      setTimeout(() => document.querySelector<HTMLElement>('.psc-input,.psc-trigger')?.focus(), 350)
    }
    prevCustId.current = customerId
  }, [customerId])

  // ── onSubmit — UNCHANGED ──────────────────────────────────────────────
  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (lastInvDate && data.date && data.date < lastInvDate) {
      setFlash({ type: 'danger', msg: `Date cannot be earlier than the previous invoice date (${lastInvDate}).` })
      return
    }
    setSaving(true); setFlash(null)
    try {
      const res = await salesAPI.create({
        party_id: data.customer_id || undefined,
        date_ad: data.date, payment_mode: data.payment_mode,
        discount_pct: discountPct, notes: data.notes,
        items: validRows.map(r => ({
          product_id: r.product_id, product_name: r.product_name,
          batch_no: r.batch_no || undefined, expiry: r.expiry || undefined,
          qty: Number(r.qty), bonus: Number(r.bonus) || 0,
          rate: Number(r.rate), cc_pct: Number(r.cc_pct) || 0,
          amount: r.amount, cc_amount: r.cc_amount,
        })),
      })
      const saved = res.data.data
      setPrintData({
        voucherNo: saved.invoice_no, type: 'SALE',
        date: saved.date_ad || saved.date_bs || data.date,
        paymentMode: saved.payment_mode,
        partyName: customers.find(c => c.id === data.customer_id)?.name,
        items: validRows.map(r => ({
          product_name: r.product_name, batch_no: r.batch_no, expiry: r.expiry,
          qty: Number(r.qty), bonus: Number(r.bonus) || 0, rate: Number(r.rate),
          discount_pct: Number(r.discount_pct) || 0, cc_pct: Number(r.cc_pct) || 0,
          cc_amount: Number(r.cc_amount) || 0, amount: Number(r.amount),
        })),
        subtotal: saved.subtotal, ccAmount: saved.cc_amount,
        netTotal: saved.net_total, paidAmount: saved.paid_amount, dueAmount: saved.due_amount,
      })
      setFlash({ type: 'success', msg: `Invoice ${saved.invoice_no} posted!` })
      reset(); setRows([newRow()]); setTender('')
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  function saveDraft() { setFlash({ type: 'success', msg: 'Draft saved locally.' }) }

  function clearForm() {
    reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', discount_pct: 0, notes: '' })
    setRows([newRow()]); setTender(''); setFlash(null); setCustomerOpen(true)
  }

  async function cancelSale(id: string) {
    try { await salesAPI.cancel(id); success('Sale cancelled'); loadList() }
    catch (e: any) { error('Cannot cancel', e.message) }
  }

  function handlePostClick() {
    const v = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!v.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    setConfirmPost(true)
  }

  const tabList = [
    { id: 'new',  label: 'New Invoice',  icon: <FilePlus size={14}/> },
    { id: 'list', label: 'All Invoices', icon: <List size={14}/> },
  ]

  // Initials for mobile customer avatar
  const customerInitials = selectedCustomer?.name
    ? selectedCustomer.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'WI'

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

          <AnimatePresence>
            {flash && <Flash type={flash.type} msg={flash.msg} onClose={() => setFlash(null)} />}
          </AnimatePresence>

          {/* ── MOBILE ONLY: sticky total bar ─────────────────────────
              display:none on desktop via CSS (.pos-mobile-total-bar)   */}
          <div className="pos-mobile-total-bar">
            <div>
              <div className="pmb-label">Total Payable</div>
              <div className="pmb-amount">{fmt(netTotal)}</div>
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
                      {selectedCustomer?.name || 'Walk-in Customer'}
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

                  {/* Party selector — IDENTICAL to original */}
                  <div className="pos-span2">
                    <FieldLabel icon={<User size={11}/>}>Party</FieldLabel>
                    <div className="relative">
                      <select className="erp-input pos-select" {...register('customer_id')}>
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
              <div className="pos-total-amount">{fmt(netTotal)}</div>
              <div className="w-full mt-4 space-y-0.5">
                <SummaryRow label="Sub Total"     value={fmt(subtotal)} />
                <SummaryRow label="Discount"      value={`-${fmt(discountAmt)}`} muted={discountAmt === 0} />
                <SummaryRow label="Total Payable" value={fmt(netTotal)} highlight large />
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
                <div className="pos-kbd-hints flex items-center gap-3 text-xs text-[var(--text-4)]">
                  <span className="flex items-center gap-1">
                    <kbd className="pos-kbd">↵</kbd> Add row
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="pos-kbd">Tab</kbd> Next field
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop table — hidden on mobile */}
            <div className="pos-table-wrap pos-desktop-only">
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
                          updateRow({ product_id: p.id, product_name: p.name, rate: p.sales_rate, amount, cc_amount })
                        }}
                        onCreated={p => setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p])}
                      />
                    </div>

                    {/* ── Row 2: Qty · Rate · Bonus ── */}
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
                  {fmt(netTotal)}
                </span>
              )}
              <ChevronDown
                size={16}
                className="pos-accordion-chevron pos-mobile-only-chevron"
                style={{ transform: billingOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .22s' }}
              />
            </div>

            <div className={`pos-accordion-body ${billingOpen ? 'pos-accordion-body--open' : 'pos-accordion-body--closed'}`}>
              {/* Grid — IDENTICAL to original */}
              <div className="pos-billing-grid">

                {/* Discount block — IDENTICAL to original */}
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
                          type="number" className="erp-input pmic-billing-input text-right"
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
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">Tender Amount</div>
                      <input
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
            <button type="button" onClick={clearForm} className="pos-action-btn pos-action-btn--clear">
              <RotateCcw size={14}/> Clear
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDraft} className="pos-action-btn pos-action-btn--draft">
                <Save size={14}/> Save Draft
              </button>
              <button
                type="button" onClick={handlePostClick} disabled={saving}
                className="pos-action-btn pos-action-btn--post"
              >
                {saving ? <span className="pos-spinner"/> : <FileText size={14}/>}
                {saving ? 'Posting…' : 'Post Invoice'}
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
            <button type="button" className="pma-post" onClick={handlePostClick} disabled={saving}>
              {saving
                ? <><span className="pos-spinner"/> Posting…</>
                : <><FileText size={16}/> Post Invoice — {fmt(netTotal)}</>
              }
            </button>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          INVOICE LIST — IDENTICAL to original
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} className="w-64"/>
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
                            <td><Badge status={s.payment_mode}/></td>
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
      <ConfirmDialog
        open={confirmPost} onClose={() => setConfirmPost(false)} onConfirm={onSubmit}
        title="Post Invoice" message={`Post invoice for ${fmt(netTotal)}? This action cannot be undone.`}
      />
      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)}
        onConfirm={() => confirmCancel && cancelSale(confirmCancel)}
        title="Cancel Sale" message="Are you sure you want to cancel this sale? This action cannot be undone." danger
      />
      <PrintPreviewModal
        data={printData} open={!!printData}
        onClose={() => { setPrintData(null); setFlash(null) }}
        onNextBill={() => {
          setPrintData(null); setFlash(null); setRows([newRow()]); setTender('')
          reset({ customer_id: '', date: new Date().toISOString().split('T')[0], payment_mode: 'cash', discount_pct: 0, notes: '' })
        }}
      />

    </div>
  )
}
