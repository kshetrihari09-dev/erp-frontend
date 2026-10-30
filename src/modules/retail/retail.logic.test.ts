import assert from 'node:assert/strict'
import {
  isUpright, straightSegment, planStraight, SNAP_DEG, layoutBlister, countTablets, deflect, ownTablets, outline, inside, area, cutPieces, parseColors, parseBlisterColor, shadeHex, PITCH_Y_UP, PITCH_X_UP, zoneOf, previewCut, smoothPath, SNAP_GAP,
  SHAPE_NAMES, SHAPES, KERF, PROTECT, MIN_PACK, MAX_PACK, type Piece, type Pt,
} from './blisterGeometry'
import { resolvePackaging, canCut, isBulk, PACKAGING_INSTRUCTION, PACKAGING_LABEL } from './packaging'
import { parseQuantity, parseUnitQty, setLineQty, isBulkUnit, MAX_WHOLE_QTY } from './retailBasket'
import { basketReducer, emptyBasket, lineId, hasCustomPrice, stockNeeded, serializeBasket, parseBasket, UNDO_LIMIT, STORE_MAX_AGE_MS, type BasketState, type BasketLine } from './retailBasket'
import { addUnitToBasket, defaultUnitPrice, kindOf } from './retailBasket'
import { addToBasket, totals, lineTotal, toHandoff, overStock, defaultPricePerTablet, isValidPrice, round2 } from './retailBasket'

/**
 * Pure-logic tests for Retail Sale (layout, tablet protection, counting, pricing, hand-off).
 * Run:  npx tsx src/modules/retail/retail.logic.test.ts
 * (These ran green against the repo's own modules before delivery.)
 */
let n = 0; const ok = (name: string, f: () => void) => { f(); n++; console.log('ok  ', name) }

