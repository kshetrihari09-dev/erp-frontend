/**
 * Company vs Customer → double-click a customer row → product-wise detail window.
 * Renders the REAL page and the REAL detail component; only the HTTP client is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { api, navigate } = vi.hoisted(() => ({ api: { get: vi.fn(), companies: vi.fn(), products: vi.fn(), exportCsv: vi.fn() }, navigate: vi.fn() }))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }))
vi.mock('@/services/api', async (orig) => ({ ...(await orig<any>()), companyCustomerAPI: api }))
vi.mock('@/hooks/useQuery', async (orig) => ({ ...(await orig<any>()), useManufacturers: () => ({ data: [{ id: 'm', name: 'Cipla', short_name: 'CIP', is_active: true }] }) }))

import CompanyCustomerReportPage from './CompanyCustomerReportPage'

const row = (o: any) => ({ customer_id: 'c1', customer_code: 'C001', customer_name: 'Delta Medical', customer_type: 'customer', opening_balance: 0, sales: 1000, discount: 100, sales_return: 0, sales_return_expiry: 0, net: 900, receipts: 0, ledger_movement: 0, closing_balance: 900, ...o })
const REPORT = (company = 'all') => ({
  title: 'Company vs Customer', filters: { from: '2026-05-01', to: '2026-05-31', company, customer_type: 'all' },
  rows: [row({}), row({ customer_id: 'c2', customer_code: 'C002', customer_name: 'Other Customer', sales: 500, net: 500 }), row({ customer_id: null, customer_code: '', customer_name: 'Cash / Walk-in Customer', sales: 60, discount: 0, net: 60 })],
  totals: { opening_balance: 0, sales: 1560, discount: 100, sales_return: 0, sales_return_expiry: 0, net: 1460, receipts: 0, ledger_movement: 0, closing_balance: 1460 },
})
const DETAIL = (over: any = {}) => ({
  title: 'x', customer: { id: 'c1', code: 'C001', name: 'Delta Medical' }, company: 'all',
  filters: { from: '2026-05-01', to: '2026-05-31', customer_id: 'c1', company: 'all', discount_excluded: true },
  rows: [
    { product_id: 'p1', product: 'Paracetamol', m_code: 'M001', company: 'Cipla', sales_qty: 14, sales_amt: 1400, free_qty: 2, free_value: 200, return_qty: 4, return_amt: 400, total_qty: 12, total_amt: 1000 },
    { product_id: 'p3', product: 'Sunzol', m_code: 'M003', company: 'Sun', sales_qty: 3, sales_amt: 600, free_qty: 0, free_value: 0, return_qty: 5, return_amt: 1000, total_qty: -2, total_amt: -400 },
  ],
  totals: { sales_qty: 17, sales_amt: 2000, free_qty: 2, free_value: 200, return_qty: 9, return_amt: 1400, total_qty: 10, total_amt: 600 }, ...over,
})

async function loadReport() {
  render(<MemoryRouter><CompanyCustomerReportPage /></MemoryRouter>)
  await screen.findByText('Delta Medical')
}
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

beforeEach(() => {
  Object.values(api).forEach((f: any) => f.mockReset()); navigate.mockReset()
  api.companies.mockResolvedValue({ data: { data: ['Cipla', 'Sun'] } })
  api.get.mockImplementation(async (p: any) => ({ data: { data: REPORT(p.company) } }))
  api.products.mockResolvedValue({ data: { data: DETAIL() } })
})

describe('double-click a customer row', () => {
  it('single click only selects — nothing opens or is requested', async () => {
    await loadReport(); fireEvent.click(rowOf('Delta Medical'))
    expect(rowOf('Delta Medical').className).toContain('sel'); expect(screen.queryByRole('dialog')).toBeNull(); expect(api.products).not.toHaveBeenCalled()
  })

  it('opens the detail for THAT customer with the report\'s company filter and dates', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical'))
    const dlg = await screen.findByRole('dialog')
    expect(api.products.mock.calls[0][0]).toEqual({ customer_id: 'c1', company: 'all', from: '2026-05-01', to: '2026-05-31', discount_excluded: true })
    expect(within(dlg).getByText('Company vs Customer — Product-wise')).toBeInTheDocument()
    expect(within(dlg).getByText('C001 — Delta Medical')).toBeInTheDocument(); expect(within(dlg).getByText('All Companies')).toBeInTheDocument()
  })

  it('another customer row opens that customer', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Other Customer')); await screen.findByRole('dialog')
    expect(api.products.mock.calls[0][0]).toMatchObject({ customer_id: 'c2' })
  })

  it('the Cash / Walk-in row is requested as "walkin"', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Cash / Walk-in Customer')); await screen.findByRole('dialog')
    expect(api.products.mock.calls[0][0]).toMatchObject({ customer_id: 'walkin' })
  })

  it('a selected company is passed along — the one of the REPORT ON SCREEN, not a changed-but-not-applied filter', async () => {
    await loadReport()
    const select = screen.getByLabelText('Company') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Cipla' } }); fireEvent.click(screen.getByRole('button', { name: /Report/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); await screen.findByText('Delta Medical')
    fireEvent.change(select, { target: { value: 'Sun' } })                           // changed, but "Report" not pressed
    fireEvent.doubleClick(rowOf('Delta Medical')); await screen.findByRole('dialog')
    expect(api.products.mock.calls[0][0]).toMatchObject({ company: 'Cipla' })
    expect(within(screen.getByRole('dialog')).getByText('Cipla', { selector: 'b' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('(CIP)')).toBeInTheDocument()
  })

  it('lists every product with its own company; 12 columns; bottom totals', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical'))
    const dlg = await screen.findByRole('dialog')
    for (const h of ['S.Code', 'Company', 'M.Code', 'Product', 'Sales Qty', 'Sales Amt', 'F Qty', 'F. Value', 'Retu. Qty', 'Return Amt', 'Tot Qty', 'Tot Amt'])
      expect(within(dlg).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const body = within(dlg).getAllByRole('row').filter(r => within(r).queryAllByRole('cell').length === 12)
    expect(body).toHaveLength(2)
    const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map(c => c.textContent)
    expect(cells(body[0]).slice(0, 4)).toEqual(['CIP', 'Cipla', 'M001', 'Paracetamol'])      // S.Code from the company's own short code
    expect(cells(body[1]).slice(0, 4)).toEqual(['', 'Sun', 'M003', 'Sunzol'])
    const foot = dlg.querySelector('tfoot tr') as HTMLElement
    expect(foot.textContent).toContain('Total (2 products)'); expect(foot.textContent).toContain('2,000.00'); expect(foot.textContent).toContain('600.00')
  })

  it('negative figures preserved; loading, error + Retry, and empty states', async () => {
    let resolve!: (v: any) => void; api.products.mockReturnValueOnce(new Promise(r => { resolve = r }))
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical'))
    expect(await screen.findByText(/Loading product-wise report/)).toBeInTheDocument()
    resolve({ data: { data: DETAIL() } })
    const sun = (await screen.findByText('Sunzol')).closest('tr') as HTMLElement
    expect(sun.textContent).toContain('-2'); expect(sun.textContent).toContain('-400.00')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    api.products.mockRejectedValueOnce({ response: { data: { message: 'Customer not found' } } })
    fireEvent.doubleClick(rowOf('Other Customer'))
    expect(await screen.findByText(/Customer not found/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText('Paracetamol')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    api.products.mockResolvedValueOnce({ data: { data: DETAIL({ rows: [], totals: { sales_qty: 0, sales_amt: 0, free_qty: 0, free_value: 0, return_qty: 0, return_amt: 0, total_qty: 0, total_amt: 0 } }) } })
    fireEvent.doubleClick(rowOf('Delta Medical')); expect(await screen.findByText(/No product transactions/)).toBeInTheDocument()
  })

  it('Discount Excluded toggle re-requests with discount_excluded=false (same customer / company / dates)', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical')); await screen.findByText('Paracetamol')
    fireEvent.click(screen.getByLabelText(/Discount Excluded/))
    await waitFor(() => expect(api.products).toHaveBeenCalledTimes(2))
    expect(api.products.mock.calls[1][0]).toEqual({ customer_id: 'c1', company: 'all', from: '2026-05-01', to: '2026-05-31', discount_excluded: false })
  })
})

describe('closing returns to the untouched report', () => {
  it('Close: filters, dates, rows and selection unchanged; the report is not re-requested', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical')); await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((screen.getByLabelText('Company') as HTMLSelectElement).value).toBe('all')
    expect(rowOf('Delta Medical').className).toContain('sel'); expect(screen.getByText('Other Customer')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(1)
  })
  it('Esc closes only the detail window, and does not exit the report; with nothing open Esc exits as before', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical')); await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(navigate).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' }); expect(navigate).toHaveBeenCalledTimes(1)
  })
  it('re-generating the report closes a stale window state (Esc exits again afterwards)', async () => {
    await loadReport(); fireEvent.doubleClick(rowOf('Delta Medical')); await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); fireEvent.click(screen.getByRole('button', { name: /Report/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); fireEvent.keyDown(window, { key: 'Escape' }); expect(navigate).toHaveBeenCalledTimes(1)
  })
})

describe('only customer rows are interactive; the existing report is unchanged', () => {
  it('header, footer totals and Enter key', async () => {
    await loadReport()
    fireEvent.doubleClick(screen.getByRole('columnheader', { name: 'Particular' })); fireEvent.doubleClick(screen.getByText('Total'))
    expect(screen.queryByRole('dialog')).toBeNull(); expect(api.products).not.toHaveBeenCalled()
    fireEvent.keyDown(rowOf('Other Customer'), { key: 'Enter' }); await screen.findByRole('dialog')
    expect(api.products.mock.calls[0][0]).toMatchObject({ customer_id: 'c2' })
  })
  it('original columns, rows, totals and buttons are intact', async () => {
    await loadReport()
    for (const h of ['Sales', 'Discount', 'Sales Return', 'Sales Return Expiry', 'Net', 'Receipts', 'Closing Balance']) expect(screen.getAllByRole('columnheader', { name: h }).length).toBeGreaterThan(0)
    expect(screen.getByText('1,560.00')).toBeInTheDocument()
    for (const b of [/Report/, /Exit/, /Print/, /CSV/]) expect(screen.getByRole('button', { name: b })).toBeInTheDocument()
  })
})
