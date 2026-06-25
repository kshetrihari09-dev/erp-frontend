import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Printer } from 'lucide-react'
import { accountingAPI, partiesAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty } from '@/components/ui'
import { fmt, fmtDate } from '@/utils'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import type { Account, Party } from '@/types'

const LIMIT = 20

function QuickVoucherForm({ type, accounts, parties, onClose }: {
  type: 'RECEIPT' | 'PAYMENT'; accounts: Account[]; parties: Party[]; onClose: () => void
}) {
  const { success, error } = useUIStore()
  const [printData, setPrintData] = useState<PrintData | null>(null)
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
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
      setPrintData({
        voucherNo:   saved.voucher_no || saved.return_no || (type === 'RECEIPT' ? 'REC' : 'PAY') + '-' + Date.now(),
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

  return (
    <>
      <div className="form-grid">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Party</label>
          <select className="erp-input" {...register('party_id')}>
            <option value="">— No party —</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date</label>
          <input type="date" className="erp-input" {...register('date')} />
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
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => { setPrintData(null); onClose() }}
        onNextBill={() => { setPrintData(null); onClose() }}
      />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>
          Create {type === 'RECEIPT' ? 'Receipt' : 'Payment'}
        </Button>
      </div>
    </>
  )
}

function VoucherListTab({ apiCall, type, title, onCount }: {
  apiCall: (p: any) => Promise<any>; type: 'RECEIPT' | 'PAYMENT'; title: string; onCount?: (count: number) => void
}) {
  const { error } = useUIStore()
  const [rows,    setRows]    = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [listPrintData, setListPrintData] = useState<PrintData | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [parties,  setParties]  = useState<Party[]>([])

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
  }, [])

  const handleClose = () => { setModal(false); load() }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)}>New {title}</Button>
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
                        <td className="td-mono">{fmtDate(v.voucher_date || v.date)}</td>
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
        <QuickVoucherForm type={type} accounts={accounts} parties={parties} onClose={handleClose} />
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
