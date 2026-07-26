import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Printer } from 'lucide-react'
import { accountingAPI, partiesAPI, reportsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, ConfirmDialog } from '@/components/ui'
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

function QuickVoucherForm({ type, accounts, parties, partyBalances, onPosted, onClose }: {
  type: 'RECEIPT' | 'PAYMENT'; accounts: Account[]; parties: Party[]; partyBalances: PartyBalanceMap; onPosted?: () => void; onClose: () => void
}) {
  const { success, error } = useUIStore()
  const [printData, setPrintData]     = useState<PrintData | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)
  // Populated only once the voucher has actually been posted — the real
  // voucher_no comes from next_voucher_number() on the backend at creation
  // time, so there is nothing genuine to show before that. This is purely
  // a read-only display of what the (unchanged) backend already generated.
  const [voucherNo, setVoucherNo] = useState<string | null>(null)
  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { party_id: '', date: new Date().toISOString().split('T')[0], account_id: '', amount: '', narration: '' },
  })

  const onSubmit = handleSubmit(async (data) => {
    if (!data.account_id)     { error('Select an account'); return }
    if (!Number(data.amount)) { error('Enter a valid amount'); return }
    try {
      const payload = { party_id: data.party_id || undefined, date: data.date, amount: Number(data.amount), account_id: data.account_id, narration: data.narration || undefined }
      let saved: any = {}
      if (type === 'RECEIPT') { const r = await accountingAPI.createReceipt(payload); saved = r.data?.data ?? {} }
      else                    { const r = await accountingAPI.createPayment(payload); saved = r.data?.data ?? {} }
      const partyName = parties.find((p: any) => p.id === data.party_id)?.name
      const no = saved.voucher_no || saved.return_no || (type === 'RECEIPT' ? 'REC' : 'PAY') + '-' + Date.now()
      setVoucherNo(no)
      onPosted?.()
      setPrintData({
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
    : !bal
      ? '—'
      : bal.debit > 0
        ? `Rs. ${fmt(bal.debit)} Dr`
        : bal.credit > 0
          ? `Rs. ${fmt(bal.credit)} Cr`
          : 'Rs. 0.00'

  const resetForNextVoucher = () => {
    setVoucherNo(null)
    reset({ party_id: '', date: new Date().toISOString().split('T')[0], account_id: '', amount: '', narration: '' })
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
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => { setPrintData(null); onClose() }}
        onNextBill={() => { setPrintData(null); resetForNextVoucher() }}
      />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={() => setConfirmSave(true)}>
          Create {type === 'RECEIPT' ? 'Receipt' : 'Payment'}
        </Button>
      </div>
    </>
  )
}

function VoucherListTab({ apiCall, type, title, onCount }: {
  apiCall: (p: any) => Promise<any>; type: 'RECEIPT' | 'PAYMENT'; title: string; onCount?: (count: number) => void
}) {
  const { error, dateMode } = useUIStore()
  const [rows,    setRows]    = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [listPrintData, setListPrintData] = useState<PrintData | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [parties,  setParties]  = useState<Party[]>([])
  const [partyBalances, setPartyBalances] = useState<PartyBalanceMap>({})

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
      const body: any = r.data?.data ?? r.data ?? {}
      const rows: any[] = Array.isArray(body) ? body : (body?.data ?? [])
      const map: PartyBalanceMap = {}
      rows.forEach(p => { map[p.id] = { debit: Number(p.debit) || 0, credit: Number(p.credit) || 0 } })
      setPartyBalances(map)
    }).catch(() => {})
  }, [])

  const refreshPartyBalances = () => {
    reportsAPI.partyBalance().then(r => {
      const body: any = r.data?.data ?? r.data ?? {}
      const rows: any[] = Array.isArray(body) ? body : (body?.data ?? [])
      const map: PartyBalanceMap = {}
      rows.forEach(p => { map[p.id] = { debit: Number(p.debit) || 0, credit: Number(p.credit) || 0 } })
      setPartyBalances(map)
    }).catch(() => {})
  }

  // Balances shown in the popup should be current — refresh right before
  // opening it and again after a voucher posts, since the previous voucher
  // (or the Next flow) changes the party's balance.
  const openModal = () => { refreshPartyBalances(); setModal(true) }
  const handleClose = () => { setModal(false); load() }

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
                        <td className="td-mono text-brand">{v.voucher_no || '—'}</td>
                        <td className="td-mono">{formatDisplayDate(v.voucher_date || v.date, dateMode)}</td>
                        <td>{v.party_name || '—'}</td>
                        <td className="text-[var(--text-3)] truncate" style={{ maxWidth: 180 }}>{v.narration || '—'}</td>
                        <td className="td-right">{fmt(v.total_amount ?? v.amount ?? 0)}</td>
                        <td><Badge status={(v.status || 'posted').toLowerCase()}/></td>
                        <td onClick={e => e.stopPropagation()}>
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
          onPosted={refreshPartyBalances}
          onClose={handleClose}
        />
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
