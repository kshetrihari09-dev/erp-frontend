/**
 * BatchSelect.tsx
 *
 * Batch picker for invoice rows (Sale + Purchase, desktop table and mobile
 * cards) — this is the single shared implementation both pages use, so any
 * behavior below applies identically everywhere it's dropped in.
 *
 * Product-selection workflow (the whole point of this component):
 *   - The moment a row gets a product_id (from search, barcode scan, OCR,
 *     or keyboard), this component fetches that product's batches and:
 *       · exactly 1 batch  → auto-selected immediately, popup never opens
 *       · 2+ batches       → popup opens automatically, no click needed
 *       · 0 batches        → trigger shows "No stock available", disabled
 *   - The user must always pick manually when there's more than one batch
 *     — the FEFO-recommended batch is highlighted, never pre-selected.
 *   - Picking a batch (click, Enter, or Tab) fills batch_no + expiry,
 *     closes the popup, and hands focus off to the caller via `onDone`
 *     (the parent focuses its own Qty field — this component doesn't know
 *     about the rest of the row).
 *
 * Each row in the popup shows batch no, expiry, remaining stock, rack
 * location (only if the backend actually sends one), selling price, and a
 * status badge (Recommended / Low Stock / Expired). Typing while the
 * popup is open instantly filters the list (type-ahead), Arrow Up/Down
 * moves the highlight, Enter/Tab picks, Esc closes.
 *
 * NOTE — why this isn't a native <select>:
 *   A native <select>'s dropdown list is rendered by the browser/OS, not
 *   by us, and browsers are inconsistent (Chrome in particular) about
 *   honoring author CSS `color`/`background-color` on <option> inside
 *   that native popup — it kept rendering as washed-out light text
 *   regardless of theme, no matter what CSS was added, and it also can't
 *   show multiple columns of batch detail. This mirrors
 *   ProductSearchCell.tsx's approach: a real button + a portaled div/ul
 *   dropdown built from ordinary DOM elements we fully control.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useProductBatches from '@/hooks/useProductBatches'
import { fmt, today } from '@/utils'
import type { StockBatch } from '@/types'

interface Props {
  productId?:  string
  value:       string                      // current batch_no
  onSelect:    (batch: StockBatch) => void
  /** Called right after a batch is resolved — by manual pick OR by the
   *  auto-select-sole-batch path — so the caller can move focus on to
   *  Quantity. Not called just because the popup opened/closed. */
  onDone?:     () => void
  className?:  string
  tabIndex?:   number
}

// Presentational-only heuristic for the "Low Stock" badge in the picker.
// Not tied to any backend threshold/setting — purely a UI cue.
const LOW_STOCK_THRESHOLD = 10

const TYPEAHEAD_RESET_MS = 1200

/* ── helpers ─────────────────────────────────────────────────────────────── */

