/**
 * offline/syncQueue.ts
 *
 * Thin CRUD layer over the `syncQueue` IndexedDB store (see db.ts). Kept
 * separate from syncEngine.ts (which decides WHEN/HOW to drain the queue,
 * retries, backoff) so this file only ever answers "what's in the queue
 * right now" — the actual durability requirement #11 depends on
 * (IndexedDB, not React state, not localStorage).
 */
import { getOfflineDb, type QueuedTransaction, type SyncStatus } from './db'
import { generateClientTxnId, generateTempRef, getDeviceId } from './idGen'

export async function enqueueSale(
  companyId: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<QueuedTransaction> {
  const client_txn_id = generateClientTxnId()
  const txn: QueuedTransaction = {
    client_txn_id,
    type: 'sale',
    created_at: new Date().toISOString(),
    device_id: getDeviceId(),
    user_id: userId,
    payload: { ...payload, client_txn_id },
    temp_ref: generateTempRef(client_txn_id),
    status: 'pending',
    retry_count: 0,
  }
  const db = await getOfflineDb(companyId)
  await db.put('syncQueue', txn)
  return txn
}

export async function listQueue(companyId: string, status?: SyncStatus): Promise<QueuedTransaction[]> {
  const db = await getOfflineDb(companyId)
  const all = await db.getAllFromIndex('syncQueue', 'created_at')
  return status ? all.filter(t => t.status === status) : all
}

export async function countPending(companyId: string): Promise<number> {
  const db = await getOfflineDb(companyId)
  return (await db.getAllFromIndex('syncQueue', 'status', 'pending')).length
}

export async function updateQueueItem(
  companyId: string,
  clientTxnId: string,
  patch: Partial<QueuedTransaction>,
): Promise<void> {
  const db = await getOfflineDb(companyId)
  const existing = await db.get('syncQueue', clientTxnId)
  if (!existing) return
  await db.put('syncQueue', { ...existing, ...patch })
}

/** Failed transactions are never silently removed (requirement #5) — this
 *  exists only for the person explicitly discarding one from a "Failed
 *  transactions" review screen, a deliberate user action, not automatic
 *  cleanup. Not currently wired to any UI button; here so that screen has
 *  something to call when it's built. */
export async function discardQueueItem(companyId: string, clientTxnId: string): Promise<void> {
  const db = await getOfflineDb(companyId)
  await db.delete('syncQueue', clientTxnId)
}
