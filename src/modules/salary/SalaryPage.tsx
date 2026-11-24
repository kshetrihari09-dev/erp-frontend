/**
 * SalaryPage.tsx — Staff Salary: processing · employees · advances · components · reports.
 * Route /salary, opened only with `salary.view` (see constants/permissions.ts). Actions inside each tab are further gated by
 * salary.manage / salary.approve / salary.pay / salary.reverse; the API re-checks every one of them.
 */
import { useState } from 'react'
import { Tabs } from '@/components/ui'
import ProcessingTab from './ProcessingTab'
import EmployeesTab from './EmployeesTab'
import AdvancesTab from './AdvancesTab'
import ComponentsTab from './ComponentsTab'
import ReportsTab from './ReportsTab'

const TABS = [
  { id: 'processing', label: 'Salary' }, { id: 'employees', label: 'Employees' }, { id: 'advances', label: 'Advances' },
  { id: 'components', label: 'Components' }, { id: 'reports', label: 'Reports' },
]

export default function SalaryPage() {
  const [tab, setTab] = useState('processing')
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] tracking-widest text-[var(--text-4)] font-mono">ACCOUNTING</div>
        <h1 className="text-xl font-bold">Staff Salary</h1>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'processing' && <ProcessingTab />}
      {tab === 'employees'  && <EmployeesTab />}
      {tab === 'advances'   && <AdvancesTab />}
      {tab === 'components' && <ComponentsTab />}
      {tab === 'reports'    && <ReportsTab />}
    </div>
  )
}
