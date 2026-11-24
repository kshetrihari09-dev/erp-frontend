/** EmployeesTab.tsx — employee register: add / edit / activate-deactivate, see outstanding salary, open the salary ledger. */
import { useState } from 'react'
import { Plus, BookOpen, Pencil } from 'lucide-react'
import { Button, Select, SearchInput, Badge, Empty, SkeletonRows, Pagination, TableWrap } from '@/components/ui'
import useAuthStore from '@/store/authStore'
import { fmt } from '@/utils'
import { useSalaryEmployees, useSalaryEmployee } from '@/hooks/useSalary'
import { EmployeeFormModal, EmployeeLedgerModal } from './EmployeeModals'

export default function EmployeesTab() {
  const can = useAuthStore((s) => s.can)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<{ open: boolean; id?: string }>({ open: false })
  const [ledgerFor, setLedgerFor] = useState<any>(null)
  const { data, isLoading } = useSalaryEmployees({ search: search || undefined, status: status || undefined, page, limit: 50 })
  const { data: editing } = useSalaryEmployee(form.id)          // full record (default components) for the edit form
  const rows = data?.data || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search name, ID or designation…" /></div>
        <div style={{ width: 160 }}><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} placeholder="All" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></div>
        {can('salary.manage') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ open: true })}>New employee</Button>}
      </div>

      <TableWrap>
        <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Designation</th><th className="text-right">Basic salary</th><th>Payment</th><th className="text-right">Outstanding</th><th>Status</th><th /></tr></thead>
        <tbody>
          {isLoading ? <SkeletonRows cols={9} rows={5} /> : rows.length === 0 ? <tr><td colSpan={9}><Empty message="No employees yet" /></td></tr> : rows.map((e: any) => (
            <tr key={e.id}>
              <td className="font-mono text-xs">{e.employee_code}</td>
              <td className="font-semibold">{e.name}</td><td>{e.department || '—'}</td><td>{e.designation || '—'}</td>
              <td className="text-right tabular-nums">{fmt(e.basic_salary)}</td><td className="capitalize">{e.payment_method}</td>
              <td className="text-right tabular-nums">{e.outstanding > 0 ? fmt(e.outstanding) : '—'}</td>
              <td><Badge className={e.status === 'active' ? 'badge-green' : 'badge-muted'}>{e.status === 'active' ? 'Active' : 'Inactive'}</Badge></td>
              <td className="whitespace-nowrap text-right">
                <Button size="sm" icon={<BookOpen size={13} />} onClick={() => setLedgerFor(e)}>Ledger</Button>{' '}
                {can('salary.manage') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setForm({ open: true, id: e.id })}>Edit</Button>}
              </td>
            </tr>))}
        </tbody>
      </TableWrap>
      <Pagination page={page} total={data?.pagination?.total || 0} limit={50} onChange={setPage} />

      <EmployeeFormModal open={form.open && (!form.id || !!editing)} onClose={() => setForm({ open: false })} employee={form.id ? editing : undefined} />
      <EmployeeLedgerModal employee={ledgerFor} onClose={() => setLedgerFor(null)} />
    </div>
  )
}
