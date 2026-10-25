/**
 * SalesReturnBilling.tsx — the "New Return" screen: the Sales billing screen, run in reverse.
 *
 * It deliberately reuses the Sales page's building blocks and CSS (pos-theme / pos-card / pos-grid-main /
 * pos-total-card / pos-table / pmic-* / pos-action-btn / pos-mobile-actionbar), the same UnifiedProductInput
 * (hardware scanner, search, camera), the same customer card, AD/BS DateSystemInput, keyboard shortcuts,
 * not-found dialog, success alert and print preview — so a cashier who knows Sales already knows this.
 *
 * What is different — and only this:
 *   - there is NO "find the original bill" step. The user picks a customer, scans/searches the products that
 *     came back and types quantities. The SERVER links every unit to the customer's real earlier sale
 *     (POST /returns/sales[/preview] with { party_id, lines }), so the original rate, discount, VAT share and
 *     batch are used — never today's price, never a negative sale. The invoices it found are shown read-only.
 *   - rate / discount / amount are results, not inputs: they come from the server's dry run, so what is shown ==
 *     what is saved == what is printed.
 *   - the footer settles the credit (customer account / cash refund / bank refund) instead of taking a tender.
 */
import FiscalYearHint, { useFiscalYearCheck } from '@/components/forms/FiscalYearHint'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  User, MapPin, Hash, Home, Phone as PhoneIcon, CalendarDays, ChevronDown, CreditCard, ShoppingCart,
  RotateCcw, FileText, Trash2, AlertCircle, Link2, Printer, WifiOff, Info,
} from 'lucide-react'
import UnifiedProductInput, { type UnifiedProductInputHandle } from '@/components/forms/UnifiedProductInput'
import ProductNotFoundDialog from '@/components/scanner/ProductNotFoundDialog'
import TransactionSuccessAlert, { type TransactionSuccessInfo } from '@/components/shared/TransactionSuccessAlert'
import DateSystemInput from '@/components/shared/DateSystemInput'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { Button, Modal, Alert, Kbd } from '@/components/ui'
import { playSuccessBeep, playErrorBeep } from '@/utils/beep'
import { salesReturnsAPI, partiesAPI } from '@/services/api'
import { useOffline } from '@/offline/OfflineProvider'
import useUIStore from '@/store/uiStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { fmt, today } from '@/utils'
import { formatDisplayDate } from '@/utils/dateSystem'
import type { Product, Party } from '@/types'
import {
  type Settlement, type ReturnDetail, type ReturnPreview, type PreviewLine,
  SETTLE_LABEL, num, d10, errMsg, errCode, uuid, returnToPrintData,
} from './salesReturnShared'

const WALKIN = '__walkin__'

interface ReturnRow { _id: number; product_id: string; product_name: string; qty: string; batch_no: string }
type Flash = { type: 'danger' | 'info'; msg: string } | { type: 'success'; info: TransactionSuccessInfo }

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-1.5">
      <span className="text-[var(--text-4)]">{icon}</span>{children}
    </label>
  )
}

