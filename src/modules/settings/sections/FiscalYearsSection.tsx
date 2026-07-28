import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useFiscalYears } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, SkeletonRows, Empty } from '@/components/ui'
import { fmtDate } from '@/utils'

export default function FiscalYearsSection() {
  const { data, isLoading, refetch } = useFiscalYears()
  const { success: toastOk, error: toastErr } = useUIStore()
  // unwrap returns the array directly: r.data.data = [...fiscal_years]
  const years = Array.isArray(data) ? data : ((data as any)?.data ?? [])

  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form, setForm] = useState({ name: '', start_date_ad: '', end_date_ad: '', start_date_bs: '', end_date_bs: '' })

  async function handleCreate() {
    if (!form.name || !form.start_date_ad || !form.end_date_ad) { toastErr('Name, start date and end date are required'); return }
    setSaving(true)
    try {
      await settingsAPI.createFiscalYear(form)
      toastOk('Fiscal year created')
      setShowForm(false)
      setForm({ name: '', start_date_ad: '', end_date_ad: '', start_date_bs: '', end_date_bs: '' })
      refetch()
    } catch (e: any) { toastErr('Failed', e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" size="sm" icon={showForm ? <X size={14}/> : <Plus size={14}/>} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : 'Add Fiscal Year'}
        </Button>
      </div>

      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
          <div className="form-grid">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Name</label>
              <input className="erp-input" placeholder="e.g. FY 2081/82" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Start Date</label>
              <input type="date" className="erp-input" value={form.start_date_ad} onChange={e => setForm(f => ({...f, start_date_ad: e.target.value}))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">End Date</label>
              <input type="date" className="erp-input" value={form.end_date_ad} onChange={e => setForm(f => ({...f, end_date_ad: e.target.value}))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Start Date BS</label>
              <input className="erp-input" placeholder="2081-04-01" value={form.start_date_bs} onChange={e => setForm(f => ({...f, start_date_bs: e.target.value}))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">End Date BS</label>
              <input className="erp-input" placeholder="2082-03-31" value={form.end_date_bs} onChange={e => setForm(f => ({...f, end_date_bs: e.target.value}))} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="primary" loading={saving} onClick={handleCreate}>Save Fiscal Year</Button>
          </div>
        </div>
      )}

      <div className="table-card">
        {/* Desktop */}
        <div className="overflow-x-auto stp-desktop-table">
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Start (AD)</th><th>End (AD)</th><th>Start (BS)</th><th>End (BS)</th><th>Locked</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : years.length
                  ? years.map((y: any) => (
                      <tr key={y.id}>
                        <td className="font-semibold">{y.name}</td>
                        <td className="td-mono">{fmtDate(y.start_date_ad || y.start_date)}</td>
                        <td className="td-mono">{fmtDate(y.end_date_ad   || y.end_date)}</td>
                        <td className="td-mono">{y.start_date_bs || '—'}</td>
                        <td className="td-mono">{y.end_date_bs   || '—'}</td>
                        <td>{y.is_locked ? <span className="badge badge-red">Locked</span> : <span className="badge badge-green">Open</span>}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No fiscal years configured. Click 'Add Fiscal Year' to create one."/></td></tr>
              }
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="stp-mobile-list">
          {isLoading
            ? [1,2].map(i => <div key={i} className="stp-card stp-card-skel"/>)
            : years.length === 0
              ? <Empty message="No fiscal years configured. Click 'Add Fiscal Year' to create one."/>
              : years.map((y: any) => (
                  <div key={y.id} className="stp-card">
                    <div className="stp-card-top">
                      <div className="stp-card-main">
                        <p className="stp-card-title">{y.name}</p>
                      </div>
                      {y.is_locked ? <span className="badge badge-red">Locked</span> : <span className="badge badge-green">Open</span>}
                    </div>
                    <div className="stp-fy-grid">
                      <div className="stp-fy-item"><span className="stp-fy-label">Start AD</span><span className="stp-fy-val">{fmtDate(y.start_date_ad || y.start_date)}</span></div>
                      <div className="stp-fy-item"><span className="stp-fy-label">End AD</span><span className="stp-fy-val">{fmtDate(y.end_date_ad || y.end_date)}</span></div>
                      {y.start_date_bs && <div className="stp-fy-item"><span className="stp-fy-label">Start BS</span><span className="stp-fy-val">{y.start_date_bs}</span></div>}
                      {y.end_date_bs   && <div className="stp-fy-item"><span className="stp-fy-label">End BS</span><span className="stp-fy-val">{y.end_date_bs}</span></div>}
                    </div>
                  </div>
                ))
          }
        </div>
      </div>
    </div>
  )
}
