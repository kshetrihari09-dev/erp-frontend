import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Lock, Unlock, Plus } from 'lucide-react'
import { accountingAPI } from '@/services/api'
import { RAW_TOKEN_KEY } from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import { Button, Modal, Empty } from '@/components/ui'
import { fmtDate } from '@/utils'

// ─── Period creation form — defined OUTSIDE the parent component ──────────────
// FIX: was defined inside PeriodsTab render function, which caused a new
// component reference on every render → inputs lost focus on each keystroke.
function PeriodForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { success, error } = useUIStore()
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { name: '', start_date: '', end_date: '' },
  })

  const onSubmit = handleSubmit(async (data) => {
    if (!data.name)       { error('Period name required'); return }
    if (!data.start_date) { error('Start date required');  return }
    if (!data.end_date)   { error('End date required');    return }

    try {
      // FIX: was using broken localStorage.getItem('erp_token') which returns
      // the Zustand JSON blob. Now uses RAW_TOKEN_KEY which holds the plain JWT.
      const token = localStorage.getItem(RAW_TOKEN_KEY)
      const res   = await fetch('/api/v1/accounting/periods', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Failed')
      success('Period created')
      onCreated()
      onClose()
    } catch (e: any) {
      error('Failed', e.message)
    }
  })

  return (
    <>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            Period Name *
          </label>
          <input
            className="erp-input"
            placeholder="e.g. FY 2081-82"
            {...register('name')}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            Start Date *
          </label>
          <input type="date" className="erp-input" {...register('start_date')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            End Date *
          </label>
          <input type="date" className="erp-input" {...register('end_date')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>Create Period</Button>
      </div>
    </>
  )
}

export default function PeriodsTab() {
  const { success, error } = useUIStore()
  const [periods, setPeriods] = useState<any[]>([])
  const [modal,   setModal]   = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await accountingAPI.periods()
      setPeriods(r.data.data || r.data || [])
    } catch { setPeriods([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function toggleLock(id: string, locked: boolean) {
    try {
      if (locked) await accountingAPI.unlockPeriod(id)
      else        await accountingAPI.lockPeriod(id)
      success(locked ? 'Period unlocked' : 'Period locked')
      load()
    } catch (e: any) { error('Failed', e.message) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)}>
          New Period
        </Button>
      </div>

      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Period Name</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={5} className="text-center py-8 text-[var(--text-4)]">Loading…</td></tr>
                : periods.length
                  ? periods.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-semibold">{p.name}</td>
                        <td className="td-mono">{fmtDate(p.start_date)}</td>
                        <td className="td-mono">{fmtDate(p.end_date)}</td>
                        <td>
                          {p.is_locked
                            ? <span className="badge badge-red">Locked</span>
                            : <span className="badge badge-green">Open</span>
                          }
                        </td>
                        <td>
                          <Button
                            variant={p.is_locked ? 'success' : 'danger'}
                            size="sm"
                            icon={p.is_locked ? <Unlock size={12}/> : <Lock size={12}/>}
                            onClick={() => toggleLock(p.id, p.is_locked)}
                          >
                            {p.is_locked ? 'Unlock' : 'Lock'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  : (
                      <tr>
                        <td colSpan={5}>
                          <Empty message="No accounting periods — create one to lock/unlock transaction windows" />
                        </td>
                      </tr>
                    )
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Accounting Period" size="sm">
        <PeriodForm onClose={() => setModal(false)} onCreated={load} />
      </Modal>
    </div>
  )
}
