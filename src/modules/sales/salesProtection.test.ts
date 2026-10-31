/** Run: npx tsx src/modules/sales/salesProtection.test.ts */
import assert from 'node:assert/strict'
import { getSaleLock, isSalesLockedError, friendlyProtectionError, DEFAULT_SALES_POLICY } from './salesProtection'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
const NOW = Date.parse('2082-01-10T12:00:00Z')
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const sale = (o: Partial<{ status: any; created_at: string; date_ad: string }> = {}) => ({ status: 'active' as const, created_at: ago(1), date_ad: '2082-01-10', ...o })

ok('fresh active invoice is open: can cancel and change party; says how long is left', () => {
  const l = getSaleLock(sale({ created_at: ago(2) }), DEFAULT_SALES_POLICY, NOW)
  assert.deepEqual([l.canCancel, l.canEditParty, l.locked, l.code, l.label], [true, true, false, null, null])
  assert.equal(l.hoursLeft, 22); assert.match(l.reasons[0], /22 more hours/)
  assert.equal(getSaleLock(sale({ created_at: ago(23.5) }), undefined, NOW).hoursLeft, 1); assert.match(getSaleLock(sale({ created_at: ago(23.5) }), undefined, NOW).reasons[0], /1 more hour,/)
})
ok('older than the window → locked (no cancel, no party change), with a plain reason', () => {
  const l = getSaleLock(sale({ created_at: ago(25) }), DEFAULT_SALES_POLICY, NOW)
  assert.deepEqual([l.canCancel, l.canEditParty, l.locked, l.code, l.label], [false, false, true, 'aged', 'Locked'])
  assert.match(l.reasons[0], /more than 24 hours ago/); assert.match(l.reasons[0], /Sales Return/)
  assert.equal(getSaleLock(sale({ created_at: ago(24) }), undefined, NOW).locked, false, 'exactly 24 h is still inside')
})
ok('cancelled and returned invoices are frozen', () => {
  for (const [status, code] of [['cancelled', 'cancelled'], ['returned', 'returned']] as const) {
    const l = getSaleLock(sale({ status }), DEFAULT_SALES_POLICY, NOW)
    assert.deepEqual([l.canCancel, l.canEditParty, l.locked, l.code], [false, false, true, code])
  }
})
ok('closed accounting period locks even a brand-new invoice; later dates are unaffected', () => {
  const p = { lockAfterHours: 24, closedThrough: '2081-12-31' }
  const l = getSaleLock(sale({ date_ad: '2081-12-30', created_at: ago(1) }), p, NOW)
  assert.deepEqual([l.locked, l.code, l.label], [true, 'closed', 'Period closed']); assert.match(l.reasons[0], /2081-12-31/)
  assert.equal(getSaleLock(sale({ date_ad: '2081-12-31' }), p, NOW).code, 'closed', 'the closing day itself is closed')
  assert.equal(getSaleLock(sale({ date_ad: '2082-01-01' }), p, NOW).locked, false)
  assert.equal(getSaleLock(sale({ date_ad: '2081-12-30T05:00:00Z' }), p, NOW).code, 'closed', 'a timestamp date is read as its day')
})
ok('policy knobs: lockAfterHours 0 disables the age lock; unknown posting time is not guessed', () => {
  assert.equal(getSaleLock(sale({ created_at: ago(500) }), { lockAfterHours: 0, closedThrough: null }, NOW).locked, false)
  for (const bad of ['', 'not a date', undefined as any]) { const l = getSaleLock(sale({ created_at: bad }), DEFAULT_SALES_POLICY, NOW); assert.deepEqual([l.locked, l.canCancel, l.hoursLeft], [false, true, null]) }
})
ok('server refusals are recognised and made readable; other errors pass through', () => {
  const e1 = { message: 'SALES_LOCKED: invoice S-12 cannot be cancelled (it was posted more than 24 hours ago).' }
  assert.equal(isSalesLockedError(e1), true); assert.equal(isSalesLockedError({ code: 'SL001' }), true); assert.equal(isSalesLockedError({ response: { data: { code: 'SL001' } } }), true)
  assert.equal(isSalesLockedError(new Error('Network down')), false); assert.equal(isSalesLockedError(null), false)
  const m = friendlyProtectionError(e1)
  assert.match(m, /^Invoice S-12 cannot be cancelled/); assert.doesNotMatch(m, /SALES_LOCKED/); assert.match(m, /Sales Return/)
  assert.equal(friendlyProtectionError({ message: 'Network down' }), 'Network down'); assert.equal(friendlyProtectionError(undefined), 'Something went wrong')
  assert.match(friendlyProtectionError({ response: { data: { message: 'error: SALES_LOCKED: invoice A cannot be deleted - cancel it instead.' } } }), /^Invoice A cannot be deleted/)
})
console.log(`\n${n} test groups passed`)
