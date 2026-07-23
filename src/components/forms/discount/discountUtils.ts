/**
 * discountUtils.ts
 *
 * Pure helpers backing the Discount Review workflow on the Sale page.
 *
 * Design notes
 * ────────────
 * - The backend only ever applies a single per-line `discount_pct` field
 *   (see erp-unified-backend/src/routes/sales.js). Whatever scope the user
 *   picks — Invoice, Company, or Product — everything ultimately reduces
 *   to "what % discount does line X get?" before posting. That keeps the
 *   posting API, tax logic, accounting integration, and stock deduction
 *   completely untouched — this file only ever produces numbers that flow
 *   into the existing `item.discount_pct` field.
 * - `row.amount` (from calcRowAmount) is used as each line's gross amount.
 *   Rows never have their own discount_pct set by any existing UI control
 *   (InvoiceRowsTable is rendered with showDiscount={false}), so row.amount
 *   is always the pre-discount line total — a safe stand-in for "gross".
 * - A fixed-amount discount is converted to an equivalent percentage of its
 *   base (invoice / company-group / product) so the *result* is identical
 *   whether the user typed a % or a flat Rs. value.
 */

import type { InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import type { Product } from '@/types'

export type DiscountScope = 'invoice' | 'company' | 'product'
export type DiscountKind  = 'percentage' | 'fixed'

export interface DiscountEntry {
  type:  DiscountKind
  value: number
}

export const emptyDiscount = (): DiscountEntry => ({ type: 'percentage', value: 0 })

export function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Number(v) || 0))
}

export function clampFixed(v: number, max: number): number {
  const n = Number(v) || 0
  return Math.min(Math.max(n, 0), Math.max(max, 0))
}

/** Rs. discount amount a single DiscountEntry produces against `base`. */
export function discountAmountFor(entry: DiscountEntry, base: number): number {
  if (base <= 0) return 0
  const amt = entry.type === 'fixed'
    ? clampFixed(entry.value, base)
    : base * clampPct(entry.value) / 100
  return Math.round(amt * 100) / 100
}

/** Rows that actually count toward the invoice (have a product + qty). */
export function validRows(rows: InvoiceRow[]): InvoiceRow[] {
  return rows.filter(r => r.product_id && Number(r.qty) > 0)
}

export function rowCompanyName(row: InvoiceRow, products: Product[]): string {
  const p = products.find(p => p.id === row.product_id)
  return p?.company_name?.trim() || 'Unassigned'
}

// ─── Company scope ──────────────────────────────────────────────────────────
export interface CompanyGroup {
  key:            string
  label:          string
  rows:           InvoiceRow[]
  subtotal:       number
  discount:       DiscountEntry
  discountAmount: number
}

export function buildCompanyGroups(
  rows: InvoiceRow[], products: Product[], companyDiscounts: Record<string, DiscountEntry>,
): CompanyGroup[] {
  const map = new Map<string, InvoiceRow[]>()
  validRows(rows).forEach(r => {
    const key = rowCompanyName(r, products)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })
  return Array.from(map.entries())
    .map(([key, groupRows]) => {
      const subtotal = groupRows.reduce((s, r) => s + r.amount, 0)
      const discount = companyDiscounts[key] || emptyDiscount()
      return { key, label: key, rows: groupRows, subtotal, discount, discountAmount: discountAmountFor(discount, subtotal) }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ─── Product scope ──────────────────────────────────────────────────────────
export interface ProductRowInfo {
  row:            InvoiceRow
  company:        string
  discount:       DiscountEntry
  discountAmount: number
}

export function buildProductRows(
  rows: InvoiceRow[], products: Product[], productDiscounts: Record<number, DiscountEntry>,
): ProductRowInfo[] {
  return validRows(rows).map(r => {
    const discount = productDiscounts[r._id] || emptyDiscount()
    return { row: r, company: rowCompanyName(r, products), discount, discountAmount: discountAmountFor(discount, r.amount) }
  })
}

// ─── Resolve every line's final discount % + the totals it produces ───────
export interface ItemDiscountResult {
  /** InvoiceRow._id → discount_pct (0-100) to send to the backend. */
  pctById:       Record<number, number>
  totalDiscount: number
}

export function computeItemDiscounts(
  rows: InvoiceRow[],
  products: Product[],
  scope: DiscountScope,
  invoiceDiscount: DiscountEntry,
  companyDiscounts: Record<string, DiscountEntry>,
  productDiscounts: Record<number, DiscountEntry>,
): ItemDiscountResult {
  const pctById: Record<number, number> = {}
  let totalDiscount = 0

  if (scope === 'invoice') {
    const rowsIn  = validRows(rows)
    const subtotal = rowsIn.reduce((s, r) => s + r.amount, 0)
    const discAmt  = discountAmountFor(invoiceDiscount, subtotal)
    const pct      = subtotal > 0 ? (discAmt / subtotal) * 100 : 0
    rowsIn.forEach(r => { pctById[r._id] = pct })
    totalDiscount  = discAmt
  } else if (scope === 'company') {
    buildCompanyGroups(rows, products, companyDiscounts).forEach(g => {
      totalDiscount += g.discountAmount
      const pct = g.subtotal > 0 ? (g.discountAmount / g.subtotal) * 100 : 0
      g.rows.forEach(r => { pctById[r._id] = pct })
    })
  } else {
    buildProductRows(rows, products, productDiscounts).forEach(pr => {
      totalDiscount += pr.discountAmount
      pctById[pr.row._id] = pr.row.amount > 0 ? (pr.discountAmount / pr.row.amount) * 100 : 0
    })
  }

  return { pctById, totalDiscount: Math.round(totalDiscount * 100) / 100 }
}

export interface DiscountTotals {
  subtotal:   number
  netTotal:   number
  roundOff:   number
  grandTotal: number
}

export function computeTotals(rows: InvoiceRow[], totalDiscount: number): DiscountTotals {
  const subtotal   = validRows(rows).reduce((s, r) => s + r.amount, 0)
  const netTotal   = subtotal - totalDiscount
  const roundOff   = Math.round((Math.round(netTotal) - netTotal) * 100) / 100
  const grandTotal = Math.round(netTotal)
  return { subtotal, netTotal, roundOff, grandTotal }
}
