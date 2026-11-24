/** AdvancesTab.tsx — staff advances: pay out (Dr Staff Advances / Cr Cash or Bank), see balances, reverse. Recovered through salary slips. */
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input, Select, Modal, Badge, Empty, SkeletonRows, Pagination, TableWrap } from '@/components/ui'
import useAuthStore from '@/store/authStore'
import { fmt } from '@/utils'
import { useSalaryAdvances, useSalaryEmployees, useSalaryPaymentAccounts, useIssueAdvance, useReverseAdvance, useAdvanceStatement } from '@/hooks/useSalary'
import { ReasonDialog } from './SalaryDialogs'
import { canReverseSalary, newRequestId, todayISO } from './salaryRules'

function IssueAdvanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: emps } = useSalaryEmployees({ status: 'active', limit: 200 })
  const { data: accounts } = useSalaryPaymentAccounts()
  const issue = useIssueAdvance()
  const [emp, setEmp] = useState(''), [amount, setAmount] = useState(''), [date, setDate] = useState(todayISO()), [acct, setAcct] = useState('')
  const [ref, setRef] = useState(''), [note, setNote] = useState(''), [rid, setRid] = useState(newRequestId())
  const { data: stmt } = useAdvanceStatement(emp || undefined)
  useEffect(() => { if (open) { setEmp(''); setAmount(''); setDate(todayISO()); setRef(''); setNote(''); setRid(newRequestId()) } }, [open])
  useEffect(() => { if (open && !acct && accounts?.length) setAcct(accounts[0].id) }, [open, accounts, acct])
  const invalid = !emp || !(Number(amount) > 0) || !acct || !date
  return (
    <Modal open={open} onClose={onClose} title="Pay staff advance" size="sm"
      footer={<><Button onClick={onClose} disabled={issue.isPending}>Cancel</Button>
        <Button variant="primary" loading={issue.isPending} disabled={invalid}
          onClick={() => issue.mutate({ employee_id: emp, amount: Number(amount), advance_date: date, paid_from_account_id: acct, reference_no: ref.trim(), narration: note.trim(), request_id: rid }, { onSuccess: onClose })}>Record advance</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Select label="Employee" value={emp} onChange={(e) => setEmp(e.target.value)} placeholder="Select employee"
          options={(emps?.data || []).map((e: any) => ({ value: e.id, label: `${e.employee_code} · ${e.name}` }))} /></div>
        {emp && stmt && <div className="col-span-2 text-xs text-[var(--text-3)]">Advance outstanding now: <b className="text-[var(--text)]">{fmt(stmt.balance)}</b></div>}
        <Input label="Amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="col-span-2"><Select label="Paid from (cash / bank account)" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="Select account"
          options={(accounts || []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} /></div>
        <Input label="Reference no." value={ref} onChange={(e) => setRef(e.target.value)} />
        <Input label="Narration" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  )
}

export default function AdvancesTab() {
  const can = useAuthStore((s) => s.can)
  const [page, setPage] = useState(1)
  const [issueOpen, setIssueOpen] = useState(false)
  const [reverseId, setReverseId] = useState<string | null>(null)
  const { data, isLoading } = useSalaryAdvances({ page, limit: 50 })
  const reverse = useReverseAdvance()
  const rows = data?.data || []
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--text-3)]">Advances are recovered by adding <b>Staff Advance Recovery</b> to a salary slip.</p>
        {can('salary.pay') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setIssueOpen(true)}>Pay advance</Button>}
      </div>
      <TableWrap>
        <thead><tr><th>Date</th><th>Employee</th><th>Voucher</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
        <tbody>
          {isLoading ? <SkeletonRows cols={7} rows={4} /> : rows.length === 0 ? <tr><td colSpan={7}><Empty message="No staff advances" /></td></tr> : rows.map((a: any) => (
            <tr key={a.id} className={a.status === 'REVERSED' ? 'opacity-60' : ''}>
              <td>{a.advance_date}</td><td><b>{a.name}</b> <span className="text-[11px] text-[var(--text-4)]">{a.employee_code}</span></td><td>{a.voucher_no}</td><td>{a.reference_no || '—'}</td>
              <td className="text-right tabular-nums">{fmt(a.amount)}</td>
              <td><Badge className={a.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}>{a.status === 'ACTIVE' ? 'Paid' : 'Reversed'}</Badge></td>
              <td className="text-right">{a.status === 'ACTIVE' && canReverseSalary(can) && <Button size="sm" variant="danger" onClick={() => setReverseId(a.id)}>Reverse</Button>}</td>
            </tr>))}
        </tbody>
      </TableWrap>
      <Pagination page={page} total={data?.pagination?.total || 0} limit={50} onChange={setPage} />
      <IssueAdvanceModal open={issueOpen} onClose={() => setIssueOpen(false)} />
      <ReasonDialog open={!!reverseId} onClose={() => setReverseId(null)} title="Reverse advance" confirmLabel="Reverse advance" busy={reverse.isPending}
        message="Posts an equal-and-opposite entry. Not possible if part of the advance was already recovered through salary."
        onConfirm={(reason) => reverse.mutate({ id: reverseId!, reason }, { onSuccess: () => setReverseId(null) })} />
    </div>
  )
}
