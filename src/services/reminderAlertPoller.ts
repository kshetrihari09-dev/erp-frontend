/**
 * reminderAlertPoller.ts — THE single notification polling mechanism.
 *
 * Feeds ReminderAlarmWatcher (via hooks/useQuery.ts → useReminderAlerts) from
 * GET /notifications?category=reminder&unread_only=true&limit=20.
 *
 * One module-level loop for the whole tab: however many components call
 * useReminderAlerts(), however often they re-render or remount, there is
 * exactly one timer chain and one request in flight (see pollingLoop.ts).
 * It stops when the last consumer unmounts and is hard-reset on logout.
 *
 * Interval: VITE_NOTIFICATION_POLL_INTERVAL_MS (default 60 000 ms, min 15 000).
 */
import config from '@/config/env'
import useAuthStore from '@/store/authStore'
import { notificationsAPI } from '@/services/api'
import { createPollingLoop } from './pollingLoop'

export const REMINDER_ALERT_PARAMS = { category: 'reminder', unread_only: 'true', limit: 20 } as const

export const reminderAlertPoller = createPollingLoop({
  fetcher: (signal) =>
    notificationsAPI
      .list({ ...REMINDER_ALERT_PARAMS }, { signal })
      .then((res: { data: { data: unknown[]; pagination?: unknown } }) => ({ data: res.data.data, pagination: res.data.pagination })),
  getIntervalMs: () => config.notificationPollIntervalMs,
  // Don't send while the browser knows it's offline; offline/online handling lives in src/offline.
  canRun: () => typeof navigator === 'undefined' || navigator.onLine !== false,
})

// Logout (or any other path that flips isAuthenticated off): stop the loop and
// drop cached alerts so the next user never sees — or polls on behalf of — this one.
useAuthStore.subscribe((s, prev) => {
  if (prev.isAuthenticated && !s.isAuthenticated) reminderAlertPoller.reset()
})
