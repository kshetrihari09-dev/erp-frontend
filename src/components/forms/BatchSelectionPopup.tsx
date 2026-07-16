/**
 * BatchSelectionPopup.tsx
 *
 * The popup opened automatically by BatchSelect.tsx the moment a row's
 * product has more than one batch available. Shows every batch for that
 * product with expiry, remaining stock, rack/shelf location (if the
 * backend sends one), selling price, and a status badge — and highlights
 * the FEFO-recommended batch without ever auto-selecting it.
 *
 * Keyboard:
 *   Type       instantly filters the list (batch no. / rack location)
 *   ↑ / ↓      move the highlighted row
 *   Enter      select the highlighted batch
 *   Tab        select the highlighted batch, then hand focus to Quantity
 *              (BatchSelect.tsx does the actual focus move after onSelect)
 *   Escape     close without selecting
 *
 * Nothing here touches pricing, tax, or stock calculations — it only
 * displays StockBatch records that were already fetched elsewhere.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Search, PackageX } from 'lucide-react'
import type { StockBatch } from '@/types'
import { fmt } from '@/utils'
import { formatExpiry, getBatchStatus, getRackLocation, pickFEFORecommended } from '@/utils/batch'
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

  /* Reset + focus the search box every time the popup opens */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setHL(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => { setHL(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  if (!open) return null

  function choose(b?: StockBatch) {
    if (!b) return
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
        choose(filtered[hl])
        break
      case 'Tab':
        // Same as Enter — select the highlighted batch, then
        // BatchSelect.tsx moves focus on to Quantity.
        e.preventDefault()
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
            onChange={e => setQuery(e.target.value)}
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
                  return (
                    <li
                      key={b.id}
                      role="option"
                      aria-selected={i === hl}
                      className={[
                        'bsp-row',
                        i === hl ? 'bsp-row--hl' : '',
                        isRecommended ? 'bsp-row--recommended' : '',
                        b.batch_no === selectedBatchNo ? 'bsp-row--current' : '',
                      ].filter(Boolean).join(' ')}
                      onMouseEnter={() => setHL(i)}
                      onMouseDown={e => { e.preventDefault(); choose(b) }}
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

        {/* Keyboard hints */}
        <div className="bsp-footer">
          <span><kbd className="bsp-kbd">↑↓</kbd> Navigate</span>
          <span><kbd className="bsp-kbd">Enter</kbd> Select</span>
          <span><kbd className="bsp-kbd">Tab</kbd> Select + Next</span>
          <span><kbd className="bsp-kbd">Esc</kbd> Close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