// 1. valid scan → complete, uncut blister
ok('5 tablets per row, filled row by row, up to 8 rows (1..40)', () => {
  const rowsOf = (n: number) => { const l = layoutBlister(n); const by = new Map<number, number>(); l.tablets.forEach(t => by.set(t.y, (by.get(t.y) ?? 0) + 1)); return [...by.keys()].sort((a, b) => a - b).map(y => by.get(y)!) }
  assert.deepEqual(rowsOf(10), [5, 5]); assert.deepEqual(rowsOf(14), [5, 5, 4]); assert.deepEqual(rowsOf(15), [5, 5, 5])
  assert.deepEqual(rowsOf(20), [5, 5, 5, 5]); assert.deepEqual(rowsOf(40), [5, 5, 5, 5, 5, 5, 5, 5])
  assert.deepEqual(rowsOf(3), [3]); assert.deepEqual(rowsOf(2), [2]); assert.deepEqual(rowsOf(1), [1])
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
ok('every pack 1..40 lays out exactly `pack` tablets and all are whole', () => {
  for (let p = MIN_PACK; p <= MAX_PACK; p++) for (const sh of SHAPE_NAMES) {
    const { tablets, ring } = layoutBlister(p, sh)
    assert.equal(tablets.length, p)
    assert.deepEqual(countTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets, sh), { whole: p, cut: 0 })
  }
})
ok('protected zones of neighbouring tablets never overlap (a cut can always pass between)', () => {
  for (const sh of SHAPE_NAMES) {
    const { tablets } = layoutBlister(40, sh)
    for (const a of tablets) for (const b of tablets) {
      if (a === b) continue
      const zoneB = [[outline(sh, b, PROTECT, 64)]]
      // a point on A's protected boundary must not be strictly inside B's protected zone
      for (const [x, y] of outline(sh, a, PROTECT, 64)) assert.ok(!inside(zoneB, x, y), `${sh}: zones overlap`)
    }
  }
})
ok('deflect: swipes through the middle of tablets never touch a dome (all shapes, 400 random swipes)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (const sh of SHAPE_NAMES) {
    const { W, H, tablets } = layoutBlister(10, sh)
    for (let i = 0; i < 400; i++) {
      const a: Pt = { x: rnd() * W, y: rnd() * H }, b: Pt = { x: rnd() * W, y: rnd() * H }
      const path: Pt[] = Array.from({ length: 30 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / 29, y: a.y + ((b.y - a.y) * k) / 29 }))
      const out = deflect(path, tablets, sh)
      for (const q of out) for (const t of tablets) {
        const [bw, bh, kk] = zoneOf(sh)
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
ok('blister colour: valid hex or null; shading stays valid hex', () => {
  assert.equal(parseBlisterColor('#1E90FF'), '#1e90ff'); assert.equal(parseBlisterColor(''), null)
  assert.equal(parseBlisterColor(null), null); assert.equal(parseBlisterColor('blue'), null); assert.equal(parseBlisterColor('#12345'), null)
  assert.equal(shadeHex('#808080', 1), '#ffffff'); assert.equal(shadeHex('#808080', -1), '#000000'); assert.equal(shadeHex('#808080', 0), '#808080')
  for (const a of [-0.2, 0.3, 0.45]) assert.match(shadeHex('#1e90ff', a), /^#[0-9a-f]{6}$/)
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
  for (const v of [undefined, null, 0, -1, 41, 2.5]) assert.deepEqual(resolvePackaging({ unit: 'Strip', tablets_per_strip: v } as any), { status: 'needs-setup' })
})
ok('packaging: every Unit in the product form gets its own model', () => {
  const expect: Record<string, string> = { Bottle: 'bottle', Tube: 'tube', Vial: 'vial', Ampoule: 'ampoule', Sachet: 'sachet', Box: 'box', Pcs: 'piece', Kg: 'kg', Ltr: 'ltr' }
  for (const [unit, type] of Object.entries(expect)) {
    assert.deepEqual(resolvePackaging({ unit } as any), { status: 'ok', type }, unit)
    assert.deepEqual(resolvePackaging({ unit: unit.toUpperCase(), tablets_per_strip: null } as any), { status: 'ok', type })   // case-insensitive
    assert.equal(canCut(type as any), false)
  }
  for (const unit of ['Strip', 'Tablet', 'Capsule']) assert.deepEqual(resolvePackaging({ unit, tablets_per_strip: 10 } as any), { status: 'ok', type: 'blister' })
  assert.equal(Object.keys(expect).length + 3, 12)    // the 12 units in the product form
})
ok('packaging: unknown units and contradictory data are ambiguous, never guessed', () => {
  for (const unit of ['Dozen', 'Carton', '', undefined]) assert.equal(resolvePackaging({ unit } as any).status, 'ambiguous')
  for (const unit of ['Bottle', 'Tube', 'Vial', 'Ampoule', 'Sachet', 'Box', 'Pcs', 'Kg', 'Ltr'])
    assert.equal(resolvePackaging({ unit, tablets_per_strip: 10 } as any).status, 'ambiguous', unit)
})
ok('instructions are exactly the required wording', () => {
  assert.equal(PACKAGING_INSTRUCTION.blister, 'Swipe to cut · Double-tap or drag a piece to the basket.')
  assert.equal(PACKAGING_INSTRUCTION.bottle, 'Double-tap or drag the bottle to the basket.')
  assert.equal(PACKAGING_INSTRUCTION.tube, 'Double-tap or drag the tube to the basket.')
  assert.equal(PACKAGING_INSTRUCTION.vial, 'Double-tap or drag the vial to the basket.'); assert.equal(PACKAGING_INSTRUCTION.ampoule, 'Double-tap or drag the ampoule to the basket.')
  assert.equal(PACKAGING_INSTRUCTION.sachet, 'Double-tap or drag the sachet to the basket.'); assert.equal(PACKAGING_INSTRUCTION.box, 'Double-tap or drag the box to the basket.')
  assert.equal(PACKAGING_INSTRUCTION.piece, 'Double-tap or drag the item to the basket.')
  assert.match(PACKAGING_INSTRUCTION.kg, /quantity/); assert.match(PACKAGING_INSTRUCTION.ltr, /quantity/)
  for (const k of Object.keys(PACKAGING_LABEL)) assert.ok((PACKAGING_INSTRUCTION as any)[k], k)    // none missing
  assert.deepEqual(Object.keys(PACKAGING_LABEL).filter(k => isBulk(k as any)), ['kg', 'ltr'])
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

// ── straight cut style ──────────────────────────────────────────────────────
ok('straight: near-horizontal / near-vertical swipes snap exactly; others stay as drawn', () => {
  const [h0, h1] = straightSegment([{ x: 0, y: 50 }, { x: 200, y: 56 }])!      // ~1.7° → flat
  assert.equal(h0.y, h1.y); assert.equal(h0.y, 53); assert.equal(h0.x, 0); assert.equal(h1.x, 200)
  const [v0, v1] = straightSegment([{ x: 40, y: 0 }, { x: 46, y: 150 }])!      // ~2.3° off upright
  assert.equal(v0.x, v1.x); assert.equal(v0.x, 43)
  const [d0, d1] = straightSegment([{ x: 0, y: 0 }, { x: 100, y: 100 }])!      // 45°: untouched
  assert.deepEqual([d0, d1], [{ x: 0, y: 0 }, { x: 100, y: 100 }])
  assert.equal(SNAP_DEG, 7)
  assert.equal(straightSegment([{ x: 5, y: 5 }]), null); assert.equal(straightSegment([{ x: 5, y: 5 }, { x: 5, y: 5 }]), null)
})
ok('straight: a line between columns / between rows is clear; through tablets is blocked', () => {
  const { tablets, ring, W, H } = layoutBlister(10)
  const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  const plan = (a: Pt, b: Pt, sh: any = 'round') => planStraight([piece], [a, b], tablets, sh)
  const between = plan({ x: 56, y: 10 }, { x: 56, y: H - 10 })           // gap between col 0 and col 1
  assert.equal(between.length, 1); assert.equal(between[0].blocked, false)
  const rows = plan({ x: 10, y: 56 }, { x: W - 10, y: 56 })               // gap between the two rows
  assert.equal(rows[0].blocked, false)
  assert.equal(plan({ x: 32, y: 10 }, { x: 32, y: H - 10 })[0].blocked, true)          // straight through column 0
  assert.equal(plan({ x: 10, y: 32 }, { x: W - 10, y: 32 })[0].blocked, true)          // straight through row 0
  assert.equal(plan({ x: 10, y: 10 }, { x: W - 10, y: H - 10 })[0].blocked, true)      // diagonal through tablets
})
ok('straight: the line is extended edge to edge, past where the swipe started and stopped', () => {
  const { tablets, ring, W, H } = layoutBlister(10)
  const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  const [pl] = planStraight([piece], [{ x: 56, y: 30 }, { x: 56, y: 80 }], tablets, 'round')   // short swipe inside the strip
  const ys = pl.line.map(p => p.y).sort((a, b) => a - b)
  assert.ok(ys[0] < 0 && ys[1] > H)                                      // spans the whole piece
  assert.ok(pl.line.every(p => Math.abs(p.x - 56) < 1e-9))              // and is exactly vertical
})
ok('straight: only pieces the swipe passes over are planned; moved pieces use their own offset', () => {
  const { tablets, ring } = layoutBlister(10)
  const a: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  const b: Piece = { id: 2, rings: [[ring]], ox: 0, oy: 400 }           // far below, not touched
  const plans = planStraight([a, b], [{ x: 56, y: -5 }, { x: 56, y: 120 }], tablets, 'round')
  assert.equal(plans.length, 1); assert.equal(plans[0].piece, a)
  const moved: Piece = { id: 3, rings: [[ring]], ox: 200, oy: 50 }
  const [pm] = planStraight([moved], [{ x: 256, y: 40 }, { x: 256, y: 170 }], tablets, 'round')   // world x = 200 + 56
  assert.ok(pm.line.every(p => Math.abs(p.x - 56) < 1e-9)); assert.equal(pm.blocked, false)
})
ok('straight: cutPieces refuses a line that would damage tablets, and a swipe that touches nothing — nothing changes', () => {
  const { tablets, ring, H } = layoutBlister(10)
  const pieces: Piece[] = [{ id: 1, rings: [[ring]], ox: 0, oy: 0 }]
  const hit = cutPieces(pieces, [{ x: 32, y: -5 }, { x: 32, y: H + 5 }], tablets, 'round', () => 9, 'straight')
  assert.equal(hit.changed, false); assert.equal(hit.pieces, pieces); assert.match(hit.reason!, /damage tablets/)
  const miss = cutPieces(pieces, [{ x: 500, y: 0 }, { x: 500, y: 100 }], tablets, 'round', () => 9, 'straight')
  assert.equal(miss.changed, false); assert.equal(miss.pieces, pieces); assert.ok(miss.reason)
})

// ── Kg / Ltr quantities ─────────────────────────────────────────────────────
ok('parseQuantity: positive numbers up to 100000, 3 decimals; everything else rejected', () => {
  for (const [t, v] of [['1', 1], ['0.5', 0.5], ['.5', 0.5], ['2.', 2], [' 12.375 ', 12.375], ['1.2345', 1.235], ['100000', 100000]] as const) assert.equal(parseQuantity(t), v, t)
  for (const bad of ['', '  ', '0', '0.0004', '-1', 'abc', '1e3', '1,5', '1.2.3', '100001', 'Infinity', 'NaN']) assert.equal(parseQuantity(bad), null, bad)
})
const glucose: any = { id: 'g1', name: 'Glucose', unit: 'Kg', sales_rate: 160, current_stock: 10 }
ok('Kg/Ltr: a drop adds the typed quantity; repeated drops accumulate; line total = qty × rate', () => {
  let l = addUnitToBasket([], glucose, undefined, 2.5)
  assert.equal(l[0].units, 2.5); assert.equal(lineTotal(l[0]), 400)
  l = addUnitToBasket(l, glucose, undefined, 0.25)
  assert.equal(l.length, 1); assert.equal(l[0].units, 2.75); assert.equal(lineTotal(l[0]), 440); assert.equal(l[0].pieces, 2)
  for (const bad of [0, -1, NaN, Infinity]) assert.equal(addUnitToBasket(l, glucose, undefined, bad), l)
})
ok('Kg/Ltr: hand-off sends the decimal quantity at the product rate; stock checked in the same unit', () => {
  const l = addUnitToBasket([], glucose, undefined, 2.75)
  const [h] = toHandoff(l); assert.deepEqual([h.qty, h.rate, h.tablets, h.pack], [2.75, 160, 0, 1])
  assert.equal(overStock(addUnitToBasket([], glucose, undefined, 10)).length, 0)
  assert.equal(overStock(addUnitToBasket([], glucose, undefined, 10.001)).length, 1)
})

ok('single-tablet strip (1 per strip) is valid: one tablet, one whole row, billable as 1 tablet', () => {
  assert.deepEqual(resolvePackaging({ unit: 'Strip', tablets_per_strip: 1 } as any), { status: 'ok', type: 'blister' })
  const { W, H, cols, rows, tablets, ring } = layoutBlister(1)
  assert.equal(tablets.length, 1); assert.equal(cols, 1); assert.equal(rows, 1)
  assert.deepEqual(countTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets, 'round'), { whole: 1, cut: 0 })
  for (const sh of SHAPE_NAMES) assert.deepEqual(countTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets, sh), { whole: 1, cut: 0 }, sh)
  assert.ok(W >= 64 && H >= 64)
  // billing: 1 tablet of a 1-per-strip product is exactly 1 strip
  const one: any = { id: 'o1', name: 'Single capsule', sales_rate: 15, current_stock: 4, unit: 'Strip' }
  const [h] = toHandoff(addToBasket([], one, 1, 1))
  assert.deepEqual([h.qty, h.rate, h.tablets, h.pack], [1, 15, 1, 1])
  assert.equal(defaultPricePerTablet(one, 1), 15)
})
ok('pack sizes outside 1..40 or non-integers are still rejected', () => {
  for (const v of [0, -3, 41, 2.5, NaN]) assert.equal(resolvePackaging({ unit: 'Strip', tablets_per_strip: v } as any).status, 'needs-setup', String(v))
})
ok('capsule and oblong are upright (taller than wide); no other shape is', () => {
  assert.equal(isUpright('capsule'), true); assert.equal(isUpright('oblong'), true)
  for (const sh of SHAPE_NAMES.filter(x => x !== 'capsule' && x !== 'oblong')) assert.equal(isUpright(sh), false, sh)
  const ob = outline('oblong', { x: 0, y: 0 }, 1, 64), ox = ob.map(p => p[0]), oy = ob.map(p => p[1])
  assert.ok(Math.max(...oy) - Math.min(...oy) > 1.4 * (Math.max(...ox) - Math.min(...ox)))
  const t = { x: 100, y: 100 }
  const o = outline('capsule', t, 1, 64)
  const w = Math.max(...o.map(p => p[0])) - Math.min(...o.map(p => p[0])), h = Math.max(...o.map(p => p[1])) - Math.min(...o.map(p => p[1]))
  assert.ok(h > w * 1.4, `capsule ${w.toFixed(1)}×${h.toFixed(1)}`)          // 22 × 36
  assert.ok(Math.abs(o.reduce((s2, p) => s2 + p[0], 0) / o.length - 100) < 1e-6)   // centred
})
ok('upright tablets (capsule, oblong): strip is a little taller and narrower; every tablet whole; gaps stay open both ways', () => {
  const flat = layoutBlister(10, 'round')
  for (const shape of ['capsule', 'oblong'] as const) {
    const up = layoutBlister(10, shape)
    assert.ok(up.H > flat.H, 'taller'); assert.ok(up.W < flat.W, 'narrower')
    assert.ok(up.H - flat.H <= 24 && flat.W - up.W <= 40, 'only a little')
    for (const pack of [1, 5, 10, 14, 40]) {
      const { tablets, ring } = layoutBlister(pack, shape)
      assert.deepEqual(countTablets({ id: 1, rings: [[ring]], ox: 0, oy: 0 }, tablets, shape), { whole: pack, cut: 0 }, shape + pack)
    }
    const { tablets, ring, W, H } = layoutBlister(40, shape)
    const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
    // straight cuts midway between rows and between columns must stay clear
    for (let r = 1; r < 8; r++) { const y = 8 + PITCH_Y_UP * r; assert.equal(planStraight([piece], [{ x: 10, y }, { x: W - 10, y }], tablets, shape)[0].blocked, false, shape + ' row gap ' + y) }
    for (let c = 1; c < 5; c++) { const x = 8 + PITCH_X_UP * c; assert.equal(planStraight([piece], [{ x, y: 10 }, { x, y: H - 10 }], tablets, shape)[0].blocked, false, shape + ' col gap ' + x) }
    assert.equal(planStraight([piece], [{ x: tablets[0].x, y: 10 }, { x: tablets[0].x, y: H - 10 }], tablets, shape)[0].blocked, true)   // through a column of tablets
  }
})
ok('straight cut snaps to the middle of the gap between rows/columns — only when close to it', () => {
  const { tablets, ring, W, H } = layoutBlister(10, 'round')            // rows at y=32/80 → gap middle 56; columns 32,80,… → 56
  const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  const h = planStraight([piece], [{ x: -10, y: 62 }, { x: W + 10, y: 62 }], tablets, 'round')[0]
  assert.equal(h.snapped, true); assert.equal(h.blocked, false); assert.equal(h.line[0].y, 56); assert.equal(h.line[1].y, 56)
  const v = planStraight([piece], [{ x: 60, y: -10 }, { x: 60, y: H + 10 }], tablets, 'round')[0]
  assert.equal(v.snapped, true); assert.equal(v.line[0].x, 56)
  assert.ok(Math.abs(62 - 56) <= SNAP_GAP)
  const far = planStraight([piece], [{ x: -10, y: 100 }, { x: W + 10, y: 100 }], tablets, 'round')[0]
  assert.equal(far.snapped, false); assert.equal(far.blocked, true); assert.ok(far.hits.length >= 1)
  const diag = planStraight([piece], [{ x: 0, y: 0 }, { x: 100, y: 60 }], tablets, 'round')[0]
  assert.equal(diag.snapped, false)
  let id = 1
  const r = cutPieces([piece], [{ x: -10, y: 62 }, { x: W + 10, y: 62 }], tablets, 'round', () => ++id, 'straight')
  assert.equal(r.changed, true); assert.equal(r.pieces.length, 2)
  assert.deepEqual(r.pieces.map(p => countTablets(p, tablets, 'round').whole).sort(), [5, 5])
})
ok('smoothPath keeps the end points and calms a shaky swipe', () => {
  const raw: Pt[] = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 50 + (i % 2 ? 4 : -4) }))
  const sm = smoothPath(raw)
  assert.deepEqual(sm[0], raw[0]); assert.deepEqual(sm[sm.length - 1], raw[raw.length - 1]); assert.equal(sm.length, raw.length)
  for (const p of sm.slice(2, -2)) assert.ok(Math.abs(p.y - 50) < 2.5, 'jitter reduced')
  assert.deepEqual(smoothPath(raw.slice(0, 3)), raw.slice(0, 3))
})
ok('previewCut tells the truth before the finger lifts: ok + counts, blocked + hits, short, none', () => {
  const { tablets, ring, W, H } = layoutBlister(10, 'round')
  const piece: Piece = { id: 1, rings: [[ring]], ox: 0, oy: 0 }
  const across = (y: number): Pt[] => [{ x: -10, y }, { x: W + 10, y }]
  const ok1 = previewCut([piece], across(62), tablets, 'round', 'straight')
  assert.equal(ok1.status, 'ok'); assert.deepEqual([...ok1.counts].sort(), [5, 5]); assert.match(ok1.text, /snapped/)
  const bl = previewCut([piece], across(32), tablets, 'round', 'straight')
  assert.equal(bl.status, 'blocked'); assert.match(bl.text, /damage/)
  const none = previewCut([piece], [{ x: 900, y: 900 }, { x: 950, y: 900 }], tablets, 'round', 'straight')
  assert.equal(none.status, 'none')
  const short = previewCut([piece], [{ x: 10, y: 56 }, { x: 60, y: 56 }], tablets, 'round', 'free')
  assert.equal(short.status, 'short')
  const free = previewCut([piece], across(56), tablets, 'round', 'free')
  assert.equal(free.status, 'ok'); assert.deepEqual([...free.counts].sort(), [5, 5])
  // previewing never changes the bench
  assert.equal(piece.rings[0][0], ring); assert.equal(ok1.parts.every(p => p !== piece), true)
  for (const sh of SHAPE_NAMES) {
    const L = layoutBlister(10, sh), pc: Piece = { id: 1, rings: [[L.ring]], ox: 0, oy: 0 }
    const midY = (L.tablets[0].y + L.tablets[5].y) / 2
    const pv = previewCut([pc], [{ x: -10, y: midY }, { x: L.W + 10, y: midY }], L.tablets, sh, 'straight')
    assert.equal(pv.status, 'ok', sh); assert.deepEqual([...pv.counts].sort(), [5, 5], sh)
  }
})
ok('typed quantities: whole numbers for counted items, decimals only for Kg / Ltr', () => {
  assert.equal(parseUnitQty('3', false), 3); assert.equal(parseUnitQty(' 12 ', false), 12); assert.equal(parseUnitQty(String(MAX_WHOLE_QTY), false), MAX_WHOLE_QTY)
  for (const bad of ['', '0', '-1', '1.5', '2.', 'abc', '1e3', String(MAX_WHOLE_QTY + 1)]) assert.equal(parseUnitQty(bad, false), null, bad)
  assert.equal(parseUnitQty('1.5', true), 1.5); assert.equal(parseUnitQty('0.25', true), 0.25); assert.equal(parseUnitQty('0', true), null); assert.equal(parseUnitQty('x', true), null)
  assert.equal(isBulkUnit('Kg'), true); assert.equal(isBulkUnit(' LTR '), true); assert.equal(isBulkUnit('Bottle'), false); assert.equal(isBulkUnit(undefined), false)
})
ok('setLineQty: edit tablets / units in the basket; invalid input changes nothing; totals follow', () => {
  const mk = (id: string, unit: string, rate = 100) => ({ id, name: 'P' + id, unit, sales_rate: rate, current_stock: 1000 }) as any
  const tab = mk('1', 'Strip', 100), bot = mk('2', 'Bottle', 50), kg = mk('3', 'Kg', 80)
  let lines = addToBasket([], tab, 10, 4); lines = addToBasket(lines, tab, 10, 6)            // 2 pieces, 10 tablets
  lines = addUnitToBasket(lines, bot, undefined, 1); lines = addUnitToBasket(lines, kg, undefined, 0.5)
  assert.equal(totals(lines).tablets, 10)
  const a = setLineQty(lines, tab, 'tablets', 25)
  assert.equal(a.find(l => l.product.id === '1')!.tablets, 25); assert.equal(a.find(l => l.product.id === '1')!.edited, true)
  assert.equal(totals(a).tablets, 25); assert.equal(lineTotal(a.find(l => l.product.id === '1')!), 250)    // 25 × 10/tablet
  assert.equal(lines.find(l => l.product.id === '1')!.tablets, 10, 'original is not mutated')
  const b = setLineQty(a, bot, 'unit', 7); assert.equal(b.find(l => l.product.id === '2')!.units, 7); assert.equal(lineTotal(b.find(l => l.product.id === '2')!), 350)
  const c = setLineQty(b, kg, 'unit', 2.375); assert.equal(c.find(l => l.product.id === '3')!.units, 2.375); assert.equal(lineTotal(c.find(l => l.product.id === '3')!), 190)
  // invalid → same array back
  assert.equal(setLineQty(c, tab, 'tablets', 0), c); assert.equal(setLineQty(c, tab, 'tablets', 2.5), c); assert.equal(setLineQty(c, tab, 'tablets', -3), c)
  assert.equal(setLineQty(c, bot, 'unit', 1.5), c, 'a bottle cannot be 1.5'); assert.equal(setLineQty(c, kg, 'unit', 0), c); assert.equal(setLineQty(c, kg, 'unit', NaN), c)
  assert.equal(setLineQty(c, mk('99', 'Strip'), 'tablets', 5), c, 'unknown product')
  // the hand-off follows the edited quantity
  const h = toHandoff(c).find(x => x.product.id === '1')!; assert.equal(h.tablets, 25); assert.equal(h.qty, 2.5)
})
const P = (id: string, unit = 'Strip', rate = 100, stock = 1000) => ({ id, name: 'P' + id, unit, sales_rate: rate, current_stock: stock, barcode: 'B' + id }) as any
const run = (st: BasketState, ...acts: Parameters<typeof basketReducer>[1][]) => acts.reduce(basketReducer, st)

ok('basket model: pieces are logged, lines have a stable id and remember their default price', () => {
  const p = P('1')
  let st = run(emptyBasket, { type: 'addTablets', product: p, pack: 10, tablets: 4 }, { type: 'addTablets', product: p, pack: 10, tablets: 6 })
  const l = st.lines[0]
  assert.equal(st.lines.length, 1); assert.equal(l.tablets, 10); assert.equal(l.pieces, 2); assert.deepEqual(l.log, [4, 6])
  assert.equal(lineId(l), '1:tablets'); assert.equal(l.basePpt, 10); assert.equal(hasCustomPrice(l), false)
  st = run(st, { type: 'addUnit', product: P('2', 'Bottle', 50), qty: 2 })
  assert.equal(lineId(st.lines[1]), '2:unit'); assert.equal(st.lines[1].basePpt, 50)
})
ok('basket reducer: every real change is one undo step; no-ops are not', () => {
  const p = P('1'), bot = P('2', 'Bottle', 50)
  let st = run(emptyBasket, { type: 'addTablets', product: p, pack: 10, tablets: 5 }, { type: 'addUnit', product: bot, qty: 1 })
  assert.equal(st.past.length, 2)
  const noops = [
    { type: 'setQty', id: '1:tablets', qty: 2.5 }, { type: 'setQty', id: 'nope', qty: 3 }, { type: 'setPrice', id: '1:tablets', ppt: -1 },
    { type: 'setPrice', id: '1:tablets', ppt: 10 }, { type: 'resetPrice', id: '1:tablets' }, { type: 'remove', id: 'nope' }, { type: 'addTablets', product: p, pack: 10, tablets: 0 },
  ] as const
  for (const a of noops) assert.equal(basketReducer(st, a), st, JSON.stringify(a))
  assert.equal(basketReducer(emptyBasket, { type: 'clear' }), emptyBasket); assert.equal(basketReducer(emptyBasket, { type: 'undo' }), emptyBasket)
  const before = st.lines
  st = run(st, { type: 'setQty', id: '1:tablets', qty: 8 }, { type: 'setPrice', id: '1:tablets', ppt: 12 })
  assert.equal(st.lines[0].tablets, 8); assert.equal(st.lines[0].ppt, 12); assert.equal(hasCustomPrice(st.lines[0]), true)
  st = run(st, { type: 'resetPrice', id: '1:tablets' }); assert.equal(st.lines[0].ppt, 10); assert.equal(hasCustomPrice(st.lines[0]), false)
  st = run(st, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }); assert.equal(st.lines, before, 'undo restores the exact earlier lines')
  st = run(st, { type: 'remove', id: '2:unit' }); assert.deepEqual(st.lines.map(lineId), ['1:tablets'])
  st = run(st, { type: 'undo' }); assert.deepEqual(st.lines.map(lineId), ['1:tablets', '2:unit'], 'a removed line comes back')
  st = run(st, { type: 'clear' }); assert.equal(st.lines.length, 0)
  st = run(st, { type: 'undo' }); assert.equal(st.lines.length, 2, 'a cleared basket comes back')
})
ok('basket reducer: undo history is capped; restore starts a clean history', () => {
  let st = emptyBasket
  for (let i = 0; i < UNDO_LIMIT + 15; i++) st = run(st, { type: 'addTablets', product: P('1'), pack: 10, tablets: 1 })
  assert.equal(st.past.length, UNDO_LIMIT); assert.equal(st.lines[0].tablets, UNDO_LIMIT + 15)
  const r = run(st, { type: 'restore', lines: st.lines }); assert.equal(r.past.length, 0)
})
ok('stock check adds up a product across its lines', () => {
  const p = P('1', 'Strip', 100, 3)                      // 3 strips in stock, pack of 10 → 30 tablets
  let lines: BasketLine[] = basketReducer(emptyBasket, { type: 'addTablets', product: p, pack: 10, tablets: 20 }).lines    // 2 strips
  assert.equal(overStock(lines).length, 0); assert.equal(stockNeeded(lines, '1'), 2)
  lines = basketReducer({ lines, past: [] }, { type: 'addUnit', product: p, qty: 2 }).lines                                   // + 2 whole strips = 4 > 3
  assert.equal(stockNeeded(lines, '1'), 4); assert.equal(overStock(lines).length, 2, 'both lines of that product are flagged')
  assert.equal(overStock([...lines, ...basketReducer(emptyBasket, { type: 'addUnit', product: P('9', 'Bottle', 5, 100), qty: 1 }).lines]).length, 2, 'other products unaffected')
})
ok('saved basket: round-trips, and anything wrong is dropped instead of crashing the page', () => {
  const now = 1_700_000_000_000
  let st = run(emptyBasket, { type: 'addTablets', product: P('1'), pack: 10, tablets: 4 }, { type: 'addTablets', product: P('1'), pack: 10, tablets: 6 }, { type: 'addUnit', product: P('3', 'Kg', 80), qty: 2.5 }, { type: 'setPrice', id: '1:tablets', ppt: 11 })
  const back = parseBasket(serializeBasket(st.lines, now), now + 1000)
  assert.deepEqual(back, st.lines)
  // old format, corrupt, expired, from the future
  assert.deepEqual(parseBasket(null), []); assert.deepEqual(parseBasket(''), []); assert.deepEqual(parseBasket('{not json'), []); assert.deepEqual(parseBasket('[]'), [])
  assert.deepEqual(parseBasket(JSON.stringify({ v: 1, at: now, lines: st.lines }), now), [])
  assert.deepEqual(parseBasket(serializeBasket(st.lines, now), now + STORE_MAX_AGE_MS + 1), [])
  assert.deepEqual(parseBasket(serializeBasket(st.lines, now + 3_600_000), now), [])
  // bad lines are skipped, good ones kept; duplicates and absurd values rejected
  const good = st.lines[0] as any
  const mess = JSON.stringify({ v: 2, at: now, lines: [
    good, null, 5, { ...good, product: null }, { ...good, kind: 'x' }, { ...good, ppt: -3 }, { ...good, pack: 0 }, { ...good, tablets: 2.5 }, { ...good, tablets: 0 },
    { ...good, product: { ...good.product, id: '7' }, kind: 'unit', units: 0 }, { ...good, product: { ...good.product, id: '8' }, kind: 'unit', units: 1e9 }, good,
    { ...good, product: { ...good.product, id: '9' }, log: [1, 'x'] },
  ] })
  const kept = parseBasket(mess, now)
  assert.deepEqual(kept.map(lineId), ['1:tablets', '9:tablets']); assert.equal(kept[1].log, undefined, 'a bad log is ignored, the line is kept')
  assert.equal(parseBasket(JSON.stringify({ v: 2, at: now, lines: Array.from({ length: 500 }, (_, i) => ({ ...good, product: { ...good.product, id: 'x' + i } })) }), now).length, 200)
})
console.log(`\n${n} test groups passed`)
