import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Printer, CheckCircle2, Pencil } from 'lucide-react'
import { accountingAPI, partiesAPI, reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, ConfirmDialog } from '@/components/ui'
import VoucherEditPasswordDialog from '@/components/forms/VoucherEditPasswordDialog'
import { fmt } from '@/utils'
import { formatDisplayDate } from '@/utils/dateSystem'
import DateSystemInput from '@/components/shared/DateSystemInput'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import type { Account, Party } from '@/types'

const LIMIT = 20

// party_id → { debit, credit } — same shape/convention as /reports/party-balance
// (the same source the Ledger page and Party Balance report already use).
type PartyBalanceMap = Record<string, { debit: number; credit: number }>

function QuickVoucherForm({ type, accounts, parties, partyBalances, balancesLoaded, onPosted, onClose, editRow, editReason }: {
  type: 'RECEIPT' | 'PAYMENT'; accounts: Account[]; parties: Party[]; partyBalances: PartyBalanceMap; balancesLoaded?: boolean; onPosted?: () => void; onClose: () => void
  editRow?: any; editReason?: string
}) {
  const { success, error } = useUIStore()
  const [printData, setPrintData]     = useState<PrintData | null>(null)
  // Holds the just-saved voucher for the "Voucher created successfully"
  // confirmation. Print Preview (printData) is only ever set from the
  // Print button below — never automatically after save.
  const [successData, setSuccessData] = useState<PrintData | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)
  const isEdit = !!editRow
  // Populated only once the voucher has actually been posted — the real
  // voucher_no comes from next_voucher_number() on the backend at creation
  // time, so there is nothing genuine to show before that. This is purely
  // a read-only display of what the (unchanged) backend already generated.
  // When editing, the voucher already has its (unchanged) number.
  const [voucherNo, setVoucherNo] = useState<string | null>(editRow?.voucher_no || null)
  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      party_id:  editRow?.party_id || '',
      date:      editRow?.voucher_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      account_id: editRow?.cash_account_id || '',
      amount:    editRow ? String(editRow.total_amount ?? editRow.amount ?? '') : '',
      narration: editRow?.narration || '',
    },
  })

  const onSubmit = handleSubmit(async (data) => {
    if (!data.account_id)     { error('Select an account'); return }
    if (!Number(data.amount)) { error('Enter a valid amount'); return }
    try {
      const payload = { party_id: data.party_id || undefined, date: data.date, amount: Number(data.amount), account_id: data.account_id, narration: data.narration || undefined }
      if (isEdit && editRow) {
        const editPayload = { ...payload, party_id: data.party_id || null, reason: editReason || '' }
        if (type === 'RECEIPT') await accountingAPI.editReceipt(editRow.id, editPayload)
        else                    await accountingAPI.editPayment(editRow.id, editPayload)
        success(`${type === 'RECEIPT' ? 'Receipt' : 'Payment'} updated — journal entries recalculated`)
        onPosted?.()
        onClose()
        return
      }
      let saved: any = {}
      if (type === 'RECEIPT') { const r = await accountingAPI.createReceipt(payload); saved = r.data?.data ?? {} }
      else                    { const r = await accountingAPI.createPayment(payload); saved = r.data?.data ?? {} }
      const partyName = parties.find((p: any) => p.id === data.party_id)?.name
      const no = saved.voucher_no || saved.return_no || (type === 'RECEIPT' ? 'REC' : 'PAY') + '-' + Date.now()
      setVoucherNo(no)
      onPosted?.()
      // NOTE: this used to be setPrintData(...), which auto-opened Print
      // Preview the instant the voucher saved. Print Preview must now only
      // open when the user explicitly clicks "Print" in the success dialog
      // below — see the successData / setPrintData(successData) handler.
      setSuccessData({
        voucherNo:   no,
        type:        type,
        date:        data.date,
        narration:   data.narration || undefined,
        partyName,
        netTotal:    Number(data.amount),
        paidAmount:  Number(data.amount),
        paymentMode: 'cash',
      })
    } catch (e: any) { error('Failed', e.message) }
  })

  const assetAccounts = accounts.filter(a => ((a as any).account_type || (a as any).type) === 'asset' && !(a as any).is_group)

  const partyId = watch('party_id')
  const bal = partyId ? partyBalances[partyId] : undefined
  const balanceLabel = !partyId
    ? '—'
    : !balancesLoaded
      ? 'Loading…'
      : !bal
        ? 'No balance found'
        : bal.debit > 0
          ? `Rs. ${fmt(bal.debit)} Dr`
          : bal.credit > 0
            ? `Rs. ${fmt(bal.credit)} Cr`
            : 'Rs. 0.00'

  const resetForNextVoucher = () => {
    setVoucherNo(null)
    const keepDate = watch('date')
    reset({ party_id: '', date: keepDate, account_id: '', amount: '', narration: '' })
  }

  return (
    <>
      <div className="form-grid">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            {type === 'RECEIPT' ? 'Receipt No.' : 'Payment No.'}
          </label>
          <input
            className="erp-input opacity-70 cursor-not-allowed"
            value={voucherNo || 'Auto-generated on save'}
            readOnly
            disabled
            tabIndex={-1}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Party</label>
          <select className="erp-input" {...register('party_id')}>
            <option value="">— No party —</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Current Balance</label>
          <input
            className="erp-input opacity-70 cursor-not-allowed"
            value={balanceLabel}
            readOnly
            disabled
            tabIndex={-1}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date</label>
          <DateSystemInput
            className="erp-input"
            valueAD={watch('date')}
            onChangeAD={(ad) => setValue('date', ad)}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            {type === 'RECEIPT' ? 'Received Into (Cash/Bank)' : 'Paid From (Cash/Bank)'}
          </label>
          <select className="erp-input" {...register('account_id')}>
            <option value="">Select account…</option>
            {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Amount</label>
          <input type="number" step="0.01" min="0" className="erp-input" placeholder="0.00" {...register('amount')} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Narration</label>
          <input className="erp-input" placeholder="Being amount received / paid…" {...register('narration')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
      <ConfirmDialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={onSubmit}
        title={`Create ${type === 'RECEIPT' ? 'Receipt' : 'Payment'}`}
        message={`Are you sure you want to save this ${type === 'RECEIPT' ? 'receipt' : 'payment'} voucher?`}
      />
      <Modal open={!!successData} onClose={() => { setSuccessData(null); onClose() }} title="Success" size="sm">
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <CheckCircle2 size={40} className="text-green-500" />
          <div className="text-base font-semibold text-[var(--text-1)]">Voucher created successfully</div>
          <div className="text-sm text-[var(--text-3)] mb-2">What would you like to do?</div>
          <div className="flex gap-2 w-full">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => { const sd = successData; setSuccessData(null); setPrintData(sd) }}
            >
              Print
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => { setSuccessData(null); resetForNextVoucher() }}
            >
              Next
            </Button>
          </div>
        </div>
      </Modal>
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => { setPrintData(null); onClose() }}
        onNextBill={() => { setPrintData(null); resetForNextVoucher() }}
      />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={() => isEdit ? onSubmit() : setConfirmSave(true)}>
          {isEdit ? 'Save Changes' : `Create ${type === 'RECEIPT' ? 'Receipt' : 'Payment'}`}
        </Button>
      </div>
    </>
  )
}

