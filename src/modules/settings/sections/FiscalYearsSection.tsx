import { useState } from 'react'
import { Plus, X, Lock, Unlock, Pencil, CheckCircle2 } from 'lucide-react'
import { useFiscalYears, useInvalidateFiscalData } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'
import { Button, SkeletonRows, Empty } from '@/components/ui'
import { fmtDate } from '@/utils'

const EMPTY_FORM = { name: '', start_date_ad: '', end_date_ad: '', start_date_bs: '', end_date_bs: '' }

function StatusBadges({ y }: { y: any }) {
  const closed = y.status ? y.status === 'CLOSED' : y.is_locked
  return (
    <span className="fy-status">
      {closed ? <span className="badge badge-red">Closed</span> : <span className="badge badge-green">Open</span>}
      {y.is_default && <span className="badge badge-blue ml-1.5">Default</span>}
      {closed && y.year_end_closed && <span className="badge badge-muted ml-1.5" title="Closing entry posted and balances carried forward">Year-end done</span>}
      {closed && y.closed_date && <div className="text-[10px] text-[var(--text-3)] mt-0.5">Closed {fmtDate(String(y.closed_date).slice(0, 10))}</div>}
    </span>
  )
}

export default function FiscalYearsSection() {
  const { data, isLoading } = useFiscalYears()
  const refreshAll = useInvalidateFiscalData()   // fiscal years AND Accounting → Periods
  const { success: toastOk, error: toastErr } = useUIStore()
  // UI mirrors the server's rules (the API enforces them regardless of what is shown here):
  //   view: everyone · create / edit / set current: owner, admin · close (lock): owner or can_lock_periods · reopen: owner only
  const user = useAuthStore(s => s.user)
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const canClose  = user?.role === 'owner' || !!user?.can_lock_periods
  const canReopen = user?.role === 'owner'
  // unwrap returns the array directly: r.data.data = [...fiscal_years]
  const years = Array.isArray(data) ? data : ((data as any)?.data ?? [])

  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [busyId,    setBusyId]    = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  // close / reopen are deliberate: a confirmation (and, for reopen, a written reason) comes first
  const [confirm, setConfirm] = useState<{ kind: 'close' | 'reopen'; y: any } | null>(null)
  const [reason, setReason] = useState('')

  function closeForm() { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }

  function startEdit(y: any) {
    setEditingId(y.id); setShowForm(true)
    setForm({
      name: y.name, start_date_ad: y.start_date_ad || y.start_date || '', end_date_ad: y.end_date_ad || y.end_date || '',
      start_date_bs: y.start_date_bs || '', end_date_bs: y.end_date_bs || '',
    })
  }

  async function handleSave() {
    if (!form.name || !form.start_date_ad || !form.end_date_ad) { toastErr('Name, start date and end date are required'); return }
    if (form.start_date_ad >= form.end_date_ad) { toastErr('End date must be after the start date'); return }
    setSaving(true)
    try {
      // BS dates are optional: when AD dates change and BS is blank the server derives it from AD.
      const payload = { ...form }
      let res: any
      if (editingId) {
        const prev: any = years.find((y: any) => y.id === editingId)
        const adChanged = prev && (prev.start_date_ad !== form.start_date_ad || prev.end_date_ad !== form.end_date_ad)
        if (adChanged) {
          if (prev.start_date_ad !== form.start_date_ad && form.start_date_bs === (prev.start_date_bs || '')) payload.start_date_bs = ''
          if (prev.end_date_ad   !== form.end_date_ad   && form.end_date_bs   === (prev.end_date_bs   || '')) payload.end_date_bs = ''
        }
        res = await settingsAPI.updateFiscalYear(editingId, payload)
        toastOk('Fiscal year updated')
      } else {
        res = await settingsAPI.createFiscalYear(payload)
        toastOk('Fiscal year created')
      }
      const warnings: string[] = res?.data?.data?.warnings ?? []
      if (warnings.length) toastErr('Review needed', warnings[0])
      closeForm()
      refreshAll()
    } catch (e: any) { toastErr('Failed', e.message) }
    finally { setSaving(false) }
  }

  async function run(y: any, fn: () => Promise<unknown>, okMsg: string) {
    setBusyId(y.id)
    try { await fn(); toastOk(okMsg); refreshAll() }
    catch (e: any) { toastErr('Failed', e.message) }
    finally { setBusyId(null) }
  }

  async function submitConfirm() {
    if (!confirm) return
    const { kind, y } = confirm
    if (kind === 'reopen' && reason.trim().length < 10) { toastErr('A reason of at least 10 characters is required'); return }
    setBusyId(y.id)
    try {
      if (kind === 'close') {
        const r: any = await settingsAPI.closeFiscalYear(y.id)
        const d = r?.data?.data
        toastOk(`${y.name} closed`, d ? `Net ${d.net_profit >= 0 ? 'profit' : 'loss'} ${Math.abs(d.net_profit).toLocaleString()} moved to Retained Earnings; ${d.opening_balances?.accounts ?? 0} balances carried into ${d.next_fiscal_year?.name}.` : undefined)
      } else {
        await settingsAPI.reopenFiscalYear(y.id, reason.trim())
        toastOk(`${y.name} reopened`)
      }
      setConfirm(null); setReason(''); refreshAll()
    } catch (e: any) { toastErr('Failed', e?.response?.data?.message || e.message) }
    finally { setBusyId(null) }
  }

  const Actions = ({ y }: { y: any }) => (
    <div className="flex flex-wrap gap-1.5">
      {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={12}/>} disabled={y.is_locked || busyId === y.id}
        title={y.is_locked ? 'Unlock the fiscal year to edit it' : undefined} onClick={() => startEdit(y)}>Edit</Button>}
      {canManage && (!y.is_current || !y.is_active) && (
        <Button size="sm" variant="ghost" icon={<CheckCircle2 size={12}/>} disabled={y.is_locked || y.is_active || busyId === y.id}
          title={y.is_locked ? 'A locked fiscal year cannot be made current' : undefined}
          onClick={() => run(y, () => settingsAPI.activateFiscalYear(y.id), `${y.name} is now the current fiscal year`)}>Set current</Button>
      )}
      {y.is_locked
        ? (canReopen && <Button size="sm" variant="success" className="fy-btn-success" icon={<Unlock size={12}/>} loading={busyId === y.id}
            onClick={() => { setReason(''); setConfirm({ kind: 'reopen', y }) }}>Reopen</Button>)
        : (canClose && <Button size="sm" variant="danger" className="fy-btn-danger" icon={<Lock size={12}/>} loading={busyId === y.id}
            onClick={() => setConfirm({ kind: 'close', y })}>Close year</Button>)}
    </div>
  )

  const label = 'text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5'
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fy-section">
      {canManage && (
        <div className="flex justify-end mb-3">
          <Button variant="primary" size="sm" icon={showForm ? <X size={14}/> : <Plus size={14}/>}
            onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            {showForm ? 'Cancel' : 'Add Fiscal Year'}
          </Button>
        </div>
      )}

      {canManage && showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
          <div className="form-grid">
            <div>
              <label className={label}>Name</label>
              <input className="erp-input" placeholder="e.g. FY 2081/82" maxLength={20} value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label className={label}>Start Date</label>
              <input type="date" className="erp-input" value={form.start_date_ad} onChange={set('start_date_ad')} />
            </div>
            <div>
              <label className={label}>End Date</label>
              <input type="date" className="erp-input" value={form.end_date_ad} onChange={set('end_date_ad')} />
            </div>
            <div>
              <label className={label}>Start Date BS</label>
              <input className="erp-input" placeholder="auto from AD if blank" value={form.start_date_bs} onChange={set('start_date_bs')} />
            </div>
            <div>
              <label className={label}>End Date BS</label>
              <input className="erp-input" placeholder="auto from AD if blank" value={form.end_date_bs} onChange={set('end_date_bs')} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="primary" loading={saving} onClick={handleSave}>{editingId ? 'Save Changes' : 'Save Fiscal Year'}</Button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card fy-confirm" role="dialog" aria-modal="true" data-testid="fy-confirm">
          <p className="font-semibold mb-1">{confirm.kind === 'close' ? `Close ${confirm.y.name}?` : `Reopen ${confirm.y.name}?`}</p>
          {confirm.kind === 'close' ? (
            <ul className="text-sm text-[var(--text-2)] list-disc pl-5 space-y-0.5 mb-3">
              <li>Income and expenses are moved to Retained Earnings with one closing entry dated {fmtDate(confirm.y.end_date_ad || confirm.y.end_date)}.</li>
              <li>Asset, liability and equity balances are carried into the next fiscal year (which must already exist).</li>
              <li>No new vouchers can be posted, edited or deleted in this year. Existing vouchers and reports stay unchanged.</li>
              <li>Draft vouchers in this year must be posted or cancelled first.</li>
            </ul>
          ) : (
            <div className="mb-3">
              <p className="text-sm text-[var(--text-2)] mb-2">The closing entry is reversed and the carried-forward balances are removed. This is recorded in the audit log with your reason. Years must be reopened newest first.</p>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Reason (required)</label>
              <textarea className="erp-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Auditor adjustment: missed Ashadh purchase invoice" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setConfirm(null); setReason('') }} disabled={busyId === confirm.y.id}>Cancel</Button>
            <Button variant={confirm.kind === 'close' ? 'danger' : 'success'} className={confirm.kind === 'close' ? 'fy-btn-danger' : 'fy-btn-success'} loading={busyId === confirm.y.id} onClick={submitConfirm}
              disabled={confirm.kind === 'reopen' && reason.trim().length < 10}>
              {confirm.kind === 'close' ? 'Close fiscal year' : 'Reopen fiscal year'}
            </Button>
          </div>
        </div>
      )}

      <div className="table-card">
        {/* Desktop */}
        <div className="overflow-x-auto stp-desktop-table">
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Start (AD)</th><th>End (AD)</th><th>Start (BS)</th><th>End (BS)</th><th>Periods</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={8} />
                : years.length
                  ? years.map((y: any) => (
                      <tr key={y.id}>
                        <td className="font-semibold">{y.name}</td>
                        <td className="td-mono">{fmtDate(y.start_date_ad || y.start_date)}</td>
                        <td className="td-mono">{fmtDate(y.end_date_ad   || y.end_date)}</td>
                        <td className="td-mono">{y.start_date_bs || '—'}</td>
                        <td className="td-mono">{y.end_date_bs   || '—'}</td>
                        <td className="td-mono">{y.period_count ?? 0}</td>
                        <td><StatusBadges y={y} /></td>
                        <td><Actions y={y} /></td>
                      </tr>
                    ))
                  : <tr><td colSpan={8}><Empty message="No fiscal years configured. Click 'Add Fiscal Year' to create one."/></td></tr>
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
                      <div><StatusBadges y={y} /></div>
                    </div>
                    <div className="stp-fy-grid">
                      <div className="stp-fy-item"><span className="stp-fy-label">Start AD</span><span className="stp-fy-val">{fmtDate(y.start_date_ad || y.start_date)}</span></div>
                      <div className="stp-fy-item"><span className="stp-fy-label">End AD</span><span className="stp-fy-val">{fmtDate(y.end_date_ad || y.end_date)}</span></div>
                      {y.start_date_bs && <div className="stp-fy-item"><span className="stp-fy-label">Start BS</span><span className="stp-fy-val">{y.start_date_bs}</span></div>}
                      {y.end_date_bs   && <div className="stp-fy-item"><span className="stp-fy-label">End BS</span><span className="stp-fy-val">{y.end_date_bs}</span></div>}
                      <div className="stp-fy-item"><span className="stp-fy-label">Periods</span><span className="stp-fy-val">{y.period_count ?? 0}</span></div>
                    </div>
                    <div className="mt-2"><Actions y={y} /></div>
                  </div>
                ))
          }
        </div>
      </div>
    </div>
  )
}
