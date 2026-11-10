import {
  SlidersHorizontal, Building2, Building, ShoppingCart, Calculator, Users,
  CalendarRange, Printer, CloudCog, Bell, Shield, Smartphone,
} from 'lucide-react'

export interface SettingsSection {
  id: string
  label: string
  icon: React.ReactNode
  /** ANY-OF: the section is shown / reachable only to users holding one of these server-provided permissions. */
  requires: string[]
}

/** A section is shown (and its ?section= URL honoured) only to users holding ANY of `requires`. */
export const sectionAllowed = (sec: SettingsSection, permissions?: readonly string[] | null) =>
  !!permissions && sec.requires.some((p) => permissions.includes(p))

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general',       label: 'General',              icon: <SlidersHorizontal size={15}/>, requires: ['settings.view'] },
  { id: 'company',       label: 'Company',               icon: <Building2 size={15}/>, requires: ['settings.view'] },
  { id: 'companies',     label: 'Companies',             icon: <Building size={15}/>, requires: ['settings.company.manage'] },
  { id: 'sales-purchase',label: 'Sales & Purchase',      icon: <ShoppingCart size={15}/>, requires: ['settings.view'] },
  { id: 'accounting',    label: 'Accounting & Vouchers', icon: <Calculator size={15}/>, requires: ['settings.view'] },
  { id: 'users',         label: 'Users & Permissions',   icon: <Users size={15}/>, requires: ['settings.users.manage'] },
  { id: 'fiscal-years',  label: 'Fiscal Years',          icon: <CalendarRange size={15}/>, requires: ['settings.view'] },
  { id: 'devices-sync',  label: 'Devices & Sync',        icon: <Smartphone size={15}/>, requires: ['settings.view'] },
  { id: 'printing',      label: 'Printing',              icon: <Printer size={15}/>, requires: ['settings.view'] },
  { id: 'backup',        label: 'Backup & Cloud',        icon: <CloudCog size={15}/>, requires: ['settings.edit'] },
  { id: 'notifications', label: 'Notifications',         icon: <Bell size={15}/>, requires: ['settings.view'] },
  { id: 'audit-log',     label: 'Audit Log',             icon: <Shield size={15}/>, requires: ['audit.view'] },
]

export default function SettingsNav({ active, onChange, sections = SETTINGS_SECTIONS }: { active: string; onChange: (id: string) => void; sections?: SettingsSection[] }) {
  return (
    <>
      {/* Desktop: sticky left nav */}
      <nav className="stp-nav" aria-label="Settings sections">
        {sections.map(s => (
          <button
            key={s.id}
            type="button"
            className={`stp-nav-item ${active === s.id ? 'stp-nav-item--active' : ''}`}
            onClick={() => onChange(s.id)}
            aria-current={active === s.id ? 'page' : undefined}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>

      {/* Mobile: dropdown selector */}
      <div className="stp-nav-mobile">
        <select
          className="erp-input"
          value={active}
          onChange={e => onChange(e.target.value)}
          aria-label="Settings section"
        >
          {sections.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
    </>
  )
}
