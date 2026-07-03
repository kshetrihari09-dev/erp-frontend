import type { ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { CARD } from '../styles'

/** Inline placeholder shown inside a table body when a filtered/search result is empty. */
export function ReportEmptyRow({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <FileText size={22} color="var(--text-4)"/>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>{message}</div>
    </div>
  )
}

/** Full-card placeholder shown before a report has been generated at all. */
export function ReportNoData({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div style={{ ...CARD, padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-4)' }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{sub}</div>
    </div>
  )
}
