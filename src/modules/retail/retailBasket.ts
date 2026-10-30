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
 *  'unit'     an intact package (bottle, tube, vial, ampoule, sachet, box, pcs) or a
 *             measured quantity of Kg / Ltr. Billed as units of the
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
  edited?: boolean        // quantity typed/stepped by hand (so "N pieces" no longer describes the tablets)
  basePpt?: number        // the default price when the line was created (so a custom price can be spotted and reset)
  log?: number[]          // tablets in each piece dropped in, in order (tablets lines), e.g. [4, 6]
}

export const kindOf = (l: BasketLine): LineKind => l.kind ?? 'tablets'
/** Stable id of a line: one line per product per kind. */
export const lineId = (l: BasketLine) => `${l.product.id}:${kindOf(l)}`
export const hasCustomPrice = (l: BasketLine) => l.basePpt !== undefined && Math.abs(l.ppt - l.basePpt) > 1e-9

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

/** Everything the basket needs of ONE product (a tablets line and a unit line of the same product draw on the same stock). */
export const stockNeeded = (lines: BasketLine[], productId: Product['id']) =>
  lines.filter(l => l.product.id === productId).reduce((s, l) => s + stripsNeeded(l), 0)

/** Lines of products whose combined quantity exceeds the product's stock. */
export function overStock(lines: BasketLine[]): BasketLine[] {
  return lines.filter(l => {
    const stock = Number(l.product.current_stock)
    return Number.isFinite(stock) && stockNeeded(lines, l.product.id) > stock + 1e-9
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
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, pieces: l.pieces + 1, tablets: l.tablets + tablets, log: [...(l.log ?? []), tablets] } : l))
  const ppt = defaultPpt ?? defaultPricePerTablet(product, pack)
  return [...lines, { product, kind: 'tablets', pack, ppt, basePpt: ppt, pieces: 1, tablets, log: [tablets] }]
}

/**
 * Parse a typed quantity (Kg / Ltr). Returns null unless it is a finite number greater than 0
 * and at most MAX_QTY; rounded to 3 decimals (e.g. 0.25, 1.5, 12.375).
 */
export const MAX_QTY = 100000
export function parseQuantity(text: string): number | null {
  const t = String(text ?? '').trim()
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null
  const v = Math.round(Number(t) * 1000) / 1000
  return Number.isFinite(v) && v > 0 && v <= MAX_QTY ? v : null
}

/** Add intact package(s) (bottle, tube, vial … or `qty` Kg/Ltr), merging by product. Returns a new array. */
export function addUnitToBasket(lines: BasketLine[], product: Product, defaultPrice?: number, qty = 1): BasketLine[] {
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) return lines
  const i = lines.findIndex(l => l.product.id === product.id && kindOf(l) === 'unit')
  if (i >= 0) return lines.map((l, k) => (k === i ? { ...l, units: round4((l.units ?? 0) + qty), pieces: l.pieces + 1 } : l))
  const ppt = defaultPrice ?? defaultUnitPrice(product)
  return [...lines, { product, kind: 'unit', pack: 1, ppt, basePpt: ppt, pieces: 1, tablets: 0, units: round4(qty) }]
}

/** Kg / Ltr are measured (decimals allowed); every other unit is counted in whole packages. */
export const isBulkUnit = (unit?: string | null) => /^(kg|ltr)$/i.test(String(unit ?? '').trim())

/** Largest whole quantity accepted for counted items (tablets, bottles, tubes …). */
export const MAX_WHOLE_QTY = 99999

/**
 * Parse a typed quantity. Kg / Ltr (`bulk`): up to 3 decimals, > 0 (see parseQuantity).
 * Everything else: a whole number from 1 to MAX_WHOLE_QTY. Anything else → null.
 */
export function parseUnitQty(text: string, bulk: boolean): number | null {
  if (bulk) return parseQuantity(text)
  const t = String(text ?? '').trim()
  if (!/^\d+$/.test(t)) return null
  const v = Number(t)
  return v >= 1 && v <= MAX_WHOLE_QTY ? v : null
}

/**
 * Set the quantity of one basket line: tablets for a 'tablets' line, packages (or Kg / Ltr) for a 'unit' line.
 * An invalid quantity leaves the basket unchanged. Returns a new array.
 */
export function setLineQty(lines: BasketLine[], product: Product, kind: LineKind, qty: number): BasketLine[] {
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) return lines
  const i = lines.findIndex(l => l.product.id === product.id && kindOf(l) === kind)
  if (i < 0) return lines
  if (kind === 'tablets') {
    if (!Number.isInteger(qty) || qty > MAX_WHOLE_QTY) return lines
    return lines.map((l, k) => (k === i ? { ...l, tablets: qty, edited: true } : l))
  }
  if (qty > MAX_QTY || (!isBulkUnit(product.unit) && !Number.isInteger(qty))) return lines
  return lines.map((l, k) => (k === i ? { ...l, units: round4(qty), edited: true } : l))
}

