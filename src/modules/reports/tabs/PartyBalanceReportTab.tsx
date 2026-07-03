import { useCallback, useEffect, useMemo, useState } from 'react'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { fmt, downloadCSV } from '@/utils'
import { Users, FileText, AlertCircle, TrendingUp, RefreshCw, Download } from 'lucide-react'
import { A } from '../constants'
import { CARD, TH, TD, TDR } from '../styles'
import {
  ReportKpiCard, ReportTableCard, ReportSearchInput, MonoCell,
  SkeletonTable, ReportEmptyRow, ReportMobileCard, ReportMobileRow,
  rowHoverProps,
} from '../components'

export function PartyBalanceReportTab() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [type,    setType   ] = useState('customer')
  const [search,  setSearch ] = useState('')
  const { error } = useUIStore()

  const load = useCallback(async (t: string) => {
    setLoading(true)
    try {
      const r    = await reportsAPI.partyBalance({ type: t })
      const body = r.data?.data ?? r.data ?? {}
      const arr  = Array.isArray(body) ? body : (body?.data ?? [])
      setRows(arr)
      setSummary({ total_balance: body?.total_balance ?? 0, total_due: body?.total_due ?? 0, count: body?.total ?? arr.length })
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(type) }, [type])

  const filtered      = useMemo(() => rows.filter(r => !search || [r.name, r.code, r.phone].some(v => (v||'').toLowerCase().includes(search.toLowerCase()))), [rows, search])
  const totalBalance  = summary?.total_balance ?? filtered.reduce((s, r) => s + Number(r.balance || 0), 0)
  const totalDue      = summary?.total_due     ?? filtered.reduce((s, r) => s + Number(r.total_due || 0), 0)
  const totalInvoiced = filtered.reduce((s, r) => s + Number(r.total_invoiced || 0), 0)

  return (
    <>
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 20 }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3, gap: 2 }}>
            {[{ v: 'customer', l: 'Customers' }, { v: 'supplier', l: 'Suppliers' }].map(opt => (
              <button key={opt.v} onClick={() => setType(opt.v)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: type === opt.v ? 'var(--surface)' : 'transparent',
                color: type === opt.v ? A.primary : 'var(--text-2)',
                boxShadow: type === opt.v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s', fontFamily: 'var(--font)',
              }}>{opt.l}</button>
            ))}
          </div>
          <ReportSearchInput value={search} onChange={setSearch}/>
          <button onClick={() => load(type)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13}/> Refresh
          </button>
          {rows.length > 0 && (
            <button onClick={() => downloadCSV(filtered, `party-balance-${type}`)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Download size={13}/> Export
            </button>
          )}
          {summary && (
            <div style={{ ...CARD, padding: '6px 14px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{type === 'customer' ? 'TOTAL RECEIVABLE' : 'TOTAL PAYABLE'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: Number(totalBalance) > 0 ? A.warning : A.success, fontFamily: 'monospace' }}>
                {fmt(totalBalance)}
              </span>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
          <ReportKpiCard label={`Total ${type === 'customer' ? 'Customers' : 'Suppliers'}`} value={String(filtered.length)} icon={<Users       size={18}/>} color={A.primary}/>
          <ReportKpiCard label="Total Invoiced"  value={fmt(totalInvoiced)} icon={<FileText    size={18}/>} color={A.purple} />
          <ReportKpiCard label="Outstanding Due" value={fmt(totalDue)}      icon={<AlertCircle size={18}/>} color={A.warning}/>
          <ReportKpiCard label="Net Balance"     value={fmt(totalBalance)}  icon={<TrendingUp  size={18}/>} color={Number(totalBalance) > 0 ? A.warning : A.success}/>
        </div>
      )}

      <ReportTableCard title={`${type === 'customer' ? 'Customer' : 'Supplier'} Balances`} count={filtered.length}>
        {/* Desktop table */}
        <div className="hidden md:block">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Code','Name','Phone','PAN','Total Invoiced','Paid','Due','Balance'].map(h => (
                <th key={h} style={{ ...TH, textAlign: ['Total Invoiced','Paid','Due','Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? <SkeletonTable cols={8}/> : filtered.length === 0
                ? <tr><td colSpan={8}><ReportEmptyRow message={`No ${type}s found`}/></td></tr>
                : filtered.map((r: any, i: number) => (
                  <tr key={i} {...rowHoverProps(i)}>
                    <MonoCell color={A.primary}>{r.code || '—'}</MonoCell>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.name}</td>
                    <td style={{ ...TD, color: 'var(--text-2)' }}>{r.phone || '—'}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)' }}>{r.pan_no || '—'}</td>
                    <td style={TDR}>{fmt(r.total_invoiced || 0)}</td>
                    <td style={{ ...TDR, color: A.success }}>{fmt(r.total_paid || 0)}</td>
                    <td style={{ ...TDR, color: Number(r.total_due) > 0 ? A.danger : 'var(--text-4)' }}>{fmt(r.total_due || 0)}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: Number(r.balance ?? r.current_balance ?? 0) > 0 ? A.warning : A.success }}>
                      {fmt(r.balance ?? r.current_balance ?? 0)}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <td colSpan={4} style={{ ...TD, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>TOTALS</td>
                <td style={{ ...TDR, fontWeight: 700 }}>{fmt(totalInvoiced)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: A.success }}>{fmt(filtered.reduce((s, r) => s + Number(r.total_paid||0), 0))}</td>
                <td style={{ ...TDR, fontWeight: 700, color: A.danger }}>{fmt(totalDue)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: Number(totalBalance) > 0 ? A.warning : A.success }}>{fmt(totalBalance)}</td>
              </tr>
            </tfoot>
          )}
          </table>
        </div>
        {/* Mobile card list */}
        <div className="block md:hidden">
          {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-4)' }}>Loading…</div>
            : filtered.length === 0 ? <ReportEmptyRow message={`No ${type}s found`}/>
            : filtered.map((r: any, i: number) => {
              const balance = r.balance ?? r.current_balance ?? 0
              return (
                <ReportMobileCard key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: Number(balance) > 0 ? A.warning : A.success }}>{fmt(balance)}</span>
                  </div>
                  {r.phone && <ReportMobileRow label="Phone"    value={r.phone}/>}
                  <ReportMobileRow label="Invoiced" value={fmt(r.total_invoiced || 0)} color={A.primary}/>
                  <ReportMobileRow label="Paid"     value={fmt(r.total_paid || 0)} color={A.success}/>
                  {Number(r.total_due) > 0 && <ReportMobileRow label="Due" value={fmt(r.total_due)} color={A.danger}/>}
                </ReportMobileCard>
              )
            })
          }
        </div>
      </ReportTableCard>
    </>
  )
}
