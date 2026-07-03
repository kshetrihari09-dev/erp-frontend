import { useState } from 'react'
import { reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { downloadCSV } from '@/utils'
import { Package, AlertCircle, XCircle, RefreshCw, Download } from 'lucide-react'
import { A } from '../constants'
import { TH, TD, TDR } from '../styles'
import { ReportKpiCard, ReportTableCard, ReportNoData, ReportMobileCard, ReportMobileRow } from '../components'

export function ExpiryReportTab() {
  const [rows,    setRows   ] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { error } = useUIStore()

  async function generate() {
    setLoading(true)
    try {
      const r    = await reportsAPI.expiry()
      const body = r.data?.data
      setRows(Array.isArray(body) ? body : (body?.data ?? []))
    } catch (e: any) { error('Failed', e.message) }
    finally { setLoading(false) }
  }

  const expired = rows.filter(r => r.expiry_date && new Date(r.expiry_date) < new Date())
  const nearExp = rows.filter(r => { if (!r.expiry_date) return false; const d = Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000); return d >= 0 && d < 30 })

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={generate} disabled={loading} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <RefreshCw size={13} className="animate-spin"/> : <AlertCircle size={13}/>} Load Expiry Report
        </button>
        {rows.length > 0 && (
          <button onClick={() => downloadCSV(rows, 'expiry-report')} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Download size={13}/> Export CSV
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
            <ReportKpiCard label="Total Batches" value={String(rows.length)}    icon={<Package     size={18}/>} color={A.primary}/>
            <ReportKpiCard label="Expired"       value={String(expired.length)} icon={<XCircle     size={18}/>} color={A.danger} />
            <ReportKpiCard label="Expiring Soon" value={String(nearExp.length)} icon={<AlertCircle size={18}/>} color={A.warning}/>
          </div>
          <ReportTableCard title="Expiry Details" count={rows.length}>
            <div className="hidden md:block">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Product','Batch','Qty','Expiry','Days Left'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Qty','Days Left'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r: any, i: number) => {
                    const days = r.expiry_date ? Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000) : null
                    const rowBg = days !== null && days < 0 ? 'rgba(220,38,38,0.07)' : days !== null && days < 30 ? 'rgba(245,158,11,0.07)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                    return (
                      <tr key={i} style={{ background: rowBg }}>
                        <td style={{ ...TD, fontWeight: 500 }}>{r.product_name}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{r.batch_no || '—'}</td>
                        <td style={TDR}>{r.qty_available}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', color: days !== null && days < 30 ? A.danger : 'var(--text)' }}>{r.expiry || '—'}</td>
                        <td style={{ ...TDR, fontWeight: 700, color: days === null ? 'var(--text-4)' : days < 0 ? A.danger : days < 30 ? A.warning : A.success }}>
                          {days !== null ? `${days}d` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="block md:hidden">
              {rows.map((r: any, i: number) => {
                const days = r.expiry_date ? Math.round((new Date(r.expiry_date).getTime() - Date.now()) / 86400000) : null
                const dColor = days === null ? 'var(--text-4)' : days < 0 ? A.danger : days < 30 ? A.warning : A.success
                return (
                  <ReportMobileCard key={i}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name}</span>
                    {r.batch_no && <ReportMobileRow label="Batch"   value={r.batch_no}/>}
                    <ReportMobileRow label="Qty"     value={String(r.qty_available)}/>
                    <ReportMobileRow label="Expiry"  value={r.expiry || '—'} color={days !== null && days < 30 ? A.danger : undefined}/>
                    <ReportMobileRow label="Days Left" value={days !== null ? `${days}d` : '—'} color={dColor}/>
                  </ReportMobileCard>
                )
              })}
            </div>
          </ReportTableCard>
        </>
      )}
      {!rows.length && !loading && <ReportNoData icon={<AlertCircle size={40}/>} title="Expiry tracking" sub="Click Load Expiry Report to check batch expiry status."/>}
    </>
  )
}
