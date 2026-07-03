import type { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { A } from '../constants'
import { CARD } from '../styles'

export interface ReportKpiCardProps {
  label: string
  value: string
  sub?: string
  icon: ReactNode
  color: string
  trend?: number
}

export function ReportKpiCard({ label, value, sub, icon, color, trend }: ReportKpiCardProps) {
  return (
    <div
      style={{ ...CARD, padding: '14px 16px', cursor: 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: trend >= 0 ? A.success : A.danger }}>
            {trend >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
