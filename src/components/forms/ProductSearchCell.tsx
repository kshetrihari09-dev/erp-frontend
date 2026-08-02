/**
 * ProductSearchCell.tsx
 *
 * TRUE PREFIX search combobox for invoice rows.
 *
 * Search behaviour:
 *   - Calls GET /products/search?q=<typed>&limit=20
 *   - Backend uses WHERE name ILIKE 'q%'  (starts-with only)
 *   - Never contains/substring search
 *   - Results narrow on every keystroke
 *   - Searches product name only — no generic_name, item_code, company scan
 *   - Max 20 results, ordered by name
 *   - 200 ms debounce to avoid hammering on fast typing
 *
 * Keyboard:
 *   ↓ / ↑   navigate list
 *   Enter    select highlighted product
 *   Tab      select highlighted product + move to next field
 *   Escape   close dropdown
 *
 * Hardware barcode scanner support (USB / Bluetooth, keyboard-emulating):
 *   A physical scanner just "types" the code into this same input and then
 *   sends Enter (or Tab, on scanners configured that way) — there's no
 *   separate code path to maintain. Because a raw barcode almost never
 *   matches a product *name* prefix, that keystroke sequence lands here
 *   with an empty results list, exactly where "Create new product" used
 *   to fire unconditionally. Before doing that, we now try one exact
 *   barcode/item_code lookup (GET /scanner/products/barcode/:code, the
 *   same endpoint the camera scanners use) — if it matches, the row is
 *   filled instantly; if not, behaviour is unchanged (Create new product).
 *   This adds no latency to normal name search/selection, since that path
 *   never reaches the barcode check at all.
 *
 * After selection:
 *   - Row is filled automatically via onChange(product)
 *   - InvoiceRowsTable moves focus to Qty field
 *   - No page refresh / no navigation
 *
 * If no product found (by name AND by barcode/item code):
 *   - Shows "+ Create New Product 'query'" option
 *   - Opens QuickAddModal inline
 */

import {
  useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, PackageSearch, Loader2 } from 'lucide-react'
import { productsAPI, scannerAPI } from '@/services/api'
import type { Product } from '@/types'
import QuickAddModal from './QuickAddModal'

/** Maps the (slightly different) ScannedProduct shape returned by the
 *  barcode-lookup endpoint onto the full Product shape this cell's
 *  onChange contract expects, filling in the handful of fields that
 *  endpoint doesn't return with the same safe defaults the rest of the
 *  app already uses for a freshly-looked-up product. */
function scannedToProduct(s: {
  id: string; item_code: string; name: string
  generic_name?: string; company_name?: string; unit: string
  sales_rate: number; purchase_rate: number; mrp: number
  vat_percent?: number; cc_pct?: number; current_stock: number
}): Product {
  return {
    id: s.id,
    item_code: s.item_code,
    name: s.name,
    generic_name: s.generic_name,
    company_name: s.company_name,
    unit: s.unit,
    sales_rate: s.sales_rate,
    purchase_rate: s.purchase_rate,
    mrp: s.mrp,
    vat_percent: s.vat_percent,
    cc_pct: s.cc_pct,
    current_stock: s.current_stock,
    min_stock: 0,
    is_active: true,
  }
}

/** One exact barcode/item_code lookup. Returns null (never throws) on a
 *  404 "not found" or any network error — callers treat that as "not a
 *  barcode, proceed with normal fallback" rather than an error state. */
async function tryBarcodeMatch(code: string): Promise<Product | null> {
  try {
    const res = await scannerAPI.lookupBarcode(code)
    const data = res.data?.data
    return data ? scannedToProduct(data) : null
  } catch {
    return null
  }
}

interface Props {
  value:      string           // current product_id
  products:   Product[]        // master list (used only for display name lookup)
  onChange:   (product: Product) => void
  onCreated?: (product: Product) => void
  autoFocus?: boolean
  tabIndex?:  number
}

/** Imperative API for keyboard-shortcut integration (see hooks/useKeyboardShortcuts.ts).
 *  Lets a page trigger "focus product search" (F2/Ctrl+F) or "create new
 *  product" (F5) for a specific row without needing to know its internals. */
export interface ProductSearchCellHandle {
  focus:      () => void
  openCreate: () => void
}

