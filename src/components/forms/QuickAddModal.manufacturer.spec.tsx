import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const create = vi.fn()
vi.mock('@/services/productCreation', async (orig) => ({ ...(await orig<any>()), createProductWithOpeningStock: (...a: any[]) => create(...a) }))
vi.mock('@/hooks/useQuery', () => ({
  useManufacturers: () => ({ data: [{ id: '1', name: 'Cipla', is_active: true }, { id: '2', name: 'Old Labs', is_active: false }] }),
}))
// Stand-in picker: one button per scenario, driving the real onChange contract.
vi.mock('./ManufacturerSelect', () => ({
  default: ({ onChange }: any) => (
    <div>
      <button onClick={() => onChange('Cipla')}>pick-valid</button>
      <button onClick={() => onChange('Old Labs')}>pick-inactive</button>
      <button onClick={() => onChange('Ghost Pharma')}>pick-unknown</button>
    </div>),
}))

import QuickAddModal from './QuickAddModal'

function open() {
  const onSave = vi.fn()
  render(<QuickAddModal initialName="Paracetamol" onSave={onSave} onClose={() => {}} />)
  const rate = screen.getByText(/Sales Rate/).closest('.qam-field')!.querySelector('input') as HTMLInputElement
  fireEvent.change(rate, { target: { value: '25' } })
  return onSave
}
const save = () => fireEvent.click(screen.getByRole('button', { name: /save/i }))

beforeEach(() => { create.mockReset(); create.mockResolvedValue({ id: 'p1', name: 'Paracetamol' }) })

describe('Quick Add product — manufacturer is required and must be valid', () => {
  it('marks the field required', () => {
    open(); expect(screen.getByText(/Company \/ Manufacturer/).parentElement!.textContent).toContain('*')
  })
  it('blocks saving with no manufacturer and shows why; nothing is sent', async () => {
    open(); save()
    expect(await screen.findByText('Manufacturer is required')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })
  it('blocks an unregistered manufacturer', async () => {
    open(); fireEvent.click(screen.getByText('pick-unknown')); save()
    expect(await screen.findByText(/not a registered manufacturer/)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })
  it('blocks an inactive manufacturer', async () => {
    open(); fireEvent.click(screen.getByText('pick-inactive')); save()
    expect(await screen.findByText(/is inactive/)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })
  it('saves with a valid manufacturer, sending its name as company_name', async () => {
    const onSave = open(); fireEvent.click(screen.getByText('pick-valid')); save()
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Cipla', name: 'Paracetamol' }))
  })
})
