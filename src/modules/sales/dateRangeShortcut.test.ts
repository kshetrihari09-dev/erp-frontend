/** Run: npx tsx src/modules/sales/dateRangeShortcut.test.ts   (pure checks; the button-pressing part needs a DOM and is covered in the browser) */
import assert from 'node:assert/strict'
import { isDateRangeKey, isTypingTarget, DATE_RANGE_KEY_LABEL, DATE_RANGE_SHORTCUT } from './dateRangeShortcut'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }
const key = (o: Partial<Parameters<typeof isDateRangeKey>[0]> = {}) => ({ key: 'D', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false, isComposing: false, ...o })

ok('Shift+D matches (either case of the key value)', () => { assert.equal(isDateRangeKey(key()), true); assert.equal(isDateRangeKey(key({ key: 'd' })), true) })
ok('anything else does not', () => {
  assert.equal(isDateRangeKey(key({ shiftKey: false, key: 'd' })), false, 'plain d')
  assert.equal(isDateRangeKey(key({ ctrlKey: true })), false); assert.equal(isDateRangeKey(key({ altKey: true })), false); assert.equal(isDateRangeKey(key({ metaKey: true })), false)
  assert.equal(isDateRangeKey(key({ key: 'F' })), false); assert.equal(isDateRangeKey(key({ repeat: true })), false); assert.equal(isDateRangeKey(key({ isComposing: true })), false)
})
ok('typing targets are recognised', () => {
  for (const tagName of ['input', 'INPUT', 'textarea', 'Select']) assert.equal(isTypingTarget({ tagName }), true, tagName)
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(isTypingTarget({ tagName: 'DIV', getAttribute: (n: string) => (n === 'contenteditable' ? '' : null) }), true)
  assert.equal(isTypingTarget({ tagName: 'DIV', getAttribute: () => 'false' }), false)
  for (const t of [{ tagName: 'BUTTON' }, { tagName: 'BODY' }, { tagName: 'DIV' }, null, undefined, 'x', 5]) assert.equal(isTypingTarget(t), false, String(t))
})
ok('labels', () => { assert.equal(DATE_RANGE_KEY_LABEL, 'Shift+D'); assert.equal(DATE_RANGE_SHORTCUT, 'f4') })
console.log(`\n${n} test groups passed`)
