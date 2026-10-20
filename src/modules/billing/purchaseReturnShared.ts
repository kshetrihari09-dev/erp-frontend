/**
 * purchaseReturnShared.ts — types + pure helpers shared by the Purchase Return page (history tab)
 * and the Purchase-style return billing screen (PurchaseReturnBilling.tsx).
 */
import type { PrintData } from '@/components/print'
import { fmt } from '@/utils'
import { type Settlement, num, d10 } from './salesReturnShared'

export { num, d10, errMsg, errCode, uuid } from './salesReturnShared'
export type { Settlement } from './salesReturnShared'

export const PSETTLE_LABEL: Record<Settlement, string> = {
  adjust: 'Debit to supplier account', cash_refund: 'Cash refund', bank_refund: 'Bank refund',
}

/** A posted purchase return as the backend sends it. For an auto-linked return that touched several bills the numbers
 *  are summed and `return_no` / `bill_no` are comma-joined; `returns` holds the individual debit notes. */
export interface PurchaseReturnDetail {
  id: string; return_no: string; return_date: string; date_bs?: string; bill_no: string; party_name?: string
  party_address?: string; party_phone?: string; party_pan?: string; goods_amount: number; discount_amount: number
  cc_amount: number; tax_amount: number; round_off: number; net_credit: number; applied_to_bill: number
  supplier_credit: number; refund_amount: number; settlement: Settlement; narration?: string; debit_note_no?: string
  refund_voucher_no?: string; voucher_id?: string
  items: { id: string; product_name: string; batch_no?: string; expiry?: string; qty: number; rate: number; discount_pct: number
    gross_amount: number; discount_amount: number; net_amount: number; bill_no?: string; return_no?: string }[]
  returns?: PurchaseReturnDetail[]
}

export function purchaseSettlementText(d: PurchaseReturnDetail): string {
  const rest = num(d.supplier_credit) + num(d.applied_to_bill)
  if (d.settlement === 'cash_refund') return `Cash refund ${fmt(d.refund_amount)}${rest > 0 ? ` · remaining ${fmt(rest)} to account` : ''}`
  if (d.settlement === 'bank_refund') return `Bank refund ${fmt(d.refund_amount)}${rest > 0 ? ` · remaining ${fmt(rest)} to account` : ''}`
  const parts: string[] = []
  if (num(d.applied_to_bill) > 0) parts.push(`${fmt(d.applied_to_bill)} adjusted against bill outstanding`)
  if (num(d.supplier_credit) > 0) parts.push(`${fmt(d.supplier_credit)} retained as supplier credit`)
  return parts.join(' · ') || 'Debited to supplier account'
}

export function purchaseReturnToPrintData(d: PurchaseReturnDetail): PrintData {
  return {
    voucherNo: d.return_no, type: 'PURCHASE_RETURN', date: d10(d.return_date), dateBS: d.date_bs || undefined,
    referenceNo: d.bill_no, partyName: d.party_name || undefined, partyAddress: d.party_address || undefined,
    partyPhone: d.party_phone || undefined, partyPan: d.party_pan || undefined, narration: d.narration || undefined,
    items: d.items.map(i => ({
      product_name: i.product_name, batch_no: i.batch_no || undefined, expiry: i.expiry || undefined,
      qty: num(i.qty), rate: num(i.rate), discount_pct: num(i.discount_pct) || undefined, amount: num(i.gross_amount),
    })),
    subtotal: num(d.goods_amount), discountAmt: num(d.discount_amount), ccAmount: num(d.cc_amount), taxAmt: num(d.tax_amount),
    roundOff: num(d.round_off), netTotal: num(d.net_credit), settlement: purchaseSettlementText(d),
  }
}

// ── auto-linked preview (POST /returns/purchase/preview with { party_id?, lines }) ──
export interface PurchasePreviewAllocation {
  purchase_id: string; bill_no: string; supplier_bill_no?: string | null; bill_date: string; purchase_item_id: string
  batch_no: string | null; expiry: string | null; expiry_date: string | null; expired?: boolean; qty: number
  gross: number; discount: number; cc: number; tax: number; net: number
}
export interface PurchasePreviewBatch { batch_no: string | null; expiry: string | null; expiry_date: string | null; returnable_qty: number }
export interface PurchasePreviewLine {
  index: number; product_id: string; product_name: string; requested_qty: number; batch_no: string | null
  available_qty: number; batches: PurchasePreviewBatch[]; ok: boolean; error: { code: string; message: string } | null
  gross: number; discount: number; cc: number; tax: number; net: number; rate: number; discount_pct: number
  allocations: PurchasePreviewAllocation[]
}
export interface PurchaseReturnPreview {
  mode: 'auto'; lines: PurchasePreviewLine[]; has_errors: boolean
  totals: { goods: number; discount: number; cc: number; tax: number; line_net: number; round_off: number; net_credit: number } | null
  returns: { purchase_id: string; bill_no: string; bill_date: string; net_credit: number }[]
  supplier_balance: number | null; refundable: number; bill_due: number; applied_if_adjusted: number
}
