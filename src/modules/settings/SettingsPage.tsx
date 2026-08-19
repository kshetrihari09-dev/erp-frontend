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
import SettingsNav, { SETTINGS_SECTIONS } from './SettingsNav'

import GeneralSection         from './sections/GeneralSection'
import CompanySection         from './sections/CompanySection'
import CompaniesSection       from './sections/CompaniesSection'
import SalesPurchaseSection   from './sections/SalesPurchaseSection'
import AccountingSection      from './sections/AccountingSection'
import UsersPermissionsSection from './sections/UsersPermissionsSection'
import FiscalYearsSection     from './sections/FiscalYearsSection'
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
  'printing':       PrintingSection,
  'backup':         BackupCloudSection,
  'notifications':  NotificationsSection,
  'audit-log':      AuditLogSection,
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = SETTINGS_SECTIONS.some(s => s.id === searchParams.get('section'))
    ? (searchParams.get('section') as string)
    : 'general'
  const [active, setActive] = useState(initial)

  function handleChange(id: string) {
    setActive(id)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('section', id)
      return next
    }, { replace: true })
  }

  const ActiveSection = SECTION_COMPONENTS[active] || GeneralSection
  const activeLabel = SETTINGS_SECTIONS.find(s => s.id === active)?.label || 'General'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">System</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <div className="stp-shell">
        <SettingsNav active={active} onChange={handleChange} />
        <div className="stp-content">
          <div className="font-bold text-[15px] mb-3">{activeLabel}</div>
          <div key={active}>
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  )
}
