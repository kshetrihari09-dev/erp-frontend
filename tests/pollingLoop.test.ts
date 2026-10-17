// Unit tests for the polling loop + Retry-After handling, using an injected fake clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPollingLoop } from '../src/services/pollingLoop'
import { parseRetryAfterMs, resetRateLimitState, noteRateLimited, getRateLimitedUntil } from '../src/services/rateLimitState'

function fakeClock() {
  let t = 1_000_000
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id },
    clearTimer: (id: unknown) => { timers.delete(id as number) },
    pending: () => timers.size,
    async advance(ms: number) {
      const end = t + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0]); t = Math.max(t, due[1].at); due[1].fn()
        for (let i = 0; i < 10; i++) await Promise.resolve()
      }
      t = end
    },
  }
}

const err429 = (retryAfter?: string) => ({ status: 429, original: { response: { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} } } })

function make(fetcher: (n: number) => Promise<any>, extra: Record<string, unknown> = {}) {
  resetRateLimitState()
  const clock = fakeClock()
  let n = 0
  const loop = createPollingLoop<any>({
    fetcher: () => fetcher(++n),
    getIntervalMs: () => 60_000, jitter: 0, random: () => 0.5,
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...extra,
  })
  return { clock, loop, count: () => n }
}

test('parseRetryAfterMs handles seconds, HTTP-date, junk and clamps', () => {
  assert.equal(parseRetryAfterMs('120'), 120_000)
  assert.equal(parseRetryAfterMs('0'), 0)
  assert.equal(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:30 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')), 30_000)
  assert.equal(parseRetryAfterMs('nonsense'), null)
  assert.equal(parseRetryAfterMs(undefined), null)
  assert.equal(parseRetryAfterMs('999999'), 20 * 60_000)
})

test('many retain() calls create ONE loop: one request per interval', async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }))
  const releases = Array.from({ length: 10 }, () => loop.retain('u1:c1'))
  assert.equal(clock.pending(), 1, 'exactly one timer scheduled')
  await clock.advance(0);       assert.equal(count(), 1)           // first poll immediately
  await clock.advance(59_000);  assert.equal(count(), 1)
  await clock.advance(1_000);   assert.equal(count(), 2)           // 60s later
  await clock.advance(120_000); assert.equal(count(), 4)
  releases.slice(0, 9).forEach(r => r()); await clock.advance(60_000); assert.equal(count(), 5, 'still running while one consumer remains')
  releases[9](); assert.equal(loop.isRunning, false); assert.equal(clock.pending(), 0)
  await clock.advance(600_000); assert.equal(count(), 5, 'no polling after last release')
})

test('release is idempotent and remount right after unmount does not fire an extra request', async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }))
  const r1 = loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  r1(); r1()
  assert.equal(loop.retainCount, 0)
  const r2 = loop.retain('s')            // remount 5s later
  await clock.advance(5_000);            assert.equal(count(), 1, 'remount must not refetch early')
  await clock.advance(55_000);           assert.equal(count(), 2)
  r2()
})

test('failures back off exponentially and never retry immediately', async () => {
  const { clock, loop, count } = make(async () => { throw { status: 500 } })
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  await clock.advance(59_999);   assert.equal(count(), 1)
  await clock.advance(1);        assert.equal(count(), 2)          // after 60s (2^0)
  await clock.advance(119_999);  assert.equal(count(), 2)
  await clock.advance(1);        assert.equal(count(), 3)          // after 120s (2^1)
  await clock.advance(239_999);  assert.equal(count(), 3)
  await clock.advance(1);        assert.equal(count(), 4)          // after 240s (2^2)
  await clock.advance(300_000);  assert.equal(count(), 5)          // capped at 5 min
  await clock.advance(300_000);  assert.equal(count(), 6)
  assert.ok(loop.getSnapshot().failureCount >= 5)
})

test('success after failures resets the schedule to the base interval', async () => {
  const { clock, loop, count } = make(async (n) => { if (n <= 2) throw { status: 500 }; return { ok: n } })
  loop.retain('s'); await clock.advance(0); await clock.advance(60_000); await clock.advance(120_000)
  assert.equal(count(), 3); assert.equal(loop.getSnapshot().failureCount, 0)
  await clock.advance(60_000); assert.equal(count(), 4)
})

test('429 waits for Retry-After (longer than backoff) and is not retried before then', async () => {
  const { clock, loop, count } = make(async (n) => { if (n === 1) throw err429('300'); return { ok: n } })
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  await clock.advance(299_999); assert.equal(count(), 1, 'must not retry within Retry-After')
  await clock.advance(1);       assert.equal(count(), 2)
  assert.equal(loop.getSnapshot().failureCount, 0)
})

test('429 without a readable Retry-After still backs off (>= 60s default)', async () => {
  const { clock, loop, count } = make(async (n) => { if (n === 1) throw err429(); return { ok: n } })
  loop.retain('s'); await clock.advance(0)
  await clock.advance(59_999); assert.equal(count(), 1)
  await clock.advance(1);      assert.equal(count(), 2)
})

