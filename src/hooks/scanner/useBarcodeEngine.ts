/**
 * useBarcodeEngine.ts
 *
 * Single shared engine for EVERY camera + barcode-decoding concern used by
 * both scanners in the app:
 *
 *   - Sales/Purchase pages  → useLocalScanner.ts  → LocalScannerView.tsx
 *   - Product Add page      → useProductCapture.ts → ProductScanModal.tsx
 *
 * Before this refactor each of those two hooks re-implemented its own
 * getUserMedia call, zoom/flash/camera-switch handling, and ZXing decode
 * loop — with small, easy-to-miss drift between them (e.g. only one of the
 * two requested continuous autofocus, only one supported flash). This
 * hook is now the ONLY place any of that lives, so both scanners are
 * guaranteed identical camera behavior and performance, and a future fix
 * or tuning change only has to happen once.
 *
 * What this hook owns:
 *   - Camera lifecycle: highest-practical-resolution getUserMedia (with a
 *     graceful fallback if the device can't do it), rear camera by
 *     default, continuous autofocus where supported, permission/error
 *     states, stream attach/detach.
 *   - Digital zoom (CSS scale + matching native-pixel crop) — deliberately
 *     not tied to MediaTrackConstraints.zoom, which most devices never
 *     report at all, and which stutters on every slider tick since it's
 *     an async round-trip to the camera driver. This is purely
 *     synchronous, so it's always smooth, and works identically on every
 *     device.
 *   - Flash/torch toggle, gated on actual hardware capability.
 *   - Front/back camera switching.
 *   - A continuous, self-scheduling barcode decode loop driven by
 *     requestAnimationFrame: only one video frame is grabbed/decoded at a
 *     time (a busy-flag makes overlapping decode calls structurally
 *     impossible), only the small on-screen scan-guide region is decoded
 *     (see barcodeFrame.ts) rather than the full camera frame, a single
 *     ZXing reader instance is created once and reused for the life of
 *     the engine (never re-initialized per tick or per mode switch), and
 *     the loop stops itself the instant a barcode is found so callers
 *     never see a duplicate read.
 *
 * What this hook deliberately does NOT own (left to each feature hook):
 *   - What to do with a decoded barcode (product lookup vs. filling a
 *     form field) — that's business logic, passed in as a callback to
 *     startScanning().
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'requesting-permission'
  | 'denied'
  | 'error'
  | 'ready'

export interface BarcodeEngineState {
  cameraStatus:   CameraStatus
  error:          string | null
  facingMode:     'environment' | 'user'
  flashOn:        boolean
  flashSupported: boolean
  zoom:           number
  zoomMin:        number
  zoomMax:        number
  zoomStep:       number
}

export const ZOOM_MIN  = 1
export const ZOOM_MAX  = 3
export const ZOOM_STEP = 0.1

// Frames are only actually grabbed/decoded on this cadence — the
// requestAnimationFrame loop itself still runs every frame (so it can
// react the instant the previous decode resolves) but throttling the
// *work* rather than the scheduling avoids burning CPU on redundant
// decodes of near-identical frames, which is what actually keeps the UI
// smooth. Faster than the old 300ms polling interval for quicker reads,
// while still leaving headroom for a full decode pass on modest devices.
const SCAN_THROTTLE_MS = 120

const INITIAL_STATE: BarcodeEngineState = {
  cameraStatus: 'requesting-permission',
  error: null,
  facingMode: 'environment',
  flashOn: false,
  flashSupported: false,
  zoom: ZOOM_MIN,
  zoomMin: ZOOM_MIN,
  zoomMax: ZOOM_MAX,
  zoomStep: ZOOM_STEP,
}

async function requestCameraStream(facingMode: 'environment' | 'user'): Promise<MediaStream> {
  const constraints = (width: number, height: number): MediaStreamConstraints => ({
    video: {
      facingMode: { ideal: facingMode },
      // Highest practical resolution — 1080p decodes small/far barcodes
      // far more reliably than the old 720p request, and is well within
      // what virtually every rear camera built in the last decade
      // supports. `ideal` is a soft constraint, so devices that can't
      // hit it just supply their best match instead of failing.
      width:  { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30 },
      // Continuous autofocus matters enormously for barcode reliability:
      // without it, some devices default to a fixed/far focus distance
      // and a close-up barcode never comes into focus, so the decoder
      // never gets a sharp frame no matter how long it runs. Not every
      // browser understands this as a getUserMedia constraint (Chrome/
      // Android does; Safari mostly doesn't) — unsupported advanced
      // constraints are ignored rather than rejected, so it's always
      // safe to request.
      advanced: [{ focusMode: 'continuous' } as any],
    },
    audio: false,
  })

  try {
    return await navigator.mediaDevices.getUserMedia(constraints(1920, 1080))
  } catch (err: any) {
    // Some devices/browsers reject the 1080p ideal outright rather than
    // silently downgrading — retry once at a safer resolution instead of
    // surfacing an error for what's really just a capability mismatch.
    if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
      return navigator.mediaDevices.getUserMedia(constraints(1280, 720))
    }
    throw err
  }
}

// All formats the barcode loop should recognize, built once at module
// scope. Covers every common retail/invoice barcode symbology plus QR —
// requesting exactly this set (rather than every format ZXing knows)
// keeps each decode attempt as fast as possible.
async function buildHints() {
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
  const hints = new Map<any, any>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.CODABAR,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
    BarcodeFormat.PDF_417,
  ])
  // Helps recover blurry/low-light reads at a small cost to raw speed —
  // worth it since the loop already only decodes a small cropped region.
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

export default function useBarcodeEngine() {
  const [state, setState] = useState<BarcodeEngineState>(INITIAL_STATE)

  const videoRef     = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const mountedRef   = useRef(true)

  // Zoom mirrored into a ref so the decode loop's closure always reads the
  // *current* value without needing to be torn down/recreated on every
  // slider tick or pinch-move (that recreation is itself a source of
  // stutter and would risk starting a second overlapping loop).
  const zoomRef = useRef(ZOOM_MIN)
  useEffect(() => { zoomRef.current = state.zoom }, [state.zoom])

  // A single ZXing reader for the lifetime of this engine instance —
  // created lazily on first use and reused for every subsequent tick,
  // mode toggle, or camera switch. Never re-instantiated mid-session, so
  // there's no duplicate-decoder-initialization overhead.
  const readerRef        = useRef<any>(null)
  const readerPromiseRef = useRef<Promise<any> | null>(null)
  const getReader = useCallback(async () => {
    if (readerRef.current) return readerRef.current
    if (!readerPromiseRef.current) {
      readerPromiseRef.current = (async () => {
        const [{ BrowserMultiFormatReader }, hints] = await Promise.all([
          import('@zxing/browser'),
          buildHints(),
        ])
        const reader = new BrowserMultiFormatReader(hints)
        readerRef.current = reader
        return reader
      })()
    }
    return readerPromiseRef.current
  }, [])

  // requestAnimationFrame-driven decode loop state.
  const rafRef        = useRef<number | null>(null)
  const scanActiveRef = useRef(false)
  const scanBusyRef   = useRef(false)
  const lastTickRef   = useRef(0)
  const onDetectedRef = useRef<((code: string, format?: string) => void) | null>(null)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Stream attach ─────────────────────────────────────────────────────────
  // Split out from openCamera (and re-run defensively by callers) because
  // the <video> element frequently doesn't exist yet at the exact moment
  // getUserMedia() resolves — the modal only renders <video> once its
  // status flips to 'ready', but openCamera() runs while still
  // 'requesting-permission'. If the stream is captured but never
  // attached, videoRef.current stays stale and the decode loop silently
  // does nothing forever.
  const attachStream = useCallback(async () => {
    const video  = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    try { await video.play() } catch {}
  }, [])

  const stopScanning = useCallback(() => {
    scanActiveRef.current = false
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  const closeCamera = useCallback(() => {
    stopScanning()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [stopScanning])

  // ── Camera open (permission + stream + autofocus) ──────────────────────────
  const openCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment'): Promise<boolean> => {
    try {
      const stream = await requestCameraStream(facingMode)
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream
      await attachStream()

      // Some browsers only accept focusMode via applyConstraints after
      // the stream is live, not in the initial getUserMedia request —
      // try both so continuous autofocus actually engages everywhere it
      // can.
      let flashSupported = false
      try {
        const track = stream.getVideoTracks()[0] as any
        const caps  = track?.getCapabilities?.()
        if (caps?.focusMode?.includes?.('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
        }
        flashSupported = !!caps?.torch
      } catch {}

      // Reset digital zoom to 1x on every fresh camera start (new session
      // or camera switch) so it never carries over unexpectedly.
      setState(s => ({
        ...s,
        cameraStatus: 'ready',
        error: null,
        facingMode,
        flashOn: false,
        flashSupported,
        zoom: ZOOM_MIN,
      }))
      return true
    } catch (err: any) {
      if (!mountedRef.current) return false
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setState(s => ({ ...s, cameraStatus: 'denied', error: 'Camera access was denied.' }))
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setState(s => ({ ...s, cameraStatus: 'error', error: 'No camera found on this device.' }))
      } else {
        setState(s => ({ ...s, cameraStatus: 'error', error: 'Could not start the camera. Please try again.' }))
      }
      return false
    }
  }, [attachStream])

  const retryPermission = useCallback(async (): Promise<boolean> => {
    setState(s => ({ ...s, cameraStatus: 'requesting-permission', error: null }))
    return openCamera(state.facingMode)
  }, [openCamera, state.facingMode])

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

  // ── Zoom (digital — see module docblock) ────────────────────────────────────
  const setZoom = useCallback((value: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
    setState(s => (s.zoom === clamped ? s : { ...s, zoom: clamped }))
  }, [])

  // ── Camera switch (front / back) ────────────────────────────────────────────
  // If a decode loop was running, it's restarted against the new stream
  // once it's live — callers don't need to remember to re-arm scanning
  // themselves after a switch.
  const switchCamera = useCallback(async (): Promise<boolean> => {
    const next = state.facingMode === 'environment' ? 'user' : 'environment'
    const wasScanning  = scanActiveRef.current
    const detectedCb   = onDetectedRef.current
    closeCamera()
    setState(s => ({ ...s, cameraStatus: 'requesting-permission' }))
    const ok = await openCamera(next)
    if (ok && mountedRef.current && wasScanning && detectedCb) {
      startScanning(detectedCb)
    }
    return ok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.facingMode, openCamera, closeCamera])

  // ── Barcode decode loop ─────────────────────────────────────────────────────
  const startScanning = useCallback((onDetected: (code: string, format?: string) => void) => {
    onDetectedRef.current = onDetected
    if (scanActiveRef.current) return // already running — never start a second overlapping loop
    scanActiveRef.current = true
    lastTickRef.current = 0

    const tick = async () => {
      if (scanBusyRef.current || !mountedRef.current) return
      const video     = videoRef.current
      const container = containerRef.current
      if (!video || video.readyState < 2 || !container) return

      scanBusyRef.current = true
      try {
        const rect = container.getBoundingClientRect()
        const { captureBarcodeFrame } = await import('@/utils/barcodeFrame')
        const canvas = captureBarcodeFrame(video, rect.width, rect.height, zoomRef.current)
        if (!canvas) return

        const reader = await getReader()
        if (!mountedRef.current || !scanActiveRef.current) return
        const result = await reader.decodeFromCanvas(canvas)
        const code = result?.getText?.()
        if (code && mountedRef.current && scanActiveRef.current) {
          // Stop the instant a barcode is found — the single most
          // important guard against duplicate reads. Everything after
          // this is the caller's business logic, not this engine's.
          stopScanning()
          let format: string | undefined
          try { format = result.getBarcodeFormat?.()?.toString?.() } catch {}
          onDetectedRef.current?.(code, format)
        }
      } catch {
        // NotFoundException on frames with no decodable code — expected
        // on nearly every tick; just try again next frame.
      } finally {
        scanBusyRef.current = false
      }
    }

    const loop = (now: number) => {
      if (!scanActiveRef.current) return
      if (now - lastTickRef.current >= SCAN_THROTTLE_MS) {
        lastTickRef.current = now
        tick()
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [getReader, stopScanning])

  // ── Full teardown on unmount ─────────────────────────────────────────────
  useEffect(() => () => {
    stopScanning()
    closeCamera()
    if (readerRef.current) {
      try { readerRef.current.reset?.() } catch {}
      readerRef.current = null
    }
    readerPromiseRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    videoRef, containerRef,
    openCamera, closeCamera, retryPermission, attachStream,
    toggleFlash, switchCamera, setZoom,
    startScanning, stopScanning,
  }
}

export type BarcodeEngine = ReturnType<typeof useBarcodeEngine>
