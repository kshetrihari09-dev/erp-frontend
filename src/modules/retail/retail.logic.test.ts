import assert from 'node:assert/strict'
import {
  layoutBlister, countTablets, deflect, ownTablets, outline, inside, area, cutPieces, parseColors,
  SHAPE_NAMES, SHAPES, KERF, PROTECT, MIN_PACK, MAX_PACK, type Piece, type Pt,
} from './blisterGeometry'
import { resolvePackaging, canCut, PACKAGING_INSTRUCTION } from './packaging'
import { addUnitToBasket, defaultUnitPrice, kindOf } from './retailBasket'
import { addToBasket, totals, lineTotal, toHandoff, overStock, defaultPricePerTablet, isValidPrice, round2 } from './retailBasket'

/**
 * Pure-logic tests for Retail Sale (layout, tablet protection, counting, pricing, hand-off).
 * Run:  npx tsx src/modules/retail/retail.logic.test.ts
 * (These ran green against the repo's own modules before delivery.)
 */
let n = 0; const ok = (name: string, f: () => void) => { f(); n++; console.log('ok  ', name) }

// 1. valid scan → complete, uncut blister
ok('5 tablets per row, filled row by row, up to 8 rows (2..40)', () => {
  const rowsOf = (n: number) => { const l = layoutBlister(n); const by = new Map<number, number>(); l.tablets.forEach(t => by.set(t.y, (by.get(t.y) ?? 0) + 1)); return [...by.keys()].sort((a, b) => a - b).map(y => by.get(y)!) }
  assert.deepEqual(rowsOf(10), [5, 5]); assert.deepEqual(rowsOf(14), [5, 5, 4]); assert.deepEqual(rowsOf(15), [5, 5, 5])
  assert.deepEqual(rowsOf(20), [5, 5, 5, 5]); assert.deepEqual(rowsOf(40), [5, 5, 5, 5, 5, 5, 5, 5])
  assert.deepEqual(rowsOf(3), [3]); assert.deepEqual(rowsOf(2), [2])
  assert.equal(layoutBlister(40).rows, 8); assert.equal(layoutBlister(40).cols, 5)
  assert.equal(layoutBlister(99).tablets.length, 40)     // clamped, never more than 40
})
ok('10-pack: one intact piece, 10 tablets in 2 rows of 5', () => {
  const { W, H, tablets, ring } = layoutBlister(10)
  assert.equal(tablets.length, 10)
  assert.equal(new Set(tablets.map(t => t.y)).size, 2)
  assert.equal(new Set(tablets.map(t => t.x)).size, 5)
  const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  assert.ok(area(piece.rings) > 0.9 * W * H)
  assert.deepEqual(countTablets(piece, tablets, 'round'), { whole: 10, cut: 0 })
})
ok('every pack 2..40 lays out exactly `pack` tablets and all are whole', () => {
  for (let p = MIN_PACK; p <= MAX_PACK; p++) for (const sh of SHAPE_NAMES) {
    const { tablets, ring } = layoutBlister(p)
    assert.equal(tablets.length, p)
    assert.deepEqual(countTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets, sh), { whole: p, cut: 0 })
  }
})
ok('protected zones of neighbouring tablets never overlap (a cut can always pass between)', () => {
  for (const sh of SHAPE_NAMES) {
    const { tablets } = layoutBlister(40)
    for (const a of tablets) for (const b of tablets) {
      if (a === b) continue
      for (const [x, y] of outline(sh, a, PROTECT, 64)) {
        // a point on A's protected boundary must not be strictly inside B's protected zone
        const [bw, bh, k] = SHAPES[sh]
        const v = Math.abs((x - b.x) / (bw * PROTECT)) ** k + Math.abs((y - b.y) / (bh * PROTECT)) ** k
        assert.ok(v >= 1 - 1e-9, `${sh}: zones overlap`)
      }
    }
  }
})
// 5. cut through a tablet region: path bends round, never enters any dome
ok('deflect: swipes through the middle of tablets never touch a dome (all shapes, 400 random swipes)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (const sh of SHAPE_NAMES) {
    const { W, H, tablets } = layoutBlister(10)
    for (let i = 0; i < 400; i++) {
      const a: Pt = { x: rnd() * W, y: rnd() * H }, b: Pt = { x: rnd() * W, y: rnd() * H }
      const path: Pt[] = Array.from({ length: 30 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / 29, y: a.y + ((b.y - a.y) * k) / 29 }))
      const out = deflect(path, tablets, sh)
      for (const q of out) for (const t of tablets) {
        const [bw, bh, kk] = SHAPES[sh]
        // on or outside the protected zone, i.e. at least the margin away from the real dome
        const v = Math.abs((q.x - t.x) / (bw * PROTECT)) ** kk + Math.abs((q.y - t.y) / (bh * PROTECT)) ** kk
        assert.ok(v >= 1 - 1e-6, `${sh}: cut point inside protected zone`)
        // and the kerf (half-width KERF) cannot reach the real dome outline
      }
    }
  }
})
ok('deflect: the gap between the two rows is left straight (no detour)', () => {
  const { W, tablets } = layoutBlister(10)
  const out = deflect([{ x: 0, y: 56 }, { x: W, y: 56 }], tablets, 'round')
  assert.ok(out.every(p => Math.abs(p.y - 56) < 1e-9))
})
ok('deflect: a swipe that starts or ends on a tablet is moved to the tablet edge, not through it', () => {
  const { tablets } = layoutBlister(10)
  const t0 = tablets[0]
  const out = deflect([{ x: t0.x, y: t0.y }, { x: t0.x + 100, y: t0.y }], tablets, 'oval')
  const [bw, bh, kk] = SHAPES.oval
  assert.ok(out.every(q => Math.abs((q.x - t0.x) / (bw * PROTECT)) ** kk + Math.abs((q.y - t0.y) / (bh * PROTECT)) ** kk >= 1 - 1e-6))
})
ok('KERF is narrower than the protection margin for every shape (kerf cannot touch a dome)', () => {
  for (const sh of SHAPE_NAMES) { const [a, b] = SHAPES[sh]; assert.ok((PROTECT - 1) * Math.min(a, b) > KERF, sh) }
})
ok('ownTablets: only tablets whose centre is inside the piece', () => {
  const { tablets, ring } = layoutBlister(10)
  assert.equal(ownTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets).length, 10)
  const half: Piece = { id: 2, rings: [[[[0, 0], [100, 0], [100, 112], [0, 112], [0, 0]]]], ox: 0, oy: 0 }
  assert.equal(ownTablets(half, tablets).length, 4)       // x = 32 and 80, two rows
  assert.deepEqual(countTablets(half, tablets, 'round'), { whole: 4, cut: 0 })
})
ok('countTablets: a tablet divided by a boundary is reported as cut, never as whole', () => {
  const { tablets } = layoutBlister(10)
  const t0 = tablets[0]
  const edge: Piece = { id: 3, rings: [[[[0, 0], [t0.x, 0], [t0.x, 112], [0, 112], [0, 0]]]], ox: 0, oy: 0 }
  const c = countTablets(edge, tablets, 'round')
  assert.equal(c.whole, 0); assert.equal(c.cut, 2)
})
ok('inside() honours piece offset semantics (point-in-polygon + hole)', () => {
  const donut = [[ [[0,0],[10,0],[10,10],[0,10],[0,0]], [[3,3],[7,3],[7,7],[3,7],[3,3]] ]] as any
  assert.ok(inside(donut, 1, 1)); assert.ok(!inside(donut, 5, 5)); assert.ok(!inside(donut, 11, 5))
  assert.equal(area(donut), 100 - 16)
})
ok('parseColors: valid, two-tone, invalid → white', () => {
  assert.deepEqual(parseColors('#d9534f,#f5d76e'), ['#d9534f', '#f5d76e'])
  assert.deepEqual(parseColors('#abcdef'), ['#abcdef'])
  assert.deepEqual(parseColors('red;drop table'), ['#fbf8f0'])
  assert.deepEqual(parseColors(null), ['#fbf8f0'])
})