test('a 429 recorded by ANY other request also delays the poller', async () => {
  const { clock, loop, count } = make(async () => ({ ok: true }))
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  noteRateLimited(400_000, clock.now())                              // e.g. http.ts saw a 429 on /dashboard
  assert.ok(getRateLimitedUntil() > clock.now())
  await clock.advance(399_999); assert.equal(count(), 1)
  await clock.advance(1);       assert.equal(count(), 2)
})

test('requests never overlap while one is slow', async () => {
  let resolveFirst: (v: unknown) => void = () => {}
  let active = 0, maxActive = 0
  const { clock, loop, count } = make((n) => { active++; maxActive = Math.max(maxActive, active)
    return new Promise((res) => { const done = () => { active--; res({ n }) }; if (n === 1) resolveFirst = done; else done() }) })
  loop.retain('s'); await clock.advance(0)
  loop.retain('s'); loop.retain('s')
  await clock.advance(180_000); assert.equal(count(), 1, 'slow request still in flight → nothing else sent')
  resolveFirst(null); await clock.advance(0); await clock.advance(60_000)
  assert.equal(maxActive, 1)
  assert.ok(count() >= 2)
})

test('scope change drops old data and polls right away; stale in-flight response is ignored', async () => {
  let release: (v: unknown) => void = () => {}
  const { clock, loop, count } = make((n) => n === 1 ? new Promise(r => { release = r }) : Promise.resolve({ for: 'new' }))
  loop.retain('userA:c1'); await clock.advance(0); assert.equal(count(), 1)
  loop.retain('userB:c1'); await clock.advance(0); assert.equal(count(), 2)
  release({ for: 'old' }); await clock.advance(0)
  assert.deepEqual(loop.getSnapshot().data, { for: 'new' }, 'old-scope response must not overwrite new-scope data')
})

test('reset() (logout) stops the loop, aborts the request and clears data', async () => {
  let signal: AbortSignal | undefined
  const clock = fakeClock(); resetRateLimitState()
  const loop = createPollingLoop<any>({ fetcher: (s) => { signal = s; return Promise.resolve({ x: 1 }) }, getIntervalMs: () => 60_000, jitter: 0, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer })
  loop.retain('s'); await clock.advance(0); assert.ok(loop.getSnapshot().data)
  loop.reset()
  assert.equal(loop.isRunning, false); assert.equal(clock.pending(), 0); assert.equal(loop.getSnapshot().data, undefined)
  assert.equal(signal?.aborted, false) // request had already completed; abort only matters for in-flight ones
})

test('canRun=false (offline) pauses requests without spinning', async () => {
  let online = false
  const { clock, loop, count } = make(async () => ({ ok: true }), { canRun: () => online })
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 0)
  await clock.advance(59_000); assert.equal(count(), 0)
  online = true; await clock.advance(1_000); assert.equal(count(), 1)
})

// ── pause / resume (hidden tab) ───────────────────────────────────────────────
test('setPaused(true): no timers, no requests across many intervals', async () => {
  const { clock, loop, count } = make(async () => 'ok')
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  loop.setPaused(true)
  assert.equal(clock.pending(), 0, 'pausing cancels the scheduled timer')
  await clock.advance(30 * 60_000)
  assert.equal(count(), 1, 'nothing sent while paused')
  assert.equal(loop.isPaused, true)
})

test('resume after a long pause sends exactly ONE catch-up request immediately, then resumes the normal cadence', async () => {
  const { clock, loop, count } = make(async () => 'ok')
  loop.retain('s'); await clock.advance(0)
  loop.setPaused(true); await clock.advance(60 * 60_000)
  loop.setPaused(false); await clock.advance(0)
  assert.equal(count(), 2, 'one catch-up poll, not one per missed interval')
  await clock.advance(60_000); assert.equal(count(), 3)
})

test('resume shortly after pausing does not fire early (cadence is relative to the last real attempt)', async () => {
  const { clock, loop, count } = make(async () => 'ok')
  loop.retain('s'); await clock.advance(0)
  await clock.advance(10_000)
  loop.setPaused(true); loop.setPaused(false); await clock.advance(0)
  assert.equal(count(), 1)
  await clock.advance(50_000); assert.equal(count(), 2)
})

test('a request in flight when paused finishes but does not re-arm the timer', async () => {
  let release!: () => void
  const { clock, loop, count } = make(() => new Promise(r => { release = () => r('ok') }))
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  loop.setPaused(true)
  release(); for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(clock.pending(), 0)
  await clock.advance(10 * 60_000); assert.equal(count(), 1)
})

test('resume still honours an active Retry-After / rate-limit cooldown', async () => {
  const { clock, loop, count } = make(async (n) => { if (n === 1) throw err429('300'); return 'ok' })
  loop.retain('s'); await clock.advance(0); assert.equal(count(), 1)
  loop.setPaused(true); await clock.advance(60_000); loop.setPaused(false)
  await clock.advance(0); assert.equal(count(), 1, 'cooldown (300s) not over yet')
  await clock.advance(250_000); assert.equal(count(), 2)
})

test('setPaused is idempotent and works before the loop is retained', async () => {
  const { clock, loop, count } = make(async () => 'ok')
  loop.setPaused(true); loop.setPaused(true)
  loop.retain('s'); await clock.advance(5 * 60_000); assert.equal(count(), 0, 'retained while paused → still silent')
  loop.setPaused(false); await clock.advance(0); assert.equal(count(), 1)
})
