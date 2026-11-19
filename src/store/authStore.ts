/**
 * authStore.ts — the signed-in session, held IN MEMORY ONLY.
 *
 * Security policy (mandatory role verification every time the app is opened):
 *   - Nothing that grants access is ever written to localStorage / sessionStorage / cookies / IndexedDB: not the access token,
 *     not the refresh token, not the user, company or role. Reloading the page or closing and reopening the app therefore
 *     always lands on the login screen and requires account login + Role ID / Role Password again.
 *   - Whatever an older version of the app left in storage is deleted at startup (purgeLegacyAuthStorage) and is never read.
 *   - The server enforces the same rule independently: sessions are bound to the per-start app instance (services/appInstance.ts)
 *     and refuse any other instance, so a token that somehow survived could not be used anyway.
 *   - Temporarily switching tabs or minimising keeps the session — the app is still running and the server-side session valid.
 *
 * The role / permissions here are only what the server returned for the session; they gate the UI, never the API
 * (the server re-checks the verified role on every request).
 */
import { create } from 'zustand'
import type { User, Company, UserRole } from '@/types'
import { clearStepUpToken } from '@/services/stepUpToken'

/** Keys older versions persisted. Removed at startup; never read. */
export const LEGACY_AUTH_STORAGE_KEYS = ['erp_auth_state', 'erp_raw_token', 'erp_refresh_token'] as const

export function purgeLegacyAuthStorage() {
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    try { if (store) LEGACY_AUTH_STORAGE_KEYS.forEach(k => store.removeItem(k)) } catch { /* storage unavailable */ }
  }
}
// Startup: clear stale authentication state before anything can render or read it.
purgeLegacyAuthStorage()

/** Name of the service worker's runtime cache of authenticated GET responses (vite.config.ts). It is keyed by URL, not by user
 *  or company, so it is emptied whenever the signed-in identity changes or ends — one session's data never serves the next. */
export const API_RESPONSE_CACHE = 'zerthix-api-get-cache'
export function clearApiResponseCache() {
  try { if (typeof caches !== 'undefined') void caches.delete(API_RESPONSE_CACHE).catch(() => {}) } catch { /* no Cache API */ }
}

interface SessionPayload { token: string; refreshToken?: string | null; user: User; company: Company }

interface AuthState {
  token:           string | null
  refreshToken:    string | null
  user:            User | null
  company:         Company | null
  isAuthenticated: boolean
  /** Bumps when the whole signed-in UI must be rebuilt from scratch (company switch) — see app/Router.tsx. */
  sessionEpoch:    number

  setAuth:        (p: SessionPayload) => void
  /** Replace the session with another company's (company switch): new tokens AND a fresh UI tree, with no page load. */
  replaceSession: (p: SessionPayload) => void
  setTokens:      (t: { token: string; refreshToken?: string | null }) => void
  setCompany:     (company: Company) => void
  updateUser:     (partial: Partial<User>) => void
  logout:         () => void
  can:            (permission: string) => boolean
  canAny:         (...permissions: string[]) => boolean
  hasRole:        (role: UserRole | UserRole[]) => boolean
}

const EMPTY = { token: null, refreshToken: null, user: null, company: null, isAuthenticated: false }

const useAuthStore = create<AuthState>()((set, get) => ({
  ...EMPTY,
  sessionEpoch: 0,

  setAuth: ({ token, refreshToken, user, company }) => {
    clearApiResponseCache()                  // a new sign-in never sees the previous session's cached responses
    set({ token, refreshToken: refreshToken ?? null, user, company, isAuthenticated: true })
  },

  replaceSession: ({ token, refreshToken, user, company }) => {
    clearApiResponseCache()                  // cached responses belong to the previous company
    set(s => ({ token, refreshToken: refreshToken ?? null, user, company, isAuthenticated: true, sessionEpoch: s.sessionEpoch + 1 }))
  },

  setTokens: ({ token, refreshToken }) =>
    set(s => ({ token, refreshToken: refreshToken === undefined ? s.refreshToken : refreshToken })),

  setCompany: (company) => set({ company }),
  updateUser: (partial) => set(s => ({ user: s.user ? { ...s.user, ...partial } : s.user })),

  logout: () => {
    clearStepUpToken()                       // a step-up token must never outlive the session it was issued for
    purgeLegacyAuthStorage()
    clearApiResponseCache()
    set({ ...EMPTY })
  },

  // The signed-in user's effective permissions come from the SERVER (login / verify-role / /auth/me): role defaults + per-user
  // switches, computed from the database. Exact match only — no local role table and no wildcard matching; no list → nothing allowed.
  can: (permission: string) => !!get().user?.permissions?.includes(permission),
  canAny: (...permissions: string[]) => {
    const list = get().user?.permissions
    return !!list && permissions.some((p) => list.includes(p))
  },
  hasRole: (role) => {
    const r = get().user?.role
    if (!r) return false
    return Array.isArray(role) ? role.includes(r) : r === role
  },
}))

export default useAuthStore
