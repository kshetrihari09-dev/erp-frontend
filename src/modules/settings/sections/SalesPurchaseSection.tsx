import { Save } from 'lucide-react'
import { Button, Input, ToggleSwitch } from '@/components/ui'
import { usePreferenceSection } from '../hooks/usePreferenceSection'
import { useCompanySettings } from '@/hooks/useQuery'

export default function SalesPurchaseSection() {
  const { data: company } = useCompanySettings()
  const { form, set, save, saving, loading, dialog } = usePreferenceSection('salesPurchase', 'Sales & Purchase settings saved')

  if (loading || !form) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-1">Sales &amp; Purchase</div>
        <p className="text-xs text-[var(--text-4)] mb-4">Invoice numbering, tax, and stock rules used by Sales &amp; Purchase.</p>

        <div className="form-grid">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Invoice Prefix Override</label>
            <Input
              placeholder={`Default: ${company?.invoice_prefix || 'INV'} (from Company settings)`}
              value={form.invoicePrefixOverride}
              onChange={e => set('invoicePrefixOverride', e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Tax / VAT % Override</label>
            <Input
              type="number"
              placeholder={`Default: ${company?.vat_percent ?? 13}% (from Company settings)`}
              value={form.taxPercentOverride ?? ''}
              onChange={e => set('taxPercentOverride', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Credit Terms (days)</label>
            <Input type="number" value={form.creditDays} onChange={e => set('creditDays', Number(e.target.value))} />
          </div>

          <div className="stp-span2 border-t border-[var(--border)] pt-3 mt-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Round Off</div>
                <p className="text-[11px] text-[var(--text-4)]">Round the net total on sale/purchase invoices.</p>
              </div>
              <ToggleSwitch checked={form.roundOff} onChange={v => set('roundOff', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Allow Negative Stock</div>
                <p className="text-[11px] text-[var(--text-4)]">Permit selling items below zero available stock.</p>
              </div>
              <ToggleSwitch checked={form.allowNegativeStock} onChange={v => set('allowNegativeStock', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Allow Expired Batch Sale</div>
                <p className="text-[11px] text-[var(--text-4)]">Permit selling from a batch past its expiry date.</p>
              </div>
              <ToggleSwitch checked={form.allowExpiredBatchSale} onChange={v => set('allowExpiredBatchSale', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Require Batch on Sale</div>
                <p className="text-[11px] text-[var(--text-4)]">Force batch selection before completing a sale line.</p>
              </div>
              <ToggleSwitch checked={form.requireBatchOnSale} onChange={v => set('requireBatchOnSale', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Require Expiry on Batch</div>
                <p className="text-[11px] text-[var(--text-4)]">Force an expiry date when creating a new batch on purchase.</p>
              </div>
              <ToggleSwitch checked={form.requireExpiryOnBatch} onChange={v => set('requireExpiryOnBatch', v)} />
            </div>
          </div>
        </div>

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
