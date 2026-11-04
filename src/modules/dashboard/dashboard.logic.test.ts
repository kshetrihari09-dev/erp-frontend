import assert from 'node:assert/strict'
import { pctChange, fmtPct, bucketLabel, dateLabel, stockSeverity, paymentName, paymentColor } from './dashboardUtils'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

ok('pctChange: growth, decline, flat', () => {
  assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(50, 100), -50); assert.equal(pctChange(100, 100), 0)
})
ok('pctChange: nothing to compare against → null (never Infinity/NaN)', () => {
  assert.equal(pctChange(100, 0), null); assert.equal(pctChange(0, 0), null); assert.equal(pctChange(5, -3), null)
  assert.equal(pctChange(NaN as any, 10), -100)
})
ok('fmtPct: precision, sign, true minus, zero', () => {
  assert.equal(fmtPct(12.345), '+12%'); assert.equal(fmtPct(3.26), '+3.3%'); assert.equal(fmtPct(-3.04), '−3%')
  assert.equal(fmtPct(0), '0%'); assert.equal(fmtPct(0.04), '0%'); assert.equal(fmtPct(-250), '−250%')
})
ok('bucketLabel: day / month, with and without year', () => {
  assert.equal(bucketLabel('2026-11-04', 'day'), '4 Nov'); assert.equal(bucketLabel('2026-11-04', 'day', true), '4 Nov 2026')
  assert.equal(bucketLabel('2026-03', 'month'), 'Mar'); assert.equal(bucketLabel('2026-03', 'month', true), 'Mar 2026')
})
ok('dateLabel: date-only and ISO strings read from digits; junk passes through', () => {
  assert.equal(dateLabel('2026-11-04'), '04 Nov 2026'); assert.equal(dateLabel('2026-01-09T18:15:00.000Z'), '09 Jan 2026')
  assert.equal(dateLabel(''), '—'); assert.equal(dateLabel(null), '—'); assert.equal(dateLabel('n/a'), 'n/a')
})
ok('stockSeverity: out / critical / low boundaries', () => {
  assert.equal(stockSeverity(0, 10), 'out'); assert.equal(stockSeverity(-2, 10), 'out')
  assert.equal(stockSeverity(5, 10), 'critical'); assert.equal(stockSeverity(6, 10), 'low'); assert.equal(stockSeverity(9, 10), 'low')
})
ok('paymentName / paymentColor: tidy names, stable colours, fallback for unknown modes', () => {
  assert.equal(paymentName('bank_transfer'), 'Bank transfer'); assert.equal(paymentName('CASH'), 'Cash'); assert.equal(paymentName(null), 'Cash')
  assert.equal(paymentColor('Bank Transfer', 0), paymentColor('bank_transfer', 3)); assert.equal(typeof paymentColor('mystery', 7), 'string')
})
console.log(`\n${n} test groups passed`)
