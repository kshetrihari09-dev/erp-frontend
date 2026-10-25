/**
 * retailBasket.ts — pure pricing/basket rules for Retail Sale. No React, no API.
 *
 * LOOSE-TABLET BILLING (decided with the shop): loose tablets are billed as a
 * fraction of a strip on the normal Sales invoice —
 *     qty  = tablets / tablets_per_strip      (4 decimals)
 *     rate = price per tablet × tablets_per_strip  (i.e. the strip rate)
 * so qty × rate always equals tablets × price-per-tablet, stock is deducted in
 * strips exactly as the Sales page already does, and nothing in accounting or
 * the posting engine needs to know loose tablets exist.
 */
import type { Product } from '@/types'

export const RETAIL_HANDOFF_KEY = 'retailSaleHandoff'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

export interface BasketLine {
  product: Product
  pack: number            // tablets per strip
  ppt: number             // price per tablet (editable)
  pieces: number          // number of cut pieces dropped in
  tablets: number         // total tablets billed
}

/** Default price per tablet = strip sales rate ÷ tablets per strip. */
export function defaultPricePerTablet(p: Product, pack: number): number {
  const rate = Number(p.sales_rate)
  return Number.isFinite(rate) && rate >= 0 && pack > 0 ? rate / pack : 0
}

/** A usable price: finite and not negative. */
export const isValidPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export const lineTotal = (l: BasketLine) => round2(l.tablets * l.ppt)

export function totals(lines: BasketLine[]) {
  return {
    items:   lines.length,
    pieces:  lines.reduce((s, l) => s + l.pieces, 0),
    tablets: lines.reduce((s, l) => s + l.tablets, 0),
    grand:   round2(lines.reduce((s, l) => s + lineTotal(l), 0)),
  }
}

/** Strips of stock a line needs. */
export const stripsNeeded = (l: BasketLine) => l.tablets / l.pack

/** Lines whose tablets exceed the product's stock (in strips). */
export function overStock(lines: BasketLine[]): BasketLine[] {
  return lines.filter(l => {
    const stock = Number(l.product.current_stock)
    return Number.isFinite(stock) && stripsNeeded(l) > stock + 1e-9
  })
}

export interface HandoffItem {
  product: Product
  qty: number        // strips, fractional
  rate: number       // per strip
  tablets: number
  pack: number
}

/** What the Sales page receives. Nothing is posted by building this. */
export function toHandoff(lines: BasketLine[]): HandoffItem[] {
  return lines.map(l => ({
    product: l.product,
    qty: round4(l.tablets / l.pack),
    rate: round4(l.ppt * l.pack),
    tablets: l.tablets,
    pack: l.pack,
  }))
}

/** Add one dropped piece to the basket, merging by product. Returns a new array. */
export function addToBasket(lines: BasketLine[], product: Product, pack: number, tablets: number, defaultPpt?: number): BasketLine[] {
  if (!Number.isInteger(tablets) || tablets <= 0) return lines
  const i = lines.findIndex(l => l.product.id === product.id)
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, pieces: l.pieces + 1, tablets: l.tablets + tablets } : l))
  return [...lines, { product, pack, ppt: defaultPpt ?? defaultPricePerTablet(product, pack), pieces: 1, tablets }]
}
