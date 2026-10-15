import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Download, LogOut, Search, Loader2, ClipboardList } from 'lucide-react'
import { productsAPI, stockRegisterAPI, type StockRegisterReport, type StockRegisterRow } from '@/services/api'
import { useDebounce } from '@/hooks/useDebounce'
import useUIStore from '@/store/uiStore'
import { formatDisplayDate } from '@/utils/dateSystem'
import { PATHS } from '@/constants'
import { DateRangeFilter } from '@/components/ui/DateRangePopup'

/* Stock Register — compact, spreadsheet-style, one product at a time.
   All figures come from GET /stock-register (server computes the opening
   balance and every running balance); this page only displays them. */

type ProductOpt = { id: string; item_code: string; name: string; unit?: string }

const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const num = (n: number, dp = 2) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dp })
const money = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const blankIfZero = (n: number, f: (x: number) => string = num) => (Number(n) ? f(n) : '')

const TY_LABEL: Record<string, string> = {
  PU: 'Purchase', SL: 'Sale', RV: 'Stock Receipt', SRN: 'Sales Return', PRN: 'Purchase Return', ADJ: 'Adjustment / Opening',
}

const COLS: { key: string; label: string; cls: string }[] = [
  { key: 'date', label: 'Date', cls: 'sr-c-date' }, { key: 'inv_no', label: 'Inv No.', cls: 'sr-c-inv' },
  { key: 'batch', label: 'Batch', cls: 'sr-c-batch' }, { key: 'particular', label: 'Particular', cls: 'sr-c-part' },
  { key: 'narration', label: 'Narration', cls: 'sr-c-narr' }, { key: 'ty', label: 'Ty', cls: 'sr-c-ty' },
  { key: 'in', label: 'In', cls: 'sr-num' }, { key: 'out', label: 'Out', cls: 'sr-num' },
  { key: 'bal', label: 'Bal', cls: 'sr-num' }, { key: 'free', label: 'Free', cls: 'sr-num' },
  { key: 'rate', label: 'Rate', cls: 'sr-num' }, { key: 'store', label: 'Store', cls: 'sr-c-store' },
  { key: 'mrp', label: 'MRP', cls: 'sr-num' }, { key: 'expiry', label: 'Expiry', cls: 'sr-c-exp' },
]

