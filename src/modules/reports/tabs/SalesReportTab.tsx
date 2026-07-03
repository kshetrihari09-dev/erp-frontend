import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, fmtDate, downloadCSV } from '@/utils'
import {
  FileText, TrendingUp, AlertCircle, CheckCircle, BarChart2,
} from 'lucide-react'
import { A, getRange } from '../constants'
import { CARD, TH, TD, TDR } from '../styles'
import { useWindowWidth } from '../hooks'
import {
  ReportKpiCard, ReportFilterBar, ReportExportMenu, ReportTableCard,
  ReportStatusBadge, MonoCell, SkeletonTable, ReportEmptyRow, ReportNoData,
  ReportChartTooltip, ReportSearchInput, ReportMobileCard, ReportMobileRow,
  rowHoverProps,
} from '../components'

export function SalesReportTab() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [rows,     setRows    ] = useState<any[]>([])
  const [loading,  setLoading ] = useState(false)
  const [search,   setSearch  ] = useState('')
  const { error } = useUIStore()
  const w = useWindowWidth()
  const isMobile = w <= 640

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.sales({ date_from: dateFrom, date_to: dateTo })
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() =>
    rows.filter(r => !search || [r.invoice_no, r.party_name, r.payment_mode, r.status]
      .some(v => (v||'').toLowerCase().includes(search.toLowerCase()))
    ), [rows, search])

  const kpi = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.net_total || r.total || 0), 0)
    const paid  = filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0)
    const due   = filtered.reduce((s, r) => s + Number(r.due_amount  || 0), 0)
    return { total, paid, due, avg: filtered.length ? total / filtered.length : 0, count: filtered.length, paidPct: total ? Math.round(paid/total*100) : 0 }
  }, [filtered])

  const trendData = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { const m = (r.date_ad||'').slice(0,7); if (m) map[m] = (map[m]||0) + Number(r.net_total||0) })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
      .map(([k, v]) => ({ month: k.slice(5) + '/' + k.slice(2,4), amount: v }))
  }, [rows])

  const topCustomers = useMemo(() => {
    const map: Record<string, number> = {}
    rows.forEach(r => { const n = r.party_name || 'Walk-in'; map[n] = (map[n]||0) + Number(r.net_total||0) })
    const maxVal = Math.max(...Object.values(map), 1)
    return Object.entries(map).sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([name, total]) => ({ name, total, pct: Math.round(total/maxVal*100) }))
  }, [rows])

  const pieData  = useMemo(() => [{ name: 'Paid', value: kpi.paid }, { name: 'Due', value: kpi.due }].filter(d => d.value > 0), [kpi])
  const hasData  = rows.length > 0

  return (
    <>
      <ReportFilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setRows([]) }}
      />

      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
          <ReportKpiCard label="Total Invoices"  value={String(kpi.count)}   sub="in selected period"          icon={<FileText    size={18}/>} color={A.primary} />
          <ReportKpiCard label="Total Revenue"   value={fmt(kpi.total)}      sub={`avg ${fmt(kpi.avg)} / inv`} icon={<TrendingUp  size={18}/>} color={A.success} />
          <ReportKpiCard label="Total Paid"      value={fmt(kpi.paid)}       sub={`${kpi.paidPct}% collected`} icon={<CheckCircle size={18}/>} color={A.success} trend={kpi.paidPct - 100} />
          <ReportKpiCard label="Outstanding Due" value={fmt(kpi.due)}        sub={kpi.due > 0 ? 'Needs follow-up' : 'All cleared'} icon={<AlertCircle size={18}/>} color={kpi.due > 0 ? A.warning : A.success} />
        </div>
      )}

      {hasData && trendData.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : w <= 900 ? '1fr 1fr' : '1fr 280px 260px', gap: 12, marginBottom: 20 }}>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>Sales Trend</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-4)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-4)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v).replace(/\.00$/,'')}/>
                <Tooltip content={<ReportChartTooltip/>}/>
                <Line type="monotone" dataKey="amount" name="Sales" stroke={A.primary} strokeWidth={2.5} dot={{ r: 3, fill: A.primary }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 8 }}>Collection Status</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={[A.success, A.warning][i % 2]}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>Top Customers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCustomers.map((c, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{fmt(c.total)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-3)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: A.primary, width: `${c.pct}%`, transition: 'width 0.5s' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <ReportTableCard title="Sales Transactions" count={filtered.length} badge={fmt(kpi.total)}
          actions={<><ReportSearchInput value={search} onChange={setSearch}/><ReportExportMenu onCSV={() => downloadCSV(filtered, 'sales-report')} onPrint={() => window.print()}/></>}
        >
          {/* Desktop table */}
          <div className="hidden md:block">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Invoice No','Date','Party','Total','Paid','Due','Mode','Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: ['Total','Paid','Due'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {loading ? <SkeletonTable cols={8}/> : filtered.length === 0
                  ? <tr><td colSpan={8}><ReportEmptyRow message="No records. Adjust the date range and generate."/></td></tr>
                  : filtered.map((r: any, i: number) => (
                    <tr key={i} {...rowHoverProps(i)}>
                      <MonoCell>{r.invoice_no}</MonoCell>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.date_ad)}</td>
                      <td style={{ ...TD, fontWeight: 500 }}>{r.party_name || 'Walk-in'}</td>
                      <td style={TDR}>{fmt(r.net_total || r.total)}</td>
                      <td style={{ ...TDR, color: A.success }}>{fmt(r.paid_amount || 0)}</td>
                      <td style={{ ...TDR, color: Number(r.due_amount) > 0 ? A.warning : 'var(--text-4)' }}>{fmt(r.due_amount || 0)}</td>
                      <td style={TD}><ReportStatusBadge value={r.payment_mode}/></td>
                      <td style={TD}><ReportStatusBadge value={r.status}/></td>
                    </tr>
                  ))
                }
              </tbody>
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                    <td colSpan={3} style={{ ...TD, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>TOTAL</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.primary }}>{fmt(kpi.total)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.success }}>{fmt(kpi.paid)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: A.warning }}>{fmt(kpi.due)}</td>
                    <td colSpan={2} style={TD}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Mobile card list */}
          <div className="block md:hidden">
            {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
              : filtered.length === 0 ? <ReportEmptyRow message="No records."/>
              : filtered.map((r: any, i: number) => (
                <ReportMobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: A.primary }}>{r.invoice_no}</span>
                    <ReportStatusBadge value={r.status}/>
                  </div>
                  <ReportMobileRow label="Party"   value={r.party_name || 'Walk-in'}/>
                  <ReportMobileRow label="Date"    value={fmtDate(r.date_ad)}/>
                  <ReportMobileRow label="Total"   value={fmt(r.net_total || r.total)} color={A.primary}/>
                  <ReportMobileRow label="Paid"    value={fmt(r.paid_amount || 0)} color={A.success}/>
                  {Number(r.due_amount) > 0 && <ReportMobileRow label="Due" value={fmt(r.due_amount)} color={A.warning}/>}
                  <ReportMobileRow label="Mode"    value={<ReportStatusBadge value={r.payment_mode}/>}/>
                </ReportMobileCard>
              ))
            }
          </div>
        </ReportTableCard>
      )}

      {!hasData && !loading && <ReportNoData icon={<BarChart2 size={40}/>} title="No data yet" sub="Select a date range and click Generate to view your sales report."/>}
    </>
  )
}
