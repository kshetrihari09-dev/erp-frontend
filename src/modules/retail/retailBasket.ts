/**
 * retailBasket.ts — pure pricing/basket rules for Retail Sale. No React, no API.
 *
 * Two kinds of basket line:
 *
 *  'tablets'  loose tablets cut from a blister. Billed as a fraction of a strip
 *               qty  = tablets / tablets_per_strip      (4 decimals)
 *               rate = price per tablet × tablets_per_strip  (the strip rate)
 *             so qty × rate = tablets × price-per-tablet.
 *
 *  'unit'     an intact package (bottle / tube). Billed as whole units of the
 *             product's own unit at the product's own rate:
 *               qty = units, rate = product.sales_rate (or the edited price).
 *             Never derived from tablet counts.
 *
 * Either way the Sales invoice receives an ordinary row, so stock deduction,
 * batch/expiry selection, tax, discount and posting stay exactly as they are.
 */
import type { Product } from '@/types'

export const RETAIL_HANDOFF_KEY = 'retailSaleHandoff'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

export type LineKind = 'tablets' | 'unit'

export interface BasketLine {
  product: Product
  kind?: LineKind         // omitted = 'tablets' (older callers)
  pack: number            // tablets per strip (1 for unit lines)
  ppt: number             // price per tablet ('tablets') or per unit ('unit'); editable
  pieces: number          // pieces dropped in ('tablets') or units added ('unit')
  tablets: number         // tablets billed ('tablets'); 0 for unit lines
  units?: number          // whole packages billed ('unit')
}

export const kindOf = (l: BasketLine): LineKind => l.kind ?? 'tablets'

/** Default price per tablet = strip sales rate ÷ tablets per strip. */
export function defaultPricePerTablet(p: Product, pack: number): number {
  const rate = Number(p.sales_rate)
  return Number.isFinite(rate) && rate >= 0 && pack > 0 ? rate / pack : 0
}
/** Default price of one intact package = the product's own sales rate. */
export function defaultUnitPrice(p: Product): number {
  const rate = Number(p.sales_rate)
  return Number.isFinite(rate) && rate >= 0 ? rate : 0
}

export const isValidPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export const lineTotal = (l: BasketLine) => round2((kindOf(l) === 'unit' ? (l.units ?? 0) : l.tablets) * l.ppt)

export function totals(lines: BasketLine[]) {
  return {
    items:   lines.length,
    pieces:  lines.filter(l => kindOf(l) === 'tablets').reduce((s, l) => s + l.pieces, 0),
    tablets: lines.reduce((s, l) => s + l.tablets, 0),
    units:   lines.reduce((s, l) => s + (kindOf(l) === 'unit' ? (l.units ?? 0) : 0), 0),
    grand:   round2(lines.reduce((s, l) => s + lineTotal(l), 0)),
  }
}

/** Stock the line needs, in the product's own unit (strips for tablets, packages for units). */
export const stripsNeeded = (l: BasketLine) => (kindOf(l) === 'unit' ? (l.units ?? 0) : l.tablets / l.pack)

/** Lines whose quantity exceeds the product's stock. */
export function overStock(lines: BasketLine[]): BasketLine[] {
  return lines.filter(l => {
    const stock = Number(l.product.current_stock)
    return Number.isFinite(stock) && stripsNeeded(l) > stock + 1e-9
  })
}

export interface HandoffItem {
  product: Product
  qty: number        // strips (fractional) or whole packages
  rate: number       // per strip / per package
  tablets: number
  pack: number
}

/** What the Sales page receives. Nothing is posted by building this. */
export function toHandoff(lines: BasketLine[]): HandoffItem[] {
  return lines.map(l =>
    kindOf(l) === 'unit'
      ? { product: l.product, qty: l.units ?? 0, rate: round4(l.ppt), tablets: 0, pack: 1 }
      : { product: l.product, qty: round4(l.tablets / l.pack), rate: round4(l.ppt * l.pack), tablets: l.tablets, pack: l.pack },
  )
}

/** Add one dropped blister piece, merging by product. Returns a new array. */
export function addToBasket(lines: BasketLine[], product: Product, pack: number, tablets: number, defaultPpt?: number): BasketLine[] {
  if (!Number.isInteger(tablets) || tablets <= 0) return lines
  const i = lines.findIndex(l => l.product.id === product.id && kindOf(l) === 'tablets')
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, pieces: l.pieces + 1, tablets: l.tablets + tablets } : l))
  return [...lines, { product, kind: 'tablets', pack, ppt: defaultPpt ?? defaultPricePerTablet(product, pack), pieces: 1, tablets }]
}

/** Add one intact package (bottle/tube), merging by product. Returns a new array. */
export function addUnitToBasket(lines: BasketLine[], product: Product, defaultPrice?: number): BasketLine[] {
  const i = lines.findIndex(l => l.product.id === product.id && kindOf(l) === 'unit')
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, units: (l.units ?? 0) + 1, pieces: l.pieces + 1 } : l))
  return [...lines, { product, kind: 'unit', pack: 1, ppt: defaultPrice ?? defaultUnitPrice(product), pieces: 1, tablets: 0, units: 1 }]
}
