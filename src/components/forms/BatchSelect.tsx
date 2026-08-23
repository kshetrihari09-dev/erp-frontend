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
 *       1 batch    -> BatchSelectionPopup opens automatically with that
 *                     batch pre-highlighted, so the user just needs to
 *                     press Enter or double-click it to confirm — the
 *                     batch, expiry, stock and rate are always shown for
 *                     a quick sanity check before it's locked in, even
 *                     when there's only one option.
 *       2+ batches -> BatchSelectionPopup opens automatically. The FEFO
 *                     batch is pre-highlighted (Enter selects it
 *                     immediately) but the user is always free to
 *                     arrow/click to a different one.
 *   - Picking a batch (Enter, double-click, or Tab in the popup) fills
 *     Batch + Expiry, closes the popup, and moves focus to this row's
 *     Quantity field.
 *   - Expired or out-of-stock batches are shown (so the reason a batch
 *     is unavailable is visible) but can't be picked — Enter/double-click
 *     on one is a no-op. This is a UI safeguard only; all real stock/
 *     expiry validation still happens exactly where it always has.
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import useProductBatches from '@/hooks/useProductBatches'
import type { StockBatch } from '@/types'
import BatchSelectionPopup from './BatchSelectionPopup'

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
  /** Barcode-scan rows only (see InvoiceRowsTable's `_scanned` flag).
   *  When true AND exactly one batch exists, that batch is selected
   *  immediately without opening the popup — the whole point of
   *  continuous scanning is not stopping to confirm a single option.
   *  Default false/undefined: EVERY existing manual-entry behavior is
   *  completely unchanged, including showing the popup for a single
   *  batch so the user can see what they're confirming. */
  autoSelectSingle?: boolean
  /** Barcode-scan rows only. Called instead of the default "focus this
   *  row's Quantity field" behaviour once a batch is resolved (auto or
   *  via the popup) — SalesPage uses this to return focus to the
   *  barcode input instead, so scanning can continue uninterrupted. */
  onAutoResolved?: () => void
  /** When true, the trigger button itself is not shown (kept mounted but
   *  visually hidden) — used by SalesPage's compact mobile product card,
   *  which has no visible Batch/Expiry field at all and relies entirely
   *  on this component's existing auto-open-the-popup-on-product-select
   *  behavior above instead of the user tapping a trigger. The popup
   *  itself is a sibling of the trigger, not a child of it, so it's
   *  completely unaffected — still opens/positions exactly as it always
   *  has. Default false: every existing caller (desktop/tablet Sales,
   *  Purchase in both modes) is completely unchanged. */
  hideTrigger?: boolean
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
  autoSelectSingle, onAutoResolved, hideTrigger,
}: Props) {
  const { batches, loading } = useProductBatches(productId)

  // Sale-only safeguard: even though useProductBatches now clears stale
  // data the instant productId changes (see that file), this is a second,
  // belt-and-suspenders guarantee specifically for Sale — filter out any
  // batch whose product_id doesn't match the row's own selected product
  // before it can ever reach the popup or the auto-select/auto-open
  // logic below. Purchase's branch further down deliberately keeps using
  // the raw `batches` array untouched.
  const saleBatches = useMemo(
    () => (productId ? batches.filter(b => b.product_id === productId) : []),
    [batches, productId],
  )

  const [popupOpen, setPopupOpen] = useState(false)

  const rootRef      = useRef<HTMLDivElement>(null)
  // Tracks which product_id this row has already auto-processed, so the
  // 0/1/many logic below runs exactly once per fresh product pick rather
  // than re-firing on every unrelated re-render. Sale mode only.
  const processedRef = useRef<string | undefined>(undefined)

  const selected = saleBatches.find(b => b.batch_no === value)

  function resolve(batch: StockBatch) {
    onSelect(batch)
    setPopupOpen(false)
    // Scanned rows: hand focus back to the barcode input instead of Qty,
    // so continuous scanning never has to detour through the row grid.
    // Every other row (onAutoResolved undefined) keeps the exact
    // pre-existing behaviour.
    if (onAutoResolved) onAutoResolved()
    else focusRowQty(rootRef.current)
  }

  /* ── Sale: auto-open the popup the moment a product resolves batches ───── */
  useEffect(() => {
    if (mode !== 'sale') return
    if (!productId) { processedRef.current = undefined; return }
    if (loading) return
    if (processedRef.current === productId) return
    processedRef.current = productId

    // Scanned rows with exactly one batch: select it immediately, no
    // popup — see the `autoSelectSingle` doc comment above. Every other
    // case (0, or 2+, or a manually-added row) behaves exactly as before.
    if (autoSelectSingle && saleBatches.length === 1) {
      resolve(saleBatches[0])
      return
    }

    // Every product with at least one batch opens the popup — one batch
    // just means the list has exactly one (pre-highlighted) row to
    // confirm with Enter/double-click, rather than skipping the popup.
    // 0 batches: nothing to auto-do — the trigger below shows the
    // "No batches available" state and stays disabled.
    if (saleBatches.length >= 1) {
      setPopupOpen(true)
    }
  }, [mode, productId, loading, saleBatches, autoSelectSingle]) // eslint-disable-line react-hooks/exhaustive-deps

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
            title="Browse existing batches for this product (F4)"
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
        <button
          type="button" className={`bsp-trigger bsp-trigger--empty ${className || ''}`} disabled tabIndex={tabIndex}
          style={hideTrigger ? { display: 'none' } : undefined}
        >—</button>
      </div>
    )
  }

  const noStock = !loading && saleBatches.length === 0

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
        style={hideTrigger ? { display: 'none' } : undefined}
      >
        {loading
          ? 'Loading…'
          : noStock
            ? 'No batches available'
            : selected
              // Just the batch number — the invoice row already has its own
              // dedicated Expiry column right next to this one showing the
              // same date, so embedding it here too was pure duplication
              // and made this (narrow) column cramped/truncated.
              ? selected.batch_no || '—'
              : 'Select batch…'}
      </button>

      <BatchSelectionPopup
        open={popupOpen}
        productName={productName}
        batches={saleBatches}
        selectedBatchNo={value}
        onSelect={resolve}
        onClose={() => setPopupOpen(false)}
      />
    </div>
  )
}
