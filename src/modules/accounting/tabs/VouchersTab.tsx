import { useState, useCallback, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { Plus, Trash2, CheckCircle2, RotateCcw, Printer } from 'lucide-react'
import { accountingAPI, partiesAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, SearchInput } from '@/components/ui'
import { fmt, fmtDate } from '@/utils'
import { VOUCHER_TYPES } from '@/constants'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import type { Voucher, Account, Party } from '@/types'

const LIMIT = 20

interface VouchersTabProps {
  /** Optional: lets the parent surface the live row count (e.g. a tab badge) without altering data-fetch logic. */
  onCount?: (count: number) => void
  /** Optional: bump this number from the parent to open the "New Voucher" modal externally (e.g. a top-bar button). */
  openSignal?: number
}

export default function VouchersTab({ onCount, openSignal }: VouchersTabProps = {}) {
  const { success, error } = useUIStore()
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [search,   setSearch]   = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState(false)
  const [detail,   setDetail]   = useState<Voucher | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await accountingAPI.vouchers({
        page, limit: LIMIT,
        voucher_type: typeFilter || undefined,
        status: statusFilter || undefined,
      })
      setVouchers(r.data.data || [])
      setTotal(r.data.pagination?.total || 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page, typeFilter, statusFilter])

  useEffect(() => { load() }, [load])

  // Report the current row count up to the parent (purely informational — no fetch/logic change).
  useEffect(() => { onCount?.(total) }, [total, onCount])

  // External trigger (e.g. top-bar "+ New Voucher") opens the same existing modal.
  useEffect(() => { if (openSignal) setModal(true) }, [openSignal])

  async function postVoucher(id: string) {
    try { await accountingAPI.postVoucher(id); success('Voucher posted'); load() }
    catch (e: any) { error('Cannot post', e.message) }
  }

  async function reverseVoucher(id: string) {
    if (!confirm('Reverse this voucher?')) return
    try { await accountingAPI.reverseVoucher(id); success('Voucher reversed'); load() }
    catch (e: any) { error('Cannot reverse', e.message) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap acc-filter-row">
        <SearchInput value={search} onChange={setSearch} className="w-52" />
        <select className="erp-input" style={{ width: 150 }} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">All Types</option>
          {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="erp-input" style={{ width: 130 }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          {['draft','posted','cancelled','reversed'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr><th>Voucher No</th><th>Type</th><th>Date</th><th>Party</th><th>Narration</th><th className="td-right">Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading
                ? <SkeletonRows cols={8} />
                : vouchers.length
                  ? vouchers.map(v => (
                      <tr key={v.id} className="clickable"
                        onClick={() => accountingAPI.voucher(v.id).then(r => setDetail(r.data.data)).catch(() => {})}>
                        <td className="td-mono text-brand">{v.voucher_no}</td>
                        <td><span className="badge badge-blue">{v.voucher_type}</span></td>
                        <td className="td-mono">{fmtDate(v.voucher_date)}</td>
                        <td>{v.party_name || '—'}</td>
                        <td className="max-w-[180px] truncate text-[var(--text-3)]">{v.narration || '—'}</td>
                        <td className="td-right">{fmt(v.total_amount)}</td>
                        <td><Badge status={v.status}/></td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="secondary" size="sm" icon={<Printer size={12}/>}
                              onClick={() => setPrintData({
                                voucherNo:  v.voucher_no,
                                type:       (v.voucher_type || 'JOURNAL') as any,
                                date:       v.voucher_date,
                                partyName:  v.party_name || undefined,
                                narration:  v.narration  || undefined,
                                netTotal:   Number(v.total_amount || 0),
                              })}
                            >Print</Button>
                            {v.status === 'draft' && (
                              <Button variant="primary" size="sm" icon={<CheckCircle2 size={12}/>}
                                onClick={() => postVoucher(v.id)}>Post</Button>
                            )}
                            {v.status === 'posted' && (
                              <Button variant="danger" size="sm" icon={<RotateCcw size={12}/>}
                                onClick={() => reverseVoucher(v.id)}>Reverse</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={8}><Empty message="No vouchers found"/></td></tr>
              }
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>

      {/* Voucher detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.voucher_type} — ${detail.voucher_no}` : ''} size="lg">
        {detail && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                ['Date',    fmtDate(detail.voucher_date)],
                ['Status',  ''],
                ['Party',   detail.party_name || '—'],
                ['Narration',detail.narration || '—'],
              ].map(([l,v], i) => (
                <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-4)] mb-1">{l}</div>
                  {l === 'Status'
                    ? <Badge status={detail.status}/>
                    : <div className="font-semibold text-sm">{v}</div>
                  }
                </div>
              ))}
            </div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-4)] mb-2">Journal Lines</div>
            <div className="table-card">
              <table className="erp-table items-table">
                <thead><tr><th>Account</th><th>Description</th><th className="td-right">Debit</th><th className="td-right">Credit</th></tr></thead>
                <tbody>
                  {(detail.lines || []).map((l, i) => (
                    <tr key={i}>
                      <td className="font-medium">{l.account_name || l.account_id}</td>
                      <td className="text-[var(--text-3)]">{l.description || '—'}</td>
                      <td className="td-right text-red-600">{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                      <td className="td-right text-green-700">{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="text-right font-bold text-sm pr-3">TOTAL</td>
                    <td className="td-right font-bold text-red-600">{fmt((detail.lines||[]).reduce((s,l)=>s+l.debit,0))}</td>
                    <td className="td-right font-bold text-green-700">{fmt((detail.lines||[]).reduce((s,l)=>s+l.credit,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Create voucher modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Create Voucher" size="xl">
        <VoucherForm onClose={() => { setModal(false); load() }} />
      </Modal>
    </div>
  )
}

// ─── Voucher creation form ─────────────────────────────────────────────────────
function VoucherForm({ onClose }: { onClose: () => void }) {
  const { success, error } = useUIStore()
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [parties,   setParties]   = useState<Party[]>([])
  const [printData, setPrintData] = useState<PrintData | null>(null)

  useEffect(() => {
    accountingAPI.accounts().then(r => setAccounts(r.data.data || [])).catch(() => {})
    partiesAPI.customers({ limit: 500 }).then(r => setParties(r.data.data || [])).catch(() => {})
  }, [])

  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      voucher_type: 'JOURNAL',
      voucher_date: new Date().toISOString().split('T')[0],
      party_id: '',
      narration: '',
      lines: [
        { account_id: '', description: '', debit: '', credit: '' },
        { account_id: '', description: '', debit: '', credit: '' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines')

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0)
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.01

  const onSubmit = handleSubmit(async (data) => {
    const validLines = data.lines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { error('Need at least 2 lines'); return }
    if (!balanced) { error('Debits must equal credits'); return }
    try {
      const res = await accountingAPI.createVoucher({
        voucher_type: data.voucher_type,
        voucher_date: data.voucher_date,
        party_id:     data.party_id || undefined,
        narration:    data.narration,
        lines:        validLines.map(l => ({
          account_id: l.account_id,
          description: l.description,
          debit:  Number(l.debit)  || 0,
          credit: Number(l.credit) || 0,
        })),
      })
      const saved = res?.data?.data ?? {}
      const dr    = data.lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0)
      setPrintData({
        voucherNo:   saved.voucher_no || `VCH-${Date.now()}`,
        type:        (data.voucher_type || 'JOURNAL') as any,
        date:        data.voucher_date || new Date().toISOString().split('T')[0],
        narration:   data.narration,
        partyName:   parties.find((p: any) => p.id === data.party_id)?.name,
        netTotal:    dr,
      })
      success('Voucher created')
    } catch (e: any) { error('Failed', e.message) }
  })

  return (
    <>
      <div className="form-grid mb-4">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Type</label>
          <select className="erp-input" {...register('voucher_type')}>
            {VOUCHER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date</label>
          <input type="date" className="erp-input" {...register('voucher_date')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Party</label>
          <select className="erp-input" {...register('party_id')}>
            <option value="">— No party —</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Narration</label>
          <input className="erp-input" placeholder="Being…" {...register('narration')} />
        </div>
      </div>

      <div className="divider"/>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-4)]">Journal Lines</div>
        <Button variant="secondary" size="sm" icon={<Plus size={12}/>}
          onClick={() => append({ account_id: '', description: '', debit: '', credit: '' })}>
          Add line
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="erp-table items-table">
          <thead><tr><th style={{ minWidth: 200 }}>Account</th><th>Description</th><th style={{ width: 110 }} className="td-right">Debit</th><th style={{ width: 110 }} className="td-right">Credit</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={field.id}>
                <td>
                  <select className="erp-input" style={{ fontSize: 12, padding: '5px 7px' }} {...register(`lines.${i}.account_id`)}>
                    <option value="">Select account…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </td>
                <td>
                  <input className="erp-input" style={{ fontSize: 12, padding: '5px 7px' }}
                    placeholder="Description…" {...register(`lines.${i}.description`)} />
                </td>
                <td>
                  <input type="number" className="erp-input" style={{ fontSize: 12, padding: '5px 7px', textAlign: 'right' }}
                    placeholder="0.00" {...register(`lines.${i}.debit`)} />
                </td>
                <td>
                  <input type="number" className="erp-input" style={{ fontSize: 12, padding: '5px 7px', textAlign: 'right' }}
                    placeholder="0.00" {...register(`lines.${i}.credit`)} />
                </td>
                <td>
                  <button className="w-6 h-6 flex items-center justify-center text-[var(--text-4)] hover:text-red-500"
                    onClick={() => fields.length > 2 && remove(i)}>
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-right font-bold text-xs pr-3 text-[var(--text-3)]">TOTAL</td>
              <td className={`td-right font-bold font-mono ${!balanced ? 'text-red-500' : 'text-green-700'}`}>{fmt(totalDr)}</td>
              <td className={`td-right font-bold font-mono ${!balanced ? 'text-red-500' : 'text-green-700'}`}>{fmt(totalCr)}</td>
              <td/>
            </tr>
          </tfoot>
        </table>
      </div>

      {!balanced && totalDr > 0 && (
        <p className="text-xs text-red-500 mt-2">⚠ Debits ({fmt(totalDr)}) ≠ Credits ({fmt(totalCr)})</p>
      )}

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>Create Voucher</Button>
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => { setPrintData(null); onClose() }}
        onNextBill={() => { setPrintData(null); reset(); onClose() }}
      />
      </div>
    </>
  )
}
