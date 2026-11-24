/**
 * SalaryDialogs.tsx — small reusable dialogs: a mandatory-reason prompt (cancel / reverse) and the salary payment form.
 * Neither holds accounting logic: they collect input and call the page's mutation, which calls the server.
 */
import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select, Textarea } from '@/components/ui'
import { useSalaryPaymentAccounts } from '@/hooks/useSalary'
import { fmt } from '@/utils'
import { newRequestId, todayISO } from './salaryRules'

export function ReasonDialog({ open, onClose, title, message, confirmLabel, danger = true, busy, onConfirm }: {
  open: boolean; onClose: () => void; title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button onClick={onClose} disabled={busy}>Back</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm text-[var(--text-2)] mb-3">{message}</p>
      <Textarea label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
    </Modal>
  )
}

export interface PayValues { amount: number; payment_date: string; paid_from_account_id: string; payment_method: string; reference_no: string; narration: string; request_id: string }

/** Pay a salary slip (full or partial) — also used for nothing else, so it can default everything from the slip. */
export function PayDialog({ open, onClose, outstanding, defaultMethod, employeeName, busy, onSubmit }: {
  open: boolean; onClose: () => void; outstanding: number; defaultMethod?: string; employeeName: string; busy?: boolean
  onSubmit: (v: PayValues) => void
}) {
  const { data: accounts } = useSalaryPaymentAccounts()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [acct, setAcct] = useState('')
  const [method, setMethod] = useState('cash')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [requestId, setRequestId] = useState(newRequestId())

  // a fresh request id per opening: a retry of THIS dialog is idempotent, a new payment is a new id
  useEffect(() => {
    if (!open) return
    setAmount(String(outstanding)); setDate(todayISO()); setMethod(defaultMethod || 'cash'); setRef(''); setNote(''); setRequestId(newRequestId())
  }, [open, outstanding, defaultMethod])
  useEffect(() => { if (open && !acct && accounts?.length) setAcct(accounts[0].id) }, [open, accounts, acct])

  const n = Number(amount)
  const invalid = !(n > 0) || n > outstanding + 0.005 || !acct || !date
  return (
    <Modal open={open} onClose={onClose} title={`Pay salary — ${employeeName}`} size="sm"
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={invalid}
          onClick={() => onSubmit({ amount: n, payment_date: date, paid_from_account_id: acct, payment_method: method, reference_no: ref.trim(), narration: note.trim(), request_id: requestId })}>
          Record payment
        </Button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 text-xs text-[var(--text-3)]">Outstanding salary: <b className="text-[var(--text)]">{fmt(outstanding)}</b></div>
        <Input label="Amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          error={n > outstanding + 0.005 ? 'More than the outstanding salary' : undefined} />
        <Input label="Payment date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="col-span-2">
          <Select label="Paid from (cash / bank account)" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="Select account"
            options={(accounts || []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
        </div>
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}
          options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'online', label: 'Online / UPI' }]} />
        <Input label="Reference no." value={ref} onChange={(e) => setRef(e.target.value)} />
        <div className="col-span-2"><Input label="Narration (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  )
}
