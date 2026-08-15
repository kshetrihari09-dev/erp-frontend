import {
  SlidersHorizontal, Building2, Building, ShoppingCart, Calculator, Users,
  CalendarRange, Printer, CloudCog, Bell, Shield,
} from 'lucide-react'

export interface SettingsSection {
  id: string
  label: string
  icon: React.ReactNode
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general',       label: 'General',              icon: <SlidersHorizontal size={15}/> },
  { id: 'company',       label: 'Company',               icon: <Building2 size={15}/> },
  { id: 'companies',     label: 'Companies',             icon: <Building size={15}/> },
  { id: 'sales-purchase',label: 'Sales & Purchase',      icon: <ShoppingCart size={15}/> },
  { id: 'accounting',    label: 'Accounting & Vouchers', icon: <Calculator size={15}/> },
  { id: 'users',         label: 'Users & Permissions',   icon: <Users size={15}/> },
  { id: 'fiscal-years',  label: 'Fiscal Years',          icon: <CalendarRange size={15}/> },
  { id: 'printing',      label: 'Printing',              icon: <Printer size={15}/> },
  { id: 'backup',        label: 'Backup & Cloud',        icon: <CloudCog size={15}/> },
  { id: 'notifications', label: 'Notifications',         icon: <Bell size={15}/> },
  { id: 'audit-log',     label: 'Audit Log',             icon: <Shield size={15}/> },
]

export default function SettingsNav({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <>
      {/* Desktop: sticky left nav */}
      <nav className="stp-nav" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map(s => (
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
          {SETTINGS_SECTIONS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
    </>
  )
}
