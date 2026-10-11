import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Package, ScanLine, Boxes, Download, Upload, Printer, QrCode, Filter, Pencil, Trash2 } from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useProductOpeningBatches, useAddOpeningInventory, useNextBarcode, useSuppliers } from '@/hooks/useQuery'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, SearchInput, ConfirmDialog, Select, ToggleSwitch } from '@/components/ui'
import ManufacturerSelect from '@/components/forms/ManufacturerSelect'
import ExportProductsModal from './ExportProductsModal'
import ImportProductsModal from './ImportProductsModal'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt } from '@/utils'
import { PRODUCT_UNITS } from '@/constants'
import { productSchema, PRODUCT_VAT_OPTIONS, type ProductFormInput } from '@/services/productCreation'
import type { Product, OpeningInventoryBatch } from '@/types'

const ProductScanModal = lazy(() => import('@/components/scanner/ProductScanModal'))

// Product Add and Quick Add (components/forms/QuickAddModal.tsx) both
// validate against the same shared `productSchema` — see services/productCreation.ts.
// This keeps the two flows' required fields, defaults, and accepted
// values identical instead of duplicating the rules here.
type Form = ProductFormInput

function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

// Presentational only — maps a product's unit to one of the existing
// badge-* color classes (globals.css) so the mobile card's unit chip is
// colour-coded instead of always the same muted gray. Doesn't touch what
// `unit` actually IS or how it's saved/validated.
const UNIT_BADGE_CLASS: Record<string, string> = {
  Strip: 'badge-blue', Tablet: 'badge-blue', Capsule: 'badge-blue',
  Bottle: 'badge-teal', Sachet: 'badge-teal', Ltr: 'badge-teal',
  Vial: 'badge-purple', Ampoule: 'badge-purple', Tube: 'badge-purple',
  Box: 'badge-amber', Pcs: 'badge-amber', Kg: 'badge-amber',
}
function unitBadgeClass(unit?: string) {
  return (unit && UNIT_BADGE_CLASS[unit]) || 'badge-muted'
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

// ── Inventory Planning (Smart Purchase Suggestions) ─────────────────────────
// Deliberately kept OUTSIDE the shared react-hook-form `productSchema` (used
// by both this form and Quick Add) so this optional section can't affect
// Quick Add's simpler flow or its validation rules. State here is applied
// via a plain PATCH after create/update — same "non-fatal follow-up" pattern
// already used for opening stock in productCreation.ts.
export interface PlanningState {
  preferred_supplier_id: string
  supplier_lead_time_days: string
  safety_stock_qty: string
  safety_stock_days: string
  reorder_point_override: string
  exclude_from_suggestions: boolean
}

function emptyPlanning(p?: Product | null): PlanningState {
  return {
    preferred_supplier_id:   p?.preferred_supplier_id || '',
    supplier_lead_time_days: p?.supplier_lead_time_days != null ? String(p.supplier_lead_time_days) : '',
    safety_stock_qty:        p?.safety_stock_qty != null ? String(p.safety_stock_qty) : '',
    safety_stock_days:       p?.safety_stock_days != null ? String(p.safety_stock_days) : '',
    reorder_point_override:  p?.reorder_point_override != null ? String(p.reorder_point_override) : '',
    exclude_from_suggestions: !!p?.exclude_from_suggestions,
  }
}

/** Converts the form's string state into the payload shape products.js expects (numbers or null to clear). */
function planningToPayload(s: PlanningState) {
  const num = (v: string) => (v === '' ? null : Number(v))
  return {
    preferred_supplier_id:   s.preferred_supplier_id || null,
    supplier_lead_time_days: num(s.supplier_lead_time_days),
    safety_stock_qty:        num(s.safety_stock_qty),
    safety_stock_days:       num(s.safety_stock_days),
    reorder_point_override:  num(s.reorder_point_override),
    exclude_from_suggestions: s.exclude_from_suggestions,
  }
}

function InventoryPlanningSection({ value, onChange }: { value: PlanningState; onChange: (v: PlanningState) => void }) {
  const { data: suppliersData } = useSuppliers({ limit: 200 })
  const suppliers = (suppliersData?.data as any[]) || []
  const set = (k: keyof PlanningState, v: any) => onChange({ ...value, [k]: v })

  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <div className="flex items-center gap-1.5 mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-3)]">
        <Boxes size={13} className="text-brand" />
        Inventory Planning <span className="normal-case font-medium text-[var(--text-4)]">(optional — used by Smart Purchase Suggestions)</span>
      </div>
      <div className="form-grid col3">
        <Select
          label="Preferred Supplier"
          value={value.preferred_supplier_id}
          onChange={(e) => set('preferred_supplier_id', e.target.value)}
          placeholder="Select Supplier"
          options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
        />
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Supplier Lead Time (days)</label>
          <input type="number" min={0} className="erp-input" placeholder="Company default"
            value={value.supplier_lead_time_days} onChange={(e) => set('supplier_lead_time_days', e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Reorder Point <span className="normal-case font-medium text-[var(--text-4)]">(blank = auto)</span></label>
          <input type="number" min={0} className="erp-input" placeholder="Auto Calculate"
            value={value.reorder_point_override} onChange={(e) => set('reorder_point_override', e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Safety Stock (units)</label>
          <input type="number" min={0} className="erp-input" placeholder="Auto from days below"
            value={value.safety_stock_qty} onChange={(e) => set('safety_stock_qty', e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">OR Safety Stock (days)</label>
          <input type="number" min={0} className="erp-input" placeholder="Company default"
            value={value.safety_stock_days} onChange={(e) => set('safety_stock_days', e.target.value)}
            disabled={value.safety_stock_qty !== ''} />
        </div>
        <div className="flex items-end pb-1.5">
          <ToggleSwitch checked={value.exclude_from_suggestions} onChange={(v) => set('exclude_from_suggestions', v)} label="Exclude from Smart Purchase Suggestions" />
        </div>
      </div>
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
      // C.C% — `cc_pct` is the real column name on products.
      cc_pct: initial.cc_pct ?? 0,
      min_stock: initial.min_stock,
    } : {
      // Same defaults Quick Add has always used, so a product created
      // without touching these fields is identical either way.
      unit: 'Strip', vat_percent: 13, cc_pct: 0, min_stock: 50, mrp: 0, sales_rate: '' as any, purchase_rate: 0,
      barcode: '', opening_stock: '' as any, opening_batch: '', opening_expiry: '',
    },
  })

  const [scanOpen, setScanOpen]   = useState(false)
  const [scanBanner, setScanBanner] = useState<string | null>(null)
  const [planning, setPlanning] = useState<PlanningState>(() => emptyPlanning(initial))

  // Create Product only: pre-fetch the next auto-generated barcode (same
  // global product_auto_barcode_seq / nextAutoBarcode() the backend already
  // falls back to on submit) so the field is filled the moment the form
  // opens, instead of only after save. Never runs for Edit Product — the
  // `!initial` guard below and `enabled: !initial` on the hook both key off
  // the prop this component was mounted with, so this fires at most once
  // per form open, never again on re-render.
  const { data: nextBarcodeData } = useNextBarcode(!initial)
  const barcodeAutoFilled = useRef(false)

  useEffect(() => {
    if (initial || barcodeAutoFilled.current) return
    if (!nextBarcodeData?.barcode) return
    // Don't stomp a barcode the user already typed or scanned while the
    // request was in flight.
    if (dirtyFields.barcode) return
    setValue('barcode', nextBarcodeData.barcode, { shouldDirty: false, shouldValidate: false })
    barcodeAutoFilled.current = true
  }, [initial, nextBarcodeData, dirtyFields.barcode, setValue])

  const openScan = () => setScanOpen(true)

  const handleBarcodeScanned = (code: string) => {
    setValue('barcode', code, { shouldDirty: true, shouldValidate: true })
    setScanBanner('Barcode filled from scan — please verify.')
    setScanOpen(false)
  }

  const onSubmit = handleSubmit(async (data) => {
    if (initial) {
      // Editing never touches opening stock — that's a "new product" concept.
      const { opening_stock, opening_batch, opening_expiry, ...editable } = data as any
      await update.mutateAsync({ id: initial.id, data: { ...editable, ...planningToPayload(planning) } })
    } else {
      const newProduct = await create.mutateAsync(data)
      // Inventory Planning is optional and applied as a non-fatal follow-up
      // PATCH, same pattern as opening-stock — the product is still
      // created successfully even if this secondary call fails.
      const payload = planningToPayload(planning)
      const hasAnyPlanning = Object.values(payload).some(v => v !== null && v !== false)
      if (hasAnyPlanning) {
        try { await update.mutateAsync({ id: newProduct.id, data: payload as any }) } catch { /* non-fatal */ }
      }
    }
    onClose()
  })


  return (
    <>
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
              if (!initial && !dirtyFields.cc_pct && manufacturer?.cc_pct != null) {
                setValue('cc_pct', manufacturer.cc_pct, { shouldDirty: false })
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
                onClick={() => openScan()}
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
            {...register('cc_pct')}
          />
          {errors.cc_pct && <p className="text-xs text-red-500 mt-1">{(errors as any).cc_pct?.message}</p>}
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

      <InventoryPlanningSection value={planning} onChange={setPlanning} />

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
            onBarcode={handleBarcodeScanned}
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
  // Mobile-only "Filter" button — filters the already-fetched page of
  // rows client-side by status. Deliberately NOT wired into useProducts'
  // query params: the search/pagination API call itself is untouched,
  // this only decides which of the rows already on screen render as
  // cards. Desktop table is unaffected — it always maps `rows` directly.
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const del = useDeleteProduct()

  const { data, isLoading } = useProducts({ page, limit: 20, search: search || undefined })
  const rows  = (data?.data  as Product[]) || []
  const total = (data?.pagination as any)?.total || 0

  // Mobile card list only — see statusFilter above.
  const mobileRows = statusFilter === 'all'
    ? rows
    : rows.filter(p => statusFilter === 'active' ? p.is_active : !p.is_active)

  return (
    <div className="prod-page">
      <div className="page-header prod-sticky-header">
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Products</h1></div>
        <div className="flex items-center gap-2 prod-header-desktop-actions">
          <Button variant="secondary" icon={<Upload size={14}/>} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="secondary" icon={<Download size={14}/>} onClick={() => setExportOpen(true)}>
            Export
          </Button>
          <Button variant="secondary" icon={<Printer size={14}/>} onClick={() => navigate('/barcode-print')}>
            Print Barcodes
          </Button>
          <Button variant="secondary" icon={<QrCode size={14}/>} onClick={() => navigate('/qrcode-print')}>
            Print QR Codes
          </Button>
          <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(null); setModal(true) }}>
            New Product
          </Button>
        </div>
        {/* Mobile: header keeps only the title + a prominent New Product
            button — Import/Export/Print move to their own wrapping
            toolbar below so the header itself stays compact. */}
        <button
          className="prod-new-btn-mobile"
          onClick={() => { setEditing(null); setModal(true) }}
          aria-label="New product"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Mobile-only secondary action toolbar — same handlers as the
          desktop buttons above, just laid out for touch: 44px tall,
          12px radius, icon+label, wraps onto multiple rows, never
          breaks a label across two lines. */}
      <div className="prod-mobile-toolbar">
        <button className="prod-toolbar-btn" onClick={() => setImportOpen(true)}>
          <Upload size={15} /><span>Import</span>
        </button>
        <button className="prod-toolbar-btn" onClick={() => setExportOpen(true)}>
          <Download size={15} /><span>Export</span>
        </button>
        <button className="prod-toolbar-btn" onClick={() => navigate('/barcode-print')}>
          <Printer size={15} /><span>Barcode</span>
        </button>
        <button className="prod-toolbar-btn" onClick={() => navigate('/qrcode-print')}>
          <QrCode size={15} /><span>QR</span>
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 prod-search-row">
        <SearchInput value={searchRaw} onChange={setSearch} className="prod-search-input" />
        <button
          className={`prod-filter-btn ${statusFilter !== 'all' ? 'prod-filter-btn-active' : ''}`}
          onClick={() => setFilterOpen(o => !o)}
          aria-label="Filter products"
          aria-expanded={filterOpen}
        >
          <Filter size={16} />
        </button>
        {filterOpen && (
          <div className="prod-filter-sheet">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                className={`prod-filter-opt ${statusFilter === f ? 'prod-filter-opt-active' : ''}`}
                onClick={() => { setStatusFilter(f); setFilterOpen(false) }}
              >
                {f === 'all' ? 'All Products' : f === 'active' ? 'Active Only' : 'Inactive Only'}
              </button>
            ))}
          </div>
        )}
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
                            <Button variant="ghost" size="sm" icon={<QrCode size={12}/>}
                              onClick={() => navigate(`/qrcode-print?productId=${p.id}`)}>QR</Button>
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
          ) : mobileRows.length === 0 ? (
            <div className="prod-empty-state">
              <div className="prod-empty-icon"><Package size={30}/></div>
              <p className="prod-empty-title">No products found</p>
              <p className="prod-empty-sub">
                {statusFilter !== 'all' ? 'Try a different filter, or add a new product.' : 'Get started by adding your first product.'}
              </p>
              <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(null); setModal(true) }}>
                New Product
              </Button>
            </div>
          ) : (
            mobileRows.map(p => (
              <div key={p.id} className="prod-mobile-card">
                {/* Header: name + manufacturer (left), code badge (right) */}
                <div className="prod-mc-top">
                  <div className="prod-mc-name-wrap">
                    <p className="prod-mc-name">{p.name}</p>
                    {p.company_name && <p className="prod-mc-company">{p.company_name}</p>}
                  </div>
                  <div className="prod-mc-code-wrap">
                    <span className="prod-mc-code">{p.item_code}</span>
                    {p.barcode && <div className="prod-mc-barcode">{p.barcode}</div>}
                  </div>
                </div>

                {/* Generic name */}
                {p.generic_name && (
                  <div className="prod-mc-generic">{p.generic_name}</div>
                )}

                {/* Three separate stat boxes: MRP / Sale / Stock */}
                <div className="prod-mc-stats">
                  <div className="prod-mc-stat-box">
                    <span className="prod-mc-rate-label">MRP</span>
                    <span className="prod-mc-rate-value">{fmt(p.mrp)}</span>
                  </div>
                  <div className="prod-mc-stat-box">
                    <span className="prod-mc-rate-label">Sale</span>
                    <span className="prod-mc-rate-value">{fmt(p.sales_rate)}</span>
                  </div>
                  <div className={`prod-mc-stat-box ${p.current_stock < p.min_stock ? 'prod-mc-stat-box-low' : ''}`}>
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
                    <span className={`badge ${unitBadgeClass(p.unit)}`}>{p.unit}</span>
                    {p.is_active
                      ? <span className="badge badge-green">Active</span>
                      : <span className="badge badge-red">Inactive</span>
                    }
                  </div>
                  <div className="prod-mc-actions">
                    <button className="prod-mc-btn" onClick={() => navigate(`/barcode-print?productId=${p.id}`)}>
                      <Printer size={13}/><span>Print</span>
                    </button>
                    <button className="prod-mc-btn" onClick={() => navigate(`/qrcode-print?productId=${p.id}`)}>
                      <QrCode size={13}/><span>QR</span>
                    </button>
                    <button className="prod-mc-btn" onClick={() => { setEditing(p); setModal(true) }}>
                      <Pencil size={13}/><span>Edit</span>
                    </button>
                    <button className="prod-mc-btn prod-mc-btn-danger" onClick={() => setDelId(p.id)}>
                      <Trash2 size={13}/><span>Delete</span>
                    </button>
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
