/**
 * ProcessingTab.tsx — monthly salary: generate, review, open a slip to edit / approve / pay.
 * Generation is idempotent on the server (an employee already generated for the month is skipped and reported), so re-clicking
 * Generate can never create a duplicate.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Input, Select, SearchInput, StatCard, Badge, Empty, SkeletonRows, Pagination, TableWrap, Modal } from '@/components/ui'
import useAuthStore from '@/store/authStore'
import { fmt } from '@/utils'
import { useSalarySlips, useGenerateSalary } from '@/hooks/useSalary'
import SlipModal from './SlipModal'
import { currentMonth, isMonth, monthLabel, STATUS_BADGE, STATUS_LABEL, type SlipStatus } from './salaryRules'

export default function ProcessingTab() {
  const can = useAuthStore((s) => s.can)
  const [month, setMonth] = useState(currentMonth())
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const generate = useGenerateSalary()

  const { data, isLoading } = useSalarySlips({ month: isMonth(month) ? month : undefined, status: status || undefined, search: search || undefined, page, limit: 50 })
  const slips = data?.data || []
  const totals = data?.totals

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div style={{ width: 170 }}><Input label="Salary month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} /></div>
        <div style={{ width: 180 }}><Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} placeholder="All statuses"
          options={(Object.keys(STATUS_LABEL) as SlipStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></div>
        <div className="flex-1 min-w-[180px]"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search employee or slip no…" /></div>
        {can('salary.manage') && (
          <Button variant="primary" icon={<Plus size={14} />} loading={generate.isPending} disabled={!isMonth(month)}
            onClick={() => generate.mutate({ salary_month: month }, { onSuccess: (r) => setResult(r) })}>
            Generate {isMonth(month) ? monthLabel(month) : 'salary'}
          </Button>
        )}
      </div>

      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Gross salary" value={fmt(totals.gross)} />
          <StatCard label="Deductions" value={fmt(totals.deductions)} color="var(--text-3)" />
          <StatCard label="Net payable" value={fmt(totals.net)} />
          <StatCard label="Paid" value={fmt(totals.paid)} color="#16a34a" />
          <StatCard label="Outstanding" value={fmt(totals.outstanding)} color="#d97706" />
        </div>
      )}

      <TableWrap>
        <thead><tr>
          <th>Employee</th><th>Department</th><th className="text-right">Basic</th><th className="text-right">Gross</th>
          <th className="text-right">Deductions</th><th className="text-right">Net payable</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th>Status</th>
        </tr></thead>
        <tbody>
          {isLoading ? <SkeletonRows cols={9} rows={5} /> : slips.length === 0 ? (
            <tr><td colSpan={9}><Empty message={isMonth(month) ? `No salary generated for ${monthLabel(month)} yet` : 'No salary slips'} /></td></tr>
          ) : slips.map((s: any) => (
            <tr key={s.id} className="cursor-pointer hover:bg-[var(--surface-3)]" onClick={() => setOpen(s.id)}>
              <td><div className="font-semibold">{s.employee_name}</div><div className="text-[11px] text-[var(--text-4)]">{s.employee_code} · {s.slip_no}</div></td>
              <td>{s.department || '—'}</td>
              <td className="text-right tabular-nums">{fmt(s.basic_salary)}</td>
              <td className="text-right tabular-nums">{fmt(s.gross_salary)}</td>
              <td className="text-right tabular-nums">{fmt(s.total_deductions)}</td>
              <td className="text-right tabular-nums font-semibold">{fmt(s.net_payable)}</td>
              <td className="text-right tabular-nums">{fmt(s.paid_amount)}</td>
              <td className="text-right tabular-nums">{fmt(s.outstanding)}</td>
              <td><Badge className={STATUS_BADGE[s.status as SlipStatus]}>{STATUS_LABEL[s.status as SlipStatus]}</Badge></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pagination page={page} total={data?.pagination?.total || 0} limit={50} onChange={setPage} />

      <SlipModal slipId={open} onClose={() => setOpen(null)} />

      <Modal open={!!result} onClose={() => setResult(null)} title={result ? `Salary generation — ${monthLabel(result.salary_month)}` : ''} size="md"
        footer={<Button variant="primary" onClick={() => setResult(null)}>Done</Button>}>
        {result && (
          <div className="space-y-3 text-sm">
            <p><b>{result.created.length}</b> salary slip(s) created as drafts. Nothing has been posted to the ledger yet — review each slip, then approve.</p>
            {result.skipped.length > 0 && (
              <div>
                <div className="font-semibold mb-1">{result.skipped.length} skipped</div>
                <ul className="space-y-1 text-xs text-[var(--text-2)]">
                  {result.skipped.map((s: any) => <li key={s.employee_id}><b>{s.name}</b> ({s.employee_code}) — {s.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
