/**
 * IntactPackage.tsx — a whole bottle or tube on the Retail Sale bench.
 *
 * It is ONE intact object: there is no cutting code, no cut preview and no split
 * geometry here at all. Gestures:
 *   tap                → select
 *   drag (any distance) → move; release over the basket → add ONE package
 *   "Add to basket"    → same as dropping it
 * After an add the package slides back to its spot, ready for the next one.
 * A gesture can add at most once (it is closed on the first up/cancel event).
 */
import { useId, useRef, useState } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { Button } from '@/components/ui'

export interface IntactPackageProps {
  kind: 'bottle' | 'tube'
  name: string
  company?: string
  unitLabel: string                       // the product's own unit, e.g. "Bottle"
  getDropRect: () => DOMRect | null
  onAdd: () => void                       // exactly once per successful add
  onHotChange?: (hot: boolean) => void
}

const clip = (s: string | undefined, n: number) => { const t = (s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

export default function IntactPackage({ kind, name, company, unitLabel, getDropRect, onAdd, onHotChange }: IntactPackageProps) {
  const uid = useId().replace(/:/g, '')
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState(false)
  const g = useRef<{ id: number; sx: number; sy: number; moved: boolean; hot: boolean } | null>(null)

  const over = (e: React.PointerEvent) => {
    const r = getDropRect(); if (!r) return false
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  }
  const down = (e: React.PointerEvent) => {
    if (g.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    g.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, hot: false }
  }
  const move = (e: React.PointerEvent) => {
    const s = g.current; if (!s || e.pointerId !== s.id) return
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy
    if (!s.moved && Math.hypot(dx, dy) > 6) { s.moved = true; setDragging(true) }
    if (s.moved) {
      setOff({ x: dx, y: dy })
      const hot = over(e); if (hot !== s.hot) { s.hot = hot; onHotChange?.(hot) }
    }
  }
  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const s = g.current; if (!s || e.pointerId !== s.id) return
    g.current = null                         // closed: a repeated event cannot act twice
    if (s.hot) onHotChange?.(false)
    setDragging(false); setOff({ x: 0, y: 0 })
    if (cancelled) return
    if (!s.moved) setSelected(v => !v)
    else if (over(e)) { setSelected(false); onAdd() }
  }

  const tube = kind === 'tube'
  const nm = clip(name, 24), co = clip(company, 26)
  const nmSize = nm.length > 16 ? 9 : 11
  const id = (s: string) => `${s}-${uid}`

  return (
    <div>
      <div className="rounded-xl flex items-center justify-center select-none" style={{ background: '#3b4a57', height: 280, overflow: 'hidden' }}>
        <div
          role="button" aria-label={`${kind} — drag to the basket`} tabIndex={0}
          onPointerDown={down} onPointerMove={move}
          onPointerUp={e => end(e, false)} onPointerCancel={e => end(e, true)}
          onContextMenu={e => e.preventDefault()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd() } }}
          style={{
            touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', WebkitUserSelect: 'none',
            transform: `translate(${off.x}px, ${off.y}px) scale(${dragging ? 1.05 : 1})`,
            transition: dragging ? 'none' : 'transform .25s ease', outline: selected ? '2px dashed #ffd24a' : 'none', outlineOffset: 6, borderRadius: 12,
            filter: dragging ? 'drop-shadow(0 14px 14px rgba(0,0,0,.45))' : 'drop-shadow(0 6px 6px rgba(0,0,0,.35))',
          }}
        >
          <svg width="150" height="225" viewBox="0 0 160 240" aria-hidden="true" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={id('amber')} x1="0" x2="1"><stop offset="0" stopColor="#a95a10" /><stop offset=".3" stopColor="#e8952e" /><stop offset=".55" stopColor="#d6821f" /><stop offset="1" stopColor="#8f4b0c" /></linearGradient>
              <linearGradient id={id('cap')} x1="0" x2="1"><stop offset="0" stopColor="#c9d3dc" /><stop offset=".4" stopColor="#ffffff" /><stop offset="1" stopColor="#aab4bd" /></linearGradient>
              <linearGradient id={id('tube')} x1="0" x2="1"><stop offset="0" stopColor="#d5dbe1" /><stop offset=".35" stopColor="#ffffff" /><stop offset=".7" stopColor="#eef1f4" /><stop offset="1" stopColor="#c3cad1" /></linearGradient>
              <linearGradient id={id('crimp')} x1="0" x2="1"><stop offset="0" stopColor="#9aa4ad" /><stop offset=".5" stopColor="#e3e8ec" /><stop offset="1" stopColor="#8b959e" /></linearGradient>
            </defs>

            {!tube ? (
              <g>
                <ellipse cx="80" cy="230" rx="52" ry="6" fill="rgba(0,0,0,.25)" />
                <rect x="50" y="8" width="60" height="40" rx="7" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
                {[58, 66, 74, 82, 90, 98].map(x => <line key={x} x1={x} y1="12" x2={x} y2="44" stroke="#aab4bd" strokeWidth="1.2" />)}
                <rect x="60" y="48" width="40" height="14" fill={`url(#${id('amber')})`} />
                <path d="M60 62 C60 76 28 80 28 102 L28 212 Q28 226 42 226 L118 226 Q132 226 132 212 L132 102 C132 80 100 76 100 62 Z" fill={`url(#${id('amber')})`} stroke="#7a420a" strokeWidth="1.2" />
                <rect x="38" y="84" width="7" height="130" rx="3.5" fill="rgba(255,255,255,.28)" />
                <rect x="28" y="108" width="104" height="94" fill="#fdfdfb" stroke="#c9c9c2" />
                <rect x="28" y="108" width="104" height="17" fill="#0b7a75" />
                <text x="80" y="120" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
                <text x="80" y="150" textAnchor="middle" fontSize={nmSize} fontWeight="700" fill="#16202a">{nm}</text>
                <text x="80" y="165" textAnchor="middle" fontSize="7.5" fill="#556270">{co}</text>
                <rect x="52" y="178" width="56" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
                <text x="80" y="188.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">1 {clip(unitLabel, 10).toUpperCase()}</text>
              </g>
            ) : (
              <g>
                <ellipse cx="80" cy="233" rx="54" ry="5" fill="rgba(0,0,0,.25)" />
                <rect x="62" y="8" width="36" height="34" rx="5" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
                {[68, 74, 80, 86, 92].map(x => <line key={x} x1={x} y1="11" x2={x} y2="39" stroke="#aab4bd" strokeWidth="1" />)}
                <path d="M62 42 L98 42 L132 86 L28 86 Z" fill={`url(#${id('tube')})`} stroke="#9aa4ad" />
                <rect x="28" y="86" width="104" height="124" fill={`url(#${id('tube')})`} stroke="#9aa4ad" />
                <rect x="28" y="86" width="104" height="22" fill="#0b7a75" opacity=".92" />
                <text x="80" y="101" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
                <text x="80" y="136" textAnchor="middle" fontSize={nmSize} fontWeight="700" fill="#16202a">{nm}</text>
                <text x="80" y="151" textAnchor="middle" fontSize="7.5" fill="#556270">{co}</text>
                <rect x="52" y="166" width="56" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
                <text x="80" y="176.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">1 {clip(unitLabel, 10).toUpperCase()}</text>
                <rect x="36" y="94" width="6" height="108" rx="3" fill="rgba(255,255,255,.35)" />
                <rect x="28" y="210" width="104" height="16" fill={`url(#${id('crimp')})`} stroke="#7d8790" />
                {[213, 217, 221].map(y => <line key={y} x1="30" y1={y} x2="130" y2={y} stroke="#7d8790" strokeWidth=".8" />)}
              </g>
            )}
          </svg>
        </div>
      </div>
      {selected && (
        <div className="mt-2">
          <Button variant="primary" size="sm" icon={<ShoppingBasket size={15} />} onClick={() => { setSelected(false); onAdd() }}>
            Add 1 {unitLabel.toLowerCase()} to basket
          </Button>
        </div>
      )}
    </div>
  )
}
