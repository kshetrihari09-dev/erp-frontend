import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, Copy, Check, KeyRound } from 'lucide-react'
import { useUsers } from '@/hooks/useQuery'
import { settingsAPI, authAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Modal, SkeletonRows, Empty, ToggleSwitch } from '@/components/ui'
import { fmtDateTime } from '@/utils'
import { USER_ROLES, QK } from '@/constants'
import type { User } from '@/types'

// ── Small display helpers ────────────────────────────────────────────────────
/** Monospace ID chip with tap-to-copy. `full` is copied; `text` is what is shown. */
function IdChip({ text, full, title }: { text: string; full?: string; title?: string }) {
  const [done, setDone] = useState(false)
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(full ?? text); setDone(true); setTimeout(() => setDone(false), 1200) } catch { /* clipboard unavailable */ }
  }
  return (
    <button type="button" onClick={copy} title={title ?? `Copy ${full ?? text}`}
      className="inline-flex items-center gap-1.5 max-w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-2)] hover:border-[var(--brand)]">
      <span className="truncate">{text}</span>
      {done ? <Check size={11} className="text-[var(--green,#16a34a)] shrink-0" /> : <Copy size={11} className="opacity-60 shrink-0" />}
    </button>
  )
}
/** Role ID chips for a user: one per role credential (a user may hold several), disabled ones struck through. */
function RoleIds({ user }: { user: User }) {
  const cr = user.role_credentials || []
  if (!cr.length) return <span className="text-[11px] text-[var(--text-4)]" title="Not set up yet — the user creates it at their next sign-in">Not set up</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {cr.map(c => (
        <span key={c.role} className={c.is_active ? '' : 'opacity-50 line-through'} title={`${c.role}${c.is_active ? '' : ' (disabled)'}${c.locked ? ' (locked)' : ''}`}>
          <IdChip text={c.role_code} />
        </span>
      ))}
    </div>
  )
}
const shortId = (id: string) => (id ? `${id.slice(0, 8)}…` : '—')

// ── Role credentials panel (inside the Permissions dialog) ───────────────────
function RoleCredentialsPanel({ user }: { user: User }) {
  const { success, error } = useUIStore()
  const qc = useQueryClient()
  const [role, setRole] = useState<string>(user.role)
  const [roleId, setRoleId] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const cr = user.role_credentials || []
  const refresh = () => qc.invalidateQueries({ queryKey: [QK.USERS] })

  async function toggle(r: string, active: boolean) {
    try { await authAPI.setUserRoleCredentialActive(user.id, r, active); success(active ? 'Role enabled' : 'Role disabled'); refresh() }
    catch (e: any) { error('Failed', e?.message) }
  }
  async function save() {
    if (pw.length < 8) { error('Role Password must be at least 8 characters'); return }
    setBusy(true)
    try {
      const res = await authAPI.setUserRoleCredential(user.id, { role, role_id: roleId.trim() || undefined, role_password: pw })
      success('Role credential saved', `Role ID: ${(res.data as any)?.data?.role_code ?? ''}`)
      setPw(''); setRoleId(''); refresh()
    } catch (e: any) { error('Failed', e?.message) } finally { setBusy(false) }
  }

  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-2"><KeyRound size={14} /><span className="text-sm font-semibold">Login Role IDs</span></div>
      <p className="text-[11px] text-[var(--text-4)] mb-3">
        Used in the second sign-in step. The Role Password is stored hashed and can never be viewed — only reset.
      </p>
      {cr.length === 0 ? (
        <p className="text-xs text-[var(--text-3)] mb-3">No Role ID yet — {user.name} will create one at their next sign-in, or you can set one below.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border)] mb-3">
          {cr.map(c => (
            <div key={c.role} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium capitalize">{c.role}{c.locked && <span className="badge badge-red ml-2">Locked</span>}</div>
                <IdChip text={c.role_code} />
              </div>
              <ToggleSwitch checked={c.is_active} onChange={v => toggle(c.role, v)} />
            </div>
          ))}
        </div>
      )}
      <div className="form-grid">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Role</label>
          <select className="erp-input" value={role} onChange={e => setRole(e.target.value)}>
            {USER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Role ID (optional)</label>
          <input className="erp-input" value={roleId} onChange={e => setRoleId(e.target.value)} placeholder="Generated if blank" autoComplete="off" />
        </div>
        <div className="stp-span2">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">New Role Password</label>
          <input type="password" className="erp-input" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button variant="secondary" loading={busy} onClick={save}>{cr.some(c => c.role === role) ? 'Reset Role Credential' : 'Add Role Credential'}</Button>
      </div>
    </div>
  )
}

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
      <RoleCredentialsPanel user={user} />
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
          <table className="erp-table stp-users-table">
            <thead><tr><th>Name / User ID</th><th>Email</th><th>Phone</th><th>Role</th><th>Role ID</th><th>Status</th><th>Last Login</th><th>Permissions</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={8} />
                : users.length
                  ? users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className="font-semibold">{u.name}</div>
                          <div className="mt-1"><IdChip text={shortId(u.id)} full={u.id} title={`User ID ${u.id} — click to copy`} /></div>
                        </td>
                        <td className="td-mono text-[11.5px] whitespace-nowrap">{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td><span className="badge badge-purple">{u.role}</span></td>
                        <td><RoleIds user={u} /></td>
                        <td>{u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}</td>
                        <td className="td-mono text-[11px] text-[var(--text-4)]">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
                        <td>
                          <Button variant="secondary" size="sm" icon={<ShieldCheck size={13}/>} onClick={() => setPermUser(u)}>Edit</Button>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={8}><Empty message="No users found"/></td></tr>
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
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] uppercase tracking-wide text-[var(--text-4)] w-14">User ID</span><IdChip text={shortId(u.id)} full={u.id} title={`User ID ${u.id} — tap to copy`} /></div>
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] uppercase tracking-wide text-[var(--text-4)] w-14">Role ID</span><RoleIds user={u} /></div>
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
      {permUser && <PermissionsModal user={users.find(x => x.id === permUser.id) ?? permUser} onClose={() => setPermUser(null)} />}
    </div>
  )
}
