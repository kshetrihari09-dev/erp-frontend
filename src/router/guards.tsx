import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore, { RAW_TOKEN_KEY } from '@/store/authStore'
import { authAPI } from '@/services/api'
import { PATHS } from '@/constants'
import { canOpenPath, landingPathFor } from '@/constants/permissions'
import AccessDenied from '@/components/shared/AccessDenied'
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

  // A request was refused as "permission denied": the role may have changed on the server since this page loaded.
  // Re-read /auth/me so the menu and routes follow the database immediately (not at the next login).
  useEffect(() => {
    let busy = false
    const resync = () => {
      if (busy) return; busy = true
      authAPI.me().then((res) => { updateUser(res.data.data.user) }).catch((err) => {
        const st = err?.response?.status
        if (st === 401 || st === 403) { logout() }            // disabled / removed from company → signed out
      }).finally(() => { busy = false })
    }
    window.addEventListener('auth:permissions-stale', resync)
    return () => window.removeEventListener('auth:permissions-stale', resync)
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

// ─── Permission guard ─────────────────────────────────────────────────────────
// Opens when the signed-in user's server-provided permission list contains ANY of `permissions` (or ALL, with all).
// This is UX protection only — the API enforces the same permissions independently.
export function RequirePermission({
  children, permissions, all = false, fallback,
}: { children: React.ReactNode; permissions: string[]; all?: boolean; fallback?: React.ReactNode }) {
  const list = useAuthStore((s) => s.user?.permissions)
  const ok = !!list && (all ? permissions.every((p) => list.includes(p)) : permissions.some((p) => list.includes(p)))
  if (!ok) return <>{fallback ?? <AccessDenied homeTo={landingPathFor(list)} />}</>
  return <>{children}</>
}

// ─── Route guard ──────────────────────────────────────────────────────────────
// Looks the module's required permission up in ROUTE_PERMISSIONS (the same table the sidebar uses). A route that is not in
// the table is DENIED — a new page cannot go live unprotected by accident.
export function RequireRoute({ to, children }: { to: string; children: React.ReactNode }) {
  const list = useAuthStore((s) => s.user?.permissions)
  if (!canOpenPath(list, to)) return <AccessDenied homeTo={landingPathFor(list)} />
  return <>{children}</>
}

// "/" → the first module this user may open (a cashier does not have a dashboard-only world, a viewer lands on what they can read)
export function HomeRedirect() {
  const list = useAuthStore((s) => s.user?.permissions)
  const to = landingPathFor(list)
  if (!to) return <AccessDenied title="No modules assigned" message="Your account has no permissions yet. Ask an administrator to assign you a role." />
  return <Navigate to={to} replace />
}

// ─── Role guard ───────────────────────────────────────────────────────────────
// For the few operations that are defined by ROLE rather than permission. Exact match against the user's role from the
// server: no implicit owner/admin pass, and never "has an unrelated permission with the same name" (both were bugs).
export function RequireRole({
  children, roles, fallback,
}: { children: React.ReactNode; roles: string[]; fallback?: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role)
  if (!role || !roles.includes(role)) return <>{fallback ?? <AccessDenied />}</>
  return <>{children}</>
}
