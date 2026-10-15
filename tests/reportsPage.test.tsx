import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import ReportsPage from '../src/modules/reports/ReportsPage'
import useUIStore from '../src/store/uiStore'
import { reportReqs } from './mock-api-reports'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const setRange = async (from: string, to: string) => {
  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('From') as HTMLElement, from); type(q().getByLabelText('To') as HTMLElement, to)
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
}

test('Reports: native From/To inputs are replaced by the Date Range popup', () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); render(<ReportsPage />)
  assert.equal(document.querySelectorAll('input[type="date"]').length, 0)
  assert.equal(document.querySelectorAll('.dr-trigger').length, 1)
})

for (const [tabLabel, kind] of [['Sales', 'sales'], ['Purchases', 'purchases'], ['Profit & Loss', 'pnl']] as const) {
  test(`Reports › ${tabLabel}: Set converts BS→AD and refreshes that report with the new range`, async () => {
    cleanup(); useUIStore.setState({ dateMode: 'BS' }); reportReqs.length = 0
    render(<ReportsPage />)
    if (tabLabel !== 'Sales') fireEvent.click(q().getByText(tabLabel))
    await setRange('2083/01/01', '2083/01/31')
    await waitFor(() => assert.equal(reportReqs.length, 1))
    assert.deepEqual({ k: reportReqs[0].kind, f: reportReqs[0].params.date_from, t: reportReqs[0].params.date_to }, { k: kind, f: '2026-04-14', t: '2026-05-14' })
    assert.equal(document.querySelector('.dr-pop'), null)                                               // closed after success
    assert.match(document.querySelector('.dr-trigger')!.textContent!, /2083\/01\/01 – 2083\/01\/31/)     // visible range updated
    // Generate keeps using the stored range
    await act(async () => { fireEvent.click(q().getByText('Generate')) })
    await waitFor(() => assert.equal(reportReqs.length, 2)); assert.equal(reportReqs[1].params.date_from, '2026-04-14')
  })
}

test('Reports: Sales — Date Range in Month mode and invalid input', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); reportReqs.length = 0
  render(<ReportsPage />)
  fireEvent.click(document.querySelector('.dr-trigger')!)
  fireEvent.change(document.querySelectorAll('.dr-pop select')[1], { target: { value: 'month' } })
  type(q().getByLabelText('From') as HTMLElement, '2083/03'); type(q().getByLabelText('To') as HTMLElement, '2083/03')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  await waitFor(() => assert.equal(reportReqs.length, 1))
  assert.deepEqual({ f: reportReqs[0].params.date_from, t: reportReqs[0].params.date_to }, { f: '2026-06-15', t: '2026-07-16' })   // Asar has 32 days
  await setRange('2083/02/32', '2083/03/01')
  assert.equal(reportReqs.length, 1); assert.match(document.querySelector('.dr-err')!.textContent!, /only 31 days/)
})