// ── basket / pricing ────────────────────────────────────────────────────────
const prod: any = { id: 'p1', name: 'Paracetamol', sales_rate: 20, current_stock: 5, unit: 'Strip' }
ok('price per tablet = strip rate ÷ pack; invalid prices rejected', () => {
  assert.equal(defaultPricePerTablet(prod, 10), 2)
  assert.equal(defaultPricePerTablet({ ...prod, sales_rate: NaN }, 10), 0)
  for (const bad of [-1, NaN, Infinity, '3' as any, undefined]) assert.equal(isValidPrice(bad), false)
  assert.ok(isValidPrice(0) && isValidPrice(2.5))
})
ok('a drop adds exactly once; the same medicine merges into one line', () => {
  let l = addToBasket([], prod, 10, 3)
  assert.equal(l.length, 1); assert.equal(l[0].pieces, 1); assert.equal(l[0].tablets, 3)
  l = addToBasket(l, prod, 10, 4)
  assert.equal(l.length, 1); assert.equal(l[0].pieces, 2); assert.equal(l[0].tablets, 7)
  assert.equal(addToBasket(l, prod, 10, 0), l); assert.equal(addToBasket(l, prod, 10, -2), l); assert.equal(addToBasket(l, prod, 10, 1.5), l)
})
ok('line total and grand total are exact', () => {
  let l = addToBasket([], prod, 10, 3)
  l = addToBasket(l, { ...prod, id: 'p2', name: 'B', sales_rate: 35 }, 14, 5)
  assert.equal(lineTotal(l[0]), 6)
  assert.equal(lineTotal(l[1]), round2(5 * 35 / 14))   // 12.5
  const t = totals(l)
  assert.deepEqual(t, { items: 2, pieces: 2, tablets: 8, units: 0, grand: round2(6 + 12.5) })
})
ok('hand-off: qty × rate equals tablets × price-per-tablet (fractional strips, e.g. 3 of 14)', () => {
  const l = addToBasket([], { ...prod, sales_rate: 35 }, 14, 3)
  const [h] = toHandoff(l)
  assert.equal(h.qty, Math.round(3 / 14 * 1e4) / 1e4)          // 0.2143
  assert.ok(Math.abs(h.qty * h.rate - lineTotal(l[0])) < 0.01)  // within a paisa
  assert.equal(h.rate, 35)
})
ok('hand-off uses an edited price per tablet', () => {
  const l = [{ ...addToBasket([], prod, 10, 4)[0], ppt: 2.5 }]
  const [h] = toHandoff(l); assert.equal(h.rate, 25); assert.equal(h.qty, 0.4)
})
ok('stock check works in strips', () => {
  const l = addToBasket([], prod, 10, 51)          // 5.1 strips needed, 5 in stock
  assert.equal(overStock(l).length, 1)
  assert.equal(overStock(addToBasket([], prod, 10, 50)).length, 0)
})

