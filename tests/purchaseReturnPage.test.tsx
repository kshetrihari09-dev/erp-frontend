import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, act, waitFor } from '@testing-library/react'
import PurchaseReturnPage from '../src/modules/billing/PurchaseReturnPage'
import useUIStore from '../src/store/uiStore'
import { fmt } from '../src/utils'
import { calls, state } from './mock-api-purchase-return'

const q = () => within(document.body)
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } })
const qtyInput = (name: string) => q().getAllByLabelText(`Return quantity for ${name}`)[0] as HTMLInputElement
const reviewBtn = () => q().getByText('Review & Post Return').closest('button') as HTMLButtonElement
const reset = () => {
  cleanup(); useUIStore.setState({ dateMode: 'AD' })
  Object.assign(state, { refundable: 0, createDelayMs: 40, createFails: '', listRows: [], listTotal: 0 })
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k].length = 0
}
async function openBill() {
  render(<PurchaseReturnPage />)
  await waitFor(() => assert.ok(q().getByText('PB-0001')))
  fireEvent.click(q().getByText('PB-0001'))
  await waitFor(() => assert.ok(q().getAllByText('Paracetamol 500').length))
}

test('bill list is searchable (bill no / supplier) with payment status + returnable balance; selecting loads real lines incl. stock on hand', async () => {
  reset(); render(<PurchaseReturnPage />)
  await waitFor(() => assert.ok(q().getByText('PB-0001')))
  assert.ok(q().getAllByText(fmt(1220)).length)
  type(q().getByLabelText('Search bills'), 'Alpha'); await waitFor(() => assert.ok(calls.bills.some(c => c.search === 'Alpha')))
  fireEvent.click(q().getByText('PB-0001'))
  await waitFor(() => assert.deepEqual(calls.bill, ['pur-1']))
  await waitFor(() => assert.ok(q().getAllByText('Paracetamol 500').length))
  assert.ok(q().getByText(/Previous returns: DN-0000/)); assert.ok(q().getAllByText('expired').length)
  assert.ok(q().getAllByText('In stock').length)
  assert.ok(q().getByText(/Supplier ledger balance/))
})

test('quantity is capped by stock still on hand (5 of 8 already sold): over-cap blocked client-side, valid qty gets a server dry-run', async () => {
  reset(); await openBill()
  type(qtyInput('Paracetamol 500'), '4')                               // 8 remain on the bill but only 3 are in stock
  assert.ok(q().getAllByText(/Only 3 is still in stock/).length)
  assert.equal(reviewBtn().disabled, true); assert.equal(calls.preview.length, 0)
  type(qtyInput('Paracetamol 500'), '3')
  await waitFor(() => assert.equal(calls.preview.length, 1))
  assert.deepEqual(calls.preview[0], { purchase_id: 'pur-1', items: [{ purchase_item_id: 'l1', qty: 3 }] })
  await waitFor(() => assert.ok(q().getByText('Net credit'))); assert.ok(q().getAllByText(fmt(270)).length)
  await waitFor(() => assert.equal(reviewBtn().disabled, false))
})

test('"All" fills the real cap (stock), and scanning stops at the cap', async () => {
  reset(); await openBill()
  fireEvent.click(q().getAllByText('All')[0]); await waitFor(() => assert.equal(qtyInput('Paracetamol 500').value, '3'))
  type(qtyInput('Paracetamol 500'), '')
  const scan = q().getByLabelText('scan'); type(scan, 'p1')
  for (let i = 0; i < 5; i++) fireEvent.keyDown(scan, { key: 'Enter' })
  await waitFor(() => assert.equal(qtyInput('Paracetamol 500').value, '3'))      // never above stock
  type(scan, 'p-other'); fireEvent.keyDown(scan, { key: 'Enter' })
  await waitFor(() => assert.ok(q().getByText(/is not on bill PB-0001/)))
})

test('refund (supplier pays us) is unavailable when the supplier owes us nothing; default is debit to the supplier account', async () => {
  reset(); state.refundable = 0; await openBill()
  type(qtyInput('Paracetamol 500'), '1'); await waitFor(() => assert.ok(q().getByText('Net credit')))
  assert.equal((q().getByLabelText(/Cash refund/) as HTMLInputElement).disabled, true)
  assert.equal((q().getByLabelText(/Debit to supplier account/) as HTMLInputElement).checked, true)
})

