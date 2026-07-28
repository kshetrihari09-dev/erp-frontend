import { Save } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { usePreferenceSection } from '../hooks/usePreferenceSection'
import { useAccounts } from '@/hooks/useQuery'

const VOUCHER_TYPES: { key: string; label: string }[] = [
  { key: 'RECEIPT',     label: 'Receipt' },
  { key: 'PAYMENT',     label: 'Payment' },
  { key: 'JOURNAL',     label: 'Journal Voucher' },
  { key: 'CONTRA',      label: 'Contra' },
  { key: 'DEBIT_NOTE',  label: 'Debit Note' },
  { key: 'CREDIT_NOTE', label: 'Credit Note' },
  { key: 'OPENING',     label: 'Opening Balance' },
]

export default function AccountingSection() {
  const { data: accountsData } = useAccounts()
  const accounts = accountsData || []
  const accountOptions = [
    { value: '', label: '— Not set —' },
    ...accounts.filter(a => !a.is_group).map(a => ({ value: a.id, label: `${a.account_code} · ${a.name}` })),
  ]

  const { form, set, save, saving, loading, dialog } = usePreferenceSection('accounting', 'Accounting settings saved')

  if (loading || !form) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  const setVoucherPrefix = (key: string, value: string) =>
    set('voucherNumberingPrefix', { ...form.voucherNumberingPrefix, [key]: value })

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card mb-4">
        <div className="font-bold text-sm mb-1">Default Accounts</div>
        <p className="text-xs text-[var(--text-4)] mb-4">Used to auto-post journal entries from Sales, Purchase, and Vouchers.</p>
        <div className="form-grid">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Default Cash Account</label>
            <Select value={form.defaultCashAccountId || ''} onChange={e => set('defaultCashAccountId', e.target.value || null)} options={accountOptions} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Default Bank Account</label>
            <Select value={form.defaultBankAccountId || ''} onChange={e => set('defaultBankAccountId', e.target.value || null)} options={accountOptions} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Customer Control Account</label>
            <Select value={form.customerControlAccountId || ''} onChange={e => set('customerControlAccountId', e.target.value || null)} options={accountOptions} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Supplier Control Account</label>
            <Select value={form.supplierControlAccountId || ''} onChange={e => set('supplierControlAccountId', e.target.value || null)} options={accountOptions} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Discount Account</label>
            <Select value={form.discountAccountId || ''} onChange={e => set('discountAccountId', e.target.value || null)} options={accountOptions} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Round Off Account</label>
            <Select value={form.roundOffAccountId || ''} onChange={e => set('roundOffAccountId', e.target.value || null)} options={accountOptions} />
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-1">Voucher Numbering</div>
        <p className="text-xs text-[var(--text-4)] mb-4">Prefix used for each voucher type's auto-generated number.</p>
        <div className="form-grid">
          {VOUCHER_TYPES.map(v => (
            <div key={v.key}>
              <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">{v.label}</label>
              <Input value={form.voucherNumberingPrefix[v.key] ?? ''} onChange={e => setVoucherPrefix(v.key, e.target.value)} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-4)] mt-3">
          Fiscal period locking and voucher-edit permissions live under <b>Users &amp; Permissions</b> and <b>Fiscal Years</b>.
        </p>
        <div className="flex justify-end mt-5">
          <Button variant="primary" icon={<Save size={14}/>} loading={saving} onClick={save}>
            Save Changes
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  )
}