const ProductSearchCell = forwardRef<ProductSearchCellHandle, Props>(function ProductSearchCell({
  value, products, onChange, onCreated, autoFocus, tabIndex,
}, ref) {
  const [query,       setQuery]      = useState('')
  const [results,     setResults]    = useState<Product[]>([])
  const [open,        setOpen]       = useState(false)
  const [highlighted, setHL]         = useState(0)
  const [loading,     setLoading]    = useState(false)
  const [showCreate,  setShowCreate] = useState(false)
  // What the user had typed at the moment "Create new product" was
  // triggered. Captured separately from `query` because closeDropdown()
  // (called right before the modal opens, to hide the dropdown) resets
  // `query` to '' — without this, the Quick Add modal would always open
  // with a blank name field instead of the text the user just typed.
  const [createSeed,  setCreateSeed] = useState('')
  // Computed on open (and kept in sync on scroll/resize) from the trigger's
  // real getBoundingClientRect(), since the dropdown is portaled straight
  // to document.body — see the root-cause note above openDropdown().
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const inputRef     = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null) // the portaled dropdown — lives outside containerRef in the DOM
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef     = useRef<AbortController | null>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    // Bypass the dropdown entirely — same seeding fix as the click/Enter
    // paths above, just triggered externally (e.g. the F5 shortcut).
    openCreate: () => { setCreateSeed(query.trim()); setShowCreate(true) },
  }), [query])

  // Display name for current value
  const selectedName = products.find(p => p.id === value)?.name ?? ''

  // Derived state
  const showCreateRow = query.trim().length > 0
  const createIdx     = results.length
  const optionCount   = results.length + (showCreateRow ? 1 : 0)

  /* ── Auto-focus on mount ──────────────────────────────────────────────── */
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  /* ── Close on outside click ───────────────────────────────────────────── */
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      // The dropdown is portaled to document.body, so it's no longer a DOM
      // descendant of containerRef — it must be checked separately or
      // every click inside it would incorrectly register as "outside".
      if (containerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      closeDropdown()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  /* ── Scroll highlighted item into view ───────────────────────────────── */
  useEffect(() => {
    const el = listRef.current?.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  /* ── Debounced prefix search ──────────────────────────────────────────── */
  const runSearch = useCallback((q: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort()

    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    setHL(0)

    // 200 ms debounce — fast enough to feel instant, avoids per-keystroke calls
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await productsAPI.search(trimmed, 20)
        setResults(res.data.data || [])
      } catch (err: any) {
        if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
          setResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [])

  /* ── Cleanup on unmount ───────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  /* ── Dropdown position (portaled to document.body) ────────────────────
   * ROOT CAUSE this replaces: .psc-dropdown previously relied on
   * `position: absolute` inside the table cell, with a `position: fixed
   * !important` mobile-only override bolted on top to fight the same
   * problem on small screens. Two issues fell out of that:
   *   1. On desktop, the base .psc-dropdown rule had no `position` at
   *      all, so it rendered in normal document flow (pushing the row's
   *      height) instead of floating, and its `top`/`left` values did
   *      nothing.
   *   2. Even with position fixed, an ancestor `.pos-table-wrap` uses
   *      `overflow-x: auto` (which computes overflow-y to auto too),
   *      so an absolutely-positioned dropdown near the bottom of a long
   *      invoice table could get visually clipped.
   * Portaling to document.body with a real computed position sidesteps
   * both — the dropdown is never a descendant of the scrollable table,
   * so no ancestor's overflow or stacking context can clip or bury it.
   */
  const updateDropdownPosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) })
  }, [])

  useEffect(() => {
    if (!open) return
    updateDropdownPosition()
    // Keep it glued to the trigger if the table scrolls (horizontally or
    // vertically) or the viewport resizes while the dropdown is open.
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true)
      window.removeEventListener('resize', updateDropdownPosition)
    }
  }, [open, updateDropdownPosition])

  /* ── Open / close helpers ─────────────────────────────────────────────── */
  function openDropdown() {
    setQuery('')
    setResults([])
    setOpen(true)
    setHL(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function closeDropdown() {
    setOpen(false)
    setQuery('')
    setResults([])
    setLoading(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  /* ── Select a product ─────────────────────────────────────────────────── */
  function selectProduct(p: Product) {
    onChange(p)
    closeDropdown()
  }

  /* ── Barcode-first fallback for "no name match" ──────────────────────────
   * Reached only when the typed text matched no product name (results is
   * empty), which is exactly what happens both for a genuinely new product
   * AND for a scanned barcode/item code — those never match a name prefix.
   * One exact lookup disambiguates the two before we offer to create a
   * duplicate product. Adds zero latency to the normal "pick from the
   * dropdown" path, since that path never calls this. */
  function resolveByBarcodeOrCreate(typed: string) {
    if (typed.length < 3) {
      setCreateSeed(typed)
      closeDropdown()
      setShowCreate(true)
      return
    }
    setLoading(true)
    tryBarcodeMatch(typed).then(scanned => {
      setLoading(false)
      if (scanned) {
        selectProduct(scanned)
      } else {
        setCreateSeed(typed)
        closeDropdown()
        setShowCreate(true)
      }
    })
  }

  /* ── Query change ─────────────────────────────────────────────────────── */
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    runSearch(val)
  }

  /* ── Keyboard handler ─────────────────────────────────────────────────── */
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        openDropdown()
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHL(h => Math.min(h + 1, optionCount - 1))
        break

      case 'ArrowUp':
        e.preventDefault()
        setHL(h => Math.max(h - 1, 0))
        break

      case 'Enter':
        e.preventDefault()
        if (results[highlighted]) {
          selectProduct(results[highlighted])
        } else if (showCreateRow) {
          resolveByBarcodeOrCreate(query.trim())
        }
        break

      case 'Tab':
        // Tab selects current highlight and lets focus move naturally.
        // Scanners configured to send Tab instead of Enter get the same
        // barcode-first treatment as Enter, below.
        if (results[highlighted]) {
          selectProduct(results[highlighted])
        } else if (showCreateRow) {
          e.preventDefault()
          resolveByBarcodeOrCreate(query.trim())
        } else {
          closeDropdown()
        }
        break

      case 'Escape':
        e.preventDefault()
        closeDropdown()
        break
    }
  }

  /* ── After quick-create ───────────────────────────────────────────────── */
  function handleCreated(newProduct: Product) {
    setShowCreate(false)
    onCreated?.(newProduct)
    onChange(newProduct)
  }

  /* ── JSX ──────────────────────────────────────────────────────────────── */
  return (
    <div ref={containerRef} className="psc-root">

      {/* ── Trigger / search input ───────────────────────────────────────── */}
      {open ? (
        <div className="psc-search-wrap">
          <Search size={12} className="psc-search-icon" />
          <input
            ref={inputRef}
            className="psc-input"
            value={query}
            placeholder={selectedName || 'Type to search…'}
            onChange={handleQueryChange}
            onKeyDown={handleKey}
            tabIndex={tabIndex}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 size={12} className="psc-loading-icon" />
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`psc-trigger ${value ? 'psc-trigger--selected' : 'psc-trigger--empty'}`}
          onClick={openDropdown}
          onFocus={openDropdown}
          tabIndex={tabIndex}
        >
          {selectedName || <span className="psc-placeholder">Select product…</span>}
        </button>
      )}

      {/* ── Dropdown ─────────────────────────────────────────────────────── */}
      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="psc-dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          <ul ref={listRef} className="psc-list" role="listbox">

            {/* Loading */}
            {loading && results.length === 0 && (
              <li className="psc-empty">
                <Loader2 size={14} className="psc-empty-icon psc-spin" />
                Searching…
              </li>
            )}

            {/* No results (after search, not loading) */}
            {!loading && query.trim() && results.length === 0 && (
              <li className="psc-empty">
                <PackageSearch size={15} className="psc-empty-icon" />
                No product found for "{query.trim()}"
              </li>
            )}

            {/* Prompt before typing */}
            {!loading && !query.trim() && (
              <li className="psc-empty psc-empty--hint">
                <Search size={13} className="psc-empty-icon" />
                Start typing to search products…
              </li>
            )}

            {/* Results */}
            {results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === highlighted}
                className={`psc-option ${i === highlighted ? 'psc-option--hl' : ''}`}
                onMouseEnter={() => setHL(i)}
                onMouseDown={e => { e.preventDefault(); selectProduct(p) }}
              >
                <div className="psc-option-name">
                  {renderPrefix(p.name, query)}
                </div>
                {(p.generic_name || p.item_code) && (
                  <div className="psc-option-meta">
                    {p.item_code && (
                      <span className="psc-option-code">{p.item_code}</span>
                    )}
                    {p.generic_name && (
                      <span>{p.generic_name}</span>
                    )}
                  </div>
                )}
              </li>
            ))}

            {/* Create new product row */}
            {showCreateRow && (
              <li
                role="option"
                aria-selected={highlighted === createIdx}
                className={`psc-create-row ${highlighted === createIdx ? 'psc-create-row--hl' : ''}`}
                onMouseEnter={() => setHL(createIdx)}
                onMouseDown={e => {
                  e.preventDefault()
                  setCreateSeed(query.trim())
                  closeDropdown()
                  setShowCreate(true)
                }}
              >
                <div className="psc-create-icon">
                  <Plus size={12} />
                </div>
                <div>
                  <span className="psc-create-label">Create new product </span>
                  <span className="psc-create-name">"{query.trim()}"</span>
                </div>
              </li>
            )}

          </ul>
        </div>,
        document.body,
      )}

      {/* ── Quick-add modal ───────────────────────────────────────────────── */}
      {showCreate && (
        <QuickAddModal
          initialName={createSeed}
          onSave={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
})

export default ProductSearchCell

/**
 * Highlight only the prefix portion of the product name.
 * The matched prefix is shown in brand blue bold; the rest is normal weight.
 * Since we guarantee the result starts with `query` (backend prefix search),
 * we always bold exactly the first `query.length` characters.
 */
function renderPrefix(name: string, query: string) {
  const q = query.trim()
  if (!q) return <>{name}</>

  // Case-insensitive prefix match confirmation
  if (!name.toLowerCase().startsWith(q.toLowerCase())) {
    // Fallback: shouldn't happen with correct backend, but render plain
    return <>{name}</>
  }

  return (
    <>
      <mark className="psc-match">{name.slice(0, q.length)}</mark>
      {name.slice(q.length)}
    </>
  )
}
