/** Run: see package.json "test:daterange" (esbuild bundle + node:test). */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AD_MIN, AD_MAX, adToYMD, ymdToAD, validateYMD, parseText, formatYMD, maskInput, bsMonthLengths, daysInMonth,
  monthBoundsAD, resolveRange, convertSystem, convertMode, stepText, describeRange, initialTexts, isLeapYear,
} from '../src/utils/dateRange'

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const R = (o: any) => resolveRange({ system: 'AD', mode: 'date', from: '', to: '', ...o })

test('known BS ↔ AD anchors (New Year days)', () => {
  assert.equal(ymdToAD('BS', { y: 2081, m: 1, d: 1 }), '2024-04-13')
  assert.equal(ymdToAD('BS', { y: 2082, m: 1, d: 1 }), '2025-04-14')
  assert.equal(ymdToAD('BS', { y: 2083, m: 1, d: 1 }), '2026-04-14')
  assert.deepEqual(adToYMD('2026-04-14', 'BS'), { y: 2083, m: 1, d: 1 })
  assert.deepEqual(adToYMD('2026-04-13', 'BS'), { y: 2082, m: 12, d: 30 })        // year transition: last day of 2082
  assert.deepEqual(adToYMD('2024-12-31', 'AD'), { y: 2024, m: 12, d: 31 })
})

test('EVERY day of BS 2000–2090: AD→BS→AD round-trips and the BS calendar advances by exactly one day', () => {
  let ad = AD_MIN, prev: any = null, count = 0
  while (ad <= AD_MAX) {
    // a few zones skipped a real calendar day (e.g. Pacific/Kiritimati never had 1994-12-31);
    // the machine cannot represent such a day locally, so it is not testable there
    const [cy, cm, cd] = ad.split('-').map(Number)
    if (new Date(cy, cm - 1, cd, 12).getDate() !== cd) {
      const sk = new Date(Date.UTC(cy, cm - 1, cd + 1)); ad = iso(sk.getUTCFullYear(), sk.getUTCMonth() + 1, sk.getUTCDate()); prev = null; continue
    }
    const bs = adToYMD(ad, 'BS')!
    assert.ok(bs, `no BS for ${ad}`)
    assert.equal(ymdToAD('BS', bs), ad, `round trip ${ad}`)
    if (prev) {
      const dim = daysInMonth('BS', prev.y, prev.m)
      const expect = prev.d < dim ? { y: prev.y, m: prev.m, d: prev.d + 1 } : prev.m < 12 ? { y: prev.y, m: prev.m + 1, d: 1 } : { y: prev.y + 1, m: 1, d: 1 }
      assert.deepEqual(bs, expect, `sequence break at ${ad}`)
    }
    prev = bs; count++
    const [y, m, d] = ad.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + 1))
    ad = iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  assert.ok(count > 32000)
})

test('variable BS month lengths (29–32 days) and year totals', () => {
  const len = bsMonthLengths(2083)!
  assert.deepEqual(len, [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30])
  for (let y = 2000; y <= 2090; y++) { const l = bsMonthLengths(y)!; assert.equal(l.length, 12); assert.ok(l.every(n => n >= 29 && n <= 32)); }
  assert.equal(validateYMD('BS', { y: 2083, m: 3, d: 32 }), null)                       // Asar 32 exists
  assert.match(validateYMD('BS', { y: 2083, m: 2, d: 32 })!, /only 31 days/)             // Jestha 32 does not
  assert.match(validateYMD('BS', { y: 2083, m: 8, d: 30 })!, /only 29 days/)
  assert.match(validateYMD('BS', { y: 2083, m: 13, d: 1 })!, /Month/)
  assert.match(validateYMD('BS', { y: 1999, m: 1, d: 1 })!, /2000–2090/)
  assert.equal(ymdToAD('BS', { y: 2083, m: 2, d: 32 }), null)                           // never rolls over silently
})

