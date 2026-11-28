/**
 * saleToPrintData.ts — turns a SAVED sale (GET /sales/:id) into the `PrintData` the invoice templates print.
 *
 * This is the same mapping SalesPage uses when you press Print on a saved invoice, with the same calculation
 * helpers (no invoice maths of its own):
 *   • `derivePrintDiscount` recovers the gross subtotal and the discount from the saved item amounts — the API's
 *     `subtotal` is already net of discount and it has no discount total (see routes/sales.js);
 *   • `grossItemAmount` is the per-line display amount (qty × rate); the discount is shown once, in the summary;
 *   • round-off, net, paid and due are the values saved with the invoice, never recomputed.
 * The one thing SalesPage reads from its own product list — a line's unit when the sale line has none — is
 * supplied through `unitOf` (used only by the Boxed / Sold-To layouts).
 */
import { derivePrintDiscount, grossItemAmount } from '@/components/forms/discount/discountUtils'
import type { PrintData } from '@/components/print'

export interface SaleToPrintOptions {
  /** Unit from the product master, for lines whose saved row has none. */
  unitOf?: (productId?: string) => string | undefined
  /** MRP from the product master, for lines whose saved row has none. */
  mrpOf?: (productId?: string) => number | undefined
  /** "RE-PRINT[n]" counter for this print (see utils/reprintCounter). */
  reprintCount?: number
}

export function saleToPrintData(d: any, opts: SaleToPrintOptions = {}): PrintData {
  const items: any[] = d.items || []
  const { grossSubtotal, discountAmt } = derivePrintDiscount(items)
  const printItems = items.map((it: any) => ({
    product_name: it.product_name, batch_no: it.batch_no, expiry: it.expiry,
    qty: Number(it.qty), bonus: Number(it.bonus) || 0, rate: Number(it.rate),
    discount_pct: Number(it.discount_pct) || 0, cc_pct: Number(it.cc_pct) || 0,
    cc_amount: Number(it.cc_amount) || 0, amount: grossItemAmount(it.qty, it.rate),
    mrp: it.mrp != null ? Number(it.mrp) : opts.mrpOf?.(it.product_id),
    unit: it.unit || opts.unitOf?.(it.product_id),
  }))
  return {
    voucherNo: d.invoice_no, type: 'SALE', date: d.date_ad,
    paymentMode: d.payment_mode, partyName: d.party_name,
    extra: {
      // SalesPage reads these from the customer record, falling back to the sale's joined party fields — the
      // same parties row either way, and the detail endpoint already returns it.
      partyCode: d.party_code, partyAddress: d.party_address || undefined,
      partyPhone: d.party_phone || undefined, partyPan: d.party_pan || undefined,
      issuedAt: d.created_at, reprintCount: opts.reprintCount,
    },
    items: printItems,
    subtotal: grossSubtotal, discountAmt, ccAmount: Number(d.cc_amount || 0),
    roundOff: Number(d.round_off) || 0,
    netTotal: Number(d.net_total), paidAmount: Number(d.paid_amount), dueAmount: Number(d.due_amount),
  }
}
