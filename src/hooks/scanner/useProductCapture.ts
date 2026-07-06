/**
 * useProductCapture.ts
 *
 * Camera engine for the "Product Setup" scanner — distinct from
 * useLocalScanner (which looks up EXISTING products for billing).
 * This one is for CREATING a product: it never calls the product-lookup
 * endpoints. It only extracts raw signal from the camera:
 *
 *   - 'barcode' mode: continuously decodes with @zxing/browser (same
 *     approach/interval as the billing scanner) and returns the decoded
 *     string the moment one is found — the caller drops it straight into
 *     the Barcode field.
 *   - 'label' mode: on demand (user taps Capture), grabs the current video
 *     frame and runs Tesseract.js OCR once, returning the raw text for the
 *     caller to parse and let the user review before applying to the form.
 *
 * Both tesseract.js and @zxing/browser are dynamically imported so they
 * cost nothing until a user actually opens this scanner.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

export type CaptureMode   = 'barcode' | 'label'
export type CaptureStatus =
  | 'requesting-permission'
  | 'denied'
  | 'ready'
  | 'ocr-running'
  | 'error'

export interface CaptureState {
  status:      CaptureStatus
  mode:        CaptureMode
  error:       string | null
  ocrProgress: number
}

interface Options {
  active:       boolean
  mode:         CaptureMode
  onBarcode:    (code: string) => void
  onOcrText:    (text: string) => void
}

const BARCODE_INTERVAL_MS = 300

export default function useProductCapture({ active, mode, onBarcode, onOcrText }: Options) {
  const [state, setState] = useState<CaptureState>({
    status: 'requesting-permission', mode, error: null, ocrProgress: 0,
  })

  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const barcodeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef  = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const stopBarcodeLoop = useCallback(() => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
  }, [])

  const stopCamera = useCallback(() => {
    stopBarcodeLoop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [stopBarcodeLoop])

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

  const startBarcodeLoop = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()

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
        stopBarcodeLoop()
        onBarcode(code)
      } catch {
        // NotFoundException on frames with no barcode — expected, keep looping
      }
    }, BARCODE_INTERVAL_MS)
  }, [onBarcode, stopBarcodeLoop])

  // ── Capture a single frame and OCR it (label mode, on demand) ────────────
  const captureAndExtract = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
    setState(s => ({ ...s, status: 'ocr-running', ocrProgress: 0, error: null }))
    try {
      const canvas = document.createElement('canvas')
      canvas.width  = videoRef.current.videoWidth  || 640
      canvas.height = videoRef.current.videoHeight || 480
      canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)

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
      if (trimmed.length < 3) {
        setState(s => ({ ...s, status: 'ready', error: 'Could not read any text — try again with better lighting.' }))
        return
      }
      setState(s => ({ ...s, status: 'ready' }))
      onOcrText(trimmed)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'ready', error: 'Could not process that image.' }))
    }
  }, [onOcrText])

  // ── Same flow but from a gallery-picked image instead of the live feed ──
  const extractFromFile = useCallback(async (file: File) => {
    setState(s => ({ ...s, status: 'ocr-running', ocrProgress: 0, error: null }))
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
      if (trimmed.length < 3) {
        setState(s => ({ ...s, status: 'ready', error: 'Could not read any text from that image.' }))
        return
      }
      setState(s => ({ ...s, status: 'ready' }))
      onOcrText(trimmed)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'ready', error: 'Could not process that image.' }))
    }
  }, [onOcrText])

  const retryPermission = useCallback(async () => {
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))
    const ok = await startCamera()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') await startBarcodeLoop()
    }
  }, [startCamera, startBarcodeLoop, mode])

  // ── Switch between barcode / label without re-requesting permission ─────
  useEffect(() => {
    if (!active || state.status === 'requesting-permission' || state.status === 'denied' || state.status === 'error') return
    stopBarcodeLoop()
    setState(s => ({ ...s, mode, status: 'ready', error: null }))
    if (mode === 'barcode') startBarcodeLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      setState({ status: 'requesting-permission', mode, error: null, ocrProgress: 0 })
      return
    }

    let cancelled = false
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))

    async function init() {
      const ok = await startCamera()
      if (cancelled || !mountedRef.current || !ok) return
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') await startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { state, videoRef, captureAndExtract, extractFromFile, retryPermission }
}
