/** EmployeeModals.tsx — employee create/edit form (incl. default salary components) and the employee-wise salary ledger. */
import { useEffect, useState } from 'react'
import { Plus, Trash2, Download } from 'lucide-react'
import { Modal, Button, Input, Select, Spinner, TableWrap, Empty } from '@/components/ui'
import { fmt, downloadCSV } from '@/utils'
import { useCreateEmployee, useUpdateEmployee, useSalaryComponents, useEmployeeLedger } from '@/hooks/useSalary'
import { todayISO } from './salaryRules'

interface CompRow { component_id: string; value: string }
const EMPTY = { employee_code: '', name: '', phone: '', address: '', department: '', designation: '', joining_date: '', basic_salary: '', payment_method: 'cash', bank_name: '', bank_account_no: '', status: 'active' }

export function EmployeeFormModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: any }) {
  const create = useCreateEmployee(), update = useUpdateEmployee()
  const { data: components } = useSalaryComponents()
  const [f, setF] = useState<any>(EMPTY)
  const [rows, setRows] = useState<CompRow[]>([])
  const [addId, setAddId] = useState('')
  const edit = !!employee
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    if (!open) return
    if (employee) {
      setF({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, employee[k] ?? ''])), basic_salary: String(employee.basic_salary ?? '') })
      setRows((employee.components || []).map((c: any) => ({ component_id: c.component_id, value: String(c.value) })))
    } else { setF(EMPTY); setRows([]) }
    setAddId('')
  }, [open, employee])

  const comp = (id: string) => (components || []).find((c: any) => c.id === id)
  const addable = (components || []).filter((c: any) => c.code !== 'ADVANCE_RECOVERY' && !rows.some((r) => r.component_id === c.id))
  const invalid = !f.name.trim() || f.basic_salary === '' || Number(f.basic_salary) < 0

  const submit = () => {
    const body: Record<string, unknown> = {
      name: f.name.trim(), phone: f.phone, address: f.address, department: f.department, designation: f.designation,
      joining_date: f.joining_date || null, basic_salary: Number(f.basic_salary), payment_method: f.payment_method, bank_name: f.bank_name, bank_account_no: f.bank_account_no,
      components: rows.filter((r) => Number(r.value) > 0).map((r) => ({ component_id: r.component_id, value: Number(r.value) })),
    }
    if (f.employee_code.trim()) body.employee_code = f.employee_code.trim()
    if (edit) { body.status = f.status; update.mutate({ id: employee.id, data: body }, { onSuccess: onClose }) }
    else create.mutate(body, { onSuccess: onClose })
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={edit ? `Edit employee — ${employee.name}` : 'New employee'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={create.isPending || update.isPending} disabled={invalid}>{edit ? 'Save' : 'Create employee'}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Employee ID" placeholder={edit ? '' : 'Auto (EMP-0001…)'} value={f.employee_code} onChange={set('employee_code')} />
        <Input label="Full name *" value={f.name} onChange={set('name')} />
        <Input label="Department" value={f.department} onChange={set('department')} />
        <Input label="Designation" value={f.designation} onChange={set('designation')} />
        <Input label="Phone" value={f.phone} onChange={set('phone')} />
        <Input label="Joining date" type="date" value={f.joining_date} onChange={set('joining_date')} />
        <div className="sm:col-span-2"><Input label="Address" value={f.address} onChange={set('address')} /></div>
        <Input label="Basic salary *" type="number" min={0} step="0.01" inputMode="decimal" value={f.basic_salary} onChange={set('basic_salary')} />
        <Select label="Salary payment method" value={f.payment_method} onChange={set('payment_method')}
          options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'online', label: 'Online / UPI' }]} />
        {f.payment_method === 'bank' && <><Input label="Bank name" value={f.bank_name} onChange={set('bank_name')} /><Input label="Account no." value={f.bank_account_no} onChange={set('bank_account_no')} /></>}
        {edit && <Select label="Status" value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />}
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] mb-1">Default salary components</div>
        <p className="text-xs text-[var(--text-3)] mb-2">Applied automatically when a month is generated. Amounts can still be edited on each draft slip.</p>
        {rows.map((r, i) => { const c = comp(r.component_id); return (
          <div key={r.component_id} className="flex items-center gap-2 mb-2">
            <div className="flex-1 text-sm">{c?.name || 'Component'} <span className="text-[11px] text-[var(--text-4)]">({c?.kind})</span></div>
            <div style={{ width: 150 }}><Input type="number" min={0} step="0.01" aria-label={`${c?.name} value`} suffix={c?.calc_type === 'percent_of_basic' ? '%' : undefined} value={r.value}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></div>
            <button type="button" className="p-1 text-[var(--text-4)] hover:text-red-500" aria-label={`Remove ${c?.name}`} onClick={() => setRows((p) => p.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>) })}
        <div className="flex items-end gap-2 max-w-sm">
          <div className="flex-1"><Select value={addId} onChange={(e) => setAddId(e.target.value)} placeholder="Add component…" options={addable.map((c: any) => ({ value: c.id, label: `${c.name} (${c.kind})` }))} /></div>
          <Button icon={<Plus size={14} />} disabled={!addId} onClick={() => { setRows((p) => [...p, { component_id: addId, value: '' }]); setAddId('') }}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Employee-wise salary ledger: the employee's Salary Payable account from the books (credit balance = salary owed). */
export function EmployeeLedgerModal({ employee, onClose }: { employee: any | null; onClose: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { data, isLoading } = useEmployeeLedger(employee?.id, { date_from: from || undefined, date_to: to || undefined })
  useEffect(() => { if (employee) { setFrom(''); setTo('') } }, [employee?.id])
  return (
    <Modal open={!!employee} onClose={onClose} size="xl" title={employee ? `Salary ledger — ${employee.name} (${employee.employee_code})` : ''}
      footer={<>
        {data?.entries?.length > 0 && <Button icon={<Download size={14} />} onClick={() => downloadCSV(data.entries.map((e: any) => ({ Date: e.date, Voucher: e.voucher_no, Type: e.voucher_type, Description: e.description || e.narration, Debit: e.debit, Credit: e.credit, Balance: e.balance })), `salary-ledger-${employee.employee_code}`)}>Export CSV</Button>}
        <Button variant="primary" onClick={onClose}>Close</Button></>}>
      <div className="flex flex-wrap gap-3 mb-3">
        <div style={{ width: 170 }}><Input label="From" type="date" value={from} max={to || todayISO()} onChange={(e) => setFrom(e.target.value)} /></div>
        <div style={{ width: 170 }}><Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {isLoading || !data ? <div className="flex justify-center py-8"><Spinner size={22} /></div> : (
        <>
          <TableWrap>
            <thead><tr><th>Date</th><th>Voucher</th><th>Description</th><th className="text-right">Debit (paid)</th><th className="text-right">Credit (earned)</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="text-[var(--text-3)]"><td colSpan={5}>Opening balance</td><td className="text-right tabular-nums">{fmt(data.opening_balance)}</td></tr>
              {data.entries.length === 0 ? <tr><td colSpan={6}><Empty message="No salary entries in this period" /></td></tr> : data.entries.map((e: any, i: number) => (
                <tr key={i}>
                  <td>{e.date}</td><td>{e.voucher_no}{e.event_type === 'REVERSED' ? <span className="text-[10px] ml-1 text-red-500">REVERSAL</span> : null}</td><td>{e.description || e.narration}</td>
                  <td className="text-right tabular-nums">{e.debit ? fmt(e.debit) : ''}</td><td className="text-right tabular-nums">{e.credit ? fmt(e.credit) : ''}</td><td className="text-right tabular-nums">{fmt(e.balance)}</td>
                </tr>))}
              <tr className="font-bold"><td colSpan={3}>Closing balance (salary owed to employee)</td><td className="text-right tabular-nums">{fmt(data.total_debit)}</td><td className="text-right tabular-nums">{fmt(data.total_credit)}</td><td className="text-right tabular-nums">{fmt(data.closing_balance)}</td></tr>
            </tbody>
          </TableWrap>
        </>
      )}
    </Modal>
  )
}
