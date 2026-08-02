/**
 * CompaniesSection.tsx — Settings → Companies
 *
 * Full management view for multi-company: list every company the current
 * user can access, create a new one, edit any of them, switch into one,
 * or mark one as the default that loads after login.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Pencil, Star, ArrowLeftRight, Check, Loader2, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { useUserCompanies, useDeleteCompany, useRestoreCompany } from '@/hooks/useQuery'
import { companiesAPI } from '@/services/api'
import { QK } from '@/constants'
import useUIStore from '@/store/uiStore'
import { switchCompany } from '@/hooks/useCompanySwitch'
import { useSensitiveConfirm } from '@/modules/settings/hooks/useSensitiveConfirm'
import { Button, Modal } from '@/components/ui'
import CompanyFormModal from '@/modules/company/CompanyFormModal'
import type { UserCompany } from '@/types'

export default function CompaniesSection() {
  const { data: companies, isLoading } = useUserCompanies()
  const { success, error } = useUIStore()
  const qc = useQueryClient()
  const { runWithConfirm, dialog: confirmDialog } = useSensitiveConfirm()

  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<UserCompany | null>(null)
  const [busyId, setBusyId]       = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'switch' | 'default' | 'delete' | 'restore' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserCompany | null>(null)
  const [confirmName, setConfirmName]   = useState('')

  const deleteCompany  = useDeleteCompany()
  const restoreCompany = useRestoreCompany()

  function openCreate() { setEditing(null); setFormOpen(true) }
  function openEdit(c: UserCompany) { setEditing(c); setFormOpen(true) }

  async function handleSwitch(c: UserCompany) {
    if (c.is_current || busyId) return
    setBusyId(c.id); setBusyAction('switch')
    try {
      await switchCompany(c.id) // hard-reloads on success
    } catch (e: any) {
      error('Could not switch company', e?.response?.data?.message || e.message)
      setBusyId(null); setBusyAction(null)
    }
  }

  async function handleSetDefault(c: UserCompany) {
    if (c.is_default || busyId) return
    setBusyId(c.id); setBusyAction('default')
    try {
      await companiesAPI.setDefault(c.id)
      await qc.invalidateQueries({ queryKey: [QK.COMPANIES] })
      success('Default company updated')
    } catch (e: any) {
      error('Could not set default', e?.response?.data?.message || e.message)
    } finally {
      setBusyId(null); setBusyAction(null)
    }
  }

  function openDelete(c: UserCompany) {
    if (busyId) return
    setConfirmName('')
    setDeleteTarget(c)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id); setBusyAction('delete')
    try {
      await runWithConfirm(confirmPassword =>
        deleteCompany.mutateAsync({ id: deleteTarget.id, confirmPassword })
      )
      setDeleteTarget(null)
    } catch {
      // toast already shown by useDeleteCompany's onError, or the password
      // modal is now open (handled by useSensitiveConfirm) — nothing more to do
    } finally {
      setBusyId(null); setBusyAction(null)
    }
  }

  async function handleRestore(c: UserCompany) {
    if (busyId) return
    setBusyId(c.id); setBusyAction('restore')
    try {
      await restoreCompany.mutateAsync(c.id)
    } finally {
      setBusyId(null); setBusyAction(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-sm">Your Companies</div>
            <div className="text-xs text-[var(--text-4)] mt-0.5">
              Each company keeps fully separate accounting data, numbering, and settings.
            </div>
          </div>
          <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
            Add Company
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>
        ) : (companies?.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-[var(--text-4)]">No companies yet</div>
        ) : (
          <div className="flex flex-col gap-2">
            {companies!.map((c) => {
              const isDeleted = c.is_active === false
              return (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{
                  borderColor: c.is_current ? 'var(--brand)' : 'var(--border)',
                  background: c.is_current ? 'var(--brand-50, rgba(37,99,235,.05))' : 'transparent',
                  opacity: isDeleted ? 0.6 : 1,
                }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                >
                  <Building2 size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    {c.name}
                    {c.is_default && !isDeleted && (
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>
                        <Star size={10} fill="currentColor" /> Default
                      </span>
                    )}
                    {c.is_current && !isDeleted && (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>Current</span>
                    )}
                    {isDeleted && (
                      <span className="badge badge-red" style={{ fontSize: 10 }}>Deleted</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-4)] truncate">
                    {c.pan_no ? `PAN: ${c.pan_no}` : c.address || '—'}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isDeleted ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={busyId === c.id && busyAction === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      onClick={() => handleRestore(c)}
                      disabled={!!busyId}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      {!c.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={busyId === c.id && busyAction === 'default' ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                          onClick={() => handleSetDefault(c)}
                          disabled={!!busyId}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => openEdit(c)} disabled={!!busyId}>
                        Edit
                      </Button>
                      <Button
                        variant={c.is_current ? 'secondary' : 'primary'}
                        size="sm"
                        icon={c.is_current
                          ? <Check size={13} />
                          : busyId === c.id && busyAction === 'switch' ? <Loader2 size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
                        onClick={() => handleSwitch(c)}
                        disabled={!!busyId || c.is_current}
                      >
                        {c.is_current ? 'Active' : 'Switch'}
                      </Button>
                      <button
                        onClick={() => openDelete(c)}
                        disabled={!!busyId}
                        title="Delete company"
                        className="inline-flex items-center p-1.5 rounded-md
                          text-[var(--text-3)] hover:text-red-500 hover:bg-red-50
                          dark:hover:bg-red-950/20 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      <CompanyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        company={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: [QK.COMPANIES] })}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => (busyId ? null : setDeleteTarget(null))}
        title="Delete company"
        size="sm"
      >
        {deleteTarget && (
          <>
            <div className="flex items-start gap-2.5 mb-4">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-[var(--text-3)]">
                This deactivates <strong>{deleteTarget.name}</strong>. It disappears from your
                active company list and can no longer be switched into — but nothing is
                erased. All its accounts, vouchers, and journal entries are kept exactly as
                they are, and an admin can restore it at any time.
              </p>
            </div>
            <label className="text-xs font-medium text-[var(--text-3)] mb-1.5 block">
              Type <strong>{deleteTarget.name}</strong> to confirm
            </label>
            <input
              autoFocus
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={deleteTarget.name}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)]
                bg-[var(--surface)] mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)} disabled={!!busyId}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={busyId === deleteTarget.id && busyAction === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                onClick={handleConfirmDelete}
                disabled={confirmName !== deleteTarget.name || !!busyId}
              >
                Delete Company
              </Button>
            </div>
          </>
        )}
      </Modal>

      {confirmDialog}
    </div>
  )
}
