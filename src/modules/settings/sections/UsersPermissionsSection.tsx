import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { useUsers } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Modal, SkeletonRows, Empty, ToggleSwitch } from '@/components/ui'
import { fmtDateTime } from '@/utils'
import { USER_ROLES, QK } from '@/constants'
import type { User } from '@/types'

// ─── Create user form ──────────────────────────────────────────────────────────
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
        <div className="stp-span2">
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

// ─── Real, backend-enforced permission flags editor ────────────────────────────
const FLAGS: { key: keyof User; label: string; desc: string }[] = [
  { key: 'can_post_vouchers',    label: 'Post Vouchers',    desc: 'Can post (finalize) a voucher into the ledger.' },
  { key: 'can_approve_vouchers', label: 'Approve Vouchers', desc: 'Can approve vouchers awaiting sign-off.' },
  { key: 'can_lock_periods',     label: 'Lock Fiscal Periods', desc: 'Can lock/unlock a fiscal period from Accounting.' },
  { key: 'can_reverse_entries',  label: 'Reverse / Edit Posted Vouchers', desc: 'Can reverse posted entries and edit already-posted vouchers.' },
]

function PermissionsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { success, error } = useUIStore()
  const qc = useQueryClient()
  const [flags, setFlags] = useState<Record<string, boolean>>({
    can_post_vouchers: !!user.can_post_vouchers,
    can_approve_vouchers: !!user.can_approve_vouchers,
    can_lock_periods: !!user.can_lock_periods,
    can_reverse_entries: !!user.can_reverse_entries,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await settingsAPI.updateUser(user.id, flags)
      qc.invalidateQueries({ queryKey: [QK.USERS] })
      success('Permissions updated')
      onClose()
    } catch (e: any) { error('Failed to update permissions', e?.response?.data?.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Permissions — ${user.name}`} size="md">
      <p className="text-xs text-[var(--text-4)] mb-3">
        These flags are enforced by the backend on every request — not just cosmetic.
      </p>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {FLAGS.map(f => (
          <div key={f.key} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium">{f.label}</div>
              <p className="text-[11px] text-[var(--text-4)]">{f.desc}</p>
            </div>
            <ToggleSwitch checked={!!flags[f.key as string]} onChange={v => setFlags(s => ({ ...s, [f.key]: v }))} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save}>Save Permissions</Button>
      </div>
    </Modal>
  )
}

// Read-only role capability reference — read from the SERVER's authoritative matrix
// (GET /settings/roles-matrix -> backend src/rbac/permissions.js). This screen carries no role table of its own.
type Matrix = { roles: string[]; permissions: string[]; grants: Record<string, string[]>; flagBacked: Record<string, string> }

function RoleMatrix() {
  const { data } = useQuery({
    queryKey: ['roles-matrix'],
    queryFn: () => settingsAPI.rolesMatrix().then((r: any) => r.data.data as Matrix),
    staleTime: 5 * 60_000,
  })
  const modules = ['sales', 'purchases', 'products', 'stock', 'parties', 'accounting', 'reports', 'settings']
  // per module: "Edit" = holds at least one non-view permission, "View" = only *.view, "--" = none
  const level = (perms: string[], mod: string) => {
    const own = perms.filter((p) => p.startsWith(`${mod}.`))
    if (!own.length) return 'none'
    return own.some((p) => !p.endsWith('.view')) ? 'edit' : 'view'
  }
  const roles = data?.roles ?? []
  const label = (r: string) => USER_ROLES.find((x) => x.value === r)?.label ?? r.charAt(0).toUpperCase() + r.slice(1)

  return (
    <div className="table-card mt-4">
      <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">Role Capability Reference</div>
      <div className="overflow-x-auto stp-desktop-table">
        <table className="erp-table">
          <thead><tr><th>Role</th>{modules.map(m => <th key={m} className="capitalize">{m}</th>)}</tr></thead>
          <tbody>
            {roles.map(r => (
              <tr key={r}>
                <td className="font-semibold">{label(r)}</td>
                {modules.map(m => {
                  const lv = level(data!.grants[r] || [], m)
                  return <td key={m}>{lv === 'edit' ? <span className="badge badge-green">Edit</span> : lv === 'view' ? <span className="badge badge-blue">View</span> : <span className="badge badge-red">--</span>}</td>
                })}
              </tr>
            ))}
            {!data && <tr><td colSpan={modules.length + 1} className="text-center text-[var(--text-3)] py-4">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--text-4)] px-4 py-2">
        Roles are fixed by the app and enforced by the server. The per-user switches above (post / approve / reverse / lock) refine accounting actions
        within a role; read-only roles (Viewer, Auditor) can never hold them.
      </p>
    </div>
  )
}

// ─── Main section ──────────────────────────────────────────────────────────────
export default function UsersPermissionsSection() {
  const [modal, setModal] = useState(false)
  const [permUser, setPermUser] = useState<User | null>(null)
  const { data, isLoading } = useUsers()
  const users = (data?.data as User[]) || []

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)}>Add User</Button>
      </div>
      <div className="table-card">
        {/* Desktop */}
        <div className="overflow-x-auto stp-desktop-table">
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last Login</th><th>Permissions</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={7} />
                : users.length
                  ? users.map(u => (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.name}</td>
                        <td className="td-mono">{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td><span className="badge badge-purple">{u.role}</span></td>
                        <td>{u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}</td>
                        <td className="td-mono text-[var(--text-4)]">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
                        <td>
                          <Button variant="secondary" size="sm" icon={<ShieldCheck size={13}/>} onClick={() => setPermUser(u)}>Edit</Button>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={7}><Empty message="No users found"/></td></tr>
              }
            </tbody>
          </table>
        </div>
        {/* Mobile */}
        <div className="stp-mobile-list">
          {isLoading
            ? [1,2,3].map(i => <div key={i} className="stp-card stp-card-skel"/>)
            : users.length === 0
              ? <Empty message="No users found"/>
              : users.map(u => (
                  <div key={u.id} className="stp-card" onClick={() => setPermUser(u)} role="button">
                    <div className="stp-card-top">
                      <div className="stp-card-avatar">{u.name?.[0]?.toUpperCase() ?? '?'}</div>
                      <div className="stp-card-main">
                        <p className="stp-card-title">{u.name}</p>
                        <p className="stp-card-sub">{u.email}</p>
                      </div>
                      {u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}
                    </div>
                    <div className="stp-card-chips">
                      <span className="badge badge-purple">{u.role}</span>
                      {u.phone && <span className="stp-card-meta">{u.phone}</span>}
                    </div>
                    <div className="stp-card-footer">Last login: {u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'} · Tap to edit permissions</div>
                  </div>
                ))
          }
        </div>
      </div>

      <RoleMatrix />

      <Modal open={modal} onClose={() => setModal(false)} title="Add User" size="md">
        <UserForm onClose={() => setModal(false)} />
      </Modal>
      {permUser && <PermissionsModal user={permUser} onClose={() => setPermUser(null)} />}
    </div>
  )
}
