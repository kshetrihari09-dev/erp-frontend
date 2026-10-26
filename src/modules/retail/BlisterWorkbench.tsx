/**
 * BlisterWorkbench.tsx — interactive blister cutting bench (canvas).
 *
 * Gestures (no mode buttons):
 *   quick swipe          → cut (the cut bends around tablets, see blisterGeometry)
 *   tap                  → select a piece
 *   press & hold + drag  → move the piece
 *   drop on the basket   → bill the piece (once; the piece then leaves the bench)
 *   "Add to basket"      → same as dropping the selected piece
 *
 * This component only knows about geometry and pointers. It reports what the
 * user billed through `onAddPiece(tablets)` and never talks to any API.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Undo2, RotateCcw, ShoppingBasket } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  bbox, countTablets, cutPieces, deflect, inside, isUpright, layoutBlister, outline, ownTablets, planStraight,
  MIN_SWIPE, type CutStyle, type Piece, type Pt, type ShapeName, type Tablet,
} from './blisterGeometry'

export interface BlisterWorkbenchProps {
  /** Changing `resetKey` loads a fresh, completely intact blister. */
  resetKey: string | number
  packSize: number
  shape: ShapeName
  colors: string[]
  /** Returns the basket's on-screen rectangle (for drag-and-drop), or null. */
  getDropRect: () => DOMRect | null
  /** Called exactly once per successful add. `tablets` = billable tablets in the piece. */
  onAddPiece: (tablets: number) => void
  onMessage?: (msg: string) => void
  /** True while a dragged piece is over the basket (for highlighting it). */
  onHotChange?: (hot: boolean) => void
}

const HOLD_MS = 260        // press this long without moving → move mode
const MOVE_SLOP = 10       // px of travel that turns a press into a swipe

interface Gesture {
  id: number; start: Pt; last: Pt; path: Pt[]
  mode: 'pending' | 'cut' | 'hold'
  piece: Piece | null; dragged: boolean
  timer: ReturnType<typeof setTimeout> | null
}

