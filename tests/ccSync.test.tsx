// CC% synchronisation: Product (saved cc_pct) → Sale page / Purchase page rows.
// Renders the REAL pages (+ real InvoiceRowsTable, ProductSearchCell, calcRowAmount); only the network layer
// (@/services/api), the barcode entry field and print are replaced. Products carry cc_pct exactly as the API
// returns it — DECIMAL strings "0.00" / "5.00" / "10.00".
import './setup-dom'
// jsdom has no layout engine: stub the scroll helpers the pages call on focus.
;(globalThis as any).window.HTMLElement.prototype.scrollIntoView = function () {}
;(globalThis as any).Element.prototype.scrollIntoView = function () {}
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesPage from '../src/modules/sales/SalesPage'
import PurchasePage from '../src/modules/purchases/PurchasePage'
import useUIStore from '../src/store/uiStore'
import { fmt } from '../src/utils'
import { calls } from './mock-api-cc-sync'

const q = () => within(document.body)
const type = (el: Element, v: string) => fireEvent.change(el, { target: { value: v } })
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)) })

type Kind = { label: string; Page: any; rate: Record<string, number>; created: () => any[]; partyLabel: RegExp }
const KINDS: Kind[] = [
  { label: 'Sale',     Page: SalesPage,    rate: { p0: 100, p5: 200, p10: 300 }, created: () => calls.salesCreate,    partyLabel: /Select a customer/ },
  { label: 'Purchase', Page: PurchasePage, rate: { p0: 80,  p5: 150, p10: 240 }, created: () => calls.purchaseCreate, partyLabel: /Select a supplier/ },
]
const ccAmt = (bonus: number, rate: number, pct: number) => +(bonus * rate * pct / 100).toFixed(2)
const NAME: Record<string, string> = { p0: 'Zero CC Tab', p5: 'Five CC Tab', p10: 'Ten CC Tab' }

async function open(Page: any) {
  cleanup(); useUIStore.setState({ dateMode: 'AD' } as any)
  calls.salesCreate.length = 0; calls.purchaseCreate.length = 0
  const r = render(<QueryClientProvider client={new QueryClient()}><Page /></QueryClientProvider>)
  await waitFor(() => assert.ok(r.container.querySelector('table tbody tr')))
  await sleep(30)                                   // let the product-list fetch settle
  return r.container
}

/* ── desktop table helpers (header label → column) ─────────────────────── */
const desktopRow = (c: HTMLElement, i = 0) => c.querySelectorAll('table tbody tr')[i] as HTMLElement
const cellOf = (c: HTMLElement, row: HTMLElement, header: string) => {
  const ths = [...c.querySelectorAll('table thead th')]
  const idx = ths.findIndex(th => (th.textContent || '').trim().startsWith(header))
  assert.ok(idx >= 0, `column ${header}`)
  return row.children[idx] as HTMLElement
}
const inputIn = (el: Element) => el.querySelector('input') as HTMLInputElement
const desktopCC   = (c: HTMLElement, i = 0) => inputIn(cellOf(c, desktopRow(c, i), 'C.C %')).value
const desktopCCAmt = (c: HTMLElement, i = 0) => (cellOf(c, desktopRow(c, i), 'C.C Amount').textContent || '').trim()
const setDesktop = (c: HTMLElement, header: string, v: string, i = 0) => type(inputIn(cellOf(c, desktopRow(c, i), header)), v)

/* ── mobile row helpers ────────────────────────────────────────────────── */
const mobileRow = (c: HTMLElement, i = 0) => c.querySelectorAll('.pmic-row2')[i] as HTMLElement
const mobileCC = (c: HTMLElement, i = 0) => (within(mobileRow(c, i)).getByLabelText('C.C %') as HTMLInputElement).value

