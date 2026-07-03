import {
  FileText, Package, BarChart2, PieChart as PieIcon, AlertCircle, Users,
} from 'lucide-react'

// ── Accent palette (theme-invariant) ─────────────────────────────────────────
// Only semantic accent colours are hardcoded because they need to look
// correct on both light and dark backgrounds; everything else uses the
// app's CSS custom properties so it follows the active theme automatically.
export const A = {
  primary: '#2563eb',
  success: '#16a34a',
  warning: '#f59e0b',
  danger:  '#dc2626',
  purple:  '#7c3aed',
  cyan:    '#0891b2',
}

// ── Report tabs ────────────────────────────────────────────────────────────
export const REPORT_TABS = [
  { id: 'sales',     label: 'Sales',          icon: <FileText    size={14}/> },
  { id: 'purchases', label: 'Purchases',      icon: <Package     size={14}/> },
  { id: 'pnl',       label: 'Profit & Loss',  icon: <BarChart2   size={14}/> },
  { id: 'stock',     label: 'Stock',          icon: <PieIcon     size={14}/> },
  { id: 'expiry',    label: 'Expiry',         icon: <AlertCircle size={14}/> },
  { id: 'party_bal', label: 'Party Balances', icon: <Users       size={14}/> },
]

// ── Quick date ranges ──────────────────────────────────────────────────────
export const QUICK_RANGES = [
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This Week' },
  { key: 'month',   label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year',    label: 'This Year' },
]

export function getRange(key: string): [string, string] {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'today':   return [iso(now), iso(now)]
    case 'week': {  const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return [iso(d), iso(now)] }
    case 'month':   return [iso(new Date(y, m, 1)), iso(now)]
    case 'quarter': return [iso(new Date(y, Math.floor(m / 3) * 3, 1)), iso(now)]
    case 'year':    return [iso(new Date(y, 0, 1)), iso(now)]
    default:        return [iso(new Date(y, 0, 1)), iso(now)]
  }
}