export default function BlisterWorkbench({ resetKey, packSize, shape, colors, getDropRect, onAddPiece, onMessage, onHotChange }: BlisterWorkbenchProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [, force] = useReducer((n: number) => n + 1, 0)
  // Cut style is a preference (how a swipe becomes a cut), not a mode: swipe always cuts, hold-drag always moves.
  const [cutStyle, setCutStyle] = useState<CutStyle>(() => { try { return localStorage.getItem('retailCutStyle') === 'straight' ? 'straight' : 'free' } catch { return 'free' } })

  // All mutable bench state lives in refs: pointer events fire far faster than
  // React renders, and the canvas is redrawn imperatively.
  const piecesRef = useRef<Piece[]>([])
  const tabletsRef = useRef<Tablet[]>([])
  const historyRef = useRef<Piece[][]>([])
  const selRef = useRef<Piece | null>(null)
  const gRef = useRef<Gesture | null>(null)
  const idRef = useRef(1)
  const hotRef = useRef(false)
  const view = useRef({ cssW: 0, cssH: 0, dpr: 1, scale: 1 })
  const props = useRef({ shape, colors, packSize, cutStyle, getDropRect, onAddPiece, onMessage, onHotChange })
  props.current = { shape, colors, packSize, cutStyle, getDropRect, onAddPiece, onMessage, onHotChange }

  const say = (m: string) => props.current.onMessage?.(m)

  // ── drawing ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const { cssW, cssH, dpr, scale } = view.current
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
    ctx.clearRect(0, 0, cssW / scale, cssH / scale)
    const { shape: sh, colors: cs } = props.current
    const tablets = tabletsRef.current
    const g = gRef.current

    const poly = (pts: [number, number][]) => {
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
    }
    const pathOf = (p: Piece) => {
      ctx.beginPath()
      for (const pg of p.rings) for (const r of pg) { r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath() }
    }

    for (const p of piecesRef.current) {
      const lift = !!g && g.mode === 'hold' && g.piece === p
      ctx.save(); ctx.translate(p.ox, p.oy)
      const [x0, y0, x1, y1] = bbox(p)
      const f = ctx.createLinearGradient(x0, y0, x1, y1)
      ;([[0, '#f4f6f8'], [0.35, '#c3c9cf'], [0.6, '#eef1f3'], [1, '#aab1b8']] as const).forEach(([o, c]) => f.addColorStop(o, c))
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = lift ? 18 : 8; ctx.shadowOffsetY = lift ? 9 : 3
      pathOf(p); ctx.fillStyle = f; ctx.fill('evenodd'); ctx.shadowColor = 'transparent'

      ctx.save(); pathOf(p); ctx.clip('evenodd')
      for (const t of tablets) {
        poly(outline(sh, t, 0.62, 40)); ctx.fillStyle = cs[0]; ctx.fill()
        if (cs[1]) {
          // second colour covers the lower half of an upright tablet (capsule cap/body), else the right half
          ctx.save(); ctx.beginPath()
          if (isUpright(sh)) ctx.rect(t.x - 30, t.y, 60, 40); else ctx.rect(t.x, t.y - 30, 40, 60)
          ctx.clip()
          poly(outline(sh, t, 0.62, 40)); ctx.fillStyle = cs[1]; ctx.fill(); ctx.restore()
        }
        poly(outline(sh, t, 0.62, 40)); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke()
        const d = ctx.createRadialGradient(t.x - 5, t.y - 6, 2, t.x, t.y, 22)
        d.addColorStop(0, 'rgba(255,255,255,.85)'); d.addColorStop(0.55, 'rgba(210,218,225,.3)'); d.addColorStop(1, 'rgba(110,120,130,.6)')
        poly(outline(sh, t, 1, 40)); ctx.fillStyle = d; ctx.fill()
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(80,90,100,.55)'; ctx.stroke()
      }
      ctx.restore()
      pathOf(p); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(50,60,70,.75)'; ctx.stroke()
      if (p === selRef.current) { ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd24a'; ctx.stroke() }
      ctx.restore()
    }

    // live cut preview — shows the line that will really be cut, per piece
    if (g && g.mode === 'cut') {
      if (props.current.cutStyle === 'straight') {
        // straight: full-width line per touched piece; green = will cut, red = would damage tablets
        for (const pl of planStraight(piecesRef.current, g.path, tablets, sh)) {
          ctx.save(); ctx.translate(pl.piece.ox, pl.piece.oy); pathOf(pl.piece); ctx.clip('evenodd')
          ctx.beginPath(); ctx.moveTo(pl.line[0].x, pl.line[0].y); ctx.lineTo(pl.line[1].x, pl.line[1].y)
          ctx.setLineDash(pl.blocked ? [4, 5] : []); ctx.lineWidth = 2.5; ctx.strokeStyle = pl.blocked ? '#ff3b30' : '#34d399'; ctx.stroke(); ctx.restore()
        }
      } else {
        ctx.beginPath(); g.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff5a4e'; ctx.stroke(); ctx.globalAlpha = 1
        for (const p of piecesRef.current) {
          ctx.save(); ctx.translate(p.ox, p.oy); pathOf(p); ctx.clip('evenodd')
          const lp = deflect(g.path.map(q => ({ x: q.x - p.ox, y: q.y - p.oy })), ownTablets(p, tablets), sh)
          ctx.beginPath(); lp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
          ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff5a4e'; ctx.stroke(); ctx.restore()
        }
      }
    }
  }, [])

  // ── load / reset ───────────────────────────────────────────────────────────
  const load = useCallback(() => {
    const { W, H, tablets, ring } = layoutBlister(packSize)
    const v = view.current
    const wW = v.cssW / v.scale, wH = v.cssH / v.scale
    tabletsRef.current = tablets
    // A fresh blister is ALWAYS one intact polygon — never pre-cut.
    piecesRef.current = [{ id: idRef.current++, rings: [[ring]], ox: (wW - W) / 2, oy: Math.max(8, (wH - H) / 2) }]
    historyRef.current = []; selRef.current = null; gRef.current = null
    draw(); force()
  }, [packSize, draw])

  const resize = useCallback(() => {
    const wrap = wrapRef.current, cv = cvRef.current; if (!wrap || !cv) return
    const w = wrap.getBoundingClientRect().width
    const v = view.current
    // Canvas height follows the strip: tall strips (up to 8 rows) get a taller bench,
    // and the blister is scaled so BOTH its width and height fit with room to move pieces.
    const { W, H } = layoutBlister(props.current.packSize)
    const sw = Math.min(1, (w - 16) / W)
    v.cssW = w; v.cssH = Math.round(Math.min(480, Math.max(240, H * sw * 1.5 + 40))); v.dpr = window.devicePixelRatio || 1
    v.scale = Math.max(0.3, Math.min(sw, (v.cssH - 24) / H))
    cv.width = Math.round(v.cssW * v.dpr); cv.height = Math.round(v.cssH * v.dpr); cv.style.height = v.cssH + 'px'
    draw()
  }, [draw])

  useEffect(() => { resize(); load() }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ro = new ResizeObserver(() => resize()); if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [resize])
  useEffect(() => { draw() }, [shape, colors, draw])

  // ── pointer gestures ───────────────────────────────────────────────────────
  const pt = (e: React.PointerEvent): Pt => {
    const r = cvRef.current!.getBoundingClientRect(), s = view.current.scale
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }   // → world coordinates
  }
  const hit = (p: Pt): Piece | null => {
    const ps = piecesRef.current
    for (let i = ps.length - 1; i >= 0; i--) if (inside(ps[i].rings, p.x - ps[i].ox, p.y - ps[i].oy)) return ps[i]
    return null
  }
  const overBasket = (e: React.PointerEvent) => {
    const r = props.current.getDropRect(); if (!r) return false
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  }

  // Bills one piece. Guarded so a repeated event can never bill the same piece twice.
  const addPiece = (piece: Piece) => {
    const idx = piecesRef.current.indexOf(piece); if (idx < 0) return
    const c = countTablets(piece, tabletsRef.current, props.current.shape)
    if (!c.whole) { say('This piece has no whole tablet, so nothing was billed.'); return }
    piecesRef.current = piecesRef.current.filter(p => p !== piece)   // removed first → cannot be added twice
    if (selRef.current === piece) selRef.current = null
    props.current.onAddPiece(c.whole)
    if (c.cut) say(`${c.cut} cut tablet${c.cut > 1 ? 's' : ''} not billed.`)
  }

  const onDown = (e: React.PointerEvent) => {
    if (gRef.current) return
    cvRef.current!.setPointerCapture(e.pointerId)
    const p = pt(e)
    const g: Gesture = { id: e.pointerId, start: p, last: p, path: [p], mode: 'pending', piece: hit(p), dragged: false, timer: null }
    g.timer = setTimeout(() => {
      if (gRef.current === g && g.mode === 'pending') {
        g.mode = 'hold'
        if (g.piece) {
          piecesRef.current = [...piecesRef.current.filter(x => x !== g.piece), g.piece]
          selRef.current = g.piece
          navigator.vibrate?.(12); draw(); force()
        }
      }
    }, HOLD_MS)
    gRef.current = g
  }
  const onMove = (e: React.PointerEvent) => {
    const g = gRef.current; if (!g || e.pointerId !== g.id) return
    const p = pt(e)
    if (g.mode === 'pending' && Math.hypot(p.x - g.start.x, p.y - g.start.y) * view.current.scale > MOVE_SLOP) {
      g.mode = 'cut'; if (g.timer) clearTimeout(g.timer)
    }
    if (g.mode === 'cut') { g.path.push(p); draw() }
    else if (g.mode === 'hold' && g.piece) {
      g.piece.ox += p.x - g.last.x; g.piece.oy += p.y - g.last.y; g.dragged = true
      const hot = overBasket(e); if (hot !== hotRef.current) { hotRef.current = hot; props.current.onHotChange?.(hot); force() }
      draw()
    }
    g.last = p
  }
  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const g = gRef.current; if (!g || e.pointerId !== g.id) return
    if (g.timer) clearTimeout(g.timer)
    gRef.current = null
    if (hotRef.current) { hotRef.current = false; props.current.onHotChange?.(false) }
    if (!cancelled) {
      if (g.mode === 'cut') {
        let L = 0
        for (let i = 1; i < g.path.length; i++) L += Math.hypot(g.path[i].x - g.path[i - 1].x, g.path[i].y - g.path[i - 1].y)
        if (L * view.current.scale >= MIN_SWIPE) {
          const before = piecesRef.current
          const res = cutPieces(before, g.path, tabletsRef.current, props.current.shape, () => idRef.current++, props.current.cutStyle)
          if (res.changed) { historyRef.current.push(before.map(p => ({ ...p }))); piecesRef.current = res.pieces; selRef.current = null }
          else if (res.reason) say(res.reason)
        }
      } else if (g.mode === 'pending') selRef.current = hit(pt(e))
      else if (g.mode === 'hold' && g.piece && g.dragged && overBasket(e)) addPiece(g.piece)
    }
    draw(); force()
  }

  const chooseStyle = (s: CutStyle) => {
    setCutStyle(s); props.current.cutStyle = s
    try { localStorage.setItem('retailCutStyle', s) } catch { /* preference only */ }
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) { say('Nothing to undo.'); return }
    piecesRef.current = prev; selRef.current = null; draw(); force()
  }

  const sel = selRef.current
  const counts = sel ? countTablets(sel, tabletsRef.current, shape) : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-[var(--text-3)]">Cut style</span>
        <div role="group" aria-label="Cut style" className="inline-flex overflow-hidden rounded-lg border border-[var(--border)]">
          {(['straight', 'free'] as CutStyle[]).map(s => (
            <button key={s} type="button" aria-pressed={cutStyle === s} onClick={() => chooseStyle(s)}
              className="px-3 py-1.5 font-semibold"
              style={cutStyle === s ? { background: 'var(--brand, #0b7a75)', color: '#fff' } : { color: 'var(--text-2)' }}>
              {s === 'straight' ? 'Straight' : 'Free-form'}
            </button>
          ))}
        </div>
      </div>
      <div ref={wrapRef} className="rounded-xl overflow-hidden" style={{ background: '#3b4a57' }}>
        <canvas
          ref={cvRef}
          style={{ display: 'block', width: '100%', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={e => end(e, false)} onPointerCancel={e => end(e, true)}
          onContextMenu={e => e.preventDefault()}
        />
      </div>
      <div className="mt-2 min-h-[20px] text-xs text-[var(--text-3)]">
        {counts
          ? `Selected: ${counts.whole} billable tablet${counts.whole !== 1 ? 's' : ''}${counts.cut ? ` (${counts.cut} cut, not billed)` : ''}`
          : `${piecesRef.current.length} piece${piecesRef.current.length !== 1 ? 's' : ''} on the bench. Tap one to see its tablet count.`}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {sel && counts && (
          <Button variant="primary" size="sm" disabled={!counts.whole} icon={<ShoppingBasket size={15} />}
            onClick={() => { if (sel) { addPiece(sel); draw(); force() } }}>
            Add {counts.whole} tablet{counts.whole !== 1 ? 's' : ''} to basket
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={<Undo2 size={15} />} onClick={undo}>Undo cut</Button>
        <Button variant="secondary" size="sm" icon={<RotateCcw size={15} />} onClick={load}>Reset blister</Button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-4)]">
        Quick swipe = cut · Tap = select · Press and hold, then drag = move · Drop on the basket to bill.{' '}
        {cutStyle === 'straight'
          ? 'Straight: the cut is a straight line across the whole piece (snaps to horizontal or vertical) and is refused if it would damage a tablet.'
          : 'Free-form: the cut follows your swipe and bends around tablets, so none is damaged.'}
      </p>
    </div>
  )
}