/* ── drive the REAL ProductSearchCell inside `scope` ───────────────────── */
async function pick(scopeOrFn: HTMLElement | (() => HTMLElement), id: string) {
  const get = () => (typeof scopeOrFn === 'function' ? scopeOrFn() : scopeOrFn)
  let scope = get()
  let input = scope.querySelector('.psc-input') as HTMLInputElement | null
  if (!input) { fireEvent.click(scope.querySelector('.psc-trigger') as HTMLElement); input = scope.querySelector('.psc-input') as HTMLInputElement }
  assert.ok(input, 'search input opened')
  type(input, NAME[id])
  const opt = await waitFor(() => {
    const opts = q().queryAllByRole('option')
    // the real result row only — NOT the transient "Create new product '…'" row shown before results arrive
    const o = opts.find(x => x.querySelector('.psc-option-name')?.textContent === NAME[id])
    assert.ok(o, `option for ${NAME[id]} (options now: ${opts.map(x => x.textContent).join(' | ') || 'none'}; searched: ${calls.search.join(',')})`)
    return o!
  }, { timeout: 2000 })
  fireEvent.mouseDown(opt)
  await waitFor(() => { scope = get(); assert.ok((scope.querySelector('.psc-trigger')?.textContent || '').includes(NAME[id]), `trigger shows ${NAME[id]}; scope is now: ${scope.innerHTML.replace(/<svg.*?<\/svg>/g, '').slice(0, 300)}`) })
  await sleep(10)
}
const scan = async (id: string) => { const s = q().getByLabelText('scan'); type(s, id); fireEvent.keyDown(s, { key: 'Enter' }); await sleep(20) }

