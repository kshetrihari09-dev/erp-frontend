/**
 * Products page → "New Product" form: Manufacturer is required and must be an active, registered manufacturer.
 * Editing an existing product keeps the original (optional) behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { createMut, updateMut, PRODUCTS, MANUFACTURERS } = vi.hoisted(() => ({
  createMut: vi.fn(), updateMut: vi.fn(),
  PRODUCTS: [{ id: 'p-legacy', name: 'Legacy Product', unit: 'Strip', mrp: 10, sales_rate: 10, purchase_rate: 5, min_stock: 5, company_name: '', is_active: true, total_stock: 0 }],
  MANUFACTURERS: [{ id: 'm1', name: 'Cipla', is_active: true }, { id: 'm2', name: 'Old Labs', is_active: false }],
}))

vi.mock('@/hooks/useQuery', async (orig) => {
  const q = (data: any) => () => ({ data, isLoading: false, isFetching: false, isError: false })
  const mut = (fn: any) => () => ({ mutateAsync: fn, mutate: fn, isPending: false })
  return {
    ...(await orig<any>()),
    useProducts: q({ data: PRODUCTS, meta: { total: 1, page: 1, limit: 50 }, pagination: { total: 1, page: 1, limit: 50 } }),
    useCreateProduct: mut((d: any) => createMut(d)), useUpdateProduct: mut((a: any) => updateMut(a)), useDeleteProduct: mut(vi.fn()),
    useProductOpeningBatches: q([]), useAddOpeningInventory: mut(vi.fn()), useNextBarcode: q({ barcode: '' }), useSuppliers: q([]),
    useManufacturers: q(MANUFACTURERS),
  }
})
// Stand-in picker driving the real onChange contract.
vi.mock('@/components/forms/ManufacturerSelect', () => ({
  default: ({ onChange, value }: any) => (
    <div><span data-testid="mfg-value">{value}</span>
      <button type="button" onClick={() => onChange('Cipla', { id: 'm1', name: 'Cipla', is_active: true })}>pick-valid</button>
      <button type="button" onClick={() => onChange('Old Labs', { id: 'm2', name: 'Old Labs', is_active: false })}>pick-inactive</button>
      <button type="button" onClick={() => onChange('Ghost Pharma')}>pick-unknown</button></div>),
}))

import ProductsPage from './ProductsPage'
import useAuthStore from '@/store/authStore'

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
    <MemoryRouter><ProductsPage /></MemoryRouter>
  </QueryClientProvider>)

const openNew = () => { fireEvent.click(screen.getAllByRole('button', { name: /new product/i })[0]); return screen.getByRole('dialog', { hidden: true }) }
const fill = (dlg: HTMLElement) => {
  fireEvent.change(dlg.querySelector('input[name="name"]')!, { target: { value: 'Paracetamol' } })
  fireEvent.change(dlg.querySelector('input[name="sales_rate"]')!, { target: { value: '25' } })
}
const submit = (dlg: HTMLElement) => fireEvent.click(within(dlg).getByRole('button', { name: /create product/i }))

beforeEach(() => {
  createMut.mockReset(); updateMut.mockReset()
  createMut.mockResolvedValue({ id: 'new' }); updateMut.mockResolvedValue({})
  useAuthStore.setState({ isAuthenticated: true, token: 't', company: { id: 'c' } as any, user: { id: 'u', role: 'owner', permissions: ['products.view', 'products.create', 'products.edit', 'products.delete'] } as any })
})

describe('New Product form — Manufacturer', () => {
  it('is marked required', () => {
    renderPage(); const dlg = openNew()
    expect(within(dlg).getByText(/^Manufacturer/).textContent).toContain('*')
  })
  it('blocks submit with no manufacturer and shows the message under the field', async () => {
    renderPage(); const dlg = openNew(); fill(dlg); submit(dlg)
    expect(await within(dlg).findByText('Manufacturer is required')).toBeInTheDocument()
    expect(createMut).not.toHaveBeenCalled()
  })
  it('blocks an unregistered manufacturer', async () => {
    renderPage(); const dlg = openNew(); fill(dlg); fireEvent.click(within(dlg).getByText('pick-unknown')); submit(dlg)
    expect(await within(dlg).findByText(/not a registered manufacturer/)).toBeInTheDocument()
    expect(createMut).not.toHaveBeenCalled()
  })
  it('blocks an inactive manufacturer', async () => {
    renderPage(); const dlg = openNew(); fill(dlg); fireEvent.click(within(dlg).getByText('pick-inactive')); submit(dlg)
    expect(await within(dlg).findByText(/is inactive/)).toBeInTheDocument()
    expect(createMut).not.toHaveBeenCalled()
  })
  it('creates the product when a valid manufacturer is chosen', async () => {
    renderPage(); const dlg = openNew(); fill(dlg); fireEvent.click(within(dlg).getByText('pick-valid')); submit(dlg)
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1))
    expect(createMut.mock.calls[0][0]).toMatchObject({ name: 'Paracetamol', company_name: 'Cipla', sales_rate: 25 })
  })
})

describe('Edit Product is unchanged', () => {
  it('a legacy product with a blank manufacturer can still be saved', async () => {
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    const dlg = screen.getByRole('dialog', { hidden: true })
    expect(within(dlg).getByText(/^Manufacturer/).textContent).not.toContain('*')
    fireEvent.click(within(dlg).getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1))
  })
})
