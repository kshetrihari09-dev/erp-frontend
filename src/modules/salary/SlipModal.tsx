/**
 * SlipModal.tsx — one salary slip: view, edit (DRAFT only), approve, pay, reverse, history.
 *
 * What is offered at each status comes from salaryRules.slipActions(); the server enforces the same rules, so a stale screen can
 * never post twice or edit an approved slip. Approve / pay / reverse are single server calls that post (or reverse) the journal
 * and change the status in ONE transaction — this component never touches accounting itself.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, CheckCircle2, Wallet, RotateCcw, Ban, Save } from 'lucide-react'
import { Modal, Button, Input, Select, Badge, Spinner, Textarea, TableWrap } from '@/components/ui'
import useAuthStore from '@/store/authStore'
import { fmt, fmtDateTime } from '@/utils'
import {
  useSalarySlip, useSalaryComponents, useUpdateSlip, useApproveSlip, usePaySlip, useCancelSlip, useReverseApproval, useReversePayment,
} from '@/hooks/useSalary'
import { ReasonDialog, PayDialog } from './SalaryDialogs'
import { slipActions, previewTotals, STATUS_BADGE, STATUS_LABEL, monthLabel, type SlipStatus } from './salaryRules'

interface Line { component_id: string; component_name: string; kind: 'earning' | 'deduction'; posting_role: string; amount: string }

export default function SlipModal({ slipId, onClose }: { slipId: string | null; onClose: () => void }) {
  const can = useAuthStore((s) => s.can)
  const { data: slip, isLoading } = useSalarySlip(slipId || undefined)
  const { data: components } = useSalaryComponents()
  const update = useUpdateSlip(), approve = useApproveSlip(), pay = usePaySlip(), cancel = useCancelSlip()
  const revApproval = useReverseApproval(), revPayment = useReversePayment()

  const [basic, setBasic] = useState('0')
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const [addId, setAddId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [dlg, setDlg] = useState<null | 'approve' | 'pay' | 'cancel' | 'reverseApproval' | { payment: string }>(null)
  const [approvalDate, setApprovalDate] = useState('')

  // reload the editable copy whenever the server's version of the slip changes
  useEffect(() => {
    if (!slip) return
    setBasic(String(slip.basic_salary)); setNotes(slip.notes || ''); setDirty(false)
    setLines((slip.lines || []).map((l: any) => ({ component_id: l.component_id, component_name: l.component_name, kind: l.kind, posting_role: l.posting_role, amount: String(l.amount) })))
  }, [slip?.id, slip?.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasActivePayments = !!slip?.payments?.some((p: any) => p.status === 'ACTIVE')
  const act = slip ? slipActions(slip.status as SlipStatus, hasActivePayments, can) : null
  const editing = !!act?.edit
  const totals = useMemo(() => previewTotals(Number(basic) || 0, lines.map((l) => ({ kind: l.kind, posting_role: l.posting_role, amount: Number(l.amount) || 0 }))), [basic, lines])
  const shown = editing ? totals : slip ? { earnings: slip.total_earnings, gross: slip.gross_salary, advance: slip.advance_recovery, other: slip.other_deductions, deductions: slip.total_deductions, net: slip.net_payable } : totals
  const addable = (components || []).filter((c: any) => !lines.some((l) => l.component_id === c.id))

  const save = () => update.mutate({ id: slip.id, data: { version: slip.version, basic_salary: Number(basic) || 0, notes, lines: lines.map((l) => ({ component_id: l.component_id, amount: Number(l.amount) || 0 })) } })
  const busy = update.isPending || approve.isPending || pay.isPending || cancel.isPending || revApproval.isPending || revPayment.isPending
  const done = () => setDlg(null)

  return (
    <>
      <Modal open={!!slipId} onClose={onClose} size="lg" title={slip ? `${slip.employee_name} · ${monthLabel(slip.salary_month)}` : 'Salary slip'}
        footer={slip && act ? (
          <div className="flex flex-wrap gap-2 w-full justify-between">
            <div className="flex gap-2">
              {act.cancel && <Button variant="danger" icon={<Ban size={14} />} onClick={() => setDlg('cancel')} disabled={busy}>Cancel slip</Button>}
              {act.reverseApproval && <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setDlg('reverseApproval')} disabled={busy}>Reverse approval</Button>}
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose}>Close</Button>
              {act.edit && <Button icon={<Save size={14} />} onClick={save} loading={update.isPending} disabled={!dirty || busy}>Save changes</Button>}
              {act.approve && <Button variant="primary" icon={<CheckCircle2 size={14} />} onClick={() => { setApprovalDate(''); setDlg('approve') }} disabled={dirty || busy}
                title={dirty ? 'Save your changes first' : undefined}>Approve</Button>}
              {act.pay && <Button variant="primary" icon={<Wallet size={14} />} onClick={() => setDlg('pay')} disabled={busy}>Pay</Button>}
            </div>
          </div>
        ) : undefined}>
        {isLoading || !slip ? <div className="flex justify-center py-10"><Spinner size={22} /></div> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge className={STATUS_BADGE[slip.status as SlipStatus]}>{STATUS_LABEL[slip.status as SlipStatus]}</Badge>
              <span className="text-[var(--text-3)]">{slip.slip_no} · {slip.employee_code}{slip.department ? ` · ${slip.department}` : ''}{slip.designation ? ` · ${slip.designation}` : ''}</span>
              {slip.approval_voucher_no && <span className="text-xs text-[var(--text-3)]">Journal voucher <b>{slip.approval_voucher_no}</b>{slip.approval_date ? ` · ${slip.approval_date}` : ''}</span>}
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Salary breakdown</div>
              <TableWrap className="salary-compact">
                <thead><tr><th>Component</th><th>Type</th><th className="text-right">Amount</th>{editing && <th style={{ width: 40 }} />}</tr></thead>
                <tbody>
                  <tr>
                    <td>Basic salary</td><td>Earning</td>
                    <td className="text-right">{editing
                      ? <input className="erp-input text-right" style={{ maxWidth: 140 }} type="number" min={0} step="0.01" value={basic} onChange={(e) => { setBasic(e.target.value); setDirty(true) }} />
                      : fmt(slip.basic_salary)}</td>
                    {editing && <td />}
                  </tr>
                  {lines.map((l, i) => (
                    <tr key={l.component_id}>
                      <td>{l.component_name}</td>
                      <td>{l.kind === 'earning' ? 'Earning' : 'Deduction'}</td>
                      <td className="text-right">{editing
                        ? <input className="erp-input text-right" style={{ maxWidth: 140 }} type="number" min={0} step="0.01" value={l.amount}
                            onChange={(e) => { const v = e.target.value; setLines((p) => p.map((x, j) => (j === i ? { ...x, amount: v } : x))); setDirty(true) }} />
                        : <span className={l.kind === 'deduction' ? 'text-red-500' : ''}>{l.kind === 'deduction' ? '−' : ''}{fmt(Number(l.amount))}</span>}</td>
                      {editing && <td><button type="button" className="text-[var(--text-4)] hover:text-red-500 p-1" aria-label={`Remove ${l.component_name}`}
                        onClick={() => { setLines((p) => p.filter((_, j) => j !== i)); setDirty(true) }}><Trash2 size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {editing && (
                <div className="flex gap-2 items-end mt-3 max-w-sm">
                  <div className="flex-1"><Select label="Add component" value={addId} onChange={(e) => setAddId(e.target.value)} placeholder="Select…"
                    options={addable.map((c: any) => ({ value: c.id, label: `${c.name} (${c.kind})` }))} /></div>
                  <Button icon={<Plus size={14} />} disabled={!addId} onClick={() => {
                    const c = addable.find((x: any) => x.id === addId); if (!c) return
                    setLines((p) => [...p, { component_id: c.id, component_name: c.name, kind: c.kind, posting_role: c.posting_role, amount: '' }]); setAddId(''); setDirty(true)
                  }}>Add</Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['Gross salary', shown.gross], ['Deductions', shown.deductions], ['Net payable', shown.net], ['Outstanding', editing ? shown.net : slip.outstanding]].map(([k, v]) => (
                <div key={k as string} className="rounded-lg border border-[var(--border)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-4)]">{k as string}</div>
                  <div className="text-base font-bold tabular-nums">{fmt(v as number)}</div>
                </div>
              ))}
            </div>
            {editing && <p className="text-xs text-[var(--text-3)]">Figures update as you edit; the saved amounts are recalculated by the server. Nothing is posted to the ledger until you approve.</p>}
            {editing ? <Textarea label="Notes" rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true) }} /> : slip.notes ? <p className="text-sm text-[var(--text-2)]">{slip.notes}</p> : null}

            {slip.payments?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Payments</div>
                <TableWrap className="salary-compact">
                  <thead><tr><th>Date</th><th>Voucher</th><th>Paid from</th><th>Method</th><th className="text-right">Amount</th><th>Status</th>{act?.reversePayment && <th />}</tr></thead>
                  <tbody>{slip.payments.map((p: any) => (
                    <tr key={p.id} className={p.status === 'REVERSED' ? 'opacity-60 line-through' : ''}>
                      <td>{p.payment_date}</td><td>{p.voucher_no}</td><td>{p.paid_from_name}</td><td className="capitalize">{p.payment_method}</td>
                      <td className="text-right">{fmt(p.amount)}</td><td>{p.status === 'REVERSED' ? 'Reversed' : 'Paid'}</td>
                      {act?.reversePayment && <td>{p.status === 'ACTIVE' && <Button size="sm" variant="danger" onClick={() => setDlg({ payment: p.id })}>Reverse</Button>}</td>}
                    </tr>))}
                  </tbody>
                </TableWrap>
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--text-3)] font-semibold">History ({slip.history?.length || 0})</summary>
              <ol className="mt-2 space-y-1.5">
                {(slip.history || []).map((h: any) => (
                  <li key={h.id} className="text-xs text-[var(--text-2)]">
                    <b>{h.action.replace(/_/g, ' ')}</b>{h.to_status && h.to_status !== h.from_status ? ` → ${h.to_status}` : ''} · {h.user_name || 'system'} · {fmtDateTime(h.created_at)}
                    {h.details?.reason ? <span className="text-[var(--text-3)]"> — “{h.details.reason}”</span> : null}
                  </li>))}
              </ol>
            </details>
          </div>
        )}
      </Modal>

      {/* approve: optional posting date */}
      <Modal open={dlg === 'approve'} onClose={done} title="Approve salary" size="sm"
        footer={<><Button onClick={done} disabled={approve.isPending}>Back</Button>
          <Button variant="primary" loading={approve.isPending} onClick={() => approve.mutate({ id: slip.id, data: approvalDate ? { approval_date: approvalDate } : {} }, { onSuccess: done })}>Approve &amp; post</Button></>}>
        <p className="text-sm text-[var(--text-2)] mb-3">Approving posts the salary journal: <b>Dr Salary Expense {fmt(slip?.gross_salary)}</b>, <b>Cr Salary Payable {fmt(slip?.net_payable)}</b>{slip?.total_deductions > 0 ? <>, and Cr deduction accounts {fmt(slip?.total_deductions)}</> : null}. After this the slip cannot be edited — only reversed.</p>
        <Input label="Posting date (optional — defaults to the end of the salary month)" type="date" value={approvalDate} onChange={(e) => setApprovalDate(e.target.value)} />
      </Modal>

      <PayDialog open={dlg === 'pay'} onClose={done} outstanding={slip?.outstanding || 0} defaultMethod={slip?.payment_method} employeeName={slip?.employee_name || ''} busy={pay.isPending}
        onSubmit={(v) => pay.mutate({ id: slip.id, data: { ...v } }, { onSuccess: done })} />
      <ReasonDialog open={dlg === 'cancel'} onClose={done} title="Cancel salary slip" message="The slip is cancelled (nothing was posted). The month can then be generated again." confirmLabel="Cancel slip" busy={cancel.isPending}
        onConfirm={(reason) => cancel.mutate({ id: slip.id, reason }, { onSuccess: () => { done(); onClose() } })} />
      <ReasonDialog open={dlg === 'reverseApproval'} onClose={done} title="Reverse approval" busy={revApproval.isPending} confirmLabel="Reverse approval"
        message="Posts an equal-and-opposite journal entry (the original stays in the books) and reopens the slip as a draft so it can be corrected and approved again."
        onConfirm={(reason) => revApproval.mutate({ id: slip.id, reason }, { onSuccess: done })} />
      <ReasonDialog open={typeof dlg === 'object' && dlg !== null && 'payment' in dlg} onClose={done} title="Reverse payment" busy={revPayment.isPending} confirmLabel="Reverse payment"
        message="Posts an equal-and-opposite payment entry; the salary becomes payable again."
        onConfirm={(reason) => revPayment.mutate({ id: (dlg as { payment: string }).payment, reason }, { onSuccess: done })} />
    </>
  )
}
