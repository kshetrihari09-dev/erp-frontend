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
const reset = () => {
  cleanup(); useUIStore.setState({ dateMode: 'AD' })
  Object.assign(state, { refundable: 0, createDelayMs: 40, createFails: '', listRows: [], listTotal: 0 })
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
}
async function openInvoice() {
  render(<SalesReturnPage />)
  await waitFor(() => assert.ok(q().getByText('INV-0001')))
  fireEvent.click(q().getByText('INV-0001'))
  await waitFor(() => assert.ok(q().getAllByText('Paracetamol 500').length))
}

test('invoice list is searchable and shows payment status + returnable balance; selecting loads real lines with returned/remaining', async () => {
  reset(); render(<SalesReturnPage />)
  await waitFor(() => assert.ok(q().getByText('INV-0001')))
  assert.ok(q().getByText(/Returnable/)); assert.ok(q().getAllByText(fmt(1220)).length)
  type(q().getByLabelText('Search invoices'), 'INV'); await waitFor(() => assert.ok(calls.invoices.some(c => c.search === 'INV')))
  fireEvent.click(q().getByText('INV-0001'))
  await waitFor(() => assert.deepEqual(calls.invoice, ['sale-1']))
  await waitFor(() => assert.ok(q().getAllByText('Paracetamol 500').length))
  assert.ok(q().getByText(/Previous returns: CN-0000/))
  assert.ok(q().getAllByText('expired').length)                       // expired batch is flagged
})

test('quantity above the remaining returnable qty is blocked client-side; valid qty sends a server dry-run and shows ITS totals', async () => {
  reset(); await openInvoice()
  type(qtyInput('Paracetamol 500'), '9')                                // only 8 left
  assert.ok(q().getAllByText(/Only 8 can still be returned/).length)
  assert.equal((q().getByText('Review & Post Return').closest('button') as HTMLButtonElement).disabled, true)
  assert.equal(calls.preview.length, 0)                                 // never ask the server to price an impossible return
  type(qtyInput('Paracetamol 500'), '3')
  await waitFor(() => assert.equal(calls.preview.length, 1))
  assert.deepEqual(calls.preview[0], { sale_id: 'sale-1', items: [{ sale_item_id: 'l1', qty: 3 }] })
  await waitFor(() => assert.ok(q().getByText('Net credit')))
  assert.ok(q().getAllByText(fmt(270)).length)                           // 3 × 90 net-of-discount, from the server
  assert.ok(q().getByText(/Discount reversed/))
  await waitFor(() => assert.equal((q().getByText('Review & Post Return').closest('button') as HTMLButtonElement).disabled, false))
})

test('refund options are unavailable when the customer is not owed money; the default is adjust against the receivable', async () => {
  reset(); state.refundable = 0; await openInvoice()
  type(qtyInput('Paracetamol 500'), '1'); await waitFor(() => assert.ok(q().getByText('Net credit')))
  const cash = q().getByLabelText(/Cash refund/) as HTMLInputElement
  assert.equal(cash.disabled, true)
  assert.equal((q().getByLabelText(/Credit to customer account/) as HTMLInputElement).checked, true)
})

test('confirm → post sends only {sale_id, qty per line, date, settlement, client_txn_id}; double click posts ONCE; success shows number and print data', async () => {
  reset(); await openInvoice()
  type(qtyInput('Paracetamol 500'), '4'); type(qtyInput('Amoxicillin 250'), '1')
  await waitFor(() => assert.ok(q().getByText('Net credit')))
  await waitFor(() => assert.equal((q().getByText('Review & Post Return').closest('button') as HTMLButtonElement).disabled, false))
  fireEvent.click(q().getByText('Review & Post Return'))
  await waitFor(() => assert.ok(q().getByText('Confirm sales return')))
  const post = q().getByText('Post Return')
  await act(async () => { fireEvent.click(post); fireEvent.click(post); fireEvent.click(post) })   // impatient user
  await waitFor(() => assert.ok(q().getByText(/Sales return posted — CN-2026-00001/)))
  assert.equal(calls.create.length, 1)
  const b = calls.create[0]
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(b))).sort(), ['client_txn_id', 'date_ad', 'items', 'sale_id', 'settlement'])   // no rates/amounts sent
  assert.deepEqual(b.items, [{ sale_item_id: 'l1', qty: 4 }, { sale_item_id: 'l2', qty: 1 }]); assert.equal(b.settlement, 'adjust')
  assert.match(b.client_txn_id, /^[0-9a-f-]{36}$/)
  fireEvent.click(q().getByText('Print Credit Note'))
  const pd = JSON.parse(q().getByTestId('print').textContent!)
  assert.equal(pd.type, 'SALE_RETURN'); assert.equal(pd.voucherNo, 'CN-2026-00001'); assert.equal(pd.referenceNo, 'INV-0001')
  assert.equal(pd.netTotal, 460); assert.equal(pd.subtotal, 500); assert.equal(pd.discountAmt, 40)      // 400+100 gross, 40 discount reversed
  assert.equal(pd.items.length, 2); assert.equal(pd.items[0].batch_no, 'B1'); assert.match(pd.settlement, /adjusted against invoice outstanding/)
})

test('server rejection (e.g. someone else returned meanwhile) shows the message and reloads the invoice from the server', async () => {
  reset(); state.createFails = 'Cannot return 4 of "Paracetamol 500" — only 1 remaining returnable'; await openInvoice()
  type(qtyInput('Paracetamol 500'), '4'); await waitFor(() => assert.ok(q().getByText('Net credit')))
  await waitFor(() => assert.equal((q().getByText('Review & Post Return').closest('button') as HTMLButtonElement).disabled, false))
  fireEvent.click(q().getByText('Review & Post Return')); await waitFor(() => assert.ok(q().getByText('Post Return')))
  await act(async () => { fireEvent.click(q().getByText('Post Return')) })
  await waitFor(() => assert.ok(q().getByText(/only 1 remaining returnable/)))
  await waitFor(() => assert.equal(calls.invoice.length, 2))             // refreshed from the authoritative source
})

test('scanning a product adds 1 to its line; a product not on the invoice is reported, not added', async () => {
  reset(); await openInvoice()
  const scan = q().getByLabelText('scan')
  type(scan, 'p2'); fireEvent.keyDown(scan, { key: 'Enter' })
  await waitFor(() => assert.equal(qtyInput('Amoxicillin 250').value, '1'))
  fireEvent.keyDown(scan, { key: 'Enter' }); await waitFor(() => assert.equal(qtyInput('Amoxicillin 250').value, '2'))
  type(scan, 'p-other'); fireEvent.keyDown(scan, { key: 'Enter' })
  await waitFor(() => assert.ok(q().getByText(/is not on invoice INV-0001/)))
})

test('All Returns: search/date/status filters + pagination reach the API; older return without detail still prints from its voucher', async () => {
  reset()
  state.listRows = [{ id: 'v1', voucher_no: 'CN-OLD-1', voucher_date: '2026-05-01', total_amount: 250, status: 'POSTED', party_name: 'XYZ Stores', original_invoice_no: 'INV-0009', sales_return_id: null }]
  state.listTotal = 45
  render(<SalesReturnPage />)
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
