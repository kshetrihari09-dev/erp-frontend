import { useState } from 'react'
import { X, Search, RefreshCw } from 'lucide-react'
import { DateRangeFilter } from '@/components/ui/DateRangePopup'
import { A, QUICK_RANGES, getRange } from '../constants'
import { CARD } from '../styles'
import { useWindowWidth } from '../hooks'

export interface ReportFilterBarProps {
  dateFrom: string
  dateTo: string
  loading: boolean
  onDateChange: (k: 'from' | 'to', v: string) => void
  onGenerate: () => void
  /** Called after "Set" in the Date Range popup with the validated AD range, so the tab can refresh its report. */
  onRangeSet?: (range: { from: string; to: string }) => void
  onReset: () => void
}

export function ReportFilterBar({ dateFrom, dateTo, loading, onDateChange, onGenerate, onRangeSet, onReset }: ReportFilterBarProps) {
  const [active, setActive] = useState('year')
  const isMobile = useWindowWidth() <= 640

  function applyRange(key: string) {
    setActive(key)
    const [f, t] = getRange(key)
    onDateChange('from', f); onDateChange('to', t)
  }

  return (
    <div style={{ ...CARD, padding: '12px 14px', marginBottom: 16 }}>
      {/* Quick range pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {QUICK_RANGES.map(r => (
          <button key={r.key} onClick={() => applyRange(r.key)} style={{
            padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${active === r.key ? A.primary : 'var(--border)'}`,
            background: active === r.key ? A.primary + '12' : 'transparent',
            color: active === r.key ? A.primary : 'var(--text-2)',
            transition: 'all 0.15s', fontFamily: 'var(--font)',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Date pickers + action buttons */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DateRangeFilter fromAD={dateFrom} toAD={dateTo} onApply={r => {
            setActive('custom')
            onDateChange('from', r.fromAD); onDateChange('to', r.toAD)
            onRangeSet?.({ from: r.fromAD, to: r.toAD })
          }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onReset} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}>
            <X size={12}/> Reset
          </button>
          <button onClick={onGenerate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}>
            {loading ? <RefreshCw size={12} className="animate-spin"/> : <Search size={12}/>}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