function VoucherListTab({ apiCall, type, title, onCount }: {
  apiCall: (p: any) => Promise<any>; type: 'RECEIPT' | 'PAYMENT'; title: string; onCount?: (count: number) => void
}) {
  const { error, dateMode } = useUIStore()
  const { user, hasRole } = useAuthStore()
  // "Authorized users" for editing a posted voucher — same trust level the backend requires.
  const canEditPosted = hasRole(['owner', 'admin']) || !!user?.can_reverse_entries
  const [rows,    setRows]    = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [listPrintData, setListPrintData] = useState<PrintData | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [parties,  setParties]  = useState<Party[]>([])
  const [partyBalances, setPartyBalances] = useState<PartyBalanceMap>({})
  const [balancesLoaded, setBalancesLoaded] = useState(false)
  // Password confirmation step for editing a POSTED receipt/payment.
  const [passwordTarget, setPasswordTarget] = useState<any | null>(null)
  // Unlocked and ready to edit — the full voucher (with lines) + mandatory reason.
  const [editTarget, setEditTarget] = useState<{ row: any; reason: string } | null>(null)
  const [resolvingEdit, setResolvingEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r    = await apiCall({ page, limit: LIMIT })
      const body = r.data
      setRows(body?.data ?? body ?? [])
      setTotal(body?.pagination?.total ?? body?.total ?? (body?.data?.length ?? 0))
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  // Report the current row count up to the parent (purely informational — no fetch/logic change).
  useEffect(() => { onCount?.(total) }, [total, onCount])

  useEffect(() => {
    accountingAPI.accounts().then(r => setAccounts(r.data.data || [])).catch(() => {})
    Promise.all([
      partiesAPI.customers({ limit: 500 }),
      partiesAPI.suppliers({ limit: 500 }),
    ]).then(([c, s]) => setParties([...(c.data.data || []), ...(s.data.data || [])])).catch(() => {})
    // Current balance shown in the voucher popup — reuses the existing
    // /reports/party-balance endpoint (same source as the Ledger page and
    // Party Balance report), no new calculation logic.
    reportsAPI.partyBalance().then(r => {
      console.log('[party-balance] raw response:', r.data)
      const body: any = r.data?.data ?? r.data ?? {}
      const rows: any[] = Array.isArray(body) ? body : (body?.data ?? [])
      console.log('[party-balance] resolved rows:', rows)
      const map: PartyBalanceMap = {}
      rows.forEach(p => { map[p.id] = { debit: Number(p.debit) || 0, credit: Number(p.credit) || 0 } })
      setPartyBalances(map)
      setBalancesLoaded(true)
    }).catch(e => {
      console.error('[party-balance] fetch failed:', e)
      error('Could not load party balances', e?.message)
    })
  }, [])

  const refreshPartyBalances = () => {
    reportsAPI.partyBalance().then(r => {
      const body: any = r.data?.data ?? r.data ?? {}
      const rows: any[] = Array.isArray(body) ? body : (body?.data ?? [])
      const map: PartyBalanceMap = {}
      rows.forEach(p => { map[p.id] = { debit: Number(p.debit) || 0, credit: Number(p.credit) || 0 } })
      setPartyBalances(map)
    }).catch(e => {
      console.error('[party-balance] refresh failed:', e)
      error('Could not refresh party balances', e?.message)
    })
  }

  // Balances shown in the popup should be current — refresh right before
  // opening it and again after a voucher posts, since the previous voucher
  // (or the Next flow) changes the party's balance.
  const openModal = () => { refreshPartyBalances(); setModal(true) }
  const handleClose = () => { setModal(false); load() }

  // After password confirmation, fetch the full voucher (with lines) so we
  // can pre-fill the cash/bank account — the list row alone doesn't carry it.
  async function resolveAndOpenEdit(row: any, reason: string) {
    setResolvingEdit(true)
    try {
      const r = await accountingAPI.voucher(row.id)
      const body = r.data.data as any
      const full  = body.voucher
      const lines = body.lines || []
      // RECEIPT: cash/bank line is the debit side. PAYMENT: cash/bank line is the credit side.
      const cashLine = type === 'RECEIPT'
        ? lines.find((l: any) => Number(l.debit) > 0)
        : lines.find((l: any) => Number(l.credit) > 0)
      refreshPartyBalances()
      setEditTarget({ row: { ...full, cash_account_id: cashLine?.account_id }, reason })
    } catch (e: any) {
      error('Could not load voucher', e.message)
    } finally {
      setResolvingEdit(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={openModal}>New {title}</Button>
      </div>
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr><th>Voucher No</th><th>Date</th><th>Party</th><th>Narration</th><th className="td-right">Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading
                ? <SkeletonRows cols={7} />
                : rows.length
                  ? rows.map((v: any) => (
                      <tr key={v.id}>
                        <td className="td-mono text-brand">
                          {v.voucher_no || '—'}
                          {v.is_edited && (
                            <span className="badge badge-amber ml-1.5" style={{ fontSize: 9, padding: '1px 6px' }} title="This voucher has been edited since it was posted">Edited</span>
                          )}
                        </td>
                        <td className="td-mono">{formatDisplayDate(v.voucher_date || v.date, dateMode)}</td>
                        <td>{v.party_name || '—'}</td>
                        <td className="text-[var(--text-3)] truncate" style={{ maxWidth: 180 }}>{v.narration || '—'}</td>
                        <td className="td-right">{fmt(v.total_amount ?? v.amount ?? 0)}</td>
                        <td><Badge status={(v.status || 'posted').toLowerCase()}/></td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                          <Button variant="secondary" size="sm" icon={<Printer size={12}/>}
                            onClick={() => setListPrintData({
                              voucherNo:  v.voucher_no || '—',
                              type:       type,
                              date:       v.voucher_date || v.date,
                              partyName:  v.party_name  || undefined,
                              narration:  v.narration   || undefined,
                              netTotal:   Number(v.total_amount ?? v.amount ?? 0),
                              paidAmount: Number(v.total_amount ?? v.amount ?? 0),
                            })}
                          >Print</Button>
                          {(v.status || '').toLowerCase() === 'posted' && canEditPosted && (
                            <Button variant="secondary" size="sm" icon={<Pencil size={12}/>} disabled={resolvingEdit}
                              onClick={() => setPasswordTarget(v)}>Edit</Button>
                          )}
                          </div>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={7}><Empty message={`No ${title.toLowerCase()}s found`}/></td></tr>
              }
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
      <Modal open={modal} onClose={handleClose} title={`New ${title}`} size="lg">
        <QuickVoucherForm
          type={type}
          accounts={accounts}
          parties={parties}
          partyBalances={partyBalances}
          balancesLoaded={balancesLoaded}
          onPosted={refreshPartyBalances}
          onClose={handleClose}
        />
      </Modal>

      {/* Step 1 — password + mandatory reason */}
      <VoucherEditPasswordDialog
        open={!!passwordTarget}
        voucherLabel={passwordTarget?.voucher_no}
        onCancel={() => setPasswordTarget(null)}
        onUnlock={(reason) => {
          const target = passwordTarget
          setPasswordTarget(null)
          if (target) resolveAndOpenEdit(target, reason)
        }}
      />

      {/* Step 2 — unlocked edit form, pre-filled with the voucher's current values */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={editTarget ? `Edit ${title} — ${editTarget.row.voucher_no}` : ''} size="lg">
        {editTarget && (
          <QuickVoucherForm
            type={type} accounts={accounts} parties={parties}
            partyBalances={partyBalances} balancesLoaded={balancesLoaded}
            editRow={editTarget.row} editReason={editTarget.reason}
            onClose={() => { setEditTarget(null); load() }}
          />
        )}
      </Modal>
    </div>
  )
}

export function ReceiptsTab({ onCount }: { onCount?: (count: number) => void } = {}) {
  return <VoucherListTab apiCall={accountingAPI.receipts} type="RECEIPT" title="Receipt" onCount={onCount} />
}

export function PaymentsTab({ onCount }: { onCount?: (count: number) => void } = {}) {
  return <VoucherListTab apiCall={accountingAPI.payments} type="PAYMENT" title="Payment" onCount={onCount} />
}

export default ReceiptsTab
