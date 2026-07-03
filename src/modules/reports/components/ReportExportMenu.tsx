import { useState } from 'react'
import { Download, Printer, ChevronDown } from 'lucide-react'
import { CARD } from '../styles'

export interface ReportExportMenuProps {
  onCSV: () => void
  onPrint: () => void
}

export function ReportExportMenu({ onCSV, onPrint }: ReportExportMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <Download size={13}/> Export <ChevronDown size={12}/>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}/>
          <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, ...CARD, borderRadius: 12, padding: 6, minWidth: 140 }}>
            {[
              { label: 'Export CSV', icon: <Download size={13}/>, fn: () => { onCSV(); setOpen(false) } },
              { label: 'Print',      icon: <Printer  size={13}/>, fn: () => { onPrint(); setOpen(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.fn}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--text)', textAlign: 'left', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
