/**
 * Dashboard → Recent sales → click a sale → its REAL invoice in the existing print preview.
 * Real RecentSales, real preview component, real PrintPreviewModal and InvoicePaper; only the data hooks are controlled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = (p: any) => { const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = p; return rest }
  const make = (tag: string) => React.forwardRef((p: any, r: any) => React.createElement(tag, { ...strip(p), ref: r }))
  return { motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }), AnimatePresence: ({ children }: any) => children }
})

const { hooks, navigate, productsList, printSpy, pdfSpy } = vi.hoisted(() => ({
  hooks: { useSales: vi.fn(), useSale: vi.fn() }, navigate: vi.fn(), productsList: vi.fn(), printSpy: vi.fn(), pdfSpy: vi.fn(),
}))
// The existing print engine is spied on (jsdom cannot print) — the preview modal itself is the real one.
vi.mock('@/components/print/usePrint', async (orig) => ({ ...(await orig<any>()), usePrint: () => ({ print: printSpy, downloadPDF: pdfSpy }) }))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<any>()), useNavigate: () => navigate }))
vi.mock('@/hooks/useQuery', async (orig) => ({ ...(await orig<any>()), useSales: hooks.useSales, useSale: hooks.useSale }))
vi.mock('@/services/api', async (orig) => ({ ...(await orig<any>()), productsAPI: { list: productsList } }))

import RecentSales from './RecentSales'
import useAuthStore from '@/store/authStore'
import useTemplateStore from '@/store/templateStore'
import { PATHS } from '@/constants'

const LIST = [
  { id: 's1', invoice_no: 'INV-0001', party_name: 'Delta Medical', date_ad: '2026-05-05', payment_mode: 'credit', status: 'active', net_total: 111 },
  { id: 's2', invoice_no: 'INV-0002', party_name: 'Other Pharma', date_ad: '2026-05-06', payment_mode: 'cash', status: 'active', net_total: 222 },
]
// Full records — deliberately DIFFERENT from the list summary (net_total, customer, items) to prove the list data isn't used.
const DETAIL: Record<string, any> = {
  s1: { id: 's1', invoice_no: 'INV-0001', date_ad: '2026-05-05', payment_mode: 'credit', party_id: 'p1', party_name: 'Delta Medical Stores', party_code: 'C001',
    created_at: '2026-05-05T10:00:00Z', cc_amount: 5, round_off: -0.4, net_total: 1154.6, paid_amount: 154.6, due_amount: 1000,
    items: [{ product_id: 'a', product_name: 'Paracetamol 500', qty: 10, bonus: 2, rate: 100, discount_pct: 10, cc_pct: 0, cc_amount: 0, amount: 900, mrp: 120 },
            { product_id: 'b', product_name: 'Amoxil Caps', qty: 5, bonus: 1, rate: 50, discount_pct: 0, cc_pct: 10, cc_amount: 5, amount: 255 }] },
  s2: { id: 's2', invoice_no: 'INV-0002', date_ad: '2026-05-06', payment_mode: 'cash', party_id: 'p2', party_name: 'Other Pharma Ltd', party_code: 'C002',
    created_at: '2026-05-06T10:00:00Z', cc_amount: 0, round_off: 0, net_total: 480, paid_amount: 480, due_amount: 0,
    items: [{ product_id: 'c', product_name: 'Cetrizine Tabs', qty: 6, bonus: 0, rate: 80, discount_pct: 0, cc_pct: 0, cc_amount: 0, amount: 480, mrp: 90 }] },
}
const COMPANY: any = { id: 'c', name: 'Zerthix Pharma', address: 'Butwal', phone: '071', pan_no: '600', date_system: 'AD', invoice_prefix: 'INV', currency: 'NPR', vat_percent: 0 }

let salesState: any, saleState: (id: string) => any
const setSales = (over: any = {}) => { salesState = { data: { data: LIST, pagination: { total: 20, totalPages: 3 } }, isLoading: false, isError: false, ...over } }
beforeEach(() => {
  navigate.mockReset(); productsList.mockReset(); printSpy.mockReset(); pdfSpy.mockReset(); productsList.mockResolvedValue({ data: { data: [{ id: 'a', unit: 'Strip', mrp: 120 }, { id: 'b', unit: 'Box', mrp: 55 }, { id: 'c', unit: 'Pcs', mrp: 90 }] } })
  setSales(); hooks.useSales.mockImplementation(() => salesState)
  saleState = (id) => ({ data: DETAIL[id], isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false })
  hooks.useSale.mockImplementation((id: string) => saleState(id))
  useAuthStore.getState().setAuth({ token: 't', user: { id: 'u', name: 'O', email: 'o@x.t', role: 'owner', permissions: [] } as any, company: COMPANY })
  useTemplateStore.getState().resetTemplate()
})

const renderIt = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><RecentSales /></MemoryRouter>
  </QueryClientProvider>)
// the table row (md+) and the card (mobile) for an invoice — both exist in the DOM; CSS shows one
const rowFor = (no: string) => screen.getAllByText(no).map(e => e.closest('tr')).find(Boolean) as HTMLElement
const cardFor = (no: string) => screen.getAllByText(no).map(e => e.closest('li button')).find(Boolean) as HTMLElement
const invoiceText = () => document.body.textContent || ''

describe('opens the real invoice', () => {
  it('desktop: clicking a row opens THAT invoice in the print preview, built from the full record', async () => {
    renderIt(); fireEvent.click(rowFor('INV-0001'))
    expect(hooks.useSale).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    const t = invoiceText()
    for (const x of ['INV-0001', 'Delta Medical Stores', 'Paracetamol 500', 'Amoxil Caps']) expect(t).toContain(x)   // detail data, not the list's "Delta Medical"
    expect(t).toContain('1,154.60'); expect(t).toMatch(/Balance Due\s*1,000/)                                      // net total & due from the saved invoice (not the list's 111)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('mobile: clicking a card opens the same invoice', async () => {
    renderIt(); fireEvent.click(cardFor('INV-0002'))
    expect(hooks.useSale).toHaveBeenCalledWith('s2')
    await waitFor(() => expect(invoiceText()).toContain('Cetrizine Tabs'))
    expect(invoiceText()).toContain('Other Pharma Ltd'); expect(navigate).not.toHaveBeenCalled()
  })

  it('different invoices show their own details', async () => {
    renderIt()
    fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Amoxil Caps'))
    expect(invoiceText()).not.toContain('Cetrizine Tabs')
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(invoiceText()).not.toContain('Amoxil Caps'))
    fireEvent.click(rowFor('INV-0002')); await waitFor(() => expect(invoiceText()).toContain('Cetrizine Tabs'))
    expect(invoiceText()).not.toContain('Amoxil Caps')
  })

  it('shows lines with quantities, bonus, rates, discount and the totals block (C.C, round-off, paid, due)', async () => {
    renderIt(); fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    const t = invoiceText()
    expect(t).toMatch(/Subtotal\s*1,250/)                    // gross subtotal
    expect(t).toMatch(/Discount\s*[−-]100/)                  // discount recovered from the saved amounts
    expect(t).toMatch(/CC Charge\s*5/)                       // C.C charge
    expect(t).toMatch(/Paid\s*154\.60/)                      // paid
    expect(t).toMatch(/1,154\.60/)                           // net total
    expect(t).toMatch(/Paracetamol 500.*?10\s*2\s*100/)       // qty, bonus, rate of the first line
    expect(t).toMatch(/credit/i)             // payment mode
    expect(t).toMatch(/-0\.40|0\.40/)        // round-off
  })

  it('keyboard: Enter on a focused row opens it', async () => {
    renderIt(); fireEvent.keyDown(rowFor('INV-0002'), { key: 'Enter' })
    expect(hooks.useSale).toHaveBeenCalledWith('s2')
  })
})

describe('loading and error states', () => {
  it('shows a loading state, and nothing from the list is printed meanwhile', () => {
    saleState = () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn(), isFetching: true })
    renderIt(); fireEvent.click(rowFor('INV-0001'))
    expect(screen.getByRole('status')).toHaveTextContent('Loading invoice')
    expect(screen.queryByText('Paracetamol 500')).toBeNull()
  })
  it('error: shows the server message, Retry refetches, Close and Esc dismiss', () => {
    const refetch = vi.fn()
    saleState = () => ({ data: undefined, isLoading: false, isError: true, error: { response: { data: { message: 'Sale not found' } } }, refetch, isFetching: false })
    renderIt(); fireEvent.click(rowFor('INV-0001'))
    expect(screen.getByRole('alert')).toHaveTextContent('Sale not found')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(refetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]); expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(rowFor('INV-0001')); expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('alert')).toBeNull()
  })
  it('a network error without a message gets a generic one', () => {
    saleState = () => ({ data: undefined, isLoading: false, isError: true, error: {}, refetch: vi.fn(), isFetching: false })
    renderIt(); fireEvent.click(rowFor('INV-0001')); expect(screen.getByRole('alert')).toHaveTextContent('Could not load this invoice')
  })
  it('nothing is fetched until a sale is clicked', () => {
    renderIt(); expect(hooks.useSale).not.toHaveBeenCalled()
  })
})

describe('print system', () => {
  it('uses the existing preview: Print / PDF controls are present and Esc closes it', async () => {
    renderIt(); fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    expect(screen.getAllByRole('button', { name: /print/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /pdf|download/i }).length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByText('Paracetamol 500')).toBeNull())
  })
  it('Print and Download PDF in the preview act on THIS invoice', async () => {
    renderIt(); fireEvent.click(rowFor('INV-0002')); await waitFor(() => expect(invoiceText()).toContain('Cetrizine Tabs'))
    fireEvent.click(screen.getAllByRole('button', { name: /^print/i })[0])
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(printSpy.mock.calls[0][1]).toMatchObject({ voucherNo: 'INV-0002', type: 'SALE', partyName: 'Other Pharma Ltd', amount: 480 })
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }))
    expect(pdfSpy).toHaveBeenCalledTimes(1)
    expect(pdfSpy.mock.calls[0][1]).toBe('INV-0002.pdf')                      // file named after THIS invoice
  })
  it('honours the configured template (company header and layout come from the template store)', async () => {
    useTemplateStore.getState().setTemplate?.({ layout: 'pharma' } as any)
    renderIt(); fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Zerthix Pharma'))
  })
  it('units are looked up from the product master only for layouts that print them', async () => {
    renderIt(); fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    expect(productsList).not.toHaveBeenCalled()                                    // standard layout: no extra request
    fireEvent.keyDown(window, { key: 'Escape' })
    useTemplateStore.getState().setTemplate?.({ layout: 'boxed' } as any)
    fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(productsList).toHaveBeenCalledWith({ limit: 500 }))
  })
  it('re-print counter goes up once per opening, not on re-renders', async () => {
    renderIt()
    fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    expect(JSON.parse(localStorage.getItem('erp_reprint_counts') || '{}')['INV-0001']).toBe(1)
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByText('Paracetamol 500')).toBeNull())
    fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    expect(JSON.parse(localStorage.getItem('erp_reprint_counts') || '{}')['INV-0001']).toBe(2)
  })
})

describe('Dashboard state and navigation are untouched', () => {
  it('View all still navigates to the Sales page', () => {
    renderIt(); fireEvent.click(screen.getByRole('button', { name: /view all/i })); expect(navigate).toHaveBeenCalledWith(PATHS.SALES)
  })
  it('closing returns to the dashboard with search, status filter and page exactly as they were', async () => {
    renderIt()
    fireEvent.change(screen.getByPlaceholderText('Search invoice or customer'), { target: { value: 'delta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Active', pressed: false }))
    await waitFor(() => expect(hooks.useSales).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'delta', status: 'active' })))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    const calls = hooks.useSales.mock.calls.length

    fireEvent.click(rowFor('INV-0001')); await waitFor(() => expect(invoiceText()).toContain('Paracetamol 500'))
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByText('Paracetamol 500')).toBeNull())

    expect((screen.getByPlaceholderText('Search invoice or customer') as HTMLInputElement).value).toBe('delta')
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(hooks.useSales).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, search: 'delta', status: 'active' }))
    expect(navigate).not.toHaveBeenCalled(); expect(calls).toBeGreaterThan(0)
  })
  it('search, status filter and pagination still work with the preview feature present', async () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Returned' }))
    await waitFor(() => expect(hooks.useSales).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'returned' })))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(hooks.useSales).toHaveBeenLastCalledWith(expect.not.objectContaining({ status: expect.anything() })))
  })
  it('empty / error list states are unchanged (no rows to click)', () => {
    setSales({ data: { data: [], pagination: { total: 0, totalPages: 1 } } }); renderIt()
    expect(screen.getByText('No sales yet')).toBeInTheDocument()
  })
})
