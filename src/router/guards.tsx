import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '@/store/authStore'
import { authAPI } from '@/services/api'
import { PATHS } from '@/constants'
import { canOpenPath, landingPathFor } from '@/constants/permissions'
import AccessDenied from '@/components/shared/AccessDenied'
import { isNetworkError } from '@/offline/syncEngine'

// ── Auth guard ────────────────────────────────────────────────────────────────
// The session is held in memory only (store/authStore.ts): after a reload, or after the app was closed and reopened, there is
// NO token, so protected routes redirect to the login screen immediately — nothing is restored from browser storage and no
// protected page renders (or flashes) before account login + Role ID / Role Password verification has succeeded in THIS run.
//
// While the app keeps running (tab switch, minimise, navigation) the session is re-validated against the server once when a
// protected area mounts (/auth/me), and the HTTP client signs the user out the moment the server says the session is over
// (revoked, expired, another app instance, role disabled). A request that merely fails for lack of a network does not end the
// session: the app is still running with a session the server verified, so billing can continue through an outage. (A restart
// during an outage cannot sign in — role verification needs the server — by design.)
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { logout, updateUser, setCompany, user, company } = useAuthStore()
  const location = useLocation()
  // No in-memory session → decided synchronously (no loader, no flash of protected content).
  const [checking, setChecking] = useState(!!token)
  const [valid,    setValid]    = useState(false)

  useEffect(() => {
    if (!token) { setChecking(false); setValid(false); return }

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
          // Could not reach the server — that is not the server saying the session is invalid. The session was verified in
          // this run, so keep it (this is what lets offline billing continue in a running app).
          setValid(true)
          return
        }
        // The server answered and said no: this IS "not signed in".
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

  // Signed out anywhere (logout button, revoked session, 401) → protected pages disappear at once. This also makes the browser's
  // Back button useless after sign-out: every protected route re-evaluates this and returns to the login screen.
  if (!token || !isAuthenticated) {
    return <Navigate to={PATHS.LOGIN} state={{ from: location }} replace />
  }

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

// ── Guest guard ───────────────────────────────────────────────────────────────
export function RequireGuest({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (token && isAuthenticated) {
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
