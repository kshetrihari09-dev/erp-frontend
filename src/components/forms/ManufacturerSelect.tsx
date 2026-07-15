/**
 * ManufacturerSelect.tsx
 *
 * Replaces the plain "Company / Brand" text input on the Product
 * Create/Edit form with a searchable Manufacturer combobox, plus a (+)
 * button that opens QuickAddManufacturerModal without leaving the page.
 *
 * Only ever writes a manufacturer's *name* back to the caller — the
 * Product form still stores that name in its existing `company_name`
 * field exactly as before (see services/manufacturers.ts for why there's
 * no manufacturer_id / backend master yet).
 *
 * Search is a local, case-insensitive "contains" filter over the already
 * -loaded manufacturer list (small, cached — no network call per
 * keystroke). Active manufacturers are listed before inactive ones.
 *
 * Keyboard: ↑ / ↓ navigate, Enter selects, Escape closes.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, Factory } from 'lucide-react'
import { useManufacturers } from '@/hooks/useQuery'
import type { Manufacturer } from '@/types'
import QuickAddManufacturerModal from './QuickAddManufacturerModal'

interface Props {
  /** Current value — the manufacturer *name* string stored on the product
   *  (Product.company_name). Free text is preserved even if it doesn't
   *  match any directory entry (e.g. legacy products, imported data). */
  value:      string
  onChange:   (name: string) => void
  placeholder?: string
}

export default function ManufacturerSelect({ value, onChange, placeholder }: Props) {
  const { data: manufacturers = [], isLoading } = useManufacturers()

  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [hl,    setHL]    = useState(0)
  const [showCreate, setShowCreate] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef   = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const listRef        = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: Manufacturer[] = manufacturers
    if (!q) return list
    return list.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.short_name || '').toLowerCase().includes(q),
    )
  }, [manufacturers, query])

  const trimmedQuery  = query.trim()
  const exactMatch    = filtered.some(m => m.name.toLowerCase() === trimmedQuery.toLowerCase())
  const showCreateRow = trimmedQuery.length > 0 && !exactMatch
  const createIdx     = filtered.length
  const optionCount   = filtered.length + (showCreateRow ? 1 : 0)

  /* ── Close on outside click ─────────────────────────────────────────── */
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  const updatePos = () => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) })
  }

  useEffect(() => {
    if (!open) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  function openDropdown() {
    setQuery(value || '')
    setHL(0)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  function select(m: Manufacturer) {
    onChange(m.name)
    close()
  }

  function handleKey(e: KeyboardEvent) {
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
        if (showCreateRow && hl === createIdx) {
          close()
          setShowCreate(true)
        } else if (filtered[hl]) {
          select(filtered[hl])
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  function handleCreated(m: Manufacturer) {
    setShowCreate(false)
    onChange(m.name)
  }

  return (
    <div ref={containerRef} className="mfg-root">
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          {open ? (
            <div className="mfg-search-wrap">
              <Search size={12} className="mfg-search-icon" />
              <input
                ref={inputRef}
                className="mfg-search-input"
                value={query}
                placeholder="Type to search manufacturers…"
                onChange={e => { setQuery(e.target.value); setHL(0) }}
                onKeyDown={handleKey}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : (
            <button
              type="button"
              className={`mfg-trigger ${value ? 'mfg-trigger--selected' : 'mfg-trigger--empty'}`}
              onClick={openDropdown}
              onFocus={openDropdown}
            >
              {value || placeholder || 'Select manufacturer…'}
            </button>
          )}

          {open && pos && createPortal(
            <div
              ref={dropdownRef}
              className="mfg-dropdown"
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            >
              <ul ref={listRef} className="mfg-list" role="listbox">
                {isLoading && (
                  <li className="mfg-empty">Loading manufacturers…</li>
                )}
                {!isLoading && filtered.length === 0 && !showCreateRow && (
                  <li className="mfg-empty mfg-empty--hint">
                    <Factory size={13} className="mfg-empty-icon" />
                    Start typing, or use + to add one
                  </li>
                )}
                {filtered.map((m, i) => (
                  <li
                    key={m.id}
                    role="option"
                    aria-selected={i === hl}
                    className={`mfg-option ${i === hl ? 'mfg-option--hl' : ''} ${!m.is_active ? 'mfg-option--inactive' : ''}`}
                    onMouseEnter={() => setHL(i)}
                    onMouseDown={e => { e.preventDefault(); select(m) }}
                  >
                    <span className="mfg-option-name">{m.name}</span>
                    {!m.is_active && <span className="mfg-option-badge">Inactive</span>}
                    {m.short_name && <span className="mfg-option-meta">{m.short_name}</span>}
                  </li>
                ))}
                {showCreateRow && (
                  <li
                    role="option"
                    aria-selected={hl === createIdx}
                    className={`mfg-create-row ${hl === createIdx ? 'mfg-create-row--hl' : ''}`}
                    onMouseEnter={() => setHL(createIdx)}
                    onMouseDown={e => { e.preventDefault(); close(); setShowCreate(true) }}
                  >
                    <Plus size={12} />
                    <span>Create manufacturer "{trimmedQuery}"</span>
                  </li>
                )}
              </ul>
            </div>,
            document.body,
          )}
        </div>

        <button
          type="button"
          className="pos-party-add-btn"
          onClick={() => setShowCreate(true)}
          title="New Manufacturer"
          aria-label="New Manufacturer"
        >
          <Plus size={15}/>
        </button>
      </div>

      {showCreate && (
        <QuickAddManufacturerModal
          initialName={query.trim()}
          existingNames={manufacturers.map(m => m.name)}
          onSave={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
