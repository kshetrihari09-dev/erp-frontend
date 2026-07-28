/**
 * dateSystem.ts — single, centralized place for AD ↔ BS date-system
 * switching used by Sales, Purchase, and Voucher (and anywhere else that
 * wants it). This is a frontend display/input concern ONLY:
 *
 *   - The backend, database, accounting logic, and all stored dates
 *     continue to use AD exactly as before. Nothing here ever changes
 *     what gets sent to or stored by the existing APIs.
 *   - AD is always the canonical value kept in component/form state.
 *     BS is derived for display, and re-derived back to AD on input,
 *     using the existing `nepali-date-converter`-backed helpers in
 *     `./nepaliDate` — no second conversion system.
 *
 * Every call site should go through `formatDisplayDate` / `convertInputDateToAD`
 * rather than calling `adToBS`/`bsToAD` directly, so the AD/BS switching
 * behavior (and any future tweaks to it) lives in exactly one place.
 */
import { adToBS, bsToAD } from './nepaliDate'
import { fmtDate as fmtDateAD } from './index'

/** The supported date display systems. Mirrors `useUIStore`'s `dateMode`.
 *  'BOTH' is display-only (see formatDisplayDate) — for input/editing,
 *  helpers below treat it the same as 'AD'. */
export type DateSystem = 'AD' | 'BS' | 'BOTH'

/**
 * formatDisplayDate — given a canonical AD date (ISO 'YYYY-MM-DD', or any
 * Date-parseable string), return it formatted for display in the
 * requested system.
 *
 *  - 'AD' → unchanged from the existing `fmtDate` look (e.g. "26/07/2026"),
 *    so switching to AD is a visual no-op versus current behavior.
 *  - 'BS' → the same underlying date, converted and shown as
 *    'YYYY-MM-DD' in Bikram Sambat.
 *  - 'BOTH' → both, as "AD (BS)", e.g. "26/07/2026 (2083-04-11)". Centralized
 *    here so every existing call site gains this automatically.
 *
 * Never double-converts: the input is always assumed to be the AD source
 * of truth, never a previously-converted BS value.
 */
export function formatDisplayDate(
  adDate: string | null | undefined,
  dateSystem: DateSystem,
  fallback = '—',
): string {
  if (!adDate) return fallback
  if (dateSystem === 'AD') return fmtDateAD(adDate, fallback)
  if (dateSystem === 'BS') return adToBS(adDate, 'YYYY-MM-DD') || fallback
  const ad = fmtDateAD(adDate, fallback)
  const bs = adToBS(adDate, 'YYYY-MM-DD') || fallback
  return `${ad} (${bs})`
}

/**
 * convertInputDateToAD — given a date the user typed/selected, which is
 * expressed in `dateSystem`'s calendar, return the canonical AD ISO
 * ('YYYY-MM-DD') string the existing API expects.
 *
 *  - 'AD' → passthrough (native `<input type="date">` already yields AD ISO).
 *  - 'BS' → converts the BS 'YYYY-MM-DD' value to its AD equivalent.
 *
 * Returns '' for empty/invalid input rather than throwing.
 */
export function convertInputDateToAD(inputDate: string | null | undefined, dateSystem: DateSystem): string {
  if (!inputDate) return ''
  if (dateSystem === 'BS') return bsToAD(inputDate)
  return inputDate // 'AD' and 'BOTH' both edit via the native AD date input
}

/** Today's date, expressed in the given system, as 'YYYY-MM-DD'.
 *  Handy as a default value for new-record date fields. */
export function todayInSystem(dateSystem: DateSystem): string {
  const now = new Date()
  const todayAD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return dateSystem === 'BS' ? adToBS(todayAD) : todayAD
}
