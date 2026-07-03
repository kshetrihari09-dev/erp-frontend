import { useMemo, useState } from 'react'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, downloadCSV } from '@/utils'
import { Package, TrendingUp, AlertCircle, RefreshCw, Search } from 'lucide-react'
import { A } from '../constants'
import { TH, TD, TDR } from '../styles'
import {
  ReportKpiCard, ReportExportMenu, ReportTableCard, ReportStatusBadge,
  MonoCell, ReportNoData, ReportSearchInput, ReportMobileCard, ReportMobileRow,
  rowHoverProps,
} from '../components'

export function StockReportTab() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch ] = useState('')
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.stock()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered   = useMemo(() => rows.filter(r => !search || [r.item_code, r.name].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const totalValue = useMemo(() => filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0), [filtered])
  const lowStock   = useMemo(() => filtered.filter(r => r.low_stock).length, [filtered])

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <RefreshCw size={13} className="animate-spin"/> : <Search size={13}/>} Load Report
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <ReportKpiCard label="Total Products"   value={String(filtered.length)} icon={<Package     size={18}/>} color={A.cyan}   />
            <ReportKpiCard label="Total Stock Value" value={fmt(totalValue)}         icon={<TrendingUp  size={18}/>} color={A.primary}/>
            <ReportKpiCard label="Low Stock Items"   value={String(lowStock)}        icon={<AlertCircle size={18}/>} color={lowStock > 0 ? A.warning : A.success}/>
          </div>
          <ReportTableCard title="Stock Valuation" count={filtered.length} badge={fmt(totalValue)}
            actions={<><ReportSearchInput value={search} onChange={setSearch}/><ReportExportMenu onCSV={() => downloadCSV(filtered, 'stock-report')} onPrint={() => window.print()}/></>}
          >
            <div className="hidden md:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Code','Product','Unit','Stock','P.Rate','Value','Status'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Stock','P.Rate','Value'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.item_code}</MonoCell>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.name}</td>
                      <td style={TD}><span style={{ background: 'var(--surface-3)', color: 'var(--text-2)', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{r.unit}</span></td>
                      <td style={{ ...TDR, color: r.low_stock ? A.danger : 'var(--text)', fontWeight: 700 }}>{r.current_stock}</td>
                      <td style={TDR}>{fmt(r.purchase_rate)}</td>
                      <td style={{ ...TDR, fontWeight: 700 }}>{fmt(r.stock_value)}</td>
                      <td style={TD}><ReportStatusBadge value={r.low_stock ? 'pending' : 'active'}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="block md:hidden">
              {filtered.map((r: any, i: number) => (
                <ReportMobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.cyan }}>{r.item_code}</span>
                    <ReportStatusBadge value={r.low_stock ? 'pending' : 'active'}/>
                  </div>
                  <ReportMobileRow label="Product" value={r.name}/>
                  <ReportMobileRow label="Stock"   value={`${r.current_stock} ${r.unit}`} color={r.low_stock ? A.danger : A.success}/>
                  <ReportMobileRow label="Rate"    value={fmt(r.purchase_rate)}/>
                  <ReportMobileRow label="Value"   value={fmt(r.stock_value)} color={A.primary}/>
                </ReportMobileCard>
              ))}
            </div>
          </ReportTableCard>
        </>
      )}
      {!rows.length && !loading && <ReportNoData icon={<Package size={40}/>} title="Stock valuation report" sub="Click Load Report to view current stock values."/>}
    </>
  )
}