// ─────────────────────────────────────────────────────────────────────────────
// Basket state: every change is one reducer action, so it is undoable and testable.
// ─────────────────────────────────────────────────────────────────────────────
export const UNDO_LIMIT = 30

export interface BasketState {
  lines: BasketLine[]
  /** Earlier states of `lines` (most recent last); `undo` pops one. Never persisted. */
  past: BasketLine[][]
}
export const emptyBasket: BasketState = { lines: [], past: [] }

export type BasketAction =
  | { type: 'addTablets'; product: Product; pack: number; tablets: number }
  | { type: 'addUnit'; product: Product; qty: number }
  | { type: 'setQty'; id: string; qty: number }
  | { type: 'setPrice'; id: string; ppt: number }
  | { type: 'resetPrice'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'restore'; lines: BasketLine[] }

export function basketReducer(state: BasketState, a: BasketAction): BasketState {
  const { lines } = state
  let next: BasketLine[] = lines
  switch (a.type) {
    case 'addTablets': next = addToBasket(lines, a.product, a.pack, a.tablets); break
    case 'addUnit':    next = addUnitToBasket(lines, a.product, undefined, a.qty); break
    case 'setQty': {
      const l = lines.find(x => lineId(x) === a.id)
      next = l ? setLineQty(lines, l.product, kindOf(l), a.qty) : lines
      break
    }
    case 'setPrice':   next = isValidPrice(a.ppt) ? lines.map(l => (lineId(l) === a.id && l.ppt !== a.ppt ? { ...l, ppt: a.ppt } : l)) : lines; break
    case 'resetPrice': next = lines.map(l => (lineId(l) === a.id && hasCustomPrice(l) ? { ...l, ppt: l.basePpt as number } : l)); break
    case 'remove':     next = lines.some(l => lineId(l) === a.id) ? lines.filter(l => lineId(l) !== a.id) : lines; break
    case 'clear':      next = lines.length ? [] : lines; break
    case 'undo': {
      if (!state.past.length) return state
      return { lines: state.past[state.past.length - 1], past: state.past.slice(0, -1) }
    }
    case 'restore':    return { lines: a.lines, past: [] }
  }
  // an action that changed nothing (invalid input, unknown line) is not an undo step
  if (next === lines || next.every((l, i) => l === lines[i]) && next.length === lines.length) return state
  return { lines: next, past: [...state.past, lines].slice(-UNDO_LIMIT) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Keeping the basket across a page reload (sessionStorage; never across browser sessions)
// ─────────────────────────────────────────────────────────────────────────────
export const BASKET_STORE_KEY = 'retailSaleBasket'
const STORE_VERSION = 2
export const STORE_MAX_AGE_MS = 12 * 60 * 60 * 1000     // a shift
const STORE_MAX_LINES = 200

export function serializeBasket(lines: BasketLine[], now = Date.now()): string {
  return JSON.stringify({ v: STORE_VERSION, at: now, lines })
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Read a stored basket back. Anything unexpected (old version, expired, corrupt, invalid lines) is dropped — never thrown. */
export function parseBasket(raw: string | null | undefined, now = Date.now()): BasketLine[] {
  if (!raw) return []
  try {
    const d = JSON.parse(raw)
    if (!d || d.v !== STORE_VERSION || !num(d.at) || now - d.at > STORE_MAX_AGE_MS || now < d.at - 60_000 || !Array.isArray(d.lines)) return []
    const out: BasketLine[] = []
    for (const x of d.lines.slice(0, STORE_MAX_LINES)) {
      if (!x || typeof x !== 'object' || !x.product || typeof x.product !== 'object' || x.product.id === undefined || x.product.id === null || typeof x.product.name !== 'string') continue
      const kind: LineKind | null = x.kind === 'unit' ? 'unit' : x.kind === 'tablets' ? 'tablets' : null
      if (!kind || !isValidPrice(x.ppt) || !Number.isInteger(x.pack) || x.pack < 1 || !Number.isInteger(x.pieces) || x.pieces < 0) continue
      if (kind === 'tablets' && !(Number.isInteger(x.tablets) && x.tablets > 0 && x.tablets <= MAX_WHOLE_QTY)) continue
      if (kind === 'unit' && !(num(x.units) && x.units > 0 && x.units <= MAX_QTY)) continue
      if (out.some(o => o.product.id === x.product.id && kindOf(o) === kind)) continue      // one line per product per kind
      out.push({
        product: x.product as Product, kind, pack: x.pack, ppt: x.ppt, pieces: x.pieces,
        tablets: kind === 'tablets' ? x.tablets : 0, ...(kind === 'unit' ? { units: round4(x.units) } : {}),
        ...(x.edited === true ? { edited: true } : {}),
        ...(isValidPrice(x.basePpt) ? { basePpt: x.basePpt } : {}),
        ...(Array.isArray(x.log) && x.log.every((t: unknown) => Number.isInteger(t) && (t as number) > 0) ? { log: x.log as number[] } : {}),
      })
    }
    return out
  } catch { return [] }
}
