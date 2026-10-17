/**
 * On-screen purchase totals (discountUtils + calcRowAmount) must equal what
 * the backend saves (utils/purchaseCalc.js applied to the discount_pct the
 * frontend sends) — for every discount scope, including rows that carry both
 * CC and a discount.
 */
import assert from 'node:assert/strict'
import { newRow, type InvoiceRow } from '../src/components/forms/InvoiceRowsTable'
import { calcRowAmount } from '../src/utils'
import {
  computeItemDiscounts, computeTotals, emptyDiscount, type DiscountEntry,
} from '../src/components/forms/discount/discountUtils'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const backend = require('../../erp-unified-backend/src/utils/purchaseCalc.js')

function mk(name: string, qty: number, rate: number, bonus = 0, cc_pct = 0): InvoiceRow {
  const r = { ...newRow(), product_id: name, product_name: name, qty, rate, bonus, cc_pct }
  return { ...r, ...calcRowAmount(r) }
}
const products: any[] = [
  { id: 'a', name: 'A', company_name: 'Acme' },
  { id: 'b', name: 'B', company_name: 'Acme' },
  { id: 'c', name: 'C', company_name: 'Zeta' },
]
const rows = [mk('a', 10, 100, 5, 10), mk('b', 3, 40.5), mk('c', 7, 19.99, 2, 5)]

function serverNet(pctById: Record<number, number>) {
  let sum = 0
  for (const r of rows) {
    sum += backend.calcRowAmount({
      qty: r.qty, rate: Number(r.rate), bonus: r.bonus, cc_pct: r.cc_pct, discount_pct: pctById[r._id] || 0,
    }).amount
  }
  return Math.round(sum * 100) / 100
}
const pct = (value: number): DiscountEntry => ({ type: 'percentage', value })
const fixed = (value: number): DiscountEntry => ({ type: 'fixed', value })

function check(label: string, scope: any, inv: DiscountEntry, co: any, pr: any) {
  const { pctById, totalDiscount } = computeItemDiscounts(rows, products, scope, inv, co, pr)
  const screen = computeTotals(rows, totalDiscount)
  const server = serverNet(pctById)
  const screenNet = Math.round((screen.netTotal) * 100) / 100
  // within a few paise (per-line 2dp rounding on the server); whole-rupee grand total must match
  assert.ok(Math.abs(server - screenNet) <= 0.05, `${label}: server ${server} vs screen ${screenNet}`)
  assert.equal(Math.round(server), screen.grandTotal, `${label}: grand total`)
  console.log(`ok - ${label} (discount ${totalDiscount}, net ${server}, grand ${screen.grandTotal})`)
}

check('no discount', 'invoice', emptyDiscount(), {}, {})
check('invoice 10%', 'invoice', pct(10), {}, {})
check('invoice fixed 137', 'invoice', fixed(137), {}, {})
check('company mix', 'company', emptyDiscount(), { Acme: pct(12), Zeta: fixed(20) }, {})
check('product mix', 'product', emptyDiscount(), {}, { [rows[0]._id]: pct(25), [rows[2]._id]: fixed(30) })
console.log('purchaseDiscount: all passed')
