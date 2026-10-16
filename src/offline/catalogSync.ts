/**
 * offline/catalogSync.ts
 *
 * Pulls exactly the data requirement #2 lists (products, batches/expiry,
 * stock snapshot, customers) into the per-company IndexedDB — never the
 * whole Postgres database. Two sync modes:
 *
 *   - Full crawl (first login on a device, or explicit refresh): pages
 *     through GET /products and GET /stock/batches with a real page size
 *     rather than "limit: 999999", so this stays workable against a
 *     catalog in the hundreds of thousands (requirement #15) without ever
 *     holding the whole response in memory at once — each page is written
 *     to IndexedDB and dropped before the next page is requested.
 *   - Incremental (every later sync — see OfflineProvider, which calls
 *     this on every reconnect): uses the new `updated_since` param on
 *     GET /products (see erp-unified-backend routes/products.js) against
 *     the cursor stored in the `meta` store, so a reconnect after a short
 *     outage only pulls what actually changed.
 *
 * This never touches React state — SalesPage's own `products` state
 * (capped at 500, used for the online autocomplete) is completely
 * unaffected; this is a separate, independent cache purely for the
 * offline fallback path (see offline/productLookup.ts).
 */
import { productsAPI, stockAPI, partiesAPI } from '@/services/api'
import { getOfflineDb, getMeta, setMeta, type OfflineProduct, type OfflineBatch, type OfflineParty } from './db'
import type { Product, StockBatch, Party } from '@/types'
import { getRateLimitedUntil } from '@/services/rateLimitState'

const PAGE_SIZE = 500
/** Hard ceiling on pages per crawl — a loop guard, never reached by a healthy server. */
const MAX_PAGES = 400

/** Thrown to abandon a sync while the server's rate limiter is asking us to back off. */
export class CatalogSyncRateLimited extends Error {
  constructor(public retryAtMs: number) { super('Catalog sync paused: server rate limit (429) — will retry on the next cycle') }
}

/** Every catalog request goes through this first: if ANY request recently got a 429,
 *  stop instead of adding load to an exhausted per-IP bucket. The cache already on
 *  the device stays in place and the next scheduled/reconnect sync tries again. */
function assertNotRateLimited() {
  const until = getRateLimitedUntil()
  if (until > Date.now()) throw new CatalogSyncRateLimited(until)
}

function toOfflineProduct(p: Product): OfflineProduct {
  // Tokenize into distinct lowercased words across every searchable field
  // (requirement #2: barcode/QR → SKU → name → brand → generic name).
  // A Set dedupes repeated words (e.g. brand name appearing in the
  // product name too) so the multiEntry index doesn't carry redundant
  // entries per product.
  const tokens = new Set(
    [p.name, p.generic_name, p.company_name, p.item_code, p.barcode]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  )
  return {
    id: p.id, item_code: p.item_code, barcode: p.barcode, name: p.name,
    generic_name: p.generic_name, company_name: p.company_name, category: p.category,
    unit: p.unit, mrp: p.mrp, sales_rate: p.sales_rate, purchase_rate: p.purchase_rate,
    tax_rate: p.tax_rate, vat_percent: p.vat_percent, cc_pct: p.cc_pct,
    min_stock: p.min_stock, current_stock: p.current_stock, is_active: p.is_active,
    updated_at: p.created_at, _searchTokens: Array.from(tokens),
  }
}

function toOfflineBatch(b: StockBatch): OfflineBatch {
  return {
    id: b.id, product_id: b.product_id, batch_no: b.batch_no,
    expiry_date: b.expiry_date || b.expiry, qty_available: b.qty_available,
    purchase_rate: b.purchase_rate, sales_rate: b.sales_rate,
  }
}

function toOfflineParty(p: Party): OfflineParty {
  return {
    id: p.id, code: p.code, name: p.name, type: p.type, phone: p.phone,
    credit_limit: p.credit_limit, current_balance: p.current_balance,
  }
}

export interface CatalogSyncProgress {
  phase: 'products' | 'batches' | 'customers' | 'done'
  pagesLoaded: number
}

/** Runs the full catalog sync. Safe to call repeatedly (e.g. every
 *  reconnect) — after the first full crawl, `updated_since` keeps
 *  subsequent calls cheap. `onProgress` is optional and purely cosmetic
 *  (e.g. a "Preparing offline data…" toast on first login); the sync
 *  proceeds identically whether or not anyone's listening. */
const inFlightSyncs = new Map<string, Promise<void>>()

