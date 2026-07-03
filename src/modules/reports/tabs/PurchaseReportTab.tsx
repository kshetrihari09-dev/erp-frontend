import { useMemo, useState } from 'react'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, fmtDate, downloadCSV } from '@/utils'
import { Package, TrendingDown, AlertCircle, BarChart2 } from 'lucide-react'
import { A, getRange } from '../constants'
import { TH, TD, TDR } from '../styles'
import {
  ReportKpiCard, ReportFilterBar, ReportExportMenu, ReportTableCard,
  ReportStatusBadge, MonoCell, SkeletonTable, ReportNoData,
  ReportSearchInput, ReportMobileCard, ReportMobileRow,
  rowHoverProps,
} from '../components'

export function PurchaseReportTab() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [rows,     setRows    ] = useState<any[]>([])
  const [loading,  setLoading ] = useState(false)
  const [search,   setSearch  ] = useState('')
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.purchases({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered  = useMemo(() => rows.filter(r => !search || [r.bill_no, r.party_name, r.status].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const total     = useMemo(() => filtered.reduce((s, r) => s + Number(r.net_total  || 0), 0), [filtered])
  const totalDue  = useMemo(() => filtered.reduce((s, r) => s + Number(r.due_amount || 0), 0), [filtered])

  return (
    <>
      <ReportFilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />
      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <ReportKpiCard label="Total Bills"    value={String(filtered.length)}                             icon={<Package      size={18}/>} color={A.purple} />
            <ReportKpiCard label="Total Spent"    value={fmt(total)}                                          icon={<TrendingDown size={18}/>} color={A.danger} />
            <ReportKpiCard label="Outstanding"    value={fmt(totalDue)}                                       icon={<AlertCircle  size={18}/>} color={A.warning}/>
            <ReportKpiCard label="Avg Bill Value" value={fmt(filtered.length ? total/filtered.length : 0)}    icon={<BarChart2    size={18}/>} color={A.cyan}   />
          </div>
          <ReportTableCard title="Purchase Bills" count={filtered.length} badge={fmt(total)}
            actions={<><ReportSearchInput value={search} onChange={setSearch}/><ReportExportMenu onCSV={() => downloadCSV(filtered, 'purchase-report')} onPrint={() => window.print()}/></>}
          >
            <div className="hidden md:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Bill No','Date','Supplier','Total','Due','Status'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Total','Due'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonTable cols={6}/> : filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.bill_no}</MonoCell>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || '—'}</td>
                      <td style={TDR}>{fmt(r.net_total)}</td>
                      <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? A.warning : 'var(--text-4)' }}>{fmt(r.due_amount || 0)}</td>
                      <td style={TD}><ReportStatusBadge value={r.status}/></td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>TOTAL</td>
                      <td style={{ ...TDR, fontWeight: 700, color: A.primary }}>{fmt(total)}</td>
                      <td style={{ ...TDR, fontWeight: 700, color: A.warning }}>{fmt(totalDue)}</td>
                      <td style={TD}/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="block md:hidden">
              {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
                : filtered.map((r: any, i: number) => (
                  <ReportMobileCard key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.purple }}>{r.bill_no}</span>
                      <ReportStatusBadge value={r.status}/>
                    </div>
                    <ReportMobileRow label="Supplier" value={r.party_name || '—'}/>
                    <ReportMobileRow label="Date"     value={fmtDate(r.date_ad)}/>
                    <ReportMobileRow label="Total"    value={fmt(r.net_total)} color={A.primary}/>
                    {Number(r.due_amount) > 0 && <ReportMobileRow label="Due" value={fmt(r.due_amount)} color={A.warning}/>}
                  </ReportMobileCard>
                ))
              }
            </div>
          </ReportTableCard>
        </>
      )}
      {!rows.length && !loading && <ReportNoData icon={<Package size={40}/>} title="No purchases loaded" sub="Select a date range and click Generate."/>}
    </>
  )
}
