import { Save } from 'lucide-react'
import { Button, Select, ToggleSwitch } from '@/components/ui'
import useUIStore from '@/store/uiStore'
import { usePreferenceSection } from '../hooks/usePreferenceSection'

const PAYMENT_MODE_OPTIONS = [
  { value: 'none',   label: 'No Default (force manual selection)' },
  { value: 'cash',   label: 'Cash' },
  { value: 'credit', label: 'Credit' },
]

const TIME_ZONES = [
  'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Dubai', 'UTC',
  'Asia/Dhaka', 'Asia/Karachi', 'Asia/Singapore',
]

const NUMBER_FORMATS = [
  { value: 'en-IN', label: 'Nepali/Indian (1,00,000.00)' },
  { value: 'en-US', label: 'International (100,000.00)' },
]

export default function GeneralSection() {
  const { dateMode, setDateMode } = useUIStore()
  const { form, set, save, saving, loading, dialog } = usePreferenceSection('general', 'General settings saved')

  if (loading || !form) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  async function handleSave() {
    await save()
    if (form) setDateMode(form.dateDisplayMode) // keep topbar toggle in sync
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-1">General</div>
        <p className="text-xs text-[var(--text-4)] mb-4">Date, number, and locale defaults used across the app.</p>

        <div className="form-grid">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date Display</label>
            <Select
              value={form.dateDisplayMode}
              onChange={e => set('dateDisplayMode', e.target.value as any)}
              options={[
                { value: 'AD', label: 'AD only (Gregorian)' },
                { value: 'BS', label: 'BS only (Bikram Sambat)' },
                { value: 'BOTH', label: 'Both (AD + BS)' },
              ]}
            />
            <p className="text-[11px] text-[var(--text-4)] mt-1">Currently showing: <b>{dateMode}</b> in the topbar. Save to apply everywhere.</p>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Number Format</label>
            <Select value={form.numberFormat} onChange={e => set('numberFormat', e.target.value)} options={NUMBER_FORMATS} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Time Zone</label>
            <Select
              value={form.timeZone}
              onChange={e => set('timeZone', e.target.value)}
              options={TIME_ZONES.map(z => ({ value: z, label: z }))}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Default Payment Mode</label>
            <Select value={form.defaultPaymentMode} onChange={e => set('defaultPaymentMode', e.target.value)} options={PAYMENT_MODE_OPTIONS} />
            <p className="text-[11px] text-[var(--text-4)] mt-1">"No Default" forces the user to pick Cash/Credit manually on every sale.</p>
          </div>
          <div className="stp-span2 flex items-center justify-between border-t border-[var(--border)] pt-3 mt-1">
            <div>
              <div className="text-sm font-medium">Round Off Invoices</div>
              <p className="text-[11px] text-[var(--text-4)]">Round the net total to the nearest whole number automatically.</p>
            </div>
            <ToggleSwitch checked={form.roundOff} onChange={v => set('roundOff', v)} />
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <Button variant="primary" icon={<Save size={14}/>} loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  )
}
