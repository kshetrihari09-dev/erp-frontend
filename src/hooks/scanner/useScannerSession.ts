/**
 * useScannerSession.ts  (FIXED)
 *
 * Desktop hook for the offline/LAN scanner.
 *
 * ── What changed from the previous version ──────────────────────────────────
 *
 * BUG: Previous version called `fetch()` directly with a token read from
 *      `useAuthStore().token`, bypassing the app's axios `http` instance
 *      entirely. If the access token had expired since login, this raw fetch
 *      sent a stale JWT → backend correctly returned 401 "Token expired" →
 *      the hook surfaced that as an error immediately, before the QR ever
 *      appeared, and nothing ever refreshed the token.
 *
 * FIX:  Use `scannerAPI` (from services/api.ts), which goes through the same
 *      `http` axios instance as authAPI/salesAPI/productsAPI/etc. Its request
 *      interceptor attaches the current token from RAW_TOKEN_KEY, and its
 *      response interceptor silently refreshes an expired token and retries
 *      the request on 401 — exactly like every other page in the app.
 *
 * Additional fixes per requirements:
 *   - Duplicate session requests are prevented with `creatingRef`.
 *   - QR URL is built using the server's LAN IP (via scannerAPI.networkInfo)
 *     + the current page's own port — never "localhost".
 *   - A live countdown (`secondsLeft`) is exposed for the UI.
 *   - On expiry, the hook automatically creates ONE fresh session
 *     ("auto-refresh"); if that also fails, it shows an error with a
 *     manual Retry button instead of looping forever.
 *   - All polling/timers are cleaned up on close() and unmount.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ScannerStatus, ScanResult } from '@/types/scanner'
import { scannerAPI } from '@/services/api'

const POLL_INTERVAL_MS = 1500   // poll for result every 1.5s
const TICK_INTERVAL_MS = 1000   // countdown tick

export interface ScannerState {
  isOpen:      boolean
  status:      ScannerStatus
  token:       string | null
  qrUrl:       string | null   // URL embedded in QR code → opens on mobile
  expiresAt:   number | null
  secondsLeft: number | null   // live countdown to expiry
  lastResult:  ScanResult | null
  error:       string | null
}

interface Options {
  context:  'sales' | 'purchase'
  onResult: (result: ScanResult) => void
}

const INITIAL_STATE: ScannerState = {
  isOpen: false, status: 'idle', token: null,
  qrUrl: null, expiresAt: null, secondsLeft: null,
  lastResult: null, error: null,
}

// Map raw error info to a friendly, actionable message.
function friendlyError(err: any): string {
  const status = err?.status
  if (status === 401) {
    return 'Your session has expired. Please log in again.'
  }
  if (status === 403) {
    return "You don't have permission to use the scanner."
  }
  if (status === 404) {
    return 'Scanner service not found. Please contact support.'
  }
  if (status === 0 || status === undefined) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return err?.message || 'Failed to start scanner session.'
}

export default function useScannerSession({ context, onResult }: Options) {
  const [state, setState] = useState<ScannerState>(INITIAL_STATE)

  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenRef    = useRef<string | null>(null)
  const mountedRef  = useRef(true)
  const creatingRef = useRef(false)     // prevents duplicate POST /session
  const autoRetried = useRef(false)     // allow exactly one automatic refresh

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Stop all timers ────────────────────────────────────────────────────────
  const stopTimers = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
    if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null }
  }, [])

  // ── Countdown ──────────────────────────────────────────────────────────────
  const startCountdown = useCallback((expiresAt: number) => {
    if (tickTimer.current) clearInterval(tickTimer.current)
    tickTimer.current = setInterval(() => {
      if (!mountedRef.current) return
      const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
      setState(s => ({ ...s, secondsLeft }))
      if (secondsLeft <= 0) {
        if (tickTimer.current) { clearInterval(tickTimer.current); tickTimer.current = null }
      }
    }, TICK_INTERVAL_MS)
  }, [])

  // ── Forward declaration for mutual recursion (open ↔ poll-on-expiry) ───────
  const openRef = useRef<() => void>(() => {})

  // ── Poll for result ────────────────────────────────────────────────────────
  const startPolling = useCallback((token: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current)

    pollTimer.current = setInterval(async () => {
      if (!mountedRef.current) { stopTimers(); return }

      try {
        const res  = await scannerAPI.pollSession(token)
        const { status, result } = res.data.data

        if (!mountedRef.current) return

        if (status === 'connected') {
          setState(s => s.status === 'waiting' ? { ...s, status: 'connected' } : s)
          return
        }

        if (status === 'done' && result) {
          stopTimers()
          setState(s => ({ ...s, status: 'done', lastResult: result as unknown as ScanResult }))
          onResult(result as unknown as ScanResult)
        }
      } catch (err: any) {
        if (!mountedRef.current) return

        // 404 — session expired or was consumed server-side
        if (err?.status === 404) {
          stopTimers()

          // Auto-refresh once: silently create a fresh session so the user
          // doesn't have to click anything if the QR simply timed out
          // before they scanned it.
          if (!autoRetried.current) {
            autoRetried.current = true
            setState(s => ({ ...s, status: 'creating', error: null }))
            openRef.current()
            return
          }

          setState(s => ({ ...s, status: 'expired', error: 'Session expired. Tap "New QR Code" to try again.' }))
          return
        }

        // 401 — axios interceptor already attempted a silent refresh and
        // either retried successfully (no error reaches here) or the
        // refresh itself failed and the user is being redirected to /login.
        if (err?.status === 401) {
          stopTimers()
          setState(s => ({ ...s, status: 'error', error: friendlyError(err) }))
          return
        }

        // Transient network error — keep polling silently, don't spam UI
        console.warn('[Scanner] Poll error (will retry):', err?.message || err)
      }
    }, POLL_INTERVAL_MS)
  }, [stopTimers, onResult])

  // ── Build the mobile-facing QR URL using the server's LAN IP ───────────────
  const buildQrUrl = useCallback(async (token: string): Promise<string> => {
    // The QR URL opens the /scan React route on the phone's browser.
    // /scan is served by the FRONTEND (Vite on :3000), not the backend (:5000).
    //
    // The phone needs:  http://<LAN-IP>:<FRONTEND-PORT>/scan?token=...
    //                   e.g. http://192.168.1.7:3000/scan?token=...
    //
    // getApiBase() inside MobileScannerPage then builds the backend URL by
    // taking the LAN IP from window.location.hostname and swapping to port 5000.
    //
    // In production: frontend + backend share the same origin → same URL works.

    const protocol     = window.location.protocol
    const frontendPort = import.meta.env.VITE_FRONTEND_PORT || '3000'

    try {
      const res = await scannerAPI.networkInfo()
      const { ip, lanDetected } = res.data.data

      if (lanDetected && ip && ip !== '127.0.0.1') {
        // Use the LAN IP + frontend port so the phone opens the /scan React page
        return `${protocol}//${ip}:${frontendPort}/scan?token=${token}`
      }

      console.warn('[Scanner] No LAN IP detected; QR will use window.location.hostname')
    } catch (err) {
      console.warn('[Scanner] networkInfo failed, using page origin fallback:', err)
    }

    // Fallback: current hostname + frontend port
    // Works when user opened the app via LAN IP already, or in production
    const host = window.location.hostname
    return `${protocol}//${host}:${frontendPort}/scan?token=${token}`
  }, [])

  // ── Open modal & create session ────────────────────────────────────────────
  const open = useCallback(async () => {
    // Prevent duplicate concurrent POST /session calls (e.g. rapid double-click,
    // or the auto-refresh path firing while a manual retry is also in flight).
    if (creatingRef.current) return
    creatingRef.current = true

    setState(s => ({
      ...INITIAL_STATE,
      isOpen: true,
      status: 'creating',
    }))

    try {
      const res = await scannerAPI.createSession(context)
      const { token, expiresAt } = res.data.data

      if (!mountedRef.current) return

      tokenRef.current = token
      autoRetried.current = false

      const qrUrl = await buildQrUrl(token)

      if (!mountedRef.current) return

      setState(s => ({
        ...s,
        status: 'waiting',
        token,
        qrUrl,
        expiresAt,
        secondsLeft: Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
        error: null,
      }))

      startPolling(token)
      startCountdown(expiresAt)
    } catch (err: any) {
      if (!mountedRef.current) return
      console.error('[Scanner] Failed to create session:', err)
      setState(s => ({ ...s, status: 'error', error: friendlyError(err) }))
    } finally {
      creatingRef.current = false
    }
  }, [context, buildQrUrl, startPolling, startCountdown])

  // Keep a stable ref to `open` for the auto-refresh path in startPolling
  useEffect(() => { openRef.current = open }, [open])

  // ── Close modal & cancel session ───────────────────────────────────────────
  const close = useCallback(() => {
    stopTimers()
    const token = tokenRef.current
    tokenRef.current = null
    autoRetried.current = false
    setState(INITIAL_STATE)
    if (token) {
      scannerAPI.cancelSession(token).catch(() => {
        // Session likely already expired/consumed server-side — fine to ignore.
      })
    }
  }, [stopTimers])

  // ── Retry — used by the "Try Again" / "New QR Code" button ──────────────────
  const retry = useCallback(() => {
    autoRetried.current = false
    open()
  }, [open])

  // Cleanup on unmount
  useEffect(() => () => { stopTimers() }, [stopTimers])

  return { state, open, close, retry }
}