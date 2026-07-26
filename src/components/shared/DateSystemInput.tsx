import { useState, useEffect } from 'react'
import useUIStore from '@/store/uiStore'
import { formatDisplayDate, convertInputDateToAD } from '@/utils/dateSystem'

interface DateSystemInputProps {
  /** Canonical AD ISO date ('YYYY-MM-DD') — the single source of truth. */
  valueAD: string
  /** Always receives the AD ISO date, regardless of which system the user typed in. */
  onChangeAD: (adIso: string) => void
  className?: string
  id?: string
  required?: boolean
  disabled?: boolean
  /** AD ISO date — converted internally to the active system before being
   *  applied as the input's min/max, since the on-screen field may be BS. */
  min?: string
  max?: string
  'aria-label'?: string
}

const BS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * DateSystemInput — a drop-in replacement for `<input type="date">` that
 * respects the app-wide AD/BS toggle (`useUIStore().dateMode`).
 *
 *  - AD mode: renders the normal native date picker, unchanged.
 *  - BS mode: renders a plain text field (browsers have no native BS
 *    calendar) pre-filled with the BS equivalent of `valueAD`, in
 *    'YYYY-MM-DD' form (e.g. "2083-04-11" per the BS date system).
 *
 * In both cases `onChangeAD` is only ever called with a valid AD ISO
 * date — callers never need to know or convert anything themselves.
 * This is the one place BS↔AD input conversion happens, so it isn't
 * duplicated across Sales, Purchase, and Voucher.
 */
export default function DateSystemInput({
  valueAD, onChangeAD, className, min, max, ...rest
}: DateSystemInputProps) {
  const { dateMode } = useUIStore()
  const [text, setText] = useState(() => formatDisplayDate(valueAD, dateMode, ''))

  // Re-sync the visible text whenever the underlying AD value changes from
  // outside (loading a different record, resetting the form) or the user
  // flips the global AD/BS toggle — but only when it actually differs, so
  // we don't clobber a value the user is still mid-typing in BS mode.
  useEffect(() => {
    const next = formatDisplayDate(valueAD, dateMode, '')
    setText(prev => (convertInputDateToAD(prev, dateMode) === valueAD ? prev : next))
  }, [valueAD, dateMode])

  if (dateMode === 'AD') {
    return (
      <input
        type="date"
        className={className}
        value={text}
        min={min}
        max={max}
        onChange={e => { setText(e.target.value); onChangeAD(e.target.value) }}
        {...rest}
      />
    )
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="YYYY-MM-DD (BS)"
      pattern="\d{4}-\d{2}-\d{2}"
      className={className}
      value={text}
      onChange={e => {
        const v = e.target.value
        setText(v)
        // Only push a conversion up to the parent once the value looks
        // like a complete BS date — avoids fighting the user mid-keystroke
        // and never sends a half-typed/garbage date to convertInputDateToAD.
        if (BS_DATE_RE.test(v)) {
          const ad = convertInputDateToAD(v, 'BS')
          if (ad) onChangeAD(ad)
        }
      }}
      {...rest}
    />
  )
}
