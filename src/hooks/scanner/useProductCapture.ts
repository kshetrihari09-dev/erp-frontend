/**
 * useProductCapture.ts
 *
 * Camera engine for the "Product Setup" scanner — distinct from
 * useLocalScanner (which looks up EXISTING products for billing). This
 * one is for CREATING a product: it never calls the product-lookup
 * endpoints. It only extracts raw signal from the camera:
 *
 *   - 'barcode' mode: continuously decodes and returns the decoded string
 *     the moment one is found — the caller drops it straight into the
 *     Barcode field.
 *   - 'label' mode: on demand (user taps Capture), grabs the current video
 *     frame and runs Tesseract.js OCR once, returning the raw text for the
 *     caller to parse and let the user review before applying to the form.
 *
 * All camera/zoom/flash/camera-switch/barcode-decode concerns now come
 * from the shared useBarcodeEngine hook (see useBarcodeEngine.ts) — the
 * exact same engine the billing scanner (useLocalScanner.ts) uses — so
 * both scanners are guaranteed identical camera init, autofocus, zoom,
 * flash, and decode behavior/performance. This file only adds what's
 * specific to product creation: the label-capture → crop → OCR flow.
 *
 * tesseract.js is dynamically imported so it costs nothing until a user
 * actually captures a label.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import useBarcodeEngine from './useBarcodeEngine'
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
  // Camera state mirrored from the shared engine — see useBarcodeEngine.ts.
  flashOn:        boolean
  flashSupported: boolean
  facingMode:     'environment' | 'user'
  zoom:           number
  zoomMin:        number
  zoomMax:        number
  zoomStep:       number
}

interface Options {
  active:       boolean
  mode:         CaptureMode
  onBarcode:    (code: string) => void
  onOcrText:    (text: string) => void
}

// Re-exported so ProductScanModal's zoom slider keeps working unchanged.
export { ZOOM_MIN as MIN_ZOOM, ZOOM_MAX as MAX_ZOOM } from './useBarcodeEngine'

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
  const engine = useBarcodeEngine()
  const { videoRef, containerRef } = engine

  const [state, setState] = useState<CaptureState>({
    status: 'requesting-permission', mode, error: null, ocrProgress: 0, cropSource: null,
    flashOn: false, flashSupported: false, facingMode: 'environment',
    zoom: engine.state.zoom, zoomMin: engine.state.zoomMin, zoomMax: engine.state.zoomMax, zoomStep: engine.state.zoomStep,
  })

  const mountedRef = useRef(true)

  // Zoom mirrored into a ref for the OCR capture path's synchronous
  // canvas math (captureFrame) — parity with the engine's own internal
  // zoomRef, just a thin local mirror.
  const zoomRef = useRef(engine.state.zoom)
  useEffect(() => { zoomRef.current = engine.state.zoom }, [engine.state.zoom])

  // ── Mirror the shared engine's camera state into this hook's state so
  //    ProductScanModal keeps reading a single, familiar `state` shape ──────
  useEffect(() => {
    setState(s => ({
      ...s,
      flashOn:        engine.state.flashOn,
      flashSupported: engine.state.flashSupported,
      facingMode:     engine.state.facingMode,
      zoom:           engine.state.zoom,
      zoomMin:        engine.state.zoomMin,
      zoomMax:        engine.state.zoomMax,
      zoomStep:       engine.state.zoomStep,
    }))
  }, [engine.state.flashOn, engine.state.flashSupported, engine.state.facingMode, engine.state.zoom, engine.state.zoomMin, engine.state.zoomMax, engine.state.zoomStep])

  const setZoom = useCallback((value: number) => engine.setZoom(value), [engine])
  const toggleFlash = useCallback(() => engine.toggleFlash(), [engine])

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; revokePendingUrl() } }, [])

  const stopCamera = useCallback(() => {
    engine.closeCamera()
  }, [engine])

  // ── Barcode detection — delegates the actual decode loop to the shared
  //    engine; this callback is purely "what to do with a decoded code" ─────
  const handleBarcodeDetected = useCallback((code: string) => {
    onBarcode(code)
  }, [onBarcode])

  const startBarcodeLoop = useCallback(() => {
    engine.startScanning(handleBarcodeDetected)
  }, [engine, handleBarcodeDetected])

  const switchCamera = useCallback(async () => {
    await engine.switchCamera()
    // engine.switchCamera() restarts the barcode decode loop itself if it
    // was active before the switch — nothing else to do here.
  }, [engine])

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

    revokePendingUrl()
    pendingCanvasRef.current = canvas
    const suggested = detectTextRegion(canvas)
    canvas.toBlob(blob => {
      if (!blob || !mountedRef.current) return
      const url = URL.createObjectURL(blob)
      pendingUrlRef.current = url
      setState(s => ({ ...s, status: 'cropping', error: null, cropSource: { url, naturalWidth: canvas.width, naturalHeight: canvas.height, suggested } }))
    }, 'image/jpeg', 0.92)
  }, [revokePendingUrl, videoRef])

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
    const ok = await engine.retryPermission()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') startBarcodeLoop()
    }
  }, [engine, startBarcodeLoop, mode])

  // ── Switch between barcode / label without re-requesting permission ─────
  useEffect(() => {
    if (!active || state.status !== 'ready') return
    engine.stopScanning()
    setState(s => ({ ...s, mode, status: 'ready', error: null }))
    if (mode === 'barcode') startBarcodeLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      setState(s => ({
        status: 'requesting-permission', mode, error: null, ocrProgress: 0, cropSource: null,
        flashOn: false, flashSupported: false, facingMode: 'environment',
        zoom: 1, zoomMin: s.zoomMin, zoomMax: s.zoomMax, zoomStep: s.zoomStep,
      }))
      return
    }

    let cancelled = false
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))

    async function init() {
      const ok = await engine.openCamera('environment')
      if (cancelled || !mountedRef.current || !ok) return
      setState(s => ({ ...s, status: 'ready' }))
      if (mode === 'barcode') startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ── Map the engine's camera status onto this hook's status while the
  //    camera itself hasn't finished opening yet (denied/error) ──────────────
  useEffect(() => {
    if (!active) return
    if (engine.state.cameraStatus === 'denied') {
      setState(s => (s.status === 'denied' ? s : { ...s, status: 'denied', error: engine.state.error }))
    } else if (engine.state.cameraStatus === 'error') {
      setState(s => (s.status === 'error' ? s : { ...s, status: 'error', error: engine.state.error }))
    }
  }, [active, engine.state.cameraStatus, engine.state.error])

  // ── Defensive re-attach ──────────────────────────────────────────────────
  // Runs whenever the scanner is active and status changes. If the <video>
  // element and the MediaStream both exist but aren't wired together yet
  // (e.g. the <video> mounted/remounted after the stream was captured),
  // this reconnects them — the actual fix for the "camera opens, but the
  // preview stays blank" bug.
  useEffect(() => {
    if (!active) return
    engine.attachStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.status])

  return {
    state, videoRef, containerRef,
    captureFrame, selectFileForCrop, confirmCrop, cancelCrop,
    retryPermission, setZoom, toggleFlash, switchCamera,
  }
}
