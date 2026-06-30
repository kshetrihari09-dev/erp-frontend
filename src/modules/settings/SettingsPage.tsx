import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Save, Plus, Shield } from 'lucide-react'
import { useCompanySettings, useUsers, useAuditLog, useFiscalYears } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import { Button, Tabs, Modal, Badge, Pagination, SkeletonRows, Empty } from '@/components/ui'
import { fmtDateTime, fmtDate } from '@/utils'
import { USER_ROLES } from '@/constants'
import type { User } from '@/types'
import TemplateTab from './TemplateTab'
import CloudStorageTab from './CloudStorageTab'

const TABS = [
  { id: 'company',    label: 'Company'        },
  { id: 'users',      label: 'Users'          },
  { id: 'fiscal',     label: 'Fiscal Years'   },
  { id: 'template',   label: 'Print Template' },
  { id: 'cloud_storage', label: 'Cloud Storage' },
  { id: 'audit',      label: 'Audit Log'      },
]

// ─── Company tab ──────────────────────────────────────────────────────────────
function CompanyTab() {
  const { success, error } = useUIStore()
  const setCompany = useAuthStore(s => s.setCompany)
  const { data: company, isLoading } = useCompanySettings()

  const { register, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm({
    defaultValues: {
      name: '', address: '', phone: '', email: '',
      pan_no: '', registration_no: '', invoice_prefix: 'INV',
      currency: 'NPR', vat_percent: 13,
    },
  })

  useEffect(() => {
    if (company) {
      reset({
        name:             company.name || '',
        address:          company.address || '',
        phone:            company.phone || '',
        email:            company.email || '',
        pan_no:           company.pan_no || '',
        registration_no:  company.registration_no || '',
        invoice_prefix:   company.invoice_prefix || 'INV',
        currency:         company.currency || 'NPR',
        vat_percent:      company.vat_percent || 13,
      })
    }
  }, [company])

  const onSubmit = handleSubmit(async (data) => {
    try {
      const r = await settingsAPI.updateCompany(data)
      if (r.data.data) setCompany(r.data.data)
      success('Company settings saved')
    } catch (e: any) { error('Save failed', e.message) }
  })

  if (isLoading) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-4">Company Information</div>
        <div className="form-grid">
          <div style={{ gridColumn: 'span 2' }}>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Company Name *</label>
            <input className="erp-input" {...register('name')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Phone</label>
            <input className="erp-input" {...register('phone')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Email</label>
            <input type="email" className="erp-input" {...register('email')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">PAN / VAT No</label>
            <input className="erp-input" {...register('pan_no')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Registration No</label>
            <input className="erp-input" {...register('registration_no')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Invoice Prefix</label>
            <input className="erp-input" placeholder="INV" {...register('invoice_prefix')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">VAT %</label>
            <input type="number" className="erp-input" {...register('vat_percent')} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Address</label>
            <input className="erp-input" placeholder="Kathmandu, Nepal" {...register('address')} />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <Button variant="primary" icon={<Save size={14}/>} loading={isSubmitting} onClick={onSubmit}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UserForm({ onClose }: { onClose: () => void }) {
  const { success, error } = useUIStore()
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { name: '', email: '', password: '', phone: '', role: 'cashier' },
  })

  const onSubmit = handleSubmit(async (data) => {
    try {
      await settingsAPI.createUser(data as any)
      success('User created')
      onClose()
    } catch (e: any) { error('Failed', e.message) }
  })

  return (
    <>
      <div className="form-grid">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Full Name *</label>
          <input className="erp-input" {...register('name')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Phone</label>
          <input className="erp-input" {...register('phone')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Email *</label>
          <input type="email" className="erp-input" {...register('email')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Password *</label>
          <input type="password" className="erp-input" {...register('password')} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Role</label>
          <select className="erp-input" {...register('role')}>
            {USER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>Create User</Button>
      </div>
    </>
  )
}

function UsersTab() {
  const [modal, setModal] = useState(false)
  const { data, isLoading } = useUsers()
  const users = (data?.data as User[]) || []

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)}>Add User</Button>
      </div>
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last Login</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : users.length
                  ? users.map(u => (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.name}</td>
                        <td className="td-mono">{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td><span className="badge badge-purple">{u.role}</span></td>
                        <td>{u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}</td>
                        <td className="td-mono text-[var(--text-4)]">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No users found"/></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add User" size="md">
        <UserForm onClose={() => setModal(false)} />
      </Modal>
    </div>
  )
}

// ─── Fiscal years tab ─────────────────────────────────────────────────────────
function FiscalTab() {
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
        <Button variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Fiscal Year'}
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
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Start (AD)</th><th>End (AD)</th><th>Start (BS)</th><th>End (BS)</th><th>Locked</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : years.length
                  ? years.map((y: any) => (
                      <tr key={y.id}>
                        <td className="font-semibold">{y.name}</td>
                        {/* Backend columns: start_date_ad / end_date_ad (not start_date / end_date) */}
                        <td className="td-mono">{fmtDate(y.start_date_ad || y.start_date)}</td>
                        <td className="td-mono">{fmtDate(y.end_date_ad   || y.end_date)}</td>
                        <td className="td-mono">{y.start_date_bs || '—'}</td>
                        <td className="td-mono">{y.end_date_bs   || '—'}</td>
                        <td>{y.is_locked ? <span className="badge badge-red">Locked</span> : <span className="badge badge-green">Open</span>}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No fiscal years configured. Click '+ Add Fiscal Year' to create one."/></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Audit log tab ────────────────────────────────────────────────────────────
function AuditTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAuditLog({ page, limit: 30 })
  const rows  = (data?.data  as any[]) || []
  const total = (data?.pagination as any)?.total || 0

  return (
    <div className="table-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Shield size={14} className="text-[var(--text-4)]"/>
        <span className="font-semibold text-sm">Audit Trail</span>
      </div>
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {isLoading
              ? <SkeletonRows cols={6} />
              : rows.length
                ? rows.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="td-mono text-[var(--text-3)]">{fmtDateTime(l.created_at)}</td>
                      <td className="font-semibold">{l.user_name}</td>
                      <td><span className={`badge ${l.action?.includes('DELETE') || l.action?.includes('CANCEL') ? 'badge-red' : l.action?.includes('CREATE') ? 'badge-green' : 'badge-blue'}`}>{l.action}</span></td>
                      <td className="td-mono">{l.entity_type || l.entity || '—'}</td>
                      <td className="max-w-[200px] truncate text-[var(--text-3)] text-xs">
                        {l.payload_after
                          ? (typeof l.payload_after === 'string'
                              ? l.payload_after.slice(0, 80)
                              : JSON.stringify(l.payload_after).slice(0, 80))
                          : l.new_value || '—'}
                      </td>
                      <td className="td-mono text-[var(--text-4)]">{l.ip_address || '—'}</td>
                    </tr>
                  ))
                : <tr><td colSpan={6}><Empty message="No audit entries"/></td></tr>
            }
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} limit={30} onChange={setPage} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab, setTab] = useState('company')

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">System</div><h1 className="page-title">Settings</h1></div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'company'  && <CompanyTab />}
      {tab === 'users'    && <UsersTab />}
      {tab === 'fiscal'   && <FiscalTab />}
      {tab === 'audit'    && <AuditTab />}
      {tab === 'template' && <TemplateTab />}
      {tab === 'cloud_storage' && <CloudStorageTab />}
    </div>
  )
}
