import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Download, LogOut, Loader2, FileBarChart, RefreshCw } from 'lucide-react'
import { companyCustomerAPI, type CompanyCustomerReport, type CompanyCustomerParams } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { formatDisplayDate } from '@/utils/dateSystem'
import { DateRangeFilter, type DateRangeApply } from '@/components/ui/DateRangePopup'
import { PATHS } from '@/constants'

/* Company vs Customer — per-customer Sales, Discount, Sales Return, Sales Return
   Expiry and Net for one date range / manufacturer. All maths is done by
   GET /reports/company-vs-customer; this page only displays the result. */

const todayISO = () => new Date().toISOString().slice(0, 10)
const monthStartISO = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10) }
const money = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TYPE_LABEL: Record<string, string> = { all: 'All', customer: 'Customer', credit: 'Credit Customer' }

export default function CompanyCustomerReportPage() {
  const navigate = useNavigate()
  const { error: toastError, success: toastSuccess, dateMode } = useUIStore()

  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo]     = useState(todayISO())
  const [company, setCompany] = useState('all')
  const [companies, setCompanies] = useState<string[]>([])
  const [customerType, setCustomerType] = useState('all')

  const [report, setReport]   = useState<CompanyCustomerReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [selId, setSelId]     = useState<string | null>(null)
  const seq = useRef(0)
  const applied = useRef<{ from: string; to: string; company: string; customerType: string } | null>(null)

  useEffect(() => { companyCustomerAPI.companies().then(r => setCompanies(r.data.data || [])).catch(() => {}) }, [])

  const dateError = !from || !to ? 'Select both From and To dates' : from > to ? 'From date cannot be after To date' : null

  const run = useCallback(async (f: { from: string; to: string; company: string; customerType: string }) => {
    const my = ++seq.current
    setLoading(true); setErr(null)
    try {
      const params: CompanyCustomerParams = { from: f.from, to: f.to, company: f.company, customer_type: f.customerType }
      const r = await companyCustomerAPI.get(params)
      if (my !== seq.current) return
      applied.current = f; setReport(r.data.data as CompanyCustomerReport); setSelId(null)
    } catch (e: any) {
      if (my !== seq.current) return
      setReport(null); setErr(e?.response?.data?.message || e?.message || 'Failed to load report')
    } finally { if (my === seq.current) setLoading(false) }
  }, [])

  // "Report" — generate / refresh with the filters currently on screen
  const generate = useCallback(() => {
    if (dateError) { toastError('Invalid date range', dateError); return }
    void run({ from, to, company, customerType })
  }, [dateError, run, from, to, company, customerType, toastError])

  // "Set" in the Date Range popup: store the validated AD range and refresh the report with it
  const applyRange = useCallback(async (r: DateRangeApply) => {
    setFrom(r.fromAD); setTo(r.toAD)
    await run({ from: r.fromAD, to: r.toAD, company, customerType })
  }, [run, company, customerType])

  // first load
  useEffect(() => { void run({ from: monthStartISO(), to: todayISO(), company: 'all', customerType: 'all' }) }, [run])

  const exit = () => (window.history.length > 1 ? navigate(-1) : navigate(PATHS.REPORTS))
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') exit() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const exportCsv = async () => {
    const f = applied.current; if (!f) return
    try {
      const r = await companyCustomerAPI.exportCsv({ from: f.from, to: f.to, company: f.company, customer_type: f.customerType })
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = `company-vs-customer-${f.from}_${f.to}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toastSuccess('Exported', 'Company vs Customer CSV downloaded')
    } catch (e: any) { toastError('Export failed', e?.response?.data?.message || e?.message) }
  }

  const printReport = () => {
    if (!report) return
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
    const f = report.filters, t = report.totals
    const rows = report.rows.map(r => `<tr><td>${esc(r.customer_code)}</td><td>${esc(r.customer_name)}</td><td class="n">${money(r.opening_balance)}</td><td class="n">${money(r.sales)}</td><td class="n">${money(r.discount)}</td><td class="n">${money(r.sales_return)}</td><td class="n">${money(r.sales_return_expiry)}</td><td class="n b">${money(r.net)}</td><td class="n">${money(r.receipts)}</td><td class="n b">${money(r.closing_balance)}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Company vs Customer</title><style>
      body{font:11px Arial,sans-serif;margin:14mm 10mm;color:#000}h1{font-size:15px;margin:0 0 2px}.meta{margin:0 0 8px;color:#333}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:2px 5px;text-align:left}th{background:#eee}
      .n{text-align:right;font-variant-numeric:tabular-nums}.b{font-weight:bold}tfoot td{font-weight:bold;background:#f3f3f3}
      @media print{@page{size:landscape;margin:8mm}}</style></head><body>
      <h1>Company vs Customer</h1>
      <p class="meta">Period: ${esc(formatDisplayDate(f.from, dateMode))} to ${esc(formatDisplayDate(f.to, dateMode))} &nbsp;|&nbsp; Company: ${f.company === 'all' ? 'All Companies' : esc(f.company)}
      &nbsp;|&nbsp; Customer Type: ${esc(TYPE_LABEL[f.customer_type])}</p>
      <table><thead><tr><th>Customer Code</th><th>Particular</th><th>Opening Balance</th><th>Sales</th><th>Discount</th><th>Sales Return</th><th>Sales Return Expiry</th><th>Net</th><th>Receipts</th><th>Closing Balance</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${money(t.opening_balance)}</td><td class="n">${money(t.sales)}</td><td class="n">${money(t.discount)}</td><td class="n">${money(t.sales_return)}</td><td class="n">${money(t.sales_return_expiry)}</td><td class="n">${money(t.net)}</td><td class="n">${money(t.receipts)}</td><td class="n">${money(t.closing_balance)}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank', 'width=1000,height=800')
    if (!w) { toastError('Pop-up blocked', 'Allow pop-ups to print the report'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  const t = report?.totals
  const rows = report?.rows || []

  return (
    <div className="sr-page">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div><div className="page-breadcrumb">Reports</div><h1 className="page-title">Company vs Customer</h1></div>
      </div>

      <div className="sr-filters">
        <div className="sr-actions" style={{ marginLeft: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={loading}><RefreshCw size={14} /> Report</button>
          <button className="btn btn-secondary btn-sm" onClick={exit}><LogOut size={14} /> Exit</button>
        </div>

        <label className="sr-f" style={{ minWidth: 150 }}>
          <span>Customer Type</span>
          <select className="erp-input" value={customerType} onChange={e => setCustomerType(e.target.value)}>
            <option value="all">All</option><option value="customer">Customer</option><option value="credit">Credit Customer</option>
          </select>
        </label>
        <div className="sr-f">
          <span>Date Range</span>
          <DateRangeFilter fromAD={from} toAD={to} onApply={applyRange} />
        </div>
        <label className="sr-f" style={{ flex: '1 1 240px' }}>
          <span>Company</span>
          <select className="erp-input" value={company} onChange={e => setCompany(e.target.value)}>
            <option value="all">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <div className="sr-actions">
          <button className="btn btn-secondary btn-sm" onClick={printReport} disabled={!report || loading}><Printer size={14} /> Print</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!report || loading}><Download size={14} /> CSV</button>
        </div>
      </div>

      {dateError && <div className="sr-msg sr-msg-warn">{dateError}</div>}

      <div className="sr-sheet-wrap">
        <div className="sr-scroll">
          <table className="sr-table" style={{ minWidth: 1180 }}>
            <thead><tr>
              <th style={{ width: 120 }}>Customer Code</th><th>Particular</th>
              <th className="sr-num" title="Outstanding before the From date (original opening balance + earlier ledger movements)">Opening Balance</th>
              <th className="sr-num">Sales</th><th className="sr-num">Discount</th><th className="sr-num">Sales Return</th>
              <th className="sr-num">Sales Return Expiry</th><th className="sr-num">Net</th>
              <th className="sr-num" title="Money received from the customer between From and To">Receipts</th>
              <th className="sr-num" title="Opening Balance + ledger movement between From and To">Closing Balance</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const id = r.customer_id || `_walkin${i}`
                return (
                  <tr key={id} className={`sr-row ${selId === id ? 'sel' : ''}`} onClick={() => setSelId(id)}>
                    <td>{r.customer_code}</td><td className="sr-c-part" style={{ maxWidth: 320 }}>{r.customer_name}</td>
                    <td className="sr-num">{money(r.opening_balance)}</td>
                    <td className="sr-num">{money(r.sales)}</td><td className="sr-num">{money(r.discount)}</td>
                    <td className="sr-num">{money(r.sales_return)}</td><td className="sr-num">{money(r.sales_return_expiry)}</td>
                    <td className="sr-num sr-bal">{money(r.net)}</td>
                    <td className="sr-num">{money(r.receipts)}</td><td className="sr-num sr-bal">{money(r.closing_balance)}</td>
                  </tr>
                )
              })}
              {loading && <tr><td colSpan={10} className="sr-state"><Loader2 size={16} className="sr-spin" /> Loading report…</td></tr>}
              {!loading && err && <tr><td colSpan={10} className="sr-state sr-state-err">{err} <button className="btn btn-secondary btn-sm" onClick={generate}>Retry</button></td></tr>}
              {!loading && !err && report && rows.length === 0 && <tr><td colSpan={10} className="sr-state"><FileBarChart size={18} /> No sales or returns found for the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sr-foot">
          <div className="sr-foot-info">
            {report ? <>{rows.length} customer{rows.length === 1 ? '' : 's'}</> : '—'}
          </div>
          <div className="sr-foot-tot">
            <span>Total</span>
            <span className="sr-num">Opening <b>{money(t?.opening_balance ?? 0)}</b></span>
            <span className="sr-num">Sales <b>{money(t?.sales ?? 0)}</b></span>
            <span className="sr-num">Discount <b>{money(t?.discount ?? 0)}</b></span>
            <span className="sr-num">Sales Return <b>{money(t?.sales_return ?? 0)}</b></span>
            <span className="sr-num">Return Expiry <b>{money(t?.sales_return_expiry ?? 0)}</b></span>
            <span className="sr-num">Net <b>{money(t?.net ?? 0)}</b></span>
            <span className="sr-num">Receipts <b>{money(t?.receipts ?? 0)}</b></span>
            <span className="sr-num sr-foot-bal">Closing <b>{money(t?.closing_balance ?? 0)}</b></span>
          </div>
        </div>
      </div>
      <div className="sr-legend">
        Opening Balance = the customer's original opening balance + all ledger movements before the From date (movements ON the From date belong to the period).
        Closing Balance = Opening + the period's ledger movement. Opening, Receipts and Closing are the customer's full ledger figures (they do not change with the Company filter);
        Sales, Discount and Returns follow the filters. Net = Sales − Discount − Sales Return − Sales Return Expiry.
      </div>
    </div>
  )
}
