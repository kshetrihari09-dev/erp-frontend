import { Save } from 'lucide-react'
import { Button, ToggleSwitch } from '@/components/ui'
import { usePreferenceSection } from '../hooks/usePreferenceSection'
import type { CompanyPreferences } from '@/types'

const ROWS: { key: keyof CompanyPreferences['notifications']; label: string; desc: string }[] = [
  { key: 'lowStock',           label: 'Low Stock',          desc: 'Alert when a product falls below its reorder level.' },
  { key: 'expiry',             label: 'Expiry',              desc: 'Alert as batches approach their expiry date.' },
  { key: 'outstandingBalance', label: 'Outstanding Balance', desc: 'Alert on overdue customer/supplier balances.' },
  { key: 'paymentDue',         label: 'Payment Due',         desc: 'Alert when a credit payment is coming due.' },
  { key: 'backupFailure',      label: 'Backup Failure',      desc: 'Alert if a scheduled or manual backup fails.' },
  { key: 'systemAlerts',       label: 'System Alerts',       desc: 'General system/maintenance notices.' },
]

export default function NotificationsSection() {
  const { form, set, save, saving, loading, dialog } = usePreferenceSection('notifications', 'Notification settings saved')

  if (loading || !form) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-1">Notifications</div>
        <p className="text-xs text-[var(--text-4)] mb-4">Choose which in-app alerts are active.</p>

        <div className="flex flex-col divide-y divide-[var(--border)]">
          {ROWS.map(row => (
            <div key={row.key} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{row.label}</div>
                <p className="text-[11px] text-[var(--text-4)]">{row.desc}</p>
              </div>
              <ToggleSwitch checked={form[row.key]} onChange={v => set(row.key, v)} />
            </div>
          ))}
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
