// Regression: the offline catalog sync must not loop on the non-paginated /stock/batches
// endpoint (the cause of `…/stock/batches?page=83&limit=500` 429s), must stop while the
// server is rate-limiting, and must never run two crawls at once.
import './setup-dom'
import * as fdb from 'fake-indexeddb'
// `idb` needs the IDB* constructors as globals, not just `indexedDB`.
for (const [k, v] of Object.entries(fdb)) if (k === 'indexedDB' || k.startsWith('IDB')) (globalThis as any)[k] = v
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { calls, data, resetCatalogMock } from './mock-api-catalog'
import { syncCatalog, CatalogSyncRateLimited } from '../src/offline/catalogSync'
import { noteRateLimited, resetRateLimitState } from '../src/services/rateLimitState'

let n = 0
const company = () => `co-${++n}`
beforeEach(() => { resetCatalogMock(); resetRateLimitState() })

test('/stock/batches is requested exactly ONCE even with >= PAGE_SIZE batches (no page=2..83 loop)', async () => {
  data.batchCount = 600                       // >= 500: the old loop never terminated here
  await syncCatalog(company())
  assert.equal(calls.batches.length, 1)
  assert.equal(calls.batches[0], undefined, 'no page/limit params sent to a non-paginated endpoint')
})

test('a very large batch list still costs one request', async () => {
  data.batchCount = 5_000
  await syncCatalog(company())
  assert.equal(calls.batches.length, 1)
})

test('products: a server that ignores `page` is detected and not re-requested forever', async () => {
  data.productRows = 500; data.ignoreProductPaging = true      // always returns the same full page
  await syncCatalog(company())
  assert.equal(calls.products.length, 2, 'page 1, then page 2 detected as a repeat → stop')
})

test('while rate-limited, the sync makes NO requests and rejects with CatalogSyncRateLimited', async () => {
  noteRateLimited(120_000)
  await assert.rejects(() => syncCatalog(company()), (e: unknown) => e instanceof CatalogSyncRateLimited)
  assert.equal(calls.products.length + calls.batches.length + calls.customers.length, 0)
})

test('concurrent triggers (login + reconnect + timer) share one crawl', async () => {
  const id = company()
  await Promise.all([syncCatalog(id), syncCatalog(id), syncCatalog(id), syncCatalog(id)])
  assert.equal(calls.batches.length, 1)
  assert.equal(calls.products.length, 1)
  assert.equal(calls.customers.length, 1)
  await syncCatalog(id)                       // sequential later run is allowed
  assert.equal(calls.batches.length, 2)
})
