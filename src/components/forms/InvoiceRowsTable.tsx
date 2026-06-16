/**
 * InvoiceRowsTable.tsx
 *
 * Invoice line-item grid.
 * Product column replaced with ProductSearchCell — a real-time search
 * combobox with keyboard navigation and quick-create support.
 *
 * All other logic (calcRowAmount, field names, InvoiceRow interface)
 * is unchanged from the previous version.
 */

import { useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fmt, calcRowAmount } from '@/utils'
import type { Product } from '@/types'
import ProductSearchCell from './ProductSearchCell'

/* ── Public types ─────────────────────────────────────────────────────────── */

export interface InvoiceRow {
  _id:          number
  product_id:   string
  product_name: string
  batch_no:     string
  expiry:       string
  qty:          number
  bonus:        number
  rate:          number | string
  discount_pct: number
  cc_pct:       number
  amount:       number
  cc_amount:    number
}

export const newRow = (): InvoiceRow => ({
  _id: Math.random(), product_id: '', product_name: '',
  batch_no: '', expiry: '', qty: 1, bonus: 0, rate: '',
  discount_pct: 0, cc_pct: 0, amount: 0, cc_amount: 0,
})

interface Props {
  rows:          InvoiceRow[]
  products:      Product[]
  onChange:      (rows: InvoiceRow[]) => void
  onProductsChange?: (products: Product[]) => void  // add newly-created product to master list
  showBonus?:    boolean
  showCC?:       boolean
  showDiscount?: boolean
  showExpiry?:   boolean
  showBatch?:    boolean
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function InvoiceRowsTable({
  rows, products, onChange, onProductsChange,
  showBonus = true, showCC = true, showDiscount = false,
  showExpiry = true, showBatch = true,
}: Props) {
  const firstRowRef = useRef<boolean>(true)

  /* ── Row update helper (unchanged logic) ──────────────────────────────── */
  function update(idx: number, key: keyof InvoiceRow, val: unknown) {
    const next = rows.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [key]: val }
      if (key === 'product_id') {
        const p = products.find(x => x.id === val)
        if (p) {
          updated.product_name = p.name
          updated.rate         = p.sales_rate
        }
      }
      const { amount, cc_amount } = calcRowAmount({
        qty:          Number(updated.qty),
        rate:         Number(updated.rate),
        bonus:        Number(updated.bonus)        || 0,
        discount_pct: Number(updated.discount_pct) || 0,
        cc_pct:       Number(updated.cc_pct)       || 0,
      })
      return { ...updated, amount, cc_amount }
    })
    onChange(next)
  }

  /* ── Product selected from combobox ──────────────────────────────────── */
  function handleProductSelect(idx: number, p: Product) {
    const next = rows.map((r, i) => {
      if (i !== idx) return r
      const updated = {
        ...r,
        product_id:   p.id,
        product_name: p.name,
        rate:         p.sales_rate,
      }
      const { amount, cc_amount } = calcRowAmount({
        qty:          Number(updated.qty),
        rate:         Number(updated.rate),
        bonus:        Number(updated.bonus)        || 0,
        discount_pct: Number(updated.discount_pct) || 0,
        cc_pct:       Number(updated.cc_pct)       || 0,
      })
      return { ...updated, amount, cc_amount }
    })
    onChange(next)

    // Move focus to the Batch field of the same row
    setTimeout(() => {
      const batchInputs = document.querySelectorAll<HTMLInputElement>('.pos-batch-input')
      batchInputs[idx]?.focus()
    }, 50)
  }

  /* ── Quick-created product: add to master list ──────────────────────── */
  function handleProductCreated(p: Product) {
    onProductsChange?.([...products, p])
  }

  /* ── Rows management ─────────────────────────────────────────────────── */
  function addRow() { onChange([...rows, newRow()]) }

  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx)
    onChange(next.length ? next : [newRow()])
  }

  /* ── Enter key on last row → add row ─────────────────────────────────── */
  function handleRowKeyDown(e: React.KeyboardEvent, idx: number) {
    // Only fire when not inside the ProductSearchCell (it handles its own Enter)
    const target = e.target as HTMLElement
    if (target.classList.contains('psc-input') || target.classList.contains('psc-trigger')) return
    if (e.key === 'Enter' && idx === rows.length - 1) {
      e.preventDefault()
      onChange([...rows, newRow()])
    }
  }

  /* ── Totals ──────────────────────────────────────────────────────────── */
  const subtotal = rows.reduce((s, r) => s + r.amount, 0)

  /* ── Column visibility ───────────────────────────────────────────────── */
  const colDefs = [
    { key: 'product',      label: 'Product / Particular', minW: 200, always: true },
    { key: 'batch_no',     label: 'Batch',      w: 90,  show: showBatch },
    { key: 'expiry',       label: 'Expiry',     w: 88,  show: showExpiry },
    { key: 'qty',          label: 'Qty',        w: 64,  always: true },
    { key: 'bonus',        label: 'Bonus',      w: 64,  show: showBonus },
    { key: 'rate',         label: 'Rate',       w: 84,  always: true },
    { key: 'discount_pct', label: 'Disc%',      w: 64,  show: showDiscount },
    { key: 'cc_pct',       label: 'C.C %',      w: 64,  show: showCC },
    { key: 'cc_amount',    label: 'C.C Amount', w: 90,  show: showCC, right: true },
    { key: 'amount',       label: 'Amount',     w: 96,  always: true, right: true },
    { key: 'del',          label: '',           w: 36,  always: true },
  ]
  const visibleCols = colDefs.filter(c => c.always || c.show)

  /* ── JSX ─────────────────────────────────────────────────────────────── */
  return (
    <div>
      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              {visibleCols.map(c => (
                <th
                  key={c.key}
                  style={{
                    width:    c.w,
                    minWidth: (c as any).minW,
                    textAlign:c.right ? 'right' : undefined,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row._id} onKeyDown={e => handleRowKeyDown(e, idx)}>

                {/* ── Product combobox ──────────────────────────────── */}
                <td className="psc-cell">
                  <ProductSearchCell
                    value={row.product_id}
                    products={products}
                    onChange={p => handleProductSelect(idx, p)}
                    onCreated={handleProductCreated}
                    autoFocus={idx === 0 && firstRowRef.current && (firstRowRef.current = false, true)}
                  />
                </td>

                {/* ── Batch ─────────────────────────────────────────── */}
                {showBatch && (
                  <td>
                    <input
                      className="pos-cell-input pos-batch-input"
                      value={row.batch_no}
                      onChange={e => update(idx, 'batch_no', e.target.value)}
                      placeholder="B001"
                    />
                  </td>
                )}

                {/* ── Expiry ────────────────────────────────────────── */}
                {showExpiry && (
                  <td>
                    <input
                      className="pos-cell-input"
                      value={row.expiry}
                      onChange={e => update(idx, 'expiry', e.target.value)}
                      placeholder="MM/YY"
                    />
                  </td>
                )}

                {/* ── Qty ───────────────────────────────────────────── */}
                <td>
                  <input
                    type="number"
                    className="pos-cell-input pos-cell-num"
                    value={row.qty ?? ''}
                    min={1}
                    onChange={e => update(idx, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </td>

                {/* ── Bonus ─────────────────────────────────────────── */}
                {showBonus && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.bonus ?? ''}
                      min={0}
                      onChange={e => update(idx, 'bonus', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── Rate ──────────────────────────────────────────── */}
                <td>
                  <input
                    type="number"
                    className="pos-cell-input pos-cell-num"
                    value={row.rate ?? ''}
                    min={0}
                    step="0.01"
                    onChange={e => update(idx, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </td>

                {/* ── Discount % ────────────────────────────────────── */}
                {showDiscount && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.discount_pct ?? ''}
                      min={0} max={100}
                      onChange={e => update(idx, 'discount_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── CC % ──────────────────────────────────────────── */}
                {showCC && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.cc_pct ?? ''}
                      min={0}
                      step="0.01"
                      onChange={e => update(idx, 'cc_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── CC Amount (readonly) ───────────────────────────── */}
                {showCC && (
                  <td className="pos-cell-display pos-cell-display--right">
                    {row.cc_amount > 0
                      ? fmt(row.cc_amount)
                      : <span className="text-[var(--text-4)]">—</span>}
                  </td>
                )}

                {/* ── Amount (readonly) ─────────────────────────────── */}
                <td className="pos-cell-display pos-cell-display--right pos-cell-display--bold">
                  {row.amount > 0
                    ? fmt(row.amount)
                    : <span className="text-[var(--text-4)]">—</span>}
                </td>

                {/* ── Delete ────────────────────────────────────────── */}
                <td>
                  <button
                    type="button"
                    className="pos-row-delete"
                    onClick={() => removeRow(idx)}
                    tabIndex={-1}
                    title="Remove row"
                  >
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <button type="button" className="pos-add-row-btn" onClick={addRow}>
          <Plus size={13}/> Add Row
        </button>
        <div className="pos-subtotal">
          <span className="pos-subtotal-label">Sub Total</span>
          <span className="pos-subtotal-value">{fmt(subtotal)}</span>
        </div>
      </div>
    </div>
  )
}
