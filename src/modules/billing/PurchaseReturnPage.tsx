/**
 * PurchaseReturnPage.tsx — Purchase Return as a complete reverse purchase
 *
 * Route: /purchase-return, /purchase-returns   (unchanged)
 *
 * Mirror of PurchaseReturnPage for the supplier side:
 *   - New Return  → find supplier / original purchase bill → return only the lines & quantities
 *                   wanted → server-verified debit summary → confirm → post → print Debit Note
 *   - All Returns → searchable / filterable / paginated list, view detail, print / reprint
 *
 * The page never decides money. Rates, discount, tax, rounding, remaining returnable quantity,
 * the stock actually left in the purchased batch, settlement limits and the voucher number are all
 * computed by the backend (services/purchaseReturnService.js); the confirm screen shows the backend's
 * own dry-run (POST /returns/purchase/preview) so what is shown == what is saved == what is printed.
 * Unlike a purchase return, stock LEAVES: a line can only be returned up to min(remaining on the bill,
 * still in stock) — goods already purchased on cannot go back to the supplier.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  RotateCcw, FilePlus, List, Search, X, CheckCircle2, AlertCircle, Printer, Eye, ScanLine, WifiOff,
} from 'lucide-react'
import { purchaseReturnsAPI, partiesAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Tabs, Badge, Pagination, SkeletonRows, Empty, Modal, Alert } from '@/components/ui'
import DateSystemInput from '@/components/shared/DateSystemInput'
import UnifiedProductInput from '@/components/forms/UnifiedProductInput'
import type { UnifiedProductInputHandle } from '@/components/forms/UnifiedProductInput'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import { formatDisplayDate } from '@/utils/dateSystem'
import { fmt, today } from '@/utils'
import type { Product } from '@/types'

const LIMIT = 20
const INV_LIMIT = 8

// ─── Types (shapes returned by /returns/purchase/*) ───────────────────────────────
interface SupplierOpt { id: string; name: string; phone?: string; code?: string }
interface BillRow {
  id: string; bill_no: string; date_ad: string; party_id?: string | null; party_name?: string | null
  net_total: number; payment_status: 'paid' | 'partial' | 'unpaid'; payment_mode: string
  purchased_qty: number; returned_qty: number; returnable_qty: number; returnable_value: number
}
interface BillLine {
  id: string; product_id?: string | null; product_name: string; batch_no?: string | null; expiry?: string | null
  expiry_date?: string | null; purchased_qty: number; returned_qty: number; remaining_qty: number
  stock_available: number; max_returnable_now: number; bonus_qty: number; batch_missing: boolean
  rate: number; discount_pct: number; line_amount: number; unit_credit: number; expired: boolean
}
interface InvDetail {
  id: string; bill_no: string; date_ad: string; payment_mode: string; payment_status: string
  net_total: number; paid_amount: number; due_amount: number; party?: { id: string; name: string; phone?: string } | null
  supplier_balance: number | null; prior_credit: number; returnable_value: number
  previous_returns: { id: string; return_no: string; return_date: string; net_credit: number; settlement: string }[]
  items: BillLine[]
}
interface Preview {
  totals: { goods: number; discount: number; cc: number; tax: number; round_off: number; net_credit: number; completes_bill: boolean }
  lines: { purchase_item_id: string; qty: number; gross: number; discount: number; net: number }[]
  supplier_balance: number | null; refundable: number; bill_due: number; applied_if_adjusted: number
}
type Settlement = 'adjust' | 'cash_refund' | 'bank_refund'
interface ReturnDetail {
  id: string; return_no: string; return_date: string; date_bs?: string; bill_no: string; party_name?: string
  party_address?: string; party_phone?: string; party_pan?: string; goods_amount: number; discount_amount: number
  cc_amount: number; tax_amount: number; round_off: number; net_credit: number; applied_to_bill: number
  supplier_credit: number; refund_amount: number; settlement: Settlement; narration?: string; debit_note_no?: string
  refund_voucher_no?: string; voucher_id?: string
  items: { id: string; product_name: string; batch_no?: string; expiry?: string; qty: number; rate: number; discount_pct: number
    gross_amount: number; discount_amount: number; net_amount: number }[]
}

const SETTLE_LABEL: Record<Settlement, string> = {
  adjust: 'Debit to supplier account', cash_refund: 'Cash refund', bank_refund: 'Bank refund',
}
const num = (v: unknown) => Number(v) || 0
/** A line can go back only up to what the bill still allows AND what is still in stock (the rest was sold on). */
const maxQty = (l: BillLine) => (l.batch_missing ? 0 : Math.max(0, l.max_returnable_now))
const d10 = (v?: string | null) => (v ? String(v).slice(0, 10) : '')
const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || (e as Error)?.message || fallback
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16) })

