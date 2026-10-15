/**
 * dateRange.ts — pure logic behind the compact "Date Range" popup.
 *
 * Everything here is calendar maths on plain Y/M/D numbers; no React, no timezone
 * dependence. The app stores and queries ALL dates as AD ISO ('YYYY-MM-DD'), so
 * every range is resolved to AD before it leaves this module.
 *
 * Conversion is delegated to the app's existing BS helpers (./nepaliDate, backed
 * by nepali-date-converter). Two library behaviours are guarded here:
 *   • it silently ROLLS OVER impossible BS dates (2083/02/32 → 2083/03/01), so
 *     every BS date is validated against the library's own month-length table
 *     (`dateConfigMap`) first, then verified by a round-trip after conversion;
 *   • it only covers BS 2000 – 2090 and returns garbage (not an error) for AD
 *     dates outside that window, so both calendars are range-checked explicitly.
 */
import { dateConfigMap } from 'nepali-date-converter'
import { adToBS, bsToAD } from './nepaliDate'

export type CalSystem = 'BS' | 'AD'
export type RangeMode = 'date' | 'month'
export interface YMD { y: number; m: number; d: number }          // m is 1-12

const BS_MIN_YEAR = 2000
const BS_MAX_YEAR = 2090
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

// ── month lengths ───────────────────────────────────────────────────────────
/** Days in each BS month of `year` (index 0 = Baisakh), or null if unsupported. */
export function bsMonthLengths(year: number): number[] | null {
  const row = (dateConfigMap as Record<string, Record<string, number>>)[String(year)]
  return row ? Object.values(row) : null
}
export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
export function adDaysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}
export function daysInMonth(system: CalSystem, y: number, m: number): number {
  if (system === 'AD') return adDaysInMonth(y, m)
  return bsMonthLengths(y)?.[m - 1] ?? 0
}

