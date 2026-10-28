/**
 * BlisterWorkbench.tsx — interactive blister cutting bench (canvas).
 *
 * Gestures (no mode buttons):
 *   double-tap / dbl-click → add the piece to the basket (same as dropping it there)
 *   quick swipe          → cut (the cut bends around tablets, see blisterGeometry); while you swipe the bench
 *                          shows the real result live: tinted pieces, a tablet count on each, red rings on any
 *                          tablet a straight cut would damage, and straight cuts snap to the middle of a gap
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
  bbox, countTablets, cutPieces, deflect, inside, isUpright, layoutBlister, outline, ownTablets, planStraight, previewCut, shadeHex, smoothPath, SHAPES,
  MIN_SWIPE, type CutPreview, type CutStyle, type Piece, type Pt, type ShapeName, type Tablet,
} from './blisterGeometry'

export interface BlisterWorkbenchProps {
  /** Changing `resetKey` loads a fresh, completely intact blister. */
  resetKey: string | number
  packSize: number
  shape: ShapeName
  colors: string[]
  /** Colour of the blister foil itself ("#rrggbb"); null/undefined = default silver. */
  blisterColor?: string | null
  /** Returns the basket's on-screen rectangle (for drag-and-drop), or null. */
  getDropRect: () => DOMRect | null
  /** Called exactly once per successful add. `tablets` = billable tablets in the piece. */
  onAddPiece: (tablets: number) => void
  onMessage?: (msg: string) => void
  /** True while a dragged piece is over the basket (for highlighting it). */
  onHotChange?: (hot: boolean) => void
}

const DOUBLE_TAP_MS = 350   // two taps on the same piece this close together add it to the basket
const HOLD_MS = 260        // press this long without moving → move mode
const MOVE_SLOP = 10       // px of travel that turns a press into a swipe

interface Gesture {
  id: number; start: Pt; last: Pt; path: Pt[]
  mode: 'pending' | 'cut' | 'hold'
  piece: Piece | null; dragged: boolean; prevAt: number
  timer: ReturnType<typeof setTimeout> | null
}