// ── packaging detection ─────────────────────────────────────────────────────
ok('packaging: Bottle and Tube units → bottle / tube; only a blister can be cut', () => {
  assert.deepEqual(resolvePackaging({ unit: 'Bottle' } as any), { status: 'ok', type: 'bottle' })
  assert.deepEqual(resolvePackaging({ unit: 'tube', tablets_per_strip: null } as any), { status: 'ok', type: 'tube' })
  assert.deepEqual(resolvePackaging({ unit: 'Strip', tablets_per_strip: 10 } as any), { status: 'ok', type: 'blister' })
  assert.deepEqual(resolvePackaging({ unit: 'Capsule', tablets_per_strip: 14 } as any), { status: 'ok', type: 'blister' })
  assert.equal(canCut('blister'), true); assert.equal(canCut('bottle'), false); assert.equal(canCut('tube'), false)
})
ok('packaging: a strip with no valid pack size needs setup (not guessed, not a bottle)', () => {
  for (const v of [undefined, null, 0, 1, 41, 2.5]) assert.deepEqual(resolvePackaging({ unit: 'Strip', tablets_per_strip: v } as any), { status: 'needs-setup' })
})
ok('packaging: unknown units and contradictory data are ambiguous, never guessed', () => {
  for (const unit of ['Vial', 'Ampoule', 'Sachet', 'Box', 'Pcs', 'Kg', 'Ltr', '', undefined])
    assert.equal(resolvePackaging({ unit } as any).status, 'ambiguous')
  assert.equal(resolvePackaging({ unit: 'Bottle', tablets_per_strip: 10 } as any).status, 'ambiguous')
  assert.equal(resolvePackaging({ unit: 'Tube', tablets_per_strip: 10 } as any).status, 'ambiguous')
  assert.equal(resolvePackaging({ unit: 'Box', tablets_per_strip: 10 } as any).status, 'ambiguous')
})
ok('instructions are exactly the required wording', () => {
  assert.equal(PACKAGING_INSTRUCTION.blister, 'Swipe to cut · Drag pieces to basket.')
  assert.equal(PACKAGING_INSTRUCTION.bottle, 'Drag bottle to basket.')
  assert.equal(PACKAGING_INSTRUCTION.tube, 'Drag tube to basket.')
})

