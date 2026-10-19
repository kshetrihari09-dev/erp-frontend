/**
 * salesReturnShared.ts — types + pure helpers shared by the Sales Return page (history tab)
 * and the Sales-style return billing screen (SalesReturnBilling.tsx).
 */
import type { PrintData } from '@/components/print'
import { fmt } from '@/utils'

export type Settlement = 'adjust' | 'cash_refund' | 'bank_refund'

export const SETTLE_LABEL: Record<Settlement, string> = {
  adjust: 'Credit to customer account', cash_refund: 'Cash refund', bank_refund: 'Bank refund',
}

/** A posted return as the backend sends it. For an auto-linked return that touched several invoices the numbers
 *  are summed and `return_no` / `invoice_no` are comma-joined; `returns` holds the individual credit notes. */
export interface ReturnDetail {
  id: string; return_no: string; return_date: string; date_bs?: string; invoice_no: string; party_name?: string
  party_address?: string; party_phone?: string; party_pan?: string; goods_amount: number; discount_amount: number
  cc_amount: number; tax_amount: number; round_off: number; net_credit: number; applied_to_invoice: number
  customer_credit: number; refund_amount: number; settlement: Settlement; narration?: string; credit_note_no?: string
  refund_voucher_no?: string; voucher_id?: string
  items: { id: string; product_name: string; batch_no?: string; expiry?: string; qty: number; rate: number; discount_pct: number
    gross_amount: number; discount_amount: number; net_amount: number; invoice_no?: string; return_no?: string }[]
  returns?: ReturnDetail[]
}

export const num = (v: unknown) => Number(v) || 0
export const d10 = (v?: string | null) => (v ? String(v).slice(0, 10) : '')
export const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || (e as Error)?.message || fallback
export const errCode = (e: unknown) => (e as { response?: { data?: { code?: string } } })?.response?.data?.code
export const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16) })

export function settlementText(d: ReturnDetail): string {
  const rest = num(d.customer_credit) + num(d.applied_to_invoice)
  if (d.settlement === 'cash_refund') return `Cash refund ${fmt(d.refund_amount)}${rest > 0 ? ` · remaining ${fmt(rest)} to account` : ''}`
  if (d.settlement === 'bank_refund') return `Bank refund ${fmt(d.refund_amount)}${rest > 0 ? ` · remaining ${fmt(rest)} to account` : ''}`
  const parts: string[] = []
  if (num(d.applied_to_invoice) > 0) parts.push(`${fmt(d.applied_to_invoice)} adjusted against invoice outstanding`)
  if (num(d.customer_credit) > 0) parts.push(`${fmt(d.customer_credit)} retained as customer credit`)
  return parts.join(' · ') || 'Credited to customer account'
}

export function returnToPrintData(d: ReturnDetail): PrintData {
  return {
    voucherNo: d.return_no, type: 'SALE_RETURN', date: d10(d.return_date), dateBS: d.date_bs || undefined,
    referenceNo: d.invoice_no, partyName: d.party_name || undefined, partyAddress: d.party_address || undefined,
    partyPhone: d.party_phone || undefined, partyPan: d.party_pan || undefined, narration: d.narration || undefined,
    items: d.items.map(i => ({
      product_name: i.product_name, batch_no: i.batch_no || undefined, expiry: i.expiry || undefined,
      qty: num(i.qty), rate: num(i.rate), discount_pct: num(i.discount_pct) || undefined, amount: num(i.gross_amount),
    })),
    subtotal: num(d.goods_amount), discountAmt: num(d.discount_amount), ccAmount: num(d.cc_amount), taxAmt: num(d.tax_amount),
    roundOff: num(d.round_off), netTotal: num(d.net_credit), settlement: settlementText(d),
  }
}

// ── auto-linked preview (POST /returns/sales/preview with { party_id?, lines }) ──
export interface PreviewAllocation {
  sale_id: string; invoice_no: string; invoice_date: string; sale_item_id: string; batch_no: string | null
  expiry: string | null; expiry_date: string | null; expired?: boolean; qty: number
  gross: number; discount: number; cc: number; tax: number; net: number
}
export interface PreviewBatch { batch_no: string | null; expiry: string | null; expiry_date: string | null; returnable_qty: number }
export interface PreviewLine {
  index: number; product_id: string; product_name: string; requested_qty: number; batch_no: string | null
  available_qty: number; batches: PreviewBatch[]; ok: boolean; error: { code: string; message: string } | null
  gross: number; discount: number; cc: number; tax: number; net: number; rate: number; discount_pct: number
  allocations: PreviewAllocation[]
}
export interface ReturnPreview {
  mode: 'auto'; lines: PreviewLine[]; has_errors: boolean
  totals: { goods: number; discount: number; cc: number; tax: number; line_net: number; round_off: number; net_credit: number } | null
  returns: { sale_id: string; invoice_no: string; invoice_date: string; net_credit: number }[]
  customer_balance: number | null; refundable: number; invoice_due: number; applied_if_adjusted: number
}
