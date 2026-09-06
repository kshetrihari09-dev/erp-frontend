/**
 * ReminderAlarmWatcher.tsx — the actual "alarm rings" behavior (spec
 * section 10) that was missing: everything built so far only recorded a
 * notification row and showed reminders in a passive dashboard. This is
 * what makes a due reminder actually interrupt you while you're using
 * the app, anywhere in it.
 *
 * Mounted once, globally, in AppLayout.tsx (next to ToastContainer) — not
 * per-page — so it fires no matter which screen you're on, matching how
 * OfflineStatusIndicator is also a single always-mounted overlay.
 *
 * Source of truth: the existing generic notification feed
 * (routes/notifications.js), filtered to category='reminder' + unread.
 * services/reminderScheduler.js's processDueReminders() already writes
 * exactly one such row the moment a reminder's due time arrives — this
 * component doesn't recompute "is it due", it just surfaces what the
 * backend already decided, polling every 20s (useReminderAlerts).
 *
 * Known limitation (browser policy, not fixable from here): the alarm
 * SOUND only plays once the user has interacted with the page at least
 * once this session (a click, a keypress — anywhere). The visual popup
 * always appears regardless; only the very first alarm in a totally
 * fresh, untouched tab might be silent. See utils/beep.ts's docblock.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, AlarmClock, X, ExternalLink } from 'lucide-react'
import { playReminderAlarm } from '@/utils/beep'
import { PATHS } from '@/constants'
import { Z } from '@/styles/zIndex'
import { useReminderAlerts, useMarkNotificationRead, useCompleteReminder, useSnoozeReminder } from '@/hooks/useQuery'

interface AlertNotif {
  id: string
  title: string
  message: string
  created_at: string
  metadata?: { reminder_id?: string; reminder_type?: string; invoice_id?: string | null }
}

export default function ReminderAlarmWatcher() {
  const navigate = useNavigate()
  const { data } = useReminderAlerts()
  const markRead  = useMarkNotificationRead()
  const complete  = useCompleteReminder()
  const snooze    = useSnoozeReminder()

  // Notification IDs already rung/shown this session — a poll returning
  // the same still-unread notification again (nothing actioned yet)
  // must NOT re-ring the alarm every 20s, only the first time it appears.
  const seenRef = useRef<Set<string>>(new Set())
  const [active, setActive] = useState<AlertNotif[]>([])

  useEffect(() => {
    const incoming = ((data?.data || []) as AlertNotif[]).filter(n => !seenRef.current.has(n.id))
    if (incoming.length === 0) return
    incoming.forEach(n => seenRef.current.add(n.id))
    setActive(prev => [...incoming, ...prev])
    playReminderAlarm()
  }, [data])

  function dismiss(id: string) {
    setActive(prev => prev.filter(n => n.id !== id))
    markRead.mutate(id)
  }

  function handleComplete(n: AlertNotif) {
    if (n.metadata?.reminder_id) complete.mutate(n.metadata.reminder_id)
    dismiss(n.id)
  }

  function handleSnooze(n: AlertNotif) {
    if (n.metadata?.reminder_id) snooze.mutate({ id: n.metadata.reminder_id, preset: '10m' })
    dismiss(n.id)
  }

  function handleView(n: AlertNotif) {
    dismiss(n.id)
    navigate(PATHS.REMINDERS)
  }

  if (active.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
      style={{ zIndex: Z.toast }}
      role="alert" aria-live="assertive"
    >
      {active.map(n => (
        <div key={n.id} className="rounded-xl border border-amber-300 bg-[var(--surface)] shadow-lg p-3.5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <Bell size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text)] leading-snug">{n.title}</div>
              {n.message && <div className="text-xs text-[var(--text-3)] mt-0.5 leading-snug">{n.message}</div>}
            </div>
            <button onClick={() => dismiss(n.id)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-4)] hover:bg-[var(--surface-3)]">
              <X size={13} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => handleView(n)} className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
              <ExternalLink size={12} /> View
            </button>
            <button onClick={() => handleSnooze(n)} className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
              <AlarmClock size={12} /> Snooze 10m
            </button>
            <button onClick={() => handleComplete(n)} className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700">
              <Check size={12} /> Complete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
