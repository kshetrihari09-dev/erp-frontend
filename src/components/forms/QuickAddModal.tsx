/**
 * QuickAddModal.tsx
 *
 * Minimal "quick create" product modal opened from ProductSearchCell.
 * Uses the existing productsAPI.create() — no backend changes.
 *
 * Fields map to POST /products body fields exactly:
 *   name, generic_name, company_name, category, unit,
 *   sales_rate, purchase_rate, mrp, vat_percent (sent as vat_percent),
 *   min_stock
 *
 * The "Opening Stock" field calls productsAPI.adjust() after create.
 */

import { useState, useRef, useEffect } from 'react'
import { X, Package, Loader2, AlertCircle } from 'lucide-react'
import { productsAPI } from '@/services/api'
import type { Product } from '@/types'

interface Props {
  initialName: string
  onSave:  (product: Product) => void
  onClose: () => void
}

const UNITS = ['Strip', 'Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule', 'Sachet', 'Tube', 'Pcs', 'Box', 'Kg', 'Ltr']
const VAT_OPTIONS = [0, 13]

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

  // Escape closes modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    setError('')

    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.sales_rate || isNaN(Number(form.sales_rate))) {
      setError('Sales rate is required'); return
    }

    setSaving(true)
    try {
      // 1 — Create product (maps exactly to POST /products accepted fields)
      const res = await productsAPI.create({
        name:          form.name.trim(),
        generic_name:  form.generic_name.trim()  || undefined,
        company_name:  form.company_name.trim()  || undefined,
        category:      form.category.trim()      || undefined,
        unit:          form.unit,
        sales_rate:    Number(form.sales_rate),
        purchase_rate: Number(form.purchase_rate) || 0,
        mrp:           Number(form.mrp)           || 0,
        vat_percent:   Number(form.vat_percent)   || 13,
        min_stock:     Number(form.min_stock)     || 50,
      } as any)

      const newProduct: Product = res.data.data

      // 2 — Adjust stock if opening qty provided
      if (form.opening_stock && Number(form.opening_stock) > 0) {
        try {
          await productsAPI.adjust(newProduct.id, {
            qty:           Number(form.opening_stock),
            reason:        'Opening stock',
            batch_no:      form.opening_batch  || undefined,
            expiry:        form.opening_expiry || undefined,
            purchase_rate: Number(form.purchase_rate) || 0,
          } as any)
        } catch {
          // Non-fatal — product still created, stock can be adjusted later
        }
      }

      // Merge vat_percent into the returned product object since the
      // backend returns the raw row (which uses vat_percent column)
      onSave({
        ...newProduct,
        vat_percent: Number(form.vat_percent) || 13,
        sales_rate:  Number(form.sales_rate),
      })
    } catch (e: any) {
      setError(e.message || 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────── //
  return (
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
              <input
                className="erp-input"
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
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
                {VAT_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
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
    </div>
  )
}
