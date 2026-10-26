/**
 * blisterGeometry.ts — pure geometry for the Retail Sale blister workbench.
 *
 * No React, no DOM, no network. Everything here works in ONE coordinate system
 * ("world" units, 1 unit = 1 CSS px at scale 1): the polygon of every piece,
 * its tablets, the pointer path and the rendering all use it, so artwork can
 * never drift from geometry.
 *
 * Cutting is done with the `polygon-clipping` library (robust boolean
 * operations), not hand-written splitting: the swipe path is thickened into a
 * thin "kerf" polygon and subtracted from every piece it crosses. A piece
 * that ends up as two or more parts has really been separated.
 *
 * TABLETS ARE NEVER CUT. Before the kerf is built, any part of the swipe that
 * enters the protected zone around a tablet is replaced by an arc along the
 * edge of that zone (see `deflect`), so the cut bends around the tablet and
 * the tablet stays whole inside one piece.
 *
 * BILLABLE-TABLET RULE (`countTablets`): a tablet is billed only if its whole
 * dome outline lies inside the piece. Because cuts bend around tablets this is
 * always every tablet in the piece; a partial tablet is reported separately as
 * `cut` and is never billed (a safety net, e.g. for imported/legacy data).
 */
import polygonClipping from 'polygon-clipping'

export type Pt = { x: number; y: number }
export type Ring = [number, number][]
/** MultiPolygon: polygons → rings (first = outer, rest = holes) → points. */
export type MPoly = Ring[][]

export type ShapeName = 'round' | 'oval' | 'capsule' | 'square' | 'oblong' | 'diamond'
export const SHAPE_NAMES: ShapeName[] = ['round', 'oval', 'capsule', 'square', 'oblong', 'diamond']

/** [half-width, half-height, superellipse exponent] of the foil dome. */
export const SHAPES: Record<ShapeName, [number, number, number]> = {
  round:   [17, 17, 2],
  oval:    [18, 14, 2],
  capsule: [18, 11, 4],
  square:  [16, 16, 4],
  oblong:  [18, 10, 6],
  diamond: [18, 15, 1],
}

export interface Tablet { x: number; y: number }
export interface Piece { id: number; rings: MPoly; ox: number; oy: number }

export const KERF = 2.2        // half-width of the cut line
export const PROTECT = 1.25    // protected zone = dome outline × this
export const PITCH = 48        // distance between neighbouring tablets
export const MIN_PACK = 2
export const MAX_PACK = 40
export const PER_ROW = 5       // tablets per row (fewer only when the strip holds fewer than 5)

export function isShape(v: unknown): v is ShapeName {
  return typeof v === 'string' && (SHAPE_NAMES as string[]).includes(v)
}

/** "#aabbcc" or "#aabbcc,#ddeeff" → 1–2 valid colours (white if none valid). */
export function parseColors(v?: string | null): string[] {
  const parts = String(v ?? '').split(',').map(s => s.trim()).filter(c => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 2)
  return parts.length ? parts : ['#fbf8f0']
}

/** 5 tablets per row, filled row by row (10 → 2×5, 14 → 5+5+4, 40 → 8×5). Returns the intact blister geometry. */
export function layoutBlister(pack: number): { W: number; H: number; cols: number; rows: number; tablets: Tablet[]; ring: Ring } {
  const n = Math.min(MAX_PACK, Math.max(MIN_PACK, Math.floor(pack)))
  const cols = Math.min(PER_ROW, n)
  const rows = Math.ceil(n / cols)
  const W = cols * PITCH + 16, H = rows * PITCH + 16
  const tablets: Tablet[] = []
  for (let i = 0; i < n; i++) tablets.push({ x: 32 + (i % cols) * PITCH, y: 32 + Math.floor(i / cols) * PITCH })
  return { W, H, cols, rows, tablets, ring: roundedRect(W, H, 10) }
}

function roundedRect(W: number, H: number, r: number): Ring {
  const p: Ring = []
  const corners: [number, number, number][] = [[W - r, r, -90], [W - r, H - r, 0], [r, H - r, 90], [r, r, 180]]
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 6; i++) {
      const a = ((a0 + i * 15) * Math.PI) / 180
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  p.push(p[0])
  return p
}

// ── basic polygon helpers ────────────────────────────────────────────────────
function ringArea(r: Ring): number {
  let a = 0
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return Math.abs(a / 2)
}
export function area(mp: MPoly): number {
  let a = 0
  for (const poly of mp) {
    a += ringArea(poly[0])
    for (let i = 1; i < poly.length; i++) a -= ringArea(poly[i])
  }
  return a
}
/** Even-odd point-in-multipolygon. */
export function inside(mp: MPoly, x: number, y: number): boolean {
  let c = false
  for (const poly of mp) for (const r of poly)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
  return c
}
export function bbox(p: Piece): [number, number, number, number] {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9
  for (const poly of p.rings) for (const [x, y] of poly[0]) {
    a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y)
  }
  return [a, b, c, d]
}

/** Outline of a tablet's dome (scaled by s) as a polygon — used for drawing AND counting. */
export function outline(shape: ShapeName, t: Tablet, s: number, n: number): Ring {
  const [a, b, k] = SHAPES[shape]
  const o: Ring = []
  for (let i = 0; i < n; i++) {
    const th = (i * 2 * Math.PI) / n, c = Math.cos(th), sn = Math.sin(th)
    o.push([t.x + s * a * Math.sign(c) * Math.abs(c) ** (2 / k), t.y + s * b * Math.sign(sn) * Math.abs(sn) ** (2 / k)])
  }
  return o
}

