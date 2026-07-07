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
import { preprocessForOcr } from '@/utils/ocrImage'

export type CaptureMode   = 'barcode' | 'label'
export type CaptureStatus =
  | 'requesting-permission'
  | 'denied'
  | 'ready'
  | 'cropping'
  | 'ocr-running'
  | 'error'

export interface CropSource {
  url:           string // object URL for display in the crop overlay
  naturalWidth:  number
  naturalHeight: number
  suggested:     CropRect | null // auto-detected starting crop box, if any
}

export interface CropRect { x: number; y: number; width: number; height: number } // natural pixel coords

export interface CaptureState {
  status:      CaptureStatus
  mode:        CaptureMode
  error:       string | null
  ocrProgress: number
  cropSource:  CropSource | null
}

interface Options {
  active:       boolean
  mode:         CaptureMode
  onBarcode:    (code: string) => void
  onOcrText:    (text: string) => void
}

const BARCODE_INTERVAL_MS = 300

// Find text anywhere in the image with no layout assumptions — appropriate
// for a product label/box, which is mostly logos/graphics with a few
// disconnected blocks of text, not a uniform page of prose.
const OCR_PSM_SPARSE_TEXT = '11'

// ── Auto-crop suggestion ─────────────────────────────────────────────────
// Cheap, dependency-free text-region localization (a "projection profile"
// technique): downscale, take gradient magnitude as an edge-density proxy
// for "text-like" content, sum it per row and per column, and find where
// those sums cluster above a fraction of their peak. This is only ever a
// starting point — CropOverlay still lets the user drag/resize it — so it
// doesn't need to be exact, just close enough to save most people from
// having to crop from scratch. Returns null (falls back to a centered
// default box) if the frame doesn't show a clear enough signal, e.g. a
// blank wall or a very low-contrast shot.
function detectTextRegion(canvas: HTMLCanvasElement): CropRect | null {
  const DOWNSCALE_MAX = 220
  const scale = Math.min(1, DOWNSCALE_MAX / Math.max(canvas.width, canvas.height))
  const w = Math.max(1, Math.round(canvas.width  * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))

  const small = document.createElement('canvas')
  small.width = w; small.height = h
  const sctx = small.getContext('2d')!
  sctx.drawImage(canvas, 0, 0, w, h)
  const { data } = sctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }

  const edge = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      edge[idx] += Math.abs(gray[idx + 1] - gray[idx - 1])
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      edge[idx] += Math.abs(gray[idx + w] - gray[idx - w])
    }
  }

  const rowSum = new Float32Array(h)
  const colSum = new Float32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = edge[y * w + x]
      rowSum[y] += v
      colSum[x] += v
    }
  }

  const boundsFromProfile = (profile: Float32Array): [number, number] | null => {
    let max = 0
    for (let i = 0; i < profile.length; i++) max = Math.max(max, profile[i])
    if (max <= 0) return null
    const threshold = max * 0.15
    let first = -1, last = -1
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] >= threshold) { if (first < 0) first = i; last = i }
    }
    return first < 0 ? null : [first, last]
  }

  const rowsBound = boundsFromProfile(rowSum)
  const colsBound = boundsFromProfile(colSum)
  if (!rowsBound || !colsBound) return null

  const [y0, y1] = rowsBound
  const [x0, x1] = colsBound
  const padX = (x1 - x0) * 0.08 + 2
  const padY = (y1 - y0) * 0.08 + 2
  const rx0 = Math.max(0, x0 - padX), rx1 = Math.min(w, x1 + padX)
  const ry0 = Math.max(0, y0 - padY), ry1 = Math.min(h, y1 + padY)

  // Reject if the detected box is basically the whole frame (no real
  // localization happened) or implausibly tiny (noise).
  const areaFrac = ((rx1 - rx0) * (ry1 - ry0)) / (w * h)
  if (areaFrac > 0.92 || areaFrac < 0.02) return null

  const invScale = 1 / scale
  return {
    x:      rx0 * invScale,
    y:      ry0 * invScale,
    width:  (rx1 - rx0) * invScale,
    height: (ry1 - ry0) * invScale,
  }
}

