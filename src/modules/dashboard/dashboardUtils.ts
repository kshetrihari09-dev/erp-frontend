/** Pure helpers for the dashboard — no React, no I/O (unit-tested in dashboard.logic.test.ts). */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YMD = /^(\d{4})-(\d{2})-(\d{2})/

/** % change from `previous` to `current`; null when there is nothing to compare against (previous ≤ 0). */
export function pctChange(current: number, previous: number): number | null {
  const c = Number(current) || 0, p = Number(previous) || 0
  if (p <= 0) return null
  return ((c - p) / p) * 100
}

/** "+12.5%" / "−3%" / "0%". One decimal below 10%, none above. Uses a true minus sign. */
export function fmtPct(p: number): string {
  const a = Math.abs(p)
  const txt = a >= 10 ? Math.round(a).toString() : (Math.round(a * 10) / 10).toString()
  if (Number(txt) === 0) return '0%'
  return `${p > 0 ? '+' : '−'}${txt}%`
}

/** '2026-11-04' → '4 Nov' (day) ; '2026-11' → 'Nov' (month). `withYear` adds the year ('4 Nov 2026' / 'Nov 2026'). */
export function bucketLabel(key: string, granularity: 'day' | 'month', withYear = false): string {
  const y = key.slice(0, 4), m = MONTHS[Number(key.slice(5, 7)) - 1] ?? ''
  if (granularity === 'month') return withYear ? `${m} ${y}` : m
  const d = Number(key.slice(8, 10))
  return withYear ? `${d} ${m} ${y}` : `${d} ${m}`
}

/** '2026-11-04' (or an ISO string starting with it) → '04 Nov 2026'. Read from the digits, never via Date (timezone-safe). */
export function dateLabel(d: string | null | undefined): string {
  const m = d ? YMD.exec(d) : null
  if (!m) return d || '—'
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

export type StockSeverity = 'out' | 'critical' | 'low'
/** out: nothing left · critical: at or under half the minimum · low: under the minimum. */
export function stockSeverity(current: number, min: number): StockSeverity {
  const c = Number(current) || 0, m = Number(min) || 0
  if (c <= 0) return 'out'
  return c <= m * 0.5 ? 'critical' : 'low'
}

/** 'bank_transfer' → 'Bank transfer', 'cash' → 'Cash'. */
export function paymentName(raw: string | null | undefined): string {
  const s = String(raw || 'cash').replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

const MODE_COLORS: Record<string, string> = {
  cash: '#10b981', credit: '#f59e0b', bank: '#3b82f6', bank_transfer: '#3b82f6',
  online: '#818cf8', card: '#8b5cf6', cheque: '#14b8a6', upi: '#f472b6',
}
const FALLBACK = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#f472b6']
export function paymentColor(name: string, index: number): string {
  return MODE_COLORS[String(name).toLowerCase().replace(/\s+/g, '_')] ?? FALLBACK[index % FALLBACK.length]
}
