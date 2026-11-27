/**
 * Customer vs Company → double-click a company row → product-wise detail window.
 * Renders the REAL page and the REAL detail component; only the HTTP client is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { api, navigate } = vi.hoisted(() => ({
  api: { get: vi.fn(), customers: vi.fn(), products: vi.fn(), exportCsv: vi.fn() },
  navigate: vi.fn(),
}))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }))
vi.mock('@/services/api', async (orig) => ({ ...(await orig<any>()), customerCompanyAPI: api }))
vi.mock('@/hooks/useQuery', async (orig) => ({ ...(await orig<any>()), useManufacturers: () => ({ data: [{ id: 'm', name: 'Cipla', short_name: 'CIP', is_active: true }] }) }))

import CustomerCompanyReportPage from './CustomerCompanyReportPage'

const CUSTOMER = { id: 'cust-1', code: 'C001', name: 'Delta Medical' }
const REPORT = {
  title: 'Customer vs Company', customer: CUSTOMER, filters: { from: '2026-05-01', to: '2026-05-31', customer_id: 'cust-1' },
  rows: [
    { company: 'Cipla', sales: 1685, discount: 100, sales_return: 400, sales_return_expiry: 100, net: 1085 },
    { company: 'Sun', sales: 600, discount: 30, sales_return: 1000, sales_return_expiry: 0, net: -430 },
  ],
  totals: { sales: 2285, discount: 130, sales_return: 1400, sales_return_expiry: 100, net: 655 },
  ledger: { opening_balance: 0, receipts: 0, closing_balance: 0 },
}
const DETAIL = (over: any = {}) => ({
  title: 'x', customer: CUSTOMER, company: 'Cipla',
  filters: { from: '2026-05-01', to: '2026-05-31', customer_id: 'cust-1', company: 'Cipla', discount_excluded: true },
  rows: [
    { product_id: 'p1', product: 'Paracetamol', m_code: 'M001', sales_qty: 14, sales_amt: 1400, free_qty: 2, free_value: 200, return_qty: 4, return_amt: 400, total_qty: 12, total_amt: 1000 },
    { product_id: 'p2', product: 'Sunzol', m_code: 'M003', sales_qty: 3, sales_amt: 600, free_qty: 0, free_value: 0, return_qty: 5, return_amt: 1000, total_qty: -2, total_amt: -400 },
  ],
  totals: { sales_qty: 17, sales_amt: 2000, free_qty: 2, free_value: 200, return_qty: 9, return_amt: 1400, total_qty: 10, total_amt: 600 },
  ...over,
})

async function loadReport() {
  render(<MemoryRouter><CustomerCompanyReportPage /></MemoryRouter>)
  fireEvent.focus(screen.getByLabelText('Customer'))
  fireEvent.mouseDown(await screen.findByText('Delta Medical'))                    // pick the customer → report loads
  await screen.findByText('Cipla')
}
const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

beforeEach(() => {
  Object.values(api).forEach((f: any) => f.mockReset()); navigate.mockReset()
  api.customers.mockResolvedValue({ data: { data: [CUSTOMER] } })
  api.get.mockResolvedValue({ data: { data: REPORT } })
  api.products.mockResolvedValue({ data: { data: DETAIL() } })
})

describe('double-click drill-down', () => {
  it('single click only selects the row — nothing opens, nothing is requested', async () => {
    await loadReport(); fireEvent.click(row('Cipla'))
    expect(row('Cipla').className).toContain('sel')
    expect(screen.queryByRole('dialog')).toBeNull(); expect(api.products).not.toHaveBeenCalled()
  })

  it('double-clicking a company row opens the detail window for THAT company with the report\'s customer and dates', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    const dlg = await screen.findByRole('dialog')
    expect(api.products).toHaveBeenCalledTimes(1)
    expect(api.products.mock.calls[0][0]).toEqual({ customer_id: 'cust-1', company: 'Cipla', from: '2026-05-01', to: '2026-05-31', discount_excluded: true })
    // header: customer, company (with its short code), dates
    expect(within(dlg).getByText('C001 — Delta Medical')).toBeInTheDocument()
    expect(within(dlg).getByText('Cipla', { selector: 'b' })).toBeInTheDocument(); expect(within(dlg).getByText('(CIP)')).toBeInTheDocument()
  })

  it('a different row opens a different company', async () => {
    await loadReport(); fireEvent.doubleClick(row('Sun'))
    await screen.findByRole('dialog'); expect(api.products.mock.calls[0][0]).toMatchObject({ company: 'Sun' })
  })

  it('shows all 12 columns, every product row, and the bottom totals', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    const dlg = await screen.findByRole('dialog')
    for (const h of ['S.Code', 'Company', 'M.Code', 'Product', 'Sales Qty', 'Sales Amt', 'F Qty', 'F. Value', 'Retu. Qty', 'Return Amt', 'Tot Qty', 'Tot Amt'])
      expect(within(dlg).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const body = within(dlg).getAllByRole('row').filter(r => within(r).queryAllByRole('cell').length === 12)
    expect(body).toHaveLength(2)
    expect(within(body[0]).getByText('Paracetamol')).toBeInTheDocument(); expect(within(body[0]).getByText('M001')).toBeInTheDocument()
    expect(within(body[0]).getByText('1,400.00')).toBeInTheDocument(); expect(within(body[0]).getByText('200.00')).toBeInTheDocument()
    const foot = dlg.querySelector('tfoot tr') as HTMLElement
    expect(foot.textContent).toContain('Total (2 products)'); expect(foot.textContent).toContain('2,000.00'); expect(foot.textContent).toContain('1,400.00'); expect(foot.textContent).toContain('600.00')
  })

  it('negative quantities / amounts are preserved and flagged', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    const sunRow = (await screen.findByText('Sunzol')).closest('tr') as HTMLElement
    expect(sunRow.textContent).toContain('-2'); expect(sunRow.textContent).toContain('-400.00')
    expect(sunRow.querySelectorAll('.ccp-neg').length).toBeGreaterThan(0)
  })

  it('shows a loading state, then the data', async () => {
    let resolve!: (v: any) => void; api.products.mockReturnValue(new Promise(r => { resolve = r }))
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    expect(await screen.findByText(/Loading product-wise report/)).toBeInTheDocument()
    resolve({ data: { data: DETAIL() } }); expect(await screen.findByText('Paracetamol')).toBeInTheDocument()
    expect(screen.queryByText(/Loading product-wise report/)).toBeNull()
  })

  it('shows the server error with a working Retry', async () => {
    api.products.mockRejectedValueOnce({ response: { data: { message: 'Customer not found' } } })
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    expect(await screen.findByText(/Customer not found/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Paracetamol')).toBeInTheDocument(); expect(api.products).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state when the company has no product transactions', async () => {
    api.products.mockResolvedValue({ data: { data: DETAIL({ rows: [], totals: { sales_qty: 0, sales_amt: 0, free_qty: 0, free_value: 0, return_qty: 0, return_amt: 0, total_qty: 0, total_amt: 0 } }) } })
    await loadReport(); fireEvent.doubleClick(row('Cipla'))
    expect(await screen.findByText(/No product transactions/)).toBeInTheDocument()
  })

  it('Discount Excluded toggle re-requests with discount_excluded=false', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla')); await screen.findByText('Paracetamol')
    const box = screen.getByLabelText(/Discount Excluded/) as HTMLInputElement; expect(box.checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() => expect(api.products).toHaveBeenCalledTimes(2))
    expect(api.products.mock.calls[1][0]).toMatchObject({ company: 'Cipla', customer_id: 'cust-1', discount_excluded: false })
  })

  it('does not offer Division / Groupwise (the data model has neither)', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla')); await screen.findByRole('dialog')
    expect(screen.queryByText(/division|groupwise/i)).toBeNull()
  })
})

describe('closing returns to the untouched report', () => {
  it('Close button: the window goes away; customer, dates, rows and selection are unchanged; no extra report request', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla')); await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((screen.getByLabelText('Customer') as HTMLInputElement).value).toBe('C001 — Delta Medical')
    expect(row('Cipla').className).toContain('sel'); expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('Esc closes only the detail window — it does NOT exit the report page', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla')); await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(navigate).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })                       // with nothing open, Esc still exits as before
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('can be re-opened for another company after closing', async () => {
    await loadReport(); fireEvent.doubleClick(row('Cipla')); await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.doubleClick(row('Sun')); await screen.findByRole('dialog')
    expect(api.products.mock.calls.at(-1)![0]).toMatchObject({ company: 'Sun' })
  })
})

describe('only company rows are interactive', () => {
  it('double-clicking the header, the Total footer or an empty state opens nothing', async () => {
    await loadReport()
    fireEvent.doubleClick(screen.getByRole('columnheader', { name: 'Company' }))
    fireEvent.doubleClick(screen.getByText('Total')); fireEvent.doubleClick(screen.getByText(/Sales are shown before discount/))
    expect(screen.queryByRole('dialog')).toBeNull(); expect(api.products).not.toHaveBeenCalled()
  })
  it('before a customer is chosen there are no company rows to double-click', () => {
    render(<MemoryRouter><CustomerCompanyReportPage /></MemoryRouter>)
    fireEvent.doubleClick(screen.getByText(/Select a customer to see the companies/)); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('Enter on a focused company row opens it (keyboard access)', async () => {
    await loadReport(); fireEvent.keyDown(row('Cipla'), { key: 'Enter' })
    await screen.findByRole('dialog'); expect(api.products.mock.calls[0][0]).toMatchObject({ company: 'Cipla' })
  })
})

describe('the existing report is unchanged', () => {
  it('still shows the original columns, rows and totals', async () => {
    await loadReport()
    for (const h of ['Company', 'Sales', 'Discount', 'Sales Return', 'Sales Return Expiry', 'Net']) expect(screen.getAllByRole('columnheader', { name: h }).length).toBeGreaterThan(0)
    expect(screen.getByText('1,685.00')).toBeInTheDocument(); expect(screen.getByText('-430.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Report/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Print/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Exit/ })).toBeInTheDocument()
  })
})