for (const K of KINDS) {
  test(`${K.label}: choosing a product in the desktop row loads ITS saved CC% (0 / 5 / 10), and switching never keeps the previous one`, async () => {
    const c = await open(K.Page)
    await pick(() => desktopRow(c), 'p10'); assert.equal(desktopCC(c), '10')
    await pick(() => desktopRow(c), 'p5');  assert.equal(desktopCC(c), '5',  'switched 10% → 5%: no stale 10')
    await pick(() => desktopRow(c), 'p0');  assert.equal(desktopCC(c), '0',  'switched 5% → 0%: legitimate zero, no stale 5')
    await pick(() => desktopRow(c), 'p10'); assert.equal(desktopCC(c), '10', 'and back again')
  })

  test(`${K.label}: CC amount follows the existing rule (bonus × rate × CC%) and is recomputed with the NEW product's CC% on switch`, async () => {
    const c = await open(K.Page)
    await pick(() => desktopRow(c), 'p10')
    setDesktop(c, 'Bonus', '10'); await sleep(10)
    assert.equal(desktopCCAmt(c), fmt(ccAmt(10, K.rate.p10, 10)))                // 10% of bonus value
    await pick(() => desktopRow(c), 'p5')
    assert.equal(desktopCC(c), '5')
    assert.equal(desktopCCAmt(c), fmt(ccAmt(10, K.rate.p5, 5)), 'amount uses the new rate AND the new CC%')
    await pick(() => desktopRow(c), 'p0')
    assert.equal(desktopCC(c), '0')
    assert.ok(!/\d/.test(desktopCCAmt(c)) || Number(desktopCCAmt(c).replace(/[^\d.]/g, '')) === 0, `0% → no CC amount (got "${desktopCCAmt(c)}")`)
  })

  test(`${K.label}: quantity change keeps CC%; a manual CC% edit survives qty/bonus edits and is replaced only by selecting another product`, async () => {
    const c = await open(K.Page)
    await pick(() => desktopRow(c), 'p5')
    setDesktop(c, 'Bonus', '4')
    setDesktop(c, 'C.C %', '7'); await sleep(10)
    assert.equal(desktopCC(c), '7')
    assert.equal(desktopCCAmt(c), fmt(ccAmt(4, K.rate.p5, 7)), 'manual CC% drives the amount')
    setDesktop(c, 'Qty', '3'); await sleep(10)
    assert.equal(desktopCC(c), '7', 'qty edit must not overwrite the manual CC%')
    setDesktop(c, 'Bonus', '6'); await sleep(10)
    assert.equal(desktopCC(c), '7', 'bonus edit must not overwrite the manual CC%')
    assert.equal(desktopCCAmt(c), fmt(ccAmt(6, K.rate.p5, 7)))
    await pick(() => desktopRow(c), 'p10'); assert.equal(desktopCC(c), '10', 'a different product brings its own saved CC%')
  })

  test(`${K.label}: mobile/tablet row — product pick loads the saved CC% (0 shows empty, 5, 10) and switching is not stale`, async () => {
    const c = await open(K.Page)
    const scope = () => mobileRow(c).querySelector('.pmic-row2-product') as HTMLElement
    await pick(scope, 'p10'); assert.equal(mobileCC(c), '10')
    await pick(scope, 'p5');  assert.equal(mobileCC(c), '5')
    await pick(scope, 'p0');  assert.equal(mobileCC(c), '', '0% is shown as the empty/placeholder state, not the old 5')
    // the amount on this row uses the new product's CC% too
    const bonus = within(mobileRow(c)).getByLabelText('Bonus') as HTMLInputElement
    await pick(scope, 'p10'); type(bonus, '10'); await sleep(10)
    const ccBefore = mobileCC(c); assert.equal(ccBefore, '10')
    // desktop row 0 is the same state: its CC amount must be 10% of 10 × rate
    assert.equal(desktopCCAmt(c), fmt(ccAmt(10, K.rate.p10, 10)))
  })

  test(`${K.label}: barcode/scan path — each scanned product gets its own CC%; re-scan only bumps qty`, async () => {
    const c = await open(K.Page)
    await scan('p5');  await waitFor(() => assert.equal(desktopCC(c, 0), '5'))
    await scan('p10'); await waitFor(() => assert.equal(c.querySelectorAll('table tbody tr').length >= 2 && desktopCC(c, 1), '10'))
    await scan('1000'); await waitFor(() => assert.equal(desktopCC(c, 2), '0'))            // barcode of the 0% product
    await scan('p5');                                                                      // already on the invoice
    assert.equal(desktopCC(c, 0), '5')
    assert.equal(inputIn(cellOf(c, desktopRow(c, 0), 'Qty')).value, '2', 're-scan bumps the existing row qty')
  })

  test(`${K.label}: saving sends the row's CC% and CC amount (what the backend then stores)`, async () => {
    const c = await open(K.Page)
    // party
    const partySel = [...c.querySelectorAll('select')].find(s => /ABC Traders|Alpha Pharma/.test(s.textContent || '')) as HTMLSelectElement
    type(partySel, partySel.options[1].value)
    await pick(() => desktopRow(c), 'p5')
    setDesktop(c, 'Bonus', '10'); setDesktop(c, 'Qty', '2'); await sleep(10)
    const btn = (re: RegExp, root: ParentNode = document.body) => [...root.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim())) as HTMLButtonElement
    const cash = btn(/^Cash$/); if (cash) fireEvent.click(cash)                                // payment mode
    fireEvent.click(btn(/Next \(F12\)/))                                                    // validates, opens the review popup
    await waitFor(() => assert.ok(document.querySelector('.drv-footer-actions'), `review popup open; page says: ${[...document.querySelectorAll('[class*=flash],[class*=alert],[role=alert]')].map(e => e.textContent).join(' / ')}`))
    fireEvent.click(btn(/^Post Invoice$/, document.querySelector('.drv-footer-actions')!))    // popup → confirm dialog
    await waitFor(() => assert.ok(btn(/^Confirm$/), 'confirm dialog open'))
    fireEvent.click(btn(/^Confirm$/))
    await waitFor(() => assert.ok(K.created().length >= 1, 'create API called'), { timeout: 3000 })
    const item = K.created()[0].items[0]
    assert.equal(item.product_id, 'p5')
    assert.equal(Number(item.cc_pct), 5)
    assert.equal(Number(item.bonus), 10)
    // Sale lines carry the computed cc_amount; Purchase lines send cc_pct only and the backend
    // recomputes the amount (utils/purchaseCalc.js) — see the backend test for the stored figures.
    if (K.label === 'Sale') assert.equal(Number(item.cc_amount), ccAmt(10, K.rate.p5, 5))
    else assert.equal(item.cc_amount, undefined)
  })
}
