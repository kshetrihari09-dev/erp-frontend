/**
 * http.ts — Centralized Axios instance
 *
 * Reads API base URL from config (which reads from env vars).
 * Works in both dev (localhost:5000) and prod (Render URL) automatically.
 * No manual switching required — set VITE_API_BASE_URL in the env file.
 */
import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { config }      from '@/config/env'
import { getEffectiveApiBaseUrl } from '@/config/serverConnection'
import { RAW_TOKEN_KEY, REFRESH_TOKEN_KEY as AUTH_REFRESH_KEY } from '@/store/authStore'
import { getValidStepUpToken, clearStepUpToken } from './stepUpToken'
import useUIStore from '@/store/uiStore'
import { noteRateLimited, parseRetryAfterMs, readHeader, classifyRateLimit, scopeForLimiter } from './rateLimitState'
import { createRequestGuard } from './requestGuard'

// REFRESH_TOKEN_KEY is exported from authStore.ts
export { AUTH_REFRESH_KEY as REFRESH_TOKEN_KEY }

// ─── Axios instance ────────────────────────────────────────────────────────────
const http = axios.create({
  baseURL: config.apiBaseUrl,     // ← reads from VITE_API_BASE_URL, never hardcoded
  timeout: config.apiTimeout,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// Cooldown gate + in-flight GET dedupe + per-caller cancellation (see requestGuard.ts).
// Must wrap axios' real adapter, so it is installed once right after creation.
http.defaults.adapter = createRequestGuard({ base: axios.getAdapter(http.defaults.adapter) })

// ─── Token refresh state ───────────────────────────────────────────────────────
// Requests that hit a 401 while a refresh is already running wait here. They are
// settled on BOTH outcomes — previously a failed refresh left them pending forever.
let isRefreshing       = false
let refreshSubscribers: Array<{ ok: (token: string) => void; fail: (err: unknown) => void }> = []

function onRefreshDone(token: string) {
  refreshSubscribers.forEach(s => s.ok(token))
  refreshSubscribers = []
}
function onRefreshFailed(err: unknown) {
  refreshSubscribers.forEach(s => s.fail(err))
  refreshSubscribers = []
}

// ─── 429 handling ───────────────────────────────────────────────────────────
// One toast per cooldown window, not one per rejected request — a burst of
// 429s (e.g. several queries firing around the same time) would otherwise
// stack a toast per request, which reads as the app spamming itself and
// does nothing to help the person understand what happened. This never
// retries the request itself; the caller's own error handling (or, for a
// query, react-query's shouldRetryQuery in app/queryClient.ts, which
// already treats 429 as non-retryable) decides what happens next.
const RATE_LIMIT_TOAST_COOLDOWN_MS = 10_000
let lastRateLimitToastAt = 0

function notifyRateLimited(waitMs: number | null) {
  const now = Date.now()
  if (now - lastRateLimitToastAt < RATE_LIMIT_TOAST_COOLDOWN_MS) return
  lastRateLimitToastAt = now
  const secs = waitMs && waitMs > 0 ? Math.ceil(waitMs / 1000) : null
  useUIStore.getState().warning(
    'Too many requests',
    secs
      ? `Please wait ${secs >= 90 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`} and try again.`
      : 'Please wait a moment and try again.',
  )
}

function clearAuthAndRedirect() {
  localStorage.removeItem(RAW_TOKEN_KEY)
  localStorage.removeItem(AUTH_REFRESH_KEY)
  localStorage.removeItem('erp_auth_state')
  clearStepUpToken()
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

// ─── Request interceptor — attach JWT ─────────────────────────────────────────
http.interceptors.request.use(
  (config_: InternalAxiosRequestConfig) => {
    // LAN-mode builds resolve their backend at runtime (see
    // config/serverConnection.ts + modules/connect/) — everywhere else
    // this is just config.apiBaseUrl, exactly as before. Per-request
    // rather than baked into the axios instance so pairing a new server
    // mid-session (Settings → Change Server) takes effect immediately
    // without needing to reload the app.
    config_.baseURL = getEffectiveApiBaseUrl(config.apiBaseUrl)

    const token = localStorage.getItem(RAW_TOKEN_KEY)

    if (token && token !== 'null' && token !== 'undefined' && token.includes('.')) {
      config_.headers.Authorization = `Bearer ${token}`
    }

    // Step-up token — see services/stepUpToken.ts. In-memory only (never
    // localStorage), and simply absent/expired most of the time, in which
    // case this is a no-op and sensitive endpoints fall back to prompting.
    const stepUpToken = getValidStepUpToken()
    if (stepUpToken) {
      config_.headers['X-Step-Up-Token'] = stepUpToken
    }

    if (config.enableApiLogs) {
      console.debug(
        `[API →] ${config_.method?.toUpperCase()} ${config_.url}`,
        config_.data || ''
      )
    }

    return config_
  },
  (error) => Promise.reject(error),
  // `synchronous` makes axios dispatch the request in the SAME tick as the http.get()
  // call, which is what lets requestSignal.ts attach the caller's AbortSignal.
  // (Every request interceptor must be synchronous for this to hold.)
  { synchronous: true },
)

// ─── Response interceptor — handle errors + token refresh ─────────────────────
http.interceptors.response.use(
  (response: AxiosResponse) => {
    if (config.enableApiLogs) {
      console.debug(`[API ✓] ${response.status}`, response.config.url)
    }
    return response
  },
  async (error: AxiosError<{ message?: string; code?: string; errors?: Record<string, string[]>; retryable?: boolean }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const status          = error.response?.status
    const rawMessage      = error.response?.data?.message || error.message || 'Network error'
    const errors          = (error.response?.data as any)?.errors || null
    // `code` / `retryable` are optional machine-readable fields some routes
    // attach (see erp-unified-backend routes/sales.js) to distinguish a
    // structural rejection that will fail identically on every retry (e.g.
    // a locked accounting period) from an ordinary one — offline/syncEngine.ts
    // uses `retryable` to stop backing off on those instead of looping forever.
    const code            = (error.response?.data as any)?.code ?? null
    const retryable       = (error.response?.data as any)?.retryable

    if (config.enableApiLogs || config.isDev) {
      console.error(`[API ✗] ${status || 'NET'}:`, rawMessage, error.config?.url)
    }

    // ── 429: classify WHO said it (rateLimitState.ts), then react accordingly ───
    //  - traffic limiter / nginx / unknown infra  → remember Retry-After so pollers and reads wait it out
    //  - application rule (PIN lockout, OTP quota) → NOT traffic: no cooldown, the caller shows its message
    //  - our own client gate                       → already cooling down: just surface it
    let retryAfterMs: number | null = null
    let rateLimitKind: string | null = null
    if (status === 429) {
      const body = error.response?.data
      const info = classifyRateLimit(error.response?.headers, body)
      rateLimitKind = info.kind
      retryAfterMs = parseRetryAfterMs(readHeader(error.response?.headers, 'retry-after'))
      if (info.kind === 'limiter' || info.kind === 'proxy' || info.kind === 'unknown') {
        // Needs `Retry-After` in the backend's CORS exposedHeaders (server.js) to be readable cross-origin.
        noteRateLimited(retryAfterMs, Date.now(), scopeForLimiter(info.limiter))
      }
      if (info.kind !== 'application') notifyRateLimited(retryAfterMs)
    }

    // ── 401: attempt silent token refresh ──────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem(AUTH_REFRESH_KEY)

      if (!refreshToken) {
        clearAuthAndRedirect()
        return Promise.reject({ message: rawMessage, status, errors, original: error })
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            ok: newToken => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(http(originalRequest))
            },
            fail: reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res      = await axios.post(`${config.apiBaseUrl}/auth/refresh`, { refresh_token: refreshToken })
        const newToken        = res.data?.data?.token
        const newRefreshToken = res.data?.data?.refresh_token
        if (!newToken || !newRefreshToken) throw new Error('No token in refresh response')
        localStorage.setItem(RAW_TOKEN_KEY, newToken)
        // Refresh tokens now rotate server-side on every use — the old one
        // is revoked the instant this response comes back, so the client
        // MUST store the new one or the next refresh attempt will fail.
        localStorage.setItem(AUTH_REFRESH_KEY, newRefreshToken)
        onRefreshDone(newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return http(originalRequest)
      } catch (refreshErr) {
        // Only a REJECTED refresh token ends the session. A rate-limited (429), 5xx or
        // offline refresh says nothing about the token — logging the user out there turned
        // a brief throttle into a forced re-login.
        const refreshStatus = (refreshErr as AxiosError | undefined)?.response?.status
        const sessionIsDead = refreshStatus === 400 || refreshStatus === 401 || refreshStatus === 403 || refreshStatus === undefined && !(refreshErr as AxiosError | undefined)?.isAxiosError
        if (sessionIsDead) {
          clearAuthAndRedirect()
          const dead = { message: 'Session expired. Please log in again.', status: 401, errors: null, original: error }
          onRefreshFailed(dead)
          return Promise.reject(dead)
        }
        const transient = {
          message: (refreshErr as AxiosError<{ message?: string }>)?.response?.data?.message || 'Could not refresh your session. Please try again.',
          status: refreshStatus, errors: null, original: error,
        }
        onRefreshFailed(transient)
        return Promise.reject(transient)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject({ message: rawMessage, status, errors, code, retryable, retryAfterMs, rateLimitKind, original: error })
  }
)

export default http
