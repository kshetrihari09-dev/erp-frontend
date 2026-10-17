// Integration: the REAL services/http.ts (interceptors + request guard) against a scripted network.
import './setup-dom'
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import axios, { AxiosError } from 'axios'
;(globalThis as any).localStorage = (globalThis as any).window.localStorage
import http from '../src/services/http'
import { createRequestGuard } from '../src/services/requestGuard'
import { runWithSignal } from '../src/services/requestSignal'
import { resetRateLimitState, getRateLimitedUntil } from '../src/services/rateLimitState'
import useUIStore from '../src/store/uiStore'
import { RAW_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../src/store/authStore'

type Script = (config: any) => { status: number; data?: any; headers?: Record<string, string>; delayMs?: number } | Promise<any>
let script: Script
let network: Array<{ url: string; method: string; auth?: string; signal?: AbortSignal }> = []

/** Scripted network standing in for the real axios adapter. */
const fakeBase = (config: any): Promise<any> => new Promise((resolve, reject) => {
  network.push({ url: config.url, method: config.method, auth: config.headers?.Authorization, signal: config.signal })
  config.signal?.addEventListener('abort', () => reject(Object.assign(new AxiosError('canceled', 'ERR_CANCELED', config), { name: 'CanceledError' })))
  Promise.resolve(script(config)).then((r: any) => {
    const finish = () => {
      const response = { status: r.status, statusText: '', data: r.data ?? {}, headers: r.headers ?? {}, config }
      if (r.status >= 200 && r.status < 300) resolve(response)
      else reject(new AxiosError(`HTTP ${r.status}`, 'ERR_BAD_REQUEST', config, null, response as any))
    }
    r.delayMs ? setTimeout(finish, r.delayMs) : finish()
  })
})

let toasts: string[] = []
beforeEach(() => {
  resetRateLimitState()
  network = []; toasts = []
  http.defaults.adapter = createRequestGuard({ base: fakeBase as any })
  axios.defaults.adapter = fakeBase as any          // the refresh call uses the global axios
  localStorage.clear()
  localStorage.setItem(RAW_TOKEN_KEY, 'aaa.bbb.ccc')
  localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1')
  useUIStore.setState({ warning: (title: string, msg?: string) => { toasts.push(`${title}|${msg}`) } } as any)
  script = () => ({ status: 200, data: { success: true } })
})

const limiter429 = (limiter: string, retryAfter = '30') => ({
  status: 429,
  headers: { 'retry-after': retryAfter, 'x-ratelimit-limiter': limiter, 'x-ratelimit-source': 'app-limiter' },
  data: { success: false, code: 'RATE_LIMITED', limiter, message: 'Too many requests.' },
})

test('baseline limiter 429: records a GLOBAL cooldown, surfaces Retry-After, and shows ONE toast for a burst', async () => {
  script = () => limiter429('user', '30')
  const errs: any[] = []
  for (let i = 0; i < 1; i++) errs.push(await http.get('/products').catch(e => e))
  assert.equal(errs[0].status, 429)
  assert.equal(errs[0].retryAfterMs, 30_000)
  assert.equal(errs[0].rateLimitKind, 'limiter')
  assert.ok(getRateLimitedUntil() > Date.now() + 25_000)
  // further reads (ANY url) are held back locally: nothing more reaches the network
  const before = network.length
  const gated = await Promise.all([http.get('/parties').catch(e => e), http.get('/sales').catch(e => e), http.get('/reports/x').catch(e => e)])
  assert.equal(network.length, before)
  for (const g of gated) { assert.equal(g.status, 429); assert.equal(g.rateLimitKind, 'client') }
  assert.equal(toasts.length, 1, 'one toast per cooldown window, not one per rejected request')
  assert.match(toasts[0], /30 seconds/)
})

test('cooldown never blocks a user-initiated write', async () => {
  script = () => limiter429('user', '30')
  await http.get('/products').catch(() => {})
  script = () => ({ status: 201, data: { success: true } })
  const res = await http.post('/sales', { total: 1 })
  assert.equal(res.status, 201)
})

test('specialised limiter (reports) → SCOPED cooldown: reports reads wait, products and pollers do not', async () => {
  script = (c) => (String(c.url).startsWith('/reports') ? limiter429('reports', '20') : { status: 200, data: { ok: 1 } })
  await http.get('/reports/sales').catch(() => {})
  assert.equal(getRateLimitedUntil(), 0, 'global cooldown (pollers) untouched')
  const n = network.length
  const blocked: any = await http.get('/reports/profit-loss').catch(e => e)
  assert.equal(blocked.rateLimitKind, 'client'); assert.equal(network.length, n)
  const fine = await http.get('/products'); assert.equal(fine.status, 200)
})

test('application 429 (PIN lockout) is NOT traffic: no cooldown, no "Too many requests" toast, code preserved', async () => {
  script = () => ({ status: 429, headers: { 'x-ratelimit-source': 'application' }, data: { success: false, code: 'PIN_LOCKED', message: 'Too many failed attempts.' } })
  const e: any = await http.post('/auth/verify-password', { password: 'x' }).catch(e => e)
  assert.equal(e.status, 429); assert.equal(e.code, 'PIN_LOCKED'); assert.equal(e.rateLimitKind, 'application')
  assert.equal(getRateLimitedUntil(), 0)
  assert.equal(toasts.length, 0)
  script = () => ({ status: 200, data: { ok: 1 } })
  const next = await http.get('/products'); assert.equal(next.status, 200)    // app keeps working: nothing is being held back
})

test('an unmarked 429 (CDN / platform / upstream) is treated as infrastructure: global default cooldown', async () => {
  script = () => ({ status: 429, data: '<html>Too Many Requests</html>' })
  const e: any = await http.get('/products').catch(e => e)
  assert.equal(e.rateLimitKind, 'unknown')
  assert.ok(getRateLimitedUntil() > Date.now() + 55_000)
})

test('identical concurrent GETs reach the network once (React StrictMode / duplicate components)', async () => {
  script = () => ({ status: 200, data: { data: [1, 2, 3] }, delayMs: 10 })
  const rs = await Promise.all(Array.from({ length: 8 }, () => http.get('/reports/dashboard')))
  assert.equal(network.filter(n => n.url === '/reports/dashboard').length, 1)
  for (const r of rs) assert.deepEqual(r.data, { data: [1, 2, 3] })
})

test('the Authorization header is part of the dedupe key: another user never shares a response', async () => {
  script = () => ({ status: 200, data: { ok: 1 }, delayMs: 10 })
  const a = http.get('/products')
  localStorage.setItem(RAW_TOKEN_KEY, 'zzz.yyy.xxx')
  const b = http.get('/products')
  await Promise.all([a, b])
  assert.equal(network.length, 2)
})

test('an ambient AbortSignal (react-query queryFn) really cancels the HTTP call — dispatch is synchronous', async () => {
  script = () => ({ status: 200, data: {}, delayMs: 200 })
  const ctl = new AbortController()
  const p = runWithSignal(ctl.signal, () => http.get('/products?q=ab')).catch((e: any) => e)
  assert.equal(network.length, 1, 'request was dispatched in the same tick (signal attached)')
  ctl.abort()
  const e: any = await p
  assert.ok(e.name === 'CanceledError' || e.original?.code === 'ERR_CANCELED' || e.message?.includes('cancel'), JSON.stringify(Object.keys(e)))
  assert.equal(network[0].signal?.aborted, true)
})

test('without an ambient signal behaviour is unchanged', async () => {
  const r = await http.get('/products'); assert.equal(r.status, 200)
})

// ── token refresh flow ─────────────────────────────────────────────────────────
test('a RATE-LIMITED refresh (429) does NOT log the user out', async () => {
  script = (c) => String(c.url).includes('/auth/refresh') ? limiter429('auth_refresh', '60') : { status: 401, data: { message: 'expired' } }
  const e: any = await http.get('/products').catch(e => e)
  assert.equal(e.status, 429)
  assert.equal(localStorage.getItem(RAW_TOKEN_KEY), 'aaa.bbb.ccc')
  assert.equal(localStorage.getItem(REFRESH_TOKEN_KEY), 'refresh-1')
})

test('a REJECTED refresh token (401) ends the session', async () => {
  script = (c) => ({ status: 401, data: { message: 'invalid refresh' } })
  const e: any = await http.get('/products').catch(e => e)
  assert.equal(e.status, 401)
  assert.equal(localStorage.getItem(RAW_TOKEN_KEY), null)
  assert.equal(localStorage.getItem(REFRESH_TOKEN_KEY), null)
})

test('requests queued behind a failing refresh are settled, not left pending forever', async () => {
  script = (c) => String(c.url).includes('/auth/refresh')
    ? { status: 503, data: {}, delayMs: 30 }
    : { status: 401, data: { message: 'expired' } }
  const timeout = new Promise((r) => setTimeout(() => r('HUNG'), 1500))
  const results = await Promise.all([
    Promise.race([http.get('/products').catch(e => e), timeout]),
    Promise.race([http.get('/parties').catch(e => e), timeout]),
    Promise.race([http.get('/sales').catch(e => e), timeout]),
  ])
  for (const r of results) { assert.notEqual(r, 'HUNG'); assert.equal((r as any).status, 503) }
  assert.equal(localStorage.getItem(RAW_TOKEN_KEY), 'aaa.bbb.ccc')          // 503 refresh keeps the session
})

test('successful refresh replays queued requests with the new token (one refresh call)', async () => {
  let refreshes = 0
  script = (c) => {
    if (String(c.url).includes('/auth/refresh')) { refreshes++; return { status: 200, data: { data: { token: 'new.tok.en', refresh_token: 'refresh-2' } }, delayMs: 20 } }
    return c.headers?.Authorization === 'Bearer new.tok.en' ? { status: 200, data: { ok: 1 } } : { status: 401, data: {} }
  }
  const rs = await Promise.all([http.get('/products'), http.get('/parties')])
  assert.deepEqual(rs.map(r => r.status), [200, 200])
  assert.equal(refreshes, 1)
  assert.equal(localStorage.getItem(REFRESH_TOKEN_KEY), 'refresh-2')
})
