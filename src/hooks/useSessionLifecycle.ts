/**
 * useSessionLifecycle.ts — tells the server when this run of the app is going away.
 *
 * On `pagehide` (tab or window closed, page reloaded or navigated away; NOT a tab switch or minimise — those fire
 * `visibilitychange`, not `pagehide`, so the session correctly survives them) the app sends the access token to
 * POST /auth/end-session, which revokes the session and its refresh tokens on the server.
 *
 * This is BEST EFFORT and deliberately not what the security rests on — browsers cannot guarantee a request on close. The
 * guarantee is structural: the session lives only in this run's memory and is bound server-side to this run's random app-instance
 * id, so a reopened app has nothing to restore and cannot use the old session even if it were still alive on the server. The
 * beacon just removes the orphan promptly instead of leaving it to expire by idle timeout.
 */
import { useEffect } from 'react'
import useAuthStore from '@/store/authStore'
import { config } from '@/config/env'
import { getEffectiveApiBaseUrl } from '@/config/serverConnection'

export function endSessionOnPageHide(e?: { persisted?: boolean }) {
  if (e?.persisted) return                                  // page is going into the back/forward cache, not closing
  const { token } = useAuthStore.getState()
  if (!token) return
  const url = `${getEffectiveApiBaseUrl(config.apiBaseUrl)}/auth/end-session`
  const body = JSON.stringify({ token })
  try {
    // keepalive lets the request outlive the page (needs no response, carries no cookies)
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {})
  } catch {
    try { navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' })) } catch { /* nothing more can be done */ }
  }
}

export function useSessionLifecycle() {
  useEffect(() => {
    const h = (e: PageTransitionEvent) => endSessionOnPageHide(e)
    window.addEventListener('pagehide', h)
    return () => window.removeEventListener('pagehide', h)
  }, [])
}
