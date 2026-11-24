/** ComponentsTab.tsx — configurable salary components (earnings / deductions) and which ledger account each one posts to. */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { Button, Input, Select, Modal, Badge, Empty, TableWrap, ToggleSwitch } from '@/components/ui'
import useAuthStore from '@/store/authStore'
import { accountingAPI } from '@/services/api'
import { useSalaryComponents, useCreateComponent, useUpdateComponent } from '@/hooks/useSalary'

const ROLE_LABEL: Record<string, string> = { salary_expense: 'Salary Expense', staff_advance: 'Staff Advances', salary_deductions_payable: 'Salary Deductions Payable', custom: 'Custom account' }

function ComponentModal({ open, onClose, comp }: { open: boolean; onClose: () => void; comp?: any }) {
  const create = useCreateComponent(), update = useUpdateComponent()
  const { data: accts } = useQuery({ queryKey: ['salary', 'coa'], enabled: open, queryFn: () => accountingAPI.accounts({ limit: 1000 }).then((r) => r.data.data) })
  const [f, setF] = useState<any>({ code: '', name: '', kind: 'earning', calc_type: 'fixed', default_value: '0', posting_role: 'salary_expense', ledger_account_id: '', is_active: true })
  const edit = !!comp, system = !!comp?.is_system
  useEffect(() => {
    if (!open) return
    setF(comp ? { code: comp.code, name: comp.name, kind: comp.kind, calc_type: comp.calc_type, default_value: String(comp.default_value), posting_role: comp.posting_role, ledger_account_id: comp.ledger_account_id || '', is_active: comp.is_active }
      : { code: '', name: '', kind: 'earning', calc_type: 'fixed', default_value: '0', posting_role: 'salary_expense', ledger_account_id: '', is_active: true })
  }, [open, comp])
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }))
  const roles = f.kind === 'earning' ? ['salary_expense', 'custom'] : ['salary_deductions_payable', 'custom']
  const invalid = !f.name.trim() || (!edit && !f.code.trim()) || (f.posting_role === 'custom' && !f.ledger_account_id)

  const submit = () => {
    const body: Record<string, unknown> = { name: f.name.trim(), calc_type: f.calc_type, default_value: Number(f.default_value) || 0, is_active: f.is_active, ledger_account_id: f.posting_role === 'custom' ? f.ledger_account_id : null }
    if (edit) update.mutate({ id: comp.id, data: body }, { onSuccess: onClose })
    else create.mutate({ ...body, code: f.code, kind: f.kind, posting_role: f.posting_role }, { onSuccess: onClose })
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? `Edit component — ${comp.name}` : 'New salary component'} size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={create.isPending || update.isPending} disabled={invalid}>{edit ? 'Save' : 'Create'}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Code" value={f.code} disabled={edit} onChange={set('code')} placeholder="e.g. TAX" />
        <Input label="Name" value={f.name} onChange={set('name')} />
        <Select label="Type" value={f.kind} disabled={edit} onChange={(e) => setF((p: any) => ({ ...p, kind: e.target.value, posting_role: e.target.value === 'earning' ? 'salary_expense' : 'salary_deductions_payable' }))}
          options={[{ value: 'earning', label: 'Earning (adds to salary)' }, { value: 'deduction', label: 'Deduction (reduces net pay)' }]} />
        <Select label="Calculation" value={f.calc_type} onChange={set('calc_type')} options={[{ value: 'fixed', label: 'Fixed amount' }, { value: 'percent_of_basic', label: '% of basic salary' }]} />
        <Input label={f.calc_type === 'percent_of_basic' ? 'Default %' : 'Default amount'} type="number" min={0} step="0.01" value={f.default_value} onChange={set('default_value')} />
        {!system && <Select label="Posts to" value={f.posting_role} disabled={edit} onChange={set('posting_role')} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />}
        {!system && f.posting_role === 'custom' && (
          <div className="col-span-2"><Select label="Ledger account" value={f.ledger_account_id} onChange={set('ledger_account_id')} placeholder="Select account"
            options={(accts || []).filter((a: any) => !a.is_group && a.is_active).map((a: any) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} /></div>
        )}
        {edit && <div className="col-span-2"><ToggleSwitch checked={f.is_active} onChange={(v) => setF((p: any) => ({ ...p, is_active: v }))} label="Active" /></div>}
      </div>
    </Modal>
  )
}

export default function ComponentsTab() {
  const can = useAuthStore((s) => s.can)
  const { data } = useSalaryComponents(true)
  const [m, setM] = useState<{ open: boolean; comp?: any }>({ open: false })
  const rows = data || []
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--text-3)]">Earnings debit Salary Expense; deductions credit the account they post to. Basic salary is set per employee.</p>
        {can('salary.manage') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setM({ open: true })}>New component</Button>}
      </div>
      <TableWrap>
        <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Calculation</th><th>Posts to</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={7}><Empty message="No components" /></td></tr> : rows.map((c: any) => (
          <tr key={c.id} className={c.is_active ? '' : 'opacity-60'}>
            <td className="font-mono text-xs">{c.code}</td><td className="font-semibold">{c.name}{c.is_system ? <span className="ml-1 text-[10px] text-[var(--text-4)]">system</span> : null}</td>
            <td><Badge className={c.kind === 'earning' ? 'badge-green' : 'badge-amber'}>{c.kind === 'earning' ? 'Earning' : 'Deduction'}</Badge></td>
            <td>{c.calc_type === 'percent_of_basic' ? `${c.default_value}% of basic` : c.default_value > 0 ? `Fixed ${c.default_value}` : 'Fixed (per employee)'}</td>
            <td>{c.account_name ? `${c.account_code} · ${c.account_name}` : ROLE_LABEL[c.posting_role] || c.posting_role}</td>
            <td>{c.is_active ? 'Active' : 'Inactive'}</td>
            <td className="text-right">{can('salary.manage') && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setM({ open: true, comp: c })}>Edit</Button>}</td>
          </tr>))}
        </tbody>
      </TableWrap>
      <ComponentModal open={m.open} onClose={() => setM({ open: false })} comp={m.comp} />
    </div>
  )
}
