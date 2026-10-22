import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Lock, Unlock, Plus } from 'lucide-react'
import { accountingAPI } from '@/services/api'
import { useFiscalYears, usePeriods, useInvalidateFiscalData } from '@/hooks/useQuery'
import useUIStore from '@/store/uiStore'
import { Button, Modal, Empty } from '@/components/ui'
import { fmtDate } from '@/utils'
import type { AccountingPeriod, FiscalYear } from '@/types'

// ─── Period creation form — defined OUTSIDE the parent component ──────────────
// (defining it inside the render function would remount inputs on every keystroke)
// Periods always live inside a fiscal year; fiscal years themselves are created and
// edited ONLY in Settings → Fiscal Years, so this form just picks one.
function PeriodForm({ years, onClose, onCreated }: { years: FiscalYear[]; onClose: () => void; onCreated: () => void }) {
  const { success, error } = useUIStore()
  const openYears = years.filter(y => !y.is_locked)
  const initial = openYears.find(y => y.is_current) ?? openYears[0]
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { name: '', fiscal_year_id: initial?.id ?? '', start_date: initial?.start_date_ad ?? '', end_date: initial?.end_date_ad ?? '' },
  })
  const fyId = watch('fiscal_year_id')
  const fy = years.find(y => y.id === fyId)

  const onSubmit = handleSubmit(async (data) => {
    if (!data.fiscal_year_id) { error('Select a fiscal year'); return }
    if (!data.name)           { error('Period name required'); return }
    if (!data.start_date)     { error('Start date required');  return }
    if (!data.end_date)       { error('End date required');    return }
    if (fy && (data.start_date < fy.start_date_ad || data.end_date > fy.end_date_ad)) {
      error('Outside fiscal year', `Dates must fall within ${fmtDate(fy.start_date_ad)} – ${fmtDate(fy.end_date_ad)}`); return
    }
    try {
      await accountingAPI.createPeriod(data)
      success('Period created')
      onCreated()
      onClose()
    } catch (e: any) {
      error('Failed', e.message)
    }
  })

  const label = 'text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5'
  return (
    <>
      <div className="flex flex-col gap-4">
        <div>
          <label className={label}>Fiscal Year *</label>
          <select
            className="erp-input"
            {...register('fiscal_year_id', {
              onChange: (e) => {
                const y = years.find(v => v.id === e.target.value)
                if (y) { setValue('start_date', y.start_date_ad); setValue('end_date', y.end_date_ad) }
              },
            })}
          >
            {openYears.map(y => (
              <option key={y.id} value={y.id}>
                {y.name} ({fmtDate(y.start_date_ad)} – {fmtDate(y.end_date_ad)}){y.is_current ? ' • current' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Period Name *</label>
          <input className="erp-input" placeholder="e.g. Shrawan 2081" {...register('name')} />
        </div>
        <div>
          <label className={label}>Start Date *</label>
          <input type="date" className="erp-input" min={fy?.start_date_ad} max={fy?.end_date_ad} {...register('start_date')} />
        </div>
        <div>
          <label className={label}>End Date *</label>
          <input type="date" className="erp-input" min={fy?.start_date_ad} max={fy?.end_date_ad} {...register('end_date')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>Create Period</Button>
      </div>
    </>
  )
}

function StatusBadge({ p }: { p: AccountingPeriod }) {
  if (p.lock_source === 'fiscal_year') return <span className="badge badge-red" title="Locked because its fiscal year is locked">Locked (fiscal year)</span>
  if (p.is_effectively_locked)         return <span className="badge badge-red">Locked</span>
  return <span className="badge badge-green">Open</span>
}

export default function PeriodsTab({ onCount }: { onCount?: (count: number) => void } = {}) {
  const { success, error } = useUIStore()
  const { data, isLoading, isError, refetch } = usePeriods()
  const { data: fyData } = useFiscalYears()
  const refreshAll = useInvalidateFiscalData()
  const [modal, setModal] = useState(false)

  const periods: AccountingPeriod[] = useMemo(() => (Array.isArray(data) ? data : ((data as any)?.data ?? [])), [data])
  const years: FiscalYear[] = useMemo(() => (Array.isArray(fyData) ? fyData : ((fyData as any)?.data ?? [])), [fyData])

  // Report the current row count up to the parent (purely informational).
  useEffect(() => { onCount?.(periods.length) }, [periods.length, onCount])

  async function toggleLock(p: AccountingPeriod) {
    try {
      if (p.is_locked) await accountingAPI.unlockPeriod(p.id)
      else             await accountingAPI.lockPeriod(p.id)
      success(p.is_locked ? 'Period unlocked' : 'Period locked')
      refreshAll()
    } catch (e: any) { error('Failed', e.message) }
  }

  const noYears = !isLoading && years.length === 0

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)} disabled={noYears || years.every(y => y.is_locked)}>
          New Period
        </Button>
      </div>

      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Period Name</th>
                <th>Fiscal Year</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <tr><td colSpan={6} className="text-center py-8 text-[var(--text-4)]">Loading…</td></tr>
                : isError
                  ? <tr><td colSpan={6} className="text-center py-8 text-[var(--text-4)]">
                      Could not load periods. <button className="underline" onClick={() => refetch()}>Retry</button>
                    </td></tr>
                  : periods.length
                    ? periods.map((p) => (
                        <tr key={p.id}>
                          <td className="font-semibold">{p.name}</td>
                          <td>
                            {p.fiscal_year_id
                              ? <>
                                  <span className="font-medium">{p.fiscal_year_name}</span>
                                  {p.fiscal_year_is_current && <span className="badge badge-blue ml-1.5">Current</span>}
                                  <div className="td-mono text-[11px] text-[var(--text-4)]">
                                    {fmtDate(p.fiscal_year_start_ad)} – {fmtDate(p.fiscal_year_end_ad)}
                                  </div>
                                </>
                              : <span className="badge badge-amber" title="Not linked to a fiscal year — create the matching fiscal year in Settings → Fiscal Years">Not linked</span>}
                          </td>
                          <td className="td-mono">{fmtDate(p.start_date)}</td>
                          <td className="td-mono">{fmtDate(p.end_date)}</td>
                          <td><StatusBadge p={p} /></td>
                          <td>
                            <Button
                              variant={p.is_locked ? 'success' : 'danger'}
                              size="sm"
                              icon={p.is_locked ? <Unlock size={12}/> : <Lock size={12}/>}
                              disabled={p.fiscal_year_is_locked}
                              title={p.fiscal_year_is_locked ? 'Unlock the fiscal year first (Settings → Fiscal Years)' : undefined}
                              onClick={() => toggleLock(p)}
                            >
                              {p.is_locked ? 'Unlock' : 'Lock'}
                            </Button>
                          </td>
                        </tr>
                      ))
                    : (
                        <tr>
                          <td colSpan={6}>
                            <Empty message={noYears
                              ? 'No fiscal years yet — create one in Settings → Fiscal Years and its period will appear here'
                              : 'No accounting periods — create one to lock/unlock transaction windows'} />
                          </td>
                        </tr>
                      )
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Accounting Period" size="sm">
        <PeriodForm years={years} onClose={() => setModal(false)} onCreated={refreshAll} />
      </Modal>
    </div>
  )
}
