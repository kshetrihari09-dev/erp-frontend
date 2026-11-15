/**
 * Ledger on phones = the SAME accounting table, compacted (Description hidden by CSS). This pins the contract between the
 * component and the mobile CSS, that the old card list is gone, and that the ledger's features still work.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'

const PARTY = { id: 'p1', name: 'Bishal Prahamic Upchar Kendra', code: 'C001', phone: '071-540123', pan_no: '608980061' }
const TYPES = ['SALES', 'RECEIPT', 'SALES RETURN', 'JOURNAL']
const mkRows = (n: number) => {
  let bal = 1000
  const rows: any[] = [{ entry_date: '2026-01-01', date_ad: '2026-01-01', type: 'opening', reference: '', description: 'Opening Balance', debit: 0, credit: 0, running_balance: bal }]
  for (let i = 0; i < n; i++) {
    const dr = i % 2 === 0 ? 100 + i : 0, cr = i % 2 === 1 ? 50 + i : 0
    bal += dr - cr
    rows.push({ entry_date: `2026-02-${String((i % 27) + 1).padStart(2, '0')}`, date_ad: `2026-02-${String((i % 27) + 1).padStart(2, '0')}`,
      type: TYPES[i % TYPES.length], reference: `REF-${1000 + i}`, description: i === 3 ? 'Bank transfer received' : `Entry number ${i}`, debit: dr, credit: cr, running_balance: bal })
  }
  return rows
}
const api = vi.hoisted(() => ({ customers: vi.fn(), suppliers: vi.fn(), ledger: vi.fn(), accounts: vi.fn(), accLedger: vi.fn() }))
vi.mock('@/services/api', () => ({
  partiesAPI: { customers: api.customers, suppliers: api.suppliers, ledger: api.ledger },
  accountingAPI: { accounts: api.accounts, ledger: api.accLedger },
}))
vi.mock('@/components/ui/DateRangePopup', () => ({ DateRangeFilter: () => <div data-testid="range" /> }))
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = (p: any) => { const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = p; return rest }
  const make = (tag: string) => React.forwardRef((p: any, r: any) => React.createElement(tag, { ...strip(p), ref: r }))
  return { motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }), AnimatePresence: ({ children }: any) => children }
})
import LedgerPage from './LedgerPage'

async function generate(rowCount: number) {
  api.ledger.mockResolvedValue({ data: { data: { party: PARTY, rows: mkRows(rowCount), opening_balance: 1000, closing_balance: 1000 } } })
  const view = render(<LedgerPage />)
  await waitFor(() => expect(api.customers).toHaveBeenCalled()); await new Promise(r => setTimeout(r, 60))   // let the party list load
  fireEvent.click(view.container.querySelector('.ldg-acct-select button') as HTMLElement)
  fireEvent.click(await screen.findByText(PARTY.name))
  fireEvent.click(view.container.querySelector('.ldg-generate-btn') as HTMLElement)
  await waitFor(() => expect(view.container.querySelector('.ldg-table tbody tr.ldg-row-opening')).toBeTruthy(), { timeout: 4000 })   // real rows, not the loading skeleton
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  api.customers.mockResolvedValue({ data: { data: [PARTY] } }); api.suppliers.mockResolvedValue({ data: { data: [] } }); api.accounts.mockResolvedValue({ data: { data: [] } })
})

describe('Ledger table — structure the mobile CSS relies on', () => {
  test('one table: 7 columns incl. Description; Description th/td and Balance th/td carry their hooks', async () => {
    const { container } = await generate(5)
    const heads = [...container.querySelectorAll('.ldg-table thead th')]
    expect(heads.map(h => h.textContent?.trim())).toEqual(['Date', 'Reference', 'Description', 'Type', 'Debit', 'Credit', 'Balance'])
    expect(heads[2].classList.contains('ldg-col-desc')).toBe(true); expect(heads[6].classList.contains('ldg-col-bal')).toBe(true)
    container.querySelectorAll('.ldg-table tbody tr').forEach(tr => {
      const tds = tr.querySelectorAll('td'); expect(tds).toHaveLength(7)
      expect(tds[2].classList.contains('ldg-col-desc')).toBe(true)          // Description cell (3rd) — hidden on phones
      expect(tds[6].classList.contains('ldg-col-bal')).toBe(true)           // Balance cell — pinned on narrow screens
    })
    expect(container.querySelectorAll('.ldg-col-desc').length).toBe(1 + 6)  // 1 header + 6 rows (opening + 5)
  })

  test('the opening-balance row is marked; the totals footer has a 4-col (desktop) and a 3-col (phone) label cell', async () => {
    const { container } = await generate(5)
    expect(container.querySelectorAll('.ldg-table tbody tr.ldg-row-opening')).toHaveLength(1)
    const desk = container.querySelector('.ldg-foot-label-desk') as HTMLElement, mob = container.querySelector('.ldg-foot-label-mob') as HTMLElement
    expect(desk.getAttribute('colspan')).toBe('4'); expect(mob.getAttribute('colspan')).toBe('3')
    expect(desk.textContent).toMatch(/Period Totals/i); expect(mob.textContent).toMatch(/Period Totals/i)
    expect(container.querySelector('.ldg-table tfoot .ldg-col-bal')).toBeTruthy()
    // desktop footer = 4 + 3 spans... only ONE label is ever displayed, so the visible row is always 7 (desktop) / 6 (phone) wide
  })

  test('the phone-only card list is gone (no second rendering of the ledger)', async () => {
    const { container } = await generate(5)
    expect(container.querySelector('.ldg-mobile-list')).toBeNull(); expect(container.querySelector('[class*="ldg-mc-"]')).toBeNull()
    expect(container.querySelectorAll('.ldg-table')).toHaveLength(1)
  })
})

describe('Ledger stylesheet (mobile-only rules)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../styles/globals.css'), 'utf8')
  const block = (re: RegExp) => { const m = css.match(re); return m ? m[0] : '' }

  test('Description is hidden only inside the phone media query', () => {
    const phone = css.slice(css.indexOf('/* Phones (≤ 640px) */'))
    expect(phone).toMatch(/@media \(max-width: 640px\)\s*\{[\s\S]*?\.ldg-col-desc[\s\S]*?display:\s*none !important/)
    // never hidden outside a media query
    const outside = css.replace(/@media[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    expect(outside).not.toMatch(/\.ldg-col-desc\s*\{[^}]*display:\s*none/)
  })
  test('phone cells never wrap and are compacted', () => {
    const phone = css.slice(css.indexOf('/* Phones (≤ 640px) */'))
    expect(phone).toMatch(/\.ldg-table tbody td[\s\S]*?white-space:\s*nowrap !important/)
    expect(phone).toMatch(/padding:\s*7px 5px !important/)
  })
  test('the table is no longer hidden on small screens, and the card styles are removed', () => {
    expect(css).not.toMatch(/\.ldg-desktop-table-wrap\s*\{\s*display:\s*none/)
    expect(css).not.toMatch(/\.ldg-mobile-list|\.ldg-mc-|\.ldg-mobile-card/)
    expect(css).toMatch(/\.ldg-desktop-table-wrap\s*\{[^}]*overflow-x:\s*auto/)          // scrolls inside its own container
  })
  test('the 4-col footer label is the default; the 3-col one shows only on phones; Balance is pinned when narrow', () => {
    expect(css).toMatch(/\.ldg-table \.ldg-foot-label-mob\s*\{\s*display:\s*none;?\s*\}/)
    expect(css).toMatch(/@media \(max-width: 1024px\)\s*\{[\s\S]*?\.ldg-col-bal\s*\{[^}]*position:\s*sticky;\s*right:\s*0/)
  })
})

describe('Ledger features are unchanged', () => {
  test('search filters the table; clearing restores it; entries count shown', async () => {
    const { container } = await generate(8)
    expect(container.querySelectorAll('.ldg-table tbody tr')).toHaveLength(9)          // opening + 8
    fireEvent.change(screen.getByPlaceholderText(/Search entries/i), { target: { value: 'Bank transfer' } })
    await waitFor(() => expect(container.querySelectorAll('.ldg-table tbody tr')).toHaveLength(1))
    expect(container.textContent).toMatch(/filtered from 9/)
  })
  test('period totals, debit/credit colours and transaction badges render', async () => {
    const { container } = await generate(6)
    const foot = container.querySelector('.ldg-table tfoot') as HTMLElement
    const nums = [...foot.querySelectorAll('td')].map(t => t.textContent || '')
    expect(nums.join(' ')).toMatch(/Period Totals/i)
    expect(container.querySelectorAll('.ldg-txbadge').length).toBeGreaterThanOrEqual(6)
    const firstDebit = container.querySelector('.ldg-table tbody tr:nth-child(2) td:nth-child(5)') as HTMLElement
    expect(firstDebit.style.color).toBeTruthy()
  })
  test('pagination + rows-per-page: 20 per page of 31, page 2 shows the rest', async () => {
    const { container } = await generate(30)
    expect(container.querySelectorAll('.ldg-table tbody tr')).toHaveLength(20)
    const pag = container.querySelector('.ldg-pagination') as HTMLElement
    expect(within(pag).getByText(/Showing 1–20 of 31/)).toBeTruthy()
    fireEvent.click(within(pag).getByText('2'))
    await waitFor(() => expect(container.querySelectorAll('.ldg-table tbody tr')).toHaveLength(11))
  })
  test('rows-per-page selector: 50 shows all 31 rows', async () => {
    const { container } = await generate(30)
    fireEvent.change((container.querySelector('.ldg-pagination') as HTMLElement).querySelector('select') as HTMLSelectElement, { target: { value: '50' } })
    await waitFor(() => expect(container.querySelectorAll('.ldg-table tbody tr')).toHaveLength(31))
  })
})
