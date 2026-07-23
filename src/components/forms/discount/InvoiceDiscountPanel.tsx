/**
 * InvoiceDiscountPanel.tsx
 *
 * Discount Review popup body for the "Invoice" scope: one discount
 * applied to the whole invoice. Percentage or Fixed Amount, live preview.
 */
import { clampPct, clampFixed, discountAmountFor, computeTotals, type DiscountEntry } from './discountUtils'
import DiscountSummaryCard from './DiscountSummaryCard'
import type { InvoiceRow } from '@/components/forms/InvoiceRowsTable'

interface Props {
  rows:     InvoiceRow[]
  subtotal: number
  discount: DiscountEntry
  onChange: (d: DiscountEntry) => void
}

export default function InvoiceDiscountPanel({ rows, subtotal, discount, onChange }: Props) {
  const discountAmount = discountAmountFor(discount, subtotal)
  const { roundOff, grandTotal } = computeTotals(rows, discountAmount)

  return (
    <div className="drv-panel">
      <div className="drv-field-row">
        <div className="drv-field">
          <label className="drv-label">Discount Type</label>
          <div className="drv-type-toggle">
            <button
              type="button"
              id="discount-review-first-field"
              className={`drv-type-btn ${discount.type === 'percentage' ? 'drv-type-btn--active' : ''}`}
              onClick={() => onChange({ ...discount, type: 'percentage' })}
            >
              Percentage (%)
            </button>
            <button
              type="button"
              className={`drv-type-btn ${discount.type === 'fixed' ? 'drv-type-btn--active' : ''}`}
              onClick={() => onChange({ ...discount, type: 'fixed' })}
            >
              Fixed Amount (Rs.)
            </button>
          </div>
        </div>
        <div className="drv-field">
          <label className="drv-label">Discount Value</label>
          <input
            type="number" min={0} step="0.01"
            className="erp-input drv-value-input"
            value={discount.value === 0 ? '' : discount.value}
            placeholder="0"
            onChange={e => {
              const raw = e.target.value === '' ? 0 : Number(e.target.value)
              const value = discount.type === 'percentage' ? clampPct(raw) : clampFixed(raw, subtotal)
              onChange({ ...discount, value })
            }}
          />
        </div>
      </div>

      <DiscountSummaryCard
        subtotal={subtotal}
        discountTotal={discountAmount}
        discountLabel="Invoice Discount"
        roundOff={roundOff}
        grandTotal={grandTotal}
      />
    </div>
  )
}
