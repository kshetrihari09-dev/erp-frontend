/**
 * useProductBatches.ts
 *
 * Fetches available batches (qty_available > 0) for a given product via
 * the existing GET /stock/batches endpoint, with a small module-level
 * cache shared across every row/component that uses this hook — so
 * selecting the same product in multiple invoice rows, or re-selecting a
 * product you already picked, doesn't re-fetch over the network.
 *
 * Offline: falls back to the same IndexedDB catalog cache
 * (offline/productLookup.ts's getBatchesOffline) that catalogSync.ts
 * already keeps populated — same qty_available > 0 + FEFO-order
 * contract as the online endpoint, so BatchSelect's picker behaves
 * identically whether the network call was skipped outright
 * (isOnline === false) or failed mid-flight (a real network error).
 *
 * Used by BatchSelect.tsx on both the Sale and Purchase pages (desktop
 * InvoiceRowsTable and the mobile row cards) — one hook, one cache,
 * identical behavior everywhere.
 */
import { useEffect, useRef, useState } from 'react'
import { stockAPI } from '@/services/api'
import type { StockBatch } from '@/types'
import { useOffline } from '@/offline/OfflineProvider'
import { isNetworkError } from '@/offline/syncEngine'
import { getBatchesOffline } from '@/offline/productLookup'
import useAuthStore from '@/store/authStore'

// Short TTL rather than an indefinite cache: batch stock genuinely changes
// as sales/purchases post, and this keeps the UI self-healing without
// needing to wire cache invalidation into every posting flow.
const CACHE_TTL_MS = 30_000

interface CacheEntry { data: StockBatch[]; fetchedAt: number }
const cache: Map<string, CacheEntry> = new Map()
const inFlight: Map<string, Promise<StockBatch[]>> = new Map()

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

/** Offline (requirement: batch/expiry/stock available offline) — same
 *  contract as fetchBatches below (qty_available > 0, FEFO order),
 *  served from the IndexedDB cache catalogSync.ts already populated
 *  instead of GET /stock/batches. Not cached in `cache`/`inFlight`
 *  (those model network round-trips); IndexedDB reads are already local
 *  and fast, and skipping the shared cache means a reconnect can't ever
 *  serve a stale offline read after the real fetch succeeds. */
async function fetchBatchesOffline(companyId: string, productId: string): Promise<StockBatch[]> {
  try {
    return await getBatchesOffline(companyId, productId)
  } catch {
    return []
  }
}

async function fetchBatches(productId: string, isOnline: boolean, companyId?: string): Promise<StockBatch[]> {
  if (!isOnline) {
    return companyId ? fetchBatchesOffline(companyId, productId) : []
  }

  const cached = cache.get(productId)
  if (isFresh(cached)) return cached.data

  // De-dupe concurrent requests for the same product — e.g. two rows
  // both picking the same product back-to-back only triggers one call.
  const pending = inFlight.get(productId)
  if (pending) return pending

  const promise = stockAPI.batches({ product_id: productId })
    .then(res => ((res.data as any)?.data as StockBatch[]) || [])
    .then(data => {
      cache.set(productId, { data, fetchedAt: Date.now() })
      inFlight.delete(productId)
      return data
    })
    .catch(err => {
      inFlight.delete(productId)
      // A real network failure (isOnline was still true at the interface
      // level — see SCAN_LOOKUP_TIMEOUT_MS's docblock in
      // useLocalScanner.ts for why that check alone isn't reliable)
      // falls back to the offline cache exactly like the !isOnline
      // branch above, rather than surfacing "no batches available" for
      // stock that's actually known locally.
      if (isNetworkError(err) && companyId) return fetchBatchesOffline(companyId, productId)
      throw err
    })

  inFlight.set(productId, promise)
  return promise
}

/** Manually drop cached batch data — not required for normal operation
 *  (the TTL above already keeps things reasonably fresh), but available
 *  if a caller wants to force a re-fetch right after posting a voucher. */
export function invalidateBatchCache(productId?: string) {
  if (productId) cache.delete(productId)
  else cache.clear()
}

export default function useProductBatches(productId: string | undefined | null) {
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [loading, setLoading] = useState(false)
  const mountedRef  = useRef(true)
  const { isOnline } = useOffline()
  const companyId = useAuthStore(s => s.company?.id)
  // Tracks which productId `batches`/`loading` currently describe, so a
  // prop change can be caught and reacted to SYNCHRONOUSLY during render
  // instead of in an effect.
  //
  // ROOT CAUSE this fixes: previously the "clear + start loading" reset
  // only happened inside a `useEffect(() => {...}, [productId])`. Effects
  // run AFTER the render commits, but any OTHER hook in the same
  // component that also depends on `productId` (e.g. BatchSelect.tsx's
  // auto-open-the-popup effect) fires in that same effect pass, reading
  // whatever `loading`/`batches` this hook returned during THAT render —
  // which, for exactly one render, was still the PREVIOUS product's
  // settled `loading: false` paired with the NEW productId. That looked
  // indistinguishable from "fetch already finished, zero batches", so
  // the popup's auto-open effect concluded there was nothing to open —
  // even though a real fetch for the new product hadn't started yet.
  //
  // Resetting here, in the render body, closes that window: React
  // detects the state update during render and re-renders immediately
  // with the corrected values before anything commits or any effect
  // (including a caller's) ever sees the stale pairing.
  const trackedIdRef = useRef<string | undefined | null>(productId)

  if (trackedIdRef.current !== productId) {
    trackedIdRef.current = productId
    if (!productId) {
      setBatches([])
      setLoading(false)
    } else {
      const cached = cache.get(productId)
      if (isFresh(cached)) {
        setBatches(cached.data)
        setLoading(false)
      } else {
        setBatches([])
        setLoading(true)
      }
    }
  }

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  useEffect(() => {
    if (!productId) return

    // Offline: the synchronous fast-path above can only ever have applied
    // a fresh network-cache hit, so this always needs a real (IndexedDB)
    // read — skip straight to fetchBatches' offline branch.
    if (isOnline) {
      const cached = cache.get(productId)
      if (isFresh(cached)) return // already applied synchronously above
    }

    let cancelled = false
    fetchBatches(productId, isOnline, companyId)
      .then(data => { if (!cancelled && mountedRef.current) { setBatches(data); setLoading(false) } })
      .catch(() => { if (!cancelled && mountedRef.current) { setBatches([]); setLoading(false) } })

    return () => { cancelled = true }
  }, [productId, isOnline, companyId])

  return { batches, loading }
}
