/**
 * IntactPackage.tsx — one whole, uncut package on the Retail Sale bench: bottle, tube, vial,
 * ampoule, sachet, box, piece (Pcs), or a Kg sack / Ltr container — drawn with glass,
 * metal, wrapped labels, liquid and highlights so each reads as the real thing.
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

  /** The printed label: banner, name, maker, pill. `curved` shades the edges like a label wrapped round a cylinder. */
  const Label = ({ x, y, w, h, band = '#0b7a75', small = false, curved = false }: { x: number; y: number; w: number; h: number; band?: string; small?: boolean; curved?: boolean }) => {
    const cx = x + w / 2, n = small ? clip(name, 13) : nm, size = small ? 8 : nmSize
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${id('paper')})`} stroke="#c9c9c2" strokeWidth=".8" />
        <rect x={x} y={y} width={w} height="15" fill={band} />
        <rect x={x} y={y + 15} width={w} height="1.2" fill="rgba(0,0,0,.18)" />
        <text x={cx} y={y + 10.5} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" letterSpacing="1.5">MEDICINE</text>
        <text x={cx} y={y + 33} textAnchor="middle" fontSize={size} fontWeight="700" fill="#16202a">{n}</text>
        {!small && <text x={cx} y={y + 46} textAnchor="middle" fontSize="7" fill="#556270">{co}</text>}
        {!small && <g opacity=".35">{[0, 1, 2].map(i => <rect key={i} x={x + 10} y={y + 54 + i * 5} width={w - 20 - (i === 2 ? 24 : 0)} height="1.6" rx=".8" fill="#6b7782" />)}</g>}
        <rect x={cx - 27} y={y + h - 22} width="54" height="14" rx="7" fill="#e8f3f2" stroke="#0b7a75" />
        <text x={cx} y={y + h - 12} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#0b7a75">{pill}</text>
        {curved && <rect x={x} y={y} width={w} height={h} fill={`url(#${id('wrap')})`} />}
      </g>
    )
  }
  const Shadow = ({ rx = 52 }: { rx?: number }) => <ellipse cx="80" cy="231" rx={rx} ry="6" fill={`url(#${id('floor')})`} />
  const Glint = ({ x, y, w, h, o = 0.55 }: { x: number; y: number; w: number; h: number; o?: number }) =>
    <rect x={x} y={y} width={w} height={h} rx={w / 2} fill="#fff" opacity={o} filter={`url(#${id('soft')})`} />

  const art = (() => {
    switch (kind) {
      case 'bottle': return (
        <g>
          <Shadow />
          <path d="M60 62 C60 76 28 80 28 102 L28 212 Q28 226 42 226 L118 226 Q132 226 132 212 L132 102 C132 80 100 76 100 62 Z" fill={`url(#${id('amber')})`} stroke="#6b3607" strokeWidth="1.2" />
          <path d="M28 204 L132 204 L132 212 Q132 226 118 226 L42 226 Q28 226 28 212 Z" fill="#2e1600" opacity=".35" />
          <path d="M32 99 Q80 108 128 99" fill="none" stroke="#5a2d04" strokeWidth=".9" opacity=".55" />
          <path d="M32 102 Q80 111 128 102" fill="none" stroke="#fff" strokeWidth=".7" opacity=".25" />
          <rect x="60" y="48" width="40" height="16" fill={`url(#${id('amber')})`} />
          {[51, 56, 61].map(y => <line key={y} x1="60" y1={y} x2="100" y2={y + 3} stroke="#4f2703" strokeWidth="1.1" opacity=".5" />)}
          <Label x={28} y={108} w={104} h={94} curved />
          <Glint x={34} y={84} w={9} h={124} o={0.4} />
          <Glint x={119} y={96} w={3.5} h={106} o={0.2} />
          <rect x="49" y="42" width="62" height="8" rx="2" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
          {[58, 70, 82, 94, 104].map(x => <line key={x} x1={x} y1="43" x2={x} y2="49" stroke="#8e99a3" strokeWidth="1" />)}
          <rect x="48" y="8" width="64" height="36" rx="8" fill={`url(#${id('cap')})`} stroke="#8e99a3" />
          {Array.from({ length: 14 }, (_, i) => <line key={i} x1={53 + i * 4} y1="13" x2={53 + i * 4} y2="40" stroke={i % 2 ? '#c4ccd3' : '#98a4ae'} strokeWidth="1.4" />)}
          <rect x="54" y="10" width="52" height="4" rx="2" fill="#fff" opacity=".85" />
          <rect x="48" y="36" width="64" height="8" rx="4" fill="#000" opacity=".08" />
        </g>)
      case 'tube': return (
        <g>
          <defs><clipPath id={id('tc')}><path d="M53 62 Q53 58 58 58 L102 58 Q107 58 107 62 C107 130 110 190 114 214 L46 214 C50 190 53 130 53 62 Z" /></clipPath></defs>
          <Shadow rx={42} />
          {/* body: flat three-tone cream, flaring toward the crimp */}
          <g clipPath={`url(#${id('tc')})`}>
            <rect x="40" y="56" width="80" height="160" fill="#f6f2e8" />
            <path d="M77 56 L96 56 L99 216 L74 216 Z" fill="#e3ded2" />
            <path d="M96 56 L120 56 L120 216 L99 216 Z" fill="#cdc8bb" />
            <rect x="57" y="62" width="17" height="136" rx="8" fill="#fbf9f3" opacity=".75" />
            {/* blue band, same three tones */}
            <rect x="40" y="78" width="80" height="33" fill="#4d82c6" />
            <path d="M77 78 L96 78 L96 111 L77 111 Z" fill="#3a6aa8" />
            <rect x="96" y="78" width="24" height="33" fill="#2c527f" />
          </g>
          <path d="M53 62 C53 130 50 190 46 214 M107 62 C107 130 110 190 114 214" fill="none" stroke="#b9b4a6" strokeWidth=".8" />
          <text x="80" y="98" textAnchor="middle" fontSize="6.6" fontWeight="700" fill="#fff" letterSpacing="1.4">MEDICINE</text>
          {(() => {
            const [w1, ...rest] = (name || '').trim().split(/\s+/)
            return (
              <g>
                <text x="80" y="134" textAnchor="middle" fontSize="7.4" fontWeight="700" fill="#16202a">{clip(w1, 11)}</text>
                {rest.length > 0 && <text x="80" y="144" textAnchor="middle" fontSize="6.2" fontWeight="600" fill="#334150">{clip(rest.join(' '), 12)}</text>}
                <text x="80" y="153" textAnchor="middle" fontSize="4.8" fill="#5d6874">{clip(company, 16)}</text>
                <rect x="59" y="162" width="42" height="12" rx="6" fill="#e8f3f2" stroke="#0b7a75" strokeWidth=".9" />
                <text x="80" y="170.4" textAnchor="middle" fontSize="6" fontWeight="700" fill="#0b7a75">{clip(pill, 10)}</text>
              </g>
            )
          })()}
          {/* rim where the cap sits */}
          <ellipse cx="80" cy="58.5" rx="26.5" ry="4.4" fill="#ebe7dd" />
          <path d="M80 62.9 C95 62.9 106.5 61.5 106.5 58.5 C106.5 61 95 62 80 62 Z" fill="#cdc8bb" opacity=".6" />
          {/* flat crimp at the foot */}
          <rect x="46" y="214" width="68" height="14" fill="#dcd8cc" />
          <rect x="68" y="214" width="25" height="14" fill="#e8e5db" />
          <rect x="93" y="214" width="21" height="14" fill="#cdc8bb" />
          <rect x="46" y="214" width="68" height="2.2" fill="#000" opacity=".12" />
          {/* ribbed cone cap */}
          <path d="M68 9 L65.5 56 Q80 61 94.5 56 L91.5 9 Z" fill={`url(#${id('tcap')})`} />
          {Array.from({ length: 12 }, (_, i) => <line key={i} x1={69 + i * 1.9} y1="10" x2={66.8 + i * 2.35} y2="57" stroke={i % 2 ? '#e4e1d8' : '#aaa699'} strokeWidth=".8" opacity=".85" />)}
          <ellipse cx="79.7" cy="9" rx="11.8" ry="3.3" fill="#dedad0" stroke="#bdb9ad" strokeWidth=".6" />
        </g>)
      case 'vial': return (
        <g>
          <defs><clipPath id={id('vc')}><path d="M62 66 C62 80 40 84 40 100 L40 206 Q40 220 54 220 L106 220 Q120 220 120 206 L120 100 C120 84 98 80 98 66 Z" /></clipPath></defs>
          <Shadow rx={44} />
          <path d="M60 46 L100 46 L100 66 C100 80 122 84 122 100 L122 206 Q122 222 106 222 L54 222 Q38 222 38 206 L38 100 C38 84 60 80 60 66 Z" fill={`url(#${id('glass')})`} stroke="#7fa6b9" strokeWidth="1.2" />
          <g clipPath={`url(#${id('vc')})`}>
            <rect x="38" y="97" width="86" height="130" fill={`url(#${id('liq')})`} />
            <ellipse cx="80" cy="97" rx="39" ry="3.2" fill="#e9f7fc" opacity=".85" />
            <rect x="38" y="205" width="86" height="17" fill="#2b5a70" opacity=".16" />
            {[[52, 200, 1.6], [112, 196, 1.2], [100, 205, 1.4], [58, 110, 1]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity=".55" />)}
          </g>
          <Label x={40} y={116} w={80} h={76} small curved />
          <Glint x={45} y={84} w={6} h={124} o={0.6} />
          <Glint x={112} y={104} w={3} h={96} o={0.3} />
          <rect x="52" y="22" width="56" height="26" rx="3" fill={`url(#${id('metal')})`} stroke="#6f7983" />
          {[26, 30, 34, 38, 42].map(y => <line key={y} x1="53" y1={y} x2="107" y2={y} stroke="#7d8790" strokeWidth=".7" opacity=".7" />)}
          <path d="M52 44 Q80 52 108 44" fill="none" stroke="#6f7983" strokeWidth="1" />
          <rect x="58" y="9" width="44" height="16" rx="5" fill={`url(#${id('flip')})`} stroke="#8e2a20" />
          <ellipse cx="80" cy="13" rx="16" ry="2.4" fill="#fff" opacity=".45" />
        </g>)
      case 'ampoule': return (
        <g>
          <Shadow rx={30} />
          {/* amber glass: rounded bulb head, pinched neck, flared shoulder, straight body, rounded base */}
          <path d="M80 6 C74 6 69.5 11 69 20 C68.5 32 64.5 44 64.5 57 C64.5 67 68 75 68 83 L68 85 C66 92 57 94 57 101 L57 220 Q57 228 66 228 L94 228 Q103 228 103 220 L103 101 C103 94 94 92 92 85 L92 83 C92 75 95.5 67 95.5 57 C95.5 44 91.5 32 91 20 C90.5 11 86 6 80 6 Z" fill={`url(#${id('ambg')})`} stroke="#7a4408" strokeWidth="1.1" />
          {/* thick glass at the base */}
          <path d="M57 211 L103 211 L103 220 Q103 228 94 228 L66 228 Q57 228 57 220 Z" fill="#6b3a05" opacity=".28" />
          <ellipse cx="80" cy="224" rx="16" ry="2.2" fill="#fff" opacity=".35" />
          {/* pale break ring at the neck */}
          <path d="M68 82 Q80 86 92 82 L92 86.5 Q80 90.5 68 86.5 Z" fill="#f1efe8" stroke="#b9b6aa" strokeWidth=".6" />
          {/* printed label: full-width wrap, blue band, thin red line */}
          <rect x="57" y="109" width="46" height="104" fill={`url(#${id('paper')})`} />
          {(() => {
            const [w1, ...rest] = (name || '').trim().split(/\s+/)
            return (
              <g>
                <text x="80" y="122" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#16202a">{clip(w1, 11)}</text>
                {rest.length > 0 && <text x="80" y="130.5" textAnchor="middle" fontSize="5.6" fontWeight="600" fill="#334150">{clip(rest.join(' '), 12)}</text>}
                <text x="80" y="139" textAnchor="middle" fontSize="4.4" fill="#667380">{clip(company, 16)}</text>
                <rect x="57" y="145" width="46" height="34" fill={`url(#${id('band')})`} />
                <text x="80" y="156.5" textAnchor="middle" fontSize="5.4" fontWeight="700" fill="#fff" letterSpacing="1.2">MEDICINE</text>
                <rect x="62" y="162" width="36" height="11" rx="5.5" fill="#fff" />
                <text x="80" y="169.6" textAnchor="middle" fontSize="5" fontWeight="700" fill="#10309f">{clip(pill, 10)}</text>
                <rect x="57" y="190" width="46" height="1.5" fill="#d12a2a" />
                <g opacity=".35">{[198, 203].map((y, i) => <rect key={y} x="63" y={y} width={34 - i * 10} height="1.4" rx=".7" fill="#6b7782" />)}</g>
              </g>
            )
          })()}
          <rect x="57" y="109" width="46" height="104" fill={`url(#${id('wrap')})`} />
          {/* glass highlights: bulb, shoulder, body */}
          <Glint x={72} y={14} w={4} h={50} o={0.5} />
          <Glint x={86.5} y={22} w={1.8} h={34} o={0.3} />
          <Glint x={60} y={96} w={4} h={10} o={0.45} />
          <Glint x={59.5} y={110} w={3.6} h={110} o={0.4} />
          <Glint x={97} y={112} w={2} h={100} o={0.22} />
        </g>)
      case 'sachet': return (
        <g>
          <ellipse cx="80" cy="214" rx="60" ry="5" fill={`url(#${id('floor')})`} />
          <rect x="19" y="43" width="124" height="170" rx="2" fill="#000" opacity=".28" filter={`url(#${id('soft')})`} />
          {/* flat pearl-white pouch, sealed on all four sides */}
          <rect x="18" y="40" width="124" height="170" rx="1.5" fill="#f4f4f2" stroke="#d3d4d2" strokeWidth=".8" />
          <path d="M18 40 H142 V210 H18 Z M29 51 V199 H131 V51 Z" fill="#e8e8e6" fillRule="evenodd" />
          {[1.6, 4.2, 6.8, 9.4].map(d => <rect key={d} x={18 + d} y={40 + d} width={124 - 2 * d} height={170 - 2 * d} fill="none" stroke="#c9cac8" strokeWidth=".6" opacity=".9" />)}
          {/* puffed centre: bright in the middle, soft shade toward the seals */}
          <rect x="29" y="51" width="102" height="148" rx="7" fill={`url(#${id('pillow')})`} />
          <rect x="30.5" y="52.5" width="99" height="145" rx="6" fill="none" stroke="#000" strokeWidth="3" opacity=".07" filter={`url(#${id('soft')})`} />
          <ellipse cx="62" cy="76" rx="26" ry="16" fill="#fff" opacity=".75" filter={`url(#${id('soft')})`} />
          <path d="M40 190 Q80 183 120 190" fill="none" stroke="#000" strokeWidth="3" opacity=".07" filter={`url(#${id('soft')})`} />
          {/* printed directly on the film */}
          <rect x="38" y="68" width="84" height="14" rx="2" fill="#0b7a75" />
          <text x="80" y="78.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff" letterSpacing="1.8">MEDICINE</text>
          {(() => {
            const [w1, ...rest] = (name || '').trim().split(/\s+/)
            return (
              <g>
                <text x="80" y="108" textAnchor="middle" fontSize="10" fontWeight="700" fill="#16202a">{clip(w1, 12)}</text>
                {rest.length > 0 && <text x="80" y="120" textAnchor="middle" fontSize="7.6" fontWeight="600" fill="#334150">{clip(rest.join(' '), 16)}</text>}
                <text x="80" y="133" textAnchor="middle" fontSize="6.4" fill="#667380">{clip(company, 22)}</text>
              </g>
            )
          })()}
          <rect x="53" y="148" width="54" height="16" rx="8" fill="#e8f3f2" stroke="#0b7a75" strokeWidth=".9" />
          <text x="80" y="159" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
        </g>)
      case 'box': return (
        <g>
          <Shadow rx={58} />
          <polygon points="24,52 48,36 136,36 112,52" fill={`url(#${id('top')})`} stroke="#9fb7b5" />
          <line x1="36" y1="44" x2="124" y2="44" stroke="#9fb7b5" strokeWidth=".9" />
          <polygon points="112,52 136,36 136,206 112,222" fill={`url(#${id('side')})`} stroke="#9fb7b5" />
          <line x1="124" y1="44" x2="124" y2="214" stroke="#9fb7b5" strokeWidth=".7" opacity=".7" />
          <rect x="24" y="52" width="88" height="170" fill={`url(#${id('front')})`} stroke="#9fb7b5" />
          <rect x="24" y="52" width="88" height="24" fill="#0b7a75" />
          <rect x="24" y="76" width="88" height="2" fill="#000" opacity=".12" />
          <text x="68" y="68" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
          <text x="68" y="112" textAnchor="middle" fontSize={nm.length > 14 ? 8.5 : 10.5} fontWeight="700" fill="#16202a">{clip(name, 20)}</text>
          <text x="68" y="126" textAnchor="middle" fontSize="7" fill="#556270">{co}</text>
          <g opacity=".35">{[0, 1, 2].map(i => <rect key={i} x="34" y={138 + i * 6} width={68 - (i === 2 ? 26 : 0)} height="1.8" rx=".9" fill="#6b7782" />)}</g>
          <rect x="98" y="90" width="8" height="64" fill={`url(#${id('holo')})`} opacity=".85" />
          <g>{Array.from({ length: 16 }, (_, i) => <rect key={i} x={30 + i * 2.2} y="208" width={i % 3 === 0 ? 1.6 : 0.8} height="9" fill="#16202a" opacity=".8" />)}</g>
          <rect x="41" y="188" width="54" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
          <text x="68" y="198.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
          <rect x="24.5" y="52.5" width="1.6" height="169" fill="#fff" opacity=".8" />
        </g>)
      case 'piece': return (
        <g>
          <Shadow rx={50} />
          <rect x="32" y="16" width="96" height="206" rx="9" fill={`url(#${id('front')})`} stroke="#b8c2cb" />
          <rect x="70" y="24" width="20" height="9" rx="4.5" fill="#3b4a57" opacity=".35" />
          <rect x="32" y="40" width="96" height="20" fill="#0b7a75" />
          <text x="80" y="54" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" letterSpacing="2">MEDICINE</text>
          <text x="80" y="96" textAnchor="middle" fontSize={nmSize} fontWeight="700" fill="#16202a">{nm}</text>
          <text x="80" y="110" textAnchor="middle" fontSize="7" fill="#556270">{co}</text>
          <rect x="53" y="124" width="54" height="15" rx="7.5" fill="#e8f3f2" stroke="#0b7a75" />
          <text x="80" y="134.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0b7a75">{pill}</text>
          {Array.from({ length: 22 }, (_, i) => <rect key={i} x={44 + i * 3.6} y="168" width={i % 3 === 0 ? 2.4 : 1.2} height="38" fill="#16202a" />)}
          <path d="M40 24 L56 24 L40 210 Z" fill="#fff" opacity=".35" filter={`url(#${id('soft')})`} />
          <rect x="33" y="17" width="1.6" height="204" rx=".8" fill="#fff" opacity=".7" />
        </g>)
      case 'kg': return (
        <g>
          <Shadow rx={58} />
          <path d="M58 20 L102 20 L98 44 C132 56 140 92 138 140 L136 212 Q136 224 124 224 L36 224 Q24 224 24 212 L22 140 C20 92 28 56 62 44 Z" fill={`url(#${id('kraft')})`} stroke="#8a6a38" strokeWidth="1.2" />
          <path d="M58 20 L102 20 L98 44 L62 44 Z" fill="#7a5a2b" opacity=".35" />
          <line x1="60" y1="31" x2="100" y2="31" stroke="#4d3714" strokeWidth="1.4" strokeDasharray="3 2.4" />
          <rect x="54" y="38" width="52" height="8" rx="3.5" fill="#6e4f22" />
          {[[30, 112, 40, 150, 28, 176], [130, 108, 120, 150, 132, 180]].map(([x1, y1, x2, y2, x3, y3], i) => <path key={i} d={`M${x1} ${y1} Q${x2} ${y2} ${x3} ${y3}`} fill="none" stroke="#000" strokeWidth="1" opacity=".13" />)}
          <path d="M30 70 C40 60 50 56 60 52" stroke="#fff" strokeWidth="5" opacity=".28" fill="none" strokeLinecap="round" />
          <Label x={36} y={96} w={88} h={100} />
          <path d="M28 205 Q80 214 132 205" fill="none" stroke="#000" strokeWidth="1" opacity=".12" />
        </g>)
      case 'ltr': return (
        <g>
          <defs><clipPath id={id('lc')}><rect x="30" y="70" width="100" height="152" rx="16" /></clipPath></defs>
          <Shadow rx={54} />
          <path d="M114 72 C114 52 142 52 140 78 L138 108" fill="none" stroke="#3f74b8" strokeWidth="10" strokeLinecap="round" />
          <path d="M114 72 C114 54 140 54 138 78" fill="none" stroke="#fff" strokeWidth="2" opacity=".35" strokeLinecap="round" />
          <rect x="30" y="70" width="100" height="152" rx="16" fill={`url(#${id('blue')})`} stroke="#4a7bbd" strokeWidth="1.2" />
          <g clipPath={`url(#${id('lc')})`}>
            <rect x="30" y="128" width="100" height="100" fill="#1f5fbf" opacity=".22" />
            <rect x="30" y="127" width="100" height="2" fill="#fff" opacity=".55" />
            <rect x="30" y="205" width="100" height="20" fill="#0d2f66" opacity=".15" />
          </g>
          {[1, 2, 3].map(i => <line key={i} x1="32" y1={80 + i * 2.6} x2="128" y2={80 + i * 2.6} stroke="#4a7bbd" strokeWidth=".8" opacity=".5" />)}
          {[100, 118, 136, 154, 172, 190].map((y, i) => <line key={y} x1={i % 2 ? 124 : 120} y1={y} x2="130" y2={y} stroke="#2b5a99" strokeWidth="1" />)}
          <Label x={38} y={104} w={84} h={96} />
          <Glint x={35} y={86} w={7} h={124} o={0.45} />
          <rect x="60" y="62" width="40" height="10" rx="3" fill="#174a94" />
          <rect x="62" y="38" width="36" height="26" rx="5" fill="#1f5fbf" stroke="#174a94" />
          {[68, 74, 80, 86, 92].map(x => <line key={x} x1={x} y1="42" x2={x} y2="60" stroke="#4a7bbd" strokeWidth="1" />)}
          <rect x="66" y="40" width="28" height="3" rx="1.5" fill="#fff" opacity=".4" />
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
              <filter id={id('soft')} x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="1.3" /></filter>
              <radialGradient id={id('floor')}><stop offset="0" stopColor="#000" stopOpacity=".5" /><stop offset=".6" stopColor="#000" stopOpacity=".22" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
              <linearGradient id={id('amber')} x1="0" x2="1"><stop offset="0" stopColor="#6e3806" /><stop offset=".12" stopColor="#b96a17" /><stop offset=".32" stopColor="#f0a444" /><stop offset=".5" stopColor="#dc8a28" /><stop offset=".78" stopColor="#b86d1b" /><stop offset="1" stopColor="#5e3005" /></linearGradient>
              <linearGradient id={id('ambg')} x1="0" x2="1"><stop offset="0" stopColor="#8a4f0a" /><stop offset=".12" stopColor="#c9801f" /><stop offset=".3" stopColor="#f6b647" /><stop offset=".5" stopColor="#eba430" /><stop offset=".78" stopColor="#c88421" /><stop offset="1" stopColor="#7d4608" /></linearGradient>
              <linearGradient id={id('band')} x1="0" x2="1"><stop offset="0" stopColor="#061a78" /><stop offset=".3" stopColor="#1747d6" /><stop offset=".65" stopColor="#0f35b8" /><stop offset="1" stopColor="#051566" /></linearGradient>
              <linearGradient id={id('tcap')} x1="0" x2="1"><stop offset="0" stopColor="#c9c5b9" /><stop offset=".35" stopColor="#efece4" /><stop offset=".7" stopColor="#d6d2c7" /><stop offset="1" stopColor="#b3afa2" /></linearGradient>
              <radialGradient id={id('pillow')} cx=".42" cy=".38" r=".75"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#f6f6f4" /><stop offset="1" stopColor="#e4e5e3" /></radialGradient>
              <linearGradient id={id('cap')} x1="0" x2="1"><stop offset="0" stopColor="#b3bec8" /><stop offset=".18" stopColor="#f1f5f8" /><stop offset=".45" stopColor="#ffffff" /><stop offset=".8" stopColor="#d3dae1" /><stop offset="1" stopColor="#97a3ad" /></linearGradient>
              <linearGradient id={id('metal')} x1="0" x2="1"><stop offset="0" stopColor="#7f8993" /><stop offset=".15" stopColor="#d9dfe4" /><stop offset=".3" stopColor="#ffffff" /><stop offset=".5" stopColor="#c8d0d6" /><stop offset=".7" stopColor="#eef1f4" /><stop offset=".88" stopColor="#a6afb8" /><stop offset="1" stopColor="#7b858f" /></linearGradient>
              <linearGradient id={id('flip')} x1="0" x2="1"><stop offset="0" stopColor="#8e2a20" /><stop offset=".3" stopColor="#e2584a" /><stop offset=".6" stopColor="#c0392b" /><stop offset="1" stopColor="#7d2219" /></linearGradient>
              <linearGradient id={id('ring')} x1="0" x2="1"><stop offset="0" stopColor="#a8352f" /><stop offset=".4" stopColor="#ee6b63" /><stop offset="1" stopColor="#932b26" /></linearGradient>
              <linearGradient id={id('tube')} x1="0" x2="1"><stop offset="0" stopColor="#cfd6dc" /><stop offset=".35" stopColor="#ffffff" /><stop offset=".7" stopColor="#eef1f4" /><stop offset="1" stopColor="#bcc4cb" /></linearGradient>
              <linearGradient id={id('glass')} x1="0" x2="1"><stop offset="0" stopColor="#7fa9bd" stopOpacity=".85" /><stop offset=".12" stopColor="#c9e3ee" stopOpacity=".75" /><stop offset=".3" stopColor="#f4fbfe" stopOpacity=".88" /><stop offset=".6" stopColor="#d9ebf3" stopOpacity=".65" /><stop offset=".88" stopColor="#a2c5d4" stopOpacity=".78" /><stop offset="1" stopColor="#76a0b4" stopOpacity=".9" /></linearGradient>
              <linearGradient id={id('liq')} x1="0" x2="1"><stop offset="0" stopColor="#7fbad6" stopOpacity=".8" /><stop offset=".35" stopColor="#d2ecf8" stopOpacity=".8" /><stop offset=".7" stopColor="#b0d9ec" stopOpacity=".75" /><stop offset="1" stopColor="#6aa7c6" stopOpacity=".85" /></linearGradient>
              <linearGradient id={id('foil')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#dfe5ea" /><stop offset=".3" stopColor="#ffffff" /><stop offset=".55" stopColor="#d3dadf" /><stop offset=".8" stopColor="#f6f8fa" /><stop offset="1" stopColor="#b7c0c8" /></linearGradient>
              <linearGradient id={id('kraft')} x1="0" x2="1"><stop offset="0" stopColor="#a47a41" /><stop offset=".35" stopColor="#dbb67b" /><stop offset=".6" stopColor="#c89f62" /><stop offset="1" stopColor="#94703a" /></linearGradient>
              <linearGradient id={id('blue')} x1="0" x2="1"><stop offset="0" stopColor="#6aa0e0" /><stop offset=".35" stopColor="#dbeafe" /><stop offset=".7" stopColor="#a9c9f2" /><stop offset="1" stopColor="#5b92d6" /></linearGradient>
              <linearGradient id={id('crimp')} x1="0" x2="1"><stop offset="0" stopColor="#8b959e" /><stop offset=".5" stopColor="#e3e8ec" /><stop offset="1" stopColor="#7d8790" /></linearGradient>
              <linearGradient id={id('wrap')} x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity=".32" /><stop offset=".2" stopColor="#000" stopOpacity="0" /><stop offset=".78" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".38" /></linearGradient>
              <linearGradient id={id('paper')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#f1f1ec" /></linearGradient>
              <linearGradient id={id('front')} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#f6f9f9" /><stop offset="1" stopColor="#e3ecec" /></linearGradient>
              <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a9ccc8" /><stop offset="1" stopColor="#cfe3e0" /></linearGradient>
              <linearGradient id={id('top')} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dcebea" /></linearGradient>
              <linearGradient id={id('holo')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b96bff" /><stop offset=".3" stopColor="#4ad0ff" /><stop offset=".55" stopColor="#f6f6f6" /><stop offset=".8" stopColor="#ffe14a" /><stop offset="1" stopColor="#ff7bb5" /></linearGradient>
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
