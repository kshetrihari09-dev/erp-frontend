/**
 * ReminderCard.tsx — one reminder row on the dashboard (spec section 8).
 * Deliberately not overcrowded: priority + title + when + who/what it's
 * about, then four actions. Everything else (description, full repeat
 * rule, etc.) lives in the edit modal, not here.
 */
import { useRef, useState, useEffect } from 'react'
import { Clock, Check, Edit2, MoreVertical, User as UserIcon, FileText, RotateCcw, Trash2, AlarmClock } from 'lucide-react'
import { Z } from '@/styles/zIndex'
import { useCompleteReminder, useReopenReminder, useSnoozeReminder, useDeleteReminder } from '@/hooks/useQuery'

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#65a30d',
}
const PRIORITY_LABEL: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' }

const SNOOZE_OPTIONS = [
  { preset: '10m', label: '10 minutes' },
  { preset: '30m', label: '30 minutes' },
  { preset: '1h', label: '1 hour' },
  { preset: 'tonight', label: 'Tonight' },
  { preset: 'tomorrow_morning', label: 'Tomorrow morning' },
  { preset: 'tomorrow', label: 'Tomorrow' },
  { preset: 'next_working_day', label: 'Next working day' },
]

function fmtDue(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  const sameYear = d.getFullYear() === now.getFullYear()
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}, ${time}`
}

export default function ReminderCard({ reminder, onEdit }: { reminder: any; onEdit: () => void }) {
  const complete = useCompleteReminder()
  const reopen   = useReopenReminder()
  const snooze   = useSnoozeReminder()
  const del      = useDeleteReminder()

  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [customSnooze, setCustomSnooze] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const menuRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) { setSnoozeOpen(false); setCustomSnooze(false) }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isCompleted = reminder.status === 'completed'
  const linkedLabel = reminder.invoice_no ? `Invoice ${reminder.invoice_no}` : reminder.purchase_no ? `PO ${reminder.purchase_no}` : null

  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
      reminder.is_overdue ? 'border-red-200 bg-red-50/40 dark:bg-red-950/10' : 'border-[var(--border)] bg-[var(--surface)]'
    }`}>
      <span className="mt-1 text-sm leading-none flex-shrink-0" title={`${reminder.priority} priority`}>
        {PRIORITY_LABEL[reminder.priority] || '⚪'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isCompleted ? 'line-through text-[var(--text-4)]' : 'text-[var(--text)]'}`}>
            {reminder.title}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--surface-3)] text-[var(--text-3)]">
            {reminder.type_label}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-3)] flex-wrap">
          <span className="flex items-center gap-1"><Clock size={12} /> {fmtDue(reminder.effective_due_at)}</span>
          {reminder.customer_name && <span>{reminder.customer_name}</span>}
          {linkedLabel && <span className="flex items-center gap-1"><FileText size={12} /> {linkedLabel}</span>}
          {reminder.invoice_due_amount != null && <span className="font-semibold text-[var(--text-2)]">Rs. {Number(reminder.invoice_due_amount).toFixed(2)}</span>}
          {reminder.assigned_user_name && <span className="flex items-center gap-1"><UserIcon size={12} /> {reminder.assigned_user_name}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!isCompleted ? (
          <>
            <button
              title="Complete" onClick={() => complete.mutate(reminder.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50"
            ><Check size={15} /></button>

            <div className="relative" ref={snoozeRef}>
              <button
                title="Snooze" onClick={() => setSnoozeOpen(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)]"
              ><AlarmClock size={15} /></button>
              {snoozeOpen && (
                <div className="absolute right-0 top-9 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-1" style={{ zIndex: Z.dropdown }}>
                  {!customSnooze ? (
                    <>
                      {SNOOZE_OPTIONS.map(o => (
                        <button
                          key={o.preset}
                          onClick={() => { snooze.mutate({ id: reminder.id, preset: o.preset }); setSnoozeOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        >{o.label}</button>
                      ))}
                      <button onClick={() => setCustomSnooze(true)} className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] border-t border-[var(--border)] mt-1">
                        Custom…
                      </button>
                    </>
                  ) : (
                    <div className="px-3 py-2">
                      <input
                        type="datetime-local"
                        className="erp-input text-xs w-full"
                        onChange={e => {
                          if (!e.target.value) return
                          snooze.mutate({ id: reminder.id, snoozed_until: new Date(e.target.value).toISOString() })
                          setSnoozeOpen(false); setCustomSnooze(false)
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              title="Edit" onClick={onEdit}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)]"
            ><Edit2 size={14} /></button>
          </>
        ) : (
          <button
            title="Reopen" onClick={() => reopen.mutate(reminder.id)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)]"
          ><RotateCcw size={14} /></button>
        )}

        <div className="relative" ref={menuRef}>
          <button
            title="More" onClick={() => setMenuOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)]"
          ><MoreVertical size={15} /></button>
          {menuOpen && (
            <div className="absolute right-0 top-9 w-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-1" style={{ zIndex: Z.dropdown }}>
              {isCompleted && (
                <button onClick={() => { onEdit(); setMenuOpen(false) }} className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] flex items-center gap-2">
                  <Edit2 size={13} /> Edit
                </button>
              )}
              <button
                onClick={() => { if (window.confirm('Delete this reminder? This cannot be undone.')) del.mutate(reminder.id); setMenuOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              ><Trash2 size={13} /> Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
