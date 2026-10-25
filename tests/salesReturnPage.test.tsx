import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import SalesReturnPage from '../src/modules/billing/SalesReturnPage'
import useUIStore from '../src/store/uiStore'
import { fmt } from '../src/utils'
import { calls, state } from './mock-api-sales-return'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const qtyInput = (name: string) => q().getAllByLabelText(`Return quantity for ${name}`)[0] as HTMLInputElement
const postBtn = () => q().getAllByText(/Review & Post/)[0].closest('button') as HTMLButtonElement
const scan = async (id: string) => { const s = q().getByLabelText('scan'); type(s, id); fireEvent.keyDown(s, { key: 'Enter' }) }
const reset = () => {
  cleanup(); useUIStore.setState({ dateMode: 'AD' })
  Object.assign(state, { refundable: 0, createDelayMs: 40, createFails: '', listRows: [], listTotal: 0 })
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
}
async function open(customer = 'c1') {
  render(<QueryClientProvider client={new QueryClient()}><SalesReturnPage /></QueryClientProvider>)
  await waitFor(() => assert.ok(q().getByText('ABC Traders', { exact: false })))
  if (customer) type(q().getByLabelText('Customer'), customer)
}

test('opens straight into the Sales-style billing screen: no invoice search, no invoice picker', async () => {
  reset(); render(<QueryClientProvider client={new QueryClient()}><SalesReturnPage /></QueryClientProvider>)
  assert.ok(q().getByText('Customer Information')); assert.ok(q().getByText('Return Items')); assert.ok(q().getByLabelText('scan'))
  assert.equal(q().queryByLabelText('Search invoices'), null); assert.equal(q().queryByText(/Find the original/i), null)
  assert.equal(calls.preview.length, 0)
  await waitFor(() => assert.equal(calls.customers.length, 1))
})

test('customer + scanned product → server dry run with {party_id, lines} only (no invoice, no rates); shows historical rate/discount/credit and the linked invoice', async () => {
  reset(); await open(); await scan('p1')
  await waitFor(() => assert.equal(calls.preview.length, 1))
  const b = calls.preview[0]
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(b))).sort(), ['date_ad', 'lines', 'party_id'])
  assert.deepEqual(b.lines, [{ product_id: 'p1', qty: 1 }]); assert.equal(b.party_id, 'c1')
  await waitFor(() => assert.ok(q().getAllByText(fmt(90)).length))           // 1 × net-of-discount, from the server
  assert.ok(q().getAllByText(/from INV-0001/).length); assert.ok(q().getByText(/Matched to this customer/))
  type(qtyInput('Paracetamol 500'), '3'); await waitFor(() => assert.equal(calls.preview.length, 2))
  await waitFor(() => assert.ok(q().getAllByText(fmt(270)).length))
  assert.ok(q().getAllByText('Total Credit').length)
})

test('re-scanning bumps quantity; quantity above what the customer can still return is flagged and blocks posting; no-purchase product flagged', async () => {
  reset(); await open(); await scan('p2'); await scan('p2')
  await waitFor(() => assert.equal(qtyInput('Amoxicillin 250').value, '2'))
  type(qtyInput('Amoxicillin 250'), '9')
  await waitFor(() => assert.ok(q().getAllByText(/has only 5 still returnable/).length))
  fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText(/Fix the highlighted items/)))
  assert.equal(q().queryByText('Confirm sales return'), null)
  fireEvent.click(q().getAllByLabelText('Remove Amoxicillin 250')[0]); await scan('p9')
  await waitFor(() => assert.ok(q().getAllByText(/No returnable sale of "Never Bought"/).length))
})

test('product not found shows the shared dialog; posting needs a customer and at least one product', async () => {
  reset(); await open(''); fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText('Add at least one product')))
  await scan('p1'); fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText(/Select a customer before posting/)))
  assert.equal(calls.preview.length, 0)                                   // nothing is priced until a customer is chosen
  await scan('NOPE'); await waitFor(() => assert.ok(q().getByText('Product Not Found')))
})

test('batch can be chosen when several batches are returnable; choice is sent as batch_no', async () => {
  reset(); await open(); await scan('p1')
  await waitFor(() => assert.ok(q().getAllByLabelText('Batch for Paracetamol 500').length))
  type(q().getAllByLabelText('Batch for Paracetamol 500')[0], 'B0')
  await waitFor(() => assert.deepEqual(calls.preview.at(-1).lines, [{ product_id: 'p1', qty: 1, batch_no: 'B0' }]))
})

