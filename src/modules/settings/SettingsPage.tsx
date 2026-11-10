/**
 * SettingsPage.tsx — ERP Settings Center
 *
 * Responsive shell: a left navigation panel (desktop) / dropdown (mobile)
 * plus a content panel showing one section at a time. Each section is its
 * own file under ./sections — this file only owns navigation + layout.
 *
 * The active section is kept in the URL (?section=general) so it survives
 * a refresh and can be linked to directly, same pattern as AccountingPage.
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SettingsNav, { SETTINGS_SECTIONS, sectionAllowed } from './SettingsNav'
import useAuthStore from '@/store/authStore'
import AccessDenied from '@/components/shared/AccessDenied'

import GeneralSection         from './sections/GeneralSection'
import CompanySection         from './sections/CompanySection'
import CompaniesSection       from './sections/CompaniesSection'
import SalesPurchaseSection   from './sections/SalesPurchaseSection'
import AccountingSection      from './sections/AccountingSection'
import UsersPermissionsSection from './sections/UsersPermissionsSection'
import FiscalYearsSection     from './sections/FiscalYearsSection'
import DevicesSyncSection     from './sections/DevicesSyncSection'
import PrintingSection        from './sections/PrintingSection'
import BackupCloudSection     from './sections/BackupCloudSection'
import NotificationsSection   from './sections/NotificationsSection'
import AuditLogSection        from './sections/AuditLogSection'

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  'general':        GeneralSection,
  'company':        CompanySection,
  'companies':      CompaniesSection,
  'sales-purchase': SalesPurchaseSection,
  'accounting':     AccountingSection,
  'users':          UsersPermissionsSection,
  'fiscal-years':   FiscalYearsSection,
  'devices-sync':   DevicesSyncSection,
  'printing':       PrintingSection,
  'backup':         BackupCloudSection,
  'notifications':  NotificationsSection,
  'audit-log':      AuditLogSection,
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Only the sections this user's permissions cover. A ?section= in the URL that is not one of them is ignored, so a
  // hidden section cannot be reached by editing the address bar (its API is separately protected by the server).
  const permissions = useAuthStore((s) => s.user?.permissions)
  const sections = SETTINGS_SECTIONS.filter((sec) => sectionAllowed(sec, permissions))
  const wanted = searchParams.get('section')
  const initial = sections.some(s => s.id === wanted) ? (wanted as string) : (sections[0]?.id ?? 'general')
  const [active, setActive] = useState(initial)
  const activeAllowed = sections.some(s => s.id === active)

  function handleChange(id: string) {
    setActive(id)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('section', id)
      return next
    }, { replace: true })
  }

  if (!sections.length) return <AccessDenied />
  const shown = activeAllowed ? active : sections[0].id
  const ActiveSection = SECTION_COMPONENTS[shown] || GeneralSection
  const activeLabel = sections.find(s => s.id === shown)?.label || 'General'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">System</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <div className="stp-shell">
        <SettingsNav active={shown} sections={sections} onChange={handleChange} />
        <div className="stp-content">
          <div className="font-bold text-[15px] mb-3">{activeLabel}</div>
          <div key={shown}>
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  )
}