// ── billable tablets ─────────────────────────────────────────────────────────
export function countTablets(piece: Piece, tablets: Tablet[], shape: ShapeName): { whole: number; cut: number } {
  let whole = 0, cut = 0
  for (const t of tablets) {
    const pts: [number, number][] = [[t.x, t.y], ...outline(shape, t, 0.95, 24)]
    let n = 0
    for (const [x, y] of pts) if (inside(piece.rings, x, y)) n++
    if (n === pts.length) whole++
    else if (n > 0) cut++
  }
  return { whole, cut }
}

// ── cut bends around tablets ─────────────────────────────────────────────────
export const ownTablets = (p: Piece, tablets: Tablet[]) => tablets.filter(t => inside(p.rings, t.x, t.y))

function inDome(shape: ShapeName, t: Tablet, x: number, y: number): boolean {
  const [a, b, k] = SHAPES[shape]
  return Math.abs((x - t.x) / (a * PROTECT)) ** k + Math.abs((y - t.y) / (b * PROTECT)) ** k < 1
}
function edgePt(shape: ShapeName, t: Tablet, th: number): Pt {
  const [a, b, k] = SHAPES[shape], c = Math.cos(th), s = Math.sin(th)
  return { x: t.x + PROTECT * a * Math.sign(c) * Math.abs(c) ** (2 / k), y: t.y + PROTECT * b * Math.sign(s) * Math.abs(s) ** (2 / k) }
}
function angOf(shape: ShapeName, t: Tablet, x: number, y: number): number {
  const [a, b] = SHAPES[shape]
  return Math.atan2((y - t.y) / b, (x - t.x) / a)
}

/** Replace every stretch of `path` inside a tablet's protected zone by an arc along the zone's edge. */
export function deflect(path: Pt[], tabs: Tablet[], shape: ShapeName): Pt[] {
  if (!tabs.length || !path.length) return path
  const d: Pt[] = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i], b = path[i - 1]
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 3))
    for (let k = 1; k <= n; k++) d.push({ x: b.x + ((a.x - b.x) * k) / n, y: b.y + ((a.y - b.y) * k) / n })
  }
  const out: Pt[] = []
  let cur: Tablet | null = null, thIn = 0, last: Pt = d[0]
  const arc = (t: Tablet, a0: number, a1: number) => {
    let df = a1 - a0
    while (df > Math.PI) df -= 2 * Math.PI
    while (df < -Math.PI) df += 2 * Math.PI
    const n = Math.max(2, Math.ceil(Math.abs(df) / 0.12))
    for (let k = 0; k <= n; k++) out.push(edgePt(shape, t, a0 + (df * k) / n))
  }
  for (const q of d) {
    const t = tabs.find(tt => inDome(shape, tt, q.x, q.y))
    if (t) {
      if (cur !== t) {
        if (cur) arc(cur, thIn, angOf(shape, cur, last.x, last.y))
        cur = t; thIn = angOf(shape, t, q.x, q.y)
      }
      last = q
    } else {
      if (cur) { arc(cur, thIn, angOf(shape, cur, q.x, q.y)); cur = null }
      out.push(q)
    }
  }
  if (cur) arc(cur, thIn, angOf(shape, cur, last.x, last.y))
  return out
}

// ── cutting ──────────────────────────────────────────────────────────────────
/** Thicken a polyline into one polygon (union of segment rectangles + joint octagons). */
function makeCutter(path: Pt[]): MPoly | null {
  if (!path.length) return null
  const s: Pt[] = [path[0]]
  for (const p of path) { const l = s[s.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) >= 5) s.push(p) }
  const e = path[path.length - 1]
  if (s[s.length - 1] !== e) s.push(e)
  if (s.length < 2) return null
  const shapes: MPoly[number][] = []
  for (let i = 0; i < s.length; i++) {
    const a = s[i]
    shapes.push([[...Array(8)].map((_, k) => [a.x + KERF * Math.cos((k * Math.PI) / 4), a.y + KERF * Math.sin((k * Math.PI) / 4)] as [number, number])])
    if (i) {
      const b = s[i - 1], dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1
      const nx = (-dy / l) * KERF, ny = (dx / l) * KERF
      shapes.push([[[b.x + nx, b.y + ny], [a.x + nx, a.y + ny], [a.x - nx, a.y - ny], [b.x - nx, b.y - ny]]])
    }
  }
  try {
    return (polygonClipping.union as any)(shapes[0], ...shapes.slice(1)) as MPoly
  } catch {
    return null
  }
}

export const MIN_PIECE_AREA = 90   // smaller fragments are rejected, never created
export const MIN_SWIPE = 40        // shorter swipes are ignored

export interface CutResult { pieces: Piece[]; changed: boolean; reason?: string }

/**
 * Apply one swipe (`path`, world coordinates) to every piece it crosses.
 * Pieces it does not separate are returned untouched (same object, same place).
 */
export function cutPieces(
  pieces: Piece[], path: Pt[], tablets: Tablet[], shape: ShapeName, newId: () => number,
): CutResult {
  const out: Piece[] = []
  let changed = false
  for (const p of pieces) {
    const local = path.map(q => ({ x: q.x - p.ox, y: q.y - p.oy }))
    const cutter = makeCutter(deflect(local, ownTablets(p, tablets), shape))
    if (!cutter) { out.push(p); continue }
    let res: MPoly
    try { res = (polygonClipping.difference as any)(p.rings, cutter) as MPoly } catch { out.push(p); continue }
    const parts = res.filter(g => area([g]) >= MIN_PIECE_AREA)
    if (res.length >= 2 && parts.length >= 2) {
      changed = true
      for (const g of parts) out.push({ id: newId(), rings: [g], ox: p.ox, oy: p.oy })
    } else out.push(p)
  }
  return changed ? { pieces: out, changed } : { pieces, changed: false, reason: 'Cut must go all the way across a piece' }
}
