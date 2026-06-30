import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Package } from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useQuery'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, SearchInput, ConfirmDialog } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt } from '@/utils'
import { PRODUCT_UNITS } from '@/constants'
import type { Product } from '@/types'

const schema = z.object({
  name:          z.string().min(1, 'Required'),
  generic_name:  z.string().optional(),
  company_name:  z.string().optional(),
  category:      z.string().optional(),
  unit:          z.string().default('PCS'),
  mrp:           z.coerce.number().min(0),
  sales_rate:    z.coerce.number().min(0),
  purchase_rate: z.coerce.number().min(0),
  vat_percent:   z.coerce.number().default(13),
  min_stock:     z.coerce.number().default(0),
})
type Form = z.infer<typeof schema>

function ProductForm({ initial, onClose }: { initial?: Product | null; onClose: () => void }) {
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: initial ? {
      name: initial.name, generic_name: initial.generic_name || '', company_name: initial.company_name || '',
      category: initial.category || '', unit: initial.unit, mrp: initial.mrp,
      sales_rate: initial.sales_rate, purchase_rate: initial.purchase_rate,
      vat_percent: initial.vat_percent, min_stock: initial.min_stock,
    } : { unit: 'PCS', vat_percent: 13, min_stock: 0, mrp: 0, sales_rate: 0, purchase_rate: 0 },
  })

  const onSubmit = handleSubmit(async (data) => {
    if (initial) await update.mutateAsync({ id: initial.id, data })
    else         await create.mutateAsync(data)
    onClose()
  })

  const Field = ({ label, name, type = 'text', ...rest }: any) => (
    <div>
      <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">{label}</label>
      <input type={type} className="erp-input" {...register(name)} {...rest} />
      {errors[name as keyof Form] && <p className="text-xs text-red-500 mt-1">{(errors as any)[name]?.message}</p>}
    </div>
  )

  return (
    <>
      <div className="form-grid">
        <div className="span2"><Field label="Product Name *" name="name" /></div>
        <Field label="Generic Name" name="generic_name" />
        <Field label="Company / Brand" name="company_name" />
        <Field label="Category" name="category" />
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Unit</label>
          <select className="erp-input" {...register('unit')}>
            {PRODUCT_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <Field label="MRP" name="mrp" type="number" step="0.01" />
        <Field label="Sale Rate" name="sales_rate" type="number" step="0.01" />
        <Field label="Purchase Rate" name="purchase_rate" type="number" step="0.01" />
        <Field label="VAT %" name="vat_percent" type="number" />
        <Field label="Min Stock" name="min_stock" type="number" />
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>
          {initial ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </>
  )
}

export default function ProductsPage() {
  const [page, setPage]     = useState(1)
  const [searchRaw, setSearch] = useState('')
  const search = useDebounce(searchRaw, 400)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [delId,   setDelId]   = useState<string | null>(null)
  const del = useDeleteProduct()

  const { data, isLoading } = useProducts({ page, limit: 20, search: search || undefined })
  const rows  = (data?.data  as Product[]) || []
  const total = (data?.pagination as any)?.total || 0

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Products</h1></div>
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(null); setModal(true) }}>
          New Product
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={searchRaw} onChange={setSearch} className="prod-search-input" />
      </div>

      <div className="table-card">
        {/* Desktop table */}
        <div className="overflow-x-auto prod-desktop-table">
          <table className="erp-table">
            <thead>
              <tr><th>Code</th><th>Product</th><th>Generic</th><th>Unit</th>
                <th className="td-right">MRP</th><th className="td-right">Sale Rate</th>
                <th className="td-right">Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={9} />
                : rows.length
                  ? rows.map(p => (
                      <tr key={p.id}>
                        <td className="td-mono text-brand">{p.item_code}</td>
                        <td>
                          <div className="font-semibold text-sm">{p.name}</div>
                          {p.company_name && <div className="text-xs text-[var(--text-4)]">{p.company_name}</div>}
                        </td>
                        <td className="text-[var(--text-3)]">{p.generic_name || '—'}</td>
                        <td><span className="badge badge-muted">{p.unit}</span></td>
                        <td className="td-right">{fmt(p.mrp)}</td>
                        <td className="td-right">{fmt(p.sales_rate)}</td>
                        <td className={`td-right font-semibold ${p.current_stock < p.min_stock ? 'text-red-600' : ''}`}>
                          {p.current_stock}
                          {p.current_stock < p.min_stock && <span className="ml-1 text-[10px]">⚠</span>}
                        </td>
                        <td>
                          {p.is_active
                            ? <span className="badge badge-green">Active</span>
                            : <span className="badge badge-red">Inactive</span>
                          }
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setModal(true) }}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => setDelId(p.id)}>Del</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={9}><Empty message="No products found" icon={<Package size={32}/>}/></td></tr>
              }
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="prod-mobile-list">
          {isLoading ? (
            <div className="prod-mobile-skel-wrap">
              {[1,2,3,4,5].map(i => <div key={i} className="prod-mobile-card prod-mobile-card-skel" />)}
            </div>
          ) : rows.length === 0 ? (
            <Empty message="No products found" icon={<Package size={32}/>}/>
          ) : (
            rows.map(p => (
              <div key={p.id} className="prod-mobile-card">
                {/* Top: name + code */}
                <div className="prod-mc-top">
                  <div className="prod-mc-name-wrap">
                    <p className="prod-mc-name">{p.name}</p>
                    {p.company_name && <p className="prod-mc-company">{p.company_name}</p>}
                  </div>
                  <span className="prod-mc-code">{p.item_code}</span>
                </div>

                {/* Generic name */}
                {p.generic_name && (
                  <div className="prod-mc-generic">{p.generic_name}</div>
                )}

                {/* Rates row */}
                <div className="prod-mc-rates">
                  <div className="prod-mc-rate-item">
                    <span className="prod-mc-rate-label">MRP</span>
                    <span className="prod-mc-rate-value">{fmt(p.mrp)}</span>
                  </div>
                  <div className="prod-mc-rate-item">
                    <span className="prod-mc-rate-label">Sale Rate</span>
                    <span className="prod-mc-rate-value">{fmt(p.sales_rate)}</span>
                  </div>
                  <div className="prod-mc-rate-item">
                    <span className="prod-mc-rate-label">Stock</span>
                    <span className={`prod-mc-rate-value ${p.current_stock < p.min_stock ? 'prod-mc-stock-low' : ''}`}>
                      {p.current_stock}
                      {p.current_stock < p.min_stock && <span style={{ marginLeft: 3 }}>⚠</span>}
                    </span>
                  </div>
                </div>

                {/* Chips + actions */}
                <div className="prod-mc-footer">
                  <div className="prod-mc-chips">
                    <span className="badge badge-muted">{p.unit}</span>
                    {p.is_active
                      ? <span className="badge badge-green">Active</span>
                      : <span className="badge badge-red">Inactive</span>
                    }
                  </div>
                  <div className="prod-mc-actions">
                    <button className="prod-mc-btn" onClick={() => { setEditing(p); setModal(true) }}>Edit</button>
                    <button className="prod-mc-btn prod-mc-btn-danger" onClick={() => setDelId(p.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null) }}
        title={editing ? 'Edit Product' : 'New Product'} size="lg">
        <ProductForm initial={editing} onClose={() => { setModal(false); setEditing(null) }} />
      </Modal>

      <ConfirmDialog
        open={!!delId} onClose={() => setDelId(null)}
        onConfirm={() => del.mutate(delId!)}
        title="Delete Product" message="This will permanently delete the product. Continue?"
        danger
      />
    </div>
  )
}
