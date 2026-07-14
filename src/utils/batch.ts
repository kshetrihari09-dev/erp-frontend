/**
 * utils/batch.ts
 *
 * Small, presentation-only helpers for the Batch Selection popup
 * (components/forms/BatchSelectionPopup.tsx) and its trigger field
 * (components/forms/BatchSelect.tsx). Nothing here talks to the API or
 * touches pricing/tax/stock calculations — it only formats and ranks
 * batch records that were already fetched via useProductBatches().
 */
import type { StockBatch } from '@/types'

/** "2027-12-15" (or similar) -> "12/2027". Falls back to the raw string
 *  if it can't be parsed as a date. */
export function formatExpiry(raw?: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${mm}/${d.getFullYear()}`
}

// A batch is flagged "Low Stock" in the picker below this remaining
// quantity. Batches don't carry a per-product min_stock the way products
// do (see ProductsPage's current_stock/min_stock comparison), so a flat
// threshold is used purely for this badge — it doesn't feed into any
// stock/posting calculation.
const LOW_STOCK_THRESHOLD = 10

export function isExpired(batch: Pick<StockBatch, 'expiry' | 'expiry_date'>): boolean {
  const raw = batch.expiry_date || batch.expiry
  if (!raw) return false
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

/** FEFO ordering — earliest expiry first. Batches with no parseable
 *  expiry sort to the end rather than being treated as "soonest". */
export function sortFEFO(batches: StockBatch[]): StockBatch[] {
  return [...batches].sort((a, b) => {
    const da = new Date(a.expiry_date || a.expiry || '').getTime()
    const db = new Date(b.expiry_date || b.expiry || '').getTime()
    const va = Number.isNaN(da) ? Infinity : da
    const vb = Number.isNaN(db) ? Infinity : db
    return va - vb
  })
}

/** The single batch the picker highlights as FEFO-recommended — the
 *  earliest-expiring batch that isn't already expired and has stock.
 *  Never returns an expired or out-of-stock batch, and never mutates
 *  the caller's selection — the caller still has to pick manually. */
export function pickFEFORecommended(batches: StockBatch[]): StockBatch | undefined {
  return sortFEFO(batches).find(b => !isExpired(b) && Number(b.qty_available) > 0)
}

export type BatchStatusTone = 'success' | 'warning' | 'danger' | 'neutral'

export function getBatchStatus(
  batch: StockBatch,
  recommendedId?: string,
): { label: string; tone: BatchStatusTone } {
  if (isExpired(batch))                       return { label: 'Expired',     tone: 'danger'  }
  if (recommendedId && batch.id === recommendedId) return { label: 'Recommended', tone: 'success' }
  if (Number(batch.qty_available) <= LOW_STOCK_THRESHOLD) return { label: 'Low Stock', tone: 'warning' }
  return { label: 'Available', tone: 'neutral' }
}

/** Rack/shelf location isn't a guaranteed field on StockBatch yet (see
 *  the optional properties on the type) — different backend deployments
 *  may name it differently. This checks the common variants and returns
 *  undefined if none are present, so callers can render "—" gracefully
 *  instead of assuming the field exists. */
export function getRackLocation(batch: StockBatch): string | undefined {
  const b = batch as any
  return b.rack_location || b.location || b.shelf_location || b.bin_location || undefined
}
