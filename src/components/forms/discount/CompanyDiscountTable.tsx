/**
 * CompanyDiscountTable.tsx
 *
 * Discount Review popup body for the "Company / Manufacturer" scope.
 * Every unique company present in the current invoice is auto-detected
 * (see discountUtils.buildCompanyGroups) — no manual search/selection.
 */
import { fmt } from '@/utils'
import { clampPct, clampFixed, computeTotals, type CompanyGroup, type DiscountEntry } from './discountUtils'
import DiscountSummaryCard from './DiscountSummaryCard'
import type { InvoiceRow } from '@/components/forms/InvoiceRowsTable'

interface Props {
  rows:    InvoiceRow[]
  groups:  CompanyGroup[]
  onChange: (key: string, entry: DiscountEntry) => void
}

export default function CompanyDiscountTable({ rows, groups, onChange }: Props) {
  const totalDiscount = groups.reduce((s, g) => s + g.discountAmount, 0)
  const subtotal      = groups.reduce((s, g) => s + g.subtotal, 0)
  const { roundOff, grandTotal } = computeTotals(rows, totalDiscount)

  if (!groups.length) {
    return <p className="text-sm text-[var(--text-4)] py-4">No companies detected in this invoice yet.</p>
  }

  return (
    <div className="drv-panel">
      <div className="drv-layout">
        <div className="drv-content">
          <div className="drv-table-wrap">
            <table className="erp-table drv-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="td-right">Invoice Amount</th>
                  <th>Discount</th>
                  <th className="td-right">Discount Amount</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.key}>
                    <td className="font-semibold" data-card-title>{g.label}</td>
                    <td className="td-right td-mono" data-label="Invoice Amount">{fmt(g.subtotal)}</td>
                    <td data-label="Discount">
                      <div className="drv-cell-input">
                        <input
                          id={i === 0 ? 'discount-review-first-field' : undefined}
                          type="number" min={0} step="0.01"
                          className="erp-input drv-cell-value"
                          value={g.discount.value === 0 ? '' : g.discount.value}
                          placeholder="0"
                          onChange={e => {
                            const raw = e.target.value === '' ? 0 : Number(e.target.value)
                            const value = g.discount.type === 'percentage' ? clampPct(raw) : clampFixed(raw, g.subtotal)
                            onChange(g.key, { ...g.discount, value })
                          }}
                        />
                        <select
                          className="erp-input drv-cell-select"
                          value={g.discount.type}
                          onChange={e => onChange(g.key, { ...g.discount, type: e.target.value as DiscountEntry['type'] })}
                        >
                          <option value="percentage">%</option>
                          <option value="fixed">Rs.</option>
                        </select>
                      </div>
                    </td>
                    <td className="td-right font-semibold td-mono" data-label="Discount Amount">{fmt(g.discountAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="drv-sidebar">
          <DiscountSummaryCard
            subtotal={subtotal}
            discountTotal={totalDiscount}
            discountLabel="Total Company Discount"
            roundOff={roundOff}
            grandTotal={grandTotal}
          />
        </div>
      </div>
    </div>
  )
}
