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
 *   4. If no barcode after 8s → switch to Tesseract.js OCR mode
 *   5. On match found → show list for user to pick
 *   6. POST /scanner/session/:token/result with selected productId
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const BARCODE_TIMEOUT_MS  = 8_000
const BARCODE_INTERVAL_MS = 300
const OCR_INTERVAL_MS     = 3_000

export type ScanMode     = 'barcode' | 'ocr' | 'idle'
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
  ocrProgress: number
  lastBarcode: string | null
  lastOcrText: string | null
}

interface Options {
  token:   string
  apiBase: string   // http://192.168.1.10:5000/api/v1
}

export default function useMobileScanner({ token, apiBase }: Options) {
  const [state, setState] = useState<MobileScannerState>({
    status: 'connecting', mode: 'idle', context: null, matches: [],
    error: null, flashOn: false, ocrProgress: 0, lastBarcode: null, lastOcrText: null,
  })

  const videoRef      = useRef<HTMLVideoElement | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const barcodeTimer  = useRef<ReturnType<typeof setInterval> | null>(null)
  const ocrTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const barcodeStart  = useRef<number>(0)
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
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
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
    if (ocrTimer.current)     { clearInterval(ocrTimer.current);     ocrTimer.current = null }
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

  // ── Product search ─────────────────────────────────────────────────────────
  const searchBarcode = useCallback(async (code: string): Promise<MobileProduct[]> => {
    try {
      const res  = await authFetch(`${apiBase}/scanner/products/barcode/${encodeURIComponent(code)}`)
      const json = await res.json()
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

  // ── OCR handler ────────────────────────────────────────────────────────────
  const runOcr = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
    try {
      const { createWorker } = await import('tesseract.js')
      const canvas = document.createElement('canvas')
      canvas.width  = videoRef.current.videoWidth  || 640
      canvas.height = videoRef.current.videoHeight || 480
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(videoRef.current, 0, 0)

      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && mountedRef.current) {
            setState(s => ({ ...s, ocrProgress: Math.round(m.progress * 100) }))
          }
        },
      })
      const { data: { text } } = await worker.recognize(canvas)
      await worker.terminate()
      if (!mountedRef.current) return

      const trimmed = text.trim()
      if (trimmed.length < 3) return

      setState(s => ({ ...s, lastOcrText: trimmed }))
      const products = await searchFuzzy(trimmed)
      if (!mountedRef.current) return
      if (products.length > 0) {
        if (ocrTimer.current) { clearInterval(ocrTimer.current); ocrTimer.current = null }
        setState(s => ({ ...s, status: 'matches', matches: products }))
      }
    } catch { /* OCR failed — retry next interval */ }
  }, [searchFuzzy])

  // ── Barcode scanning loop ──────────────────────────────────────────────────
  const startBarcodeLoop = useCallback(async () => {
    const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    barcodeStart.current = Date.now()

    barcodeTimer.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = videoRef.current.videoWidth  || 640
        canvas.height = videoRef.current.videoHeight || 480
        canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
        const result = await reader.decodeFromCanvas(canvas)
        const code   = result?.getText()
        if (!code || !mountedRef.current) return

        clearInterval(barcodeTimer.current!); barcodeTimer.current = null
        setState(s => ({ ...s, lastBarcode: code }))

        const products = await searchBarcode(code)
        if (!mountedRef.current) return
        if (products.length > 0) {
          setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
        } else {
          // Barcode not in DB — fall through to fuzzy search with barcode string
          const fuzzy = await searchFuzzy(code)
          if (!mountedRef.current) return
          if (fuzzy.length > 0) {
            setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
          } else {
            // Switch to OCR
            setState(s => ({ ...s, mode: 'ocr' }))
            await runOcr()
            ocrTimer.current = setInterval(runOcr, OCR_INTERVAL_MS)
          }
        }
      } catch (err: any) {
        if (err?.name === 'NotFoundException') {
          // No barcode in frame — check timeout
          if (Date.now() - barcodeStart.current > BARCODE_TIMEOUT_MS) {
            clearInterval(barcodeTimer.current!); barcodeTimer.current = null
            if (!mountedRef.current) return
            setState(s => ({ ...s, mode: 'ocr' }))
            await runOcr()
            ocrTimer.current = setInterval(runOcr, OCR_INTERVAL_MS)
          }
        }
      }
    }, BARCODE_INTERVAL_MS)
  }, [searchBarcode, searchFuzzy, runOcr])

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
          scanMethod:  state.lastBarcode ? 'barcode' : state.lastOcrText ? 'ocr' : 'manual',
          barcode:     state.lastBarcode,
          ocrText:     state.lastOcrText,
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
  }, [token, apiBase, authFetch, state.lastBarcode, state.lastOcrText, stopCamera])

  // ── Rescan ─────────────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    if (ocrTimer.current)     { clearInterval(ocrTimer.current);     ocrTimer.current = null }
    setState(s => ({ ...s, status: 'scanning', mode: 'barcode', matches: [], error: null, lastBarcode: null, lastOcrText: null, ocrProgress: 0 }))
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

  return { state, videoRef, toggleFlash, selectProduct, rescan }
}
