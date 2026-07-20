/**
 * QuickAddModal.tsx
 *
 * Minimal "quick create" product modal opened from ProductSearchCell.
 * Product creation (validation + POST /products + opening-stock adjust)
 * goes through the shared services/productCreation.ts service — the same
 * one the Product Add page (modules/inventory/ProductsPage.tsx) uses —
 * so both flows always produce identical database records. This file's
 * UI/markup/styling/shortcuts are unchanged; only the save logic was
 * pointed at the shared service instead of calling the API directly.
 *
 * Fields map to POST /products body fields exactly:
 *   name, generic_name, company_name, category, unit,
 *   sales_rate, purchase_rate, mrp, vat_percent, min_stock
 *
 * The "Opening Stock" field triggers POST /products/:id/adjust after create.
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Package, Loader2, AlertCircle } from 'lucide-react'
import ManufacturerSelect from './ManufacturerSelect'
import type { Product } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { validateProductInput, createProductWithOpeningStock, PRODUCT_VAT_OPTIONS } from '@/services/productCreation'

interface Props {
  initialName: string
  onSave:  (product: Product) => void
  onClose: () => void
}

const UNITS = ['Strip', 'Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule', 'Sachet', 'Tube', 'Pcs', 'Box', 'Kg', 'Ltr']

interface FormState {
  name:          string
  generic_name:  string
  company_name:  string
  category:      string
  unit:          string
  mrp:           string
  sales_rate:    string
  purchase_rate: string
  vat_percent:   string
  min_stock:     string
  opening_stock: string
  opening_batch: string
  opening_expiry:string
}

export default function QuickAddModal({ initialName, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>({
    name:          initialName,
    generic_name:  '',
    company_name:  '',
    category:      '',
    unit:          'Strip',
    mrp:           '',
    sales_rate:    '',
    purchase_rate: '',
    vat_percent:   '13',
    min_stock:     '50',
    opening_stock: '',
    opening_batch: '',
    opening_expiry:'',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const nameRef  = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus name field; select all so user can retype if needed
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  // Esc closes, Ctrl+Enter saves — registering this also suspends the
  // Sale/Purchase page's own F2..F10 shortcuts while this modal is open
  // (see hooks/useKeyboardShortcuts.ts).
  useKeyboardShortcuts([
    { combo: 'esc', handler: onClose, description: 'Close' },
    { combo: 'ctrl+enter', handler: () => handleSave(), description: 'Save product' },
  ])

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    setError('')

    const validationError = validateProductInput({
      name: form.name, sales_rate: form.sales_rate,
    } as any)
    if (validationError) { setError(validationError); return }

    setSaving(true)
    try {
      const newProduct = await createProductWithOpeningStock({
        name:           form.name,
        generic_name:   form.generic_name,
        company_name:   form.company_name,
        category:       form.category,
        unit:           form.unit,
        mrp:            form.mrp,
        sales_rate:     form.sales_rate,
        purchase_rate:  form.purchase_rate,
        vat_percent:    form.vat_percent,
        min_stock:      form.min_stock,
        opening_stock:  form.opening_stock,
        opening_batch:  form.opening_batch,
        opening_expiry: form.opening_expiry,
      })
      onSave(newProduct)
    } catch (e: any) {
      setError(e.message || 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────── //
  return createPortal(
    <div
      ref={overlayRef}
      className="qam-overlay"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="qam-panel" role="dialog" aria-modal="true" aria-label="Quick Add Product">

        {/* Header */}
        <div className="qam-header">
          <div className="qam-header-icon">
            <Package size={16} />
          </div>
          <div>
            <h2 className="qam-title">Quick Add Product</h2>
            <p className="qam-subtitle">Product will be saved to database immediately</p>
          </div>
          <button type="button" className="qam-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="qam-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Body */}
        <div className="qam-body">
          {/* Row 1 — Name + Generic */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">Product Name <span className="qam-required">*</span></label>
              <input
                ref={nameRef}
                className="erp-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Paracetamol 500mg"
              />
            </div>
            <div className="qam-field">
              <label className="qam-label">Generic Name</label>
              <input
                className="erp-input"
                value={form.generic_name}
                onChange={e => set('generic_name', e.target.value)}
                placeholder="e.g. Paracetamol"
              />
            </div>
          </div>

          {/* Row 2 — Company + Category + Unit */}
          <div className="qam-row">
            <div className="qam-field">
              <label className="qam-label">Company / Manufacturer</label>
              <ManufacturerSelect
                value={form.company_name}
                onChange={name => set('company_name', name)}
                placeholder="e.g. Sun Pharma"
              />
            </div>
            <div className="qam-field">
              <label className="qam-label">Category</label>
              <input
                className="erp-input"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="e.g. Analgesic"
              />
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Unit</label>
              <select className="erp-input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div className="qam-divider">
            <span>Pricing</span>
          </div>

          {/* Row 3 — MRP + Rate + Purchase + VAT */}
          <div className="qam-row">
            <div className="qam-field qam-field--sm">
              <label className="qam-label">MRP</label>
              <div className="qam-input-prefix">
                <span className="qam-prefix">₹</span>
                <input
                  type="number" min="0" step="0.01"
                  className="erp-input qam-has-prefix"
                  value={form.mrp}
                  onChange={e => set('mrp', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Sales Rate <span className="qam-required">*</span></label>
              <div className="qam-input-prefix">
                <span className="qam-prefix">₹</span>
                <input
                  type="number" min="0" step="0.01"
                  className="erp-input qam-has-prefix"
                  value={form.sales_rate}
                  onChange={e => set('sales_rate', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Purchase Rate</label>
              <div className="qam-input-prefix">
                <span className="qam-prefix">₹</span>
                <input
                  type="number" min="0" step="0.01"
                  className="erp-input qam-has-prefix"
                  value={form.purchase_rate}
                  onChange={e => set('purchase_rate', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="qam-field qam-field--xs">
              <label className="qam-label">VAT %</label>
              <select className="erp-input" value={form.vat_percent} onChange={e => set('vat_percent', e.target.value)}>
                {PRODUCT_VAT_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div className="qam-divider">
            <span>Opening Stock <span className="qam-optional">(optional)</span></span>
          </div>

          {/* Row 4 — Opening stock */}
          <div className="qam-row">
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Opening Qty</label>
              <input
                type="number" min="0" step="1"
                className="erp-input"
                value={form.opening_stock}
                onChange={e => set('opening_stock', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Batch No</label>
              <input
                className="erp-input"
                value={form.opening_batch}
                onChange={e => set('opening_batch', e.target.value)}
                placeholder="B001"
              />
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Expiry (MM/YY)</label>
              <input
                className="erp-input"
                value={form.opening_expiry}
                onChange={e => set('opening_expiry', e.target.value)}
                placeholder="06/27"
              />
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Min Stock Alert</label>
              <input
                type="number" min="0"
                className="erp-input"
                value={form.min_stock}
                onChange={e => set('min_stock', e.target.value)}
                placeholder="50"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="qam-footer">
          <button type="button" className="qam-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="qam-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="qam-spin" />
                Saving…
              </>
            ) : (
              <>
                <Package size={14} />
                Save Product
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