// ── AD ↔ ISO helpers (pure arithmetic, no Date/timezone) ────────────────────
const adIso = ({ y, m, d }: YMD) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`
const parseIso = (s: string): YMD => { const [y, m, d] = s.split('-').map(Number); return { y, m, d } }

/** Inclusive AD window the BS library can represent. */
export const AD_MIN = bsToAD({ year: BS_MIN_YEAR, month: 1, day: 1 })
export const AD_MAX = (() => {
  const last = bsMonthLengths(BS_MAX_YEAR)!
  return bsToAD({ year: BS_MAX_YEAR, month: 12, day: last[11] })
})()

// ── validation ──────────────────────────────────────────────────────────────
/** Returns an error message, or null when `v` is a real date in `system`. */
export function validateYMD(system: CalSystem, v: YMD, monthOnly = false): string | null {
  const { y, m, d } = v
  if (![y, m, d].every(Number.isInteger)) return 'Enter a valid date'
  if (y < 1000 || y > 9999) return 'Year must have 4 digits'
  if (m < 1 || m > 12) return 'Month must be 01–12'
  if (system === 'BS') {
    if (y < BS_MIN_YEAR || y > BS_MAX_YEAR) return `BS year must be ${BS_MIN_YEAR}–${BS_MAX_YEAR}`
  } else {
    const iso = adIso({ y, m, d: monthOnly ? 1 : d })
    if (iso < AD_MIN || (monthOnly ? adIso({ y, m, d: adDaysInMonth(y, m) }) : iso) > AD_MAX)
      return `AD date must be between ${AD_MIN.replace(/-/g, '/')} and ${AD_MAX.replace(/-/g, '/')}`
  }
  if (monthOnly) return null
  const dim = daysInMonth(system, y, m)
  if (d < 1 || d > dim) return `${pad(y, 4)}/${pad(m)} has only ${dim} days`
  return null
}

// ── text ⇄ YMD ──────────────────────────────────────────────────────────────
/** Parse 'YYYY/MM/DD' (or 'YYYY/MM' in month mode). Also tolerates '-' and '.'. */
export function parseText(text: string, mode: RangeMode): YMD | null {
  const parts = text.trim().split(/[/\-.]/)
  const want = mode === 'month' ? 2 : 3
  if (parts.length !== want || parts.some(p => !/^\d+$/.test(p))) return null
  if (parts[0].length !== 4 || parts[1].length > 2 || (want === 3 && parts[2].length > 2)) return null
  return { y: Number(parts[0]), m: Number(parts[1]), d: want === 3 ? Number(parts[2]) : 1 }
}
export const formatYMD = (v: YMD, mode: RangeMode) =>
  mode === 'month' ? `${pad(v.y, 4)}/${pad(v.m)}` : `${pad(v.y, 4)}/${pad(v.m)}/${pad(v.d)}`

/** Live input mask: keeps digits only and inserts '/' → '20830601' becomes '2083/06/01'. */
export function maskInput(raw: string, mode: RangeMode): string {
  const d = raw.replace(/\D/g, '').slice(0, mode === 'month' ? 6 : 8)
  return d.slice(0, 4) + (d.length > 4 ? `/${d.slice(4, 6)}` : '') + (d.length > 6 ? `/${d.slice(6, 8)}` : '')
}

// ── conversion ──────────────────────────────────────────────────────────────
/** AD ISO → YMD in `system`. Returns null when out of the supported window. */
export function adToYMD(ad: string, system: CalSystem): YMD | null {
  if (!ad || ad < AD_MIN || ad > AD_MAX) return null
  if (system === 'AD') return parseIso(ad)
  const bs = adToBS(ad, 'YYYY-MM-DD')
  return bs ? parseIso(bs) : null
}
/** YMD in `system` → AD ISO. Validates first and verifies by round-trip. */
export function ymdToAD(system: CalSystem, v: YMD): string | null {
  if (validateYMD(system, v)) return null
  if (system === 'AD') return adIso(v)
  const ad = bsToAD({ year: v.y, month: v.m, day: v.d })
  if (!ad) return null
  const back = adToYMD(ad, 'BS')                         // guard against library roll-over
  return back && back.y === v.y && back.m === v.m && back.d === v.d ? ad : null
}

/** First and last AD day of the month `y/m` in `system`. */
export function monthBoundsAD(system: CalSystem, y: number, m: number): { firstAD: string; lastAD: string } | null {
  const dim = daysInMonth(system, y, m)
  if (!dim) return null
  const firstAD = ymdToAD(system, { y, m, d: 1 }), lastAD = ymdToAD(system, { y, m, d: dim })
  return firstAD && lastAD ? { firstAD, lastAD } : null
}

// ── resolving the popup state into an AD range ──────────────────────────────
export interface RangeInput { system: CalSystem; mode: RangeMode; from: string; to: string }
export type RangeResult =
  | { ok: true; fromAD: string; toAD: string }
  | { ok: false; field: 'from' | 'to' | 'range'; message: string }

export function resolveRange({ system, mode, from, to }: RangeInput): RangeResult {
  const side = (text: string, field: 'from' | 'to', label: string): { ymd: YMD } | RangeResult => {
    if (!text.trim()) return { ok: false, field, message: `${label} is required` }
    const ymd = parseText(text, mode)
    if (!ymd) return { ok: false, field, message: `${label}: use ${mode === 'month' ? 'YYYY/MM' : 'YYYY/MM/DD'}` }
    const err = validateYMD(system, ymd, mode === 'month')
    return err ? { ok: false, field, message: `${label}: ${err}` } : { ymd }
  }
  const f = side(from, 'from', 'From'); if ('ok' in f) return f
  const t = side(to, 'to', 'To');       if ('ok' in t) return t

  let fromAD: string | null, toAD: string | null
  if (mode === 'month') {
    fromAD = monthBoundsAD(system, f.ymd.y, f.ymd.m)?.firstAD ?? null      // first day of the From month
    toAD   = monthBoundsAD(system, t.ymd.y, t.ymd.m)?.lastAD ?? null       // last day of the To month
  } else {
    fromAD = ymdToAD(system, f.ymd); toAD = ymdToAD(system, t.ymd)
  }
  if (!fromAD) return { ok: false, field: 'from', message: 'From: date could not be converted' }
  if (!toAD)   return { ok: false, field: 'to',   message: 'To: date could not be converted' }
  if (fromAD > toAD) return { ok: false, field: 'range', message: 'From cannot be later than To' }
  return { ok: true, fromAD, toAD }
}

// ── switching calendar / mode without losing the selection ──────────────────
/** Re-express the From/To texts in another calendar (via AD) so the same days stay selected. */
export function convertSystem(input: RangeInput, next: CalSystem): { from: string; to: string } {
  const conv = (text: string, isTo: boolean) => {
    const ymd = parseText(text, input.mode)
    if (!ymd || validateYMD(input.system, ymd, input.mode === 'month')) return text            // keep what the user typed
    const ad = input.mode === 'month'
      ? (monthBoundsAD(input.system, ymd.y, ymd.m) && (isTo ? monthBoundsAD(input.system, ymd.y, ymd.m)!.lastAD : monthBoundsAD(input.system, ymd.y, ymd.m)!.firstAD))
      : ymdToAD(input.system, ymd)
    const out = ad ? adToYMD(ad, next) : null
    return out ? formatYMD(out, input.mode) : text
  }
  return { from: conv(input.from, false), to: conv(input.to, true) }
}

/** Switch Date ⇄ Month: Date→Month keeps the containing months; Month→Date keeps the whole months. */
export function convertMode(input: RangeInput, next: RangeMode): { from: string; to: string } {
  if (next === input.mode) return { from: input.from, to: input.to }
  const f = parseText(input.from, input.mode), t = parseText(input.to, input.mode)
  const fOk = f && !validateYMD(input.system, f, input.mode === 'month')
  const tOk = t && !validateYMD(input.system, t, input.mode === 'month')
  if (next === 'month') {
    return { from: fOk ? formatYMD(f!, 'month') : input.from, to: tOk ? formatYMD(t!, 'month') : input.to }
  }
  const fromDate = fOk ? formatYMD({ ...f!, d: 1 }, 'date') : input.from
  const toDate = tOk ? formatYMD({ ...t!, d: daysInMonth(input.system, t!.y, t!.m) }, 'date') : input.to
  return { from: fromDate, to: toDate }
}

/** Arrow-key stepping: ±1 day (Date mode) or ±1 month (Month mode) in the active calendar. */
export function stepText(system: CalSystem, mode: RangeMode, text: string, dir: 1 | -1): string | null {
  const ymd = parseText(text, mode)
  if (!ymd || validateYMD(system, ymd, mode === 'month')) return null
  if (mode === 'month') {
    let { y, m } = ymd; m += dir; if (m > 12) { m = 1; y++ } if (m < 1) { m = 12; y-- }
    return validateYMD(system, { y, m, d: 1 }, true) ? null : formatYMD({ y, m, d: 1 }, 'month')
  }
  const ad = ymdToAD(system, ymd); if (!ad) return null
  const dt = new Date(Date.UTC(...(Object.values(parseIso(ad)) as [number, number, number]).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]))
  dt.setUTCDate(dt.getUTCDate() + dir)
  const next = adToYMD(`${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`, system)
  return next ? formatYMD(next, 'date') : null
}

/** Display an applied AD range as 'YYYY/MM/DD – YYYY/MM/DD' in the given calendar. */
export function describeRange(fromAD: string, toAD: string, system: CalSystem): string {
  const f = adToYMD(fromAD, system), t = adToYMD(toAD, system)
  return f && t ? `${formatYMD(f, 'date')} – ${formatYMD(t, 'date')}` : `${fromAD.replace(/-/g, '/')} – ${toAD.replace(/-/g, '/')}`
}
/** Texts for the popup fields when it opens on an existing AD range. */
export function initialTexts(fromAD: string, toAD: string, system: CalSystem, mode: RangeMode): { from: string; to: string } {
  const f = adToYMD(fromAD, system), t = adToYMD(toAD, system)
  return { from: f ? formatYMD(f, mode) : '', to: t ? formatYMD(t, mode) : '' }
}
