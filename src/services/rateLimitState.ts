/**
 * rateLimitState.ts — shared "the server told us to back off" memory.
 *
 * WHICH 429 IS THIS?  A 429 can come from four places and they must not be
 * treated alike (see erp-unified-backend/docs/RATE_LIMITING.md):
 *
 *   X-RateLimit-Source   kind          meaning                                   cooldown?
 *   ------------------   -----------   ---------------------------------------   ---------
 *   app-limiter          'limiter'     a traffic limiter in the backend          yes
 *   nginx                'proxy'       nginx limit_req in front of the backend   yes (global)
 *   (absent)             'unknown'     hosting platform / CDN / upstream         yes (global)
 *   application          'application' business rule (PIN lockout, OTP quota) — NOT traffic: no cooldown
 *   client               'client'      our own cooldown gate (requestGuard.ts)   no (already cooling down)
 *
 * SCOPE.  Baseline limiters (user / company / ip) throttle EVERY endpoint, so
 * they set the *global* cooldown that background pollers honour. Specialised
 * limiters (auth_*, reports, scanner, ocr_upload, heavy_ops) only throttle their
 * own route family, so they set a *scoped* cooldown: a rate-limited report must
 * not freeze the notification poller, and a locked-out OTP form must not freeze
 * the dashboard.
 *
 * Pure module (no axios / store imports) so it is trivially testable.
 */

/** Used when a 429 arrives without a readable Retry-After header. */
export const DEFAULT_RETRY_AFTER_MS = 60_000
/** Never trust a server value larger than this (the longest limiter window, auth, is 15 min). */
export const MAX_RETRY_AFTER_MS = 20 * 60_000

export type RateLimitKind = 'limiter' | 'proxy' | 'unknown' | 'application' | 'client'
export type RateLimitScope = 'global' | 'auth' | 'reports' | 'scanner' | 'ocr' | 'heavy'

const GLOBAL_LIMITERS = new Set(['user', 'company', 'ip'])

let rateLimitedUntil = 0
const scopedUntil = new Map<RateLimitScope, number>()

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
export function noteRateLimited(
  retryAfterMs: number | null,
  now: number = Date.now(),
  scope: RateLimitScope = 'global',
): number {
  const delay = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS
  if (scope === 'global') {
    rateLimitedUntil = Math.max(rateLimitedUntil, now + delay)
  } else {
    scopedUntil.set(scope, Math.max(scopedUntil.get(scope) ?? 0, now + delay))
  }
  return delay
}

/** Global cooldown end (what background pollers honour). With a scope: the later of global and that scope. */
export function getRateLimitedUntil(scope: RateLimitScope = 'global'): number {
  return scope === 'global' ? rateLimitedUntil : Math.max(rateLimitedUntil, scopedUntil.get(scope) ?? 0)
}

export function resetRateLimitState(): void {
  rateLimitedUntil = 0
  scopedUntil.clear()
}

/**
 * Decides what produced a 429 from its headers + (optional) JSON body.
 * Only the explicit markers set by the backend / nginx are trusted; anything
 * unmarked is treated as an infrastructure 429 (platform, CDN, upstream).
 */
export function classifyRateLimit(headers: unknown, body: unknown): { kind: RateLimitKind; limiter: string | null; code: string | null } {
  const source = readHeader(headers, 'x-ratelimit-source')?.toLowerCase() ?? null
  const limiterHeader = readHeader(headers, 'x-ratelimit-limiter')?.toLowerCase() ?? null
  const b = (body && typeof body === 'object' ? body : {}) as { code?: unknown; limiter?: unknown }
  const code = typeof b.code === 'string' ? b.code : null
  const limiter = limiterHeader ?? (typeof b.limiter === 'string' ? b.limiter.toLowerCase() : null)

  if (source === 'client' || code === 'CLIENT_RATE_LIMIT_COOLDOWN') return { kind: 'client', limiter, code }
  if (source === 'application') return { kind: 'application', limiter: null, code }
  if (source === 'nginx') return { kind: 'proxy', limiter: 'nginx', code }
  if (source === 'app-limiter' || code === 'RATE_LIMITED' || limiterHeader) return { kind: 'limiter', limiter, code }
  // A coded 429 with no limiter marker is an application rule from a backend that predates the marker headers.
  if (code) return { kind: 'application', limiter: null, code }
  return { kind: 'unknown', limiter: null, code: null }
}

/** Which cooldown scope a limiter name throttles. Baseline limiters, nginx and unknown sources are global. */
export function scopeForLimiter(limiter: string | null): RateLimitScope {
  if (!limiter || GLOBAL_LIMITERS.has(limiter) || limiter === 'nginx') return 'global'
  if (limiter.startsWith('auth') || limiter === 'otp_send') return 'auth'
  if (limiter === 'reports') return 'reports'
  if (limiter === 'scanner') return 'scanner'
  if (limiter === 'ocr_upload') return 'ocr'
  if (limiter === 'heavy_ops') return 'heavy'
  return 'global'
}

/** Which scoped cooldown (if any) a request URL belongs to, so a GET can be held back locally. */
export function scopeForUrl(url: string | undefined): RateLimitScope | null {
  const path = String(url ?? '').split('?')[0]
  if (/(^|\/)(reports|stock-register)(\/|$)/.test(path)) return 'reports'
  if (/(^|\/)scanner(\/|$)/.test(path)) return 'scanner'
  if (/(^|\/)purchase-scans(\/|$)/.test(path)) return 'ocr'
  if (/(^|\/)settings\/backup(\/|$)/.test(path)) return 'heavy'
  if (/(^|\/)auth(\/|$)/.test(path)) return 'auth'
  return null
}

/** Milliseconds left of the cooldown that applies to a request URL (0 = free to send). */
export function cooldownRemainingMs(url: string | undefined, now: number = Date.now()): number {
  const scope = scopeForUrl(url)
  const until = Math.max(rateLimitedUntil, scope ? scopedUntil.get(scope) ?? 0 : 0)
  return Math.max(0, until - now)
}
