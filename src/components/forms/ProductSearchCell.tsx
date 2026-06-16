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
 * After selection:
 *   - Row is filled automatically via onChange(product)
 *   - InvoiceRowsTable moves focus to Qty field
 *   - No page refresh / no navigation
 *
 * If no product found:
 *   - Shows "+ Create New Product 'query'" option
 *   - Opens QuickAddModal inline
 */

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent,
} from 'react'
import { Search, Plus, PackageSearch, Loader2 } from 'lucide-react'
import { productsAPI } from '@/services/api'
import type { Product } from '@/types'
import QuickAddModal from './QuickAddModal'

interface Props {
  value:      string           // current product_id
  products:   Product[]        // master list (used only for display name lookup)
  onChange:   (product: Product) => void
  onCreated?: (product: Product) => void
  autoFocus?: boolean
  tabIndex?:  number
}

export default function ProductSearchCell({
  value, products, onChange, onCreated, autoFocus, tabIndex,
}: Props) {
  const [query,       setQuery]      = useState('')
  const [results,     setResults]    = useState<Product[]>([])
  const [open,        setOpen]       = useState(false)
  const [highlighted, setHL]         = useState(0)
  const [loading,     setLoading]    = useState(false)
  const [showCreate,  setShowCreate] = useState(false)

  const inputRef     = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef     = useRef<AbortController | null>(null)

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
      if (!containerRef.current?.contains(e.target as Node)) {
        closeDropdown()
      }
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
        if (highlighted === createIdx && showCreateRow) {
          // Enter on Create row → open modal
          closeDropdown()
          setShowCreate(true)
        } else if (results[highlighted]) {
          selectProduct(results[highlighted])
        }
        break

      case 'Tab':
        // Tab selects current highlight and lets focus move naturally
        if (results[highlighted]) {
          selectProduct(results[highlighted])
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
      {open && (
        <div className="psc-dropdown">
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
        </div>
      )}

      {/* ── Quick-add modal ───────────────────────────────────────────────── */}
      {showCreate && (
        <QuickAddModal
          initialName={query.trim()}
          onSave={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

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
