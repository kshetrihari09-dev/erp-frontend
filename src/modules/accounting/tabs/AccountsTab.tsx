import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useAccounts, useCreateAccount } from '@/hooks/useQuery'
import { Button, Modal, Empty, SkeletonRows } from '@/components/ui'
import { fmt } from '@/utils'
import { ACCOUNT_TYPES } from '@/constants'
import type { Account } from '@/types'

const schema = z.object({
  name:     z.string().min(1, 'Required'),
  code:     z.string().min(1, 'Required'),   // backend field: code
  type:     z.string().min(1, 'Required'),   // backend field: type
  sub_type: z.string().optional(),
  is_group: z.boolean().default(false),
})
type Form = z.infer<typeof schema>

function AccountForm({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount()
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'asset', is_group: false },
  })

  const onSubmit = handleSubmit(async (data) => {
    await create.mutateAsync(data as any)
    onClose()
  })

  return (
    <>
      <div className="form-grid">
        <div className="span2">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Account Name *</label>
          <input className="erp-input" placeholder="e.g. Cash in Hand" {...register('name')} />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Account Code *</label>
          <input className="erp-input" placeholder="e.g. 1001" {...register('code')} />
          {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Account Type *</label>
          <select className="erp-input" {...register('type')}>
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Sub Type</label>
          <input className="erp-input" placeholder="e.g. cash, receivable, payable…" {...register('sub_type')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Account Kind</label>
          {/* FIX: was onChange={() => {} — never updated the form value */}
          <select
            className="erp-input"
            value={watch('is_group') ? 'true' : 'false'}
            onChange={e => setValue('is_group', e.target.value === 'true')}
          >
            <option value="false">Ledger Account (transactions)</option>
            <option value="true">Group Account (summary only)</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>Create Account</Button>
      </div>
    </>
  )
}

export default function AccountsTab({ onCount }: { onCount?: (count: number) => void } = {}) {
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal] = useState(false)
  const { data, isLoading } = useAccounts({ type: typeFilter || undefined })
  const accounts = (data as Account[]) || []

  // Report the current row count up to the parent (purely informational — no fetch/logic change).
  useEffect(() => { onCount?.(accounts.length) }, [accounts.length, onCount])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 acc-filter-row">
        <select className="erp-input acc-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => setModal(true)} className="acc-filter-btn">New Account</Button>
      </div>
      <div className="table-card">
        <div className="overflow-x-auto acc-desktop-table">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Type</th><th>Sub Type</th><th>Kind</th>
                <th className="td-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : accounts.length
                  ? accounts.map(a => (
                      <tr key={a.id}>
                        <td className="td-mono text-brand">{a.code}</td>
                        <td className="font-semibold">{a.name}</td>
                        <td><span className="badge badge-blue">{a.type}</span></td>
                        <td className="text-[var(--text-3)]">{a.sub_type || '—'}</td>
                        <td>
                          {a.is_group
                            ? <span className="badge badge-purple">Group</span>
                            : <span className="badge badge-muted">Ledger</span>
                          }
                        </td>
                        <td className="td-right font-mono">{fmt(a.balance ?? 0)}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No accounts found — create one to get started"/></td></tr>
              }
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="acc-mobile-list">
          {isLoading ? (
            <div className="acc-mobile-skel-wrap">
              {[1,2,3,4].map(i => <div key={i} className="acc-mobile-card acc-mobile-card-skel" />)}
            </div>
          ) : accounts.length === 0 ? (
            <Empty message="No accounts found — create one to get started"/>
          ) : (
            accounts.map(a => (
              <div key={a.id} className="acc-mobile-card">
                <div className="acc-mc-top">
                  <span className="acc-mc-no">{a.code}</span>
                  <span className="acc-mc-amount">{fmt(a.balance ?? 0)}</span>
                </div>
                <div className="acc-mc-sub">
                  <span className="acc-mc-party">{a.name}</span>
                </div>
                <div className="acc-mc-chips">
                  <span className="badge badge-blue">{a.type}</span>
                  {a.is_group
                    ? <span className="badge badge-purple">Group</span>
                    : <span className="badge badge-muted">Ledger</span>
                  }
                  {a.sub_type && <span className="acc-mc-narration" style={{ padding: 0, border: 'none', background: 'none' }}>{a.sub_type}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="New Account" size="lg">
        <AccountForm onClose={() => setModal(false)} />
      </Modal>
    </div>
  )
}
