/**
 * StockSummaryPage.tsx — Stock & Sales Summary.
 *
 * Every number on this page is computed on the server (GET /stock-register/summary) from the
 * same movement rules as the Stock Register; this page only filters, sorts, pages and displays.
 * Filters are held as a DRAFT until "Apply Filters" so editing a field never fires a request;
 * sorting and paging re-query with the last APPLIED filters. Export and Print use the applied
 * filters too (never the unapplied draft).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3, Download, Printer, RotateCcw, Filter, Package, PackageX, AlertTriangle, ArrowUp, ArrowDown,
  ArrowUpDown, DollarSign, ShoppingCart, ShoppingBag, Boxes, TrendingUp,
} from 'lucide-react'
import {
  stockSummaryAPI, stockRegisterAPI, partiesAPI,
  type StockSummaryParams, type StockSummaryReport, type StockSummaryRow, type StockBatchRow, type StockRegisterReport,
} from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, StatCard, Pagination, SkeletonRows, Empty, Alert, Modal, Tabs, Badge } from '@/components/ui'
import { DateRangeFilter } from '@/components/ui/DateRangePopup'
import DateSystemInput from '@/components/shared/DateSystemInput'
import { fmt } from '@/utils'
import { formatDisplayDate } from '@/utils/dateSystem'

const LIMIT = 50
const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const num = (n: number | undefined, dp = 2) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dp })
const dash = (n: number | undefined) => (Number(n) ? num(n) : '–')

interface Filters {
  from: string; to: string; company: string; category: string; supplier_id: string; search: string
  stock_status: 'all' | 'in_stock' | 'low' | 'zero'
  include_inactive: boolean; include_discount: boolean
}
const defaultFilters = (): Filters => ({
  from: daysAgoISO(30), to: todayISO(), company: '', category: '', supplier_id: '', search: '',
  stock_status: 'all', include_inactive: false, include_discount: true,
})

/** Only send what the user actually set — empty strings never reach the API. */
function toParams(f: Filters): StockSummaryParams {
  const p: StockSummaryParams = { from: f.from, to: f.to, stock_status: f.stock_status, include_inactive: f.include_inactive, include_discount: f.include_discount }
  if (f.company) p.company = f.company
  if (f.category) p.category = f.category
  if (f.supplier_id) p.supplier_id = f.supplier_id
  if (f.search.trim()) p.search = f.search.trim()
  return p
}

const TY_LABEL: Record<string, string> = {
  PU: 'Purchase', SL: 'Sale', RV: 'Stock Receipt', SRN: 'Sales Return', PRN: 'Purchase Return', ADJ: 'Adjustment / Opening',
}

type SortKey = 'name' | 'code' | 'opening' | 'purchased' | 'sold' | 'closing' | 'rate' | 'stock_value' | 'sales_value'
const COLS: { label: string; key?: SortKey; right?: boolean; title?: string }[] = [
  { label: 'Code', key: 'code' },
  { label: 'Product', key: 'name' },
  { label: 'Unit' },
  { label: 'Opening', key: 'opening', right: true, title: 'Stock before the From date' },
  { label: 'Purchased', key: 'purchased', right: true, title: 'Purchased quantity (paid qty) in the period' },
  { label: 'Receipts', right: true, title: 'Stock receipts (Receive page) in the period' },
  { label: 'Free (Pur.)', right: true, title: 'Bonus received on purchases — adds to stock' },
  { label: 'Pur. Returns', right: true, title: 'Returned to suppliers — reduces stock' },
  { label: 'Sold', key: 'sold', right: true, title: 'Sold quantity in the period' },
  { label: 'Free (Sale)', right: true, title: 'Bonus given on sales — shown for reference, does not change stock' },
  { label: 'Sales Returns', right: true, title: 'Returned by customers — adds to stock' },
  { label: 'Adjust.', right: true, title: 'Opening-stock entries and stock adjustments' },
  { label: 'Closing', key: 'closing', right: true, title: 'Stock on the To date' },
  { label: 'Latest Pur. Rate', key: 'rate', right: true, title: 'Most recent purchase/receipt rate on or before the To date' },
  { label: 'Stock Value', key: 'stock_value', right: true, title: 'Closing × latest purchase rate as of the To date' },
  { label: 'Sales Value', key: 'sales_value', right: true, title: 'Sales in the period (net of discount unless "Include discount" is off)' },
]

