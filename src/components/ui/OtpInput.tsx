/**
 * components/ui/OtpInput.tsx — segmented numeric code entry.
 *
 * Separate file rather than another export in components/ui/index.tsx
 * because it carries real behaviour (focus management, paste handling,
 * mobile keyboard coaxing) and that barrel is a collection of mostly
 * presentational primitives.
 *
 * Mobile is the primary target here (spec §25): the person using this is
 * standing at a customer's door, one-handed, reading digits aloud back
 * to them. So:
 *
 *  - inputMode="numeric" + pattern="[0-9]*" brings up the phone keypad
 *    rather than the full keyboard. (type="number" would ALSO do that,
 *    but it brings spinner arrows, accepts "e"/"+"/"-", and silently
 *    mangles leading zeros — a delivery code like 048271 must survive.)
 *  - focus advances on entry and retreats on backspace-from-empty, so
 *    six taps enter six digits with no aiming.
 *  - pasting a 6-digit code into ANY box fills all six, because iOS
 *    SMS autofill and "copy code" both target whichever box has focus.
 *  - autoComplete="one-time-code" lets iOS offer the code from the SMS
 *    directly. Harmless here — the rider's phone won't have received
 *    the customer's SMS, so it simply never fires. It costs nothing and
 *    makes this component correct if it is ever reused for a code that
 *    IS sent to the person typing it.
 */
import { useRef, useEffect, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from 'react'
import { cn } from '@/utils'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  /** Paints the boxes red — for a rejected code, not for an empty one. */
  invalid?: boolean
  /** Fired when the last box is filled, so the caller can auto-submit. */
  onComplete?: (value: string) => void
  autoFocus?: boolean
}

export default function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  invalid = false,
  onComplete,
  autoFocus = true,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus()
  }, [autoFocus, disabled])

  /** Single funnel for every mutation, so onComplete can never be missed
   *  by one input path (typing) but fired by another (paste). */
  function commit(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
  }

  function handleChange(index: number, e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) return

    // Typing into a filled box replaces that digit rather than being
    // ignored — the natural way to fix a single misheard digit.
    const chars = value.padEnd(length, ' ').split('')
    const incoming = raw.slice(-1)
    chars[index] = incoming
    commit(chars.join('').replace(/ /g, ''))

    const nextEmpty = Math.min(index + 1, length - 1)
    refs.current[nextEmpty]?.focus()
    refs.current[nextEmpty]?.select()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const chars = value.padEnd(length, ' ').split('')
      if (chars[index] !== ' ') {
        // Clear this box, stay put.
        chars[index] = ' '
        onChange(chars.join('').replace(/ /g, ''))
      } else if (index > 0) {
        // Already empty — step back and clear that one instead.
        chars[index - 1] = ' '
        onChange(chars.join('').replace(/ /g, ''))
        refs.current[index - 1]?.focus()
      }
      return
    }
    if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); refs.current[index - 1]?.focus() }
    if (e.key === 'ArrowRight' && index < length - 1) { e.preventDefault(); refs.current[index + 1]?.focus() }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    commit(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="group" aria-label={`${length}-digit delivery code`}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={digits[i] === ' ' ? '' : digits[i]}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            // Deliberately large: this is a doorstep, one-handed, in
            // daylight. 3rem boxes and 1.5rem digits, not form-sized.
            'w-11 h-14 sm:w-12 sm:h-15 text-center text-2xl font-extrabold tabular-nums',
            'rounded-xl border-2 bg-[var(--surface)] text-[var(--text)]',
            'outline-none transition-colors',
            'focus:border-brand focus:ring-2 focus:ring-brand/20',
            invalid ? 'border-red-400 text-red-600' : 'border-[var(--border-2)]',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  )
}
