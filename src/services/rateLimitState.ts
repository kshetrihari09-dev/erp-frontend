/**
 * rateLimitState.ts — shared "the server told us to back off" memory.
 *
 * The backend's general limiter (erp-unified-backend/src/middleware/security.js)
 * is one bucket per client IP shared by EVERY API route, so a 429 on any
 * request means the whole bucket is empty until the window resets — not just
 * that one endpoint. http.ts records the Retry-After of every 429 here, and
 * background pollers (services/reminderAlertPoller.ts) consult it before
 * sending their next request instead of adding load to an exhausted bucket.
 *
 * Pure module (no axios / store imports) so it is trivially testable.
 */

/** Used when a 429 arrives without a readable Retry-After header. */
export const DEFAULT_RETRY_AFTER_MS = 60_000
/** Never trust a server value larger than this (the limiter window is 15 min). */
export const MAX_RETRY_AFTER_MS = 20 * 60_000

let rateLimitedUntil = 0

/** Reads a header from either a plain object or an AxiosHeaders instance, case-insensitively. */
export function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined
  const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>
  if (typeof h.get === 'function') {
    const v = h.get(name)
    if (v != null) return String(v)
  }
  const lower = name.toLowerCase()
  for (const key of Object.keys(h)) {
    if (key.toLowerCase() === lower && h[key] != null) return String(h[key])
  }
  return undefined
}

/**
 * Parses a Retry-After value — either delta-seconds ("120") or an HTTP-date.
 * Returns milliseconds from `now`, or null when absent/unparseable.
 */
export function parseRetryAfterMs(value: unknown, now: number = Date.now()): number | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Math.min(Math.max(0, Math.round(Number(text) * 1000)), MAX_RETRY_AFTER_MS)
  }
  const at = Date.parse(text)
  if (Number.isNaN(at)) return null
  return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS)
}

/** Record a 429. `retryAfterMs` null → DEFAULT_RETRY_AFTER_MS. Returns the delay recorded. */
export function noteRateLimited(retryAfterMs: number | null, now: number = Date.now()): number {
  const delay = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS
  rateLimitedUntil = Math.max(rateLimitedUntil, now + delay)
  return delay
}

export function getRateLimitedUntil(): number {
  return rateLimitedUntil
}

export function resetRateLimitState(): void {
  rateLimitedUntil = 0
}