export default function StockSummaryPage() {
  const { error: toastError, success: toastSuccess, dateMode } = useUIStore()

  // draft = what the form shows; applied = what the report was last run with.
  const [draft, setDraft]     = useState<Filters>(defaultFilters)
  const [applied, setApplied] = useState<Filters>(defaultFilters)
  const [sortBy, setSortBy]   = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage]       = useState(1)

  const [report, setReport]   = useState<StockSummaryReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [busy, setBusy]       = useState<'csv' | 'print' | null>(null)
  const seq = useRef(0)

  const [companies, setCompanies]   = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [suppliers, setSuppliers]   = useState<{ id: string; name: string }[]>([])

  const [detail, setDetail] = useState<StockSummaryRow | null>(null)

  useEffect(() => {
    stockSummaryAPI.filters().then(r => { setCompanies(r.data.data?.companies || []); setCategories(r.data.data?.categories || []) }).catch(() => {})
    partiesAPI.suppliers({ limit: 500 }).then(r => setSuppliers(((r.data.data as any[]) || []).map(s => ({ id: s.id, name: s.name })))).catch(() => {})
  }, [])

  const draftDateError = useMemo(() => {
    if (!draft.from || !draft.to) return 'Select both From and To dates'
    if (draft.from > draft.to) return 'From date cannot be after To date'
    return null
  }, [draft])

  const query = useCallback((f: Filters, extra: Partial<StockSummaryParams> = {}): StockSummaryParams =>
    ({ ...toParams(f), sort_by: sortBy, sort_dir: sortDir, ...extra }), [sortBy, sortDir])

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true); setErr(null)
    try {
      const r = await stockSummaryAPI.get(query(applied, { page, limit: LIMIT }))
      if (mine !== seq.current) return
      setReport(r.data.data as StockSummaryReport)
    } catch (e: any) {
      if (mine !== seq.current) return
      setReport(null); setErr(e?.response?.data?.message || e?.message || 'Failed to load the report')
    } finally { if (mine === seq.current) setLoading(false) }
  }, [applied, page, query])

  useEffect(() => { void load() }, [load])

  const applyFilters = () => { if (draftDateError) return; setPage(1); setApplied({ ...draft }) }
  const resetFilters = () => { const d = defaultFilters(); setDraft(d); setApplied(d); setPage(1); setSortBy('name'); setSortDir('asc') }
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft(d => ({ ...d, [k]: v }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)

  const sortOn = (k: SortKey) => {
    if (k === sortBy) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(k); setSortDir(k === 'name' || k === 'code' ? 'asc' : 'desc') }
    setPage(1)
  }

  // ── export / print — both use the APPLIED filters and the current sort ───────────────────
  const exportCsv = async () => {
    setBusy('csv')
    try {
      const r = await stockSummaryAPI.exportCsv(query(applied))
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = `stock-sales-summary-${applied.from}_to_${applied.to}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toastSuccess('Exported', 'Stock & Sales Summary CSV downloaded (opens in Excel)')
    } catch (e: any) { toastError('Export failed', e?.response?.data?.message || e?.message) }
    finally { setBusy(null) }
  }

  const printReport = async () => {
    setBusy('print')
    try {
      const r = await stockSummaryAPI.get(query(applied, { all: true }))
      const rep = r.data.data as StockSummaryReport
      const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
      const d = (iso: string) => formatDisplayDate(iso, dateMode)
      const t = rep.totals
      const tags = [
        applied.company && `Company: ${applied.company}`, applied.category && `Category: ${applied.category}`,
        applied.search && `Search: ${applied.search}`, applied.supplier_id && `Supplier: ${suppliers.find(s => s.id === applied.supplier_id)?.name ?? ''}`,
        applied.stock_status !== 'all' && `Stock: ${applied.stock_status.replace('_', ' ')}`,
        applied.include_inactive && 'Inactive included', `Sales value ${applied.include_discount ? 'net of discount' : 'before discount'}`,
      ].filter(Boolean).join(' · ')
      const body = rep.rows.map(x => `<tr><td>${esc(x.item_code)}</td><td>${esc(x.name)}</td><td>${esc(x.unit)}</td>
        <td class="n">${num(x.opening)}</td><td class="n">${num(x.purchased)}</td><td class="n">${num(x.received)}</td><td class="n">${num(x.free_in)}</td>
        <td class="n">${num(x.purchase_returns)}</td><td class="n">${num(x.sold)}</td><td class="n">${num(x.free_out)}</td><td class="n">${num(x.sales_returns)}</td>
        <td class="n">${num(x.adjustments)}</td><td class="n b">${num(x.closing)}</td><td class="n">${num(x.rate)}</td>
        <td class="n">${num(x.stock_value)}</td><td class="n">${num(x.sales_value)}</td></tr>`).join('')
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stock &amp; Sales Summary</title><style>
        body{font:10px Arial,sans-serif;margin:12mm 8mm;color:#000}h1{font-size:15px;margin:0 0 2px}.meta{margin:0 0 8px;color:#333}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:2px 4px;text-align:left}th{background:#eee}
        .n{text-align:right;font-variant-numeric:tabular-nums}.b{font-weight:bold}tfoot td{font-weight:bold;background:#f3f3f3}
        .kpi{margin:6px 0 8px}.kpi span{display:inline-block;margin-right:14px}@media print{@page{size:landscape;margin:8mm}}</style></head><body>
        <h1>Stock &amp; Sales Summary</h1>
        <p class="meta">Period: <b>${esc(d(applied.from))}</b> to <b>${esc(d(applied.to))}</b>${tags ? `<br>${esc(tags)}` : ''}</p>
        <div class="kpi"><span>Products: <b>${t.total_products}</b></span><span>Low stock: <b>${t.low_stock_count}</b></span><span>Out of stock: <b>${t.out_of_stock_count}</b></span>
        <span>Sales value: <b>${fmt(t.sales_value)}</b></span><span>Stock value: <b>${fmt(t.stock_value)}</b></span><span>Purchase value: <b>${fmt(t.purchase_value)}</b></span></div>
        <table><thead><tr><th>Code</th><th>Product</th><th>Unit</th><th>Opening</th><th>Purchased</th><th>Receipts</th><th>Free (Pur.)</th><th>Pur. Ret.</th><th>Sold</th><th>Free (Sale)</th><th>Sales Ret.</th><th>Adjust.</th><th>Closing</th><th>Latest Rate</th><th>Stock Value</th><th>Sales Value</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="3">Total (${t.total_products})</td><td class="n">${num(t.opening)}</td><td class="n">${num(t.purchased)}</td><td class="n">${num(t.received)}</td><td class="n">${num(t.free_in)}</td><td class="n">${num(t.purchase_returns)}</td><td class="n">${num(t.sold)}</td><td class="n">${num(t.free_out)}</td><td class="n">${num(t.sales_returns)}</td><td class="n">${num(t.adjustments)}</td><td class="n">${num(t.closing)}</td><td></td><td class="n">${num(t.stock_value)}</td><td class="n">${num(t.sales_value)}</td></tr></tfoot></table>
        <script>window.onload=function(){window.print()}</script></body></html>`
      const w = window.open('', '_blank', 'width=1200,height=800')
      if (!w) { toastError('Pop-up blocked', 'Allow pop-ups to print the report'); return }
      w.document.open(); w.document.write(html); w.document.close()
    } catch (e: any) { toastError('Print failed', e?.response?.data?.message || e?.message) }
    finally { setBusy(null) }
  }

  const t = report?.totals
  const rows = report?.rows || []
  const filterTitle = 'text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Inventory</div>
          <h1 className="page-title">Stock &amp; Sales Summary</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" icon={<Printer size={14}/>} onClick={printReport} disabled={!report || loading || busy !== null}>
            {busy === 'print' ? 'Preparing…' : 'Print'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Download size={14}/>} onClick={exportCsv} disabled={!report || loading || busy !== null}>
            {busy === 'csv' ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="table-card mb-4" style={{ padding: 16 }}>
        <form onSubmit={e => { e.preventDefault(); applyFilters() }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={filterTitle}>Date Range</span>
              <DateRangeFilter fromAD={draft.from} toAD={draft.to} onApply={r => setDraft(d => ({ ...d, from: r.fromAD, to: r.toAD }))} />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={filterTitle}>Company / Manufacturer</span>
              <select className="erp-input" value={draft.company} onChange={e => set('company', e.target.value)}>
                <option value="">All companies</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={filterTitle}>Category</span>
              <select className="erp-input" value={draft.category} onChange={e => set('category', e.target.value)}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={filterTitle} title="Only products this supplier has supplied (non-cancelled purchases up to the To date)">Supplier</span>
              <select className="erp-input" value={draft.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={filterTitle}>Product (name, code or barcode)</span>
              <input className="erp-input" placeholder="Search product…" value={draft.search} onChange={e => set('search', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={filterTitle}>Stock Level (at To date)</span>
              <select className="erp-input" value={draft.stock_status} onChange={e => set('stock_status', e.target.value as Filters['stock_status'])}>
                <option value="all">All</option>
                <option value="in_stock">In stock (closing &gt; 0)</option>
                <option value="low">Low stock (below minimum)</option>
                <option value="zero">Zero / out of stock</option>
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer">
                <input type="checkbox" checked={draft.include_inactive} onChange={e => set('include_inactive', e.target.checked)} />
                Include inactive products
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer" title="On: sales value is net of line discounts (as invoiced). Off: value before discount.">
                <input type="checkbox" checked={draft.include_discount} onChange={e => set('include_discount', e.target.checked)} />
                Include sales discount (sales value net of discount)
              </label>
            </div>
          </div>

          {draftDateError && <div className="mt-3"><Alert type="danger" message={draftDateError} /></div>}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button type="submit" variant="primary" size="sm" icon={<Filter size={14}/>} disabled={!!draftDateError}>Apply Filters</Button>
            <Button type="button" variant="secondary" size="sm" icon={<RotateCcw size={14}/>} onClick={resetFilters}>Reset</Button>
            {dirty && !draftDateError && <span className="text-xs text-amber-600">Filters changed — click Apply Filters to update the report.</span>}
          </div>
        </form>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1"><Alert type="danger" message={err} /></div>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {/* ── Totals (server-computed over ALL filtered products) ─────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total Products"    value={t ? String(t.total_products) : '–'}  color="var(--teal)"   icon={<Package size={20} strokeWidth={1.8}/>} />
        <StatCard label="Opening Stock"     value={t ? num(t.opening) : '–'}           color="var(--brand)"  icon={<Boxes size={20} strokeWidth={1.8}/>} sub="Units before From date" />
        <StatCard label="Purchased Qty"     value={t ? num(t.purchased) : '–'}         color="var(--blue, var(--brand))" icon={<ShoppingBag size={20} strokeWidth={1.8}/>} sub={t ? `+ ${num(t.free_in)} free, ${num(t.received)} receipts` : undefined} />
        <StatCard label="Sold Qty"          value={t ? num(t.sold) : '–'}              color="var(--green, var(--brand))" icon={<ShoppingCart size={20} strokeWidth={1.8}/>} sub={t ? `${num(t.sales_returns)} returned` : undefined} />
        <StatCard label="Closing Stock"     value={t ? num(t.closing) : '–'}           color="var(--purple)" icon={<Boxes size={20} strokeWidth={1.8}/>} sub="Units on To date" />
        <StatCard label="Total Sales Value" value={t ? fmt(t.sales_value) : '–'}       color="var(--green, var(--brand))" icon={<TrendingUp size={20} strokeWidth={1.8}/>} sub={t ? `Net of returns ${fmt(t.net_sales_value)}` : undefined} />
        <StatCard label="Total Stock Value" value={t ? fmt(t.stock_value) : '–'}       color="var(--purple)" icon={<DollarSign size={20} strokeWidth={1.8}/>} sub="Closing × latest purchase rate" />
        <StatCard label="Total Purchase Value" value={t ? fmt(t.purchase_value) : '–'} color="var(--blue, var(--brand))" icon={<DollarSign size={20} strokeWidth={1.8}/>} sub="Purchases in period" />
        <StatCard label="Low-stock Products"   value={t ? String(t.low_stock_count) : '–'} color="var(--amber, #d97706)" icon={<AlertTriangle size={20} strokeWidth={1.8}/>} sub="0 < closing < minimum" />
        <StatCard label="Out-of-stock Products" value={t ? String(t.out_of_stock_count) : '–'} color="var(--red)" icon={<PackageX size={20} strokeWidth={1.8}/>} sub="Closing ≤ 0" />
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.label} className={c.right ? 'td-right' : ''} title={c.title}
                    style={c.key ? { cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' } : { whiteSpace: 'nowrap' }}
                    onClick={c.key ? () => sortOn(c.key!) : undefined}
                    aria-sort={c.key && c.key === sortBy ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.label}
                    {c.key && (c.key === sortBy
                      ? (sortDir === 'asc' ? <ArrowUp size={11} style={{ display: 'inline', marginLeft: 3 }}/> : <ArrowDown size={11} style={{ display: 'inline', marginLeft: 3 }}/>)
                      : <ArrowUpDown size={11} style={{ display: 'inline', marginLeft: 3, opacity: .3 }}/>)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows cols={COLS.length} rows={8} /> : rows.length ? rows.map(r => (
                <tr key={r.id} className="clickable" onClick={() => setDetail(r)} title="Click to view stock movements">
                  <td className="td-mono">{r.item_code}</td>
                  <td>
                    <span className="font-medium">{r.name}</span>
                    {!r.is_active && <span className="ml-2 text-[10px] text-[var(--text-4)]">(inactive)</span>}
                    {r.status === 'low' && <span className="ml-2"><Badge className="badge-amber">Low</Badge></span>}
                    {r.status === 'out' && <span className="ml-2"><Badge className="badge-red">Out</Badge></span>}
                  </td>
                  <td>{r.unit}</td>
                  <td className="td-right">{num(r.opening)}</td>
                  <td className="td-right">{dash(r.purchased)}</td>
                  <td className="td-right">{dash(r.received)}</td>
                  <td className="td-right">{dash(r.free_in)}</td>
                  <td className="td-right">{dash(r.purchase_returns)}</td>
                  <td className="td-right">{dash(r.sold)}</td>
                  <td className="td-right">{dash(r.free_out)}</td>
                  <td className="td-right">{dash(r.sales_returns)}</td>
                  <td className="td-right">{dash(r.adjustments)}</td>
                  <td className="td-right font-semibold">{num(r.closing)}</td>
                  <td className="td-right">{r.rate ? fmt(r.rate) : '–'}</td>
                  <td className="td-right">{fmt(r.stock_value)}</td>
                  <td className="td-right">{fmt(r.sales_value)}</td>
                </tr>
              )) : (
                <tr><td colSpan={COLS.length}><Empty message={err ? 'Could not load the report' : 'No products match these filters for the selected period'} /></td></tr>
              )}
            </tbody>
            {!loading && rows.length > 0 && t && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="font-bold">Total — all {t.total_products} filtered products</td>
                  <td className="td-right font-bold">{num(t.opening)}</td>
                  <td className="td-right font-bold">{num(t.purchased)}</td>
                  <td className="td-right font-bold">{num(t.received)}</td>
                  <td className="td-right font-bold">{num(t.free_in)}</td>
                  <td className="td-right font-bold">{num(t.purchase_returns)}</td>
                  <td className="td-right font-bold">{num(t.sold)}</td>
                  <td className="td-right font-bold">{num(t.free_out)}</td>
                  <td className="td-right font-bold">{num(t.sales_returns)}</td>
                  <td className="td-right font-bold">{num(t.adjustments)}</td>
                  <td className="td-right font-bold">{num(t.closing)}</td>
                  <td />
                  <td className="td-right font-bold">{fmt(t.stock_value)}</td>
                  <td className="td-right font-bold">{fmt(t.sales_value)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Pagination page={page} total={report?.pagination.total || 0} limit={LIMIT} onChange={setPage} />
      </div>

      <p className="text-[11px] text-[var(--text-4)] mt-3 leading-relaxed">
        Closing = Opening + Purchased + Free (Pur.) + Receipts + Sales Returns + Adjustments − Purchase Returns − Sold. Cancelled
        purchases and sales are excluded. Free (Sale) is shown for reference only. Stock Value uses the latest purchase rate on or before
        the To date (no historical cost snapshots are stored).
      </p>

      <MovementModal row={detail} filters={applied} onClose={() => setDetail(null)} dateMode={dateMode} />
    </div>
  )
}

/* ── Row drill-down: movements (with running balance) + per-batch breakdown ───────────────── */
function MovementModal({ row, filters, onClose, dateMode }: { row: StockSummaryRow | null; filters: Filters; onClose: () => void; dateMode: any }) {
  const [tab, setTab] = useState<'moves' | 'batches'>('moves')
  const [reg, setReg] = useState<StockRegisterReport | null>(null)
  const [batches, setBatches] = useState<StockBatchRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!row) return
    let live = true
    setTab('moves'); setReg(null); setBatches(null); setErr(null); setLoading(true)
    const common = { from: filters.from, to: filters.to }
    Promise.all([
      stockRegisterAPI.get({ product_id: row.id, ...common }),
      stockSummaryAPI.batches({ product_id: row.id, ...common }),
    ]).then(([a, b]) => { if (live) { setReg(a.data.data as StockRegisterReport); setBatches(b.data.data as StockBatchRow[]) } })
      .catch((e: any) => { if (live) setErr(e?.response?.data?.message || e?.message || 'Failed to load movements') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [row, filters])

  return (
    <Modal open={!!row} onClose={onClose} size="xl"
      title={row ? `${row.item_code ? row.item_code + ' — ' : ''}${row.name}` : ''}>
      {row && (
        <div>
          <p className="text-xs text-[var(--text-3)] mb-3">
            {formatDisplayDate(filters.from, dateMode)} to {formatDisplayDate(filters.to, dateMode)}
            {' · '}Opening <b>{num(row.opening)}</b> · Closing <b>{num(row.closing)}</b>
          </p>
          <Tabs tabs={[{ id: 'moves', label: 'Movements' }, { id: 'batches', label: 'Batches' }]} active={tab} onChange={id => setTab(id as 'moves' | 'batches')} />
          {err && <Alert type="danger" message={err} />}
          <div className="table-card overflow-x-auto mt-3" style={{ maxHeight: '55vh' }}>
            {tab === 'moves' ? (
              <table className="erp-table">
                <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Batch</th><th className="td-right">Qty In</th><th className="td-right">Qty Out</th><th className="td-right">Balance</th></tr></thead>
                <tbody>
                  {loading ? <SkeletonRows cols={7} rows={5} /> : reg ? (
                    <>
                      <tr><td colSpan={6} className="italic text-[var(--text-3)]">Opening balance</td><td className="td-right font-semibold">{num(reg.opening_balance)}</td></tr>
                      {reg.rows.length === 0 && <tr><td colSpan={7}><Empty message="No stock movements in this period" /></td></tr>}
                      {reg.rows.map(m => {
                        const qin = m.qty_in + (m.free_effect ? m.qty_free : 0)
                        return (
                          <tr key={m.key}>
                            <td className="td-mono">{formatDisplayDate(m.date, dateMode)}</td>
                            <td>{TY_LABEL[m.ty] || m.ty}{m.qty_free > 0 && <span className="text-[10px] text-[var(--text-4)]"> {m.free_effect ? `(incl. ${num(m.qty_free)} free)` : `(${num(m.qty_free)} free, no stock effect)`}</span>}</td>
                            <td className="td-mono">{m.inv_no || '—'}</td>
                            <td className="td-mono">{m.batch || '—'}</td>
                            <td className="td-right">{qin ? num(qin) : ''}</td>
                            <td className="td-right">{m.qty_out ? num(m.qty_out) : ''}</td>
                            <td className="td-right font-semibold">{num(m.balance)}</td>
                          </tr>
                        )
                      })}
                    </>
                  ) : null}
                </tbody>
              </table>
            ) : (
              <table className="erp-table">
                <thead><tr><th>Batch</th><th>Expiry</th><th className="td-right">Opening</th><th className="td-right">In</th><th className="td-right">Out</th><th className="td-right">Closing</th></tr></thead>
                <tbody>
                  {loading ? <SkeletonRows cols={6} rows={4} /> : batches && batches.length ? batches.map(b => (
                    <tr key={b.batch_no + b.expiry}>
                      <td className="td-mono">{b.batch_no}</td><td className="td-mono">{b.expiry || '—'}</td>
                      <td className="td-right">{num(b.opening)}</td><td className="td-right">{num(b.qty_in)}</td>
                      <td className="td-right">{num(b.qty_out)}</td><td className="td-right font-semibold">{num(b.closing)}</td>
                    </tr>
                  )) : <tr><td colSpan={6}><Empty message="No batch movements" /></td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
