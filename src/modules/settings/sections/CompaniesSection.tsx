/**
 * CompaniesSection.tsx — Settings → Companies
 *
 * Full management view for multi-company: list every company the current
 * user can access, create a new one, edit any of them, switch into one,
 * or mark one as the default that loads after login.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Pencil, Star, ArrowLeftRight, Check, Loader2 } from 'lucide-react'
import { useUserCompanies } from '@/hooks/useQuery'
import { companiesAPI } from '@/services/api'
import { QK } from '@/constants'
import useUIStore from '@/store/uiStore'
import { switchCompany } from '@/hooks/useCompanySwitch'
import { Button } from '@/components/ui'
import CompanyFormModal from '@/modules/company/CompanyFormModal'
import type { UserCompany } from '@/types'

export default function CompaniesSection() {
  const { data: companies, isLoading } = useUserCompanies()
  const { success, error } = useUIStore()
  const qc = useQueryClient()

  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<UserCompany | null>(null)
  const [busyId, setBusyId]       = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'switch' | 'default' | null>(null)

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
            {companies!.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{
                  borderColor: c.is_current ? 'var(--brand)' : 'var(--border)',
                  background: c.is_current ? 'var(--brand-50, rgba(37,99,235,.05))' : 'transparent',
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
                    {c.is_default && (
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>
                        <Star size={10} fill="currentColor" /> Default
                      </span>
                    )}
                    {c.is_current && (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>Current</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-4)] truncate">
                    {c.pan_no ? `PAN: ${c.pan_no}` : c.address || '—'}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CompanyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        company={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: [QK.COMPANIES] })}
      />
    </div>
  )
}