export default function BlisterWorkbench({ resetKey, packSize, shape, colors, blisterColor, getDropRect, onAddPiece, onMessage, onHotChange }: BlisterWorkbenchProps) {
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
  const liveRef = useRef<CutPreview | null>(null)   // what the swipe in progress would do (updated while swiping)
  const animRef = useRef(0)
  const lastTapRef = useRef<{ piece: Piece; at: number; x: number; y: number } | null>(null)   // for double-tap / double-click
  const reloadRef = useRef(0)   // pending auto-reload of a fresh strip once the current one is used up
  const view = useRef({ cssW: 0, cssH: 0, dpr: 1, scale: 1 })
  const props = useRef({ shape, colors, blisterColor, packSize, cutStyle, getDropRect, onAddPiece, onMessage, onHotChange })
  props.current = { shape, colors, blisterColor, packSize, cutStyle, getDropRect, onAddPiece, onMessage, onHotChange }

  const say = (m: string) => props.current.onMessage?.(m)

  // ── drawing ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const { cssW, cssH, dpr, scale } = view.current
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
    ctx.clearRect(0, 0, cssW / scale, cssH / scale)
    const { shape: sh, colors: cs, blisterColor: bc } = props.current
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
      const foil: readonly (readonly [number, string])[] = bc
        ? [[0, shadeHex(bc, 0.45)], [0.35, bc], [0.6, shadeHex(bc, 0.3)], [1, shadeHex(bc, -0.2)]]
        : [[0, '#f4f6f8'], [0.35, '#c3c9cf'], [0.6, '#eef1f3'], [1, '#aab1b8']]
      foil.forEach(([o, c]) => f.addColorStop(o, c))
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = lift ? 18 : 8; ctx.shadowOffsetY = lift ? 9 : 3
      pathOf(p); ctx.fillStyle = f; ctx.fill('evenodd'); ctx.shadowColor = 'transparent'

      ctx.save(); pathOf(p); ctx.clip('evenodd')
      for (const t of tablets) {
        const dome = outline(sh, t, 1, 40)
        const body = outline(sh, t, 0.8, 40)
        if (sh === 'capsule') {
          // flat capsule pocket: white ring with a dark outline, two-tone capsule, divider line, curved glint
          const ink = '#262b3a', hw = SHAPES.capsule[0] * 0.8
          poly(dome); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = ink; ctx.stroke()
          poly(body); ctx.fillStyle = cs[0]; ctx.fill()
          if (cs[1]) { ctx.save(); ctx.beginPath(); ctx.rect(t.x - 30, t.y, 60, 40); ctx.clip(); poly(body); ctx.fillStyle = cs[1]; ctx.fill(); ctx.restore() }
          poly(body); ctx.lineWidth = 1.2; ctx.strokeStyle = ink; ctx.stroke()
          if (cs[1]) { ctx.beginPath(); ctx.moveTo(t.x - hw, t.y); ctx.lineTo(t.x + hw, t.y); ctx.stroke() }
          ctx.beginPath(); ctx.moveTo(t.x - 4.2, t.y - 3); ctx.lineTo(t.x - 4.2, t.y - 9); ctx.quadraticCurveTo(t.x - 4.2, t.y - 12.2, t.x - 2.4, t.y - 13.4)
          ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke(); ctx.lineCap = 'butt'
          continue
        }
        // clear plastic dome — faint, so the tablet's own colour stays true
        poly(dome); ctx.fillStyle = 'rgba(236,243,248,.5)'; ctx.fill()
        // tablet in the product's colour(s), full strength
        poly(body); ctx.fillStyle = cs[0]; ctx.fill()
        if (cs[1]) {
          // second colour covers the lower half of an upright tablet (capsule cap/body), else the right half
          ctx.save(); ctx.beginPath()
          if (isUpright(sh)) ctx.rect(t.x - 30, t.y, 60, 40); else ctx.rect(t.x, t.y - 30, 40, 60)
          ctx.clip()
          poly(body); ctx.fillStyle = cs[1]; ctx.fill(); ctx.restore()
        }
        // soft shading ON the tablet (light top-left, darker bottom-right) — keeps the hue
        const sd = ctx.createRadialGradient(t.x - 6, t.y - 7, 2, t.x, t.y, 24)
        sd.addColorStop(0, 'rgba(255,255,255,.35)'); sd.addColorStop(0.5, 'rgba(255,255,255,0)'); sd.addColorStop(1, 'rgba(0,0,0,.2)')
        poly(body); ctx.fillStyle = sd; ctx.fill()
        ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke()
        // dome rim + small glint
        poly(dome); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(80,90,100,.55)'; ctx.stroke()
        ctx.beginPath(); ctx.ellipse(t.x - 8, t.y - 10, 6, 3, -0.6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill()
      }
      ctx.restore()
      pathOf(p); ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(50,60,70,.75)'; ctx.stroke()
      if (p === selRef.current) { ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd24a'; ctx.stroke() }
      ctx.restore()
    }

    // live cut preview — shows the line that will really be cut, per piece
    if (g && g.mode === 'cut') {
      const sp = smoothPath(g.path)
      const lv = liveRef.current
      // the pieces this swipe would create: tinted, each with its billable tablet count
      if (lv && lv.status === 'ok') {
        lv.parts.forEach((pc, i) => {
          ctx.save(); ctx.translate(pc.ox, pc.oy); pathOf(pc)
          ctx.fillStyle = i % 2 ? 'rgba(59,130,246,.26)' : 'rgba(52,211,153,.26)'; ctx.fill('evenodd')
          const [, by0, bx1] = bbox(pc), cx = bx1 - 5, cy = by0 + 5   // badge on the piece's top-right corner, clear of the tablets
          ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fillStyle = 'rgba(16,24,32,.9)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke()
          ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(String(lv.counts[i]), cx, cy + 0.5); ctx.restore()
        })
      }
      if (props.current.cutStyle === 'straight') {
        // straight: full-width line per touched piece; green = will cut, red = would damage tablets
        for (const pl of planStraight(piecesRef.current, g.path, tablets, sh)) {
          ctx.save(); ctx.translate(pl.piece.ox, pl.piece.oy); pathOf(pl.piece); ctx.clip('evenodd')
          ctx.beginPath(); ctx.moveTo(pl.line[0].x, pl.line[0].y); ctx.lineTo(pl.line[1].x, pl.line[1].y)
          if (pl.snapped && !pl.blocked) { ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(52,211,153,.3)'; ctx.stroke() }   // magnet glow
          ctx.setLineDash(pl.blocked ? [4, 5] : []); ctx.lineWidth = pl.snapped ? 3.2 : 2.5; ctx.strokeStyle = pl.blocked ? '#ff3b30' : '#34d399'; ctx.stroke(); ctx.restore()
          // red rings on every tablet this line would damage
          for (const t of pl.hits) { poly(outline(sh, { x: t.x + pl.piece.ox, y: t.y + pl.piece.oy }, 1.2, 40)); ctx.lineWidth = 2.2; ctx.strokeStyle = '#ff3b30'; ctx.stroke() }
        }
      } else {
        ctx.beginPath(); sp.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff5a4e'; ctx.stroke(); ctx.globalAlpha = 1
        for (const p of piecesRef.current) {
          ctx.save(); ctx.translate(p.ox, p.oy); pathOf(p); ctx.clip('evenodd')
          const lp = deflect(sp.map(q => ({ x: q.x - p.ox, y: q.y - p.oy })), ownTablets(p, tablets), sh)
          ctx.beginPath(); lp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
          ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff5a4e'; ctx.stroke(); ctx.restore()
        }
      }
    }
  }, [])

  // ── load / reset ───────────────────────────────────────────────────────────
  const load = useCallback(() => {
    const { W, H, tablets, ring } = layoutBlister(packSize, props.current.shape)
    const v = view.current
    const wW = v.cssW / v.scale, wH = v.cssH / v.scale
    tabletsRef.current = tablets
    // A fresh blister is ALWAYS one intact polygon — never pre-cut.
    piecesRef.current = [{ id: idRef.current++, rings: [[ring]], ox: (wW - W) / 2, oy: Math.max(8, (wH - H) / 2) }]
    cancelAnimationFrame(animRef.current); window.clearTimeout(reloadRef.current); liveRef.current = null; lastTapRef.current = null
    historyRef.current = []; selRef.current = null; gRef.current = null
    draw(); force()
  }, [packSize, draw])

  const resize = useCallback(() => {
    const wrap = wrapRef.current, cv = cvRef.current; if (!wrap || !cv) return
    const w = wrap.getBoundingClientRect().width
    const v = view.current
    // Canvas height follows the strip: tall strips (up to 8 rows) get a taller bench,
    // and the blister is scaled so BOTH its width and height fit with room to move pieces.
    const { W, H } = layoutBlister(props.current.packSize, props.current.shape)
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
  useEffect(() => { draw() }, [shape, colors, blisterColor, draw])
  useEffect(() => () => { window.clearTimeout(reloadRef.current); cancelAnimationFrame(animRef.current) }, [])

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
    // Strip used up (every piece is in the basket, or only scrap with no whole tablet is left): load a fresh
    // blister so the next sale can start straight away. The short pause lets the last piece visibly land first.
    if (!piecesRef.current.some(p => countTablets(p, tabletsRef.current, props.current.shape).whole > 0)) {
      window.clearTimeout(reloadRef.current)
      reloadRef.current = window.setTimeout(() => { load(); say('Strip finished — a new blister is loaded.') }, 450)
    }
  }

  // Runs the real cutting code on the swipe so far (≈20×/s) and keeps the result for drawing + the status line.
  const updateLive = (g: Gesture) => {
    let len = 0
    for (let i = 1; i < g.path.length; i++) len += Math.hypot(g.path[i].x - g.path[i - 1].x, g.path[i].y - g.path[i - 1].y)
    const prev = liveRef.current
    if (len * view.current.scale < MIN_SWIPE * 0.5) { if (prev) { liveRef.current = null; force() } return }
    const pv = previewCut(piecesRef.current, smoothPath(g.path), tabletsRef.current, props.current.shape, props.current.cutStyle)
    liveRef.current = pv
    if (!prev || prev.text !== pv.text) {
      force()
      if ((!prev || prev.status !== pv.status) && pv.status !== 'short' && pv.status !== 'none')
        navigator.vibrate?.(pv.status === 'ok' ? 8 : [6, 40, 6])   // a tick when the cut becomes valid, a double tick when it would damage
    }
  }

  // After a cut the new pieces slide a few px apart so the split is plain to see.
  const nudgeApart = (before: Piece[], after: Piece[]) => {
    const fresh = after.filter(p => !before.includes(p)), gone = before.filter(p => !after.includes(p))
    const mid = (p: Piece) => { const [x0, y0, x1, y1] = bbox(p); return { x: p.ox + (x0 + x1) / 2, y: p.oy + (y0 + y1) / 2 } }
    const moves = fresh.map(p => {
      const par = gone.find(q => q.ox === p.ox && q.oy === p.oy), c = mid(p), o = par ? mid(par) : c
      const dx = c.x - o.x, dy = c.y - o.y, l = Math.hypot(dx, dy) || 1
      return { p, x: p.ox, y: p.oy, dx: (dx / l) * 7, dy: (dy / l) * 7 }
    })
    if (moves.length < 2) return
    const t0 = performance.now()
    cancelAnimationFrame(animRef.current)
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 160), e = 1 - (1 - k) ** 3
      for (const m of moves) { m.p.ox = m.x + m.dx * e; m.p.oy = m.y + m.dy * e }
      draw()
      if (k < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }

  const onDown = (e: React.PointerEvent) => {
    if (gRef.current) return
    cvRef.current!.setPointerCapture(e.pointerId)
    const p = pt(e)
    const g: Gesture = { id: e.pointerId, start: p, last: p, path: [p], mode: 'pending', piece: hit(p), dragged: false, prevAt: 0, timer: null }
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
    if (g.mode === 'cut') {
      const l = g.path[g.path.length - 1]
      if (Math.hypot(p.x - l.x, p.y - l.y) >= 2.5) g.path.push(p)   // drop jitter: keeps the path light and smooth
      const now = performance.now()
      if (now - g.prevAt >= 50) { g.prevAt = now; updateLive(g) }
      draw()
    }
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
    liveRef.current = null
    if (hotRef.current) { hotRef.current = false; props.current.onHotChange?.(false) }
    if (!cancelled) {
      if (g.mode === 'cut') {
        let L = 0
        for (let i = 1; i < g.path.length; i++) L += Math.hypot(g.path[i].x - g.path[i - 1].x, g.path[i].y - g.path[i - 1].y)
        if (L * view.current.scale >= MIN_SWIPE) {
          const before = piecesRef.current
          const res = cutPieces(before, smoothPath(g.path), tabletsRef.current, props.current.shape, () => idRef.current++, props.current.cutStyle)
          if (res.changed) { historyRef.current.push(before.map(p => ({ ...p }))); piecesRef.current = res.pieces; selRef.current = null; navigator.vibrate?.(14); nudgeApart(before, res.pieces) }
          else if (res.reason) say(res.reason)
        }
      } else if (g.mode === 'pending') {
        // tap = select; a second tap on the same piece within DOUBLE_TAP_MS (double-tap / double-click) adds it to the basket
        const p = pt(e), h = hit(p), now = performance.now(), lt = lastTapRef.current
        selRef.current = h
        if (h && lt && lt.piece === h && now - lt.at <= DOUBLE_TAP_MS && Math.hypot(p.x - lt.x, p.y - lt.y) * view.current.scale <= 24) { lastTapRef.current = null; addPiece(h) }
        else lastTapRef.current = h ? { piece: h, at: now, x: p.x, y: p.y } : null
      }
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
  const live = gRef.current?.mode === 'cut' ? liveRef.current : null
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
      <div className="mt-2 min-h-[20px] text-xs text-[var(--text-3)]" aria-live="polite"
        style={live ? { fontWeight: 600, color: live.status === 'blocked' ? '#ff3b30' : live.status === 'ok' ? '#10b981' : undefined } : undefined}>
        {live ? live.text : counts
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
        Quick swipe = cut · Tap = select · Double-tap = add to basket · Press and hold, then drag = move · Drop on the basket to bill; when the strip is used up a fresh one loads.{' '}
        {cutStyle === 'straight'
          ? 'Straight: the cut is a straight line across the whole piece. It snaps to horizontal/vertical and to the middle of the gap between rows or columns, and is refused if it would damage a tablet (those tablets are ringed in red as you swipe).'
          : 'Free-form: the cut follows your (smoothed) swipe and bends around tablets, so none is damaged. The preview shows the tablets in each piece before you lift.'}
      </p>
    </div>
  )
}
