import { Search } from 'lucide-react'

export interface ReportSearchInputProps {
  value: string
  onChange: (v: string) => void
}

/**
 * NOTE: this is intentionally separate from `src/components/ui`'s shared
 * `SearchInput` — this variant is deliberately smaller (30px tall, capped at
 * 220px wide) to fit report table toolbars. Kept local rather than merged so
 * no report's spacing/behaviour changes.
 */
export function ReportSearchInput({ value, onChange }: ReportSearchInputProps) {
  return (
    <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 0, maxWidth: 220 }}>
      <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }}/>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Search…" className="erp-input"
        style={{ paddingLeft: 28, paddingRight: 8, height: 30, width: '100%', fontSize: 12 }}
      />
    </div>
  )
}
