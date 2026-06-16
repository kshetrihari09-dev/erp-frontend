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
import { RAW_TOKEN_KEY, REFRESH_TOKEN_KEY as AUTH_REFRESH_KEY } from '@/store/authStore'

// REFRESH_TOKEN_KEY is exported from authStore.ts
export { AUTH_REFRESH_KEY as REFRESH_TOKEN_KEY }

// ─── Axios instance ────────────────────────────────────────────────────────────
const http = axios.create({
  baseURL: config.apiBaseUrl,     // ← reads from VITE_API_BASE_URL, never hardcoded
  timeout: config.apiTimeout,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// ─── Token refresh state ───────────────────────────────────────────────────────
let isRefreshing       = false
let refreshSubscribers: Array<(token: string) => void> = []

function onRefreshDone(token: string) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

function clearAuthAndRedirect() {
  localStorage.removeItem(RAW_TOKEN_KEY)
  localStorage.removeItem(AUTH_REFRESH_KEY)
  localStorage.removeItem('erp_auth_state')
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

// ─── Request interceptor — attach JWT ─────────────────────────────────────────
http.interceptors.request.use(
  (config_: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(RAW_TOKEN_KEY)

    if (token && token !== 'null' && token !== 'undefined' && token.includes('.')) {
      config_.headers.Authorization = `Bearer ${token}`
    }

    if (config.enableApiLogs) {
      console.debug(
        `[API →] ${config_.method?.toUpperCase()} ${config_.url}`,
        config_.data || ''
      )
    }

    return config_
  },
  (error) => Promise.reject(error)
)

// ─── Response interceptor — handle errors + token refresh ─────────────────────
http.interceptors.response.use(
  (response: AxiosResponse) => {
    if (config.enableApiLogs) {
      console.debug(`[API ✓] ${response.status}`, response.config.url)
    }
    return response
  },
  async (error: AxiosError<{ message?: string; code?: string; errors?: Record<string, string[]> }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const status          = error.response?.status
    const rawMessage      = error.response?.data?.message || error.message || 'Network error'
    const errors          = (error.response?.data as any)?.errors || null

    if (config.enableApiLogs || config.isDev) {
      console.error(`[API ✗] ${status || 'NET'}:`, rawMessage, error.config?.url)
    }

    // ── 401: attempt silent token refresh ──────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem(AUTH_REFRESH_KEY)

      if (!refreshToken) {
        clearAuthAndRedirect()
        return Promise.reject({ message: rawMessage, status, errors, original: error })
      }

      if (isRefreshing) {
        return new Promise(resolve => {
          refreshSubscribers.push(newToken => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(http(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res      = await axios.post(`${config.apiBaseUrl}/auth/refresh`, { refresh_token: refreshToken })
        const newToken = res.data?.data?.token
        if (!newToken) throw new Error('No token in refresh response')
        localStorage.setItem(RAW_TOKEN_KEY, newToken)
        localStorage.setItem(AUTH_REFRESH_KEY, refreshToken!)
        onRefreshDone(newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return http(originalRequest)
      } catch {
        clearAuthAndRedirect()
        return Promise.reject({ message: 'Session expired. Please log in again.', status: 401, errors: null, original: error })
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject({ message: rawMessage, status, errors, original: error })
  }
)

export default http
