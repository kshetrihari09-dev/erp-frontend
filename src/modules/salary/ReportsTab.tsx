/** ReportsTab.tsx — monthly salary expense · employee outstanding · payment history · deductions · salary payable balance. */
import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Input, Select, Empty, SkeletonRows, StatCard, TableWrap, Alert } from '@/components/ui'
import { fmt, downloadCSV } from '@/utils'
import { useSalaryReport, useSalaryEmployees } from '@/hooks/useSalary'
import { monthLabel, todayISO } from './salaryRules'

type Kind = 'monthly' | 'outstanding' | 'payments' | 'deductions' | 'payable'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'monthly', label: 'Monthly salary expense' }, { value: 'outstanding', label: 'Employee outstanding salary' }, { value: 'payments', label: 'Salary payment history' },
  { value: 'deductions', label: 'Salary deduction report' }, { value: 'payable', label: 'Salary payable balance' },
]

export default function ReportsTab() {
  const [kind, setKind] = useState<Kind>('monthly')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [asOf, setAsOf] = useState(todayISO()), [emp, setEmp] = useState('')
  const { data: emps } = useSalaryEmployees({ limit: 200 })
  const params: Record<string, unknown> = kind === 'payable' ? { as_of_date: asOf } : { date_from: from || undefined, date_to: to || undefined, employee_id: emp || undefined }
  const { data: res, isLoading } = useSalaryReport(kind, params)
  const exportCsv = (rows: Record<string, unknown>[], name: string) => rows.length && downloadCSV(rows, name)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div style={{ width: 260 }}><Select label="Report" value={kind} onChange={(e) => setKind(e.target.value as Kind)} options={KINDS} /></div>
        {kind === 'payable'
          ? <div style={{ width: 170 }}><Input label="As of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
          : <>
              <div style={{ width: 170 }}><Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div style={{ width: 170 }}><Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              {kind !== 'monthly' && <div style={{ width: 220 }}><Select label="Employee" value={emp} onChange={(e) => setEmp(e.target.value)} placeholder="All employees"
                options={(emps?.data || []).map((e: any) => ({ value: e.id, label: `${e.employee_code} · ${e.name}` }))} /></div>}
            </>}
      </div>

      {isLoading || !res ? <TableWrap><tbody><SkeletonRows cols={6} rows={5} /></tbody></TableWrap> : (
        <>
          {kind === 'monthly' && <Monthly r={(res as any).data} onExport={exportCsv} />}
          {kind === 'outstanding' && <Outstanding r={(res as any).data} onExport={exportCsv} />}
          {kind === 'payments' && <Payments r={res as any} onExport={exportCsv} />}
          {kind === 'deductions' && <Deductions r={(res as any).data} onExport={exportCsv} />}
          {kind === 'payable' && <Payable r={(res as any).data} />}
        </>
      )}
    </div>
  )
}

const Num = ({ v }: { v: number }) => <td className="text-right tabular-nums">{fmt(v)}</td>
type Ex = (rows: Record<string, unknown>[], name: string) => void
const Exp = ({ onClick }: { onClick: () => void }) => <div className="flex justify-end"><Button size="sm" icon={<Download size={13} />} onClick={onClick}>Export CSV</Button></div>