test('Gregorian validation incl. leap years and the supported window', () => {
  assert.equal(isLeapYear(2024), true); assert.equal(isLeapYear(1900), false); assert.equal(isLeapYear(2000), true); assert.equal(isLeapYear(2023), false)
  assert.equal(validateYMD('AD', { y: 2024, m: 2, d: 29 }), null)
  assert.match(validateYMD('AD', { y: 2023, m: 2, d: 29 })!, /only 28 days/)
  assert.match(validateYMD('AD', { y: 2026, m: 4, d: 31 })!, /only 30 days/)
  assert.match(validateYMD('AD', { y: 1900, m: 2, d: 29 })!, /between/)
  assert.match(validateYMD('AD', { y: 2100, m: 1, d: 1 })!, /between/)
  assert.equal(ymdToAD('AD', { y: 2028, m: 2, d: 29 }), '2028-02-29')
})

test('parsing, formatting (leading zeros) and the input mask', () => {
  assert.deepEqual(parseText('2083/06/01', 'date'), { y: 2083, m: 6, d: 1 })
  assert.deepEqual(parseText('2083-6-1', 'date'), { y: 2083, m: 6, d: 1 })
  assert.deepEqual(parseText('2083/06', 'month'), { y: 2083, m: 6, d: 1 })
  assert.equal(parseText('83/06/01', 'date'), null); assert.equal(parseText('2083/06', 'date'), null); assert.equal(parseText('abcd', 'date'), null)
  assert.equal(formatYMD({ y: 2083, m: 6, d: 1 }, 'date'), '2083/06/01'); assert.equal(formatYMD({ y: 2083, m: 6, d: 1 }, 'month'), '2083/06')
  assert.equal(maskInput('20830601', 'date'), '2083/06/01'); assert.equal(maskInput('2083', 'date'), '2083'); assert.equal(maskInput('20830', 'date'), '2083/0')
  assert.equal(maskInput('2083/06/0x1999', 'date'), '2083/06/01'); assert.equal(maskInput('2083061', 'month'), '2083/06')
})

test('resolveRange — Date mode, BS and AD, inclusive endpoints', () => {
  assert.deepEqual(R({ system: 'BS', from: '2083/01/01', to: '2083/01/31' }), { ok: true, fromAD: '2026-04-14', toAD: '2026-05-14' })
  assert.deepEqual(R({ system: 'AD', from: '2026/10/01', to: '2026/10/14' }), { ok: true, fromAD: '2026-10-01', toAD: '2026-10-14' })
  assert.deepEqual(R({ system: 'AD', from: '2026/10/14', to: '2026/10/14' }), { ok: true, fromAD: '2026-10-14', toAD: '2026-10-14' }) // same day allowed
  assert.deepEqual(R({ system: 'AD', from: '2024/02/29', to: '2024/03/01' }), { ok: true, fromAD: '2024-02-29', toAD: '2024-03-01' })
})

test('resolveRange — validation messages', () => {
  assert.deepEqual(R({ from: '', to: '2026/01/01' }), { ok: false, field: 'from', message: 'From is required' })
  assert.match((R({ from: '2026/13/01', to: '2026/01/01' }) as any).message, /From: Month must be/)
  assert.match((R({ from: '2026/01/01', to: '2026/02/30' }) as any).message, /To: 2026\/02 has only 28 days/)
  assert.match((R({ system: 'BS', from: '2083/02/32', to: '2083/03/01' }) as any).message, /only 31 days/)
  assert.deepEqual(R({ from: '2026/10/15', to: '2026/10/14' }), { ok: false, field: 'range', message: 'From cannot be later than To' })
  assert.match((R({ from: '26/1/1', to: '2026/01/01' }) as any).message, /use YYYY\/MM\/DD/)
  assert.equal(R({ system: 'BS', mode: 'month', from: '2083/06', to: '2083/05' }).ok, false)
})

