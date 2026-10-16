import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CustomerCompanyReportPage from '../src/modules/reports/CustomerCompanyReportPage'
import useUIStore from '../src/store/uiStore'
import { reqs } from './mock-api-cc'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const mount = () => { cleanup(); useUIStore.setState({ dateMode: 'BS' }); reqs.get.length = 0; reqs.search.length = 0; render(<MemoryRouter><CustomerCompanyReportPage /></MemoryRouter>) }
const choose = async (name: RegExp) => { fireEvent.focus(q().getByLabelText('Customer')); await waitFor(() => assert.ok(q().getByText(name))); fireEvent.mouseDown(q().getByText(name)) }

test('starts empty with a prompt, and Report without a customer requests nothing', async () => {
  mount()
  assert.ok(q().getByText(/Select a customer to see the companies/))
  await act(async () => { fireEvent.click(q().getByText('Report')) })
  assert.equal(reqs.get.length, 0)
})

test('choosing a customer loads the company-wise report with columns, totals and ledger footer', async () => {
  mount(); await choose(/Delta Medical/)
  await waitFor(() => assert.equal(reqs.get.length, 1)); assert.equal(reqs.get[0].customer_id, 'c1')
  await waitFor(() => assert.ok(q().getByText('Cipla')))
  assert.deepEqual(Array.from(document.querySelectorAll('.sr-table th')).map(h => h.textContent), ['Company', 'Sales', 'Discount', 'Sales Return', 'Sales Return Expiry', 'Net'])
  const cells = Array.from(document.querySelector('.sr-row')!.querySelectorAll('td')).map(c => c.textContent)
  assert.deepEqual(cells, ['Cipla', '1,030.00', '115.00', '270.00', '0.00', '645.00'])
  const foot = document.querySelector('.sr-foot')!.textContent!
  assert.match(foot, /Sales\s*2,030\.00/); assert.match(foot, /Net\s*1,445\.00/); assert.match(foot, /Opening 1,000\.00/); assert.match(foot, /Closing 3,015\.00/)
})

test('Date Range Set converts BS→AD and refreshes the SAME customer', async () => {
  mount(); await choose(/Delta Medical/); await waitFor(() => assert.equal(reqs.get.length, 1))
  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('From') as HTMLElement, '2083/01/01'); type(q().getByLabelText('To') as HTMLElement, '2083/01/31')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  await waitFor(() => assert.equal(reqs.get.length, 2))
  assert.deepEqual({ id: reqs.get[1].customer_id, f: reqs.get[1].from, t: reqs.get[1].to }, { id: 'c1', f: '2026-04-14', t: '2026-05-14' })
  assert.ok(!document.querySelector('.dr-pop'))
})

test('Date Range with no customer selected stores the range but requests nothing; invalid range is rejected', async () => {
  mount()
  fireEvent.click(document.querySelector('.dr-trigger')!); type(q().getByLabelText('To') as HTMLElement, '2083/02/32')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.match(document.querySelector('.dr-err')!.textContent!, /only 31 days/); assert.equal(reqs.get.length, 0)
  type(q().getByLabelText('From') as HTMLElement, '2083/02/01'); type(q().getByLabelText('To') as HTMLElement, '2083/02/31')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(reqs.get.length, 0); assert.ok(!document.querySelector('.dr-pop'))        // range stored, popup closed, nothing requested without a customer
  assert.match(document.querySelector('.dr-trigger')!.textContent!, /2083\/02\/01 – 2083\/02\/31/)
})

test('customer search is sent to the server; a customer with no activity shows the empty state', async () => {
  mount()
  fireEvent.focus(q().getByLabelText('Customer')); type(q().getByLabelText('Customer') as HTMLElement, 'echo')
  await waitFor(() => assert.ok(reqs.search.includes('echo')))
  await waitFor(() => assert.ok(q().getByText('Echo Pharma'))); fireEvent.mouseDown(q().getByText('Echo Pharma'))
  await waitFor(() => assert.ok(q().getByText(/No sales or returns for this customer/)))
  assert.match(document.querySelector('.sr-foot-tot')!.textContent!, /Net\s*0\.00/)
})
