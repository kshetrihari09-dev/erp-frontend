/** Component test (jsdom). Run via package.json "test:daterange". */
import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { useState } from 'react'
import { render, fireEvent, within, cleanup, act } from '@testing-library/react'
import { DateRangeFilter } from '../src/components/ui/DateRangePopup'
import useUIStore from '../src/store/uiStore'

const q = () => within(document.body)
const inputs = () => ({ from: q().getByLabelText('From') as HTMLInputElement, to: q().getByLabelText('To') as HTMLInputElement })
const selects = () => Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
const open = () => fireEvent.click(document.querySelector('.dr-trigger')!)
const type = (el: HTMLInputElement, v: string) => fireEvent.change(el, { target: { value: v } })

function setup(dateMode: 'AD' | 'BS' = 'BS') {
  useUIStore.setState({ dateMode })           // the popup starts in the app's current date system
  const calls: any[] = []
  // like the real report pages: the parent stores the applied range and passes it back down
  const Host = () => {
    const [rng, setRng] = useState({ fromAD: '2026-10-01', toAD: '2026-10-14' })
    return <DateRangeFilter fromAD={rng.fromAD} toAD={rng.toAD} onApply={r => { calls.push(r); setRng({ fromAD: r.fromAD, toAD: r.toAD }) }} />
  }
  const utils = render(<Host />)
  return { calls, ...utils }
}

test('popup has the reference layout: title, Function box, Date Type, By Date/Month, From, To, Set', () => {
  cleanup(); setup(); open()
  assert.equal(document.querySelector('.dr-title')!.textContent, 'Date Range')
  assert.equal(document.querySelector('legend')!.textContent, 'Function')
  const labels = Array.from(document.querySelectorAll('.dr-row label')).map(l => l.textContent)
  assert.deepEqual(labels, ['Date Type', 'By Date/Month', 'From', 'To'])
  const [t, m] = selects()
  assert.deepEqual(Array.from(t.options).map(o => o.text), ['BS', 'AD']); assert.deepEqual(Array.from(m.options).map(o => o.text), ['Date', 'Month'])
  assert.equal(document.querySelector('.dr-set')!.textContent, 'Set')
})

test('opens in BS showing the applied AD range converted (2026-10-01 = 2083/06/15)', () => {
  cleanup(); setup(); open()
  const { from, to } = inputs()
  assert.equal(from.value, '2083/06/15'); assert.equal(to.value, '2083/06/28')
})

test('switching BS ⇄ AD keeps the same dates', () => {
  cleanup(); setup(); open()
  const [t] = selects(); fireEvent.change(t, { target: { value: 'AD' } })
  assert.equal(inputs().from.value, '2026/10/01'); assert.equal(inputs().to.value, '2026/10/14')
  fireEvent.change(selects()[0], { target: { value: 'BS' } })
  assert.equal(inputs().from.value, '2083/06/15'); assert.equal(inputs().to.value, '2083/06/28')
})

test('Set with valid BS dates applies the converted AD range, then closes', async () => {
  cleanup(); const { calls } = setup(); open()
  type(inputs().from, '20830101'); type(inputs().to, '2083/01/31')
  assert.equal(inputs().from.value, '2083/01/01')                      // mask inserted the slashes
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(calls.length, 1)
  assert.deepEqual({ f: calls[0].fromAD, t: calls[0].toAD, s: calls[0].system, m: calls[0].mode }, { f: '2026-04-14', t: '2026-05-14', s: 'BS', m: 'date' })
  assert.equal(document.querySelector('.dr-pop'), null)                // closed after success
  assert.match(document.querySelector('.dr-trigger')!.textContent!, /2083\/01\/01 – 2083\/01\/31/)
})

test('invalid dates keep the popup open, show a message and do NOT apply', async () => {
  cleanup(); const { calls } = setup(); open()
  type(inputs().to, '2083/02/32')                                      // Jestha has 31 days
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(calls.length, 0); assert.ok(document.querySelector('.dr-pop'))
  assert.match(document.querySelector('.dr-err')!.textContent!, /To: 2083\/02 has only 31 days/)
  assert.ok(inputs().to.classList.contains('bad'))
  type(inputs().to, '2083/06/10'); type(inputs().from, '2083/06/15')   // From later than To
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(calls.length, 0); assert.match(document.querySelector('.dr-err')!.textContent!, /From cannot be later than To/)
  const [t] = selects(); fireEvent.change(t, { target: { value: 'AD' } }); type(inputs().from, '2023/02/29'); type(inputs().to, '2023/03/01')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(calls.length, 0); assert.match(document.querySelector('.dr-err')!.textContent!, /only 28 days/)    // 2023 is not a leap year
})

test('Month mode normalises to first/last day (BS Asar has 32 days; AD leap February)', async () => {
  cleanup(); const { calls } = setup(); open()
  fireEvent.change(selects()[1], { target: { value: 'month' } })
  assert.equal(inputs().from.value, '2083/06'); assert.equal(inputs().to.value, '2083/06')
  type(inputs().from, '208303'); type(inputs().to, '2083/03')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.deepEqual({ f: calls[0].fromAD, t: calls[0].toAD, m: calls[0].mode }, { f: '2026-06-15', t: '2026-07-16', m: 'month' })
  open(); fireEvent.change(selects()[0], { target: { value: 'AD' } }); fireEvent.change(selects()[1], { target: { value: 'month' } })
  type(inputs().from, '2024/02'); type(inputs().to, '2024/02')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.deepEqual({ f: calls[1].fromAD, t: calls[1].toAD }, { f: '2024-02-01', t: '2024-02-29' })
})

test('Date → Month → Date keeps the selection; Enter applies; ArrowUp/Down steps', async () => {
  cleanup(); const { calls } = setup(); open()
  fireEvent.change(selects()[1], { target: { value: 'month' } }); fireEvent.change(selects()[1], { target: { value: 'date' } })
  assert.equal(inputs().from.value, '2083/06/01'); assert.equal(inputs().to.value, '2083/06/31')   // Aswin 2083 has 31 days
  fireEvent.keyDown(inputs().from, { key: 'ArrowUp' }); assert.equal(inputs().from.value, '2083/06/02')
  fireEvent.keyDown(inputs().from, { key: 'ArrowDown' }); fireEvent.keyDown(inputs().from, { key: 'ArrowDown' }); assert.equal(inputs().from.value, '2083/05/31')
  await act(async () => { fireEvent.keyDown(inputs().to, { key: 'Enter' }) })
  assert.equal(calls.length, 1); assert.equal(calls[0].fromAD, '2026-09-16'); assert.equal(calls[0].toAD, '2026-10-17')
})

test('a failing onApply keeps the popup open with a message', async () => {
  cleanup()
  render(<DateRangeFilter fromAD="2026-10-01" toAD="2026-10-14" onApply={() => { throw new Error('Server said no') }} />); open()
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.ok(document.querySelector('.dr-pop')); assert.equal(document.querySelector('.dr-err')!.textContent, 'Server said no')
})

test('with the app in AD mode the popup opens in AD (same range, no conversion)', () => {
  cleanup(); setup('AD'); open()
  assert.equal(selects()[0].value, 'AD'); assert.equal(inputs().from.value, '2026/10/01'); assert.equal(inputs().to.value, '2026/10/14')
})
