import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import useAuthStore, { RAW_TOKEN_KEY } from '@/store/authStore'
import { authAPI } from '@/services/api'
import { PATHS } from '@/constants'
import { isNetworkError } from '@/offline/syncEngine'

// ─── Auth guard — validates session on mount via /auth/me ─────────────────────
// Prevents 401 redirect loop after page refresh:
// Zustand rehydrates isAuthenticated=true but the token in the Bearer header
// must be validated against the backend before trusting it.
//
// OFFLINE-FIRST (requirement #11 — refresh/close-reopen must survive an
// internet outage; requirement #14 — offline access is for a device/user
// that already authenticated online before, not a live check every load):
// a rejection from /auth/me is only trusted as "log this person out" when
// the server actually responded and said so (401/403 — a real, expired,
// or revoked token). If the request fails because there's no network at
// all, that's not evidence the session is invalid — it's evidence we
// can't ask right now. In that case, fall back to trusting the token +
// user/company zustand already rehydrated from localStorage (the same
// persisted state requirement #11 relies on), so a refresh while offline
// lands back on the billing screen instead of a login page the person
// has no way to submit anyway.
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout, updateUser, setCompany, user, company } = useAuthStore()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [valid,    setValid]    = useState(false)

  useEffect(() => {
    const rawToken = localStorage.getItem(RAW_TOKEN_KEY)

    // No token at all → redirect immediately
    if (!rawToken || rawToken === 'null' || rawToken === 'undefined') {
      setChecking(false)
      setValid(false)
      return
    }

    // Validate with /auth/me
    authAPI.me()
      .then((res) => {
        const { user, company } = res.data.data
        updateUser(user)
        if (company) setCompany(company)
        setValid(true)
      })
      .catch((err) => {
        if (isNetworkError(err) && isAuthenticated && user && company) {
          // Couldn't reach the server to confirm — not the same thing as
          // the server confirming the session is invalid. Trust the
          // already-persisted session (this is exactly what lets offline
          // billing keep working across a refresh) rather than logging
          // out over a connectivity problem.
          setValid(true)
          return
        }
        // A real response came back and said no (or there's simply no
        // usable persisted session to fall back to) — this IS a genuine
        // "not logged in," log out for real.
        logout()
        setValid(false)
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="page-loader">
        <div>
          <div className="page-loader-ring"/>
          <p className="page-loader-text">Verifying session…</p>
        </div>
      </div>
    )
  }

  if (!valid) {
    return <Navigate to={PATHS.LOGIN} state={{ from: location }} replace />
  }

  return <>{children}</>
}

// ─── Guest guard ──────────────────────────────────────────────────────────────
export function RequireGuest({ children }: { children: React.ReactNode }) {
  const rawToken      = localStorage.getItem(RAW_TOKEN_KEY)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (rawToken && rawToken !== 'null' && isAuthenticated) {
    return <Navigate to={PATHS.DASHBOARD} replace />
  }
  return <>{children}</>
}

// ─── Role guard ───────────────────────────────────────────────────────────────
export function RequireRole({
  children, roles, fallback,
}: {
  children: React.ReactNode
  roles: string[]
  fallback?: React.ReactNode
}) {
  const role = useAuthStore((s) => s.user?.role)
  const can  = useAuthStore((s) => s.can)

  const allowed = role === 'owner' || role === 'admin' || roles.some((r) => {
    if (r.endsWith('.*')) return can(r.replace('.*', '.view'))
    return role === r || can(r)
  })

  if (!allowed) {
    return fallback ? <>{fallback}</> : (
      <div className="flex items-center justify-center h-64 text-[var(--text-3)]">
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--red-50)', color: 'var(--red)' }}
          >
            <ShieldAlert size={22}/>
          </div>
          <p className="font-semibold text-[var(--text-2)]">Access denied</p>
          <p className="text-sm mt-1">You don't have permission to view this page.</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
