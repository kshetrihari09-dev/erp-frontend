/**
 * pollingLoop.ts — one self-scheduling poller with backoff, shared by every
 * subscriber. Framework-free so it can be unit-tested with injected timers.
 *
 * Guarantees:
 *  - At most ONE loop exists per poller instance, no matter how many times
 *    `retain()` is called (re-renders, StrictMode double-mount, route
 *    remounts). The loop runs while retainCount > 0 and stops on the last
 *    release.
 *  - Requests never overlap (setTimeout chain, not setInterval; a tick is
 *    skipped while a request is in flight).
 *  - A quick stop→start (remount) does NOT fire an extra request: the next
 *    attempt is scheduled relative to the last attempt, which survives stop().
 *  - Failures back off exponentially (base·2^(n-1), capped). A 429 is never
 *    retried before Retry-After (and never before any other 429's Retry-After
 *    recorded in rateLimitState) has elapsed.
 *  - `setPaused(true)` (e.g. tab hidden) schedules NOTHING: no timers fire and no
 *    requests are sent. On `setPaused(false)` the next attempt is due relative to
 *    the last real attempt, so a tab hidden for an hour polls once immediately
 *    (catch-up) — still subject to any Retry-After / backoff floor.
 *  - A scope change (different user/company) drops cached data and polls
 *    immediately; `reset()` (logout) stops everything and forgets all state.
 */
import { DEFAULT_RETRY_AFTER_MS, getRateLimitedUntil, noteRateLimited, parseRetryAfterMs, readHeader } from './rateLimitState'

export interface PollState<T> {
  data: T | undefined
  error: unknown | null
  /** consecutive failures since the last success */
  failureCount: number
  lastSuccessAt: number | null
}

