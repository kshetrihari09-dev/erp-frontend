import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Download, LogOut, Search, Loader2, FileBarChart, RefreshCw } from 'lucide-react'
import { customerCompanyAPI, type CustomerCompanyReport, type CustomerLookup } from '@/services/api'
import { useDebounce } from '@/hooks/useDebounce'
import useUIStore from '@/store/uiStore'
import { formatDisplayDate } from '@/utils/dateSystem'
import { PATHS } from '@/constants'
import { DateRangeFilter, type DateRangeApply } from '@/components/ui/DateRangePopup'

/* Customer vs Company — pick ONE customer; rows are the companies (manufacturers) they
   bought from / returned to in the selected range. All maths is done by
   GET /reports/customer-vs-company; this page only displays the result. */

const todayISO = () => new Date().toISOString().slice(0, 10)
const monthStartISO = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10) }
const money = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const label = (c: CustomerLookup) => (c.code ? `${c.code} — ${c.name}` : c.name)

export default function CustomerCompanyReportPage() {
  const navigate = useNavigate()
  const { error: toastError, success: toastSuccess, dateMode } = useUIStore()

  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo]     = useState(todayISO())
  const [customer, setCustomer] = useState<CustomerLookup | null>(null)

  // searchable customer picker
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<CustomerLookup[]>([])
  const [optLoading, setOptLoading] = useState(false)
  const [hl, setHl] = useState(0)
  const debounced = useDebounce(text, 300)
  const box = useRef<HTMLDivElement>(null)

  const [report, setReport]   = useState<CustomerCompanyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [selKey, setSelKey]   = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    let live = true
    setOptLoading(true)
    customerCompanyAPI.customers(debounced.trim() === (customer ? label(customer) : '') ? '' : debounced.trim())
      .then(r => { if (live) { setOptions(r.data.data || []); setHl(0) } })
      .catch(() => { if (live) setOptions([]) })
      .finally(() => { if (live) setOptLoading(false) })
    return () => { live = false }
  }, [debounced, open, customer])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const dateError = !from || !to ? 'Select both From and To dates' : from > to ? 'From date cannot be after To date' : null

  const run = useCallback(async (c: CustomerLookup | null, f: string, t: string) => {
    if (!c) return
    const my = ++seq.current
    setLoading(true); setErr(null)
    try {
      const r = await customerCompanyAPI.get({ customer_id: c.id, from: f, to: t })
      if (my !== seq.current) return
      setReport(r.data.data as CustomerCompanyReport); setSelKey(null)
    } catch (e: any) {
      if (my !== seq.current) return
      setReport(null); setErr(e?.response?.data?.message || e?.message || 'Failed to load report')
    } finally { if (my === seq.current) setLoading(false) }
  }, [])

  const pick = (c: CustomerLookup) => {
    setCustomer(c); setText(label(c)); setOpen(false)
    if (!dateError) void run(c, from, to)                       // choosing a customer shows the report straight away
  }

  const generate = () => {
    if (!customer) { toastError('Select a customer', 'Choose a customer to see the company-wise report'); return }
    if (dateError) { toastError('Invalid date range', dateError); return }
    void run(customer, from, to)
  }

  // "Set" in the Date Range popup: store the validated AD range and refresh with it
  const applyRange = useCallback(async (r: DateRangeApply) => {
    setFrom(r.fromAD); setTo(r.toAD)
    await run(customer, r.fromAD, r.toAD)
  }, [run, customer])

  const exit = () => (window.history.length > 1 ? navigate(-1) : navigate(PATHS.REPORTS))
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !open) exit() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const exportCsv = async () => {
    if (!report) return
    try {
      const r = await customerCompanyAPI.exportCsv({ customer_id: report.customer.id, from: report.filters.from, to: report.filters.to })
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url
      a.download = `customer-vs-company-${(report.customer.code || report.customer.name).replace(/[^\w.-]+/g, '_')}_${report.filters.from}_${report.filters.to}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toastSuccess('Exported', 'Customer vs Company CSV downloaded')
    } catch (e: any) { toastError('Export failed', e?.response?.data?.message || e?.message) }
  }

  const printReport = () => {
    if (!report) return
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
    const f = report.filters, t = report.totals, l = report.ledger
    const rows = report.rows.map(r => `<tr><td>${esc(r.company)}</td><td class="n">${money(r.sales)}</td><td class="n">${money(r.discount)}</td><td class="n">${money(r.sales_return)}</td><td class="n">${money(r.sales_return_expiry)}</td><td class="n b">${money(r.net)}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Customer vs Company</title><style>
      body{font:11px Arial,sans-serif;margin:14mm 10mm;color:#000}h1{font-size:15px;margin:0 0 2px}.meta{margin:0 0 8px;color:#333}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:2px 5px;text-align:left}th{background:#eee}
      .n{text-align:right;font-variant-numeric:tabular-nums}.b{font-weight:bold}tfoot td{font-weight:bold;background:#f3f3f3}
      @media print{@page{size:portrait;margin:8mm}}</style></head><body>
      <h1>Customer vs Company</h1>
      <p class="meta"><b>${esc(report.customer.code)}</b> — ${esc(report.customer.name)}<br>
      Period: ${esc(formatDisplayDate(f.from, dateMode))} to ${esc(formatDisplayDate(f.to, dateMode))}
      &nbsp;|&nbsp; Opening Balance: ${money(l.opening_balance)} &nbsp;|&nbsp; Receipts: ${money(l.receipts)} &nbsp;|&nbsp; Closing Balance: ${money(l.closing_balance)}</p>
      <table><thead><tr><th>Company</th><th>Sales</th><th>Discount</th><th>Sales Return</th><th>Sales Return Expiry</th><th>Net</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td class="n">${money(t.sales)}</td><td class="n">${money(t.discount)}</td><td class="n">${money(t.sales_return)}</td><td class="n">${money(t.sales_return_expiry)}</td><td class="n">${money(t.net)}</td></tr></tfoot></table>
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
        <div><div className="page-breadcrumb">Reports</div><h1 className="page-title">Customer vs Company</h1></div>
      </div>

      <div className="sr-filters">
        <div className="sr-actions" style={{ marginLeft: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={loading}><RefreshCw size={14} /> Report</button>
          <button className="btn btn-secondary btn-sm" onClick={exit}><LogOut size={14} /> Exit</button>
        </div>

        <div className="sr-f sr-f-name" ref={box}>
          <span>Customer</span>
          <div className="sr-combo">
            <Search size={13} className="sr-combo-ic" />
            <input className="erp-input" value={text} placeholder="Search customer by code or name…" aria-label="Customer"
              onFocus={() => setOpen(true)}
              onChange={e => { setText(e.target.value); setOpen(true); if (customer) { setCustomer(null); setReport(null) } }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(options.length - 1, h + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(0, h - 1)) }
                else if (e.key === 'Enter' && open && options[hl]) { e.preventDefault(); pick(options[hl]) }
                else if (e.key === 'Escape') setOpen(false)
              }} />
            {optLoading && <Loader2 size={13} className="sr-combo-spin" />}
            {open && (
              <ul className="sr-combo-list">
                {!optLoading && options.length === 0 && <li className="sr-combo-empty">No customers found</li>}
                {options.map((c, i) => (
                  <li key={c.id} className={i === hl ? 'on' : ''} onMouseEnter={() => setHl(i)} onMouseDown={e => { e.preventDefault(); pick(c) }}>
                    <span className="sr-combo-code">{c.code}</span><span>{c.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="sr-f">
          <span>Date Range</span>
          <DateRangeFilter fromAD={from} toAD={to} onApply={applyRange} />
        </div>

        <div className="sr-actions">
          <button className="btn btn-secondary btn-sm" onClick={printReport} disabled={!report || loading}><Printer size={14} /> Print</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!report || loading}><Download size={14} /> CSV</button>
        </div>
      </div>

      {dateError && <div className="sr-msg sr-msg-warn">{dateError}</div>}

      <div className="sr-sheet-wrap">
        <div className="sr-scroll">
          <table className="sr-table" style={{ minWidth: 760 }}>
            <thead><tr>
              <th>Company</th>
              <th className="sr-num">Sales</th><th className="sr-num">Discount</th><th className="sr-num">Sales Return</th>
              <th className="sr-num">Sales Return Expiry</th><th className="sr-num">Net</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.company} className={`sr-row ${selKey === r.company ? 'sel' : ''}`} onClick={() => setSelKey(r.company)}>
                  <td className="sr-c-part" style={{ maxWidth: 360 }}>{r.company}</td>
                  <td className="sr-num">{money(r.sales)}</td><td className="sr-num">{money(r.discount)}</td>
                  <td className="sr-num">{money(r.sales_return)}</td><td className="sr-num">{money(r.sales_return_expiry)}</td>
                  <td className="sr-num sr-bal">{money(r.net)}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={6} className="sr-state"><Loader2 size={16} className="sr-spin" /> Loading report…</td></tr>}
              {!loading && err && <tr><td colSpan={6} className="sr-state sr-state-err">{err} <button className="btn btn-secondary btn-sm" onClick={generate}>Retry</button></td></tr>}
              {!loading && !err && !customer && !report && <tr><td colSpan={6} className="sr-state"><FileBarChart size={18} /> Select a customer to see the companies they bought from.</td></tr>}
              {!loading && !err && report && rows.length === 0 && <tr><td colSpan={6} className="sr-state"><FileBarChart size={18} /> No sales or returns for this customer in the selected range.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sr-foot">
          <div className="sr-foot-info">
            {report ? <><b>{report.customer.code}</b> · {report.customer.name} · {rows.length} compan{rows.length === 1 ? 'y' : 'ies'}
              <span title="The customer's ledger position for the same period, across all companies"> · Opening {money(report.ledger.opening_balance)} · Receipts {money(report.ledger.receipts)} · Closing {money(report.ledger.closing_balance)}</span></> : '—'}
          </div>
          <div className="sr-foot-tot">
            <span>Total</span>
            <span className="sr-num">Sales <b>{money(t?.sales ?? 0)}</b></span>
            <span className="sr-num">Discount <b>{money(t?.discount ?? 0)}</b></span>
            <span className="sr-num">Sales Return <b>{money(t?.sales_return ?? 0)}</b></span>
            <span className="sr-num">Return Expiry <b>{money(t?.sales_return_expiry ?? 0)}</b></span>
            <span className="sr-num sr-foot-bal">Net <b>{money(t?.net ?? 0)}</b></span>
          </div>
        </div>
      </div>
      <div className="sr-legend">Sales are shown before discount. Net = Sales − Discount − Sales Return − Sales Return Expiry. Opening / Receipts / Closing in the footer are the customer's full ledger figures (all companies). Products without a company appear as “No Company”.</div>
    </div>
  )
}