// ── bottle / tube billing (intact units, never tablet counts) ───────────────
const bottle: any = { id: 'b1', name: 'Cough Syrup 100ml', unit: 'Bottle', sales_rate: 120, current_stock: 3, tablets_per_strip: null }
const tube: any = { id: 't1', name: 'Diclofenac Gel', unit: 'Tube', sales_rate: 85.5, current_stock: 2 }
ok('bottle: one drop = 1 unit at the product rate; repeated drops add 1 each; not derived from tablets', () => {
  let l = addUnitToBasket([], bottle)
  assert.equal(l.length, 1); assert.equal(kindOf(l[0]), 'unit'); assert.equal(l[0].units, 1); assert.equal(l[0].tablets, 0)
  assert.equal(lineTotal(l[0]), 120)
  l = addUnitToBasket(l, bottle)
  assert.equal(l.length, 1); assert.equal(l[0].units, 2); assert.equal(lineTotal(l[0]), 240)
  assert.equal(defaultUnitPrice(bottle), 120)
})
ok('tube: decimal rate kept exactly; totals mix tablet lines and unit lines correctly', () => {
  let l = addUnitToBasket([], tube)
  l = addToBasket(l, prod, 10, 3)
  l = addUnitToBasket(l, bottle)
  const t = totals(l)
  assert.deepEqual(t, { items: 3, pieces: 1, tablets: 3, units: 2, grand: round2(85.5 + 6 + 120) })
})
ok('hand-off for bottle/tube: whole units at the product rate (pack 1, no tablets); blister unchanged', () => {
  const l = addToBasket(addUnitToBasket(addUnitToBasket([], bottle), bottle), prod, 10, 4)
  const hs = toHandoff(l)
  const b = hs.find(h => h.product.id === 'b1')!, p = hs.find(h => h.product.id === 'p1')!
  assert.deepEqual([b.qty, b.rate, b.tablets, b.pack], [2, 120, 0, 1])
  assert.deepEqual([p.qty, p.rate, p.tablets, p.pack], [0.4, 20, 4, 10])
})
ok('hand-off uses an edited unit price; invalid unit price is rejected', () => {
  const l = [{ ...addUnitToBasket([], tube)[0], ppt: 80 }]
  assert.equal(toHandoff(l)[0].rate, 80)
  assert.equal(isValidPrice(-5), false)
})
ok('stock check for units is in whole packages', () => {
  let l = addUnitToBasket([], tube); l = addUnitToBasket(l, tube)       // 2 of 2
  assert.equal(overStock(l).length, 0)
  l = addUnitToBasket(l, tube)                                          // 3 of 2
  assert.equal(overStock(l).length, 1)
})
ok('a bottle line and a tablet line for the same product id stay separate lines', () => {
  const same: any = { ...prod }
  const l = addUnitToBasket(addToBasket([], same, 10, 2), same)
  assert.equal(l.length, 2)
})

console.log(`\n${n} test groups passed`)
