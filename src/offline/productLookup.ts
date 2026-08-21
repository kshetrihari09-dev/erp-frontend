/**
 * offline/productLookup.ts
 *
 * Everything the scanner (useLocalScanner.ts) and the Sale page's manual
 * search need, served from IndexedDB instead of the network — the actual
 * offline billing path (requirement #3). Every function here is read-only
 * against the cache catalogSync.ts already populated; nothing here ever
 * talks to the network itself.
 *
 * IMPORTANT — QR codes in this app encode the same value as the barcode
 * (see utils/productQr.ts: a QR label is generated FROM product.barcode,
 * never a separate identifier), so "scan QR" and "scan barcode" are the
 * same offline lookup — lookupByCodeOffline() below, keyed on the single
 * `barcode` index, handles both without needing to know which one the
 * camera actually decoded.
 */
import { getOfflineDb, type OfflineProduct, type OfflineBatch } from './db'
import type { ScannedProduct } from '@/types/scanner'
import type { Product, StockBatch } from '@/types'

function toScannedProduct(p: OfflineProduct, batches: OfflineBatch[]): ScannedProduct {
  return {
    id: p.id, item_code: p.item_code, name: p.name, generic_name: p.generic_name,
    company_name: p.company_name, unit: p.unit, sales_rate: p.sales_rate,
    purchase_rate: p.purchase_rate, mrp: p.mrp, vat_percent: p.vat_percent ?? p.tax_rate,
    cc_pct: p.cc_pct, current_stock: p.current_stock,
    batches: batches
      .filter(b => b.qty_available > 0)
      .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))
      .slice(0, 5)
      .map(b => ({ batch_no: b.batch_no || '', expiry_date: b.expiry_date || '', qty: b.qty_available })),
  }
}

async function batchesFor(companyId: string, productId: string): Promise<OfflineBatch[]> {
  const db = await getOfflineDb(companyId)
  return db.getAllFromIndex('batches', 'product_id', productId)
}

/** Exact barcode/QR match — mirrors scannerAPI.lookupBarcode's contract
 *  exactly (same ScannedProduct shape, batches+current_stock already
 *  attached) so useLocalScanner's caller can't tell whether this came
 *  from the network or the offline cache. Returns null on no match
 *  (same as a 404 from the online endpoint) rather than throwing, so
 *  callers can uniformly treat "not found" the same way both online and
 *  offline. */
export async function lookupByCodeOffline(companyId: string, code: string): Promise<ScannedProduct | null> {
  const db = await getOfflineDb(companyId)
  const product = await db.getFromIndex('products', 'barcode', code)
  if (!product || !product.is_active) return null
  const batches = await batchesFor(companyId, product.id)
  return toScannedProduct(product, batches)
}

/** SKU (item_code) exact match — same contract as lookupByCodeOffline.
 *  Kept separate since item_code and barcode are different columns/
 *  indexes (a product can have one without the other). */
export async function lookupBySkuOffline(companyId: string, itemCode: string): Promise<ScannedProduct | null> {
  const db = await getOfflineDb(companyId)
  const product = await db.getFromIndex('products', 'item_code', itemCode)
  if (!product || !product.is_active) return null
  const batches = await batchesFor(companyId, product.id)
  return toScannedProduct(product, batches)
}

/** Free-text search across name / brand / generic name / SKU (requirement
 *  #2's search order), tokenized + prefix-indexed (see db.ts/catalogSync.ts)
 *  so this stays fast against a large offline catalog instead of scanning
 *  every cached row in JS. Returns plain OfflineProduct rows (the shape
 *  the Sale page's manual product search already expects), ranked by
 *  how early the match token appears (name matches first). */
export async function searchProductsOffline(
  companyId: string,
  query: string,
  limit = 20,
): Promise<OfflineProduct[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const db = await getOfflineDb(companyId)
  const range = IDBKeyRange.bound(q, q + '\uffff')
  const matchedIds = new Set<string>()
  const results: OfflineProduct[] = []

  let cursor = await db.transaction('products').store.index('search').openCursor(range)
  while (cursor && results.length < limit * 4) {
    // multiEntry cursor may revisit the same product via a second
    // matching token — dedupe before collecting.
    if (!matchedIds.has(cursor.value.id)) {
      matchedIds.add(cursor.value.id)
      results.push(cursor.value)
    }
    cursor = await cursor.continue()
  }

  // Name-starts-with matches first (closest to what the cashier typed),
  // then everything else in whatever order the index returned it.
  results.sort((a, b) => {
    const aName = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bName = b.name.toLowerCase().startsWith(q) ? 0 : 1
    return aName - bName
  })
  return results.slice(0, limit)
}

/** Maps the offline cache shape back to the app-wide Product type, for
 *  screens (like SalesPage's product picker) that expect the online
 *  shape. batches/current_stock aggregation is intentionally NOT part of
 *  this — current_stock is already a synced field on OfflineProduct. */
export function toProduct(p: OfflineProduct): Product {
  return {
    id: p.id, item_code: p.item_code, barcode: p.barcode, name: p.name,
    generic_name: p.generic_name, company_name: p.company_name, category: p.category,
    unit: p.unit, mrp: p.mrp, sales_rate: p.sales_rate, purchase_rate: p.purchase_rate,
    tax_rate: p.tax_rate, vat_percent: p.vat_percent, cc_pct: p.cc_pct,
    min_stock: p.min_stock, current_stock: p.current_stock, is_active: p.is_active,
  }
}

/** Full cached catalog (active products only), for screens that need a
 *  "load everything" list rather than a typed search — e.g. SalesPage
 *  populating its product picker the moment it opens offline, mirroring
 *  what `productsAPI.list({ limit: 500 })` gives it online. Read-only
 *  against the same `products` store catalogSync.ts already populates;
 *  no new IndexedDB store, no network call. */
export async function getAllProductsOffline(companyId: string): Promise<OfflineProduct[]> {
  const db = await getOfflineDb(companyId)
  const all = await db.getAll('products')
  return all.filter(p => p.is_active)
}

/** Cached batches for one product, mapped to the app-wide StockBatch
 *  shape — the offline equivalent of GET /stock/batches?product_id=...
 *  (see useProductBatches.ts), so BatchSelect's batch/expiry/qty picker
 *  keeps working offline exactly as it does online. Same contract as the
 *  backend endpoint: only batches with qty_available > 0, oldest expiry
 *  first (FEFO). product_name/item_code (fields StockBatch requires that
 *  OfflineBatch doesn't carry) are filled from the matching cached
 *  product row rather than needing the caller to supply them. */
export async function getBatchesOffline(companyId: string, productId: string): Promise<StockBatch[]> {
  const db = await getOfflineDb(companyId)
  const [product, batches] = await Promise.all([
    db.get('products', productId),
    batchesFor(companyId, productId),
  ])
  return batches
    .filter(b => b.qty_available > 0)
    .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))
    .map(b => ({
      id: b.id, product_id: b.product_id,
      product_name: product?.name ?? '', item_code: product?.item_code ?? '',
      batch_no: b.batch_no, expiry: b.expiry_date, expiry_date: b.expiry_date,
      qty_available: b.qty_available, purchase_rate: b.purchase_rate, sales_rate: b.sales_rate,
    }))
}
