/**
 * ProductDiscountTable.tsx
 *
 * Discount Review popup body for the "Product" scope. Every product
 * currently in the invoice is auto-listed (see discountUtils.buildProductRows)
 * — no manual product selection. Includes a search/filter box since
 * invoices can have many lines.
 */
import { useState } from 'react'
import { fmt } from '@/utils'
import { clampPct, clampFixed, computeTotals, type ProductRowInfo, type DiscountEntry } from './discountUtils'
import DiscountSummaryCard from './DiscountSummaryCard'
import { SearchInput } from '@/components/ui'
import type { InvoiceRow } from '@/components/forms/InvoiceRowsTable'

interface Props {
  rows:      InvoiceRow[]
  productRows: ProductRowInfo[]
  onChange:  (rowId: number, entry: DiscountEntry) => void
}

export default function ProductDiscountTable({ rows, productRows, onChange }: Props) {
  const [search, setSearch] = useState('')

  const totalDiscount = productRows.reduce((s, pr) => s + pr.discountAmount, 0)
  const subtotal      = productRows.reduce((s, pr) => s + pr.row.amount, 0)
  const { roundOff, grandTotal } = computeTotals(rows, totalDiscount)

  const filtered = search.trim()
    ? productRows.filter(pr =>
        pr.row.product_name.toLowerCase().includes(search.toLowerCase()) ||
        pr.company.toLowerCase().includes(search.toLowerCase()))
    : productRows

  if (!productRows.length) {
    return <p className="text-sm text-[var(--text-4)] py-4">No products in this invoice yet.</p>
  }

  return (
    <div className="drv-panel">
      <div className="drv-layout">
        <div className="drv-content">
          <SearchInput value={search} onChange={setSearch} placeholder="Search product or company…" className="mb-3" />

          <div className="drv-table-wrap">
            <table className="erp-table drv-table">
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Product</th><th>Company</th>
                  <th className="td-right">Qty</th><th className="td-right">Amount</th>
                  <th>Discount</th><th className="td-right">Discount Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pr, i) => (
                  <tr key={pr.row._id}>
                    <td className="font-semibold" data-card-title>
                      <span className="drv-truncate" title={pr.row.product_name}>{pr.row.product_name}</span>
                    </td>
                    <td className="text-[var(--text-3)]" data-label="Company">
                      <span className="drv-truncate" title={pr.company}>{pr.company}</span>
                    </td>
                    <td className="td-right td-mono" data-label="Qty">{pr.row.qty}</td>
                    <td className="td-right td-mono" data-label="Amount">{fmt(pr.row.amount)}</td>
                    <td data-label="Discount">
                      <div className="drv-cell-input">
                        <input
                          id={i === 0 ? 'discount-review-first-field' : undefined}
                          type="number" min={0} step="0.01"
                          className="erp-input drv-cell-value"
                          value={pr.discount.value === 0 ? '' : pr.discount.value}
                          placeholder="0"
                          onChange={e => {
                            const raw = e.target.value === '' ? 0 : Number(e.target.value)
                            const value = pr.discount.type === 'percentage' ? clampPct(raw) : clampFixed(raw, pr.row.amount)
                            onChange(pr.row._id, { ...pr.discount, value })
                          }}
                        />
                        <select
                          className="erp-input drv-cell-select"
                          value={pr.discount.type}
                          onChange={e => onChange(pr.row._id, { ...pr.discount, type: e.target.value as DiscountEntry['type'] })}
                        >
                          <option value="percentage">%</option>
                          <option value="fixed">Rs.</option>
                        </select>
                      </div>
                    </td>
                    <td className="td-right font-semibold td-mono" data-label="Discount Amount">{fmt(pr.discountAmount)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} className="text-center text-sm text-[var(--text-4)] py-4">No matches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="drv-sidebar">
          <DiscountSummaryCard
            subtotal={subtotal}
            discountTotal={totalDiscount}
            discountLabel="Total Product Discount"
            roundOff={roundOff}
            grandTotal={grandTotal}
          />
        </div>
      </div>
    </div>
  )
}
