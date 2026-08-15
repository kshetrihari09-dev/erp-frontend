/**
 * offline/db.ts — IndexedDB schema for offline-first billing.
 *
 * ONE DATABASE PER COMPANY (see dbNameFor below), not one shared database
 * filtered by company_id. This is the actual mechanism behind requirement
 * #14 ("Do not expose another company's data through offline storage."):
 * IndexedDB databases are looked up by name, so switching company opens a
 * genuinely different database — there's no query path that could ever
 * accidentally return another company's rows, because they're not in the
 * same object store to query in the first place. Multi-tenant safety by
 * construction rather than by remembering to filter correctly everywhere.
 *
 * Stores only what requirement #2 asks for — never a mirror of the whole
 * Postgres schema:
 *   - products : catalog snapshot for offline sale/scan/search
 *   - batches  : per-product batch/expiry/qty snapshot (from /stock/batches)
 *   - parties  : customers only (offline billing doesn't need suppliers)
 *   - syncQueue: transactions created offline, pending upload
 *   - meta     : small key/value bookkeeping (last sync cursor, etc.)
 *
 * No auth tokens or credentials are ever written here — see useOnlineStatus
 * / OfflineProvider, which read the token from the existing authStore
 * (localStorage) exactly as the online app already does. This module only
 * ever stores operational/business data.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/** Mirrors types/index.ts's Product — see catalogSync.ts for how these
 *  fields get populated from GET /products. Intentionally a *subset*:
 *  no supplier costs, no audit fields, nothing not needed to bill. */
export interface OfflineProduct {
  id:            string
  item_code:     string
  barcode?:      string
  name:          string
  generic_name?: string
  company_name?: string  // brand/manufacturer — searchable per requirement #2
  category?:     string
  unit:          string
  mrp:           number
  sales_rate:    number
  purchase_rate: number
  tax_rate?:     number
  vat_percent?:  number
  cc_pct?:       number
  min_stock:     number
  current_stock: number
  is_active:     boolean
  updated_at?:   string
  /** Lowercased word tokens from name/generic_name/company_name/item_code
   *  (see catalogSync.ts), indexed with multiEntry so a search box can do
   *  an indexed "any token starts with X" prefix scan — the standard
   *  IndexedDB technique for search-as-you-type without pulling every row
   *  into JS, which matters once the catalog is in the hundreds of
   *  thousands (requirement #15). */
  _searchTokens: string[]
}

export interface OfflineBatch {
  id:            string  // inventory_batches.id — unique per lot, see stock.js
  product_id:    string
  batch_no?:     string
  expiry_date?:  string
  qty_available: number
  purchase_rate: number
  sales_rate:    number
}

export interface OfflineParty {
  id:              string
  code:            string
  name:            string
  type:            string
  phone?:          string
  credit_limit?:   number
  current_balance: number
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

/** One queued offline transaction. Deliberately generic (`type` +
 *  `payload`) rather than a sales-only shape — requirement #6 lists
 *  sales/purchases/returns/payments/stock adjustments/vouchers as needing
 *  the same idempotency treatment, so the queue itself is built to hold
 *  any of them even though only 'sale' is wired end-to-end right now (see
 *  syncEngine.ts). Extending to another transaction type later is adding
 *  a case to the sync engine's switch, not a schema change. */
export interface QueuedTransaction {
  /** The idempotency key itself (see erp-unified-backend migration 024).
   *  Generated once, client-side, the moment the transaction is queued —
   *  never regenerated on retry, which is exactly what lets the server
   *  recognize a retried upload as the same transaction. */
  client_txn_id: string
  type:          'sale'  // | 'purchase' | 'return' | 'payment' | 'stock_adjustment' | 'voucher' (future)
  created_at:    string  // ISO — also the queue's natural upload order
  device_id:     string
  user_id:       string
  /** Exactly the body the online create call would have sent — see
   *  syncEngine.ts, which POSTs this verbatim (plus client_txn_id) to the
   *  same salesAPI.create the online Sale page already uses. */
  payload:       Record<string, unknown>
  /** A human-readable temporary reference shown in the UI while this is
   *  still queued — e.g. "OFFLINE-3F2A9C" — NEVER a real invoice number.
   *  See offline/idGen.ts. Replaced in the UI by the server's real
   *  invoice_no once synced (requirement #9). */
  temp_ref:      string
  status:        SyncStatus
  retry_count:   number
  /** Exponential backoff: this item is not attempted again until this
   *  time, even though it's still 'pending' — see syncEngine.ts. Absent
   *  on an item that's never failed yet (attempted immediately). */
  next_retry_at?: string
  last_error?:   string
  /** Set once status becomes 'synced' — the real server response, so the
   *  UI can show the real invoice number without a second network call. */
  server_response?: Record<string, unknown>
}

interface OfflineDBSchema extends DBSchema {
  products: {
    key: string
    value: OfflineProduct
    indexes: { barcode: string; item_code: string; search: string }
  }
  batches: {
    key: string
    value: OfflineBatch
    indexes: { product_id: string }
  }
  parties: {
    key: string
    value: OfflineParty
    indexes: { phone: string }
  }
  syncQueue: {
    key: string  // client_txn_id
    value: QueuedTransaction
    indexes: { status: string; created_at: string }
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

const DB_VERSION = 1
const dbCache = new Map<string, Promise<IDBPDatabase<OfflineDBSchema>>>()

/** IndexedDB database name for a given company — see the module docblock
 *  for why this (not a shared DB) is the tenant-isolation boundary. */
function dbNameFor(companyId: string) {
  return `byapar-offline-${companyId}`
}

export function getOfflineDb(companyId: string): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!companyId) return Promise.reject(new Error('getOfflineDb: companyId is required'))
  const name = dbNameFor(companyId)
  let existing = dbCache.get(name)
  if (existing) return existing

  existing = openDB<OfflineDBSchema>(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        const s = db.createObjectStore('products', { keyPath: 'id' })
        s.createIndex('barcode', 'barcode')
        s.createIndex('item_code', 'item_code')
        s.createIndex('search', '_searchTokens', { multiEntry: true })
      }
      if (!db.objectStoreNames.contains('batches')) {
        const s = db.createObjectStore('batches', { keyPath: 'id' })
        s.createIndex('product_id', 'product_id')
      }
      if (!db.objectStoreNames.contains('parties')) {
        const s = db.createObjectStore('parties', { keyPath: 'id' })
        s.createIndex('phone', 'phone')
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const s = db.createObjectStore('syncQueue', { keyPath: 'client_txn_id' })
        s.createIndex('status', 'status')
        s.createIndex('created_at', 'created_at')
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    },
  })
  dbCache.set(name, existing)
  return existing
}

/** Used only on logout / "switch company" — deliberately does NOT touch
 *  other companies' databases (each is independently named, see above),
 *  so this can never delete data belonging to a company the current
 *  session isn't even for. */
export async function clearOfflineDb(companyId: string) {
  const name = dbNameFor(companyId)
  const cached = dbCache.get(name)
  if (cached) { (await cached).close(); dbCache.delete(name) }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()   // best-effort — never block logout on this
    req.onblocked = () => resolve()
  })
}

export async function getMeta<T = unknown>(companyId: string, key: string): Promise<T | undefined> {
  const db = await getOfflineDb(companyId)
  const row = await db.get('meta', key)
  return row?.value as T | undefined
}

export async function setMeta(companyId: string, key: string, value: unknown) {
  const db = await getOfflineDb(companyId)
  await db.put('meta', { key, value })
}
