import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import useUIStore from '@/store/uiStore'
import {
  type CalSystem, type RangeMode, convertMode, convertSystem, describeRange, initialTexts,
  maskInput, resolveRange, stepText,
} from '@/utils/dateRange'

/**
 * DateRangePopup — compact "Date Range" dialog (Date Type · By Date/Month · From · To · Set).
 *
 * Reusable on any report: pass the CURRENT range as AD ISO strings and handle `onApply`,
 * which receives the validated range as AD ISO ('YYYY-MM-DD', both ends inclusive). All
 * BS/AD conversion, month normalisation and validation lives in utils/dateRange.ts.
 * Set validates, calls onApply, and closes only when that succeeded.
 */
export interface DateRangeApply { fromAD: string; toAD: string; system: CalSystem; mode: RangeMode }

interface PopupProps {
  open: boolean
  fromAD: string
  toAD: string
  system: CalSystem
  onApply: (r: DateRangeApply) => void | Promise<void>
  onClose: () => void
}

export function DateRangePopup({ open, fromAD, toAD, system: initialSystem, onApply, onClose }: PopupProps) {
  const [system, setSystem] = useState<CalSystem>(initialSystem)
  const [mode, setMode]     = useState<RangeMode>('date')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [error, setError]   = useState<{ field: 'from' | 'to' | 'range'; message: string } | null>(null)
  const [busy, setBusy]     = useState(false)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef   = useRef<HTMLInputElement>(null)

  // (re)load the fields from the applied range every time the popup opens
  useEffect(() => {
    if (!open) return
    const t = initialTexts(fromAD, toAD, initialSystem, 'date')
    setSystem(initialSystem); setMode('date'); setFrom(t.from); setTo(t.to); setError(null); setBusy(false)
    setTimeout(() => fromRef.current?.select(), 0)
  }, [open, fromAD, toAD, initialSystem])

  if (!open) return null
  const state = { system, mode, from, to }

  const changeSystem = (next: CalSystem) => {          // same days stay selected, shown in the other calendar
    const t = convertSystem(state, next)
    setSystem(next); setFrom(t.from); setTo(t.to); setError(null)
  }
  const changeMode = (next: RangeMode) => {
    const t = convertMode(state, next)
    setMode(next); setFrom(t.from); setTo(t.to); setError(null)
  }

  const set = async () => {
    const r = resolveRange(state)
    if (!r.ok) {
      setError({ field: r.field, message: r.message })
      ;(r.field === 'to' ? toRef : fromRef).current?.focus()
      return
    }
    setBusy(true); setError(null)
    try {
      await onApply({ fromAD: r.fromAD, toAD: r.toAD, system, mode })
      onClose()                                          // only after the filter was applied successfully
    } catch (e: any) {
      setError({ field: 'range', message: e?.message || 'Could not apply the date range' })
    } finally { setBusy(false) }
  }

  const keyHandler = (which: 'from' | 'to') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void set() }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const cur = which === 'from' ? from : to
      const next = stepText(system, mode, cur, e.key === 'ArrowUp' ? 1 : -1)
      if (next) { (which === 'from' ? setFrom : setTo)(next); setError(null) }
    }
  }
  const field = (which: 'from' | 'to') => {
    const value = which === 'from' ? from : to
    const bad = error && (error.field === which || error.field === 'range')
    return (
      <input
        ref={which === 'from' ? fromRef : toRef}
        className={`dr-input${bad ? ' bad' : ''}`}
        value={value} inputMode="numeric" autoComplete="off" spellCheck={false}
        maxLength={10} placeholder={mode === 'month' ? 'YYYY/MM' : 'YYYY/MM/DD'}
        aria-label={which === 'from' ? 'From' : 'To'} aria-invalid={!!bad}
        onChange={e => { (which === 'from' ? setFrom : setTo)(maskInput(e.target.value, mode)); setError(null) }}
        onKeyDown={keyHandler(which)}
        onFocus={e => e.currentTarget.select()}
      />
    )
  }

  return (
    <div className="dr-pop" role="dialog" aria-label="Date Range" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="dr-title">Date Range</div>
      <fieldset className="dr-box">
        <legend>Function</legend>
        <div className="dr-row"><label>Date Type</label>
          <select className="dr-input" value={system} onChange={e => changeSystem(e.target.value as CalSystem)}>
            <option value="BS">BS</option><option value="AD">AD</option>
          </select></div>
        <div className="dr-row"><label>By Date/Month</label>
          <select className="dr-input" value={mode} onChange={e => changeMode(e.target.value as RangeMode)}>
            <option value="date">Date</option><option value="month">Month</option>
          </select></div>
        <div className="dr-row"><label>From</label>{field('from')}</div>
        <div className="dr-row"><label>To</label>{field('to')}</div>
        <div className="dr-hint">{mode === 'month' ? 'YYYY/MM · whole months' : 'YYYY/MM/DD'} · ↑↓ to change</div>
        <div className="dr-err" role="alert">{error?.message || ''}</div>
      </fieldset>
      <button type="button" className="dr-set" onClick={() => void set()} disabled={busy}>{busy ? 'Setting…' : 'Set'}</button>
    </div>
  )
}

/** Button showing the applied range + the popup anchored under it. Drop-in for a From/To pair. */
export function DateRangeFilter({ fromAD, toAD, onApply }: {
  fromAD: string; toAD: string; onApply: (r: DateRangeApply) => void | Promise<void>
}) {
  const dateMode = useUIStore(s => s.dateMode)
  const [system, setSystem] = useState<CalSystem>(dateMode === 'AD' ? 'AD' : 'BS')   // last used calendar
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="dr-anchor" ref={box}>
      <button type="button" className="erp-input dr-trigger" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        title="Change date range">
        <CalendarDays size={14} />
        <span>{describeRange(fromAD, toAD, system)}</span>
        <em>{system}</em>
      </button>
      <DateRangePopup
        open={open} fromAD={fromAD} toAD={toAD} system={system} onClose={() => setOpen(false)}
        onApply={async r => { await onApply(r); setSystem(r.system) }}
      />
    </div>
  )
}

export default DateRangePopup
