import type { ReactNode } from 'react'
import { CheckCircle, Clock, XCircle, MinusCircle } from 'lucide-react'

interface StatusConfigEntry { bg: string; color: string; icon?: ReactNode; label: string }

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  active:    { bg: 'rgba(22,163,74,0.12)',  color: '#15803d',      icon: <CheckCircle size={10}/>,  label: 'Active' },
  paid:      { bg: 'rgba(22,163,74,0.12)',  color: '#15803d',      icon: <CheckCircle size={10}/>,  label: 'Paid' },
  pending:   { bg: 'rgba(245,158,11,0.12)', color: '#b45309',      icon: <Clock size={10}/>,        label: 'Pending' },
  draft:     { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-3)', icon: <MinusCircle size={10}/>, label: 'Draft' },
  cancelled: { bg: 'rgba(220,38,38,0.1)',   color: '#b91c1c',      icon: <XCircle size={10}/>,      label: 'Cancelled' },
  credit:    { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Credit' },
  cash:      { bg: 'rgba(22,163,74,0.12)',  color: '#15803d', label: 'Cash' },
  bank:      { bg: 'rgba(37,99,235,0.12)',  color: '#1d4ed8', label: 'Bank' },
  card:      { bg: 'rgba(124,58,237,0.12)', color: '#6d28d9', label: 'Card' },
  online:    { bg: 'rgba(8,145,178,0.12)',  color: '#0e7490', label: 'Online' },
}

export function ReportStatusBadge({ value }: { value: string }) {
  const key = (value || '').toLowerCase()
  const cfg = STATUS_CONFIG[key] || { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-3)', label: value }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {cfg.icon}{cfg.label || value}
    </span>
  )
}
