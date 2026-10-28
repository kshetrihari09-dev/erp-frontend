/**
 * QtyEditor.tsx — a quantity you can type into, with − / + steppers (touch friendly).
 *
 *  - Whole numbers (1…99999) for counted items (tablets, bottles, tubes …); up to 3 decimals for Kg / Ltr.
 *  - Typing never changes anything until you press Enter or leave the box; an invalid entry is refused
 *    (`onInvalid`) and the box goes back to the real value.
 *  - − / + change the value at once (±1, or ±0.5 for Kg / Ltr) and never go to 0 or below.
 */
import { useState } from 'react'
import { parseUnitQty } from './retailBasket'

export interface QtyEditorProps {
  value: number
  bulk: boolean                       // Kg / Ltr → decimals allowed
  label: string                       // accessible name, e.g. "Quantity of Amoxicillin (tablets)"
  onCommit: (qty: number) => void
  onInvalid?: () => void
  id?: string
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

export default function QtyEditor({ value, bulk, label, onCommit, onInvalid, id }: QtyEditorProps) {
  const [text, setText] = useState<string | null>(null)        // null → show the real value
  const step = bulk ? 0.5 : 1
  const shown = text ?? String(r3(value))
  const commit = () => {
    if (text === null) return
    const v = parseUnitQty(text, bulk)
    setText(null)
    if (v === null) onInvalid?.()
    else if (v !== value) onCommit(v)
  }
  const bump = (dir: 1 | -1) => {
    const next = r3(value + dir * step)
    if (next <= 0 || (!bulk && next < 1)) return
    setText(null); onCommit(next)
  }
  const bad = text !== null && parseUnitQty(text, bulk) === null
  const btn = 'h-7 w-7 rounded-md border border-[var(--border)] text-[var(--text-2)] text-base leading-none'
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="Decrease quantity" disabled={r3(value - step) <= 0 || (!bulk && value - step < 1)} onClick={() => bump(-1)}>−</button>
      <input id={id} type="text" inputMode={bulk ? 'decimal' : 'numeric'} className="erp-input w-16 !py-1 text-center" value={shown} aria-label={label} aria-invalid={bad}
        onFocus={e => e.currentTarget.select()}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') setText(null) }} />
      <button type="button" className={btn} aria-label="Increase quantity" onClick={() => bump(1)}>+</button>
    </span>
  )
}