function formatExpiry(raw?: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${mm}/${d.getFullYear()}`
}

function isExpired(raw?: string | null): boolean {
  if (!raw) return false
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < new Date(today()).getTime()
}

function rackOf(b: StockBatch): string | undefined {
  return b.rack_location || b.location || b.rack || undefined
}

function batchLabel(b: StockBatch): string {
  return `${b.batch_no || '—'} - Exp: ${formatExpiry(b.expiry_date || b.expiry)} - Stock: ${b.qty_available}`
}

/** FEFO order: soonest-expiring first; batches with no expiry sort last. */
function sortFefo(batches: StockBatch[]): StockBatch[] {
  return [...batches].sort((a, b) => {
    const da = a.expiry_date || a.expiry
    const db = b.expiry_date || b.expiry
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return new Date(da).getTime() - new Date(db).getTime()
  })
}

type BatchStatus = 'recommended' | 'low' | 'expired' | null

function statusOf(b: StockBatch, recommendedId: string | undefined): BatchStatus {
  const expDate = b.expiry_date || b.expiry
  if (isExpired(expDate)) return 'expired'
  if (b.id === recommendedId) return 'recommended'
  if (b.qty_available <= LOW_STOCK_THRESHOLD) return 'low'
  return null
}

function StatusBadge({ status }: { status: BatchStatus }) {
  if (!status) return null
  const label = status === 'recommended' ? 'Recommended' : status === 'low' ? 'Low Stock' : 'Expired'
  return <span className={`pos-batch-badge pos-batch-badge--${status}`}>{label}</span>
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function BatchSelect({ productId, value, onSelect, onDone, className, tabIndex }: Props) {
  const { batches: rawBatches, loading } = useProductBatches(productId)
  const batches = useMemo(() => sortFefo(rawBatches), [rawBatches])

  const recommendedId = useMemo(
    () => batches.find(b => !isExpired(b.expiry_date || b.expiry) && b.qty_available > 0)?.id,
    [batches],
  )

  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [query, setQuery] = useState('')
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const triggerRef   = useRef<HTMLButtonElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)
  const queryTimerRef = useRef<ReturnType<typeof setTimeout>>()
  // Tracks which productId we've already auto-opened/auto-selected for, so
  // re-renders don't keep re-triggering the popup — only an actual product
  // change (or picking the same product again after switching away) does.
  const autoHandledRef = useRef<string | null>(null)

  const selected = useMemo(
    () => batches.find(b => b.batch_no === value),
    [batches, value],
  )

  const disabled = !productId || (!loading && batches.length === 0)
  const hasRack  = useMemo(() => batches.some(b => !!rackOf(b)), [batches])
  // 6 columns (with Rack) or 5 (without) — kept as one shared style object
  // so the header and every row always agree on column widths.
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: hasRack ? '1.3fr 72px 56px 72px 68px 92px' : '1.3fr 72px 56px 68px 92px' }),
    [hasRack],
  )

  const displayed = useMemo(() => {
    if (!query) return batches
    const q = query.toLowerCase()
    return batches.filter(b => batchLabel(b).toLowerCase().includes(q))
  }, [batches, query])

  /* ── Position the portaled dropdown against the trigger's real rect ──── */
  function updatePosition() {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 520)
    const left  = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8))
    setDropdownPos({ top: rect.bottom + 4, left, width })
  }

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  /* ── Close on outside click ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      closeDropdown()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ── Keep highlighted row in view ─────────────────────────────────────── */
  useEffect(() => {
    const el = listRef.current?.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  function closeDropdown() {
    setOpen(false)
    setQuery('')
    clearTimeout(queryTimerRef.current)
  }

  function openDropdown(preselectBatchNo?: string) {
    if (disabled || loading) return
    const idx = Math.max(0, batches.findIndex(b => b.batch_no === (preselectBatchNo ?? value)))
    setHighlighted(idx === -1 ? 0 : idx)
    setQuery('')
    setOpen(true)
  }

  function choose(b: StockBatch) {
    onSelect(b)
    closeDropdown()
    onDone?.()
  }

  /* ── Product-selection workflow: auto-select the sole batch, or
     auto-open the popup for the user to pick, the moment a product's
     batches are ready. Runs once per product change. ─────────────────── */
  useEffect(() => {
    if (!productId) { autoHandledRef.current = null; return }
    if (loading) return
    if (autoHandledRef.current === productId) return
    autoHandledRef.current = productId

    if (value) return // editing an existing row that already has a batch

    if (batches.length === 1) {
      // Harmless to run even in a currently-hidden copy of this row (see
      // note below) — it only fills data, there's no popup involved.
      choose(batches[0])
    } else if (batches.length > 1) {
      // This app keeps the desktop table AND the mobile card mounted for
      // every row at all times, switching which one's visible with a
      // plain CSS `display:none` rather than conditional rendering — so
      // there are two BatchSelect instances per row, and this effect
      // would otherwise fire in both. Only auto-open in whichever one is
      // actually visible (offsetParent is null for display:none
      // elements); otherwise it'd pop open a dropdown anchored to a
      // zero-size, invisible trigger nobody can see.
      if (triggerRef.current?.offsetParent !== null) {
        openDropdown(undefined)
        triggerRef.current?.focus() // so keyboard nav works with no click
      }
    }
    // batches.length === 0 → disabled trigger already shows "No stock available"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, loading, batches, value])

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlighted(h => Math.min(h + 1, displayed.length - 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setHighlighted(h => Math.max(h - 1, 0))
        return
      case 'Enter':
        e.preventDefault()
        if (displayed[highlighted]) choose(displayed[highlighted])
        return
      case 'Tab':
        // Pick whatever's highlighted (if anything matched) and let focus
        // continue on to Quantity via onDone — same as Enter, but also
        // lets the natural Tab keep moving if there's nothing to pick.
        if (displayed[highlighted]) {
          e.preventDefault()
          choose(displayed[highlighted])
        } else {
          closeDropdown()
        }
        return
      case 'Escape':
        e.preventDefault()
        closeDropdown()
        return
      case 'Backspace':
        e.preventDefault()
        setQuery(q => q.slice(0, -1))
        setHighlighted(0)
        return
    }
    // Type-ahead: any single printable character filters the list.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      setQuery(q => q + e.key)
      setHighlighted(0)
      clearTimeout(queryTimerRef.current)
      queryTimerRef.current = setTimeout(() => setQuery(''), TYPEAHEAD_RESET_MS)
    }
  }

  const triggerLabel = disabled
    ? (!productId ? '—' : 'No batches available')
    : loading
      ? 'Loading batches…'
      : (selected ? batchLabel(selected) : 'Select batch…')

  return (
    <div className="psc-root">
      <button
        ref={triggerRef}
        type="button"
        className={`pos-cell-input pos-batch-trigger ${className || ''} ${selected ? '' : 'pos-batch-trigger--empty'}`}
        disabled={disabled || loading}
        tabIndex={tabIndex}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={onKeyDown}
        title={disabled && productId ? 'No stock available for this product' : undefined}
      >
        <span className="pos-batch-trigger-label">{triggerLabel}</span>
      </button>

      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="psc-dropdown pos-batch-dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <div className="pos-batch-head" style={gridStyle}>
            <span>Batch</span>
            <span>Expiry</span>
            <span>Stock</span>
            {hasRack && <span>Rack</span>}
            <span>Price</span>
            <span>Status</span>
          </div>
          {query && <div className="pos-batch-query">Filtering: “{query}”</div>}
          <ul ref={listRef} className="psc-list pos-batch-list" role="listbox">
            {displayed.map((b, i) => {
              const status = statusOf(b, recommendedId)
              const rack = rackOf(b)
              return (
                <li
                  key={b.id}
                  role="option"
                  aria-selected={b.batch_no === value}
                  className={`psc-option pos-batch-row ${i === highlighted ? 'psc-option--hl' : ''} ${status === 'recommended' ? 'pos-batch-row--recommended' : ''}`}
                  style={gridStyle}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={e => { e.preventDefault(); choose(b) }}
                >
                  <span className="pos-batch-col-no">{b.batch_no || '—'}</span>
                  {/* display:contents on desktop (so these act as direct
                      grid columns) — a real flex group on mobile (see the
                      mobile media query), so they read as one
                      "Exp · Stock [· Rack] · Price" line under the batch no. */}
                  <span className="pos-batch-col-meta">
                    <span className="pos-batch-col-exp">{formatExpiry(b.expiry_date || b.expiry)}</span>
                    <span className="pos-batch-col-stock">{b.qty_available}</span>
                    {hasRack && <span className="pos-batch-col-rack">{rack || '—'}</span>}
                    <span className="pos-batch-col-price">{fmt(b.sales_rate)}</span>
                  </span>
                  <span className="pos-batch-col-status"><StatusBadge status={status} /></span>
                </li>
              )
            })}
            {displayed.length === 0 && (
              <li className="psc-empty">No batches match “{query}”</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  )
}