function Monthly({ r, onExport }: { r: any; onExport: Ex }) {
  const rows = r?.data || []
  return (<>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><StatCard label="Gross salary expense" value={fmt(r?.totals?.gross)} /><StatCard label="Deductions" value={fmt(r?.totals?.deductions)} color="var(--text-3)" /><StatCard label="Net payable" value={fmt(r?.totals?.net)} /><StatCard label="Outstanding" value={fmt(r?.totals?.outstanding)} color="#d97706" /></div>
    <Exp onClick={() => onExport(rows.map((x: any) => ({ Month: x.salary_month, Employees: x.employees, Basic: x.basic, Earnings: x.earnings, Gross: x.gross, Deductions: x.deductions, Net: x.net, Paid: x.paid, Outstanding: x.outstanding })), 'salary-monthly-expense')} />
    <TableWrap><thead><tr><th>Month</th><th className="text-right">Employees</th><th className="text-right">Basic</th><th className="text-right">Allowances &amp; extras</th><th className="text-right">Gross (expense)</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={9}><Empty message="No approved salary in this period" /></td></tr> : rows.map((x: any) => (
        <tr key={x.salary_month}><td>{monthLabel(x.salary_month)}</td><td className="text-right">{x.employees}</td><Num v={x.basic} /><Num v={x.earnings} /><Num v={x.gross} /><Num v={x.deductions} /><Num v={x.net} /><Num v={x.paid} /><Num v={x.outstanding} /></tr>))}</tbody></TableWrap>
    <p className="text-xs text-[var(--text-3)]">{r?.note}</p>
  </>)
}
function Outstanding({ r, onExport }: { r: any; onExport: Ex }) {
  const rows = r?.data || []
  return (<>
    <StatCard label="Total outstanding salary" value={fmt(r?.total_outstanding)} color="#d97706" />
    <Exp onClick={() => onExport(rows.flatMap((e: any) => e.slips.map((s: any) => ({ Employee: e.name, ID: e.employee_code, Department: e.department, Month: s.salary_month, Slip: s.slip_no, Net: s.net_payable, Paid: s.paid_amount, Outstanding: s.outstanding }))), 'salary-outstanding')} />
    <TableWrap><thead><tr><th>Employee</th><th>Department</th><th>Months pending</th><th className="text-right">Outstanding</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={4}><Empty message="No outstanding salary" /></td></tr> : rows.map((e: any) => (
        <tr key={e.employee_id}><td><b>{e.name}</b> <span className="text-[11px] text-[var(--text-4)]">{e.employee_code}</span></td><td>{e.department || '—'}</td><td className="text-xs">{e.slips.map((s: any) => monthLabel(s.salary_month)).join(', ')}</td><Num v={e.outstanding} /></tr>))}</tbody></TableWrap>
  </>)
}
function Payments({ r, onExport }: { r: any; onExport: Ex }) {
  const rows = r?.data || []
  return (<>
    <StatCard label="Total salary paid" value={fmt(r?.total_paid)} color="#16a34a" />
    <Exp onClick={() => onExport(rows.map((p: any) => ({ Date: p.payment_date, Employee: p.employee_name, Month: p.salary_month, Voucher: p.voucher_no, Method: p.payment_method, 'Paid from': p.paid_from, Reference: p.reference_no, Amount: p.amount })), 'salary-payments')} />
    <TableWrap><thead><tr><th>Date</th><th>Employee</th><th>Month</th><th>Voucher</th><th>Method</th><th>Paid from</th><th className="text-right">Amount</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={7}><Empty message="No salary payments" /></td></tr> : rows.map((p: any) => (
        <tr key={p.id}><td>{p.payment_date}</td><td><b>{p.employee_name}</b> <span className="text-[11px] text-[var(--text-4)]">{p.employee_code}</span></td><td>{monthLabel(p.salary_month)}</td><td>{p.voucher_no}</td><td className="capitalize">{p.payment_method}</td><td>{p.paid_from}</td><Num v={p.amount} /></tr>))}</tbody></TableWrap>
  </>)
}
function Deductions({ r, onExport }: { r: any; onExport: Ex }) {
  const rows = r?.detail || []
  return (<>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><StatCard label="Total deductions" value={fmt(r?.total)} color="var(--text-3)" />{(r?.by_component || []).map((c: any) => <StatCard key={c.component_name} label={c.component_name} value={fmt(c.amount)} />)}</div>
    <Exp onClick={() => onExport(rows.map((d: any) => ({ Month: d.salary_month, Employee: d.employee_name, ID: d.employee_code, Slip: d.slip_no, Deduction: d.component_name, Amount: d.amount })), 'salary-deductions')} />
    <TableWrap><thead><tr><th>Month</th><th>Employee</th><th>Slip</th><th>Deduction</th><th className="text-right">Amount</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={5}><Empty message="No deductions in this period" /></td></tr> : rows.map((d: any, i: number) => (
        <tr key={i}><td>{monthLabel(d.salary_month)}</td><td>{d.employee_name} <span className="text-[11px] text-[var(--text-4)]">{d.employee_code}</span></td><td>{d.slip_no}</td><td>{d.component_name}</td><Num v={d.amount} /></tr>))}</tbody></TableWrap>
  </>)
}
function Payable({ r }: { r: any }) {
  return (<>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <StatCard label="Salary Payable (ledger)" value={fmt(r?.ledger_balance)} /><StatCard label="Outstanding on salary slips" value={fmt(r?.subledger_outstanding)} color="var(--text-3)" />
      <StatCard label="Difference" value={fmt(r?.difference)} color={r?.reconciled ? '#16a34a' : '#dc2626'} sub={r?.reconciled ? 'Ledger and slips agree' : 'Needs review'} />
    </div>
    {!r?.reconciled && <Alert type="warning" message="The Salary Payable ledger and the salary slips disagree. A manual journal may have been posted directly to the Salary Payable account." />}
    <TableWrap><thead><tr><th>Employee</th><th className="text-right">Salary payable balance</th></tr></thead>
      <tbody>{(r?.by_employee || []).length === 0 ? <tr><td colSpan={2}><Empty message="Nothing payable" /></td></tr> : r.by_employee.map((e: any) => (
        <tr key={e.employee_id}><td><b>{e.name}</b> <span className="text-[11px] text-[var(--text-4)]">{e.employee_code}</span></td><Num v={e.balance} /></tr>))}</tbody></TableWrap>
  </>)
}
