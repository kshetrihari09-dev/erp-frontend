import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CompanyCustomerReportPage from '../src/modules/reports/CompanyCustomerReportPage'
import useUIStore from '../src/store/uiStore'
import { requests } from './mock-api'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })

test('Set applies the BS range as AD to the report request, refreshes the grid and updates the visible range', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); requests.length = 0
  render(<MemoryRouter><CompanyCustomerReportPage /></MemoryRouter>)
  await waitFor(() => assert.equal(requests.length, 1))                       // first load
  await waitFor(() => assert.ok(q().getByText(/Alpha/)))

  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('From') as HTMLElement, '2083/01/01'); type(q().getByLabelText('To') as HTMLElement, '2083/01/31')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })

  await waitFor(() => assert.equal(requests.length, 2))
  assert.equal(requests[1].from, '2026-04-14'); assert.equal(requests[1].to, '2026-05-14')        // BS → AD, inclusive ends
  await waitFor(() => assert.ok(q().getByText('Alpha 2026-04-14')))                              // grid refreshed with the new range
  assert.equal(document.querySelector('.dr-pop'), null)                                          // popup closed after success
  assert.match(document.querySelector('.dr-trigger')!.textContent!, /2083\/01\/01 – 2083\/01\/31/)

  // other filters still travel with the new range
  type(document.querySelectorAll('select.erp-input')[1] as HTMLElement, 'Cipla')
  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('To') as HTMLElement, '2083/01/15')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  await waitFor(() => assert.equal(requests.length, 3))
  assert.deepEqual({ f: requests[2].from, t: requests[2].to, c: requests[2].company }, { f: '2026-04-14', t: '2026-04-28', c: 'Cipla' })
})

test('shows Opening Balance, Receipts and Closing Balance columns with totals', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); requests.length = 0
  render(<MemoryRouter><CompanyCustomerReportPage /></MemoryRouter>)
  await waitFor(() => assert.ok(q().getByText(/Alpha/)))
  const heads = Array.from(document.querySelectorAll('.sr-table th')).map(h => h.textContent)
  assert.deepEqual(heads, ['Customer Code', 'Particular', 'Opening Balance', 'Sales', 'Discount', 'Sales Return', 'Sales Return Expiry', 'Net', 'Receipts', 'Closing Balance'])
  const cells = Array.from(document.querySelector('.sr-row')!.querySelectorAll('td')).map(c => c.textContent)
  assert.equal(cells[2], '11,000.00'); assert.equal(cells[8], '600.00'); assert.equal(cells[9], '10,900.00')
  assert.match(document.querySelector('.sr-foot-tot')!.textContent!, /Opening\s*11,000\.00/); assert.match(document.querySelector('.sr-foot-tot')!.textContent!, /Closing\s*10,900\.00/)
})

test('an invalid range never reaches the report API', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); requests.length = 0
  render(<MemoryRouter><CompanyCustomerReportPage /></MemoryRouter>)
  await waitFor(() => assert.equal(requests.length, 1))
  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('To') as HTMLElement, '2083/02/32')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(requests.length, 1); assert.ok(document.querySelector('.dr-pop')); assert.match(document.querySelector('.dr-err')!.textContent!, /only 31 days/)
})
