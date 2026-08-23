/**
 * BatchSelectionPopup.tsx
 *
 * The popup opened automatically by BatchSelect.tsx the moment a row's
 * product has one or more batches available. Shows every batch for that
 * product with expiry, remaining stock, rack/shelf location (if the
 * backend sends one), selling price, and a status badge — and pre-
 * highlights the FEFO-recommended batch (or the sole batch, if there's
 * only one) without ever auto-confirming it for the user.
 *
 * Keyboard:
 *   Type       instantly filters the list (batch no. / rack location)
 *   ↑ / ↓      move the highlighted row
 *   Enter      select the highlighted batch
 *   Tab        select the highlighted batch, then hand focus to Quantity
 *              (BatchSelect.tsx does the actual focus move after onSelect)
 *   Escape     close without selecting
 *
 * Mouse (desktop, > 768px):
 *   Single click   just moves the highlight (same as hover/arrow keys)
 *   Double click   selects the batch, same as pressing Enter on it
 *
 * Touch (mobile, <= 768px — same breakpoint InvoiceRowsTable/SalesPage
 * already use for their own mobile-vs-desktop split, see .pos-desktop-only
 * in globals.css): a single tap selects immediately. Double-tap-to-confirm
 * doesn't map to touch the way it does to a mouse — a phone has no hover
 * state to "preview" a highlight with, so requiring a second tap just
 * looks like the first tap did nothing. Desktop's click-then-double-click
 * behaviour is unchanged. The search box also isn't auto-focused on
 * mobile (desktop still is) — with the keyboard already up, a tap's
 * first job on most mobile browsers is just to dismiss it, so the row's
 * "click" wouldn't register until a second tap either.
 *
 * The row opens already highlighting the FEFO-recommended batch (the
 * earliest-expiring one that isn't expired and has stock), so for the
 * common case Enter alone confirms it — including the single-batch case,
 * where the popup still opens (rather than silently auto-picking) so the
 * batch/expiry/stock/rate are always visible for a quick check.
 *
 * Expired or zero-stock batches are still listed (so it's clear why one
 * isn't available) but can't be selected — Enter/double-click on one is
 * a no-op. This is a UI-level safeguard only; it doesn't change or
 * replace any backend stock/expiry validation.
 *
 * Nothing here touches pricing, tax, or stock calculations — it only
 * displays StockBatch records that were already fetched elsewhere.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Search, PackageX } from 'lucide-react'
import type { StockBatch } from '@/types'
import { fmt } from '@/utils'
import { formatExpiry, getBatchStatus, getRackLocation, isExpired, pickFEFORecommended } from '@/utils/batch'
import { useShortcutScope } from '@/hooks/useKeyboardShortcuts'

interface Props {
  open:             boolean
  productName?:     string
  batches:          StockBatch[]
  selectedBatchNo?: string
  onSelect:         (batch: StockBatch) => void
  onClose:          () => void
}

export default function BatchSelectionPopup({
  open, productName, batches, selectedBatchNo, onSelect, onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [hl,    setHL]    = useState(0)

  // Same window-width + resize-listener pattern already used by
  // usePrintResponsive.ts / useAccResponsive.ts elsewhere in this project,
  // and the same 768px cutoff InvoiceRowsTable/SalesPage already use for
  // their own mobile-card vs desktop-table split — see file header.
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  const isMobile = width <= 768

  // This popup already has its own local (non-global) Enter/Esc/arrow-key
  // handling below — nothing about that changes. This just registers its
  // presence in the shared shortcut scope stack while open, so the Sale/
  // Purchase page's F2..F10 shortcuts underneath it automatically go quiet
  // instead of firing through the popup (see hooks/useKeyboardShortcuts.ts).
  useShortcutScope(open)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)


  const recommended = useMemo(() => pickFEFORecommended(batches), [batches])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return batches
    return batches.filter(b =>
      (b.batch_no || '').toLowerCase().includes(q) ||
      (getRackLocation(b) || '').toLowerCase().includes(q),
    )
  }, [batches, query])

  /* Reset + focus the search box every time the popup opens — and
   * pre-highlight the FEFO-recommended batch (or, failing that, the
   * first genuinely selectable one) so Enter alone confirms it without
   * any arrowing.
   *
   * This one effect now owns every hl reset (open, and the query
   * clearing that happens as part of opening) — previously a second,
   * separate `useEffect(() => setHL(0), [query])` existed to reset the
   * highlight whenever the user typed, but since `setQuery('')` here
   * also changes `query`, that second effect fired right after this one
   * on every reopen where a prior search was left non-empty, silently
   * stomping the FEFO highlight back to row 0 — which, if row 0 happened
   * to be expired/out-of-stock, made Enter (and Tab) look like they did
   * nothing, since choose() is a no-op on an unselectable row. Typing-
   * driven reset now happens directly in the search input's onChange
   * below instead, so it can never race with this one. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    const recommendedIdx = recommended ? batches.findIndex(b => b.id === recommended.id) : -1
    const idx = recommendedIdx >= 0
      ? recommendedIdx
      : batches.findIndex(b => !isExpired(b) && Number(b.qty_available) > 0)
    setHL(idx >= 0 ? idx : 0)
    // Skip auto-focusing (and therefore auto-opening the on-screen
    // keyboard) on mobile. With the keyboard up, a tap on a batch row's
    // FIRST job on most mobile browsers is just to dismiss the keyboard —
    // the tap doesn't reach the row as a real "select" until the second
    // one, which is exactly the "need to tap twice" this was causing.
    // Desktop still autofocuses so typing-to-filter works immediately,
    // matching every other search-first UI in this app; mobile can still
    // tap the search box to bring the keyboard up and filter manually.
    if (!isMobile) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, isMobile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  if (!open) return null

  /** Expired or zero-stock batches are shown but can't be picked — this
   *  is a UI-level guard only, on top of whatever the backend already
   *  enforces at posting time. */
  function isSelectable(b: StockBatch) {
    return !isExpired(b) && Number(b.qty_available) > 0
  }

  function choose(b?: StockBatch) {
    if (!b) return
    if (!isSelectable(b)) return
    onSelect(b)
  }

  function handleKey(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHL(h => Math.min(h + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHL(h => Math.max(h - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation() // defensive — nothing above this popup should ever see this Enter
        choose(filtered[hl])
        break
      case 'Tab':
        // Same as Enter — select the highlighted batch, then
        // BatchSelect.tsx moves focus on to Quantity.
        e.preventDefault()
        e.stopPropagation()
        choose(filtered[hl])
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  return createPortal(
    <div
      className="bsp-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bsp-panel" role="dialog" aria-modal="true" aria-label="Select batch">
        {/* Header */}
        <div className="bsp-header">
          <div>
            <div className="bsp-title">Select Batch</div>
            {productName && <div className="bsp-subtitle">{productName}</div>}
          </div>
          <button type="button" className="bsp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Search */}
        <div className="bsp-search-wrap">
          <Search size={13} className="bsp-search-icon" />
          <input
            ref={inputRef}
            className="bsp-search-input"
            placeholder="Type to filter batches…"
            value={query}
            onChange={e => { setQuery(e.target.value); setHL(0) }}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* List */}
        <div className="bsp-list-wrap">
          {filtered.length === 0 ? (
            <div className="bsp-empty">
              <PackageX size={16} className="bsp-empty-icon" />
              No matching batches
            </div>
          ) : (
            <>
              <div className="bsp-row bsp-row--head" aria-hidden="true">
                <span className="bsp-col bsp-col-batch">Batch</span>
                <span className="bsp-col bsp-col-expiry">Expiry</span>
                <span className="bsp-col bsp-col-stock">Stock</span>
                <span className="bsp-col bsp-col-rack">Rack</span>
                <span className="bsp-col bsp-col-price">Price</span>
                <span className="bsp-col bsp-col-status">Status</span>
              </div>
              <ul ref={listRef} className="bsp-list" role="listbox">
                {filtered.map((b, i) => {
                  const status        = getBatchStatus(b, recommended?.id)
                  const isRecommended = !!recommended && b.id === recommended.id
                  const rack          = getRackLocation(b)
                  const selectable    = isSelectable(b)
                  return (
                    <li
                      key={b.id}
                      role="option"
                      aria-selected={i === hl}
                      aria-disabled={!selectable}
                      title={selectable ? undefined : (isExpired(b) ? 'Expired — cannot be sold' : 'Out of stock')}
                      className={[
                        'bsp-row',
                        i === hl ? 'bsp-row--hl' : '',
                        isRecommended ? 'bsp-row--recommended' : '',
                        b.batch_no === selectedBatchNo ? 'bsp-row--current' : '',
                        !selectable ? 'bsp-row--disabled' : '',
                      ].filter(Boolean).join(' ')}
                      onMouseEnter={() => setHL(i)}
                      // Desktop: click only moves the highlight (mouse has
                      // hover to preview with) — double-click confirms.
                      // Mobile (<= 768px): a tap has no hover equivalent,
                      // so a single tap both highlights AND confirms —
                      // see file header.
                      onClick={() => { setHL(i); if (isMobile) choose(b) }}
                      onDoubleClick={() => choose(b)}
                    >
                      <span className="bsp-col bsp-col-batch">
                        {b.batch_no || '—'}
                      </span>
                      <span className="bsp-col bsp-col-expiry">{formatExpiry(b.expiry_date || b.expiry)}</span>
                      <span className="bsp-col bsp-col-stock">{fmt(b.qty_available)}</span>
                      <span className="bsp-col bsp-col-rack">{rack || '—'}</span>
                      <span className="bsp-col bsp-col-price">{fmt(b.sales_rate)}</span>
                      <span className="bsp-col bsp-col-status">
                        <span className={`bsp-badge bsp-badge--${status.tone}`}>{status.label}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {/* Keyboard hints — the tap/double-click hint below swaps per
            device since the two have different single-interaction
            behaviour (see file header); the rest (↑↓/Enter/Tab/Esc) only
            apply when a physical keyboard is in play, which is harmless
            to leave visible either way. */}
        <div className="bsp-footer">
          <span><kbd className="bsp-kbd">↑↓</kbd> Navigate</span>
          <span><kbd className="bsp-kbd">Enter</kbd> Select</span>
          <span><kbd className="bsp-kbd">Tab</kbd> Select + Next</span>
          <span>{isMobile ? 'Tap to select' : 'Double-click Select'}</span>
          <span><kbd className="bsp-kbd">Esc</kbd> Close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
