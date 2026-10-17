// React Query behaviour for 429 / network failure / 5xx, using a REAL QueryClient + the production retry policy.
import './setup-dom'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { shouldRetryQuery, retryDelayMs, isNetworkError, queryClient, QUERY_MAX_RETRIES, RETRY_MAX_DELAY_MS } from '../src/app/queryClient'
import { purchaseScanPollInterval, SCAN_POLL_FAST_MS, SCAN_POLL_MEDIUM_MS, SCAN_POLL_SLOW_MS, SCAN_POLL_MAX_BACKOFF_MS } from '../src/hooks/pollIntervals'

const http = (status: number, extra = {}) => ({ status, message: 'x', ...extra })
const net = (code = 'ERR_NETWORK') => ({ message: 'Network Error', original: { isAxiosError: true, code } })

test('policy: 429 and every other 4xx are never retried', () => {
  for (const s of [400, 401, 403, 404, 409, 422, 429]) assert.equal(shouldRetryQuery(0, http(s)), false, String(s))
})
test('policy: 500 is not retried (deterministic server bug); 502/503/504/408 are', () => {
  assert.equal(shouldRetryQuery(0, http(500)), false)
  for (const s of [502, 503, 504, 408]) assert.equal(shouldRetryQuery(0, http(s)), true, String(s))
})
test('policy: network errors retry; cancellations, client cooldown and programming errors do not', () => {
  assert.equal(shouldRetryQuery(0, net()), true)
  assert.equal(shouldRetryQuery(0, net('ECONNABORTED')), true)
  assert.equal(shouldRetryQuery(0, net('ERR_CANCELED')), false)
  assert.equal(shouldRetryQuery(0, net('ERR_RATE_LIMIT_COOLDOWN')), false)
  assert.equal(shouldRetryQuery(0, new TypeError('x is undefined')), false)
  assert.equal(isNetworkError({ original: { isAxiosError: true, response: {} } }), false)
})
test('policy: retries are bounded', () => {
  assert.equal(shouldRetryQuery(QUERY_MAX_RETRIES - 1, http(503)), true)
  assert.equal(shouldRetryQuery(QUERY_MAX_RETRIES, http(503)), false)
  assert.equal(shouldRetryQuery(50, net()), false)
})
test('backoff: exponential, jittered within 50-100%, capped, deterministic with injected random', () => {
  assert.equal(retryDelayMs(0, null, () => 1), 1000)
  assert.equal(retryDelayMs(1, null, () => 1), 2000)
  assert.equal(retryDelayMs(2, null, () => 1), 4000)
  assert.equal(retryDelayMs(0, null, () => 0), 500)
  assert.equal(retryDelayMs(30, null, () => 1), RETRY_MAX_DELAY_MS)
  const seen = new Set<number>(); for (let i = 0; i < 200; i++) seen.add(retryDelayMs(2))
  assert.ok(seen.size > 20, 'jitter produces spread so clients do not retry in lock-step')
  for (const d of seen) assert.ok(d >= 2000 && d <= 4000)
})
test('backoff: a server Retry-After (e.g. on 503) is a floor, but bounded', () => {
  assert.equal(retryDelayMs(0, { retryAfterMs: 20_000 }, () => 0), 20_000)
  assert.equal(retryDelayMs(0, { retryAfterMs: 9_999_999 }, () => 0), 60_000)
})

/** Real QueryClient with the production policy but 1 ms delays so the suite is fast. */
async function runQuery(errors: unknown[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: () => 1, gcTime: Infinity } } })
  let calls = 0
  await qc.fetchQuery({ queryKey: ['k', Math.random()], queryFn: async () => { const e = errors[calls++]; if (e) throw e; return 'ok' } }).catch(() => {})
  return calls
}
test('react-query: a 429 is requested exactly ONCE (no retry storm)', async () => assert.equal(await runQuery([http(429), http(429), http(429)]), 1))
test('react-query: a 404 / 500 are requested exactly once', async () => { assert.equal(await runQuery([http(404)]), 1); assert.equal(await runQuery([http(500)]), 1) })
test('react-query: a 503 is retried up to the bound (1 + 2 attempts), then gives up', async () => assert.equal(await runQuery([http(503), http(503), http(503), http(503)]), 3))
test('react-query: a transient 503 then success recovers', async () => assert.equal(await runQuery([http(503)]), 2))
test('react-query: network failures retry boundedly', async () => assert.equal(await runQuery([net(), net(), net(), net()]), 3))
test('react-query: cancellation is not retried', async () => assert.equal(await runQuery([net('ERR_CANCELED')]), 1))

test('mutations (POST/payments/invoices) are NEVER auto-retried', () => {
  assert.equal(queryClient.getDefaultOptions().mutations?.retry, 0)
})
test('production defaults: bounded stale cache, no refetch-on-focus', () => {
  const q = queryClient.getDefaultOptions().queries!
  assert.ok((q.staleTime as number) >= 60_000)
  assert.equal(q.refetchOnWindowFocus, false)
  assert.equal(q.retry, shouldRetryQuery)
})

// ── polling intervals ────────────────────────────────────────────────────────
const st = (over: any = {}) => ({ data: { status: 'processing' }, error: null, dataUpdateCount: 1, fetchFailureCount: 0, ...over })
test('scan poll: stops as soon as the operation completes or fails permanently', () => {
  for (const s of ['completed', 'failed', 'cancelled', 'confirmed']) assert.equal(purchaseScanPollInterval(st({ data: { status: s } })), false, s)
})
test('scan poll: adaptive 2s → 5s → 10s, then stops (bounded ≈10 min, no infinite loop)', () => {
  assert.equal(purchaseScanPollInterval(st({ dataUpdateCount: 1 })), SCAN_POLL_FAST_MS)
  assert.equal(purchaseScanPollInterval(st({ dataUpdateCount: 20 })), SCAN_POLL_MEDIUM_MS)
  assert.equal(purchaseScanPollInterval(st({ dataUpdateCount: 60 })), SCAN_POLL_SLOW_MS)
  assert.equal(purchaseScanPollInterval(st({ dataUpdateCount: 75 })), false)
})
test('scan poll: permanent HTTP errors stop the poll; 429 honours Retry-After; network/5xx back off', () => {
  assert.equal(purchaseScanPollInterval(st({ error: http(404), fetchFailureCount: 1 })), false)
  assert.equal(purchaseScanPollInterval(st({ error: http(403), fetchFailureCount: 1 })), false)
  assert.equal(purchaseScanPollInterval(st({ error: http(429, { retryAfterMs: 45_000 }), fetchFailureCount: 1 })), 45_000)
  assert.ok((purchaseScanPollInterval(st({ error: http(429, { retryAfterMs: 1000 }), fetchFailureCount: 1 })) as number) >= SCAN_POLL_MEDIUM_MS)
  assert.equal(purchaseScanPollInterval(st({ error: http(503), fetchFailureCount: 1 })), 4000)
  assert.equal(purchaseScanPollInterval(st({ error: net(), fetchFailureCount: 2 })), 8000)
  assert.equal(purchaseScanPollInterval(st({ error: net(), fetchFailureCount: 12 })), SCAN_POLL_MAX_BACKOFF_MS)
})
test('scan poll: starts polling before the first response arrives', () => {
  assert.equal(purchaseScanPollInterval({ data: undefined, error: null, dataUpdateCount: 0, fetchFailureCount: 0 }), SCAN_POLL_FAST_MS)
})
