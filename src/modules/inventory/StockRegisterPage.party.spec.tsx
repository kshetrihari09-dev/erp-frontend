/** Stock Register: the "Batch Edit Include" checkbox is gone, and the party filter (customers + suppliers) drives the request. */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  stores: vi.fn(), get: vi.fn(), lookup: vi.fn(), parties: vi.fn(), exportCsv: vi.fn(),
}))
const PARTIES = [
  { id: 'c1', code: 'C001', name: 'Alpha Chemist', type: 'customer' },
  { id: 's1', code: 'S001', name: 'Acme Suppliers', type: 'supplier' },
]
const REPORT = (party: any = null) => ({ data: { data: {
  product: { id: 'p1', item_code: 'P001', name: 'Paracetamol 500mg' }, party,
  filters: { from: '2026-01-01', to: '2026-03-31', store: 'all', party_id: party?.id ?? null },
  opening_balance: 0, rows: [], totals: { qty_in: 0, qty_out: 0, qty_free: 0, opening_balance: 0, closing_balance: 0 },
  reconciliation: { applicable: !party, register_closing_all_time: 0, current_stock: 0, matches: true },
} } })

vi.mock('@/services/api', () => ({
  stockRegisterAPI: api,
  productsAPI: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))
vi.mock('@/components/ui/DateRangePopup', () => ({ DateRangeFilter: () => <div data-testid="range" /> }))
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (v: unknown) => v }))
import StockRegisterPage from './StockRegisterPage'

const renderPage = () => render(<MemoryRouter><StockRegisterPage /></MemoryRouter>)
const loadProduct = async () => {
  fireEvent.change(screen.getByPlaceholderText(/^Code/), { target: { value: 'P001' } })
  fireEvent.keyDown(screen.getByPlaceholderText(/^Code/), { key: 'Enter' })
  await waitFor(() => expect(api.get).toHaveBeenCalled())
}
const lastGet = () => api.get.mock.calls[api.get.mock.calls.length - 1][0]

beforeEach(() => {
  vi.clearAllMocks()
  api.stores.mockResolvedValue({ data: { data: [{ id: 'main', name: 'Main Store' }] } })
  api.lookup.mockResolvedValue({ data: { data: { id: 'p1', item_code: 'P001', name: 'Paracetamol 500mg' } } })
  api.parties.mockImplementation(async (params: any = {}) => ({ data: { data: PARTIES.filter(p => (!params.type || p.type === params.type) && (!params.search || p.name.toLowerCase().includes(String(params.search).toLowerCase()))) } }))
  api.get.mockResolvedValue(REPORT())
  api.exportCsv.mockResolvedValue({ data: new Blob(['x']) })
})

describe('Stock Register — batch-edit checkbox removed', () => {
  test('no "Batch Edit Include" checkbox, and no include_adj is ever sent', async () => {
    const { container } = renderPage()
    expect(screen.queryByText(/Batch Edit/i)).toBeNull()
    expect(container.querySelector('.sr-filters input[type="checkbox"]')).toBeNull()
    await loadProduct()
    expect(lastGet()).not.toHaveProperty('include_adj')
    expect(lastGet()).toMatchObject({ product_id: 'p1', store: 'all', party_id: undefined })
  })
})

describe('Stock Register — party filter', () => {
  test('lists customers and suppliers with a type tag', async () => {
    renderPage(); fireEvent.focus(screen.getByLabelText('Party'))
    expect(await screen.findByText('Alpha Chemist')).toBeTruthy(); expect(screen.getByText('Acme Suppliers')).toBeTruthy()
    expect(screen.getByText('Customer')).toBeTruthy(); expect(screen.getByText('Supplier')).toBeTruthy()
  })

  test('the type selector narrows the list (Customers / Suppliers)', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Party type'), { target: { value: 'supplier' } })
    fireEvent.focus(screen.getByLabelText('Party'))
    await screen.findByText('Acme Suppliers')
    expect(api.parties).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'supplier' }))
    expect(screen.queryByText('Alpha Chemist')).toBeNull()
  })

  test('picking a party reloads the register with party_id, shows the explanatory banner; Clear removes the filter', async () => {
    renderPage(); await loadProduct()
    api.get.mockResolvedValue(REPORT(PARTIES[0]))
    fireEvent.focus(screen.getByLabelText('Party'))
    fireEvent.mouseDown(await screen.findByText('Alpha Chemist'))
    await waitFor(() => expect(lastGet()).toMatchObject({ party_id: 'c1' }))
    expect(await screen.findByText(/Showing only this product's movements with/i)).toBeTruthy()
    api.get.mockResolvedValue(REPORT())
    fireEvent.click(screen.getByLabelText('Clear party filter'))
    await waitFor(() => expect(lastGet().party_id).toBeUndefined())
    expect(screen.queryByText(/Showing only this product's movements/i)).toBeNull()
    expect((screen.getByLabelText('Party') as HTMLInputElement).value).toBe('')
  })

  test('switching to the other type drops a selection that no longer fits', async () => {
    renderPage(); await loadProduct()
    fireEvent.focus(screen.getByLabelText('Party')); fireEvent.mouseDown(await screen.findByText('Alpha Chemist'))
    await waitFor(() => expect(lastGet()).toMatchObject({ party_id: 'c1' }))
    fireEvent.change(screen.getByLabelText('Party type'), { target: { value: 'supplier' } })
    await waitFor(() => expect(lastGet().party_id).toBeUndefined())
    expect((screen.getByLabelText('Party') as HTMLInputElement).value).toBe('')
  })

  test('typing edits the search and drops the previous selection', async () => {
    renderPage(); await loadProduct()
    fireEvent.focus(screen.getByLabelText('Party')); fireEvent.mouseDown(await screen.findByText('Alpha Chemist'))
    await waitFor(() => expect(lastGet()).toMatchObject({ party_id: 'c1' }))
    fireEvent.change(screen.getByLabelText('Party'), { target: { value: 'acm' } })
    await waitFor(() => expect(lastGet().party_id).toBeUndefined())
    await waitFor(() => expect(api.parties).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'acm' })))
  })

  test('the CSV export carries the same party filter', async () => {
    renderPage(); await loadProduct()
    api.get.mockResolvedValue(REPORT(PARTIES[1]))
    fireEvent.focus(screen.getByLabelText('Party')); fireEvent.mouseDown(await screen.findByText('Acme Suppliers'))
    await waitFor(() => expect(lastGet()).toMatchObject({ party_id: 's1' }))
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }))
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'p1', party_id: 's1' })))
    expect(api.exportCsv.mock.calls[0][0]).not.toHaveProperty('include_adj')
  })

  test('no live-stock reconciliation warning while a party is selected (it does not apply)', async () => {
    renderPage(); await loadProduct()
    api.get.mockResolvedValue({ data: { data: { ...REPORT(PARTIES[0]).data.data, reconciliation: { applicable: false, register_closing_all_time: null, current_stock: 50, matches: true } } } })
    fireEvent.focus(screen.getByLabelText('Party')); fireEvent.mouseDown(await screen.findByText('Alpha Chemist'))
    await screen.findByText(/Showing only/i)
    expect(screen.queryByText(/live stock/i)).toBeNull()
  })
})
