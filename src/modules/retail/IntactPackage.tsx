/**
 * IntactPackage.tsx — one whole, uncut package on the Retail Sale bench: bottle, tube, vial,
 * ampoule, sachet, box, piece (Pcs), or a Kg sack / Ltr container.
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

export type PackageKind = 'bottle' | 'tube' | 'vial' | 'ampoule' | 'sachet' | 'box' | 'piece' | 'kg' | 'ltr'

export interface IntactPackageProps {
  kind: PackageKind
  name: string
  company?: string
  unitLabel: string                       // the product's own unit, e.g. "Bottle"
  chip?: string                           // text on the label's pill (default "1 <UNIT>")
  addLabel?: string                       // text of the Add button (default "Add 1 <unit> to basket")
  getDropRect: () => DOMRect | null
  onAdd: () => void                       // exactly once per successful add
  onHotChange?: (hot: boolean) => void
}

const clip = (s: string | undefined, n: number) => { const t = (s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

export default function IntactPackage({ kind, name, company, unitLabel, chip, addLabel, getDropRect, onAdd, onHotChange }: IntactPackageProps) {
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

  const nm = clip(name, 24), co = clip(company, 26)
  const nmSize = nm.length > 16 ? 9 : 11
  const id = (k: string) => `${k}-${uid}`
  const pill = clip(chip ?? `1 ${unitLabel}`, 14).toUpperCase()

  /** The printed label: banner, name, maker, and a pill with the quantity/unit. */
  const Label = ({ x, y, w, h, band = '#0b7a75', small = false }: { x: number; y: number; w: number; h: number; band?: string; small?: boolean }) => {
    const cx = x + w / 2, n = small ? clip(name, 13) : nm, size = small ? 8 : nmSize
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="#fdfdfb" stroke="#c9c9c2" />
        <rect x={x} y={y} width={w} height="15" fill={band} />
        <text x={cx} y={y + 10.5} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" letterSpacing="1.5">MEDICINE</text>
        <text x={cx} y={y + 33} textAnchor="middle" fontSize={size} fontWeight="700" fill="#16202a">{n}</text>
        {!small && <text x={cx} y={y + 46} textAnchor="middle" fontSize="7" fill="#556270">{co}</text>}
        <rect x={cx - 27} y={y + h - 22} width="54" height="14" rx="7" fill="#e8f3f2" stroke="#0b7a75" />
        <text x={cx} y={y + h - 12} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#0b7a75">{pill}</text>
      </g>
    )
  }
  const Shadow = ({ rx = 52 }: { rx?: number }) => <ellipse cx="80" cy="231" rx={rx} ry="5.5" fill="rgba(0,0,0,.25)" />

  const art = (() => {
    switch (kind) {
      case 'bottle': return (
        <g>
          <Shadow />
          <rect x="50" y="8" width="60" height="40" rx="7" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
          {[58, 66, 74, 82, 90, 98].map(x => <line key={x} x1={x} y1="12" x2={x} y2="44" stroke="#aab4bd" strokeWidth="1.2" />)}
          <rect x="60" y="48" width="40" height="14" fill={`url(#${id('amber')})`} />
          <path d="M60 62 C60 76 28 80 28 102 L28 212 Q28 226 42 226 L118 226 Q132 226 132 212 L132 102 C132 80 100 76 100 62 Z" fill={`url(#${id('amber')})`} stroke="#7a420a" strokeWidth="1.2" />
          <rect x="38" y="84" width="7" height="130" rx="3.5" fill="rgba(255,255,255,.28)" />
          <Label x={28} y={108} w={104} h={94} />
        </g>)
      case 'tube': return (
        <g>
          <Shadow rx={54} />
          <rect x="62" y="8" width="36" height="34" rx="5" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
          {[68, 74, 80, 86, 92].map(x => <line key={x} x1={x} y1="11" x2={x} y2="39" stroke="#aab4bd" strokeWidth="1" />)}
          <path d="M62 42 L98 42 L132 86 L28 86 Z" fill={`url(#${id('tube')})`} stroke="#9aa4ad" />
          <rect x="28" y="86" width="104" height="124" fill={`url(#${id('tube')})`} stroke="#9aa4ad" />
          <rect x="28" y="86" width="104" height="22" fill="#0b7a75" opacity=".92" />
          <text x="80" y="101" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
          <text x="80" y="136" textAnchor="middle" fontSize={nmSize} fontWeight="700" fill="#16202a">{nm}</text>
          <text x="80" y="151" textAnchor="middle" fontSize="7.5" fill="#556270">{co}</text>
          <rect x="53" y="166" width="54" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
          <text x="80" y="176.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
          <rect x="36" y="94" width="6" height="108" rx="3" fill="rgba(255,255,255,.35)" />
          <rect x="28" y="210" width="104" height="16" fill={`url(#${id('crimp')})`} stroke="#7d8790" />
          {[213, 217, 221].map(y => <line key={y} x1="30" y1={y} x2="130" y2={y} stroke="#7d8790" strokeWidth=".8" />)}
        </g>)
      case 'vial': return (
        <g>
          <Shadow rx={44} />
          <rect x="58" y="12" width="44" height="18" rx="5" fill="#c0392b" stroke="#8e2a20" />
          <rect x="54" y="30" width="52" height="16" rx="3" fill={`url(#${id('crimp')})`} stroke="#7d8790" />
          <rect x="62" y="46" width="36" height="20" fill={`url(#${id('glass')})`} stroke="#8fb3c4" />
          <path d="M62 66 C62 80 40 84 40 100 L40 206 Q40 220 54 220 L106 220 Q120 220 120 206 L120 100 C120 84 98 80 98 66 Z" fill={`url(#${id('glass')})`} stroke="#8fb3c4" strokeWidth="1.2" />
          <rect x="42" y="150" width="76" height="68" rx="6" fill="rgba(190,225,240,.55)" />
          <rect x="47" y="88" width="6" height="120" rx="3" fill="rgba(255,255,255,.55)" />
          <Label x={40} y={104} w={80} h={84} small />
        </g>)
      case 'ampoule': return (
        <g>
          <Shadow rx={34} />
          <path d="M80 6 L86 20 L86 74 C86 86 108 92 108 114 L108 198 C108 216 98 226 80 226 C62 226 52 216 52 198 L52 114 C52 92 74 86 74 74 L74 20 Z" fill={`url(#${id('glass')})`} stroke="#8fb3c4" strokeWidth="1.2" />
          <rect x="74" y="56" width="12" height="9" fill="#d9534f" />
          <rect x="52" y="150" width="56" height="70" rx="22" fill="rgba(190,225,240,.5)" />
          <rect x="57" y="104" width="5" height="100" rx="2.5" fill="rgba(255,255,255,.6)" />
          <Label x={54} y={112} w={52} h={74} small />
        </g>)
      case 'sachet': return (
        <g>
          <Shadow rx={56} />
          <rect x="24" y="14" width="112" height="208" rx="3" fill={`url(#${id('foil')})`} stroke="#8e99a3" />
          {Array.from({ length: 14 }, (_, i) => <line key={'t' + i} x1={30 + i * 7.6} y1="14" x2={30 + i * 7.6} y2="34" stroke="#9aa4ad" strokeWidth=".9" />)}
          {Array.from({ length: 14 }, (_, i) => <line key={'b' + i} x1={30 + i * 7.6} y1="202" x2={30 + i * 7.6} y2="222" stroke="#9aa4ad" strokeWidth=".9" />)}
          <path d="M24 44 L34 49 L24 54" fill="none" stroke="#7d8790" strokeWidth="1.2" />
          <Label x={34} y={66} w={92} h={112} />
        </g>)
      case 'box': return (
        <g>
          <Shadow rx={58} />
          <polygon points="24,52 48,36 136,36 112,52" fill="#e9f4f3" stroke="#9fb7b5" />
          <polygon points="112,52 136,36 136,206 112,222" fill="#bfd9d6" stroke="#9fb7b5" />
          <rect x="24" y="52" width="88" height="170" fill="#ffffff" stroke="#9fb7b5" />
          <rect x="24" y="52" width="88" height="24" fill="#0b7a75" />
          <text x="68" y="68" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
          <text x="68" y="112" textAnchor="middle" fontSize={nm.length > 14 ? 8.5 : 10.5} fontWeight="700" fill="#16202a">{clip(name, 20)}</text>
          <text x="68" y="126" textAnchor="middle" fontSize="7" fill="#556270">{co}</text>
          <rect x="41" y="190" width="54" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
          <text x="68" y="200.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
        </g>)
      case 'piece': return (
        <g>
          <Shadow rx={50} />
          <rect x="32" y="16" width="96" height="206" rx="9" fill="#ffffff" stroke="#b8c2cb" />
          <rect x="70" y="24" width="20" height="9" rx="4.5" fill="#3b4a57" opacity=".35" />
          <rect x="32" y="40" width="96" height="20" fill="#0b7a75" />
          <text x="80" y="54" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
          <text x="80" y="96" textAnchor="middle" fontSize={nmSize} fontWeight="700" fill="#16202a">{nm}</text>
          <text x="80" y="110" textAnchor="middle" fontSize="7" fill="#556270">{co}</text>
          <rect x="53" y="124" width="54" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
          <text x="80" y="134.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
          {Array.from({ length: 22 }, (_, i) => <rect key={i} x={44 + i * 3.6} y="168" width={i % 3 === 0 ? 2.4 : 1.2} height="38" fill="#16202a" />)}
        </g>)
      case 'kg': return (
        <g>
          <Shadow rx={58} />
          <path d="M58 20 L102 20 L98 44 C132 56 140 92 138 140 L136 212 Q136 224 124 224 L36 224 Q24 224 24 212 L22 140 C20 92 28 56 62 44 Z" fill={`url(#${id('kraft')})`} stroke="#8a6a38" strokeWidth="1.2" />
          <rect x="54" y="38" width="52" height="9" rx="4" fill="#7a5a2b" />
          <path d="M30 70 C40 60 50 56 60 52" stroke="rgba(255,255,255,.25)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <Label x={36} y={96} w={88} h={100} />
        </g>)
      case 'ltr': return (
        <g>
          <Shadow rx={54} />
          <path d="M120 70 C146 70 150 96 138 118 L132 130" fill="none" stroke="#5b8fd1" strokeWidth="9" strokeLinecap="round" />
          <rect x="30" y="70" width="100" height="152" rx="16" fill={`url(#${id('blue')})`} stroke="#4a7bbd" strokeWidth="1.2" />
          <path d="M30 86 Q80 62 130 86" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="6" strokeLinecap="round" />
          <rect x="62" y="40" width="36" height="32" rx="5" fill="#1f5fbf" stroke="#174a94" />
          {[68, 74, 80, 86, 92].map(x => <line key={x} x1={x} y1="44" x2={x} y2="68" stroke="#4a7bbd" strokeWidth="1" />)}
          <Label x={38} y={104} w={84} h={96} />
        </g>)
    }
  })()

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
              <linearGradient id={id('glass')} x1="0" x2="1"><stop offset="0" stopColor="#a9c9d8" stopOpacity=".75" /><stop offset=".35" stopColor="#eef8fc" stopOpacity=".85" /><stop offset="1" stopColor="#9bbccb" stopOpacity=".8" /></linearGradient>
              <linearGradient id={id('foil')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6ebef" /><stop offset=".45" stopColor="#ffffff" /><stop offset="1" stopColor="#c4ccd3" /></linearGradient>
              <linearGradient id={id('kraft')} x1="0" x2="1"><stop offset="0" stopColor="#b98c4f" /><stop offset=".4" stopColor="#d9b377" /><stop offset="1" stopColor="#a47a41" /></linearGradient>
              <linearGradient id={id('blue')} x1="0" x2="1"><stop offset="0" stopColor="#7fb0ec" /><stop offset=".4" stopColor="#dbeafe" /><stop offset="1" stopColor="#6aa0e0" /></linearGradient>
              <linearGradient id={id('crimp')} x1="0" x2="1"><stop offset="0" stopColor="#9aa4ad" /><stop offset=".5" stopColor="#e3e8ec" /><stop offset="1" stopColor="#8b959e" /></linearGradient>
            </defs>

            {art}
          </svg>
        </div>
      </div>
      {selected && (
        <div className="mt-2">
          <Button variant="primary" size="sm" icon={<ShoppingBasket size={15} />} onClick={() => { setSelected(false); onAdd() }}>
            {addLabel ?? `Add 1 ${unitLabel.toLowerCase()} to basket`}
          </Button>
        </div>
      )}
    </div>
  )
}
