import type { ReactNode } from 'react'

/** Shell for one row rendered as a card on small screens instead of a wide table row. */
export function ReportMobileCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
    </div>
  )
}

export function ReportMobileRow({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
