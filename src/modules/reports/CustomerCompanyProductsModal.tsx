import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Loader2, FileBarChart } from 'lucide-react'
import { customerCompanyAPI, type CustomerCompanyProductsReport } from '@/services/api'
import { useManufacturers } from '@/hooks/useQuery'
import useUIStore from '@/store/uiStore'
import { formatDisplayDate } from '@/utils/dateSystem'

/* Product-wise detail of ONE company row of "Customer vs Company" (opened by double-clicking the row).
   The customer, company and date range are the ones of the report that is on screen, passed in by the page —
   nothing is re-derived here. All figures come from GET /reports/customer-vs-company/products; this component
   only displays them (and re-requests when "Discount Excluded" is toggled). */

interface Props {
  customer: { id: string; code: string; name: string }
  company: string
  from: string
  to: string
  onClose: () => void
}

const money = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const neg = (n: number) => (Number(n) < 0 ? 'ccp-neg' : '')

export default function CustomerCompanyProductsModal({ customer, company, from, to, onClose }: Props) {
  const { error: toastError, dateMode } = useUIStore()
  const { data: manufacturers } = useManufacturers()
  const [discountExcluded, setDiscountExcluded] = useState(true)       // the parent report shows Sales before discount
  const [report, setReport] = useState<CustomerCompanyProductsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  // S.Code = the company's short code from the Manufacturers directory (blank if it has none / is "No Company")
  const sCode = useMemo(() => {
    const m = (manufacturers || []).find(x => x.name.trim().toLowerCase() === company.trim().toLowerCase())
    return m?.short_name || ''
  }, [manufacturers, company])

  const load = useCallback(async () => {
    const my = ++seq.current
    setLoading(true); setErr(null)
    try {
      const r = await customerCompanyAPI.products({ customer_id: customer.id, company, from, to, discount_excluded: discountExcluded })
      if (my !== seq.current) return
      setReport(r.data.data)
    } catch (e: any) {
      if (my !== seq.current) return
      setReport(null); setErr(e?.response?.data?.message || e?.message || 'Failed to load the product-wise report')
    } finally { if (my === seq.current) setLoading(false) }
  }, [customer.id, company, from, to, discountExcluded])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { seq.current++ }, [])                      // ignore a response that arrives after closing

  useEffect(() => { panel.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const rows = report?.rows || []
  const t = report?.totals

  const printIt = () => {
    if (!report) return
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
    const body = report.rows.map(r => `<tr><td>${esc(sCode)}</td><td>${esc(report.company)}</td><td>${esc(r.m_code)}</td><td>${esc(r.product)}</td>
      <td class="n">${qty(r.sales_qty)}</td><td class="n">${money(r.sales_amt)}</td><td class="n">${qty(r.free_qty)}</td><td class="n">${money(r.free_value)}</td>
      <td class="n">${qty(r.return_qty)}</td><td class="n">${money(r.return_amt)}</td><td class="n">${qty(r.total_qty)}</td><td class="n">${money(r.total_amt)}</td></tr>`).join('')
    const tt = report.totals
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Customer vs Company — ${esc(report.company)}</title><style>
      body{font:10px Arial,sans-serif;margin:10mm;color:#000}h1{font-size:14px;margin:0 0 2px}.meta{margin:0 0 8px;color:#333;line-height:1.5}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:2px 4px;text-align:left}th{background:#eee}
      .n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:bold;background:#f3f3f3}thead{display:table-header-group}tr{page-break-inside:avoid}
      @media print{@page{size:landscape;margin:8mm}}</style></head><body>
      <h1>Customer vs Company — Product-wise</h1>
      <p class="meta"><b>Customer:</b> ${esc(report.customer.code)} — ${esc(report.customer.name)} &nbsp;|&nbsp; <b>Company:</b> ${esc(report.company)}${sCode ? ` (${esc(sCode)})` : ''}<br>
      <b>From:</b> ${esc(formatDisplayDate(report.filters.from, dateMode))} &nbsp; <b>To:</b> ${esc(formatDisplayDate(report.filters.to, dateMode))}
      &nbsp;|&nbsp; Discount Excluded: ${report.filters.discount_excluded ? 'Yes' : 'No'}</p>
      <table><thead><tr><th>S.Code</th><th>Company</th><th>M.Code</th><th>Product</th><th>Sales Qty</th><th>Sales Amt</th><th>F Qty</th><th>F. Value</th><th>Retu. Qty</th><th>Return Amt</th><th>Tot Qty</th><th>Tot Amt</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">${qty(tt.sales_qty)}</td><td class="n">${money(tt.sales_amt)}</td><td class="n">${qty(tt.free_qty)}</td><td class="n">${money(tt.free_value)}</td>
      <td class="n">${qty(tt.return_qty)}</td><td class="n">${money(tt.return_amt)}</td><td class="n">${qty(tt.total_qty)}</td><td class="n">${money(tt.total_amt)}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { toastError('Pop-up blocked', 'Allow pop-ups to print the report'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  return createPortal(
    <div className="ccp-overlay">
      <div ref={panel} className="ccp-panel" role="dialog" aria-modal="true" aria-label={`Product-wise details — ${company}`} tabIndex={-1}>
        <div className="ccp-head">
          <h2 className="ccp-title">Customer vs Company — Product-wise</h2>
          <div className="ccp-head-actions">
            <button className="btn btn-secondary btn-sm" onClick={printIt} disabled={!report || loading}><Printer size={14} /> Print</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close"><X size={14} /> Close</button>
          </div>
        </div>

        <div className="ccp-info">
          <div><span>Customer</span><b>{customer.code ? `${customer.code} — ` : ''}{customer.name}</b></div>
          <div><span>Company</span><b>{company}</b>{sCode && <em> ({sCode})</em>}</div>
          <div><span>From</span><b>{formatDisplayDate(from, dateMode)}</b></div>
          <div><span>To</span><b>{formatDisplayDate(to, dateMode)}</b></div>
          <label className="ccp-check" title="On: Sales Amt is before discount (as in the Sales column of the report). Off: Sales Amt is after discount.">
            <input type="checkbox" checked={discountExcluded} disabled={loading} onChange={e => setDiscountExcluded(e.target.checked)} /> Discount Excluded
          </label>
        </div>

        <div className="ccp-scroll">
          <table className="sr-table ccp-table">
            <thead><tr>
              <th>S.Code</th><th>Company</th><th>M.Code</th><th>Product</th>
              <th className="sr-num">Sales Qty</th><th className="sr-num">Sales Amt</th><th className="sr-num">F Qty</th><th className="sr-num">F. Value</th>
              <th className="sr-num">Retu. Qty</th><th className="sr-num">Return Amt</th><th className="sr-num">Tot Qty</th><th className="sr-num">Tot Amt</th>
            </tr></thead>
            <tbody>
              {!loading && rows.map(r => (
                <tr key={r.product_id ?? r.product} className="sr-row">
                  <td>{sCode}</td><td>{company}</td><td>{r.m_code}</td><td className="sr-c-part" style={{ maxWidth: 320 }}>{r.product}</td>
                  <td className={`sr-num ${neg(r.sales_qty)}`}>{qty(r.sales_qty)}</td><td className={`sr-num ${neg(r.sales_amt)}`}>{money(r.sales_amt)}</td>
                  <td className="sr-num">{qty(r.free_qty)}</td><td className="sr-num">{money(r.free_value)}</td>
                  <td className="sr-num">{qty(r.return_qty)}</td><td className="sr-num">{money(r.return_amt)}</td>
                  <td className={`sr-num ${neg(r.total_qty)}`}>{qty(r.total_qty)}</td><td className={`sr-num sr-bal ${neg(r.total_amt)}`}>{money(r.total_amt)}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={12} className="sr-state"><Loader2 size={16} className="sr-spin" /> Loading product-wise report…</td></tr>}
              {!loading && err && <tr><td colSpan={12} className="sr-state sr-state-err">{err} <button className="btn btn-secondary btn-sm" onClick={() => void load()}>Retry</button></td></tr>}
              {!loading && !err && report && rows.length === 0 && <tr><td colSpan={12} className="sr-state"><FileBarChart size={18} /> No product transactions for this company in the selected range.</td></tr>}
            </tbody>
            {!loading && !err && t && rows.length > 0 && (
              <tfoot><tr>
                <td colSpan={4}>Total ({rows.length} product{rows.length === 1 ? '' : 's'})</td>
                <td className={`sr-num ${neg(t.sales_qty)}`}>{qty(t.sales_qty)}</td><td className={`sr-num ${neg(t.sales_amt)}`}>{money(t.sales_amt)}</td>
                <td className="sr-num">{qty(t.free_qty)}</td><td className="sr-num">{money(t.free_value)}</td>
                <td className="sr-num">{qty(t.return_qty)}</td><td className="sr-num">{money(t.return_amt)}</td>
                <td className={`sr-num ${neg(t.total_qty)}`}>{qty(t.total_qty)}</td><td className={`sr-num ${neg(t.total_amt)}`}>{money(t.total_amt)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
        <div className="ccp-legend">Sales Amt is {discountExcluded ? 'before' : 'after'} discount. F Qty = free (bonus) quantity; F. Value = F Qty × rate and is not part of Sales Amt. Tot Qty = Sales Qty + F Qty − Retu. Qty; Tot Amt = Sales Amt − Return Amt. Negative figures are shown as they are. Press Esc to close.</div>
      </div>
    </div>,
    document.body,
  )
}
