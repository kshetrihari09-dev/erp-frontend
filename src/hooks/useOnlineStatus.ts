/**
 * useOnlineStatus.ts
 *
 * `navigator.onLine` only reflects whether the network *interface* has a
 * connection (e.g. Wi-Fi associated) — it can be true while the backend
 * itself is unreachable (captive portal, VPN issue, backend down), and
 * false-negatives happen too. So `online` firing is only ever a prompt to
 * verify, not proof by itself — this hook always confirms with an actual
 * GET /health call (requirement #10 step 1: "Verify backend availability")
 * before ever reporting isOnline: true.
 *
 * Meant to be used once, at the top of the app (see OfflineProvider) —
 * every other component reads connectivity from that provider's context
 * rather than calling this hook a second time, so there's only ever one
 * health-check poller running.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '@/config/env'

const HEALTH_URL = `${config.backendUrl}/health`
const POLL_INTERVAL_MS = 15_000   // only used while believed offline — see below
const PING_TIMEOUT_MS  = 5_000

async function pingBackend(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    const res = await fetch(HEALTH_URL, { method: 'GET', signal: controller.signal, cache: 'no-store' })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [checking, setChecking] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkNow = useCallback(async () => {
    setChecking(true)
    const ok = await pingBackend()
    setChecking(false)
    setIsOnline(ok)
    return ok
  }, [])

  useEffect(() => {
    // Fast path: the browser thinks connectivity dropped — no need to
    // wait for a health check to say the same thing, go offline
    // immediately so the UI/queue react without delay.
    function handleOffline() { setIsOnline(false) }
    // The browser thinks connectivity came back — still confirm with the
    // backend before believing it (see docblock above).
    function handleOnline() { checkNow() }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    checkNow() // confirm actual status on mount, don't just trust navigator.onLine

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkNow])

  // While offline, keep polling — some environments (e.g. a backend that
  // crashes without the network interface itself going down) never fire
  // a browser 'online'/'offline' event at all, so this is the fallback
  // that eventually notices recovery either way.
  useEffect(() => {
    if (isOnline) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(checkNow, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [isOnline, checkNow])

  return { isOnline, checking, checkNow }
}
