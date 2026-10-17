import { useEffect, useSyncExternalStore } from 'react'
import useAuthStore from '@/store/authStore'
import { reminderAlertPoller } from '@/services/reminderAlertPoller'

/** Powers ReminderAlarmWatcher.tsx — unread, reminder-category rows from
 *  the existing generic notification feed (routes/notifications.js),
 *  written by services/reminderScheduler.js's processDueReminders() the
 *  moment a reminder becomes due.
 *
 *  Deliberately NOT a react-query refetchInterval: every observer of such a
 *  query owns its own timer, so repeated mounts multiply polling timers, and
 *  it has no Retry-After awareness. This reads the single module-level
 *  poller (services/reminderAlertPoller.ts): one loop per tab no matter how
 *  many components use this hook, 60 s default interval, exponential backoff
 *  on failure, 429 honours Retry-After. It keeps polling on every page of the
 *  app (a reminder alarm is pointless if it only fires when the Reminders page
 *  is open), but PAUSES while the browser tab is hidden and sends one catch-up
 *  request when the tab is visible again (see reminderAlertPoller.ts for the
 *  VITE_NOTIFICATION_POLL_HIDDEN_INTERVAL_MS opt-out). Stops on unmount / logout. */
export function useReminderAlerts() {
  const userId    = useAuthStore((s) => s.user?.id)
  const companyId = useAuthStore((s) => s.company?.id)
  const scope = userId ? `${userId}:${companyId ?? ''}` : null

  useEffect(() => {
    if (!scope) return
    return reminderAlertPoller.retain(scope)
  }, [scope])

  const snapshot = useSyncExternalStore(
    reminderAlertPoller.subscribe,
    reminderAlertPoller.getSnapshot,
    reminderAlertPoller.getSnapshot,
  )
  return { data: snapshot.data as { data: unknown[]; pagination?: unknown } | undefined, error: snapshot.error }
}