export default function useProductCapture({ active, mode, onBarcode, onOcrText }: Options) {
  const [state, setState] = useState<CaptureState>({
    status: 'requesting-permission', mode, error: null, ocrProgress: 0, cropSource: null,
  })

  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const barcodeTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef  = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; revokePendingUrl() } }, [])

  const stopBarcodeLoop = useCallback(() => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
  }, [])

  const stopCamera = useCallback(() => {
    stopBarcodeLoop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [stopBarcodeLoop])

  // Attaches the current stream to the <video> element if it isn't already
  // attached. Split out from startCamera (and also called defensively — see
  // the effect below) because the <video> element doesn't exist yet at the
  // exact moment getUserMedia() resolves: the modal only renders <video>
  // once status flips to 'ready', but startCamera() runs while status is
  // still 'requesting-permission'. If the stream is captured but never
  // attached, videoRef.current stays null/stale and the barcode loop and
  // OCR capture both silently do nothing forever (same failure mode fixed
  // previously in useLocalScanner).
  const attachStream = useCallback(async () => {
    const video  = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    try { await video.play() } catch {}
  }, [])

  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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

  // Holds the full-resolution, un-preprocessed frame/image while the user
  // adjusts the crop box. Not in React state because it's a large pixel
  // buffer that never needs to trigger a re-render itself — only the
  // small `cropSource` (a display URL + dimensions) does.
  const pendingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pendingUrlRef    = useRef<string | null>(null)

  const revokePendingUrl = useCallback(() => {
    if (pendingUrlRef.current) { URL.revokeObjectURL(pendingUrlRef.current); pendingUrlRef.current = null }
  }, [])

  // Runs the shared OCR pipeline (preprocess → Tesseract) on a cropped
  // region and reports the result back through onOcrText, same error
  // handling for both the live-camera and gallery-file paths.
  const runOcr = useCallback(async (canvas: HTMLCanvasElement) => {
    setState(s => ({ ...s, status: 'ocr-running', ocrProgress: 0, error: null }))
    try {
      const processed = preprocessForOcr(canvas, canvas.width, canvas.height)

      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && mountedRef.current) {
            setState(s => ({ ...s, ocrProgress: Math.round(m.progress * 100) }))
          }
        },
      })
      await worker.setParameters({ tessedit_pageseg_mode: OCR_PSM_SPARSE_TEXT as any })
      const { data: { text } } = await worker.recognize(processed)
      await worker.terminate()
      if (!mountedRef.current) return

      const trimmed = text.trim()
      if (trimmed.length < 3) {
        setState(s => ({ ...s, status: 'ready', cropSource: null, error: 'Could not read any text — try cropping tighter or better lighting.' }))
        return
      }
      setState(s => ({ ...s, status: 'ready', cropSource: null }))
      onOcrText(trimmed)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'ready', cropSource: null, error: 'Could not process that image.' }))
    }
  }, [onOcrText])

  // ── Freeze a live camera frame and hand it to the user for cropping ──────
  const captureFrame = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth  || 640
    canvas.height = videoRef.current.videoHeight || 480
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)

    revokePendingUrl()
    pendingCanvasRef.current = canvas
    const suggested = detectTextRegion(canvas)
    canvas.toBlob(blob => {
      if (!blob || !mountedRef.current) return
      const url = URL.createObjectURL(blob)
      pendingUrlRef.current = url
      setState(s => ({ ...s, status: 'cropping', error: null, cropSource: { url, naturalWidth: canvas.width, naturalHeight: canvas.height, suggested } }))
    }, 'image/jpeg', 0.92)
  }, [revokePendingUrl])

  // ── Same, but from a gallery-picked image instead of the live feed ──────
  const selectFileForCrop = useCallback(async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width  = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      bitmap.close?.()

      revokePendingUrl()
      pendingCanvasRef.current = canvas
      const suggested = detectTextRegion(canvas)
      canvas.toBlob(blob => {
        if (!blob || !mountedRef.current) return
        const url = URL.createObjectURL(blob)
        pendingUrlRef.current = url
        setState(s => ({ ...s, status: 'cropping', error: null, cropSource: { url, naturalWidth: canvas.width, naturalHeight: canvas.height, suggested } }))
      }, 'image/jpeg', 0.92)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'ready', error: 'Could not load that image.' }))
    }
  }, [revokePendingUrl])

  // ── User confirms the crop box — cut the region out and run OCR on it ───
  const confirmCrop = useCallback((rect: CropRect) => {
    const source = pendingCanvasRef.current
    if (!source) return
    const x = Math.max(0, Math.round(rect.x))
    const y = Math.max(0, Math.round(rect.y))
    const w = Math.max(1, Math.min(Math.round(rect.width),  source.width  - x))
    const h = Math.max(1, Math.min(Math.round(rect.height), source.height - y))

    const cropped = document.createElement('canvas')
    cropped.width  = w
    cropped.height = h
    cropped.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h)

    revokePendingUrl()
    pendingCanvasRef.current = null
    runOcr(cropped)
  }, [revokePendingUrl, runOcr])

  // ── User backs out of the crop step without extracting anything ─────────
  const cancelCrop = useCallback(() => {
    revokePendingUrl()
    pendingCanvasRef.current = null
    setState(s => ({ ...s, status: 'ready', cropSource: null, error: null }))
  }, [revokePendingUrl])

  const retryPermission = useCallback(async () => {
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))
    const ok = await startCamera()
    if (ok && mountedRef.current) {
      await attachStream()
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') await startBarcodeLoop()
    }
  }, [startCamera, startBarcodeLoop, attachStream, mode])

  // ── Switch between barcode / label without re-requesting permission ─────
  useEffect(() => {
    if (!active || state.status !== 'ready') return
    stopBarcodeLoop()
    setState(s => ({ ...s, mode, status: 'ready', error: null }))
    if (mode === 'barcode') startBarcodeLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      setState({ status: 'requesting-permission', mode, error: null, ocrProgress: 0, cropSource: null })
      return
    }

    let cancelled = false
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))

    async function init() {
      const ok = await startCamera()
      if (cancelled || !mountedRef.current || !ok) return
      // Belt-and-suspenders: attachStream() already ran inside startCamera,
      // but we re-check here too before flipping to 'ready' and kicking
      // off the barcode loop.
      await attachStream()
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') await startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ── Defensive re-attach ──────────────────────────────────────────────────
  // Runs whenever the scanner is active and status changes. If the <video>
  // element and the MediaStream both exist but aren't wired together yet
  // (e.g. the <video> mounted/remounted after the stream was captured),
  // this reconnects them — the actual fix for the "camera opens, but the
  // preview stays blank" bug.
  useEffect(() => {
    if (!active) return
    attachStream()
  }, [active, state.status, attachStream])

  return { state, videoRef, captureFrame, selectFileForCrop, confirmCrop, cancelCrop, retryPermission }
}
