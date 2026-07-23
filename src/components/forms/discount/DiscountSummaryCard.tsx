/**
 * DiscountSummaryCard.tsx
 *
 * Live totals preview shown at the bottom of the Discount Review popup,
 * regardless of which scope (Invoice / Company / Product) is active.
 * Pure presentational — all numbers are computed upstream by discountUtils.
 */
import { fmt } from '@/utils'

interface Props {
  subtotal:        number
  discountTotal:   number
  discountLabel?:  string
  roundOff:        number
  grandTotal:      number
}

export default function DiscountSummaryCard({
  subtotal, discountTotal, discountLabel = 'Total Discount', roundOff, grandTotal,
}: Props) {
  return (
    <div className="drv-summary">
      <div className="drv-summary-row">
        <span>Subtotal</span>
        <span className="drv-summary-value">{fmt(subtotal)}</span>
      </div>
      <div className="drv-summary-row">
        <span>{discountLabel}</span>
        <span className="drv-summary-value drv-summary-discount">
          {discountTotal > 0 ? `−${fmt(discountTotal)}` : fmt(0)}
        </span>
      </div>
      <div className="drv-summary-row">
        <span>Round Off</span>
        <span className="drv-summary-value drv-summary-muted">
          {roundOff === 0 ? fmt(0) : `${roundOff > 0 ? '+' : '−'}${fmt(Math.abs(roundOff))}`}
        </span>
      </div>
      <div className="drv-summary-row drv-summary-grand">
        <span>Grand Total</span>
        <span className="drv-summary-value">{fmt(grandTotal)}</span>
      </div>
    </div>
  )
}
