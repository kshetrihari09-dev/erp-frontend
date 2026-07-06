/**
 * useLocalScanner.ts
 *
 * Local (same-device) scanner engine — the new default entry point.
 *
 * This is deliberately NOT a rewrite of the scanning engine: the camera
 * setup, the @zxing/browser barcode loop (300ms interval, 8s timeout before
 * falling back to OCR), and the Tesseract.js OCR loop (3s interval) are the
 * exact same approach as useMobileScanner.ts, calling the exact same two
 * backend endpoints (/scanner/products/barcode/:code and
 * /scanner/products/fuzzy) — just through the app's normal authenticated
 * `http` client instead of a session-forwarded JWT, since this runs in the
 * user's own already-logged-in tab rather than a separate handed-off device.
 *
 * The one behavioural difference from useMobileScanner is intentional and
 * UX-only: instead of POSTing the selected product to a session for a
 * desktop to poll, `selectProduct` resolves the result locally and calls
 * `onResult` directly — because there is no second device in this flow.
 *
 * New, additive capabilities (UI/UX only, no change to detection logic):
 *   - camera permission state, so the UI can show a friendly retry screen
 *   - front/back camera switching
 *   - manual mode override (force barcode or OCR) for the bottom-bar toggle
 *   - OCR on a gallery-picked image (same runOcr recognition call, applied
 *     to an uploaded image instead of a live video frame)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { scannerAPI } from '@/services/api'
import type { ScanResult, ScannedProduct } from '@/types/scanner'

const BARCODE_TIMEOUT_MS  = 8_000
const BARCODE_INTERVAL_MS = 300
const OCR_INTERVAL_MS     = 3_000

export type LocalScanMode   = 'barcode' | 'ocr' | 'idle'
export type LocalScanStatus =
  | 'requesting-permission'
  | 'denied'
  | 'scanning'
  | 'matches'
  | 'submitting'
  | 'done'
  | 'error'

// Same shape as useMobileScanner's MobileProduct — intermediate list item
// before a match is hydrated into a full ScannedProduct on selection.
export interface LocalProduct {
  id:             string
  item_code:      string
  name:           string
  generic_name?:  string
  company_name?:  string
  unit:           string
  sales_rate:     number
  purchase_rate:  number
  current_stock?: number
}

export interface LocalScannerState {
  status:      LocalScanStatus
  mode:        LocalScanMode
  matches:     LocalProduct[]
  error:       string | null
  flashOn:     boolean
  facingMode:  'environment' | 'user'
  ocrProgress: number
  lastBarcode: string | null
  lastOcrText: string | null
  lastResult:  ScanResult | null
}

interface Options {
  context:  'sales' | 'purchase'
  onResult: (result: ScanResult) => void
  active:   boolean   // whether the scanner view is currently open
}

const INITIAL_STATE: LocalScannerState = {
  status: 'requesting-permission', mode: 'idle', matches: [],
  error: null, flashOn: false, facingMode: 'environment',
  ocrProgress: 0, lastBarcode: null, lastOcrText: null, lastResult: null,
}

export default function useLocalScanner({ onResult, active }: Options) {
  const [state, setState] = useState<LocalScannerState>(INITIAL_STATE)

  const videoRef       = useRef<HTMLVideoElement | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const barcodeTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const ocrTimer        = useRef<ReturnType<typeof setInterval> | null>(null)
  const barcodeStart    = useRef<number>(0)
  const mountedRef      = useRef(true)
  const manualModeRef   = useRef<LocalScanMode | null>(null)   // set by user's Barcode/OCR toggle

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Camera ─────────────────────────────────────────────────────────────────
  // Attaches the current stream to the <video> element if it isn't already
  // attached. Split out from startCamera (and also called defensively — see
  // the effect below) because the <video> element may not exist yet at the
  // exact moment getUserMedia() resolves (e.g. while the UI is still showing
  // a "requesting-permission" screen). If the stream is captured but never
  // attached, videoRef.current.readyState stays 0 forever, which silently
  // starves both the barcode loop and the OCR loop (they both bail out on
  // `readyState < 2` as their very first check, every single tick).
  const attachStream = useCallback(async () => {
    const video  = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    try { await video.play() } catch {}
  }, [])

  const startCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment'): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream
      await attachStream()
      return true
    } catch (err: any) {
      if (!mountedRef.current) return false
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setState(s => ({ ...s, status: 'denied', error: 'Camera access was denied.' }))
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setState(s => ({ ...s, status: 'error', error: 'No camera found on this device.' }))
      } else {
        setState(s => ({ ...s, status: 'error', error: 'Could not start the camera. Please try again.' }))
      }
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

  // ── Camera switch (front / back) ────────────────────────────────────────────
  const switchCamera = useCallback(async () => {
    const next = state.facingMode === 'environment' ? 'user' : 'environment'
    stopCamera()
    setState(s => ({ ...s, facingMode: next, mode: 'idle' }))
    const ok = await startCamera(next)
    if (ok && mountedRef.current) {
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: manualModeRef.current || 'barcode' }))
    }
  }, [state.facingMode, stopCamera, startCamera, attachStream])

  // ── Product search (same endpoints as useMobileScanner, normal auth) ──────
  const searchBarcode = useCallback(async (code: string): Promise<LocalProduct[]> => {
    try {
      const res = await scannerAPI.lookupBarcode(code)
      const json: any = res.data
      return json.success && json.data ? [json.data] : []
    } catch { return [] }
  }, [])

  const searchFuzzy = useCallback(async (text: string): Promise<LocalProduct[]> => {
    try {
      const clean = text.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (clean.length < 2) return []
      const res  = await scannerAPI.fuzzySearch(clean, 10)
      const json: any = res.data
      return json.success ? (json.data || []) : []
    } catch { return [] }
  }, [])

  // ── OCR on a live video frame ────────────────────────────────────────────────
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

  // ── OCR on a gallery-picked image (same recognizer, static image input) ────
  const scanImageFile = useCallback(async (file: File) => {
    if (!mountedRef.current) return
    stopCamera()
    setState(s => ({ ...s, mode: 'ocr', ocrProgress: 0 }))
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width  = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)

      const { createWorker } = await import('tesseract.js')
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
      setState(s => ({ ...s, lastOcrText: trimmed || null }))
      if (trimmed.length < 3) {
        setState(s => ({ ...s, status: 'error', error: 'Could not read any text from that image.' }))
        return
      }
      const products = await searchFuzzy(trimmed)
      if (!mountedRef.current) return
      if (products.length > 0) {
        setState(s => ({ ...s, status: 'matches', matches: products }))
      } else {
        setState(s => ({ ...s, status: 'error', error: 'No matching medicine found for that image.' }))
      }
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Could not process that image.' }))
    }
  }, [searchFuzzy, stopCamera])

  // ── Barcode scanning loop ──────────────────────────────────────────────────
  const startBarcodeLoop = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
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
          const fuzzy = await searchFuzzy(code)
          if (!mountedRef.current) return
          if (fuzzy.length > 0) {
            setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
          } else if (manualModeRef.current !== 'barcode') {
            setState(s => ({ ...s, mode: 'ocr' }))
            await runOcr()
            ocrTimer.current = setInterval(runOcr, OCR_INTERVAL_MS)
          }
        }
      } catch (err: any) {
        if (err?.name === 'NotFoundException') {
          if (manualModeRef.current !== 'barcode' && Date.now() - barcodeStart.current > BARCODE_TIMEOUT_MS) {
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

  // ── Manual mode override (Barcode / OCR bottom-bar buttons) ────────────────
  const setMode = useCallback((mode: 'barcode' | 'ocr') => {
    manualModeRef.current = mode
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    if (ocrTimer.current)     { clearInterval(ocrTimer.current);     ocrTimer.current = null }
    setState(s => ({ ...s, mode, status: 'scanning', ocrProgress: 0 }))
    if (mode === 'barcode') {
      startBarcodeLoop()
    } else {
      runOcr()
      ocrTimer.current = setInterval(runOcr, OCR_INTERVAL_MS)
    }
  }, [startBarcodeLoop, runOcr])

  // ── Select a match → hydrate to full ScannedProduct → resolve locally ─────
  const selectProduct = useCallback(async (product: LocalProduct) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, status: 'submitting' }))
    stopCamera()
    try {
      // Fuzzy/OCR matches are partial (no batches/current_stock). Hydrate via
      // the exact-match barcode endpoint (item_code) to get the full
      // ScannedProduct shape — mirrors what the backend already does
      // server-side for the cross-device flow before delivering a result.
      let full: ScannedProduct | null = null
      if (typeof (product as any).current_stock === 'number' && (product as any).batches) {
        full = product as unknown as ScannedProduct
      } else {
        const res = await scannerAPI.lookupBarcode(product.item_code)
        const json: any = res.data
        full = json.success ? json.data : null
      }
      if (!mountedRef.current) return
      if (!full) {
        setState(s => ({ ...s, status: 'error', error: 'Could not load full product details. Please try again.' }))
        return
      }

      const result: ScanResult = {
        product:    full,
        scanMethod: state.lastBarcode ? 'barcode' : state.lastOcrText ? 'ocr' : 'manual',
        barcode:    state.lastBarcode,
        ocrText:    state.lastOcrText,
        scannedAt:  Date.now(),
      }

      setState(s => ({ ...s, status: 'done', lastResult: result }))
      onResult(result)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Something went wrong. Please try again.' }))
    }
  }, [onResult, stopCamera, state.lastBarcode, state.lastOcrText])

  // ── Rescan / retry ──────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    if (ocrTimer.current)     { clearInterval(ocrTimer.current);     ocrTimer.current = null }
    manualModeRef.current = null
    setState(s => ({ ...s, status: 'scanning', mode: 'barcode', matches: [], error: null, lastBarcode: null, lastOcrText: null, ocrProgress: 0 }))
    const ok = streamRef.current ? true : await startCamera(state.facingMode)
    if (ok) await startBarcodeLoop()
  }, [startCamera, startBarcodeLoop, state.facingMode])

  const retryPermission = useCallback(async () => {
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))
    const ok = await startCamera(state.facingMode)
    if (ok && mountedRef.current) {
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      await startBarcodeLoop()
    }
  }, [startCamera, startBarcodeLoop, state.facingMode, attachStream])

  // ── Lifecycle: request permission + start camera as soon as the scanner
  //    view opens; tear everything down when it closes ──────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false
    setState(() => ({ ...INITIAL_STATE, status: 'requesting-permission' }))

    async function init() {
      const ok = await startCamera('environment')
      if (cancelled || !mountedRef.current || !ok) return
      // Belt-and-suspenders: attachStream() already ran inside startCamera,
      // but we re-check here too before flipping to 'scanning' and kicking
      // off the detection loops.
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      await startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ── Defensive re-attach ──────────────────────────────────────────────────
  // Runs whenever the scanner is active and status changes. If the <video>
  // element and the MediaStream both exist but aren't wired together yet
  // (e.g. the <video> mounted/remounted after the stream was captured),
  // this reconnects them. This is what actually prevents the "camera
  // opens, but nothing is ever detected" failure mode if the video element
  // is ever conditionally unmounted again in a future UI change.
  useEffect(() => {
    if (!active) return
    attachStream()
  }, [active, state.status, attachStream])

  return {
    state, videoRef,
    toggleFlash, switchCamera, setMode,
    selectProduct, rescan, retryPermission, scanImageFile,
  }
}