export interface PollingLoopOptions<T> {
  fetcher: (signal: AbortSignal) => Promise<T>
  /** Read on every schedule so the interval can be reconfigured without a restart. */
  getIntervalMs: () => number
  maxBackoffMs?: number
  /** ±fraction of random jitter on each delay (default 0.1) so tabs/users don't synchronise. */
  jitter?: number
  /** Pause (don't send) while this returns false, e.g. offline. */
  canRun?: () => boolean
  now?: () => number
  random?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface PollingLoop<T> {
  /** Keep the loop alive for `scope`; returns an idempotent release function. */
  retain(scope: string): () => void
  subscribe(listener: () => void): () => void
  getSnapshot(): PollState<T>
  /** Pause/resume polling without losing data or timing (tab hidden/visible). Idempotent. */
  setPaused(paused: boolean): void
  /** Re-arm the timer now, e.g. after getIntervalMs() would return a different value. */
  poke(): void
  /** Stop everything and forget data/timing (logout). Does not touch retain counts. */
  reset(): void
  /** Diagnostics / tests */
  readonly isRunning: boolean
  readonly isPaused: boolean
  readonly retainCount: number
}

/** Extracts the HTTP status / Retry-After from the shape http.ts rejects with. */
function describeError(err: unknown, now: number): { status?: number; retryAfterMs: number | null } {
  const e = err as { status?: number; original?: { response?: { headers?: unknown; status?: number } } } | null
  const status = e?.status ?? e?.original?.response?.status
  const retryAfterMs = parseRetryAfterMs(readHeader(e?.original?.response?.headers, 'retry-after'), now)
  return { status, retryAfterMs }
}

export function createPollingLoop<T>(opts: PollingLoopOptions<T>): PollingLoop<T> {
  const now        = opts.now        ?? (() => Date.now())
  const random     = opts.random     ?? (() => Math.random())
  const setTimer   = opts.setTimer   ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const maxBackoff = opts.maxBackoffMs ?? 5 * 60_000
  const jitter     = opts.jitter ?? 0.1

  const empty = (): PollState<T> => ({ data: undefined, error: null, failureCount: 0, lastSuccessAt: null })
  let state: PollState<T> = empty()
  const listeners = new Set<() => void>()

  let retained = 0
  let scope: string | null = null
  let running = false
  let paused = false
  let timer: unknown = null
  let controller: AbortController | null = null
  let inFlight = false
  let generation = 0          // bumps on stop/reset/scope-change → stale responses are ignored
  let lastAttemptAt = 0       // survives stop() so a remount doesn't re-fire early
  let nextEarliestAt = 0      // Retry-After / backoff floor for the next attempt

  const emit = (next: PollState<T>) => { state = next; listeners.forEach(l => l()) }

  function withJitter(ms: number) {
    return Math.round(ms * (1 + (random() * 2 - 1) * jitter))
  }

  function backoffMs(failures: number) {
    return Math.min(maxBackoff, opts.getIntervalMs() * 2 ** Math.max(0, failures - 1))
  }

  function clearScheduled() {
    if (timer != null) { clearTimer(timer); timer = null }
  }

  function schedule() {
    clearScheduled()
    if (!running || paused) return
    const t = now()
    const interval = state.failureCount > 0 ? backoffMs(state.failureCount) : opts.getIntervalMs()
    const due = Math.max(
      lastAttemptAt ? lastAttemptAt + withJitter(interval) : t,   // first ever attempt → now
      nextEarliestAt,
      getRateLimitedUntil(),                                       // another request got a 429
    )
    timer = setTimer(tick, Math.max(0, due - t))
  }

  async function tick() {
    timer = null
    if (!running || paused || inFlight) return
    // Another request (any endpoint) may have hit a 429 after this timer was armed.
    if (getRateLimitedUntil() > now()) { schedule(); return }
    if (opts.canRun && !opts.canRun()) { lastAttemptAt = now(); schedule(); return }   // e.g. offline: wait a full interval

    const myGen = generation
    inFlight = true
    lastAttemptAt = now()
    controller = new AbortController()
    try {
      const data = await opts.fetcher(controller.signal)
      if (myGen !== generation) return
      nextEarliestAt = 0
      emit({ data, error: null, failureCount: 0, lastSuccessAt: now() })
    } catch (err) {
      if (myGen !== generation) return
      const { status, retryAfterMs } = describeError(err, now())
      const failures = state.failureCount + 1
      if (status === 429) {
        // Never before Retry-After; if the header is unreadable fall back to the larger of backoff and the default.
        const waitMs = retryAfterMs ?? Math.max(backoffMs(failures), DEFAULT_RETRY_AFTER_MS)
        nextEarliestAt = now() + waitMs
        noteRateLimited(waitMs, now())
      }
      emit({ ...state, error: err, failureCount: failures })
    } finally {
      if (myGen === generation) { inFlight = false; controller = null; schedule() }
    }
  }

  function start() {
    if (running) return
    running = true
    schedule()
  }

  function stop() {
    running = false
    generation++
    clearScheduled()
    if (inFlight) lastAttemptAt = 0   // aborted before any data arrived → a remount should fetch again
    controller?.abort()
    controller = null
    inFlight = false
  }

  return {
    retain(nextScope: string) {
      if (scope !== nextScope) {
        // Different user/company: nothing fetched under the old scope may be shown or reused.
        const hadScope = scope !== null
        scope = nextScope
        if (hadScope) {
          generation++
          controller?.abort(); controller = null; inFlight = false
          lastAttemptAt = 0; nextEarliestAt = 0
          emit(empty())
          if (running) schedule()
        }
      }
      retained++
      start()
      let released = false
      return () => {
        if (released) return
        released = true
        retained = Math.max(0, retained - 1)
        if (retained === 0) stop()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    setPaused(next: boolean) {
      if (paused === next) return
      paused = next
      if (paused) clearScheduled()          // an in-flight request may finish; it will not re-arm while paused
      else if (running) schedule()          // due = lastAttemptAt + interval → fires now if overdue
    },
    poke() { if (running && !paused) schedule() },
    reset() {
      stop()
      scope = null
      lastAttemptAt = 0
      nextEarliestAt = 0
      emit(empty())
    },
    get isRunning() { return running },
    get isPaused() { return paused },
    get retainCount() { return retained },
  }
}
