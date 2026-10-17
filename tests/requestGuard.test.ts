// Request guard: cooldown gate, concurrent GET dedupe, per-caller cancellation. Pure (fake base adapter).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import { createRequestGuard, dedupeKey } from '../src/services/requestGuard'

type Cfg = any
const cfg = (over: Cfg = {}): Cfg => ({ method: 'get', baseURL: 'http://x/api', url: '/products', headers: new AxiosHeaders({ Authorization: 'Bearer A' }), ...over })

/** Fake network: each call returns a promise the test settles manually. */
function fakeBase() {
  const calls: Array<{ config: Cfg; resolve: (d?: unknown) => void; reject: (e: unknown) => void }> = []
  const base = ((config: Cfg) => new Promise((resolve, reject) => {
    const entry = { config, resolve: (d: unknown = { ok: true, list: [1, 2] }) => resolve({ status: 200, statusText: 'OK', data: d, headers: {}, config }), reject }
    config.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'ERR_CANCELED' })))
    calls.push(entry)
  })) as any
  return { base, calls }
}
const tick = () => new Promise(r => setImmediate(r))

test('N identical concurrent GETs share ONE network request; each caller gets its own data copy', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const ps = [g(cfg()), g(cfg()), g(cfg())]
  assert.equal(calls.length, 1)
  assert.equal(g.inflightCount(), 1)
  calls[0].resolve({ list: [1, 2] })
  const [a, b, c] = await Promise.all(ps) as any[]
  assert.deepEqual(a.data, { list: [1, 2] })
  b.data.list.push(99)                                   // a follower mutating its copy …
  assert.deepEqual(a.data.list, [1, 2])                  // … cannot corrupt the leader's
  assert.deepEqual(c.data.list, [1, 2])
  assert.equal(g.inflightCount(), 0)
})

test('nothing is cached: a GET after the first one completed hits the network again', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const p1 = g(cfg()); calls[0].resolve(); await p1
  const p2 = g(cfg()); assert.equal(calls.length, 2); calls[1].resolve(); await p2
})

test('param order does not matter; different params / url / Authorization are NOT merged', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  g(cfg({ params: { a: 1, b: 2 } })); g(cfg({ params: { b: 2, a: 1 } }))
  assert.equal(calls.length, 1)
  g(cfg({ params: { a: 1, b: 3 } })); g(cfg({ url: '/parties' }))
  g(cfg({ headers: new AxiosHeaders({ Authorization: 'Bearer OTHER-USER' }) }))
  assert.equal(calls.length, 4)
  assert.notEqual(dedupeKey(cfg()), dedupeKey(cfg({ headers: new AxiosHeaders({ Authorization: 'Bearer B' }) })))
  calls.forEach(c => c.resolve())
})

test('writes, blobs and dedupe:false are never merged', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  g(cfg({ method: 'post', url: '/sales', data: {} })); g(cfg({ method: 'post', url: '/sales', data: {} }))
  g(cfg({ responseType: 'blob', url: '/pdf' })); g(cfg({ responseType: 'blob', url: '/pdf' }))
  g(cfg({ dedupe: false })); g(cfg({ dedupe: false }))
  assert.equal(calls.length, 6)
  calls.forEach(c => c.resolve())
})

test('a caller that aborts is cancelled alone; the shared request continues for the others', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const ctl = new AbortController()
  const quitter = g(cfg({ signal: ctl.signal })); const stayer = g(cfg())
  quitter.catch(() => {})
  ctl.abort()
  await assert.rejects(quitter, (e: any) => e.name === 'CanceledError' || e.code === 'ERR_CANCELED')
  assert.equal(calls[0].config.signal.aborted, false)   // network request NOT aborted
  calls[0].resolve({ ok: 1 })
  assert.deepEqual(((await stayer) as any).data, { ok: 1 })
})

test('the network request is aborted only when EVERY caller has gone', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const c1 = new AbortController(), c2 = new AbortController()
  const p1 = g(cfg({ signal: c1.signal })).catch(() => 'x'), p2 = g(cfg({ signal: c2.signal })).catch(() => 'x')
  c1.abort(); await tick()
  assert.equal(calls[0].config.signal.aborted, false)
  c2.abort(); await Promise.all([p1, p2])
  assert.equal(calls[0].config.signal.aborted, true)
  assert.equal(g.inflightCount(), 0)
})

test('ambient signal (requestSignal.ts) cancels the request like an explicit one', async () => {
  const { base, calls } = fakeBase()
  const ctl = new AbortController()
  const g = createRequestGuard({ base, getCooldownMs: () => 0, getSignal: () => ctl.signal })
  const p = g(cfg()).catch((e: any) => e)
  ctl.abort()
  const e = await p
  assert.ok(e.name === 'CanceledError' || e.code === 'ERR_CANCELED')
  assert.equal(calls[0].config.signal.aborted, true)
})

test('an already-aborted signal rejects immediately without leaking an in-flight entry', async () => {
  const { base } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const ctl = new AbortController(); ctl.abort()
  await assert.rejects(g(cfg({ signal: ctl.signal })))
  assert.equal(g.inflightCount(), 0)
})

test('a shared failure gives every caller its OWN error + config (401 refresh tagging cannot collide)', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 0 })
  const c1 = cfg(), c2 = cfg()
  const p1 = g(c1).catch((e: any) => e), p2 = g(c2).catch((e: any) => e)
  calls[0].reject(new AxiosError('boom', 'ERR_BAD_RESPONSE', calls[0].config, null, { status: 503, data: { m: 1 }, headers: {}, config: calls[0].config, statusText: '' } as any))
  const [e1, e2] = await Promise.all([p1, p2])
  assert.notEqual(e1, e2)
  assert.equal(e2.config, c2)                                    // follower keeps ITS config
  assert.equal(e1.response.status, 503); assert.equal(e2.response.status, 503)
  e2.config._retry = true
  assert.notEqual(e1.config._retry, true)
})

test('COOLDOWN GATE: reads are rejected locally with a synthetic 429 and never reach the network', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 12_300 })
  await assert.rejects(g(cfg()), (e: any) => {
    assert.equal(e.code, 'ERR_RATE_LIMIT_COOLDOWN')
    assert.equal(e.response.status, 429)
    assert.equal(e.response.headers['x-ratelimit-source'], 'client')
    assert.equal(e.response.headers['retry-after'], '13')
    assert.equal(e.response.data.code, 'CLIENT_RATE_LIMIT_COOLDOWN')
    return true
  })
  assert.equal(calls.length, 0)
})

test('COOLDOWN GATE never blocks writes (a person\'s explicit action is still sent)', async () => {
  const { base, calls } = fakeBase()
  const g = createRequestGuard({ base, getCooldownMs: () => 60_000 })
  const p = g(cfg({ method: 'post', url: '/sales', data: {} }))
  assert.equal(calls.length, 1); calls[0].resolve(); await p
})

test('COOLDOWN GATE is per URL scope and lifts when the cooldown ends', async () => {
  const { base, calls } = fakeBase()
  let until = 0
  const t = { now: 1000 }
  const g = createRequestGuard({ base, now: () => t.now, getCooldownMs: (url, now) => (String(url).includes('/reports') ? Math.max(0, until - now) : 0) })
  until = 6000
  await assert.rejects(g(cfg({ url: '/reports/sales' })))
  const ok = g(cfg({ url: '/products' })); calls[0].resolve(); await ok       // other families unaffected
  t.now = 6001
  const later = g(cfg({ url: '/reports/sales' })); assert.equal(calls.length, 2); calls[1].resolve(); await later
})
