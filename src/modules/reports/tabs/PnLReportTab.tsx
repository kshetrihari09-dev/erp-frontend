import { useState } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, downloadCSV } from '@/utils'
import { TrendingUp, TrendingDown, BarChart2, Download } from 'lucide-react'
import { A, getRange } from '../constants'
import { CARD, TH, TD, TDR } from '../styles'
import { ReportFilterBar, ReportTableCard, ReportEmptyRow, ReportNoData } from '../components'

export function PnLReportTab() {
  const [dateFrom, setDateFrom] = useState(getRange('year')[0])
  const [dateTo,   setDateTo  ] = useState(getRange('year')[1])
  const [report,   setReport  ] = useState<any>(null)
  const [loading,  setLoading ] = useState(false)
  const { error } = useUIStore()

  async function generate() {
    setLoading(true); setReport(null)
    try {
      const r   = await reportsAPI.profitLoss({ date_from: dateFrom, date_to: dateTo })
      const raw = r.data?.data ?? {}
      setReport({
        incomeRows:   raw.income?.rows  ?? [],
        expenseRows:  raw.expense?.rows ?? [],
        totalIncome:  Number(raw.income?.total)  || 0,
        totalExpense: Number(raw.expense?.total) || 0,
        netProfit:    Number(raw.net_profit)     || 0,
        netPct:       raw.net_profit_pct != null ? Number(raw.net_profit_pct) : null,
        date_from:    raw.date_from || dateFrom,
        date_to:      raw.date_to   || dateTo,
      })
    } catch (e: any) { error('Failed to load P&L', e.message) }
    finally { setLoading(false) }
  }

  const isProfit   = (report?.netProfit ?? 0) >= 0
  const netColor   = isProfit ? A.success : A.danger
  const chartData  = report ? [{ name: 'Income', value: report.totalIncome }, { name: 'Expense', value: report.totalExpense }] : []

  return (
    <>
      <ReportFilterBar dateFrom={dateFrom} dateTo={dateTo} loading={loading}
        onDateChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        onGenerate={generate}
        onReset={() => { setDateFrom(getRange('year')[0]); setDateTo(getRange('year')[1]); setReport(null) }}
      />

      {!report && !loading && <ReportNoData icon={<BarChart2 size={40}/>} title="Profit & Loss Statement" sub="Select a period and click Generate to view your P&L."/>}

      {report && (
        <>
          {/* Net profit banner */}
          <div style={{ ...CARD, padding: '20px 20px', marginBottom: 20, background: `linear-gradient(135deg, ${netColor}10 0%, ${netColor}05 100%)`, border: `1.5px solid ${netColor}30` }}>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: netColor, marginBottom: 4 }}>
                  NET {isProfit ? 'PROFIT' : 'LOSS'}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: netColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>
                  {isProfit ? '+' : ''}{fmt(report.netProfit)}
                </div>
                {report.netPct != null && (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                    Net margin: <b style={{ color: netColor }}>{report.netPct}%</b>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[{ label: 'Total Revenue', val: report.totalIncome, color: A.success }, { label: 'Total Expenses', val: report.totalExpense, color: A.danger }].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{fmt(s.val)}</div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block" style={{ marginLeft: 'auto' }}>
                <ResponsiveContainer width={140} height={90}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={3} dataKey="value">
                      {chartData.map((_, i) => <Cell key={i} fill={[A.success, A.danger][i]}/>)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <button onClick={() => downloadCSV([
                ...report.incomeRows.map((r: any)  => ({ section: 'Income',  code: r.code, name: r.name, amount: r.amount })),
                ...report.expenseRows.map((r: any) => ({ section: 'Expense', code: r.code, name: r.name, amount: r.amount })),
                { section: 'NET', code: '', name: 'Net Profit / Loss', amount: report.netProfit },
              ], `pnl-${report.date_from}-${report.date_to}`)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Download size={13}/> Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Income',   rows: report.incomeRows,  total: report.totalIncome,  color: A.success, Icon: TrendingUp,   emptyMsg: 'No income accounts in this period',   totalLabel: 'TOTAL INCOME' },
              { title: 'Expenses', rows: report.expenseRows, total: report.totalExpense, color: A.danger,  Icon: TrendingDown, emptyMsg: 'No expense accounts in this period',  totalLabel: 'TOTAL EXPENSES' },
            ].map(sec => (
              <ReportTableCard key={sec.title} title={sec.title} badge={fmt(sec.total)} actions={<sec.Icon size={16} color={sec.color}/>}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {['Code','Account','Amount'].map((h, i) => <th key={h} style={{ ...TH, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {sec.rows.length === 0
                      ? <tr><td colSpan={3}><ReportEmptyRow message={sec.emptyMsg}/></td></tr>
                      : sec.rows.map((row: any, i: number) => (
                        <tr key={i} style={{ background: row.is_group ? 'var(--surface-2)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)' }}>{row.code || '—'}</td>
                          <td style={{ ...TD, fontWeight: row.is_group ? 700 : 400, paddingLeft: (Number(row.depth)||0)*14 + 14 }}>{row.name}</td>
                          <td style={{ ...TDR, color: sec.color }}>{Number(row.amount) !== 0 ? fmt(Math.abs(Number(row.amount))) : '—'}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{sec.totalLabel}</td>
                      <td style={{ ...TDR, fontWeight: 700, color: sec.color }}>{fmt(sec.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </ReportTableCard>
            ))}
          </div>
        </>
      )}
    </>
  )
}
