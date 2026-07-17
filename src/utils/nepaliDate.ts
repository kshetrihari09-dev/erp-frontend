/**
 * nepaliDate.ts — single source of truth for BS (Bikram Sambat) date
 * conversion and formatting on the frontend, backed by the
 * `nepali-date-converter` library.
 *
 * Dates are stored internally as AD (ISO 'YYYY-MM-DD') everywhere in this
 * app — API payloads, form state, filters, comparisons — exactly as
 * before. This module is purely a display-layer helper: give it an AD
 * date, get back a BS string to show the user (or vice-versa, for the
 * rare case a BS value needs to be typed in and converted back to AD
 * before hitting the API).
 *
 * Two library quirks are worked around here so callers don't have to
 * know about them:
 *
 * 1. Off-by-one risk: the library reads a Date's exact instant, not just
 *    its calendar day. Passing it `new Date()` directly (whose time-of-day
 *    is whatever moment the code happens to run) can land it on the wrong
 *    side of a BS/AD day boundary. Every AD date is normalized to UTC
 *    midnight, built from its Y/M/D components, before reaching the
 *    library. Verified round-trip-safe (AD → BS → AD returns the exact
 *    original date) once inputs are normalized this way.
 * 2. The library's own multi-letter day-name token ('dddd') has a
 *    formatting bug — it appends a stray digit (e.g. "Thursday4"). We
 *    never use that token; day names are resolved from a static table
 *    keyed by the library's (correct) numeric getDay() instead.
 */
import NepaliDate from 'nepali-date-converter'

export const BS_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Aswin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const

export const BS_DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

function normalizedUTCDate(adIso: string): Date {
  const [y, m, d] = adIso.split('T')[0].split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** AD ISO ('YYYY-MM-DD', or any string Date-parseable with a leading
 *  date part) → BS, in the given format. Returns '' for null/invalid
 *  input rather than throwing, so it's always safe to drop into JSX. */
export function adToBS(
  adIso: string | null | undefined,
  format: 'YYYY-MM-DD' | 'DD/MM/YYYY' = 'YYYY-MM-DD',
): string {
  if (!adIso) return ''
  try {
    return new NepaliDate(normalizedUTCDate(adIso)).format(format)
  } catch {
    return ''
  }
}

/** AD ISO → full display form, e.g. "Friday, 01 Shrawan 2083".
 *  Built from getBS()/BS_MONTH_NAMES/BS_DAY_NAMES rather than the
 *  library's own 'dddd'/'MMMM' tokens, sidestepping the day-name bug
 *  noted above. */
export function adToBSFull(adIso: string | null | undefined): string {
  if (!adIso) return ''
  try {
    const bs = new NepaliDate(normalizedUTCDate(adIso)).getBS()
    const dayName = BS_DAY_NAMES[bs.day] ?? ''
    const monthName = BS_MONTH_NAMES[bs.month] ?? ''
    return `${dayName}, ${String(bs.date).padStart(2, '0')} ${monthName} ${bs.year}`
  } catch {
    return ''
  }
}

/** BS 'YYYY-MM-DD' (or a bare {year,month,day}, month 1-indexed) → AD
 *  ISO 'YYYY-MM-DD'. Returns '' for null/invalid input. */
export function bsToAD(bs: string | null | undefined | { year: number; month: number; day: number }): string {
  if (!bs) return ''
  try {
    const [y, m, d] = typeof bs === 'string'
      ? bs.split('-').map(Number)
      : [bs.year, bs.month, bs.day]
    // Library constructor month is 0-indexed, like the native JS Date.
    const jsDate = new NepaliDate(y, m - 1, d).toJsDate()
    return jsDate.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

/** Today's date, in BS. */
export function todayBS(format: 'YYYY-MM-DD' | 'DD/MM/YYYY' = 'YYYY-MM-DD'): string {
  return adToBS(new Date().toISOString(), format)
}
