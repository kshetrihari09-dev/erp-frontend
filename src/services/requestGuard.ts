/**
 * requestGuard.ts — an axios *adapter wrapper* that sits between axios and the
 * network and does three things for idempotent reads (GET/HEAD):
 *
 *  1. COOLDOWN GATE  While the server has told us to back off (rateLimitState.ts),
 *     a read for an affected route family is rejected LOCALLY with a synthetic 429
 *     instead of being sent. Sending it would only be rejected again and adds load
 *     to an exhausted bucket. Mutations (POST/PUT/PATCH/DELETE) are never gated —
 *     a person's explicit action is still sent and the server decides.
 *
 *  2. IN-FLIGHT DEDUPLICATION  Identical concurrent GETs (same URL, params and
 *     credentials) share ONE network request: React StrictMode double effects, two
 *     components asking for the same list, a page + a layout both loading the
 *     dashboard. Callers that join an in-flight request receive their own copy of
 *     the response. Only requests that are *simultaneously in flight* are merged —
 *     nothing is cached, so a later read always sees fresh data.
 *
 *  3. CANCELLATION  Each caller's AbortSignal (explicit `config.signal`, or the
 *     ambient one from requestSignal.ts) cancels only THAT caller. The shared
 *     network request is aborted only when every caller has gone away.
 *
 * Non-GET requests, blobs/streams, and requests with `dedupe: false` pass straight
 * through. Authorization is part of the dedupe key, so two users/tabs never share.
 */
import { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { cooldownRemainingMs } from './rateLimitState'
import { getAmbientSignal } from './requestSignal'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set false to opt a GET out of in-flight deduplication. */
    dedupe?: boolean
  }
}

export const COOLDOWN_ERROR_CODE = 'ERR_RATE_LIMIT_COOLDOWN'

interface Entry {
  promise: Promise<AxiosResponse>
  controller: AbortController
  refs: number
  done: boolean
}

export interface GuardOptions {
  /** Real adapter (axios' default http/xhr adapter). */
  base: AxiosAdapter
  /** Injectable for tests. */
  now?: () => number
  getCooldownMs?: (url: string | undefined, now: number) => number
  getSignal?: () => AbortSignal | undefined
}

function cloneData<T>(data: T): T {
  if (data === null || typeof data !== 'object') return data
  try {
    return typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data))
  } catch {
    return data
  }
}

function stableParams(params: unknown): string {
  if (!params || typeof params !== 'object') return ''
  const entries = Object.entries(params as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

function headerValue(headers: unknown, name: string): string {
  const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>
  if (!h) return ''
  if (typeof h.get === 'function') return String(h.get(name) ?? '')
  return String(h[name] ?? h[name.toLowerCase()] ?? '')
}

export function dedupeKey(config: InternalAxiosRequestConfig): string {
  return [
    (config.method || 'get').toLowerCase(),
    config.baseURL ?? '',
    config.url ?? '',
    stableParams(config.params),
    headerValue(config.headers, 'Authorization'),
  ].join('|')
}

function isDedupable(config: InternalAxiosRequestConfig): boolean {
  const m = (config.method || 'get').toLowerCase()
  if (m !== 'get' && m !== 'head') return false
  if (config.dedupe === false) return false
  if (config.responseType && config.responseType !== 'json' && config.responseType !== 'text') return false
  if (config.onDownloadProgress || config.onUploadProgress) return false
  return true
}

function cooldownError(config: InternalAxiosRequestConfig, remainingMs: number): AxiosError {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const response = {
    status: 429,
    statusText: 'Too Many Requests',
    data: { success: false, code: 'CLIENT_RATE_LIMIT_COOLDOWN', message: `Too many requests. Please wait ${seconds}s and try again.`, retryAfterSeconds: seconds },
    headers: { 'retry-after': String(seconds), 'x-ratelimit-source': 'client' },
    config,
  } as unknown as AxiosResponse
  return new AxiosError(`Rate-limit cooldown active (${seconds}s)`, COOLDOWN_ERROR_CODE, config, null, response)
}

export function createRequestGuard(opts: GuardOptions): AxiosAdapter & { inflightCount: () => number } {
  const now = opts.now ?? Date.now
  const getCooldownMs = opts.getCooldownMs ?? cooldownRemainingMs
  const getSignal = opts.getSignal ?? getAmbientSignal
  const inflight = new Map<string, Entry>()

  const adapter = ((config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const method = (config.method || 'get').toLowerCase()
    const callerSignal = (config.signal as AbortSignal | undefined) ?? getSignal()

    // 1 ─ cooldown gate (reads only)
    if (method === 'get' || method === 'head') {
      const remaining = getCooldownMs(config.url, now())
      if (remaining > 0) return Promise.reject(cooldownError(config, remaining))
    }

    // pass-through for everything we do not merge
    if (!isDedupable(config)) {
      return opts.base(callerSignal && !config.signal ? ({ ...config, signal: callerSignal } as InternalAxiosRequestConfig) : config)
    }

    // 2 ─ join or start the shared request
    const key = dedupeKey(config)
    let entry = inflight.get(key)
    let leader = false
    if (!entry) {
      leader = true
      const controller = new AbortController()
      const created: Entry = { controller, refs: 0, done: false, promise: undefined as unknown as Promise<AxiosResponse> }
      created.promise = opts.base({ ...config, signal: controller.signal } as InternalAxiosRequestConfig)
      const cleanup = () => { created.done = true; if (inflight.get(key) === created) inflight.delete(key) }
      created.promise.then(cleanup, cleanup)
      inflight.set(key, created)
      entry = created
    }
    const shared = entry
    shared.refs += 1

    // 3 ─ per-caller settle / cancel
    return new Promise<AxiosResponse>((resolve, reject) => {
      let settled = false
      const finish = () => {
        callerSignal?.removeEventListener('abort', onAbort)
      }
      const release = () => {
        shared.refs -= 1
        if (shared.refs <= 0 && !shared.done) shared.controller.abort()   // nobody is waiting any more
      }
      function onAbort() {
        if (settled) return
        settled = true
        finish()
        release()
        // Runtime signature is (message, config, request); the d.ts inherits AxiosError's.
        reject(new (CanceledError as unknown as new (m?: string, c?: unknown) => Error)(undefined, config))
      }
      if (callerSignal) {
        if (callerSignal.aborted) { onAbort(); return }
        callerSignal.addEventListener('abort', onAbort, { once: true })
      }
      shared.promise.then(
        (res) => {
          if (settled) return
          settled = true; finish(); shared.refs -= 1
          resolve(leader ? res : { ...res, config, data: cloneData(res.data) })
        },
        (err) => {
          if (settled) return
          settled = true; finish(); shared.refs -= 1
          if (leader || !(err instanceof AxiosError)) { reject(err); return }
          // Each follower gets its OWN error + config so interceptors that tag the
          // config (e.g. the 401 refresh flow's `_retry`) cannot interfere across callers.
          const response = err.response ? { ...err.response, config, data: cloneData(err.response.data) } : undefined
          const copy = new AxiosError(err.message, err.code, config, err.request, response as AxiosResponse | undefined)
          reject(copy)
        },
      )
    })
  }) as AxiosAdapter & { inflightCount: () => number }

  adapter.inflightCount = () => inflight.size
  return adapter
}
