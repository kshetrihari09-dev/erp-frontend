import { fmt } from '@/utils'
import { CARD } from '../styles'

export function ReportChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ ...CARD, padding: '10px 14px', fontSize: 12, borderRadius: 10 }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {fmt(p.value)}</div>
      ))}
    </div>
  )
}
