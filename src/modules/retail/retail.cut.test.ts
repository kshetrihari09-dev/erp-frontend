/**
 * Cutting tests that need the REAL `polygon-clipping` library (npm install first).
 * Run:  npx tsx src/modules/retail/retail.cut.test.ts
 *
 * NOTE: written without network access, so these have NOT been executed yet.
 * If one fails, treat it as a real finding and send me the output.
 */
import assert from 'node:assert/strict'
import { layoutBlister, cutPieces, countTablets, area, type Piece, type Pt } from './blisterGeometry'

let n = 0; const ok = (name: string, f: () => void) => { f(); n++; console.log('ok  ', name) }
const line = (a: Pt, b: Pt, k = 20): Pt[] => Array.from({ length: k }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (k - 1), y: a.y + ((b.y - a.y) * i) / (k - 1) }))
const fresh = (pack = 10, shape: any = 'round') => {
  const { tablets, ring, W, H } = layoutBlister(pack)
  let id = 1
  const start: Piece[] = [{ id: id++, rings: [[ring]], ox: 0, oy: 0 }]
  return { tablets, start, W, H, shape, nid: () => id++ }
}
const wholeTotal = (ps: Piece[], t: any, sh: any) => ps.reduce((s, p) => s + countTablets(p, t, sh).whole, 0)
const cutTotal = (ps: Piece[], t: any, sh: any) => ps.reduce((s, p) => s + countTablets(p, t, sh).cut, 0)

ok('vertical cut between columns separates into 2 real pieces, every tablet whole, none lost or doubled', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: 56, y: -10 }, { x: 56, y: f.H + 10 }), f.tablets, f.shape, f.nid)
  assert.ok(r.changed); assert.equal(r.pieces.length, 2)
  assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 10); assert.equal(cutTotal(r.pieces, f.tablets, f.shape), 0)
})
for (const shape of ['round', 'oval', 'capsule', 'square', 'oblong', 'diamond'] as const)
  ok(`diagonal swipe straight through tablets bends round them (${shape}): 2+ pieces, 0 damaged, 10 whole`, () => {
    const f = fresh(10, shape)
    const r = cutPieces(f.start, line({ x: 20, y: -10 }, { x: f.W - 20, y: f.H + 10 }), f.tablets, shape, f.nid)
    assert.ok(r.changed); assert.ok(r.pieces.length >= 2)
    assert.equal(cutTotal(r.pieces, f.tablets, shape), 0); assert.equal(wholeTotal(r.pieces, f.tablets, shape), 10)
  })
