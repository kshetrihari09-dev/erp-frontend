/**
 * useProductBatches.ts
 *
 * Fetches available batches (qty_available > 0) for a given product via
 * the existing GET /stock/batches endpoint, with a small module-level
 * cache shared across every row/component that uses this hook — so
 * selecting the same product in multiple invoice rows, or re-selecting a
 * product you already picked, doesn't re-fetch over the network.
 *
 * Used by BatchSelect.tsx on both the Sale and Purchase pages (desktop
 * InvoiceRowsTable and the mobile row cards) — one hook, one cache,
 * identical behavior everywhere.
 */
import { useEffect, useRef, useState } from 'react'
import { stockAPI } from '@/services/api'
import type { StockBatch } from '@/types'

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

async function fetchBatches(productId: string): Promise<StockBatch[]> {
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
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  useEffect(() => {
    if (!productId) { setBatches([]); setLoading(false); return }

    const cached = cache.get(productId)
    if (isFresh(cached)) {
      setBatches(cached.data)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    fetchBatches(productId)
      .then(data => { if (!cancelled && mountedRef.current) { setBatches(data); setLoading(false) } })
      .catch(() => { if (!cancelled && mountedRef.current) { setBatches([]); setLoading(false) } })

    return () => { cancelled = true }
  }, [productId])

  return { batches, loading }
}