test('confirm → post sends only {purchase_id, qty per line, date, settlement, client_txn_id}; double click posts ONCE; success + print data', async () => {
  reset(); await openBill()
  type(qtyInput('Paracetamol 500'), '3'); type(qtyInput('Amoxicillin 250'), '1')
  await waitFor(() => assert.ok(q().getByText('Net credit'))); await waitFor(() => assert.equal(reviewBtn().disabled, false))
  fireEvent.click(q().getByText('Review & Post Return')); await waitFor(() => assert.ok(q().getByText('Confirm purchase return')))
  const post = q().getByText('Post Return')
  await act(async () => { fireEvent.click(post); fireEvent.click(post); fireEvent.click(post) })
  await waitFor(() => assert.ok(q().getByText(/Purchase return posted — DN-2026-00001/)))
  assert.equal(calls.create.length, 1)
  const b = calls.create[0]
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(b))).sort(), ['client_txn_id', 'date_ad', 'items', 'purchase_id', 'settlement'])
  assert.deepEqual(b.items, [{ purchase_item_id: 'l1', qty: 3 }, { purchase_item_id: 'l2', qty: 1 }]); assert.equal(b.settlement, 'adjust')
  fireEvent.click(q().getByText('Print Debit Note'))
  const pd = JSON.parse(q().getByTestId('print').textContent!)
  assert.equal(pd.type, 'PURCHASE_RETURN'); assert.equal(pd.voucherNo, 'DN-2026-00001'); assert.equal(pd.referenceNo, 'PB-0001'); assert.equal(pd.partyName, 'Alpha Pharma')
  assert.equal(pd.netTotal, 370); assert.equal(pd.subtotal, 400); assert.equal(pd.discountAmt, 30); assert.equal(pd.items[0].batch_no, 'B1')
  assert.match(pd.settlement, /adjusted against bill outstanding/)
})

test('server rejection because stock was sold meanwhile shows the message and reloads the bill from the server', async () => {
  reset(); state.createFails = 'Only 1 of "Paracetamol 500" (batch B1) is still in stock — the rest has already been sold'; await openBill()
  type(qtyInput('Paracetamol 500'), '3'); await waitFor(() => assert.ok(q().getByText('Net credit'))); await waitFor(() => assert.equal(reviewBtn().disabled, false))
  fireEvent.click(q().getByText('Review & Post Return')); await waitFor(() => assert.ok(q().getByText('Post Return')))
  await act(async () => { fireEvent.click(q().getByText('Post Return')) })
  await waitFor(() => assert.ok(q().getByText(/is still in stock/))); await waitFor(() => assert.equal(calls.bill.length, 2))
})

test('All Returns: filters + pagination reach the API; an older return without detail still prints from its voucher', async () => {
  reset()
  state.listRows = [{ id: 'v1', voucher_no: 'DN-OLD-1', voucher_date: '2026-05-01', total_amount: 250, status: 'POSTED', party_name: 'Beta Distributors', original_invoice_no: 'PB-0009', purchase_return_id: null }]
  state.listTotal = 45
  render(<PurchaseReturnPage />)
  fireEvent.click(q().getByText('All Returns')); await waitFor(() => assert.ok(q().getAllByText('DN-OLD-1').length))
  type(q().getByLabelText('Search returns'), 'PB-0009'); await waitFor(() => assert.ok(calls.list.some(c => c.search === 'PB-0009')))
  type(q().getByLabelText('Status'), 'POSTED'); await waitFor(() => assert.ok(calls.list.some(c => c.status === 'POSTED')))
  fireEvent.click(q().getByText('2')); await waitFor(() => assert.ok(calls.list.some(c => c.page === 2)))
  await act(async () => { fireEvent.click(q().getAllByText('Print')[0]) }); await waitFor(() => assert.ok(q().getByTestId('print')))
  const pd = JSON.parse(q().getByTestId('print').textContent!)
  assert.equal(pd.voucherNo, 'DN-OLD-1'); assert.equal(pd.netTotal, 250); assert.equal(pd.referenceNo, 'PB-0009'); assert.equal(pd.type, 'PURCHASE_RETURN')
})