test('Month mode — first/last day of each month in BS (28–32 days) and AD (leap Feb)', () => {
  assert.deepEqual(R({ system: 'BS', mode: 'month', from: '2083/03', to: '2083/03' }), { ok: true, fromAD: '2026-06-15', toAD: '2026-07-16' }) // Asar has 32 days
  assert.deepEqual(R({ system: 'BS', mode: 'month', from: '2083/08', to: '2083/08' }), { ok: true, fromAD: '2026-11-17', toAD: '2026-12-15' }) // Mangsir has 29
  assert.deepEqual(R({ system: 'AD', mode: 'month', from: '2024/02', to: '2024/02' }), { ok: true, fromAD: '2024-02-01', toAD: '2024-02-29' })
  assert.deepEqual(R({ system: 'AD', mode: 'month', from: '2023/02', to: '2023/03' }), { ok: true, fromAD: '2023-02-01', toAD: '2023-03-31' })
  // for every BS month, last day + 1 == first day of the next month (no gaps/overlaps)
  for (let y = 2000; y < 2090; y++) for (let m = 1; m <= 12; m++) {
    const b = monthBoundsAD('BS', y, m)!, n = monthBoundsAD('BS', m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)!
    const [yy, mm, dd] = b.lastAD.split('-').map(Number), nx = new Date(Date.UTC(yy, mm - 1, dd + 1))
    assert.equal(iso(nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate()), n.firstAD, `${y}/${m}`)
  }
})

test('switching BS ⇄ AD preserves the actual dates (both directions, both modes)', () => {
  const bs = { system: 'BS' as const, mode: 'date' as const, from: '2083/01/01', to: '2083/06/15' }
  const ad = convertSystem(bs, 'AD'); assert.deepEqual(ad, { from: '2026/04/14', to: '2026/10/01' })
  const back = convertSystem({ ...bs, system: 'AD', ...ad }, 'BS'); assert.deepEqual(back, { from: bs.from, to: bs.to })
  const a = R({ ...bs }) as any, b = R({ ...bs, system: 'AD', ...ad }) as any
  assert.equal(a.fromAD, b.fromAD); assert.equal(a.toAD, b.toAD)
  // month mode: From keeps first day of month, To keeps last day
  const m = { system: 'BS' as const, mode: 'month' as const, from: '2083/03', to: '2083/03' }
  assert.deepEqual(convertSystem(m, 'AD'), { from: '2026/06', to: '2026/07' })       // Asar 2083 spans Jun 15 – Jul 16
  // invalid text is kept (not silently replaced)
  assert.deepEqual(convertSystem({ ...bs, from: '2083/02/32' }, 'AD').from, '2083/02/32')
})

test('switching Date ⇄ Month keeps the selection', () => {
  const d = { system: 'BS' as const, mode: 'date' as const, from: '2083/03/10', to: '2083/04/05' }
  const m = convertMode(d, 'month'); assert.deepEqual(m, { from: '2083/03', to: '2083/04' })
  assert.deepEqual(convertMode({ ...d, mode: 'month', ...m }, 'date'), { from: '2083/03/01', to: '2083/04/31' })
  assert.deepEqual(convertMode({ system: 'AD', mode: 'month', from: '2024/02', to: '2024/02' }, 'date'), { from: '2024/02/01', to: '2024/02/29' })
})

test('arrow-key stepping across month and year boundaries', () => {
  assert.equal(stepText('BS', 'date', '2083/01/31', 1), '2083/02/01'); assert.equal(stepText('BS', 'date', '2083/03/32', 1), '2083/04/01')
  assert.equal(stepText('BS', 'date', '2083/12/30', 1), '2084/01/01'); assert.equal(stepText('BS', 'date', '2083/01/01', -1), '2082/12/30')
  assert.equal(stepText('AD', 'date', '2024/02/28', 1), '2024/02/29'); assert.equal(stepText('AD', 'date', '2023/12/31', 1), '2024/01/01')
  assert.equal(stepText('AD', 'month', '2026/12', 1), '2027/01'); assert.equal(stepText('BS', 'month', '2083/01', -1), '2082/12')
  assert.equal(stepText('AD', 'date', 'garbage', 1), null)
})

test('display helpers', () => {
  assert.equal(describeRange('2026-04-14', '2026-05-14', 'BS'), '2083/01/01 – 2083/01/31')
  assert.equal(describeRange('2026-04-14', '2026-05-14', 'AD'), '2026/04/14 – 2026/05/14')
  assert.deepEqual(initialTexts('2026-04-14', '2026-05-14', 'BS', 'date'), { from: '2083/01/01', to: '2083/01/31' })
  assert.deepEqual(initialTexts('2026-04-14', '2026-05-14', 'BS', 'month'), { from: '2083/01', to: '2083/01' })
})
