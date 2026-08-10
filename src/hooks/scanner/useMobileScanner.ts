/**
 * useMobileScanner.ts
 *
 * Mobile-side hook for the offline/LAN scanner page.
 * No Socket.IO. Communicates with the same local backend via fetch.
 *
 * Lifecycle:
 *   1. GET /scanner/session/:token/ping   → verify session, get JWT + context
 *   2. Start camera
 *   3. Run @zxing/browser barcode scan loop (300ms interval)
 *   4. On match found → show list for user to pick
 *   5. POST /scanner/session/:token/result with selected productId
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const BARCODE_INTERVAL_MS = 300

export type ScanMode     = 'barcode' | 'idle'
export type MobileStatus = 'connecting' | 'ready' | 'scanning' | 'matches' | 'submitting' | 'done' | 'error'

export interface MobileProduct {
  id:            string
  item_code:     string
  name:          string
  generic_name?: string
  company_name?: string
  unit:          string
  sales_rate:    number
  purchase_rate: number
  current_stock: number
}

export interface MobileScannerState {
  status:      MobileStatus
  mode:        ScanMode
  context:     'sales' | 'purchase' | null
  matches:     MobileProduct[]
  error:       string | null
  flashOn:     boolean
  lastBarcode: string | null
  // Digital zoom — see useLocalScanner.ts / useProductCapture.ts for why
  // this isn't tied to MediaTrackConstraints.zoom (unreliable capability,
  // async-and-stuttery to apply). Always available here.
  zoomSupported: boolean
  zoomMin:       number
  zoomMax:       number
  zoomStep:      number
  zoom:          number
}

interface Options {
  token:   string
  apiBase: string   // http://192.168.1.10:5000/api/v1
}

const ZOOM_MIN = 1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.1

export default function useMobileScanner({ token, apiBase }: Options) {
  const [state, setState] = useState<MobileScannerState>({
    status: 'connecting', mode: 'idle', context: null, matches: [],
    error: null, flashOn: false, lastBarcode: null,
    zoomSupported: true, zoomMin: ZOOM_MIN, zoomMax: ZOOM_MAX, zoomStep: ZOOM_STEP, zoom: ZOOM_MIN,
  })

  const videoRef      = useRef<HTMLVideoElement | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const barcodeTimer  = useRef<ReturnType<typeof setInterval> | null>(null)
  const jwtRef        = useRef<string | null>(null)
  const mountedRef    = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const authFetch = useCallback((url: string, opts: RequestInit = {}) => {
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(jwtRef.current ? { Authorization: `Bearer ${jwtRef.current}` } : {}),
        ...(opts.headers || {}),
      },
    })
  }, [])

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
          // See useLocalScanner.ts — continuous autofocus is what makes
          // close-up barcodes reliably decodable in the first place.
          advanced: [{ focusMode: 'continuous' } as any],
        },
        audio: false,
      })
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      try {
        const track = stream.getVideoTracks()[0] as any
        if (track?.getCapabilities?.()?.focusMode?.includes?.('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
        }
      } catch {}
      setState(s => ({ ...s, zoom: ZOOM_MIN }))
      return true
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Camera access denied. Please allow camera and try again.' }))
      return false
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
  }, [])

  // ── Flash ──────────────────────────────────────────────────────────────────
  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0] as any
    if (!track?.getCapabilities?.()?.torch) return
    try {
      const next = !state.flashOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setState(s => ({ ...s, flashOn: next }))
    } catch {}
  }, [state.flashOn])

  const setZoom = useCallback((value: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
    setState(s => (s.zoom === clamped ? s : { ...s, zoom: clamped }))
  }, [])

  // Mirrors state.zoom for the barcode interval closure, which is created
  // once per session and must always read the *current* zoom.
  const zoomRef = useRef(ZOOM_MIN)
  useEffect(() => { zoomRef.current = state.zoom }, [state.zoom])

  // Exact copy of the message the backend returns for QR_ACCOUNT_MISMATCH —
  // see useLocalScanner.ts for the full rationale (same fetch pattern here,
  // just via raw fetch() + authFetch instead of axios).
  const QR_ACCOUNT_MISMATCH_MSG = 'This QR Code belongs to another account and cannot be used in the current account.'

  // ── Product search ─────────────────────────────────────────────────────────
  // fetch() doesn't throw on non-2xx like axios does, so the 403
  // QR_ACCOUNT_MISMATCH case is detected from the parsed body's `code`
  // field regardless of res.ok, and returned as a distinct sentinel rather
  // than folded into "no match" — see call site below.
  const searchBarcode = useCallback(async (code: string): Promise<MobileProduct[] | 'ACCOUNT_MISMATCH'> => {
    try {
      const res  = await authFetch(`${apiBase}/scanner/products/barcode/${encodeURIComponent(code)}`)
      const json = await res.json()
      if (!res.ok && json?.code === 'QR_ACCOUNT_MISMATCH') return 'ACCOUNT_MISMATCH'
      return json.success && json.data ? [json.data] : []
    } catch { return [] }
  }, [apiBase, authFetch])

  const searchFuzzy = useCallback(async (text: string): Promise<MobileProduct[]> => {
    try {
      const clean = text.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (clean.length < 2) return []
      const res  = await authFetch(`${apiBase}/scanner/products/fuzzy?q=${encodeURIComponent(clean)}&limit=10`)
      const json = await res.json()
      return json.success ? (json.data || []) : []
    } catch { return [] }
  }, [apiBase, authFetch])

  // ── Barcode scanning loop ──────────────────────────────────────────────────
  const startBarcodeLoop = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()

    barcodeTimer.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
      try {
        const video = videoRef.current
        const vw = video.videoWidth  || 640
        const vh = video.videoHeight || 480
        const z  = zoomRef.current

        const canvas = document.createElement('canvas')
        canvas.width  = vw
        canvas.height = vh
        const ctx = canvas.getContext('2d')!
        if (z > 1) {
          const cropW = vw / z, cropH = vh / z
          const cropX = (vw - cropW) / 2, cropY = (vh - cropH) / 2
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, vw, vh)
        } else {
          ctx.drawImage(video, 0, 0)
        }
        const result = await reader.decodeFromCanvas(canvas)
        const code   = result?.getText()
        if (!code || !mountedRef.current) return

        clearInterval(barcodeTimer.current!); barcodeTimer.current = null
        setState(s => ({ ...s, lastBarcode: code }))

        const products = await searchBarcode(code)
        if (!mountedRef.current) return
        if (products === 'ACCOUNT_MISMATCH') {
          setState(s => ({ ...s, status: 'error', error: QR_ACCOUNT_MISMATCH_MSG }))
          return
        }
        if (products.length > 0) {
          setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
        } else {
          // Barcode not in DB — fall through to fuzzy search with barcode string
          const fuzzy = await searchFuzzy(code)
          if (!mountedRef.current) return
          if (fuzzy.length > 0) {
            setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
          }
          // No match at all — the outer setInterval below keeps ticking
          // and will simply try again on the next frame.
        }
      } catch (err: any) {
        // No barcode in frame this tick — keep scanning, nothing to do.
      }
    }, BARCODE_INTERVAL_MS)
  }, [searchBarcode, searchFuzzy])

  // ── Submit result ──────────────────────────────────────────────────────────
  const selectProduct = useCallback(async (product: MobileProduct) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, status: 'submitting' }))
    stopCamera()
    try {
      const res = await authFetch(`${apiBase}/scanner/session/${token}/result`, {
        method: 'POST',
        body:   JSON.stringify({
          productId:   product.id,
          productName: product.name,
          scanMethod:  'barcode',
          barcode:     state.lastBarcode,
        }),
      })
      if (!mountedRef.current) return
      const json = await res.json()
      if (json.success) {
        setState(s => ({ ...s, status: 'done' }))
      } else {
        setState(s => ({ ...s, status: 'error', error: json.message || 'Failed to send result' }))
      }
    } catch (err: any) {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Network error. Are you on the same WiFi?' }))
    }
  }, [token, apiBase, authFetch, state.lastBarcode, stopCamera])

  // ── Rescan ─────────────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    setState(s => ({ ...s, status: 'scanning', mode: 'barcode', matches: [], error: null, lastBarcode: null }))
    await startBarcodeLoop()
  }, [startBarcodeLoop])

  // ── Init: ping session, start camera ──────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setState(s => ({ ...s, status: 'error', error: 'Invalid scanner link. Please scan the QR code again.' }))
      return
    }

    let cancelled = false

    async function init() {
      try {
        const res  = await fetch(`${apiBase}/scanner/session/${token}/ping`)
        const json = await res.json()
        if (cancelled) return
        if (!json.success) {
          setState(s => ({ ...s, status: 'error', error: json.message || 'Session not found or expired' }))
          return
        }
        jwtRef.current = json.data.jwt || null
        const context  = json.data.context || 'sales'
        setState(s => ({ ...s, status: 'scanning', mode: 'barcode', context }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, status: 'error', error: 'Cannot reach server. Make sure you are on the same WiFi network.' }))
      }
    }

    init()
    return () => { cancelled = true; stopCamera() }
  }, [token, apiBase, stopCamera])

  // Start camera + barcode when status hits 'scanning'
  useEffect(() => {
    if (state.status !== 'scanning') return
    let active = true
    startCamera().then(ok => {
      if (!ok || !active || !mountedRef.current) return
      startBarcodeLoop()
    })
    return () => { active = false }
  }, [state.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, videoRef, toggleFlash, setZoom, selectProduct, rescan }
}
