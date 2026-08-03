import { useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Package, ScanLine, Type, Boxes, Download, Upload, Printer } from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useProductOpeningBatches, useAddOpeningInventory } from '@/hooks/useQuery'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, SearchInput, ConfirmDialog } from '@/components/ui'
import ManufacturerSelect from '@/components/forms/ManufacturerSelect'
import ExportProductsModal from './ExportProductsModal'
import ImportProductsModal from './ImportProductsModal'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt } from '@/utils'
import { PRODUCT_UNITS } from '@/constants'
import { parseProductOcr } from '@/utils/parseProductOcr'
import { productSchema, PRODUCT_VAT_OPTIONS, type ProductFormInput } from '@/services/productCreation'
import type { Product, OpeningInventoryBatch } from '@/types'
import type { CaptureMode } from '@/hooks/scanner/useProductCapture'

const ProductScanModal = lazy(() => import('@/components/scanner/ProductScanModal'))

// Product Add and Quick Add (components/forms/QuickAddModal.tsx) both
// validate against the same shared `productSchema` — see services/productCreation.ts.
// This keeps the two flows' required fields, defaults, and accepted
// values identical instead of duplicating the rules here.
type Form = ProductFormInput

function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

// ── Opening Inventory — Edit Product ────────────────────────────────────────
// Shown only when editing an existing product. Every prior opening entry
// (Batch A, Batch B, ...) is listed as its own separate, read-only line —
// never merged, replaced, or deleted here. "Add Opening Inventory" reveals
// a new row with its own Opening Stock / Batch / Expiry / Purchase Rate
// fields; saving that row calls POST /products/:id/adjust directly (via
// useAddOpeningInventory), which always INSERTs a brand-new batch + a new
// inventory movement — it never updates the rows shown above. This is
// completely independent of the main "Save Changes" button below, which
// still only edits the product's own fields (name, rates, etc.) and never
// touches stock, exactly as before.
function OpeningInventorySection({ productId }: { productId: string }) {
  const { data: batches, isLoading } = useProductOpeningBatches(productId)
  const addOpening = useAddOpeningInventory()
  const [showAddRow, setShowAddRow] = useState(false)
  const [row, setRow] = useState({ qty: '', batch_no: '', expiry: '', purchase_rate: '' })
  const [rowError, setRowError] = useState<string | null>(null)

  const saveRow = async () => {
    const qty = Number(row.qty)
    if (!row.qty || isNaN(qty) || qty <= 0) {
      setRowError('Opening Stock must be greater than 0')
      return
    }
    setRowError(null)
    await addOpening.mutateAsync({
      productId,
      qty,
      batch_no:      row.batch_no.trim()  || undefined,
      expiry:        row.expiry.trim()    || undefined,
      purchase_rate: row.purchase_rate !== '' ? Number(row.purchase_rate) : undefined,
    })
    setRow({ qty: '', batch_no: '', expiry: '', purchase_rate: '' })
    setShowAddRow(false)
  }

  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-3)]">
          <Boxes size={13} className="text-brand" />
          Opening Inventory
        </div>
        {!showAddRow && (
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:opacity-80 transition-opacity"
          >
            <Plus size={13} /> Add Opening Inventory
          </button>
        )}
      </div>

      {/* Existing entries — each its own line, exactly as originally saved */}
      {isLoading ? (
        <div className="text-xs text-[var(--text-4)]">Loading…</div>
      ) : batches?.length ? (
        <div className="space-y-1.5 mb-3">
          {batches.map((b: OpeningInventoryBatch) => (
            <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs px-3 py-2 rounded-lg bg-[var(--surface-3)]">
              <span className="font-semibold min-w-[70px]">{b.batch_no || '—'}</span>
              <span className="text-[var(--text-3)]">
                Qty {b.qty_received}
                {Number(b.qty_remaining) !== Number(b.qty_received) && ` (${b.qty_remaining} left)`}
              </span>
              <span className="text-[var(--text-3)]">Exp {b.expiry || '—'}</span>
              <span className="text-[var(--text-3)]">Rate {fmt(b.unit_cost)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-[var(--text-4)] mb-3">No opening inventory recorded yet.</div>
      )}

      {/* New row — creates a new batch on save, never edits the lines above */}
      {showAddRow && (
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="form-grid col3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Opening Stock</label>
              <input
                type="number" min="0" step="1" placeholder="0" className="erp-input"
                value={row.qty}
                onChange={e => setRow(r => ({ ...r, qty: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Batch Number</label>
              <input
                placeholder="B002" className="erp-input"
                value={row.batch_no}
                onChange={e => setRow(r => ({ ...r, batch_no: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Expiry (MM/YY)</label>
              <input
                placeholder="06/28" className="erp-input"
                value={row.expiry}
                onChange={e => setRow(r => ({ ...r, expiry: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Purchase Rate</label>
              <input
                type="number" step="0.01" placeholder="0.00" className="erp-input"
                value={row.purchase_rate}
                onChange={e => setRow(r => ({ ...r, purchase_rate: e.target.value }))}
              />
            </div>
          </div>
          {rowError && <p className="text-xs text-red-500 mt-2">{rowError}</p>}
          <div className="flex gap-2 mt-3">
            <Button variant="primary" size="sm" loading={addOpening.isPending} onClick={saveRow}>
              Save Opening Inventory
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowAddRow(false); setRowError(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Defined at module scope — NOT inside ProductForm — so its identity is
// stable across renders. A component defined inside another component's
// render body gets a brand-new function reference every render; React
// then treats every <Field/> as a different component type than last
// render and fully unmounts + remounts the underlying <input>, which is
// exactly what drops focus (and closes the on-screen keyboard on mobile)
// after the very first keystroke — ProductForm re-renders on every
// keystroke because of the `watch(...)` call further down, so this was
// firing on every single character typed in ANY field, not just once.
// `register` and `errors` are threaded through as explicit props instead
// of being closed over, since that closure is exactly what made the old
// version need to be redefined per-render in the first place.
function Field({ label, name, type = 'text', register, errors, ...rest }: {
  label: string
  name: keyof Form
  type?: string
  register: UseFormRegister<Form>
  errors: FieldErrors<Form>
  [key: string]: any
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">{label}</label>
      <input type={type} className="erp-input" {...register(name)} {...rest} />
      {errors[name] && <p className="text-xs text-red-500 mt-1">{(errors as any)[name]?.message}</p>}
    </div>
  )
}

function ProductForm({ initial, onClose }: { initial?: Product | null; onClose: () => void }) {
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting, dirtyFields } } = useForm<Form>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ? {
      name: initial.name, generic_name: initial.generic_name || '', company_name: initial.company_name || '',
      category: initial.category || '', barcode: initial.barcode || '', unit: initial.unit, mrp: initial.mrp,
      sales_rate: initial.sales_rate, purchase_rate: initial.purchase_rate,
      // GET /products and GET /products/:id return VAT under the raw
      // `tax_rate` column name; only GET /products/search aliases it to
      // vat_percent. Fall back through both so Edit shows the real saved value.
      vat_percent: (initial as any).tax_rate ?? initial.vat_percent ?? 13,
      // Same story for C.C% — the real column is `cc_percent`; only
      // GET /products/search aliases it to `cc_pct`.
      cc_percent: (initial as any).cc_percent ?? (initial as any).cc_pct ?? 0,
      min_stock: initial.min_stock,
    } : {
      // Same defaults Quick Add has always used, so a product created
      // without touching these fields is identical either way.
      unit: 'Strip', vat_percent: 13, cc_percent: 0, min_stock: 50, mrp: 0, sales_rate: '' as any, purchase_rate: 0,
      barcode: '', opening_stock: '' as any, opening_batch: '', opening_expiry: '',
    },
  })

  const [scanOpen, setScanOpen]   = useState(false)
  const [scanMode, setScanMode]   = useState<CaptureMode>('barcode')
  const [scanBanner, setScanBanner] = useState<string | null>(null)

  const openScan = (mode: CaptureMode) => { setScanMode(mode); setScanOpen(true) }

  const handleBarcodeScanned = (code: string) => {
    setValue('barcode', code, { shouldDirty: true, shouldValidate: true })
    setScanBanner('Barcode filled from scan — please verify.')
    setScanOpen(false)
  }

  const handleLabelScanned = (text: string) => {
    const parsed = parseProductOcr(text)
    const filled: string[] = []
    if (parsed.name)          { setValue('name', parsed.name, { shouldDirty: true, shouldValidate: true }); filled.push('Product Name') }
    if (parsed.generic_name)  { setValue('generic_name', parsed.generic_name, { shouldDirty: true }); filled.push('Generic Name') }
    if (parsed.company_name)  { setValue('company_name', parsed.company_name, { shouldDirty: true }); filled.push('Company / Brand') }
    if (parsed.mrp != null)   { setValue('mrp', parsed.mrp, { shouldDirty: true }); filled.push('MRP') }

    setScanBanner(filled.length
      ? `Filled from scan: ${filled.join(', ')} — please review before saving.`
      : "Couldn't confidently extract any fields from that scan — please enter details manually.")
    setScanOpen(false)
  }

  const onSubmit = handleSubmit(async (data) => {
    if (initial) {
      // Editing never touches opening stock — that's a "new product" concept.
      const { opening_stock, opening_batch, opening_expiry, ...editable } = data as any
      await update.mutateAsync({ id: initial.id, data: editable })
    } else {
      await create.mutateAsync(data)
    }
    onClose()
  })


  return (
    <>
      {hasCameraSupport() && (
        <div className="flex items-center justify-between mb-4 -mt-1">
          <button
            type="button"
            onClick={() => openScan('label')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
            style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
          >
            <Type size={13} /> Scan Product Label
          </button>
        </div>
      )}

      {scanBanner && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-start justify-between gap-2">
          <span>{scanBanner}</span>
          <button type="button" onClick={() => setScanBanner(null)} className="text-amber-500 hover:text-amber-700 leading-none">✕</button>
        </div>
      )}

      <div className="form-grid">
        <div className="span2"><Field label="Product Name *" name="name" register={register} errors={errors} /></div>
        <Field label="Generic Name" name="generic_name" register={register} errors={errors} />
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Manufacturer</label>
          <ManufacturerSelect
            value={watch('company_name') || ''}
            onChange={(name, manufacturer) => {
              setValue('company_name', name, { shouldDirty: true, shouldValidate: true })
              // Pre-fill C.C% from the manufacturer's default — only for a
              // brand-new product, and only if the user hasn't already
              // typed their own value into that field. Never touches an
              // existing product being edited, and never overwrites a
              // value the user set themselves.
              if (!initial && !dirtyFields.cc_percent && manufacturer?.cc_pct != null) {
                setValue('cc_percent', manufacturer.cc_pct, { shouldDirty: false })
              }
              // Return focus to the Product form — the next field in tab
              // order — once a manufacturer is picked/created, same as
              // the (+) flows on Sale/Purchase moving on to Quantity.
              requestAnimationFrame(() => {
                document.querySelector<HTMLInputElement>('input[name="category"]')?.focus()
              })
            }}
          />
        </div>
        <Field label="Category" name="category" register={register} errors={errors} />
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Barcode</label>
          <div className="flex gap-1.5">
            <input type="text" className="erp-input" placeholder="Scan or type barcode" {...register('barcode')} />
            {hasCameraSupport() && (
              <button
                type="button"
                onClick={() => openScan('barcode')}
                aria-label="Scan barcode"
                className="shrink-0 w-9 h-9 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-3)] transition-colors"
              >
                <ScanLine size={16} />
              </button>
            )}
          </div>
          {errors.barcode && <p className="text-xs text-red-500 mt-1">{errors.barcode.message}</p>}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Unit</label>
          <select className="erp-input" {...register('unit')}>
            {PRODUCT_UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <Field label="MRP" name="mrp" type="number" step="0.01" register={register} errors={errors} />
        <Field label="Sale Rate" name="sales_rate" type="number" step="0.01" register={register} errors={errors} />
        <Field label="Purchase Rate" name="purchase_rate" type="number" step="0.01" register={register} errors={errors} />
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">VAT %</label>
          <select className="erp-input" {...register('vat_percent')}>
            {PRODUCT_VAT_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            C.C % <span className="normal-case font-medium text-[var(--text-4)]">(optional)</span>
          </label>
          <input
            type="number" min={0} max={100} step="0.01" placeholder="0"
            className="erp-input"
            {...register('cc_percent')}
          />
          {errors.cc_percent && <p className="text-xs text-red-500 mt-1">{(errors as any).cc_percent?.message}</p>}
        </div>
        <Field label="Min Stock" name="min_stock" type="number" register={register} errors={errors} />
      </div>

      {/* ── Opening Inventory ──────────────────────────────────────────────
          Creating a new product: same single opening-stock fields as
          before (0/empty means no batch, no transaction) — unchanged.
          Editing an existing product: existing opening batches are shown
          as separate, unchangeable lines, with an "Add Opening Inventory"
          action that only ever creates a new batch — never updates,
          merges, or deletes a prior one. */}
      {!initial ? (
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5 mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-3)]">
            <Boxes size={13} className="text-brand" />
            Opening Inventory <span className="normal-case font-medium text-[var(--text-4)]">(optional)</span>
          </div>
          <div className="form-grid col3">
            <Field label="Opening Stock" name="opening_stock" type="number" min="0" step="1" placeholder="0" register={register} errors={errors} />
            <Field label="Opening Batch" name="opening_batch" placeholder="B001" register={register} errors={errors} />
            <Field label="Opening Expiry (MM/YY)" name="opening_expiry" placeholder="06/27" register={register} errors={errors} />
          </div>
        </div>
      ) : (
        <OpeningInventorySection productId={initial.id} />
      )}

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>
          {initial ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>

      {scanOpen && (
        <Suspense fallback={null}>
          <ProductScanModal
            open={scanOpen}
            initialMode={scanMode}
            onBarcode={handleBarcodeScanned}
            onOcrText={handleLabelScanned}
            onClose={() => setScanOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const [page, setPage]     = useState(1)
  const [searchRaw, setSearch] = useState('')
  const search = useDebounce(searchRaw, 400)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [delId,   setDelId]   = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const del = useDeleteProduct()

  const { data, isLoading } = useProducts({ page, limit: 20, search: search || undefined })
  const rows  = (data?.data  as Product[]) || []
  const total = (data?.pagination as any)?.total || 0

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Products</h1></div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Upload size={14}/>} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="secondary" icon={<Download size={14}/>} onClick={() => setExportOpen(true)}>
            Export
          </Button>
          <Button variant="secondary" icon={<Printer size={14}/>} onClick={() => navigate('/barcode-print')}>
            Print Barcodes
          </Button>
          <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(null); setModal(true) }}>
            New Product
          </Button>
        </div>
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
                        <td className="td-mono text-brand">
                          {p.item_code}
                          {p.barcode && <div className="text-[10px] text-[var(--text-4)] font-normal mt-0.5">{p.barcode}</div>}
                        </td>
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
                            <Button variant="ghost" size="sm" icon={<Printer size={12}/>}
                              onClick={() => navigate(`/barcode-print?productId=${p.id}`)}>Print</Button>
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
                  <div className="text-right">
                    <span className="prod-mc-code">{p.item_code}</span>
                    {p.barcode && <div className="text-[10px] text-[var(--text-4)] mt-0.5">{p.barcode}</div>}
                  </div>
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
                    <button className="prod-mc-btn" onClick={() => navigate(`/barcode-print?productId=${p.id}`)}>Print</button>
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

      <ExportProductsModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        search={search}
        filteredCount={total}
      />

      <ImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
