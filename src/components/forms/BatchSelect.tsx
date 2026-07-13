/**
 * BatchSelect.tsx
 *
 * Batch dropdown for invoice rows (Sale + Purchase, desktop and mobile) —
 * replaces the old free-text "type the batch number yourself" input.
 *
 * Behavior:
 *   - As soon as a row has a product_id, its available batches are
 *     fetched (cached — see useProductBatches.ts) and shown here.
 *   - Each option reads "B001 - Exp: 12/2027 - Stock: 48" so remaining
 *     stock and expiry are visible before picking.
 *   - Nothing is auto-selected — the placeholder option is shown (and,
 *     for a fresh row with no batch_no yet, stays selected) until the
 *     user explicitly picks one.
 *   - Picking a batch calls onSelect(batch) with the full batch record,
 *     so the caller can fill both batch_no and expiry in one go.
 *   - If there are no batches with stock, the select shows "No stock
 *     available" and is disabled.
 */
import { useMemo } from 'react'
import useProductBatches from '@/hooks/useProductBatches'
import type { StockBatch } from '@/types'

interface Props {
  productId?:  string
  value:       string                      // current batch_no
  onSelect:    (batch: StockBatch) => void
  className?:  string
  tabIndex?:   number
}

/** "2027-12-15" (or similar) -> "12/2027", matching the MM/YYYY shown in
 *  the requested example. Falls back to the raw string if unparsable. */
function formatExpiry(raw?: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${mm}/${d.getFullYear()}`
}

export default function BatchSelect({ productId, value, onSelect, className, tabIndex }: Props) {
  const { batches, loading } = useProductBatches(productId)

  const selected = useMemo(
    () => batches.find(b => b.batch_no === value),
    [batches, value],
  )

  // No product picked yet for this row — nothing to show a batch for.
  if (!productId) {
    return (
      <select className={className} disabled tabIndex={tabIndex} value="">
        <option value="">—</option>
      </select>
    )
  }

  // Loaded, and genuinely nothing in stock for this product.
  if (!loading && batches.length === 0) {
    return (
      <select className={className} disabled tabIndex={tabIndex} value="">
        <option value="">No stock available</option>
      </select>
    )
  }

  return (
    <select
      className={className}
      // Only shows as "selected" once the value actually matches a
      // loaded batch — a fresh row's batch_no ('') always falls back to
      // the placeholder, and so does a batch_no from a different
      // product's stale row state, which the placeholder path forces the
      // user to explicitly re-choose rather than silently keeping.
      value={selected ? value : ''}
      disabled={loading}
      tabIndex={tabIndex}
      onChange={e => {
        const batch = batches.find(b => b.batch_no === e.target.value)
        if (batch) onSelect(batch)
      }}
    >
      <option value="" disabled>{loading ? 'Loading batches…' : 'Select batch…'}</option>
      {batches.map(b => (
        <option key={b.id} value={b.batch_no}>
          {b.batch_no} - Exp: {formatExpiry(b.expiry_date || b.expiry)} - Stock: {b.qty_available}
        </option>
      ))}
    </select>
  )
}
