/**
 * offline/OfflineProvider.tsx
 *
 * The one place that decides WHEN to sync — everything else (db.ts,
 * catalogSync.ts, syncQueue.ts, syncEngine.ts) is pure logic with no
 * opinion about timing. Mounted once at the app root (see app/App.tsx),
 * reads company/user from the existing authStore (no new auth of its
 * own — requirement #14), and exposes connectivity + queue state via
 * context for the status indicator and Sale page to consume.
 *
 * Sync triggers, matching requirement #10:
 *   - On login / company available and online: one catalog sync, so a
 *     device that's about to go offline already has current data.
 *   - On every reconnect (isOnline flips false → true): drain the queue
 *     first (priority: get pending transactions to the server), then
 *     refresh the catalog (priority: pick up stock/price changes that
 *     happened anywhere — this device's own just-synced sale included —
 *     while this device couldn't see them).
 *   - A light periodic catalog refresh while online (every 10 min), so a
 *     long online session doesn't slowly drift stale before a future
 *     disconnect.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import useAuthStore from '@/store/authStore'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { syncCatalog } from './catalogSync'
import { runSync, pendingSyncCount } from './syncEngine'
import { enqueueSale, listQueue, retryQueueItem, discardQueueItem } from './syncQueue'
import type { QueuedTransaction } from './db'

type SyncPhase = 'idle' | 'syncing-queue' | 'syncing-catalog'

interface OfflineContextValue {
  isOnline:        boolean
  checkingOnline:  boolean
  syncPhase:       SyncPhase
  pendingCount:    number
  /** Set briefly after a sync run completes with 1+ synced item, cleared
   *  automatically — drives the "🔄 All transactions synced" toast state
   *  (requirement #4) without the indicator needing its own timer logic. */
  justSyncedCount: number
  /** Queues a sale while offline. Throws if there's no logged-in company
   *  (shouldn't happen — the Sale page itself requires auth). */
  enqueueOfflineSale: (payload: Record<string, unknown>) => Promise<QueuedTransaction>
  /** Manual "try now" — e.g. a retry button in a failed-transactions view. */
  syncNow: () => Promise<void>
  /** Every queued transaction (any status), newest sync info included —
   *  backs the Pending Transactions panel. Deliberately a pull, not a
   *  subscription: that panel is the only consumer, so it fetches fresh
   *  on open/action rather than every component in the tree re-rendering
   *  on every queue change. */
  listPendingTransactions: () => Promise<QueuedTransaction[]>
  /** Resets one item to immediately-due and kicks off a sync pass. Used
   *  by the panel's "Retry now" action, including on items that already
   *  hit MAX_RETRIES / came back non-retryable. */
  retryTransaction: (clientTxnId: string) => Promise<void>
  /** Permanently removes one queued transaction — a deliberate action
   *  from the panel, never automatic (see syncQueue.ts's discardQueueItem
   *  docblock). Only meaningful for a 'failed' item the person has
   *  decided not to pursue (e.g. re-entering it by hand instead). */
  discardTransaction: (clientTxnId: string) => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

const CATALOG_REFRESH_INTERVAL_MS = 10 * 60_000

export function OfflineProvider({ children }: { children: ReactNode }) {
  const company = useAuthStore(s => s.company)
  const user    = useAuthStore(s => s.user)
  const { isOnline, checking: checkingOnline } = useOnlineStatus()

  const [syncPhase, setSyncPhase]           = useState<SyncPhase>('idle')
  const [pendingCount, setPendingCount]     = useState(0)
  const [justSyncedCount, setJustSyncedCount] = useState(0)

  const wasOnlineRef   = useRef(isOnline)
  const justSyncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPendingCount = useCallback(async () => {
    if (!company?.id) { setPendingCount(0); return }
    setPendingCount(await pendingSyncCount(company.id))
  }, [company?.id])

  const runFullSync = useCallback(async () => {
    if (!company?.id || !isOnline) return
    setSyncPhase('syncing-queue')
    try {
      const result = await runSync(company.id)
      await refreshPendingCount()
      if (result.synced > 0) {
        setJustSyncedCount(result.synced)
        if (justSyncedTimerRef.current) clearTimeout(justSyncedTimerRef.current)
        justSyncedTimerRef.current = setTimeout(() => setJustSyncedCount(0), 4000)
      }
    } catch (e) {
      console.error('[offline] sync run failed', e)
    }

    setSyncPhase('syncing-catalog')
    try {
      await syncCatalog(company.id)
    } catch (e) {
      // Catalog refresh failing is never user-facing — the existing cache
      // (from the last successful sync) stays in place and offline
      // billing keeps working against it; this only means today's data
      // might be one sync cycle stale until the next successful attempt.
      console.error('[offline] catalog sync failed', e)
    }
    setSyncPhase('idle')
  }, [company?.id, isOnline, refreshPendingCount])

  // Initial sync on login (or company switch) while already online.
  useEffect(() => {
    if (company?.id && isOnline) {
      refreshPendingCount()
      runFullSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  // Reconnect trigger.
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      runFullSync()
    }
    wasOnlineRef.current = isOnline
  }, [isOnline, runFullSync])

  // Periodic light refresh while online (see docblock).
  useEffect(() => {
    if (!isOnline || !company?.id) return
    const id = setInterval(() => { syncCatalog(company.id).catch(() => {}) }, CATALOG_REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isOnline, company?.id])

  const enqueueOfflineSale = useCallback(async (payload: Record<string, unknown>) => {
    if (!company?.id || !user?.id) throw new Error('No authenticated company/user for offline queue')
    const txn = await enqueueSale(company.id, user.id, payload)
    await refreshPendingCount()
    return txn
  }, [company?.id, user?.id, refreshPendingCount])

  const listPendingTransactions = useCallback(async () => {
    if (!company?.id) return []
    return listQueue(company.id)
  }, [company?.id])

  const retryTransaction = useCallback(async (clientTxnId: string) => {
    if (!company?.id) return
    await retryQueueItem(company.id, clientTxnId)
    await refreshPendingCount()
    // Fires immediately rather than waiting for the next poll/reconnect —
    // the whole point of a manual retry button is not waiting.
    await runFullSync()
  }, [company?.id, refreshPendingCount, runFullSync])

  const discardTransaction = useCallback(async (clientTxnId: string) => {
    if (!company?.id) return
    await discardQueueItem(company.id, clientTxnId)
    await refreshPendingCount()
  }, [company?.id, refreshPendingCount])

  const value: OfflineContextValue = {
    isOnline, checkingOnline, syncPhase, pendingCount, justSyncedCount,
    enqueueOfflineSale, syncNow: runFullSync,
    listPendingTransactions, retryTransaction, discardTransaction,
  }

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline() must be used within <OfflineProvider>')
  return ctx
}