function settlementText(d: ReturnDetail): string {
  if (d.settlement === 'cash_refund') return `Cash refund ${fmt(d.refund_amount)}${num(d.supplier_credit) + num(d.applied_to_bill) > 0 ? ` · remaining ${fmt(num(d.supplier_credit) + num(d.applied_to_bill))} to account` : ''}`
  if (d.settlement === 'bank_refund') return `Bank refund ${fmt(d.refund_amount)}${num(d.supplier_credit) + num(d.applied_to_bill) > 0 ? ` · remaining ${fmt(num(d.supplier_credit) + num(d.applied_to_bill))} to account` : ''}`
  const parts: string[] = []
  if (num(d.applied_to_bill) > 0) parts.push(`${fmt(d.applied_to_bill)} adjusted against bill outstanding`)
  if (num(d.supplier_credit) > 0) parts.push(`${fmt(d.supplier_credit)} retained as supplier credit`)
  return parts.join(' · ') || 'Debited to supplier account'
}

export function purchaseReturnToPrintData(d: ReturnDetail): PrintData {
  return {
    voucherNo: d.return_no, type: 'PURCHASE_RETURN', date: d10(d.return_date), dateBS: d.date_bs || undefined,
    referenceNo: d.bill_no, partyName: d.party_name || undefined, partyAddress: d.party_address || undefined,
    partyPhone: d.party_phone || undefined, partyPan: d.party_pan || undefined, narration: d.narration || undefined,
    items: d.items.map(i => ({
      product_name: i.product_name, batch_no: i.batch_no || undefined, expiry: i.expiry || undefined,
      qty: num(i.qty), rate: num(i.rate), discount_pct: num(i.discount_pct) || undefined, amount: num(i.gross_amount),
    })),
    subtotal: num(d.goods_amount), discountAmt: num(d.discount_amount), ccAmount: num(d.cc_amount), taxAmt: num(d.tax_amount),
    roundOff: num(d.round_off), netTotal: num(d.net_credit), settlement: settlementText(d),
  }
}

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
function NewReturn({ onPosted }: { onPosted: () => void }) {
  const { success, error } = useUIStore()
  const dateMode = useUIStore(s => s.dateMode)
  const [supplier, setSupplier] = useState<SupplierOpt | null>(null)
  const [search, setSearch] = useState('')
  const [dFrom, setDFrom] = useState('')
  const [dTo, setDTo] = useState('')
  const [page, setPage] = useState(1)
  const [invs, setInvs] = useState<BillRow[]>([])
  const [invTotal, setInvTotal] = useState(0)
  const [invLoading, setInvLoading] = useState(false)
  const [inv, setInv] = useState<InvDetail | null>(null)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [date, setDate] = useState(today())
  const [narration, setNarration] = useState('')
  const [settlement, setSettlement] = useState<Settlement>('adjust')
  const [refundAmt, setRefundAmt] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [flashId, setFlashId] = useState<string | null>(null)
  const [done, setDone] = useState<ReturnDetail | null>(null)
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const savingRef = useRef(false)
  const txnRef = useRef(uuid())          // one idempotency key per form instance; renewed only after success / reset
  const scanRef = useRef<UnifiedProductInputHandle>(null)
  const previewSeq = useRef(0)

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ── bill finder ──
  useEffect(() => {
    if (inv || done) return
    let live = true
    setInvLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await purchaseReturnsAPI.bills({ search: search || undefined, party_id: supplier?.id, date_from: dFrom || undefined, date_to: dTo || undefined, page, limit: INV_LIMIT })
        if (!live) return
        setInvs((r.data?.data ?? []) as BillRow[])
        setInvTotal(r.data?.pagination?.total ?? 0)
      } catch (e) { if (live) { setInvs([]); setInvTotal(0); error(errMsg(e, 'Could not load bills')) } }
      finally { if (live) setInvLoading(false) }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [search, supplier, dFrom, dTo, page, inv, done, error])
  useEffect(() => { setPage(1) }, [search, supplier, dFrom, dTo])

  // keepMessage: after a server rejection the bill is re-read from the source of truth, but the
  // explanation the user needs to read must survive that refresh.
  const loadBill = useCallback(async (id: string, keepMessage = false) => {
    try {
      const r = await purchaseReturnsAPI.bill(id)
      const d = r.data?.data as InvDetail
      setInv(d); setQty({}); setPreview(null); setPreviewErr(''); if (!keepMessage) setFormErr(''); setScanMsg('')
      setSettlement(d.party ? 'adjust' : d.payment_mode === 'credit' ? 'cash_refund' : 'cash_refund')
      setRefundAmt('')
      const invDate = d10(d.date_ad); setDate(prev => (prev < invDate ? invDate : prev))
      if (!keepMessage) txnRef.current = uuid()
    } catch (e) { error(errMsg(e, 'Could not load the bill')) }
  }, [error])

  function clearBill() { setInv(null); setQty({}); setPreview(null); setPreviewErr(''); setFormErr(''); setScanMsg('') }

  // ── items from the qty map ──
  const items = useMemo(() => Object.entries(qty).map(([purchase_item_id, v]) => ({ purchase_item_id, qty: num(v) })).filter(i => i.qty > 0), [qty])
  const overLines = useMemo(() => (inv ? inv.items.filter(l => num(qty[l.id]) > maxQty(l) + 1e-9).map(l => l.id) : []), [inv, qty])

  // ── server dry-run → the numbers shown are the numbers that will be saved ──
  useEffect(() => {
    if (!inv || !items.length || overLines.length) { setPreview(null); setPreviewErr(''); setPreviewing(false); return }
    const seq = ++previewSeq.current
    setPreviewing(true)
    const t = setTimeout(async () => {
      try {
        const r = await purchaseReturnsAPI.preview({ purchase_id: inv.id, items })
        if (seq !== previewSeq.current) return
        setPreview(r.data?.data as Preview); setPreviewErr('')
      } catch (e) {
        if (seq !== previewSeq.current) return
        setPreview(null); setPreviewErr(errMsg(e, 'Could not calculate the return'))
      } finally { if (seq === previewSeq.current) setPreviewing(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [inv, items, overLines.length])

  const lineNet = useMemo(() => new Map((preview?.lines ?? []).map(l => [l.purchase_item_id, l])), [preview])
  const canRefund = !!preview && preview.refundable > 0.004
  const netCredit = preview?.totals.net_credit ?? 0
  const refundValue = refundAmt === '' ? netCredit : num(refundAmt)
  const refundBad = settlement !== 'adjust' && !!inv?.party && (refundValue <= 0 || refundValue > netCredit + 0.004 || refundValue > (preview?.refundable ?? 0) + 0.004)

  function setLineQty(id: string, v: string) {
    if (v !== '' && !/^\d*\.?\d{0,2}$/.test(v)) return
    setQty(q => ({ ...q, [id]: v })); setFormErr('')
  }
  function returnAll(l: BillLine) { setLineQty(l.id, String(maxQty(l))) }

  // scan / search a product → jump to its line on this bill
  const onProduct = useCallback((p: Product) => {
    if (!inv) return
    const hit = inv.items.filter(l => l.product_id === p.id && maxQty(l) > 0)
    if (!hit.length) {
      const any = inv.items.some(l => l.product_id === p.id)
      setScanMsg(any ? `${p.name} on this bill has already been fully returned.` : `${p.name} is not on bill ${inv.bill_no}.`)
      return
    }
    const line = hit.find(l => num(qty[l.id]) < maxQty(l)) ?? hit[0]
    setScanMsg('')
    setQty(q => ({ ...q, [line.id]: String(Math.min(maxQty(line), num(q[line.id]) + 1)) }))
    setFlashId(line.id); setTimeout(() => setFlashId(null), 700)
    document.getElementById(`ret-line-${line.id}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setTimeout(() => scanRef.current?.focusSilently(), 0)
  }, [inv, qty])

  function openConfirm() {
    if (!inv) return
    if (!items.length) { setFormErr('Enter a return quantity for at least one item.'); return }
    if (overLines.length) { setFormErr('A quantity exceeds what can still be returned.'); return }
    if (!preview) { setFormErr(previewErr || 'Please wait for the return to be calculated.'); return }
    if (refundBad) { setFormErr('Check the refund amount — it cannot exceed what the supplier owes you or the debit value.'); return }
    if (date < d10(inv.date_ad)) { setFormErr('Return date cannot be earlier than the bill date.'); return }
    setFormErr(''); setConfirmOpen(true)
  }

  async function post() {
    if (!inv || savingRef.current) return          // hard guard against double submit
    savingRef.current = true; setSaving(true)
    try {
      const body: Record<string, unknown> = { purchase_id: inv.id, items, date_ad: date, narration: narration || undefined, settlement, client_txn_id: txnRef.current }
      if (settlement !== 'adjust' && inv.party) body.refund_amount = refundValue
      const r = await purchaseReturnsAPI.create(body)
      const d = r.data?.data as ReturnDetail
      setConfirmOpen(false); setDone(d)
      success(`Purchase return ${d.return_no} recorded`)
      txnRef.current = uuid()
      onPosted()
    } catch (e) {
      setConfirmOpen(false)
      const msg = errMsg(e, 'Could not save the return')
      setFormErr(msg)
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'EXCEEDS_RETURNABLE' || code === 'FULLY_CREDITED' || code === 'INSUFFICIENT_BATCH_STOCK' || code === 'BATCH_NOT_FOUND') loadBill(inv.id, true)   // someone else returned meanwhile
    } finally { savingRef.current = false; setSaving(false) }
  }

  function resetAll() { setDone(null); setPrintData(null); setSupplier(null); setSearch(''); clearBill(); setNarration(''); setSettlement('adjust'); setRefundAmt(''); setDate(today()); txnRef.current = uuid() }

  // ── success screen ──
  if (done) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 size={22} className="text-green-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-green-800">Purchase return posted — {done.return_no}</div>
            <div className="text-sm text-green-700">Against bill {done.bill_no}{done.party_name ? ` · ${done.party_name}` : ''} · {formatDisplayDate(d10(done.return_date), dateMode)}</div>
          </div>
          <div className="text-right"><div className="text-xs text-green-700">Final debit</div><div className="text-xl font-bold text-green-800">{fmt(done.net_credit)}</div></div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {done.items.map(i => (
            <div key={i.id} className="flex justify-between gap-3 px-4 py-2 text-sm border-b last:border-0 border-[var(--border)]">
              <span className="truncate">{i.product_name}{i.batch_no ? <span className="text-[var(--text-4)]"> · {i.batch_no}</span> : null}</span>
              <span className="whitespace-nowrap">{num(i.qty)} × {fmt(i.rate)} → <b>{fmt(i.net_amount)}</b></span>
            </div>
          ))}
          <div className="px-4 py-2 text-xs text-[var(--text-3)] bg-[var(--surface-2)]">{settlementText(done)}{done.refund_voucher_no ? ` · Refund voucher ${done.refund_voucher_no}` : ''}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Printer size={14} />} onClick={() => setPrintData(purchaseReturnToPrintData(done))}>Print Debit Note</Button>
          <Button variant="secondary" icon={<FilePlus size={14} />} onClick={resetAll}>New Return</Button>
        </div>
        <PrintPreviewModal data={printData} open={!!printData} onClose={() => setPrintData(null)} />
      </div>
    )
  }

  const t = preview?.totals
  return (
    <div className="space-y-4">
      {!online && <Alert type="warning" message={<span className="flex items-center gap-2"><WifiOff size={14} /> You are offline. Purchase returns need the server (the returnable quantity must be verified), so posting is disabled until you reconnect.</span>} />}
      {formErr && <Alert type="danger" message={formErr} onClose={() => setFormErr('')} />}

      {/* 1 ─ supplier + bill selection */}
      {!inv ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="font-semibold text-sm">1 · Find the original purchase bill</div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="md:col-span-2"><SupplierPicker value={supplier} onChange={setSupplier} /></div>
            <div className="relative md:col-span-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bill no., supplier, reference…" aria-label="Search bills"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm outline-none focus:border-brand" />
            </div>
            <label className="text-xs text-[var(--text-3)] flex items-center gap-2">From <DateSystemInput valueAD={dFrom} onChangeAD={setDFrom} className="flex-1" /></label>
            <label className="text-xs text-[var(--text-3)] flex items-center gap-2">To <DateSystemInput valueAD={dTo} onChangeAD={setDTo} className="flex-1" /></label>
            {(dFrom || dTo) && <div className="md:col-span-2"><Button variant="ghost" size="sm" onClick={() => { setDFrom(''); setDTo('') }}>Clear dates</Button></div>}
          </div>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            {invLoading ? <table className="w-full"><tbody><SkeletonRows cols={5} rows={4} /></tbody></table>
              : invs.length === 0 ? <Empty message="No returnable bills match" />
              : invs.map(s => (
                <button key={s.id} type="button" onClick={() => loadBill(s.id)}
                  className="w-full text-left px-3 py-2.5 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface-3)] grid gap-1 md:grid-cols-[1.1fr_1.4fr_0.8fr_0.9fr_1fr] md:items-center text-sm">
                  <span className="font-medium">{s.bill_no}</span>
                  <span className="truncate text-[var(--text-2)]">{s.party_name || 'No supplier'} <span className="text-[var(--text-4)]">· {formatDisplayDate(d10(s.date_ad), dateMode)}</span></span>
                  <span className="flex items-center gap-2">{payBadge(s.payment_status)}</span>
                  <span className="text-[var(--text-3)]">Bill <b className="text-[var(--text)]">{fmt(s.net_total)}</b></span>
                  <span className="text-[var(--text-3)]">Returnable <b className="text-[var(--text)]">{fmt(s.returnable_value)}</b> <span className="text-xs">({s.returnable_qty} qty)</span></span>
                </button>
              ))}
          </div>
          {invTotal > INV_LIMIT && <Pagination page={page} total={invTotal} limit={INV_LIMIT} onChange={setPage} />}
        </div>
      ) : (
        <>
          {/* selected bill */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--text-4)]">Original bill</div>
                <div className="font-semibold text-base">{inv.bill_no} <span className="ml-2">{payBadge(inv.payment_status)}</span></div>
                <div className="text-sm text-[var(--text-2)]">{inv.party?.name ?? 'No supplier account'}{inv.party?.phone ? ` · ${inv.party.phone}` : ''} · {formatDisplayDate(d10(inv.date_ad), dateMode)}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" icon={<Search size={13} />} onClick={clearBill}>Change</Button>
                <Button variant="danger" size="sm" icon={<X size={13} />} onClick={resetAll}>Clear</Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              {[['Bill amount', inv.net_total], ['Paid', inv.paid_amount], ['Outstanding', inv.due_amount], ['Already credited', inv.prior_credit], ['Returnable value', inv.returnable_value]].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-[var(--surface-2)] px-3 py-2"><div className="text-[11px] text-[var(--text-4)]">{k}</div><div className="font-semibold">{fmt(v as number)}</div></div>
              ))}
            </div>
            {inv.supplier_balance !== null && <div className="mt-2 text-xs text-[var(--text-3)]">Supplier ledger balance: <b>{fmt(Math.abs(inv.supplier_balance))} {inv.supplier_balance > 0 ? 'Cr (you owe supplier)' : 'Dr (supplier owes you)'}</b></div>}
            {inv.previous_returns.length > 0 && (
              <div className="mt-2 text-xs text-[var(--text-3)]">Previous returns: {inv.previous_returns.map(r => `${r.return_no} (${fmt(r.net_credit)})`).join(', ')}</div>
            )}
          </div>

          {/* scan to jump */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
            <div className="text-xs text-[var(--text-3)] flex items-center gap-1.5"><ScanLine size={13} /> Scan or search a product to add 1 to its return quantity</div>
            <UnifiedProductInput ref={scanRef} context="purchase" onProductResolved={onProduct} onNotFound={c => setScanMsg(`No product found for "${c}".`)} placeholder="Scan or search product on this bill…" />
            {scanMsg && <div className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle size={12} /> {scanMsg}</div>}
          </div>

          {/* 2 ─ lines */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] font-semibold text-sm">2 · Choose what is being returned</div>
            {/* desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-[var(--text-4)] text-left">
                  <th className="px-3 py-2">Product / Batch</th><th className="px-2">Expiry</th><th className="px-2 text-right">Bought</th><th className="px-2 text-right">Returned</th>
                  <th className="px-2 text-right">Left</th><th className="px-2 text-right">In stock</th><th className="px-2 text-right">Rate</th><th className="px-2 text-right">Disc %</th><th className="px-2 text-right">Return qty</th><th className="px-3 text-right">Credit</th>
                </tr></thead>
                <tbody>
                  {inv.items.map(l => {
                    const q = num(qty[l.id]); const ln = lineNet.get(l.id)
                    const over = q > maxQty(l) + 1e-9
                    return (
                      <tr id={`ret-line-${l.id}`} key={l.id} className={`border-t border-[var(--border)] ${flashId === l.id ? 'bg-brand/10' : ''} ${maxQty(l) <= 0 ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2"><div className="font-medium">{l.product_name}</div><div className="text-xs text-[var(--text-4)]">{l.batch_no ? `Batch ${l.batch_no}` : 'No batch'}</div></td>
                        <td className="px-2 text-xs">{l.expiry || d10(l.expiry_date) || '—'}{l.expired && <span className="ml-1 text-red-600">expired</span>}</td>
                        <td className="px-2 text-right">{l.purchased_qty}</td><td className="px-2 text-right">{l.returned_qty || '—'}</td>
                        <td className="px-2 text-right font-medium">{l.remaining_qty}</td>
                        <td className={`px-2 text-right ${l.batch_missing || l.stock_available < l.remaining_qty ? 'text-red-600 font-medium' : ''}`} title={l.batch_missing ? 'Stock batch not found' : l.stock_available < l.remaining_qty ? 'Part of this has already been sold' : ''}>{l.batch_missing ? '—' : l.stock_available}</td>
                        <td className="px-2 text-right">{fmt(l.rate)}</td><td className="px-2 text-right">{l.discount_pct || '—'}</td>
                        <td className="px-2 text-right whitespace-nowrap">
                          <input inputMode="decimal" disabled={maxQty(l) <= 0} value={qty[l.id] ?? ''} onChange={e => setLineQty(l.id, e.target.value)}
                            aria-label={`Return quantity for ${l.product_name}`} placeholder="0"
                            className={`w-20 h-8 text-right px-2 rounded-md border text-sm outline-none ${over ? 'border-red-500 bg-red-50' : 'border-[var(--border)] focus:border-brand'}`} />
                          {maxQty(l) > 0 && <button type="button" onClick={() => returnAll(l)} className="ml-1 text-xs text-brand hover:underline">All</button>}
                        </td>
                        <td className="px-3 text-right font-semibold">{q > 0 ? (ln ? fmt(ln.net) : `≈ ${fmt(q * l.unit_credit)}`) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="md:hidden divide-y divide-[var(--border)]">
              {inv.items.map(l => {
                const q = num(qty[l.id]); const ln = lineNet.get(l.id); const over = q > maxQty(l) + 1e-9
                return (
                  <div id={`ret-line-m-${l.id}`} key={l.id} className={`p-3 space-y-2 ${flashId === l.id ? 'bg-brand/10' : ''} ${maxQty(l) <= 0 ? 'opacity-50' : ''}`}>
                    <div className="font-medium text-sm">{l.product_name}</div>
                    <div className="text-xs text-[var(--text-3)]">{l.batch_no ? `Batch ${l.batch_no}` : 'No batch'} · Exp {l.expiry || d10(l.expiry_date) || '—'}{l.expired && <span className="ml-1 text-red-600">expired</span>}</div>
                    <div className="grid grid-cols-5 gap-1 text-xs"><div>Bought<br /><b>{l.purchased_qty}</b></div><div>Returned<br /><b>{l.returned_qty || '—'}</b></div><div>Left<br /><b>{l.remaining_qty}</b></div><div>In stock<br /><b className={l.stock_available < l.remaining_qty ? 'text-red-600' : ''}>{l.batch_missing ? '—' : l.stock_available}</b></div><div>Rate<br /><b>{fmt(l.rate)}</b></div></div>
                    <div className="flex items-center gap-2">
                      <input inputMode="decimal" disabled={maxQty(l) <= 0} value={qty[l.id] ?? ''} onChange={e => setLineQty(l.id, e.target.value)} placeholder="Return qty"
                        aria-label={`Return quantity for ${l.product_name}`} className={`flex-1 h-10 px-3 rounded-lg border text-sm outline-none ${over ? 'border-red-500 bg-red-50' : 'border-[var(--border)]'}`} />
                      {maxQty(l) > 0 && <Button variant="outline" size="sm" onClick={() => returnAll(l)}>All</Button>}
                      <div className="w-24 text-right font-semibold text-sm">{q > 0 ? (ln ? fmt(ln.net) : `≈ ${fmt(q * l.unit_credit)}`) : '—'}</div>
                    </div>
                    {over && <div className="text-xs text-red-600">{l.batch_missing ? 'The stock batch for this item was not found.' : l.stock_available < l.remaining_qty ? `Only ${l.stock_available} is still in stock — the rest was already sold.` : `Only ${l.remaining_qty} can still be returned.`}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 3 ─ summary, settlement, date, narration */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
              <div className="font-semibold text-sm">3 · Settlement</div>
              {inv.party ? (
                <div className="grid gap-2">
                  {(['adjust', 'cash_refund', 'bank_refund'] as Settlement[]).map(k => {
                    const disabled = k !== 'adjust' && (!!preview && !canRefund)
                    return (
                      <label key={k} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${settlement === k ? 'border-brand bg-brand/5' : 'border-[var(--border)]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input type="radio" name="settle" className="mt-1" disabled={disabled} checked={settlement === k} onChange={() => { setSettlement(k); setRefundAmt('') }} />
                        <span><b>{SETTLE_LABEL[k]}</b>
                          <span className="block text-xs text-[var(--text-3)]">
                            {k === 'adjust' ? 'Reduces what you owe the supplier; any excess stays as supplier credit. No money moves.'
                              : disabled ? 'Not available — the supplier does not owe you money after this debit.' : `Records money the supplier pays back to you${preview ? ` (up to ${fmt(preview.refundable)})` : ''}. Needs refund permission.`}
                          </span></span>
                      </label>
                    )
                  })}
                  {settlement !== 'adjust' && (
                    <label className="text-xs text-[var(--text-3)] flex items-center gap-2">Refund amount
                      <input inputMode="decimal" value={refundAmt} placeholder={netCredit ? String(netCredit) : ''} onChange={e => /^\d*\.?\d{0,2}$/.test(e.target.value) && setRefundAmt(e.target.value)}
                        className={`w-28 h-8 text-right px-2 rounded-md border text-sm ${refundBad ? 'border-red-500' : 'border-[var(--border)]'}`} />
                      <span>the rest stays on the supplier account</span>
                    </label>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="text-xs text-[var(--text-3)]">This bill has no supplier account, so the refund must be received in cash or bank.</div>
                  {(['cash_refund', 'bank_refund'] as Settlement[]).map(k => (
                    <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${settlement === k ? 'border-brand bg-brand/5' : 'border-[var(--border)]'}`}>
                      <input type="radio" name="settle" checked={settlement === k} onChange={() => setSettlement(k)} /><b>{SETTLE_LABEL[k]}</b>
                    </label>
                  ))}
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                <label className="text-xs text-[var(--text-3)] flex flex-col gap-1">Return date
                  <DateSystemInput valueAD={date} onChangeAD={setDate} min={d10(inv.date_ad)} />
                </label>
              </div>
              <label className="text-xs text-[var(--text-3)] flex flex-col gap-1">Narration
                <textarea value={narration} onChange={e => setNarration(e.target.value)} rows={2} maxLength={500} placeholder="Reason for return (optional)"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand" />
              </label>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1.5 text-sm">
              <div className="font-semibold text-sm mb-1">Debit summary {previewing && <span className="text-xs font-normal text-[var(--text-4)]">calculating…</span>}</div>
              {previewErr && <div className="text-xs text-red-600">{previewErr}</div>}
              {!t && !previewErr && <div className="text-xs text-[var(--text-4)]">Enter return quantities to see the credit.</div>}
              {t && (<>
                <Row k="Returned goods (at original rate)" v={fmt(t.goods)} />
                {t.discount > 0 && <Row k="Discount reversed" v={`− ${fmt(t.discount)}`} cls="text-red-600" />}
                {t.cc > 0 && <Row k="CC charge" v={fmt(t.cc)} />}
                {t.tax > 0 && <Row k="VAT included (reversed)" v={fmt(t.tax)} />}
                {t.round_off !== 0 && <Row k="Round off" v={`${t.round_off > 0 ? '+' : '−'} ${fmt(Math.abs(t.round_off))}`} />}
                <div className="flex justify-between pt-2 mt-1 border-t border-[var(--border)] text-base font-bold"><span>Net credit</span><span>{fmt(t.net_credit)}</span></div>
                {inv.party && settlement === 'adjust' && <div className="text-xs text-[var(--text-3)] pt-1">{fmt(preview!.applied_if_adjusted)} reduces this bill's outstanding{t.net_credit - preview!.applied_if_adjusted > 0.004 ? `; ${fmt(t.net_credit - preview!.applied_if_adjusted)} stays as supplier credit` : ''}.</div>}
                {t.completes_bill && <div className="text-xs text-[var(--text-3)]">This return completes the bill — it is credited exactly in full.</div>}
              </>)}
              <div className="pt-3 flex gap-2">
                <Button variant="secondary" onClick={resetAll}>Cancel</Button>
                <Button variant="primary" icon={<RotateCcw size={14} />} disabled={!online || saving || !items.length || !!overLines.length || previewing || !preview} onClick={openConfirm}>Review &amp; Post Return</Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* confirmation */}
      <Modal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title="Confirm purchase return" size="md"
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>Back</Button>
          <Button variant="primary" loading={saving} disabled={saving} onClick={post}>Post Return</Button></>}>
        {inv && t && (
          <div className="space-y-3 text-sm">
            <div>Bill <b>{inv.bill_no}</b>{inv.party ? ` · ${inv.party.name}` : ''} · {formatDisplayDate(date, dateMode)}</div>
            <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {inv.items.filter(l => num(qty[l.id]) > 0).map(l => (
                <div key={l.id} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{l.product_name} <span className="text-[var(--text-4)]">· {l.batch_no || 'no batch'}</span></span><span className="whitespace-nowrap">{num(qty[l.id])} → <b>{fmt(lineNet.get(l.id)?.net ?? 0)}</b></span></div>
              ))}
            </div>
            <div className="flex justify-between text-base font-bold"><span>Net credit</span><span>{fmt(t.net_credit)}</span></div>
            <div className="text-xs text-[var(--text-3)]">Settlement: <b>{SETTLE_LABEL[settlement]}</b>{settlement !== 'adjust' && inv.party ? ` — ${fmt(refundValue)} paid out` : ''}. Stock is removed from each original batch and the accounting entry is posted. This cannot be edited afterwards.</div>
          </div>
        )}
      </Modal>
    </div>
  )
}

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
        <label className="text-xs text-[var(--text-3)] flex items-center gap-2 md:col-span-2">From <DateSystemInput valueAD={dFrom} onChangeAD={setDFrom} className="flex-1" /></label>
        <label className="text-xs text-[var(--text-3)] flex items-center gap-2 md:col-span-2">To <DateSystemInput valueAD={dTo} onChangeAD={setDTo} className="flex-1" /></label>
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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RotateCcw size={18} className="text-brand" />
        <h1 className="text-lg font-semibold">Purchase Return</h1>
      </div>
      <Tabs tabs={[{ id: 'new', label: 'New Return', icon: <FilePlus size={14} /> }, { id: 'all', label: 'All Returns', icon: <List size={14} /> }]} active={tab} onChange={setTab} />
      <div hidden={tab !== 'new'}><NewReturn onPosted={() => setRefreshKey(k => k + 1)} /></div>
      {tab === 'all' && <AllReturns refreshKey={refreshKey} />}
    </div>
  )
}