function SummaryRow({ label, value, highlight = false, muted = false, large = false }: {
  label: string; value: string; highlight?: boolean; muted?: boolean; large?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'border-t-2 border-[var(--border)] mt-1 pt-3' : ''}`}>
      <span className={`text-xs font-semibold uppercase tracking-wide ${muted ? 'text-[var(--text-4)]' : 'text-[var(--text-3)]'}`}>{label}</span>
      <span className={`font-bold tabular-nums ${large ? 'text-xl text-brand' : highlight ? 'text-base text-brand' : 'text-sm text-[var(--text)]'}`}>{value}</span>
    </div>
  )
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])]

export default function SalesReturnBilling({ active, onPosted }: { active: boolean; onPosted: () => void }) {
  const { error: toastError } = useUIStore()
  const dateMode = useUIStore(s => s.dateMode)
  const { isOnline } = useOffline()

  const [customers, setCustomers] = useState<Party[]>([])
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(today())
  const [narration, setNarration] = useState('')
  const [settlement, setSettlement] = useState<Settlement>('adjust')
  const [refundAmt, setRefundAmt] = useState('')
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [preview, setPreview] = useState<{ data: ReturnPreview; ids: number[] } | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewTick, setPreviewTick] = useState(0)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [lastDone, setLastDone] = useState<ReturnDetail | null>(null)
  const [customerOpen, setCustomerOpen] = useState(true)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [flashRowId, setFlashRowId] = useState<number | undefined>(undefined)

  const unifiedInputRef = useRef<UnifiedProductInputHandle>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const previewSeq = useRef(0)
  const idSeq = useRef(0)
  const txnRef = useRef(uuid())            // idempotency key: one per distinct request body (see bodySig below)

  const isWalkin = customerId === WALKIN
  const partyId = customerId && !isWalkin ? customerId : ''
  const customer = customers.find(c => c.id === customerId)

  useEffect(() => { partiesAPI.customers({ limit: 500 }).then(r => setCustomers((r.data?.data || []) as Party[])).catch(() => {}) }, [])
  useEffect(() => { unifiedInputRef.current?.focus(); return () => { if (flashTimer.current) clearTimeout(flashTimer.current) } }, [])

  function flashRow(id: number) {
    setFlashRowId(id)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashRowId(undefined), 600)
  }

  // ── product entry: the single hand-off point, same contract as the Sales page ──
  const handleProductSelected = useCallback((p: Product) => {
    playSuccessBeep(); setFlash(null)
    const i = rows.findIndex(r => r.product_id === p.id && !r.batch_no)
    if (i !== -1) {
      setRows(rows.map((r, k) => (k === i ? { ...r, qty: String(num(r.qty) + 1) } : r)))
      flashRow(rows[i]._id)
    } else {
      const row: ReturnRow = { _id: ++idSeq.current, product_id: p.id, product_name: p.name, qty: '1', batch_no: '' }
      setRows([...rows, row]); flashRow(row._id)
    }
    requestAnimationFrame(() => unifiedInputRef.current?.focusSilently())
  }, [rows])

  const handleProductNotFound = useCallback((code: string) => { playErrorBeep(); setNotFoundCode(code) }, [])
  function closeNotFound() { setNotFoundCode(null); requestAnimationFrame(() => unifiedInputRef.current?.focus()) }

  function updateRow(id: number, patch: Partial<ReturnRow>) { setRows(rs => rs.map(r => (r._id === id ? { ...r, ...patch } : r))); setFlash(null) }
  function removeRow(id: number) { setRows(rs => rs.filter(r => r._id !== id)) }
  function setQty(id: number, v: string) { if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) updateRow(id, { qty: v }) }

  // ── server dry run: allocation to the customer's real sales + exact amounts ──
  const live = useMemo(() => rows.filter(r => r.product_id && num(r.qty) > 0), [rows])
  const linesSig = JSON.stringify(live.map(r => [r._id, r.product_id, num(r.qty), r.batch_no]))
  const canPreview = live.length > 0 && !!customerId
  useEffect(() => {
    if (!canPreview) { setPreview(null); setPreviewErr(''); setPreviewing(false); return }
    const seq = ++previewSeq.current
    setPreviewing(true)
    const t = setTimeout(async () => {
      try {
        const r = await salesReturnsAPI.preview({
          ...(partyId ? { party_id: partyId } : {}), date_ad: date,
          lines: live.map(l => ({ product_id: l.product_id, qty: num(l.qty), ...(l.batch_no ? { batch_no: l.batch_no } : {}) })),
        })
        if (seq !== previewSeq.current) return
        setPreview({ data: r.data?.data as ReturnPreview, ids: live.map(l => l._id) }); setPreviewErr('')
      } catch (e) {
        if (seq !== previewSeq.current) return
        setPreview(null); setPreviewErr(errMsg(e, 'Could not calculate the return'))
      } finally { if (seq === previewSeq.current) setPreviewing(false) }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreview, linesSig, partyId, date, previewTick])

  const lineByRow = useMemo(() => {
    const m = new Map<number, PreviewLine>()
    preview?.data.lines.forEach((l, i) => { const id = preview.ids[i]; if (id != null) m.set(id, l) })
    return m
  }, [preview])
  const pv = preview?.data
  const totals = pv?.totals ?? null
  const netCredit = totals?.net_credit ?? 0
  const itemCount = live.length
  const canRefund = !pv || isWalkin || pv.refundable > 0.004
  const refundValue = refundAmt === '' ? netCredit : num(refundAmt)
  const refundBad = settlement !== 'adjust' && !isWalkin && !!pv && (refundValue <= 0 || refundValue > netCredit + 0.004 || refundValue > pv.refundable + 0.004)
  const hasLineErrors = !!pv && pv.lines.some(l => !l.ok)

  // a different request body gets a different idempotency key; an unchanged retry keeps its key
  const bodySig = `${linesSig}|${partyId}|${date}|${settlement}|${refundAmt}|${narration}`
  useEffect(() => { txnRef.current = uuid() }, [bodySig])

  function pickCustomer(v: string) {
    setCustomerId(v); setFlash(null)
    if (v === WALKIN) setSettlement(s => (s === 'adjust' ? 'cash_refund' : s))
    else if (v) { setSettlement(s => s); setCustomerOpen(false); setTimeout(() => unifiedInputRef.current?.focus(), 350) }
  }

  function clearForm() {
    setRows([]); setCustomerId(''); setDate(today()); setNarration(''); setSettlement('adjust'); setRefundAmt('')
    setFlash(null); setPreview(null); setPreviewErr(''); setCustomerOpen(true); setConfirmOpen(false)
    requestAnimationFrame(() => unifiedInputRef.current?.focus())
  }

  // Fiscal year of the return date (server re-validates; this blocks an obviously invalid post early).
  const fyCheck = useFiscalYearCheck(date)

  function handleNextClick() {
    if (fyCheck.blocked) { toastError('Fiscal year', fyCheck.message || ''); return }
    if (!isOnline) { setFlash({ type: 'danger', msg: 'You are offline. A sales return must be checked against the customer’s real sales on the server, so it can only be posted online.' }); return }
    if (!live.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    if (!customerId) { setFlash({ type: 'danger', msg: 'Select a customer before posting the return' }); setCustomerOpen(true); return }
    if (previewing || !pv) { setFlash({ type: 'danger', msg: previewErr || 'Please wait for the return to be calculated.' }); return }
    if (hasLineErrors || !totals) { setFlash({ type: 'danger', msg: 'Fix the highlighted items first — a quantity is more than this customer has bought and not yet returned.' }); return }
    if (refundBad) { setFlash({ type: 'danger', msg: 'Check the refund amount — it cannot exceed the credit value or what is owed to the customer.' }); return }
    setFlash(null); setConfirmOpen(true)
  }

  async function post() {
    if (savingRef.current || !pv || !totals) return
    if (fyCheck.blocked) { toastError('Fiscal year', fyCheck.message || ''); return }   // re-validate on submit
    savingRef.current = true; setSaving(true)
    try {
      const body: Record<string, unknown> = {
        ...(partyId ? { party_id: partyId } : {}), date_ad: date, narration: narration || undefined, settlement, client_txn_id: txnRef.current,
        lines: live.map(l => ({ product_id: l.product_id, qty: num(l.qty), ...(l.batch_no ? { batch_no: l.batch_no } : {}) })),
      }
      if (settlement !== 'adjust' && partyId) body.refund_amount = refundValue
      const r = await salesReturnsAPI.create(body)
      const d = r.data?.data as ReturnDetail
      setConfirmOpen(false); setLastDone(d); setPrintData(returnToPrintData(d))
      setFlash({ type: 'success', info: { voucherLabel: 'Sales Return', voucherNo: d.return_no, partyLabel: 'Customer', partyName: d.party_name || customer?.name || 'Walk-in', grandTotal: num(d.net_credit) } })
      setRows([]); setCustomerId(''); setNarration(''); setSettlement('adjust'); setRefundAmt(''); setDate(today()); setCustomerOpen(true); setPreview(null)
      onPosted()
    } catch (e) {
      setConfirmOpen(false)
      setFlash({ type: 'danger', msg: errMsg(e, 'Could not save the return') })
      if (errCode(e)) setPreviewTick(t => t + 1)            // re-read what is still returnable
    } finally { savingRef.current = false; setSaving(false) }
  }

  // ── keyboard shortcuts — same map as Sales where the action exists here ──
  const rowIdFromFocus = () => {
    const el = document.activeElement as HTMLElement | null
    const holder = el?.closest?.('[data-ret-row]') as HTMLElement | null
    return holder ? Number(holder.dataset.retRow) : rows[rows.length - 1]?._id
  }
  useKeyboardShortcuts([
    { combo: 'f2', description: 'Product search', handler: () => unifiedInputRef.current?.focus() },
    { combo: 'ctrl+f', description: 'Product search', handler: () => unifiedInputRef.current?.focus() },
    { combo: 'f3', description: 'Customer', handler: () => document.getElementById('pos-customer-select')?.focus() },
    { combo: 'f4', description: 'Batch', handler: () => (document.querySelector('[data-ret-row] select.ret-batch-select') as HTMLElement | null)?.focus() },
    { combo: 'f8', description: 'Settlement', handler: () => (document.getElementById('pos-refund-input') as HTMLElement | null)?.focus() },
    { combo: 'f9', description: 'Review & post', handler: handleNextClick },
    { combo: 'ctrl+s', description: 'Review & post', handler: handleNextClick },
    { combo: 'f12', description: 'Review & post', handler: handleNextClick },
    { combo: 'f10', description: 'Print last return', handler: () => { if (lastDone) setPrintData(returnToPrintData(lastDone)) } },
    { combo: 'ctrl+p', description: 'Print last return', handler: () => { if (lastDone) setPrintData(returnToPrintData(lastDone)) } },
    { combo: 'ctrl+n', description: 'New return', handler: clearForm },
    { combo: 'ctrl+l', description: 'Clear items', handler: () => setRows([]) },
    { combo: 'ctrl+d', description: 'Delete current line', handler: () => { const id = rowIdFromFocus(); if (id != null) removeRow(id) } },
  ], { enabled: active })

  const initials = customer?.name ? customer.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() : ''
  const linkedInvoices = pv?.returns ?? []

  /** Per-row read-outs shared by the desktop table and the mobile list. */
  function rowInfo(row: ReturnRow) {
    const pl = lineByRow.get(row._id)
    const ok = !!pl && pl.ok
    const batches = ok ? uniq(pl!.allocations.map(a => a.batch_no)) : []
    const expiries = ok ? uniq(pl!.allocations.map(a => a.expiry || d10(a.expiry_date))) : []
    const expired = ok && pl!.allocations.some(a => a.expired)
    const linked = ok ? uniq(pl!.allocations.map(a => a.invoice_no)) : []
    const pickable = (pl?.batches ?? []).filter(b => b.batch_no)
    return { pl, ok, batches, expiries, expired, linked, pickable }
  }

  const BatchPicker = ({ row, className }: { row: ReturnRow; className: string }) => {
    const { pickable, batches } = rowInfo(row)
    if (pickable.length > 1) {
      return (
        <select style={{ maxWidth: '100%', fontSize: 11 }} className={`ret-batch-select ${className}`} aria-label={`Batch for ${row.product_name}`} value={row.batch_no} onChange={e => updateRow(row._id, { batch_no: e.target.value })}>
          <option value="">Auto · latest first</option>
          {pickable.map(b => <option key={b.batch_no!} value={b.batch_no!}>{b.batch_no} · {b.returnable_qty} left</option>)}
        </select>
      )
    }
    return <span className="pos-cell-display">{batches.join(', ') || '—'}</span>
  }

  const postDisabled = saving || !isOnline || fyCheck.blocked

  return (
    <div className="space-y-4">
      {!isOnline && <Alert type="warning" message={<span className="flex items-center gap-2"><WifiOff size={14} /> You are offline. A sales return is checked against the customer’s real sales on the server, so it can only be posted online.</span>} />}
      {flash && (flash.type === 'success'
        ? <TransactionSuccessAlert info={flash.info} onClose={() => setFlash(null)} />
        : <Alert type={flash.type} message={flash.msg} onClose={() => setFlash(null)} />)}

      {/* ROW 1 — customer card + total credit card (same grid as Sales) */}
      <div className="pos-grid-main">
        <div className="pos-card">
          <div className="pos-card-title pos-accordion-header" onClick={() => setCustomerOpen(v => !v)}>
            <User size={14} className="text-brand" />
            Customer Information
            <div className="pos-customer-summary pos-mobile-only">
              <div className="pos-customer-summary-avatar">{initials}</div>
              <div>
                <div className="pos-customer-summary-name">{isWalkin ? 'Walk-in' : customer?.name || ''}</div>
                {customer?.phone && <div className="pos-customer-summary-meta">{customer.phone}</div>}
              </div>
            </div>
            <ChevronDown size={16} className="pos-accordion-chevron pos-mobile-only-chevron" style={{ transform: customerOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .22s' }} />
          </div>

          <div className={`pos-accordion-body ${customerOpen ? 'pos-accordion-body--open' : 'pos-accordion-body--closed'}`}>
            <div className="pos-customer-grid">
              <div className="pos-span2">
                <FieldLabel icon={<User size={11} />}>Party <span style={{ color: 'var(--danger,#dc2626)' }}>*</span></FieldLabel>
                <div className="flex gap-2 items-stretch pos-cf-party-row">
                  <div className="relative flex-1 pos-cf-select-wrap">
                    <User size={16} className="pos-cf-lead-icon" aria-hidden="true" />
                    <select id="pos-customer-select" aria-label="Customer" className="erp-input pos-select pos-cf-select" value={customerId} onChange={e => pickCustomer(e.target.value)}>
                      <option value="">Select a customer…</option>
                      <option value={WALKIN}>Walk-in / cash customer (no account)</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] pos-cf-chevron" />
                  </div>
                </div>
              </div>

              <div className="pos-span2 pos-cf-quad">
                <div className="pos-cf-field pos-cf-address">
                  <FieldLabel icon={<MapPin size={11} />}>Address</FieldLabel>
                  <div className="erp-input pos-readonly pos-cf-readonly"><Home size={14} className="pos-cf-lead-icon-static" aria-hidden="true" />
                    <span className="pos-cf-readonly-text">{customer?.address || <span className="text-[var(--text-4)]">—</span>}</span></div>
                </div>
                <div className="pos-cf-field pos-cf-pan">
                  <FieldLabel icon={<Hash size={11} />}>PAN</FieldLabel>
                  <div className="erp-input pos-readonly pos-cf-readonly"><span className="pos-cf-readonly-text">{customer?.pan_no || <span className="text-[var(--text-4)]">—</span>}</span></div>
                </div>
                <div className="pos-cf-field pos-cf-phone">
                  <FieldLabel icon={<PhoneIcon size={11} />}>Telephone</FieldLabel>
                  <div className="erp-input pos-readonly pos-cf-readonly"><span className="pos-cf-readonly-text">{customer?.phone || <span className="text-[var(--text-4)]">—</span>}</span>
                    <PhoneIcon size={14} className="pos-cf-trailing-icon" aria-hidden="true" /></div>
                </div>
                <div className="pos-cf-field pos-cf-date">
                  <FieldLabel icon={<CalendarDays size={11} />}>Return Date</FieldLabel>
                  <div className="pos-cf-date-wrap">
                    <DateSystemInput className="erp-input pos-cf-date-input" valueAD={date} onChangeAD={setDate} />
                    <CalendarDays size={14} className="pos-cf-trailing-icon pos-cf-date-icon" aria-hidden="true" />
                  </div>
                  <FiscalYearHint check={fyCheck} />
                </div>
              </div>

              <div className="pos-span2">
                <FieldLabel icon={<CreditCard size={11} />}>Settlement</FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {(['adjust', 'cash_refund', 'bank_refund'] as Settlement[]).filter(k => !(isWalkin && k === 'adjust')).map(k => {
                    const disabled = k !== 'adjust' && !canRefund
                    return (
                      <button key={k} type="button" disabled={disabled} aria-pressed={settlement === k} title={disabled ? 'Not available — the customer is not owed money after this credit' : undefined}
                        onClick={() => { setSettlement(k); setRefundAmt('') }}
                        className={`pos-mode-pill ${settlement === k ? 'pos-mode-pill--active' : ''}`} style={disabled ? { opacity: .45, cursor: 'not-allowed' } : undefined}>
                        {SETTLE_LABEL[k]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pos-total-card pos-total-card-desktop">
          <div className="text-[11px] font-bold uppercase tracking-widest text-brand/80 mb-2">Total Credit</div>
          <div className="pos-total-amount">{fmt(netCredit)}</div>
          <div className="w-full mt-4 space-y-0.5">
            <SummaryRow label="Goods (orig. rate)" value={fmt(totals?.goods ?? 0)} />
            <SummaryRow label="Discount" value={`-${fmt(totals?.discount ?? 0)}`} muted={!totals?.discount} />
            <SummaryRow label="VAT incl." value={fmt(totals?.tax ?? 0)} muted={!totals?.tax} />
            <SummaryRow label="Round Off" value={`${(totals?.round_off ?? 0) >= 0 ? '+' : '-'}${fmt(Math.abs(totals?.round_off ?? 0))}`} muted={!totals?.round_off} />
            <SummaryRow label="Net Credit" value={fmt(netCredit)} highlight large />
          </div>
        </div>
      </div>

      {/* RETURN ITEMS */}
      <div className="pos-card">
        <div className="flex items-center justify-between mb-4 pos-invoice-header">
          <div className="pos-card-title"><ShoppingCart size={14} className="text-brand" />Return Items</div>
          <div className="flex items-center gap-3 pos-invoice-actions">
            <UnifiedProductInput ref={unifiedInputRef} context="sales" autoFocus onProductResolved={handleProductSelected} onNotFound={handleProductNotFound} placeholder="Scan or search product to return…" />
            <div className="pos-kbd-hints flex items-center gap-3 text-xs text-[var(--text-4)]" title="F2 Product · F3 Customer · F4 Batch · F8 Settlement · F9 Review & post · F10 Print · Ctrl+N New">
              <span className="flex items-center gap-1"><Kbd>F2</Kbd> Product</span>
              <span className="flex items-center gap-1"><Kbd>F9</Kbd> Post</span>
              <span className="flex items-center gap-1"><Kbd>Tab</Kbd> Next field</span>
            </div>
          </div>
        </div>

        {/* desktop table */}
        <div className="pos-table-wrap pos-desktop-only">
          <table className="pos-table">
            <thead><tr>
              <th style={{ minWidth: 200 }}>Product / Particular</th><th style={{ width: 130 }}>Batch</th><th style={{ width: 88 }}>Expiry</th>
              <th style={{ width: 72 }}>Qty</th><th style={{ width: 84, textAlign: 'right' }}>Rate</th><th style={{ width: 64, textAlign: 'right' }}>Disc%</th>
              <th style={{ width: 100, textAlign: 'right' }}>Credit</th><th style={{ width: 36 }} />
            </tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="pos-cell-display" style={{ textAlign: 'center', padding: '22px 8px', color: 'var(--text-4)' }}>
                  No items yet — scan a barcode or search a product above (F2). Pick the customer first so the right original sale can be matched.</td></tr>
              )}
              {rows.map(row => {
                const { pl, ok, expiries, expired, linked } = rowInfo(row)
                const over = !!pl && !pl.ok
                return (
                  <tr key={row._id} data-ret-row={row._id} style={row._id === flashRowId ? { backgroundColor: 'var(--brand-subtle, rgba(37,99,235,0.12))', transition: 'background-color 200ms ease' } : { transition: 'background-color 400ms ease' }}>
                    <td>
                      <div className="font-medium text-sm">{row.product_name}</div>
                      {ok && <div className="text-[11px] text-[var(--text-4)] flex items-center gap-1"><Link2 size={10} /> from {linked.join(', ')}</div>}
                      {over && <div className="text-[11px] text-red-600">{pl!.error?.message}</div>}
                    </td>
                    <td><BatchPicker row={row} className="pos-cell-input" /></td>
                    <td className="pos-cell-display">{expiries.join(', ') || '—'}{expired && <span className="ml-1 text-red-600">expired</span>}</td>
                    <td>
                      <input inputMode="decimal" className={`pos-cell-input pos-cell-num ${over ? 'border-red-500' : ''}`} aria-label={`Return quantity for ${row.product_name}`}
                        value={row.qty} placeholder="0" onChange={e => setQty(row._id, e.target.value)} />
                    </td>
                    <td className="pos-cell-display pos-cell-display--right">{ok ? fmt(pl!.rate) : <span className="text-[var(--text-4)]">—</span>}</td>
                    <td className="pos-cell-display pos-cell-display--right">{ok && pl!.discount_pct ? pl!.discount_pct : <span className="text-[var(--text-4)]">—</span>}</td>
                    <td className="pos-cell-display pos-cell-display--right pos-cell-display--bold">{ok ? fmt(pl!.net) : <span className="text-[var(--text-4)]">{previewing ? '…' : '—'}</span>}</td>
                    <td><button type="button" className="pos-row-delete" onClick={() => removeRow(row._id)} tabIndex={-1} title="Remove row" aria-label={`Remove ${row.product_name}`}><Trash2 size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="hidden md:flex items-center justify-end mt-3 pos-desktop-only">
          <div className="pos-subtotal"><span className="pos-subtotal-label">Total Credit</span><span className="pos-subtotal-value">{fmt(netCredit)}</span></div>
        </div>

        {/* mobile / tablet list — the Sales page's compact pmic table */}
        <div className="pos-mobile-items pmic-table">
          {rows.length > 0 && (
            <div className="pmic-thead" aria-hidden="true">
              <div className="pmic-th pmic-th-product">Product</div><div className="pmic-th">Qty</div><div className="pmic-th">Disc%</div>
              <div className="pmic-th">Rate</div><div className="pmic-th">Credit</div><div className="pmic-th pmic-th-action">Action</div>
            </div>
          )}
          {rows.length === 0 && <div className="text-center text-xs text-[var(--text-4)] py-4">No items yet — scan or search a product above.</div>}
          {rows.map(row => {
            const { pl, ok, expired, linked } = rowInfo(row)
            return (
              <div key={row._id} data-ret-row={row._id} className="pmic-row2">
                <div className="pmic-row2-product">
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.product_name}</div>
                  {ok && <div className="text-[10.5px] text-[var(--text-4)]">{linked.join(', ')}{expired && <span className="ml-1 text-red-600">expired</span>}</div>}
                  <BatchPicker row={row} className="pmic-row2-input" />
                  {!!pl && !pl.ok && <div className="text-[10.5px] text-red-600">{pl.error?.message}</div>}
                </div>
                <input inputMode="decimal" className="pmic-row2-input" aria-label={`Return quantity for ${row.product_name}`} value={row.qty} placeholder="0" onChange={e => setQty(row._id, e.target.value)} />
                <div className="pmic-row2-amount" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{ok && pl!.discount_pct ? pl!.discount_pct : '—'}</div>
                <div className="pmic-row2-amount" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{ok ? fmt(pl!.rate) : '—'}</div>
                <div className="pmic-row2-amount">{ok ? fmt(pl!.net) : previewing ? '…' : '—'}</div>
                <button type="button" className="pmic-row2-remove" onClick={() => removeRow(row._id)} aria-label="Remove item"><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>

        {previewErr && <div className="mt-3 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {previewErr}</div>}
        {!customerId && rows.length > 0 && <div className="mt-3 text-xs text-amber-700 flex items-center gap-1"><AlertCircle size={12} /> Select a customer so the items can be matched to their original sales.</div>}
        {linkedInvoices.length > 0 && (
          <div className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-3)] flex items-start gap-2">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Matched to this customer’s original sales (latest first), so the original rate, discount, VAT and batch are used:{' '}
              {linkedInvoices.map(r => <b key={r.sale_id} className="mr-2 text-[var(--text-2)]">{r.invoice_no} <span className="font-normal">({formatDisplayDate(r.invoice_date, dateMode)} · {fmt(r.net_credit)})</span></b>)}</span>
          </div>
        )}
      </div>

      {/* mobile credit summary (the desktop one lives in the Total Credit card above) */}
      <div className="pos-card pos-mobile-only">
        <div className="pos-card-title mb-3"><span aria-hidden="true" style={{ fontSize: 14 }}>🧾</span> Credit Summary</div>
        <SummaryRow label="Goods (orig. rate)" value={fmt(totals?.goods ?? 0)} />
        <SummaryRow label="Discount" value={`-${fmt(totals?.discount ?? 0)}`} muted={!totals?.discount} />
        <SummaryRow label="VAT incl." value={fmt(totals?.tax ?? 0)} muted={!totals?.tax} />
        <SummaryRow label="Round Off" value={`${(totals?.round_off ?? 0) >= 0 ? '+' : '-'}${fmt(Math.abs(totals?.round_off ?? 0))}`} muted={!totals?.round_off} />
        <SummaryRow label="Net Credit" value={fmt(netCredit)} highlight large />
      </div>

      {/* SETTLEMENT / BILLING SUMMARY */}
      <div className="pos-card">
        <div className="pos-card-title mb-4"><CreditCard size={14} className="text-brand" />Settlement Summary</div>
        <div className="pos-billing-grid">
          <div className="pos-summary-block">
            <div className="pos-summary-block-icon" style={{ background: '#fef3c7' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
            <div className="space-y-2 w-full">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)]">{SETTLE_LABEL[settlement]}</div>
              <div className="text-xs text-[var(--text-3)]">
                {!pv || !totals ? 'Add items and a customer to see how the credit is applied.'
                  : settlement === 'adjust'
                    ? <>{fmt(pv.applied_if_adjusted)} reduces the invoices’ outstanding{netCredit - pv.applied_if_adjusted > 0.004 ? `; ${fmt(netCredit - pv.applied_if_adjusted)} stays as customer credit` : ''}. No money moves.</>
                    : <>{fmt(isWalkin ? netCredit : refundValue)} paid out now{!isWalkin && netCredit - refundValue > 0.004 ? `; ${fmt(netCredit - refundValue)} stays on the customer account` : ''}.{!isWalkin && <> Up to {fmt(pv.refundable)} can be refunded.</>}</>}
              </div>
            </div>
          </div>
          <div className="pos-summary-block">
            <div className="pos-summary-block-icon" style={{ background: '#f0fdf4' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#16a34a" strokeWidth="1.5" /><path d="M8 5v1.5M8 9.5V11" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" /></svg>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1" title="Shortcut: F8">Refund Amount <Kbd>F8</Kbd></div>
                <input id="pos-refund-input" aria-label="Refund amount" inputMode="decimal" className={`erp-input pmic-billing-input text-right ${refundBad ? 'border-red-500' : ''}`}
                  disabled={settlement === 'adjust' || isWalkin} placeholder={netCredit ? String(netCredit) : '0.00'} value={refundAmt}
                  onChange={e => /^\d*\.?\d{0,2}$/.test(e.target.value) && setRefundAmt(e.target.value)} />
              </div>
              {pv?.customer_balance != null && (
                <div className="text-[11px] text-[var(--text-4)]">Ledger balance: <b>{fmt(Math.abs(pv.customer_balance))} {pv.customer_balance < 0 ? 'Cr (owed to customer)' : 'Dr (receivable)'}</b></div>
              )}
            </div>
          </div>
        </div>
        <label className="text-xs text-[var(--text-3)] flex flex-col gap-1 mt-3">Narration / reason for return
          <input value={narration} onChange={e => setNarration(e.target.value)} maxLength={500} placeholder="Optional" className="erp-input" />
        </label>
        {lastDone && (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--text-3)] rounded-lg bg-[var(--surface-2)] px-3 py-2">
            <span>Last return <b className="text-[var(--text-2)]">{lastDone.return_no}</b> · {fmt(lastDone.net_credit)}</span>
            <Button variant="secondary" size="sm" icon={<Printer size={13} />} onClick={() => setPrintData(returnToPrintData(lastDone))}>Print</Button>
          </div>
        )}
      </div>

      {/* ACTIONS — desktop */}
      <div className="pos-desktop-actions flex items-center justify-between pt-1 pb-2">
        <button type="button" onClick={clearForm} className="pos-action-btn pos-action-btn--clear" title="Clear (Ctrl+N)"><RotateCcw size={14} /> Clear</button>
        <button type="button" onClick={handleNextClick} disabled={postDisabled} className="pos-action-btn pos-action-btn--post" title="Review & Post Return (F12)">
          {saving ? <span className="pos-spinner" /> : <FileText size={14} />}{saving ? 'Posting…' : 'Review & Post Return (F12)'}
        </button>
      </div>

      {/* ACTIONS — mobile/tablet sticky bar */}
      <div className="pos-mobile-actionbar">
        <div className="pma-row">
          <button type="button" className="pma-draft" onClick={clearForm} title="Clear" aria-label="Clear"><RotateCcw size={20} /></button>
          <button type="button" className="pma-post" onClick={handleNextClick} disabled={postDisabled}>
            <span className="pma-stack">
              <span className="pma-stack-label"><FileText size={14} /> Review &amp; Post →</span>
              <span className="pma-stack-sub">{itemCount} item{itemCount === 1 ? '' : 's'} • {fmt(netCredit)}</span>
            </span>
          </button>
        </div>
        {!isOnline && <div className="pma-offline-pill"><span className="pma-offline-dot" aria-hidden="true" />Offline – returns can only be posted online</div>}
      </div>

      {/* confirmation */}
      <Modal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title="Confirm sales return" size="md"
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Back</Button>
          <Button variant="primary" loading={saving} disabled={saving || fyCheck.blocked} onClick={post}>Post Return</Button></>}>
        {totals && pv && (
          <div className="space-y-3 text-sm">
            <div>{isWalkin ? 'Walk-in customer' : customer?.name} · {formatDisplayDate(date, dateMode)}</div>
            <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {live.map(l => {
                const pl = lineByRow.get(l._id)
                return <div key={l._id} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{l.product_name}</span><span className="whitespace-nowrap">{num(l.qty)} → <b>{fmt(pl?.net ?? 0)}</b></span></div>
              })}
            </div>
            <div className="text-xs text-[var(--text-3)]">Against {pv.returns.length === 1 ? 'invoice' : 'invoices'}: <b>{pv.returns.map(r => r.invoice_no).join(', ')}</b>{pv.returns.length > 1 ? ` — ${pv.returns.length} credit notes will be created, one per invoice` : ''}.</div>
            <div className="flex justify-between text-base font-bold"><span>Net credit</span><span>{fmt(totals.net_credit)}</span></div>
            <div className="text-xs text-[var(--text-3)]">Settlement: <b>{SETTLE_LABEL[settlement]}</b>{settlement !== 'adjust' ? ` — ${fmt(isWalkin ? totals.net_credit : refundValue)} paid out` : ''}. Stock is restored to the original batches and the accounting entries are posted. This cannot be edited afterwards.</div>
          </div>
        )}
      </Modal>

      <ProductNotFoundDialog code={notFoundCode} onClose={closeNotFound} />
      <PrintPreviewModal data={printData} open={!!printData} onClose={() => setPrintData(null)}
        onNextBill={() => { setPrintData(null); requestAnimationFrame(() => unifiedInputRef.current?.focus()) }} />
    </div>
  )
}
