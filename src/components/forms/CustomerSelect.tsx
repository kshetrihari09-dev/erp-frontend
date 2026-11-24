/**
 * CustomerSelect.tsx
 *
 * Searchable replacement for the plain <select> used to pick the customer on the Sales page.
 *
 * Click / focus (or F3, which focuses `id="pos-customer-select"`) → the current text is
 * selected and a dropdown lists every customer. Just start typing to narrow it: matches
 * name, code, phone and PAN anywhere in the text, case-insensitive, entirely client-side
 * over the already-loaded list (no request per keystroke).
 *
 * Keyboard:  ↑ / ↓ move · Enter picks the highlighted customer · Tab picks it too (only when
 *            something was typed) · Esc closes and restores the current customer.
 * Mouse/touch: tap a row to pick; tapping outside closes without changing anything.
 *
 * Controlled & stateless about the form: it only reports a customer id through `onChange`,
 * exactly the value the old <select> wrote to `customer_id`, so everything downstream (credit
 * check, auto-collapse, product-search focus, posting) is untouched.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Party } from '@/types'

interface Props {
  customers:    Party[]
  value:        string                        // selected customer id ('' = none)
  onChange:     (id: string) => void
  id?:          string
  className?:   string
  placeholder?: string
  required?:    boolean
}

const MAX_ROWS = 60   // rendered at once; keep typing to narrow further

const labelOf = (c?: Party) => (c ? `${c.code ? `${c.code} - ` : ''}${c.name}` : '')

export default function CustomerSelect({
  customers, value, onChange, id, className, placeholder = 'Search customer by name, code or phone…', required,
}: Props) {
  const [open,  setOpen]  = useState(false)
  const [typed, setTyped] = useState<string | null>(null)   // null = showing the selected label
  const [hl,    setHL]    = useState(0)
  const [pos,   setPos]   = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  const selected = useMemo(() => customers.find(c => c.id === value), [customers, value])
  const label    = labelOf(selected)

  const filtered = useMemo(() => {
    const q = (typed ?? '').trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.pan_no || '').toLowerCase().includes(q))
  }, [customers, typed])
  const shown = filtered.slice(0, MAX_ROWS)

  function updatePos() {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16)
    const left  = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    setPos(below < 220 && r.top > below
      ? { bottom: window.innerHeight - r.top + 4, left, width }
      : { top: r.bottom + 4, left, width })
  }

  useEffect(() => {
    if (!open) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  useEffect(() => {
    (listRef.current?.children[hl] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [hl, open])

  function openList() {
    if (open) return
    setTyped(null)
    // Start on the currently selected customer so ↓/↑ continue from where the user is.
    const idx = customers.findIndex(c => c.id === value)
    setHL(idx >= 0 && idx < MAX_ROWS ? idx : 0)
    setOpen(true)
  }
  function close() { setOpen(false); setTyped(null) }
  function pick(c: Party) { onChange(c.id); close() }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) openList(); else setHL(h => Math.min(h + 1, shown.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (open) setHL(h => Math.max(h - 1, 0))
        break
      case 'Enter':
        e.preventDefault()                       // never submit the sale form from here
        if (open && shown[hl]) pick(shown[hl])
        else if (!open) openList()
        break
      case 'Tab':
        // Typed something, then Tab → accept the top/highlighted match; otherwise just leave.
        if (open && typed && typed.trim() && shown[hl]) onChange(shown[hl].id)
        close()
        break
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); close() }
        break
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        className={className}
        required={required}
        placeholder={placeholder}
        value={typed ?? label}
        onFocus={e => { openList(); e.currentTarget.select() }}
        onClick={() => { if (!open) openList() }}
        onChange={e => { setTyped(e.target.value); setHL(0); if (!open) setOpen(true) }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />

      {open && pos && createPortal(
        <div
          className="csel-dropdown"
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          // Keep focus in the input while interacting with the list (scrollbar drags included).
          onMouseDown={e => e.preventDefault()}
        >
          <ul ref={listRef} className="csel-list" role="listbox">
            {shown.length === 0 && <li className="csel-empty">No customer matches “{(typed ?? '').trim()}”</li>}
            {shown.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                className={`csel-option${i === hl ? ' csel-option--hl' : ''}${c.id === value ? ' csel-option--sel' : ''}`}
                onMouseEnter={() => setHL(i)}
                onClick={() => pick(c)}
              >
                <span className="csel-name">{c.code ? <span className="csel-code">{c.code}</span> : null}{c.name}</span>
                {(c.phone || c.pan_no) && <span className="csel-meta">{c.phone || `PAN ${c.pan_no}`}</span>}
              </li>
            ))}
            {filtered.length > MAX_ROWS && (
              <li className="csel-more">{filtered.length - MAX_ROWS} more — keep typing to narrow</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
