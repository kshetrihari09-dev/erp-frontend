import type { ReactNode } from 'react'
import { A } from '../constants'
import { TD } from '../styles'

export function MonoCell({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: color || A.primary }}>
      {children}
    </td>
  )
}

export function SkeletonTable({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>{Array.from({ length: rows }, (_, i) => (
      <tr key={i}>
        {Array.from({ length: cols }, (_, j) => (
          <td key={j} style={TD}>
            <div style={{ height: 14, borderRadius: 4, background: 'var(--surface-3)', width: j === 1 ? '60%' : '80%' }}/>
          </td>
        ))}
      </tr>
    ))}</>
  )
}
