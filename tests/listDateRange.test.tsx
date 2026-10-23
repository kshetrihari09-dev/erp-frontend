// Sale list ("All Invoices") and Purchase list ("All Purchases"): the Date Range popup filters the list.
// Real pages + real popup; the list API is recorded. The backend list endpoints already accept inclusive AD
// date_from / date_to — the popup always hands the page AD dates (BS entry is converted inside the popup).
import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useUIStore from '../src/store/uiStore'
import { adToYMD, formatYMD } from '../src/utils/dateRange'
import SalesPage from '../src/modules/sales/SalesPage'
import PurchasePage from '../src/modules/purchases/PurchasePage'
import { calls, paramsOf } from './mock-api-date-range'

;(globalThis as any).window.HTMLElement.prototype.scrollIntoView = function () {}
const q = () => within(document.body)
const type = (el: Element, v: string) => fireEvent.change(el, { target: { value: v } })
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const trigger = () => document.querySelector('.sil-search-bar .dr-trigger') as HTMLButtonElement
const triggerText = () => (trigger().querySelector('span')?.textContent || '').trim()
// the empty state renders once in the desktop table and once in the mobile card list
const emptyMsg = (t: string) => { const n = q().getAllByText(t); assert.equal(n.length, 2, `"${t}" shown in desktop + mobile lists`) }
const last = () => paramsOf('list').filter(p => p.limit !== 1).at(-1)       // ignore the page's 1-row probe call

async function applyRange(from: string, to: string, system: 'AD' | 'BS' = 'AD') {
  fireEvent.click(trigger())
  const dlg = await waitFor(() => q().getByRole('dialog', { name: 'Date Range' }))
  type(dlg.querySelectorAll('select')[0], system)
  type(within(dlg).getByLabelText('From'), from); type(within(dlg).getByLabelText('To'), to)
  fireEvent.click(within(dlg).getByText('Set'))
  await waitFor(() => assert.ok(!q().queryByRole('dialog', { name: 'Date Range' }), 'popup closes after Set'))
}

for (const [label, Page, tabName, noun] of [
  ['Sale list', SalesPage, 'All Invoices', 'sales'], ['Purchase list', PurchasePage, 'All Purchases', 'purchases'],
] as const) {
  async function openList() {
    cleanup(); calls.length = 0; useUIStore.setState({ dateMode: 'AD' } as any)
    render(<QueryClientProvider client={new QueryClient()}><Page /></QueryClientProvider>)
    await sleep(30)
    fireEvent.click(q().getAllByText(tabName)[0])
    await waitFor(() => assert.ok(trigger(), 'date range control is on the list'))
    await waitFor(() => assert.ok(last(), 'list loaded'))
  }

  test(`${label}: starts unfiltered ("All dates"), no date params sent`, async () => {
    await openList()
    assert.equal(triggerText(), 'All dates')
    assert.equal(last().date_from, undefined); assert.equal(last().date_to, undefined)
    assert.ok(!document.querySelector('.sil-search-bar .dr-clear'))
    emptyMsg(`No ${noun} found`)
  })

  test(`${label}: applying a range sends inclusive AD date_from/date_to and resets to page 1; empty state says "in this date range"`, async () => {
    await openList()
    await applyRange('2026/01/05', '2026/01/20')
    await waitFor(() => { const p = last(); assert.equal(p.date_from, '2026-01-05'); assert.equal(p.date_to, '2026-01-20'); assert.equal(p.page, 1) })
    assert.equal(triggerText(), '2026/01/05 – 2026/01/20')
    emptyMsg(`No ${noun} found in this date range`)
  })

  test(`${label}: a range typed in BS reaches the API as the same days in AD`, async () => {
    await openList()
    const bsFrom = formatYMD(adToYMD('2026-02-10', 'BS')!, 'date'), bsTo = formatYMD(adToYMD('2026-02-24', 'BS')!, 'date')
    await applyRange(bsFrom, bsTo, 'BS')
    await waitFor(() => { assert.equal(last().date_from, '2026-02-10'); assert.equal(last().date_to, '2026-02-24') })
    assert.equal(triggerText(), `${bsFrom} – ${bsTo}`)
  })

  test(`${label}: the range stays applied when searching, and search stays when the range changes`, async () => {
    await openList()
    await applyRange('2026/03/01', '2026/03/31')
    await waitFor(() => assert.equal(last().date_from, '2026-03-01'))
    type(document.querySelector('.sil-search-bar input')!, 'abc')
    await waitFor(() => { const p = last(); assert.equal(p.search, 'abc'); assert.equal(p.date_from, '2026-03-01'); assert.equal(p.date_to, '2026-03-31') })
    await applyRange('2026/04/01', '2026/04/30')
    await waitFor(() => { const p = last(); assert.equal(p.search, 'abc'); assert.equal(p.date_from, '2026-04-01'); assert.equal(p.date_to, '2026-04-30') })
  })

  test(`${label}: by-month range covers whole months; ✕ clears the range and restores the plain empty state`, async () => {
    await openList()
    fireEvent.click(trigger())
    const dlg = await waitFor(() => q().getByRole('dialog', { name: 'Date Range' }))
    type(dlg.querySelectorAll('select')[0], 'AD'); type(dlg.querySelectorAll('select')[1], 'month')
    type(within(dlg).getByLabelText('From'), '2026/02'); type(within(dlg).getByLabelText('To'), '2026/03')
    fireEvent.click(within(dlg).getByText('Set'))
    await waitFor(() => { assert.equal(last().date_from, '2026-02-01'); assert.equal(last().date_to, '2026-03-31') })
    fireEvent.click(document.querySelector('.sil-search-bar .dr-clear') as HTMLElement)
    await waitFor(() => { assert.equal(last().date_from, undefined); assert.equal(last().date_to, undefined) })
    assert.equal(triggerText(), 'All dates')
    emptyMsg(`No ${noun} found`)
  })
}
