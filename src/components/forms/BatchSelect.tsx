/**
 * BatchSelect.tsx
 *
 * Batch field for invoice rows (Sale + Purchase, desktop and mobile).
 *
 * Sale (`mode="sale"`, the default) — pick-only, unchanged from before:
 *   - The moment a row gets a product_id, its batches are fetched
 *     (cached — see useProductBatches.ts) and this field decides what
 *     happens next WITHOUT waiting for the user to click anything:
 *       0 batches  -> shows "No batches available", stays disabled.
 *                     (The Quantity field for this row disables itself
 *                     too — see QtyGate.tsx — so the row can't be
 *                     posted, using the existing qty>0 validation rather
 *                     than a new rule.)
 *       1 batch    -> auto-selected immediately. Batch + Expiry fill in,
 *                     the popup never opens, focus jumps straight to Qty.
 *       2+ batches -> BatchSelectionPopup opens automatically. The FEFO
 *                     batch is highlighted but NOT auto-selected — the
 *                     user always picks manually for a multi-batch row.
 *   - Picking a batch (click, Enter, or Tab in the popup) fills
 *     Batch + Expiry, closes the popup, and moves focus to this row's
 *     Quantity field.
 *   - You can't sell a batch that doesn't exist yet, so typing a batch
 *     number freely isn't offered in this mode.
 *
 * Purchase (`mode="purchase"`) — freely enterable, since a purchase very
 * often introduces a brand-new batch number that has no existing stock
 * record at all (the normal case, not an edge case):
 *   - The field is always a plain, always-editable text input bound
 *     directly to batch_no — nothing here auto-disables or blocks typing
 *     just because the product has no batches yet.
 *   - A small "browse" button next to it opens the exact same
 *     BatchSelectionPopup used on Sale, for the (also common) case of
 *     adding more stock to an existing batch — picking one there still
 *     fills Batch + Expiry and moves on to Quantity, same as Sale.
 *   - Nothing is auto-opened or auto-selected on product pick, since
 *     typing a new batch is the primary path here, not picking one.
 */
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import useProductBatches from '@/hooks/useProductBatches'
import type { StockBatch } from '@/types'
import BatchSelectionPopup from './BatchSelectionPopup'
import { formatExpiry } from '@/utils/batch'

interface Props {
  productId?:   string
  productName?: string   // optional — shown as the popup's subtitle
  value:        string                      // current batch_no
  onSelect:     (batch: StockBatch) => void
  /** Purchase mode only — fired on every keystroke as the user types a
   *  new batch number directly. Ignored/unused in "sale" mode. */
  onTextChange?: (text: string) => void
  className?:   string
  tabIndex?:    number
  /** "sale" (default) is pick-only; "purchase" is freely enterable —
   *  see file header. */
  mode?:        'sale' | 'purchase'
}

/** Find the Quantity input in this same invoice row — desktop rows are
 *  <tr>, mobile rows are the .pmic card — and focus it. Both markups
 *  share the .pos-qty-input class (see QtyGate.tsx), so one selector
 *  covers both without the caller needing to wire anything up. */
function focusRowQty(el: HTMLElement | null) {
  requestAnimationFrame(() => {
    const row = el?.closest('tr, .pmic')
    const qty = row?.querySelector<HTMLInputElement>('.pos-qty-input')
    if (qty && !qty.disabled) {
      qty.focus()
      qty.select?.()
    }
  })
}

export default function BatchSelect({
  productId, productName, value, onSelect, onTextChange, className, tabIndex, mode = 'sale',
}: Props) {
  const { batches, loading } = useProductBatches(productId)
  const [popupOpen, setPopupOpen] = useState(false)

  const rootRef      = useRef<HTMLDivElement>(null)
  // Tracks which product_id this row has already auto-processed, so the
  // 0/1/many logic below runs exactly once per fresh product pick rather
  // than re-firing on every unrelated re-render. Sale mode only.
  const processedRef = useRef<string | undefined>(undefined)

  const selected = batches.find(b => b.batch_no === value)

  function resolve(batch: StockBatch) {
    onSelect(batch)
    setPopupOpen(false)
    focusRowQty(rootRef.current)
  }

  /* ── Sale: auto-open / auto-select the moment a product resolves batches ─── */
  useEffect(() => {
    if (mode !== 'sale') return
    if (!productId) { processedRef.current = undefined; return }
    if (loading) return
    if (processedRef.current === productId) return
    processedRef.current = productId

    if (batches.length === 1) {
      onSelect(batches[0])
      focusRowQty(rootRef.current)
    } else if (batches.length > 1) {
      setPopupOpen(true)
    }
    // 0 batches: nothing to auto-do — the trigger below shows the
    // "No batches available" state and stays disabled.
  }, [mode, productId, loading, batches]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Purchase: freely-typeable batch number + optional "browse existing" ── */
  if (mode === 'purchase') {
    return (
      <div ref={rootRef} className="bsp-trigger-wrap">
        <div className="flex gap-1.5 items-stretch">
          <input
            className={`flex-1 min-w-0 ${className || ''}`}
            value={value}
            tabIndex={tabIndex}
            placeholder={productId ? 'Type new or existing batch…' : '—'}
            disabled={!productId}
            onChange={e => onTextChange?.(e.target.value)}
          />
          <button
            type="button"
            className="pos-party-add-btn"
            style={{ width: 30 }}
            disabled={!productId || loading}
            onClick={() => setPopupOpen(true)}
            title="Browse existing batches for this product"
            aria-label="Browse existing batches"
          >
            <Search size={13} />
          </button>
        </div>

        {productId && (
          <BatchSelectionPopup
            open={popupOpen}
            productName={productName}
            batches={batches}
            selectedBatchNo={value}
            onSelect={resolve}
            onClose={() => setPopupOpen(false)}
          />
        )}
      </div>
    )
  }

  /* ── Sale: no product picked yet for this row ─────────────────────── */
  if (!productId) {
    return (
      <div ref={rootRef} className="bsp-trigger-wrap">
        <button type="button" className={`bsp-trigger bsp-trigger--empty ${className || ''}`} disabled tabIndex={tabIndex}>—</button>
      </div>
    )
  }

  const noStock = !loading && batches.length === 0

  return (
    <div ref={rootRef} className="bsp-trigger-wrap">
      <button
        type="button"
        className={[
          'bsp-trigger',
          className || '',
          noStock ? 'bsp-trigger--empty' : selected ? 'bsp-trigger--selected' : 'bsp-trigger--empty',
        ].filter(Boolean).join(' ')}
        tabIndex={tabIndex}
        disabled={noStock || loading}
        onClick={() => setPopupOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
            e.preventDefault()
            setPopupOpen(true)
          }
        }}
      >
        {loading
          ? 'Loading…'
          : noStock
            ? 'No batches available'
            : selected
              ? `${selected.batch_no} · Exp ${formatExpiry(selected.expiry_date || selected.expiry)}`
              : 'Select batch…'}
      </button>

      <BatchSelectionPopup
        open={popupOpen}
        productName={productName}
        batches={batches}
        selectedBatchNo={value}
        onSelect={resolve}
        onClose={() => setPopupOpen(false)}
      />
    </div>
  )
}
