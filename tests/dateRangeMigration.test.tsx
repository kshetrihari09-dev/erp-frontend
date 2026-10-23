// The Date Range popup (components/ui/DateRangePopup.tsx) now replaces the old From/To inputs on:
//   Sales Return list · Purchase Return list · Audit Log · Purchase Suggestions (custom) · Trial Balance
// These tests drive the REAL popup on the REAL pages and assert what reaches the API (AD, inclusive).
import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { useState } from 'react'
import { render, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useUIStore from '../src/store/uiStore'
import { DateRangeFilter } from '../src/components/ui/DateRangePopup'
import { adToYMD, formatYMD } from '../src/utils/dateRange'
import SalesReturnPage from '../src/modules/billing/SalesReturnPage'
import PurchaseReturnPage from '../src/modules/billing/PurchaseReturnPage'
import AuditLogSection from '../src/modules/settings/sections/AuditLogSection'
import PurchaseSuggestionsPage from '../src/modules/inventory/PurchaseSuggestionsPage'
import TrialBalTab from '../src/modules/accounting/tabs/TrialBalTab'
import { calls, paramsOf } from './mock-api-date-range'

;(globalThis as any).window.HTMLElement.prototype.scrollIntoView = function () {}
const q = () => within(document.body)
const type = (el: Element, v: string) => fireEvent.change(el, { target: { value: v } })
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const reset = () => { cleanup(); calls.length = 0; useUIStore.setState({ dateMode: 'AD' } as any) }
const mount = (el: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>)
const trigger = () => document.querySelector('.dr-trigger') as HTMLButtonElement
const triggerText = () => (trigger().querySelector('span')?.textContent || '').trim()
const last = (method: string) => paramsOf(method).at(-1)

/** open the popup, pick calendar + mode, type From/To, press Set */
async function applyRange(from: string, to: string, opts: { system?: 'AD' | 'BS'; mode?: 'date' | 'month' } = {}) {
  fireEvent.click(trigger())
  const dlg = await waitFor(() => q().getByRole('dialog', { name: 'Date Range' }))
  const selects = dlg.querySelectorAll('select')
  if (opts.system) type(selects[0], opts.system)
  if (opts.mode)   type(selects[1], opts.mode)
  type(within(dlg).getByLabelText('From'), from); type(within(dlg).getByLabelText('To'), to)
  fireEvent.click(within(dlg).getByText('Set'))
  await waitFor(() => assert.ok(!q().queryByRole('dialog', { name: 'Date Range' }), `dialog still open: ${document.querySelector('.dr-err')?.textContent || 'no error text'}`))
}

/* ───────────────────────── the shared component ───────────────────────── */
test('DateRangeFilter: empty state label, apply (AD), BS entry → AD, month mode → whole months, clear', async () => {
  reset()
  const applied: any[] = []; let cleared = 0
  function Host() {
    const [r, setR] = useState({ from: '', to: '' })
    return <DateRangeFilter fromAD={r.from} toAD={r.to} emptyLabel="All dates"
      onApply={x => { applied.push(x); setR({ from: x.fromAD, to: x.toAD }) }} onClear={() => { cleared++; setR({ from: '', to: '' }) }} />
  }
  render(<Host />)
  assert.equal(triggerText(), 'All dates'); assert.ok(!document.querySelector('.dr-clear'), 'no ✕ while empty')

  await applyRange('2026/01/05', '2026/01/20', { system: 'AD' })
  assert.deepEqual([applied.at(-1).fromAD, applied.at(-1).toAD], ['2026-01-05', '2026-01-20'])
  assert.equal(triggerText(), '2026/01/05 – 2026/01/20'); assert.ok(document.querySelector('.dr-clear'), '✕ appears once a range is set')

  // typed in BS → the SAME days arrive as AD
  const bsFrom = formatYMD(adToYMD('2026-02-10', 'BS')!, 'date'), bsTo = formatYMD(adToYMD('2026-02-25', 'BS')!, 'date')
  await applyRange(bsFrom, bsTo, { system: 'BS' })
  assert.deepEqual([applied.at(-1).fromAD, applied.at(-1).toAD], ['2026-02-10', '2026-02-25'])
  assert.equal(triggerText(), `${bsFrom} – ${bsTo}`, 'shown back in the calendar the user used')

  // by month: whole months, both ends inclusive
  await applyRange('2026/02', '2026/03', { system: 'AD', mode: 'month' })
  assert.deepEqual([applied.at(-1).fromAD, applied.at(-1).toAD], ['2026-02-01', '2026-03-31'])

  fireEvent.click(document.querySelector('.dr-clear') as HTMLElement)
  assert.equal(cleared, 1); assert.equal(triggerText(), 'All dates')
})

test('DateRangeFilter: invalid input is rejected inside the popup and nothing is applied', async () => {
  reset(); const applied: any[] = []
  render(<DateRangeFilter fromAD="2026-01-01" toAD="2026-01-31" onApply={r => { applied.push(r) }} />)
  fireEvent.click(trigger())
  const dlg = await waitFor(() => q().getByRole('dialog', { name: 'Date Range' }))
  type(dlg.querySelector('select')!, 'AD')
  type(within(dlg).getByLabelText('From'), '2026/03/10'); type(within(dlg).getByLabelText('To'), '2026/03/01')   // from after to
  fireEvent.click(within(dlg).getByText('Set'))
  await sleep(20)
  assert.equal(applied.length, 0); assert.ok(q().getByRole('dialog', { name: 'Date Range' }), 'popup stays open')
  assert.ok((dlg.querySelector('.dr-err')?.textContent || '').length > 0, 'an error message is shown')
})

test('DateRangeFilter: existing callers (no emptyLabel/onClear) are unchanged — range text + calendar badge, no ✕', async () => {
  reset(); render(<DateRangeFilter fromAD="2026-01-01" toAD="2026-01-31" onApply={() => {}} />)
  assert.equal(triggerText(), '2026/01/01 – 2026/01/31'); assert.equal(trigger().querySelector('em')?.textContent, 'AD'); assert.ok(!document.querySelector('.dr-clear'))
})

/* ───────────────────────── migrated pages ───────────────────────── */
for (const [label, Page, api] of [
  ['Sales Return', SalesReturnPage, 'salesReturnsAPI'], ['Purchase Return', PurchaseReturnPage, 'purchaseReturnsAPI'],
] as const) {
  test(`${label} · All Returns: popup range reaches the list API as AD; ✕ and "Clear filters" remove it`, async () => {
    reset(); mount(<Page />)
    fireEvent.click(await waitFor(() => q().getByText('All Returns')))
    await waitFor(() => assert.ok(calls.some(c => c.api === api && c.method === 'list')))
    assert.equal(triggerText(), 'All dates'); assert.equal(last('list').date_from, undefined)

    await applyRange('2026/01/05', '2026/01/20', { system: 'AD' })
    await waitFor(() => { const p = last('list'); assert.equal(p.date_from, '2026-01-05'); assert.equal(p.date_to, '2026-01-20') })
    assert.equal(last('list').page, 1)

    fireEvent.click(document.querySelector('.dr-clear') as HTMLElement)
    await waitFor(() => { const p = last('list'); assert.equal(p.date_from, undefined); assert.equal(p.date_to, undefined) })
    assert.equal(triggerText(), 'All dates')

    await applyRange('2026/03/01', '2026/03/31', { system: 'AD' })
    await waitFor(() => assert.equal(last('list').date_from, '2026-03-01'))
    fireEvent.click(q().getByText('Clear filters'))                                   // existing reset still clears the range
    await waitFor(() => assert.equal(last('list').date_from, undefined))
    assert.equal(triggerText(), 'All dates')
  })
}

test('Audit Log: popup range is sent as date_from/date_to (AD), page resets to 1, ✕ clears it', async () => {
  reset(); mount(<AuditLogSection />)
  await waitFor(() => assert.ok(calls.some(c => c.method === 'auditLog')))
  assert.equal(triggerText(), 'All dates'); assert.equal(last('auditLog').date_from, undefined)
  await applyRange('2026/02/01', '2026/02/28', { system: 'AD' })
  await waitFor(() => { const p = last('auditLog'); assert.equal(p.date_from, '2026-02-01'); assert.equal(p.date_to, '2026-02-28'); assert.equal(p.page, 1) })
  fireEvent.click(document.querySelector('.dr-clear') as HTMLElement)
  await waitFor(() => assert.equal(last('auditLog').date_from, undefined))
})

test('Purchase Suggestions: the range control appears only for "Custom Range" and its dates reach the API', async () => {
  reset(); mount(<PurchaseSuggestionsPage />)
  await waitFor(() => assert.ok(calls.length > 0)); await sleep(30)
  assert.ok(!document.querySelector('.dr-trigger'), 'no date control for preset periods')
  const periodSel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'custom')) as HTMLSelectElement
  type(periodSel, 'custom')
  await waitFor(() => assert.ok(trigger())); assert.equal(triggerText(), 'Select date range')
  await applyRange('2026/04/01', '2026/04/30', { system: 'AD' })
  await waitFor(() => assert.ok(calls.some(c => c.args[0]?.date_from === '2026-04-01' && c.args[0]?.date_to === '2026-04-30')))
})

test('Trial Balance: popup sets From and As-of; Generate sends date_from + as_of_date (AD)', async () => {
  reset(); mount(<TrialBalTab />)
  const before = calls.length
  assert.ok(/\d{4}\/\d{2}\/\d{2} – \d{4}\/\d{2}\/\d{2}/.test(triggerText()), `default range shown (${triggerText()})`)
  await applyRange('2026/01/01', '2026/03/31', { system: 'AD' })
  assert.equal(triggerText(), '2026/01/01 – 2026/03/31')
  fireEvent.click(q().getAllByRole('button').find(b => /^Generate/.test((b.textContent || '').trim())) as HTMLElement)
  await waitFor(() => assert.ok(calls.slice(before).some(c => c.args[0]?.date_from === '2026-01-01' && c.args[0]?.as_of_date === '2026-03-31'),
    `calls: ${JSON.stringify(calls.slice(before).map(c => c.args[0]))}`))
})
