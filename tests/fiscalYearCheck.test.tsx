// Fiscal-year awareness in the transaction forms. The SERVER is authoritative (see the backend
// fiscal-year-enforcement suite); these tests cover the early, user-facing half: the pure date check, the hint,
// and that Sale / Purchase / Receipt forms block Post for a date the server would refuse.
import './setup-dom'
import test from 'node:test'
import assert from 'node:assert/strict'
import { render, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import useUIStore from '../src/store/uiStore'
import FiscalYearHint, { checkFiscalYear, FY_MESSAGES } from '../src/components/forms/FiscalYearHint'
import { adToYMD, formatYMD } from '../src/utils/dateRange'
import { convertInputDateToAD } from '../src/utils/dateSystem'
import SalesPage from '../src/modules/sales/SalesPage'
import PurchasePage from '../src/modules/purchases/PurchasePage'
import ReceiptsTab from '../src/modules/accounting/tabs/ReceiptsTab'
import { fiscal, fy } from './mock-api-fy-check'
import { calls } from './mock-api-cc-sync'

;(globalThis as any).window.HTMLElement.prototype.scrollIntoView = function () {}
const q = () => within(document.body)
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const type = (el: Element, v: string) => fireEvent.change(el, { target: { value: v } })

const Y1 = fy('FY 2083/84', '2026-07-17', '2027-07-16')                // BS 2083-04-01 … 2084-03-31
const Y0 = fy('FY 2082/83', '2025-07-17', '2026-07-16')                // BS 2082-04-01 … 2083-03-32 (32-day Ashadh)

/* ───────────────────────── the pure check ───────────────────────── */
test('checkFiscalYear: inside → ok; the first and last day are INCLUSIVE', () => {
  for (const d of ['2026-07-17', '2026-12-01', '2027-07-16']) {
    const c = checkFiscalYear([Y1], d); assert.equal(c.status, 'ok'); assert.equal(c.blocked, false); assert.equal(c.fy?.name, 'FY 2083/84')
  }
})
test('checkFiscalYear: one day before the start / after the end → blocked with the outside-year message', () => {
  for (const d of ['2026-07-16', '2027-07-17', '2020-01-01']) {
    const c = checkFiscalYear([Y1], d); assert.equal(c.status, 'outside'); assert.equal(c.blocked, true); assert.equal(c.message, FY_MESSAGES.outside); assert.equal(c.fy, null)
  }
})
test('checkFiscalYear: a closed year blocks and still reports which year it is', () => {
  const c = checkFiscalYear([{ ...Y1, is_locked: true } as any], '2026-12-01')
  assert.equal(c.status, 'closed'); assert.equal(c.blocked, true); assert.equal(c.message, 'Cannot post transactions to a closed fiscal year.'); assert.equal(c.fy?.id, Y1.id)
})
test('checkFiscalYear: "active" is irrelevant — an open year that is not active still accepts dates; an active but closed one does not', () => {
  assert.equal(checkFiscalYear([{ ...Y1, is_active: false } as any], '2026-12-01').blocked, false)
  assert.equal(checkFiscalYear([{ ...Y1, is_active: true, is_locked: true } as any], '2026-12-01').blocked, true)
})
test('checkFiscalYear: adjacent years are told apart at the boundary (BS 2083-03-32 vs 2083-04-01)', () => {
  assert.equal(checkFiscalYear([Y0, Y1], '2026-07-16').fy?.name, 'FY 2082/83')
  assert.equal(checkFiscalYear([Y0, Y1], '2026-07-17').fy?.name, 'FY 2083/84')
})
test('checkFiscalYear: a BS date typed by the user is judged by the AD day it converts to', () => {
  const bs = (ad: string) => formatYMD(adToYMD(ad, 'BS')!, 'date').replace(/\//g, '-')   // BS edit field format: YYYY-MM-DD
  const asAD = (ad: string) => convertInputDateToAD(bs(ad), 'BS')
  assert.equal(checkFiscalYear([Y0, Y1], asAD('2026-07-16')).fy?.name, 'FY 2082/83')
  assert.equal(checkFiscalYear([Y0, Y1], asAD('2026-07-17')).fy?.name, 'FY 2083/84')
  assert.equal(checkFiscalYear([Y1], asAD('2026-07-16')).blocked, true)
})
test('checkFiscalYear: no fiscal years configured → not restricted (same as the server); loading is not a block; empty/invalid dates are left to the form', () => {
  for (const years of [[], null, undefined]) { const c = checkFiscalYear(years as any, '2026-12-01'); assert.equal(c.status, 'not-configured'); assert.equal(c.blocked, false) }
  assert.equal(checkFiscalYear([], '2026-12-01', true).status, 'loading')
  for (const d of ['', undefined, null, 'not-a-date', '2026/12/01']) { const c = checkFiscalYear([Y1], d as any); assert.equal(c.status, 'no-date'); assert.equal(c.blocked, false) }
  assert.equal(checkFiscalYear([{ ...Y1, start_date_ad: '' } as any], '2026-12-01').status, 'not-configured')
})

/* ───────────────────────── the hint ───────────────────────── */
test('FiscalYearHint: shows the year for an in-range date; shows an alert for outside / closed; nothing otherwise', () => {
  cleanup(); useUIStore.setState({ dateMode: 'AD' } as any)
  const { rerender } = render(<FiscalYearHint check={checkFiscalYear([Y1], '2026-12-01')} />)
  assert.match(q().getByTestId('fy-hint').textContent || '', /FY 2083\/84 · 7\/17\/2026 – 7\/16\/2027/)   // same date format as the rest of the app (fmtDate)
  rerender(<FiscalYearHint check={checkFiscalYear([Y1], '2027-07-17')} />)
  assert.equal(q().getByRole('alert').textContent, FY_MESSAGES.outside)
  rerender(<FiscalYearHint check={checkFiscalYear([{ ...Y1, is_locked: true } as any], '2026-12-01')} />)
  assert.match(q().getByRole('alert').textContent || '', /FY 2083\/84 is closed\. Cannot post transactions to a closed fiscal year\./)
  rerender(<FiscalYearHint check={checkFiscalYear([], '2026-12-01')} />)
  assert.equal(document.querySelector('[data-testid=fy-hint]'), null)
})

/* ───────────────────────── real forms ───────────────────────── */
const mount = (el: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>)
const nextBtn = () => [...document.querySelectorAll('button')].find(b => /Next \(F12\)/.test(b.textContent || '')) as HTMLButtonElement
const setDate = (ad: string) => type(document.querySelector('.pos-cf-date-input') as HTMLInputElement, ad)
const hint = () => document.querySelector('[data-testid=fy-hint]')

for (const [label, Page, tab] of [['Sale', SalesPage, null], ['Purchase', PurchasePage, null]] as const) {
  async function open(years: any[]) {
    cleanup(); calls.salesCreate.length = 0; calls.purchaseCreate.length = 0
    useUIStore.setState({ dateMode: 'AD' } as any); fiscal.years = years
    mount(<Page />)
    await waitFor(() => assert.ok(nextBtn()))
    await sleep(40)
  }
  test(`${label} form: a date inside the open fiscal year shows the year and keeps Post enabled`, async () => {
    await open([Y0, Y1]); setDate('2026-12-01'); await sleep(10)
    assert.match(hint()?.textContent || '', /FY 2083\/84/); assert.equal(nextBtn().disabled, false)
  })
  test(`${label} form: before the start / after the end of every year → message shown and Post disabled; the boundaries themselves are fine`, async () => {
    await open([Y1])
    for (const d of ['2026-07-16', '2027-07-17']) {
      setDate(d); await sleep(10)
      assert.equal(q().getByRole('alert').textContent, FY_MESSAGES.outside); assert.equal(nextBtn().disabled, true, `Post blocked on ${d}`)
    }
    for (const d of ['2026-07-17', '2027-07-16']) { setDate(d); await sleep(10); assert.equal(nextBtn().disabled, false, `Post allowed on ${d}`); assert.equal(document.querySelector('[role=alert].fy-hint'), null) }
  })
  test(`${label} form: a closed fiscal year disables Post with the closed-year message; fixing the date re-enables it`, async () => {
    await open([{ ...Y0, is_locked: true }, Y1]); setDate('2026-01-15'); await sleep(10)
    assert.match(q().getByRole('alert').textContent || '', /closed fiscal year/); assert.equal(nextBtn().disabled, true)
    setDate('2026-09-01'); await sleep(10); assert.equal(nextBtn().disabled, false)
  })
  test(`${label} form: with NO fiscal years configured nothing is shown or blocked`, async () => {
    await open([]); setDate('1999-01-01'); await sleep(10)
    assert.equal(hint(), null); assert.equal(nextBtn().disabled, false)
  })
  test(`${label} form: pressing F12 with a blocked date does not open the review popup or call the API`, async () => {
    await open([Y1]); setDate('2020-01-01'); await sleep(10)
    fireEvent.keyDown(document, { key: 'F12' }); fireEvent.keyDown(window, { key: 'F12' }); await sleep(30)
    assert.equal(document.querySelector('.drv-footer-actions'), null); assert.equal(calls.salesCreate.length + calls.purchaseCreate.length, 0)
  })
}

test('Receipt form (Accounting): the same hint and block on the voucher date', async () => {
  cleanup(); useUIStore.setState({ dateMode: 'AD' } as any); fiscal.years = [Y1]
  mount(<ReceiptsTab type="RECEIPT" />)
  await sleep(60)
  const add = [...document.querySelectorAll('button')].find(b => /New Receipt|Add Receipt|\+ Receipt|Record|New/.test(b.textContent || '')) as HTMLButtonElement | undefined
  if (add) fireEvent.click(add)
  await sleep(40)
  const dateInput = document.querySelector('input[type=date]') as HTMLInputElement
  assert.ok(dateInput, 'date field present')
  type(dateInput, '2020-05-05'); await sleep(10)
  assert.equal(q().getByRole('alert').textContent, FY_MESSAGES.outside)
  type(dateInput, '2026-12-01'); await sleep(10)
  assert.match(hint()?.textContent || '', /FY 2083\/84/)
})
