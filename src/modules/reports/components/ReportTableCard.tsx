import type { ReactNode } from 'react'
import { A } from '../constants'
import { CARD } from '../styles'

export interface ReportTableCardProps {
  title?: string
  count?: number
  badge?: string
  actions?: ReactNode
  children: ReactNode
}

export function ReportTableCard({ title, count, badge, actions, children }: ReportTableCardProps) {
  return (
    <div style={CARD}>
      {(title || actions) && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {title && <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>}
            {count !== undefined && (
              <span style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{count}</span>
            )}
            {badge && (
              <span style={{ background: A.primary + '15', color: A.primary, borderRadius: 99, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{badge}</span>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
    </div>
  )
}
