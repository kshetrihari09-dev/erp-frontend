/**
 * CompanySwitcher.tsx — the "Company: [ ABC Pharmacy ▼ ]" selector in the
 * top nav. Lists every company the current user can access, lets them
 * switch into one, and offers "+ Add Company" inline.
 */
import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Check, Star, Plus, Loader2 } from 'lucide-react'
import { useUserCompanies } from '@/hooks/useQuery'
import { useQueryClient } from '@tanstack/react-query'
import { QK } from '@/constants'
import { switchCompany } from '@/hooks/useCompanySwitch'
import useUIStore from '@/store/uiStore'
import CompanyFormModal from './CompanyFormModal'

export default function CompanySwitcher() {
  const { data: companies, isLoading } = useUserCompanies()
  const { error } = useUIStore()
  const qc = useQueryClient()

  const [open, setOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = companies?.find((c) => c.is_current)

  async function handleSwitch(id: string) {
    if (switchingId || id === current?.id) { setOpen(false); return }
    setSwitchingId(id)
    try {
      await switchCompany(id) // hard-reloads the app on success
    } catch (e: any) {
      error('Could not switch company', e?.response?.data?.message || e.message)
      setSwitchingId(null)
    }
  }

  return (
    <div ref={boxRef} className="relative" style={{ flexShrink: 0 }}>
      <button
        type="button"
        className="topbar-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: 'auto', padding: '0 10px', fontSize: 12.5, fontWeight: 600,
          color: 'var(--text-3)', whiteSpace: 'nowrap',
        }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Switch company"
      >
        <Building2 size={13} />
        <span className="max-w-[140px] truncate">{current?.name || (isLoading ? 'Loading…' : 'Select company')}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="topbar-dropdown" style={{ minWidth: 260 }}>
          <div className="topbar-dropdown-header">
            <span className="topbar-dropdown-title">Companies</span>
          </div>
          <div className="topbar-dropdown-list">
            {(companies || []).map((c) => (
              <div
                key={c.id}
                className="topbar-notif-item"
                style={{ cursor: switchingId ? 'wait' : 'pointer', opacity: switchingId && switchingId !== c.id ? 0.5 : 1 }}
                onClick={() => handleSwitch(c.id)}
              >
                <span
                  className="topbar-notif-icon"
                  style={{
                    background: c.is_current ? 'var(--brand-50, rgba(37,99,235,.1))' : 'var(--surface-2)',
                    color: c.is_current ? 'var(--brand)' : 'var(--text-3)',
                  }}
                >
                  {switchingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="topbar-notif-title truncate flex items-center gap-1.5">
                    {c.name}
                    {c.is_default && <Star size={11} fill="currentColor" style={{ color: 'var(--amber)' }} />}
                  </div>
                  {c.pan_no && <div className="topbar-notif-sub truncate">PAN: {c.pan_no}</div>}
                </div>
                {c.is_current && <Check size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} />}
              </div>
            ))}
            {!isLoading && (companies?.length ?? 0) === 0 && (
              <div className="topbar-dropdown-empty">No companies yet</div>
            )}
          </div>
          <div className="topbar-dropdown-list" style={{ padding: 4, borderTop: '1px solid var(--sidebar-line, var(--border))' }}>
            <div
              className="topbar-notif-item"
              onClick={() => { setOpen(false); setFormOpen(true) }}
            >
              <span className="topbar-notif-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                <Plus size={14} />
              </span>
              <div className="topbar-notif-title">Add Company</div>
            </div>
          </div>
        </div>
      )}

      <CompanyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: [QK.COMPANIES] })}
      />
    </div>
  )
}