ok('irregular zig-zag swipe works and keeps all tablets whole', () => {
  const f = fresh()
  const path: Pt[] = [{ x: 70, y: -10 }, { x: 95, y: 30 }, { x: 70, y: 60 }, { x: 110, y: 90 }, { x: 100, y: f.H + 10 }]
  const r = cutPieces(f.start, path, f.tablets, f.shape, f.nid)
  assert.ok(r.changed); assert.equal(cutTotal(r.pieces, f.tablets, f.shape), 0); assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 10)
})
ok('repeated cuts on a resulting piece; untouched pieces keep identity and position', () => {
  const f = fresh()
  const r1 = cutPieces(f.start, line({ x: 56, y: -10 }, { x: 56, y: f.H + 10 }), f.tablets, f.shape, f.nid)
  const right = r1.pieces.reduce((a, b) => (a.rings[0][0][0][0] > b.rings[0][0][0][0] ? a : b))
  const left = r1.pieces.find(p => p !== right)!
  const r2 = cutPieces(r1.pieces, line({ x: 150, y: -10 }, { x: 150, y: f.H + 10 }), f.tablets, f.shape, f.nid)
  assert.ok(r2.changed); assert.ok(r2.pieces.length >= 3)
  assert.ok(r2.pieces.includes(left))                        // not re-created
  assert.equal(wholeTotal(r2.pieces, f.tablets, f.shape), 10)
  void right
})
ok('a swipe that does not cross a piece completely is rejected, nothing changes', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: 20, y: 56 }, { x: 60, y: 56 }), f.tablets, f.shape, f.nid)   // stops inside the blister
  assert.equal(r.changed, false); assert.equal(r.pieces, f.start); assert.ok(r.reason)
})
ok('a swipe entirely outside the blister changes nothing', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: -50, y: 300 }, { x: 400, y: 300 }), f.tablets, f.shape, f.nid)
  assert.equal(r.changed, false)
})
ok('self-intersecting swipe does not throw', () => {
  const f = fresh()
  const path: Pt[] = [{ x: 56, y: -10 }, { x: 56, y: 130 }, { x: 40, y: 130 }, { x: 80, y: 40 }, { x: 56, y: 40 }]
  assert.doesNotThrow(() => cutPieces(f.start, path, f.tablets, f.shape, f.nid))
})
ok('moved pieces cut correctly in their own coordinates', () => {
  const f = fresh()
  const moved: Piece[] = [{ ...f.start[0], ox: 120, oy: 40 }]
  const r = cutPieces(moved, line({ x: 120 + 56, y: 0 }, { x: 120 + 56, y: 300 }), f.tablets, f.shape, f.nid)
  assert.ok(r.changed); assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 10)
  assert.ok(r.pieces.every(p => p.ox === 120 && p.oy === 40))
})
ok('no tiny fragments are created', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: 3, y: -10 }, { x: 3, y: f.H + 10 }), f.tablets, f.shape, f.nid)  // shaves a sliver
  for (const p of r.pieces) assert.ok(area(p.rings) >= 90)
})
ok('largest strip (40 tablets, 5 × 8): a cut between rows and a cut between columns keep all 40 whole', () => {
  const f = fresh(40)
  const r1 = cutPieces(f.start, line({ x: -10, y: 56 }, { x: f.W + 10, y: 56 }), f.tablets, f.shape, f.nid)   // between row 1 and 2
  assert.ok(r1.changed); assert.equal(r1.pieces.length, 2)
  const r2 = cutPieces(r1.pieces, line({ x: 56, y: -10 }, { x: 56, y: f.H + 10 }), f.tablets, f.shape, f.nid)
  assert.ok(r2.changed); assert.ok(r2.pieces.length >= 3)
  assert.equal(wholeTotal(r2.pieces, f.tablets, f.shape), 40); assert.equal(cutTotal(r2.pieces, f.tablets, f.shape), 0)
})
ok('14-tablet strip (5+5+4): diagonal swipe through tablets keeps all 14 whole', () => {
  const f = fresh(14, 'oval')
  const r = cutPieces(f.start, line({ x: 10, y: -10 }, { x: f.W - 10, y: f.H + 10 }), f.tablets, 'oval', f.nid)
  assert.ok(r.changed); assert.equal(cutTotal(r.pieces, f.tablets, 'oval'), 0); assert.equal(wholeTotal(r.pieces, f.tablets, 'oval'), 14)
})
ok('STRAIGHT: a vertical swipe between columns separates 2 pieces with an exactly straight cut, all tablets whole', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: 56, y: 20 }, { x: 56, y: 90 }), f.tablets, f.shape, f.nid, 'straight')   // short swipe, line extends edge to edge
  assert.ok(r.changed); assert.equal(r.pieces.length, 2)
  assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 10); assert.equal(cutTotal(r.pieces, f.tablets, f.shape), 0)
})
ok('STRAIGHT: a nearly-horizontal swipe between the rows snaps flat and separates the rows', () => {
  const f = fresh()
  const r = cutPieces(f.start, line({ x: 10, y: 54 }, { x: f.W - 10, y: 58 }), f.tablets, f.shape, f.nid, 'straight')
  assert.ok(r.changed); assert.equal(r.pieces.length, 2)
  assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 10)
})
ok('STRAIGHT: a line through tablets is refused (no piece created); FREE-FORM on the same swipe bends round and works', () => {
  const f = fresh()
  const swipe = line({ x: 32, y: -10 }, { x: 32, y: f.H + 10 })
  const s = cutPieces(f.start, swipe, f.tablets, f.shape, f.nid, 'straight')
  assert.equal(s.changed, false); assert.equal(s.pieces, f.start)
  const fr = cutPieces(f.start, swipe, f.tablets, f.shape, f.nid, 'free')
  assert.ok(fr.changed); assert.equal(cutTotal(fr.pieces, f.tablets, f.shape), 0); assert.equal(wholeTotal(fr.pieces, f.tablets, f.shape), 10)
})
ok('STRAIGHT: a second straight cut across the resulting pieces separates them again, all tablets still whole', () => {
  const f = fresh()
  const r1 = cutPieces(f.start, line({ x: 56, y: -10 }, { x: 56, y: f.H + 10 }), f.tablets, f.shape, f.nid, 'straight')
  const r2 = cutPieces(r1.pieces, line({ x: 10, y: 56 }, { x: f.W - 10, y: 56 }), f.tablets, f.shape, f.nid, 'straight')
  assert.ok(r2.changed); assert.ok(r2.pieces.length >= 3); assert.equal(wholeTotal(r2.pieces, f.tablets, f.shape), 10)
})
ok('single-tablet strip: a cut beside the tablet separates the foil margin; the one tablet stays whole in one piece', () => {
  const f = fresh(1)
  const r = cutPieces(f.start, line({ x: 12, y: -10 }, { x: 12, y: f.H + 10 }), f.tablets, f.shape, f.nid, 'straight')
  assert.ok(r.changed)
  assert.equal(wholeTotal(r.pieces, f.tablets, f.shape), 1); assert.equal(cutTotal(r.pieces, f.tablets, f.shape), 0)
})
console.log(`\n${n} cut tests passed`)
