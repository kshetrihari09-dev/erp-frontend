/**
 * offline/syncEngine.ts
 *
 * Uploads queued offline transactions to the EXISTING salesAPI.create —
 * no parallel/duplicate endpoint, no bypass of the server's own
 * validation, stock deduction, or voucher posting (requirement #7: the
 * server stays the authority). This file's only job is deciding what to
 * send, in what order, and how to react to the response.
 *
 * Order (requirement #10.3): queued items are uploaded strictly in
 * created_at order, one at a time — never in parallel — since two offline
 * sales against the same low-stock product must reach the server in the
 * order they actually happened for its stock check to mean anything.
 *
 * A run stops the instant a NETWORK failure occurs (we're not actually
 * back online after all — leave the rest of the queue untouched, "pending
 * offline") but continues past a SERVER rejection of one item (a genuine
 * 4xx from validation/stock conflict) so one bad transaction can't block
 * every other queued sale behind it.
 */
import { salesAPI } from '@/services/api'
import { getOfflineDb, type QueuedTransaction } from './db'
import { listQueue, updateQueueItem } from './syncQueue'

const MAX_RETRIES = 8
// 30s, 1m, 2m, 4m, ... capped at 30m — gives a flaky connection room to
// recover without hammering the server, without making the person wait
// hours for a transaction that failed for a real (non-network) reason.
function backoffMs(retryCount: number): number {
  return Math.min(30_000 * 2 ** retryCount, 30 * 60_000)
}

export interface SyncRunResult {
  attempted: number
  synced:    number
  failed:    number
  /** true only when the run stopped early because the connection dropped
   *  again mid-sync — distinct from "failed", which means the server
   *  actively rejected a transaction. */
  stoppedOffline: boolean
}

export function isNetworkError(err: any): boolean {
  // http.ts's response interceptor reshapes every rejection into
  // { message, status, errors, original } — `status` is only ever
  // undefined when axios never got an HTTP response back at all (DNS
  // failure, connection refused, timeout, CORS-blocked preflight) —
  // exactly the "we're not really online" case, as opposed to a 4xx/5xx
  // the server actually sent back.
  return err?.status === undefined
}

function isDue(item: QueuedTransaction): boolean {
  if (item.status === 'synced') return false
  if (item.status === 'failed' && item.retry_count >= MAX_RETRIES) return false
  if (!item.next_retry_at) return true
  return new Date(item.next_retry_at).getTime() <= Date.now()
}

/** Runs one sync pass. Caller (OfflineProvider) is responsible for only
 *  calling this while actually online, and for calling it again on the
 *  next reconnect / poll tick — this function itself doesn't loop or
 *  schedule anything, it just drains whatever's due right now. */
export async function runSync(
  companyId: string,
  onItemSynced?: (item: QueuedTransaction) => void,
): Promise<SyncRunResult> {
  const result: SyncRunResult = { attempted: 0, synced: 0, failed: 0, stoppedOffline: false }
  const queue = (await listQueue(companyId)).filter(isDue)

  for (const item of queue) {
    if (item.type !== 'sale') continue // only sales are wired end-to-end today — see db.ts docblock

    result.attempted++
    await updateQueueItem(companyId, item.client_txn_id, { status: 'syncing' })

    try {
      // client_txn_id already sits inside item.payload (enqueueSale put
      // it there) — this is the exact same call the online Sale page
      // makes, just with that one extra field, so every existing
      // validation/accounting/stock/voucher code path on the server runs
      // completely unchanged.
      const res = await salesAPI.create(item.payload as any)
      await updateQueueItem(companyId, item.client_txn_id, {
        status: 'synced',
        server_response: res.data.data as any,
      })
      result.synced++
      onItemSynced?.({ ...item, status: 'synced', server_response: res.data.data as any })
    } catch (err: any) {
      if (isNetworkError(err)) {
        // We're not actually online after all — leave this item (and
        // everything behind it) exactly as it was and stop the run. The
        // next reconnect will pick up right here.
        await updateQueueItem(companyId, item.client_txn_id, { status: 'pending' })
        result.stoppedOffline = true
        break
      }

      // A real response came back and it was a rejection — the server
      // is reachable, this specific transaction just isn't acceptable
      // (or isn't acceptable *yet* — e.g. a stock conflict from
      // requirement #8, which err.message already describes in plain
      // language since sales.js's stock checks are message-only, no
      // separate error code). Schedule a backoff retry rather than
      // giving up after one rejection, since some causes (a stale
      // stock/permission snapshot) can resolve on their own.
      const retry_count = item.retry_count + 1
      const permanentlyFailed = retry_count >= MAX_RETRIES
      await updateQueueItem(companyId, item.client_txn_id, {
        status: 'failed',
        retry_count,
        last_error: err?.message || 'Sync failed',
        next_retry_at: permanentlyFailed
          ? undefined
          : new Date(Date.now() + backoffMs(retry_count)).toISOString(),
      })
      result.failed++
      // Not a connectivity problem — keep going with the rest of the
      // queue instead of blocking everything behind this one item.
    }
  }

  return result
}

/** Convenience for the indicator UI / OfflineProvider — total items still
 *  waiting (pending + due-for-retry failed), used for the "Syncing N
 *  transactions..." message (requirement #4). */
export async function pendingSyncCount(companyId: string): Promise<number> {
  const db = await getOfflineDb(companyId)
  const all = await db.getAll('syncQueue')
  return all.filter(t => t.status !== 'synced').length
}