test('confirm → post sends only {party_id, lines, date, settlement, narration?, client_txn_id}; double click posts ONCE; print data + form reset', async () => {
  reset(); await open(); await scan('p1'); await scan('p2')
  type(qtyInput('Paracetamol 500'), '4')
  await waitFor(() => assert.ok(q().getAllByText(fmt(460)).length))
  await waitFor(() => assert.equal(postBtn().disabled, false))
  fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText('Confirm sales return')))
  const post = q().getByText('Post Return')
  await act(async () => { fireEvent.click(post); fireEvent.click(post); fireEvent.click(post) })
  await waitFor(() => assert.ok(q().getAllByText(/CN-2026-00001/).length))
  assert.equal(calls.create.length, 1)
  const b = calls.create[0]
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(b))).sort(), ['client_txn_id', 'date_ad', 'lines', 'party_id', 'settlement'])
  assert.deepEqual(b.lines, [{ product_id: 'p1', qty: 4 }, { product_id: 'p2', qty: 1 }]); assert.equal(b.settlement, 'adjust'); assert.match(b.client_txn_id, /^[0-9a-f-]{36}$/)
  const pd = JSON.parse(q().getByTestId('print').textContent!)
  assert.equal(pd.type, 'SALE_RETURN'); assert.equal(pd.voucherNo, 'CN-2026-00001'); assert.equal(pd.referenceNo, 'INV-0001')
  assert.equal(pd.netTotal, 460); assert.equal(pd.subtotal, 500); assert.equal(pd.discountAmt, 40); assert.equal(pd.items.length, 2); assert.match(pd.settlement, /adjusted against invoice outstanding/)
  assert.equal((q().getByLabelText('Customer') as HTMLSelectElement).value, '')            // ready for the next return
  assert.equal(q().queryByLabelText('Return quantity for Paracetamol 500'), null)
})

test('refund options are unavailable when the customer is not owed money; cash refund sends refund_amount; walk-in is refund-only and sends no party_id', async () => {
  reset(); state.refundable = 0; await open(); await scan('p1')
  await waitFor(() => assert.ok(q().getAllByText(fmt(90)).length))
  assert.equal((q().getByText('Cash refund') as HTMLButtonElement).disabled, true)
  state.refundable = 500; type(qtyInput('Paracetamol 500'), '2'); await waitFor(() => assert.equal((q().getByText('Cash refund') as HTMLButtonElement).disabled, false))
  fireEvent.click(q().getByText('Cash refund')); type(q().getByLabelText('Refund amount'), '100')
  fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText('Post Return')))
  await act(async () => { fireEvent.click(q().getByText('Post Return')) })
  await waitFor(() => assert.equal(calls.create.length, 1))
  assert.equal(calls.create[0].settlement, 'cash_refund'); assert.equal(calls.create[0].refund_amount, 100)
  await waitFor(() => assert.equal((q().getByLabelText('Customer') as HTMLSelectElement).value, ''))   // posted → form reset
  type(q().getByLabelText('Customer'), '__walkin__'); await waitFor(() => assert.equal(q().queryByText('Credit to customer account'), null))
  await scan('p1'); await waitFor(() => assert.ok(calls.preview.some(c => c.party_id === undefined)))
})

test('server rejection shows the message, keeps the lines, and re-reads what is still returnable', async () => {
  reset(); state.createFails = 'Cannot return 4 of "Paracetamol 500" — this customer has only 1 still returnable.'; await open(); await scan('p1')
  type(qtyInput('Paracetamol 500'), '4'); await waitFor(() => assert.ok(q().getAllByText(fmt(360)).length))
  await waitFor(() => assert.equal(postBtn().disabled, false)); const before = calls.preview.length
  fireEvent.click(postBtn()); await waitFor(() => assert.ok(q().getByText('Post Return')))
  await act(async () => { fireEvent.click(q().getByText('Post Return')) })
  await waitFor(() => assert.ok(q().getByText(/only 1 still returnable/)))
  await waitFor(() => assert.ok(calls.preview.length > before)); assert.equal(qtyInput('Paracetamol 500').value, '4')
})

test('All Returns: search/date/status filters + pagination reach the API; older return without detail still prints from its voucher', async () => {
  reset()
  state.listRows = [{ id: 'v1', voucher_no: 'CN-OLD-1', voucher_date: '2026-05-01', total_amount: 250, status: 'POSTED', party_name: 'XYZ Stores', original_invoice_no: 'INV-0009', sales_return_id: null }]
  state.listTotal = 45
  render(<QueryClientProvider client={new QueryClient()}><SalesReturnPage /></QueryClientProvider>)
  fireEvent.click(q().getByText('All Returns'))
  await waitFor(() => assert.ok(q().getAllByText('CN-OLD-1').length))
  type(q().getByLabelText('Search returns'), 'INV-0009'); await waitFor(() => assert.ok(calls.list.some(c => c.search === 'INV-0009')))
  type(q().getByLabelText('Status'), 'POSTED'); await waitFor(() => assert.ok(calls.list.some(c => c.status === 'POSTED')))
  fireEvent.click(q().getByText('2'))
  await waitFor(() => assert.ok(calls.list.some(c => c.page === 2)))
  await act(async () => { fireEvent.click(q().getAllByText('Print')[0]) })
  await waitFor(() => assert.ok(q().getByTestId('print')))
  const pd = JSON.parse(q().getByTestId('print').textContent!)
  assert.equal(pd.voucherNo, 'CN-OLD-1'); assert.equal(pd.netTotal, 250); assert.equal(pd.referenceNo, 'INV-0009')
})