export default function StockRegisterPage() {
  const navigate = useNavigate()
  const { error: toastError, success: toastSuccess, dateMode } = useUIStore()

  // ── filters ────────────────────────────────────────────────────────────────
  const [product, setProduct]   = useState<ProductOpt | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [from, setFrom]         = useState(daysAgoISO(90))
  const [to, setTo]             = useState(todayISO())
  const [store, setStore]       = useState('all')
  const [stores, setStores]     = useState<{ id: string; name: string }[]>([])
  const [includeAdj, setIncludeAdj] = useState(true)

  // ── product dropdown ───────────────────────────────────────────────────────
  const [open, setOpen]         = useState(false)
  const [options, setOptions]   = useState<ProductOpt[]>([])
  const [optLoading, setOptLoading] = useState(false)
  const [hl, setHl]             = useState(0)
  const debouncedName = useDebounce(nameInput, 300)
  const nameBoxRef = useRef<HTMLDivElement>(null)

  // ── report ─────────────────────────────────────────────────────────────────
  const [report, setReport]     = useState<StockRegisterReport | null>(null)
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [selKey, setSelKey]     = useState<string | null>(null)
  const loadSeq = useRef(0)

  useEffect(() => { stockRegisterAPI.stores().then(r => setStores(r.data.data || [])).catch(() => {}) }, [])

  // product search (only while the dropdown is open and user is typing)
  useEffect(() => {
    if (!open) return
    let live = true
    setOptLoading(true)
    productsAPI.list({ search: debouncedName || undefined, limit: 20 })
      .then(r => { if (live) { setOptions(((r.data.data as any[]) || []).map(p => ({ id: p.id, item_code: p.item_code, name: p.name, unit: p.unit }))); setHl(0) } })
      .catch(() => { if (live) setOptions([]) })
      .finally(() => { if (live) setOptLoading(false) })
    return () => { live = false }
  }, [debouncedName, open])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = (p: ProductOpt) => {
    setProduct(p); setCodeInput(p.item_code || ''); setNameInput(p.name); setOpen(false); setSelKey(null)
  }

  const lookupCode = async () => {
    const code = codeInput.trim(); if (!code) return
    try { const r = await stockRegisterAPI.lookup(code); pick(r.data.data as ProductOpt) }
    catch (e: any) { toastError('Not found', e?.response?.data?.message || 'No product with that code') }
  }

  // ── load register whenever the selection / filters change ─────────────────
  const dateError = useMemo(() => {
    if (!from || !to) return 'Select both From and To dates'
    if (from > to) return 'From date cannot be after To date'
    return null
  }, [from, to])

  const load = useCallback(async () => {
    if (!product || dateError) { return }
    const seq = ++loadSeq.current
    setLoading(true); setErr(null)
    try {
      const r = await stockRegisterAPI.get({ product_id: product.id, from, to, store, include_adj: includeAdj })
      if (seq !== loadSeq.current) return
      setReport(r.data.data as StockRegisterReport); setSelKey(null)
    } catch (e: any) {
      if (seq !== loadSeq.current) return
      setReport(null); setErr(e?.response?.data?.message || e?.message || 'Failed to load stock register')
    } finally { if (seq === loadSeq.current) setLoading(false) }
  }, [product, from, to, store, includeAdj, dateError])

  useEffect(() => { void load() }, [load])

  // ── keyboard: ↑/↓ move row selection, Esc = Exit ──────────────────────────
  const rows: StockRegisterRow[] = report?.rows || []
  const onKey = (e: React.KeyboardEvent) => {
    if (!rows.length || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
    const i = rows.findIndex(r => r.key === selKey)
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelKey(rows[Math.min(rows.length - 1, i + 1)].key) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelKey(rows[Math.max(0, i - 1)].key) }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !open) navigate(PATHS.PRODUCTS) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [navigate, open])

  // ── export / print ────────────────────────────────────────────────────────
  const exportCsv = async () => {
    if (!product || dateError) return
    try {
      const r = await stockRegisterAPI.exportCsv({ product_id: product.id, from, to, store, include_adj: includeAdj })
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = `stock-register-${(product.item_code || 'product').replace(/[^\w.-]+/g, '_')}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toastSuccess('Exported', 'Stock register CSV downloaded')
    } catch (e: any) { toastError('Export failed', e?.response?.data?.message || e?.message) }
  }

  const printReport = () => {
    if (!report) return
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c])
    const d = (iso: string | null) => (iso ? formatDisplayDate(iso, dateMode) : '—')
    const body = report.rows.map(r => `<tr><td>${esc(d(r.date))}</td><td>${esc(r.inv_no)}</td><td>${esc(r.batch)}</td><td>${esc(r.particular)}</td><td>${esc(r.narration)}</td><td>${esc(r.ty)}</td>
      <td class="n">${blankIfZero(r.qty_in)}</td><td class="n">${blankIfZero(r.qty_out)}</td><td class="n b">${num(r.balance)}</td><td class="n">${blankIfZero(r.qty_free)}</td>
      <td class="n">${money(r.rate)}</td><td>${esc(r.store)}</td><td class="n">${money(r.mrp)}</td><td>${esc(r.expiry)}</td></tr>`).join('')
    const t = report.totals
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stock Register — ${esc(report.product.name)}</title><style>
      body{font:11px Arial,sans-serif;margin:14mm 10mm;color:#000}h1{font-size:15px;margin:0 0 2px}.meta{margin:0 0 8px;color:#333}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:2px 4px;text-align:left}th{background:#eee}
      .n{text-align:right;font-variant-numeric:tabular-nums}.b{font-weight:bold}tfoot td{font-weight:bold;background:#f3f3f3}
      @media print{@page{size:landscape;margin:8mm}}</style></head><body>
      <h1>Stock Register</h1>
      <p class="meta"><b>${esc(report.product.item_code)}</b> — ${esc(report.product.name)}<br>
      Period: ${esc(d(report.filters.from))} to ${esc(d(report.filters.to))} &nbsp;|&nbsp; Store: ${report.filters.store === 'all' ? 'All Stores' : esc(report.filters.store)}
      &nbsp;|&nbsp; Opening Balance: <b>${num(report.opening_balance)}</b></p>
      <table><thead><tr>${COLS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody><tr><td colspan="8"><i>Opening Balance</i></td><td class="n b">${num(report.opening_balance)}</td><td colspan="5"></td></tr>${body}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="n">${num(t.qty_in)}</td><td class="n">${num(t.qty_out)}</td><td class="n">${num(t.closing_balance)}</td><td class="n">${num(t.qty_free)}</td><td colspan="4"></td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { toastError('Pop-up blocked', 'Allow pop-ups to print the report'); return }
    w.document.open(); w.document.write(html); w.document.close()
  }

  const t = report?.totals

  return (
    <div className="sr-page" tabIndex={0} onKeyDown={onKey}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Stock Register</h1></div>
      </div>

      {/* ── filters ─────────────────────────────────────────────────────── */}
      <div className="sr-filters">
        <label className="sr-f sr-f-code">
          <span>Product Code</span>
          <input className="erp-input" value={codeInput} placeholder="Code ↵"
            onChange={e => setCodeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookupCode() } }} />
        </label>

        <div className="sr-f sr-f-name" ref={nameBoxRef}>
          <span>Product Name</span>
          <div className="sr-combo">
            <Search size={13} className="sr-combo-ic" />
            <input className="erp-input" value={nameInput} placeholder="Search product…"
              onFocus={() => setOpen(true)}
              onChange={e => { setNameInput(e.target.value); setOpen(true) }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(options.length - 1, h + 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(0, h - 1)) }
                else if (e.key === 'Enter' && open && options[hl]) { e.preventDefault(); pick(options[hl]) }
                else if (e.key === 'Escape') setOpen(false)
              }} />
            {optLoading && <Loader2 size={13} className="sr-combo-spin" />}
            {open && (
              <ul className="sr-combo-list">
                {!optLoading && options.length === 0 && <li className="sr-combo-empty">No products found</li>}
                {options.map((p, i) => (
                  <li key={p.id} className={i === hl ? 'on' : ''} onMouseEnter={() => setHl(i)} onMouseDown={e => { e.preventDefault(); pick(p) }}>
                    <span className="sr-combo-code">{p.item_code}</span><span>{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="sr-f">
          <span>Date Range</span>
          <DateRangeFilter fromAD={from} toAD={to} onApply={r => { setFrom(r.fromAD); setTo(r.toAD) }} />
        </div>

        <label className="sr-f">
          <span>Store</span>
          <select className="erp-input" value={store} onChange={e => setStore(e.target.value)}>
            <option value="all">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className="sr-check" title="Include opening-stock, stock adjustment and batch-edit entries">
          <input type="checkbox" checked={includeAdj} onChange={e => setIncludeAdj(e.target.checked)} />
          <span>Batch Edit Include</span>
        </label>

        <div className="sr-actions">
          <button className="btn btn-primary btn-sm" onClick={printReport} disabled={!report || loading}><Printer size={14} /> Report</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!report || loading}><Download size={14} /> CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(PATHS.PRODUCTS)}><LogOut size={14} /> Exit</button>
        </div>
      </div>

      {dateError && <div className="sr-msg sr-msg-warn">{dateError}</div>}

      {/* ── register table ──────────────────────────────────────────────── */}
      <div className="sr-sheet-wrap">
        <div className="sr-scroll">
          <table className="sr-table">
            <thead><tr>{COLS.map(c => <th key={c.key} className={c.cls}>{c.label}</th>)}</tr></thead>
            <tbody>
              {report && (
                <tr className="sr-open">
                  <td colSpan={8}>Opening Balance</td>
                  <td className="sr-num sr-bal">{num(report.opening_balance)}</td>
                  <td colSpan={5}></td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.key} className={`sr-row sr-ty-${r.ty} ${selKey === r.key ? 'sel' : ''}`} onClick={() => setSelKey(r.key)} title={TY_LABEL[r.ty] || r.ty}>
                  <td className="sr-c-date">{formatDisplayDate(r.date, dateMode)}</td>
                  <td className="sr-c-inv">{r.inv_no}</td>
                  <td className="sr-c-batch">{r.batch}</td>
                  <td className="sr-c-part">{r.particular}</td>
                  <td className="sr-c-narr">{r.narration}</td>
                  <td className="sr-c-ty"><b>{r.ty}</b></td>
                  <td className="sr-num">{blankIfZero(r.qty_in)}</td>
                  <td className="sr-num">{blankIfZero(r.qty_out)}</td>
                  <td className="sr-num sr-bal">{num(r.balance)}</td>
                  <td className="sr-num">{blankIfZero(r.qty_free)}</td>
                  <td className="sr-num">{money(r.rate)}</td>
                  <td className="sr-c-store">{r.store}</td>
                  <td className="sr-num">{money(r.mrp)}</td>
                  <td className="sr-c-exp">{r.expiry}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={14} className="sr-state"><Loader2 size={16} className="sr-spin" /> Loading stock register…</td></tr>}
              {!loading && err && <tr><td colSpan={14} className="sr-state sr-state-err">{err} <button className="btn btn-secondary btn-sm" onClick={() => void load()}>Retry</button></td></tr>}
              {!loading && !err && !product && <tr><td colSpan={14} className="sr-state"><ClipboardList size={18} /> Select a product (code or name) to view its stock register.</td></tr>}
              {!loading && !err && product && report && rows.length === 0 && <tr><td colSpan={14} className="sr-state">No transactions for this product in the selected period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sr-foot">
          <div className="sr-foot-info">
            {report ? <>
              <b>{report.product.item_code}</b> · {report.product.name} · {rows.length} transaction{rows.length === 1 ? '' : 's'}
              {!report.reconciliation.matches && (
                <span className="sr-warn" title="The register's all-time closing differs from live batch stock (e.g. sales returns made before this feature was installed).">
                  {' '}· live stock {num(report.reconciliation.current_stock)} vs register {num(report.reconciliation.register_closing_all_time)}
                </span>
              )}
            </> : '—'}
          </div>
          <div className="sr-foot-tot">
            <span>Total</span>
            <span className="sr-num">In <b>{num(t?.qty_in ?? 0)}</b></span>
            <span className="sr-num">Out <b>{num(t?.qty_out ?? 0)}</b></span>
            <span className="sr-num">Free <b>{num(t?.qty_free ?? 0)}</b></span>
            <span className="sr-num sr-foot-bal">Closing <b>{num(t?.closing_balance ?? 0)}</b></span>
          </div>
        </div>
      </div>
      <div className="sr-legend">PU Purchase · SL Sale · RV Stock Receipt · SRN Sales Return · PRN Purchase Return · ADJ Adjustment/Opening. Free qty on a Sale is shown for reference; it does not change stock.</div>
    </div>
  )
}
