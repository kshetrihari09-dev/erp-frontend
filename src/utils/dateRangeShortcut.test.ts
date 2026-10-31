/** Run: npx tsx src/utils/dateRangeShortcut.test.ts   (pure checks; finding/pressing the button needs a DOM and is covered in the browser) */
import assert from 'node:assert/strict'
import { isDateRangeKey, isTypingTarget, looksLikeDateRange, DATE_RANGE_KEY_LABEL } from './dateRangeShortcut'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
const key = (o: Partial<Parameters<typeof isDateRangeKey>[0]> = {}) => ({ key: 'D', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false, isComposing: false, ...o })

ok('Shift+D matches (either case of the key value); anything else does not', () => {
  assert.equal(isDateRangeKey(key()), true); assert.equal(isDateRangeKey(key({ key: 'd' })), true)
  assert.equal(isDateRangeKey(key({ shiftKey: false, key: 'd' })), false, 'plain d')
  for (const m of ['ctrlKey', 'altKey', 'metaKey', 'repeat', 'isComposing'] as const) assert.equal(isDateRangeKey(key({ [m]: true })), false, m)
  assert.equal(isDateRangeKey(key({ key: 'F' })), false)
})
ok('typing targets are recognised', () => {
  for (const tagName of ['input', 'INPUT', 'textarea', 'Select']) assert.equal(isTypingTarget({ tagName }), true, tagName)
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isTypingTarget({ tagName: 'DIV', getAttribute: (a: string) => (a === 'contenteditable' ? '' : null) }), true)
  for (const t of [{ tagName: 'DIV', getAttribute: () => 'false' }, { tagName: 'BUTTON' }, { tagName: 'BODY' }, null, undefined, 'x', 5]) assert.equal(isTypingTarget(t), false, String(t))
})
ok('looksLikeDateRange: ranges and presets yes, single dates and other buttons no', () => {
  for (const t of ['All dates', 'all time', 'Select date range', 'Pick a period', 'Date range', 'Today', 'This month', 'Last 30 days', 'last 7 days',
    '01 Jan – 31 Jan', '1 Jan 2025 - 31 Jan 2025', '2025-01-01 → 2025-01-31', '2082-01-01 to 2082-01-31', 'From 01/01/2025 to 31/01/2025', '2082/04/01 - 2082/04/31', 'Filter by date range'])
    assert.equal(looksLikeDateRange(t), true, t)
  for (const t of ['', '   ', '2082-07-14', '14/07/2082', 'Invoice date', 'Save', 'Add item', 'Customer', 'Print', 'Export', 'Page 2 of 10', 'Rs. 1,250.00'])
    assert.equal(looksLikeDateRange(t), false, t)
})
ok('label', () => assert.equal(DATE_RANGE_KEY_LABEL, 'Shift+D'))
console.log(`\n${n} test groups passed`)
