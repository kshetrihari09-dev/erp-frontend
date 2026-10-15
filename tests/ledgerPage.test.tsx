import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import LedgerPage from '../src/modules/accounting/LedgerPage'
import useUIStore from '../src/store/uiStore'
import { ledgerRequests } from './mock-api-ledger'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })

test('Ledger: Date Range popup replaces From/To; Set re-queries the selected ledger with the converted AD dates', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); ledgerRequests.length = 0
  render(<LedgerPage />)
  assert.equal(document.querySelectorAll('input[type="date"]').length, 0)           // old native From/To are gone
  assert.ok(document.querySelector('.dr-trigger'))

  // pick an account/party, then generate with the default range
  fireEvent.click(document.querySelector('.ldg-acct-select-btn')!)
  await waitFor(() => assert.ok(q().getByText('Alpha Pharma')))
  fireEvent.click(q().getByText('Alpha Pharma'))
  await act(async () => { fireEvent.click(document.querySelector('.ldg-generate-btn')!) })
  await waitFor(() => assert.equal(ledgerRequests.length, 1))

  // change the range through the popup (BS) → ledger refreshes automatically with AD dates
  fireEvent.click(document.querySelector('.dr-trigger')!)
  type(q().getByLabelText('From') as HTMLElement, '2083/01/01'); type(q().getByLabelText('To') as HTMLElement, '2083/01/31')
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  await waitFor(() => assert.equal(ledgerRequests.length, 2))
  assert.deepEqual({ f: ledgerRequests[1].date_from, t: ledgerRequests[1].date_to, id: ledgerRequests[1].id }, { f: '2026-04-14', t: '2026-05-14', id: 'p1' })
  await waitFor(() => assert.equal((document.querySelector('.ldg-generate-btn') as HTMLButtonElement).disabled, false))   // refresh finished, no error state
  assert.equal(document.querySelector('.dr-err'), null)
  assert.equal(document.querySelector('.dr-pop'), null)

  // the Generate button now uses the same stored range
  await act(async () => { fireEvent.click(document.querySelector('.ldg-generate-btn')!) })
  await waitFor(() => assert.equal(ledgerRequests.length, 3)); assert.equal(ledgerRequests[2].date_from, '2026-04-14')
})

test('Ledger: invalid range is rejected and the ledger is not re-queried', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'BS' }); ledgerRequests.length = 0
  render(<LedgerPage />)
  fireEvent.click(document.querySelector('.ldg-acct-select-btn')!)
  await waitFor(() => assert.ok(q().getByText('Alpha Pharma'))); fireEvent.click(q().getByText('Alpha Pharma'))
  await act(async () => { fireEvent.click(document.querySelector('.ldg-generate-btn')!) })
  await waitFor(() => assert.equal(ledgerRequests.length, 1))
  fireEvent.click(document.querySelector('.dr-trigger')!); type(q().getByLabelText('To') as HTMLElement, '2083/08/30')   // Mangsir 2083 has 29 days
  await act(async () => { fireEvent.click(document.querySelector('.dr-set')!) })
  assert.equal(ledgerRequests.length, 1); assert.match(document.querySelector('.dr-err')!.textContent!, /only 29 days/)
})