export function syncCatalog(
  companyId: string,
  onProgress?: (p: CatalogSyncProgress) => void,
): Promise<void> {
  // One crawl per company at a time: the login sync, the reconnect sync, the
  // 10-minute timer and a manual "sync now" all land here, and overlapping
  // crawls would multiply requests against the shared rate limit.
  const running = inFlightSyncs.get(companyId)
  if (running) return running
  const p = runCatalogSync(companyId, onProgress).finally(() => { inFlightSyncs.delete(companyId) })
  inFlightSyncs.set(companyId, p)
  return p
}

async function runCatalogSync(
  companyId: string,
  onProgress?: (p: CatalogSyncProgress) => void,
): Promise<void> {
  const db = await getOfflineDb(companyId)
  const lastProductSync = await getMeta<string>(companyId, 'lastProductSync')
  const syncStartedAt = new Date().toISOString()

  // ── Products ────────────────────────────────────────────────────────────
  let page = 1
  let prevFirstId: string | undefined
  for (;;) {
    assertNotRateLimited()
    const res = await productsAPI.list({
      page, limit: PAGE_SIZE,
      ...(lastProductSync ? { updated_since: lastProductSync } : {}),
    })
    const rows: Product[] = res.data?.data || []
    if (rows.length === 0) break
    if (rows[0]?.id === prevFirstId || page > MAX_PAGES) break   // server ignored `page` → stop, don't re-request the same rows
    prevFirstId = rows[0]?.id

    const tx = db.transaction('products', 'readwrite')
    await Promise.all(rows.map(p => tx.store.put(toOfflineProduct(p))))
    await tx.done

    onProgress?.({ phase: 'products', pagesLoaded: page })
    if (rows.length < PAGE_SIZE) break
    page++
  }
  await setMeta(companyId, 'lastProductSync', syncStartedAt)

  // ── Batches (full refresh every sync — quantities change on every sale,
  //    so there's no safe "updated_since" cursor for this one like there
  //    is for products; PAGE_SIZE paging still keeps memory bounded) ─────
  // GET /stock/batches is NOT paginated: routes/stock.js ignores `page`/`limit` and returns
  // every in-stock batch company-wide in one response. The old page loop only stopped when a
  // page held fewer than PAGE_SIZE rows, which a non-paginated endpoint never satisfies once a
  // company has >= PAGE_SIZE batches — so it re-requested the identical full response
  // (page=2, 3 … 83 …) until the rate limiter answered 429. One request is the complete set.
  // If the endpoint ever starts returning `pagination`, honour it (bounded by MAX_PAGES).
  const seenBatchIds = new Set<string>()
  for (let batchPage = 1; ; batchPage++) {
    assertNotRateLimited()
    const res = await stockAPI.batches(batchPage === 1 ? undefined : { page: batchPage })
    const rows: StockBatch[] = res.data?.data || []

    const tx = db.transaction('batches', 'readwrite')
    await Promise.all(rows.map(b => { seenBatchIds.add(b.id); return tx.store.put(toOfflineBatch(b)) }))
    await tx.done

    onProgress?.({ phase: 'batches', pagesLoaded: batchPage })
    const totalPages = (res.data as { pagination?: { totalPages?: number } } | undefined)?.pagination?.totalPages
    if (!totalPages || batchPage >= totalPages || batchPage >= MAX_PAGES || rows.length === 0) break
  }
  // Batches that sold out (qty_remaining hit 0) drop out of the
  // /stock/batches response entirely — prune anything not seen in this
  // refresh so an offline sale can't be rung up against a batch that's
  // actually empty.
  {
    const tx = db.transaction('batches', 'readwrite')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      if (!seenBatchIds.has(cursor.value.id)) await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ── Customers ───────────────────────────────────────────────────────────
  page = 1
  prevFirstId = undefined
  for (;;) {
    assertNotRateLimited()
    const res = await partiesAPI.customers({ page, limit: PAGE_SIZE })
    const rows: Party[] = res.data?.data || []
    if (rows.length === 0) break
    if (rows[0]?.id === prevFirstId || page > MAX_PAGES) break
    prevFirstId = rows[0]?.id

    const tx = db.transaction('parties', 'readwrite')
    await Promise.all(rows.map(p => tx.store.put(toOfflineParty(p))))
    await tx.done

    onProgress?.({ phase: 'customers', pagesLoaded: page })
    if (rows.length < PAGE_SIZE) break
    page++
  }

  await setMeta(companyId, 'lastCatalogSync', new Date().toISOString())
  onProgress?.({ phase: 'done', pagesLoaded: 0 })
}
