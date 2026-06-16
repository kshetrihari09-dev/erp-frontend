import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ─── Tailwind merge helper ─────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency formatting ──────────────────────────────────────────────────────
export const fmtN = (n: number | string | null | undefined, decimals = 2) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

/**
 * fmt — format a number with commas, NO currency symbol.
 * Strips trailing .00 for whole numbers.
 * Examples:  43537.5  → "43,537.50"
 *            43537    → "43,537"
 *            1000000  → "10,00,000"
 */
export const fmt = (n: number | string | null | undefined): string => {
  const num = Number(n || 0)
  // If whole number, show no decimals
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  // Otherwise show up to 2 decimal places, strip trailing zeros
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * fmtCompact — abbreviate large numbers for KPI cards.
 * 1,250,000 → "12.5L"  |  100,000 → "1.0L"  |  9,500 → "9,500"
 */
export const fmtCompact = (n: number | string | null | undefined): string => {
  const num = Number(n || 0)
  if (num >= 10_000_000) return `${(num / 10_000_000).toFixed(1)}Cr`
  if (num >= 100_000)    return `${(num / 100_000).toFixed(1)}L`
  if (num >= 1_000)      return num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

// ─── Date formatting ──────────────────────────────────────────────────────────
export const fmtDate = (d: string | null | undefined, fallback = '—') =>
  d ? new Date(d).toLocaleDateString('en-NP') : fallback

export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-NP') : '—'

export const today = () => new Date().toISOString().split('T')[0]

// ─── Invoice math ─────────────────────────────────────────────────────────────
export interface InvoiceRow {
  qty:           number
  rate:          number
  bonus?:        number
  discount_pct?: number
  cc_pct?:       number
}

/**
 * calcRowAmount — single source of truth for invoice line math.
 *
 * Formula:
 *   base      = qty × rate × (1 − discount_pct / 100)
 *   cc_amount = bonus_qty × rate × (cc_pct / 100)   ← CC on bonus qty only
 *   amount    = base + cc_amount                     ← line total
 *
 * CC (Custom Charge) applies to the BONUS quantity, not the sold quantity.
 * bonus and cc_pct are treated as 0 when empty/null to prevent NaN.
 */
export function calcRowAmount(row: InvoiceRow): { amount: number; cc_amount: number } {
  const qty    = Number(row.qty          || 0)
  const rate   = Number(row.rate         || 0)
  const bonus  = Number(row.bonus        || 0)   // bonus qty drives cc_amount
  const disc   = Number(row.discount_pct || 0)
  const cc_pct = Number(row.cc_pct       || 0)   // whole number e.g. 10 = 10%
  const base     = qty * rate * (1 - disc / 100)
  // cc_amount = bonus_qty × rate × (cc_pct / 100.0)
  const cc_amt   = bonus > 0 && cc_pct > 0
    ? +( bonus * rate * (cc_pct / 100) ).toFixed(4)
    : 0
  const amount   = +( base + cc_amt ).toFixed(2)

  return { amount, cc_amount: +cc_amt.toFixed(2) }
}

export function calcInvoiceTotals(rows: InvoiceRow[], discountPct = 0) {
  const subtotal     = rows.reduce((s, r) => s + calcRowAmount(r).amount, 0)
  const discountAmt  = subtotal * (discountPct / 100)
  const netTotal     = subtotal - discountAmt
  return { subtotal, discountAmt, netTotal }
}

// ─── Slug / initials ──────────────────────────────────────────────────────────
export const initials = (name?: string) =>
  name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

// ─── Debounce ─────────────────────────────────────────────────────────────────
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ─── Download helpers ─────────────────────────────────────────────────────────
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  const keys  = Object.keys(data[0] || {})
  const rows  = [keys.join(','), ...data.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))]
  const blob  = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href = url; a.download = `${filename}.csv`
  a.click(); URL.revokeObjectURL(url)
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${filename}.json`
  a.click(); URL.revokeObjectURL(url)
}

// ─── Print helper ─────────────────────────────────────────────────────────────
export function printElement(htmlContent: string) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  win.document.write(`
    <!DOCTYPE html><html>
    <head>
      <meta charset="utf-8"/>
      <title>Print</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; font-size: 12px; }
        @media print { @page { margin: 10mm; } }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// ─── Status colors ────────────────────────────────────────────────────────────
export const statusColor = (status: string) => {
  const map: Record<string, string> = {
    active:    'badge-green',
    posted:    'badge-green',
    cancelled: 'badge-red',
    returned:  'badge-red',
    draft:     'badge-amber',
    credit:    'badge-purple',
    cash:      'badge-blue',
    pending:   'badge-amber',
    locked:    'badge-red',
    open:      'badge-green',
  }
  return map[status?.toLowerCase()] || 'badge-muted'
}
