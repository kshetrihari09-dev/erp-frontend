import { QueryClient } from '@tanstack/react-query'

/**
 * RETRY POLICY for react-query reads (mutations never auto-retry — see below).
 *
 *   never retried    4xx (incl. 429 — the server asked us to slow down; the cooldown gate in
 *                    services/requestGuard.ts holds later reads back), cancellations, our own
 *                    client cooldown rejection, and 500 (a deterministic server bug that will
 *                    fail identically)
 *   retried, bounded network errors (no response: offline, DNS, timeout) and 502 / 503 / 504 / 408,
 *                    at most QUERY_MAX_RETRIES times
 *   delay            exponential (1s, 2s, 4s … capped at 15s) with jitter (50–100 % of the step), so
 *                    many clients/queries that failed together do not retry in lock-step (retry storm).
 *                    A server-supplied Retry-After (e.g. on a 503) is honoured as a floor.
 */
export const QUERY_MAX_RETRIES = 2
export const RETRY_BASE_DELAY_MS = 1_000
export const RETRY_MAX_DELAY_MS = 15_000
const RETRYABLE_STATUS = new Set([408, 502, 503, 504])
const NO_RETRY_AXIOS_CODES = new Set(['ERR_CANCELED', 'ERR_RATE_LIMIT_COOLDOWN', 'ERR_BAD_REQUEST'])

interface NormalizedError {
  status?: number
  retryAfterMs?: number | null
  original?: { isAxiosError?: boolean; code?: string; response?: unknown; name?: string }
}

/** True for a failed request that never got an HTTP response (offline, DNS, timeout, reset). */
export function isNetworkError(error: unknown): boolean {
  const o = (error as NormalizedError | null)?.original
  if (!o || !o.isAxiosError) return false
  if (o.response) return false
  if (o.code && NO_RETRY_AXIOS_CODES.has(o.code)) return false
  if (o.name === 'CanceledError') return false
  return true
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_MAX_RETRIES) return false
  const status = (error as NormalizedError | null)?.status
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status)
  return isNetworkError(error)
}

/** `random` is injectable for deterministic tests. */
export function retryDelayMs(failureCount: number, error?: unknown, random: () => number = Math.random): number {
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failureCount))
  const jittered = Math.round(exp * (0.5 + random() * 0.5))
  const serverFloor = (error as NormalizedError | null)?.retryAfterMs
  return typeof serverFloor === 'number' && serverFloor > 0 ? Math.max(jittered, Math.min(serverFloor, 60_000)) : jittered
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 2,   // 2 min: read-mostly data is not refetched on every mount
      gcTime:             1000 * 60 * 10,  // 10 min
      retry:              shouldRetryQuery,
      retryDelay:         (attempt, error) => retryDelayMs(attempt, error),
      refetchOnWindowFocus: false,
      // refetchIntervalInBackground defaults to false: interval polling pauses while the tab is hidden.
    },
    mutations: {
      // Never auto-retry writes (invoices, payments, stock): a retried POST can double-post.
      // Offline sales are re-sent by offline/syncEngine.ts, which carries an idempotency key.
      retry: 0,
    },
  },
})
