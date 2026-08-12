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
 *     the engine (never re-initialized per tick or per mode switch), a
 *     barcode is only accepted once the same value decodes on
 *     CONFIRM_TICKS consecutive frames (guards against a single stray
 *     misread from blur/glare/occlusion), and the loop stops itself the
 *     instant a barcode is confirmed so callers never see a duplicate read.
 *   - 2D matrix format support in "qr" mode: QR_CODE, DATA_MATRIX, and
 *     AZTEC all decode through the same reader/pass in this mode (see
 *     build2DHints/getReader below) — Data Matrix in particular is what
 *     pharmaceutical/GS1 packaging codes use instead of QR, so this mode
 *     is really "2D matrix codes" even though it's still surfaced to the
 *     person as the "QR" toggle option. Barcode mode's formats (EAN/UPC/
 *     CODE_128) are untouched and still decode via a separate reader.
 *   - QR/2D fallback preprocessing ("qr" mode only, see utils/qrFallback.ts):
 *     when the primary, unprocessed decode fails on a frame, a throttled
 *     fallback tries a handful of image-processing variants (upscale,
 *     grayscale, contrast stretch, sharpen, adaptive threshold) of that
 *     same cropped frame through the same ZXing reader — for faded/gray/
 *     low-contrast/slightly-blurred codes the raw frame can't decode.
 *     The pipeline has no format-specific logic (it only ever hands a
 *     processed canvas to whichever reader is passed in), so it applies
 *     equally to QR, Data Matrix, and Aztec. Barcode mode and good-
 *     quality decodes of any format are entirely unaffected.
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

// Which symbology family the decode loop is currently looking for. An
// explicit choice from the UI (see ScannerUI.tsx's ScanModeToggle) rather
// than something inferred after the fact — the engine hands each mode its
// own purpose-scoped decoder (see getReader below) instead of running
// every format on every frame regardless of what's actually being scanned.
// 'qr' covers every 2D matrix symbology this app supports (QR_CODE,
// DATA_MATRIX, AZTEC) rather than QR alone — kept as the 'qr' string
// (not renamed to e.g. '2d') so the existing UI toggle, state shape, and
// every other caller of this hook need no changes.
export type ScanMode = 'barcode' | 'qr'

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
  mode:           ScanMode
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

// ACCURATE SCANNING: a barcode is only accepted once the SAME value has
// been decoded on this many consecutive ticks. A single-frame accept is
// vulnerable to motion blur, partial occlusion, or a stray reflection
// producing one wrong decode — CODE128 in particular has no mandatory
// checksum in the default ZXing config, so a bad single-frame read isn't
// even guaranteed to get caught downstream. At the 120ms tick cadence,
// requiring 2 consecutive matches adds at most ~120-240ms of latency —
// imperceptible against the accuracy gained.
const CONFIRM_TICKS_BARCODE = 2

// "qr" mode (QR/Data Matrix/Aztec) intentionally skips the consecutive-
// match confirmation: all three formats carry their own Reed–Solomon
// error correction, so a decode that comes back at all is already far
// more trustworthy than a bare CODE128 read — and the whole point of this
// mode is to stop and return the value the instant one is read, not add a
// second frame of latency waiting to re-confirm it.
const CONFIRM_TICKS_QR = 1

// QR/2D FALLBACK PREPROCESSING (see utils/qrFallback.ts): only attempted
// when the primary, unprocessed decode on a given frame already failed
// AND we're in "qr" mode (which covers QR_CODE, DATA_MATRIX, and AZTEC —
// see build2DHints below) — never on barcode mode, never instead of the
// primary attempt. This throttle is separate from (and longer than) the
// normal SCAN_THROTTLE_MS tick cadence: the primary decode still runs on
// every tick at full speed (so good-quality decodes of any of these
// formats are unaffected), but the heavier multi-variant preprocessing
// pipeline only fires this often at most, so pointing the camera at a
// blank/non-code scene doesn't burn CPU running 5 image-processing passes
// ~8x/second for nothing.
const QR_FALLBACK_THROTTLE_MS = 350

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
  mode: 'barcode',
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

// Barcode-mode formats — scoped to what this app actually issues/accepts:
// EAN-13/EAN-8/UPC-A/UPC-E (real retail barcodes, and the EAN-13 shape
// auto-generated barcodes are encoded as — see erp-unified-backend's
// buildAutoBarcode()) plus CODE_128 (legacy/manual entries). QR, Data
// Matrix, and Aztec are deliberately NOT in this set — they have their
// own dedicated 2D decoder/path below (see build2DHints) — so the
// barcode-mode reader never spends a decode pass looking for a 2D matrix
// finder pattern while the person has explicitly selected Barcode mode.
async function buildBarcodeHints() {
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
  const hints = new Map<any, any>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ])
  // Helps recover blurry/low-light reads at a small cost to raw speed —
  // worth it since the loop already only decodes a small cropped region.
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

// 2D-mode hints — used for every symbology this mode looks for (QR,
// Data Matrix, Aztec). All three are 2D matrix symbologies with their own
// finder pattern and their own error correction (QR/Aztec: Reed–Solomon;
// Data Matrix: Reed–Solomon), which is why they share one reader/pass
// instead of each needing a dedicated decoder the way 1D formats do.
// Data Matrix in particular is required for pharmaceutical/GS1 codes on
// medicine packaging, which don't use QR at all.
async function build2DHints() {
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
  const hints = new Map<any, any>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
  ])
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

  // Current scan mode mirrored into a ref for the same reason as zoom
  // above — the decode loop's closure always reads the *current* mode
  // without the loop needing to be torn down/recreated on every toggle.
  const modeRef = useRef<ScanMode>('barcode')

  // Two independently lazy, independently cached ZXing readers — one
  // scoped to 1D barcode formats, one scoped to 2D matrix formats (QR,
  // Data Matrix, Aztec) — rather than a single shared reader reconfigured
  // on every mode switch. Each is created at most once (on first use of
  // that mode) and reused for the rest of the engine's lifetime, same as
  // before; there are just two of them now instead of one, so switching
  // modes never re-pays decoder init cost.
  const barcodeReaderRef        = useRef<any>(null)
  const barcodeReaderPromiseRef = useRef<Promise<any> | null>(null)
  const qrReaderRef             = useRef<any>(null)
  const qrReaderPromiseRef      = useRef<Promise<any> | null>(null)

  const getReader = useCallback(async (mode: ScanMode) => {
    if (mode === 'qr') {
      if (qrReaderRef.current) return qrReaderRef.current
      if (!qrReaderPromiseRef.current) {
        qrReaderPromiseRef.current = (async () => {
          const [{ BrowserMultiFormatReader }, hints] = await Promise.all([
            import('@zxing/browser'),
            build2DHints(),
          ])
          // Always the multi-format reader here, never BrowserQRCodeReader:
          // that class is hardwired internally to only ever construct a
          // QRCodeReader, so no hint can make it decode Data Matrix or
          // Aztec — it doesn't consult POSSIBLE_FORMATS at all. The
          // multi-format reader, scoped down to exactly these three
          // formats via build2DHints(), is what actually gives this mode
          // Data Matrix/Aztec support while keeping the same "only look
          // for 2D matrix codes, skip 1D entirely" fast path this mode
          // has always had.
          const reader = new BrowserMultiFormatReader(hints)
          qrReaderRef.current = reader
          return reader
        })()
      }
      return qrReaderPromiseRef.current
    }

    if (barcodeReaderRef.current) return barcodeReaderRef.current
    if (!barcodeReaderPromiseRef.current) {
      barcodeReaderPromiseRef.current = (async () => {
        const [{ BrowserMultiFormatReader }, hints] = await Promise.all([
          import('@zxing/browser'),
          buildBarcodeHints(),
        ])
        const reader = new BrowserMultiFormatReader(hints)
        barcodeReaderRef.current = reader
        return reader
      })()
    }
    return barcodeReaderPromiseRef.current
  }, [])

  // requestAnimationFrame-driven decode loop state.
  const rafRef        = useRef<number | null>(null)
  const scanActiveRef = useRef(false)
  const scanBusyRef   = useRef(false)
  const lastTickRef   = useRef(0)
  // Separate throttle clock for the QR fallback pipeline — see
  // QR_FALLBACK_THROTTLE_MS above. Reset whenever a fresh loop starts
  // (startScanning) so a previous session's timing never carries over.
  const lastFallbackTickRef = useRef(0)
  const onDetectedRef = useRef<((code: string, format?: string) => void) | null>(null)
  // ACCURATE SCANNING — consecutive-match confirmation state (see
  // CONFIRM_TICKS above). Reset whenever a fresh loop starts (startScanning)
  // so a previous scan's pending candidate never carries over.
  const pendingRef = useRef<{ code: string; format?: string; count: number } | null>(null)

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
    pendingRef.current = null
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

  // ── Decode a barcode from a still image (gallery / file picker) ─────────────
  // Reuses the same lazily-created ZXing reader instance as the live decode
  // loop — no separate decoder, no extra bundle weight, and identical format
  // support: in "qr" mode this decodes QR, Data Matrix, or Aztec from the
  // picked image exactly as the live camera loop would, since both paths
  // call the same getReader(modeRef.current). Independent of camera state
  // entirely, so it works even before/without the camera ever opening (e.g.
  // picking a photo while permission is still pending).
  const scanImageFile = useCallback(async (file: File): Promise<{ code: string; format?: string } | null> => {
    const reader = await getReader(modeRef.current)
    const url = URL.createObjectURL(file)
    try {
      const result = await reader.decodeFromImageUrl(url)
      const code = result?.getText?.()
      if (!code) return null
      let format: string | undefined
      try { format = result.getBarcodeFormat?.()?.toString?.() } catch {}
      return { code, format }
    } catch {
      return null // no decodable barcode in the image — expected/common, not an error state
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [getReader])

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

  // ── Scan mode (barcode vs QR) ────────────────────────────────────────────
  const setMode = useCallback((mode: ScanMode) => {
    if (modeRef.current === mode) return
    modeRef.current = mode
    setState(s => (s.mode === mode ? s : { ...s, mode }))
    // If a scan is already running, restart it immediately against the
    // new mode's reader rather than waiting for the current loop to end
    // on its own — the person just told the scanner what to look for, so
    // honor it from the very next frame instead of the next stray miss.
    if (scanActiveRef.current) {
      const cb = onDetectedRef.current
      stopScanning()
      if (cb) startScanning(cb)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanning])

  // ── Barcode decode loop ─────────────────────────────────────────────────────
  const startScanning = useCallback((onDetected: (code: string, format?: string) => void) => {
    onDetectedRef.current = onDetected
    if (scanActiveRef.current) return // already running — never start a second overlapping loop
    scanActiveRef.current = true
    lastTickRef.current = 0
    lastFallbackTickRef.current = 0
    pendingRef.current = null

    const tick = async () => {
      if (scanBusyRef.current || !mountedRef.current) return
      const video     = videoRef.current
      const container = containerRef.current
      if (!video || video.readyState < 2 || !container) return

      scanBusyRef.current = true
      try {
        const rect = container.getBoundingClientRect()
        const { captureBarcodeFrame, BARCODE_SCAN_WIDTH, BARCODE_SCAN_HEIGHT, QR_SCAN_SIZE } =
          await import('@/utils/barcodeFrame')
        // QR needs its whole square visible in one frame to decode at
        // all, unlike a 1D barcode which only needs a strip crossing it —
        // crop to the square QR guide in QR mode instead of the
        // wide/short barcode rectangle, or a QR held at a natural
        // distance gets clipped on the vertical edges on every frame.
        const canvas = modeRef.current === 'qr'
          ? captureBarcodeFrame(video, rect.width, rect.height, zoomRef.current, QR_SCAN_SIZE, QR_SCAN_SIZE)
          : captureBarcodeFrame(video, rect.width, rect.height, zoomRef.current, BARCODE_SCAN_WIDTH, BARCODE_SCAN_HEIGHT)
        if (!canvas) return

        const reader = await getReader(modeRef.current)
        if (!mountedRef.current || !scanActiveRef.current) return

        // Primary attempt — the original, unprocessed cropped frame.
        // This is the exact same call as before this fallback existed,
        // so good-quality codes (barcode or QR) decode on this alone,
        // at the same speed as before.
        let result: any = null
        try {
          result = await reader.decodeFromCanvas(canvas)
        } catch {
          // NotFoundException on frames with no decodable code — expected
          // on nearly every tick; fall through (possibly to the QR
          // fallback below) rather than treating it as an error.
        }

        // QR FALLBACK (see utils/qrFallback.ts): only reached when the
        // primary attempt above found nothing, we're specifically in QR
        // mode, and not more often than QR_FALLBACK_THROTTLE_MS. Barcode
        // mode's decode logic is completely untouched — this block is
        // structurally unreachable for it.
        if (
          !result &&
          modeRef.current === 'qr' &&
          mountedRef.current &&
          scanActiveRef.current
        ) {
          const now = performance.now()
          if (now - lastFallbackTickRef.current >= QR_FALLBACK_THROTTLE_MS) {
            lastFallbackTickRef.current = now
            try {
              const { decodeWithFallback } = await import('@/utils/qrFallback')
              result = await decodeWithFallback(reader, canvas)
            } catch {
              // No variant in the fallback pipeline decoded either —
              // expected for most hard frames; just try again next tick.
              result = null
            }
          }
        }

        const code = result?.getText?.()
        if (code && mountedRef.current && scanActiveRef.current) {
          let format: string | undefined
          try { format = result.getBarcodeFormat?.()?.toString?.() } catch {}

          // ACCURATE SCANNING: require CONFIRM_TICKS_BARCODE consecutive
          // identical decodes before accepting in barcode mode (guards
          // against a single stray misread from blur/glare/occlusion).
          // QR mode uses CONFIRM_TICKS_QR (1) instead — see its docblock
          // above for why a single QR decode is already trustworthy
          // enough to accept immediately.
          const requiredTicks = modeRef.current === 'qr' ? CONFIRM_TICKS_QR : CONFIRM_TICKS_BARCODE
          const pending = pendingRef.current
          if (pending && pending.code === code) {
            pending.count += 1
          } else {
            pendingRef.current = { code, format, count: 1 }
          }

          if ((pendingRef.current?.count ?? 0) >= requiredTicks) {
            // Stop the instant a barcode is confirmed — the single most
            // important guard against duplicate reads. Everything after
            // this is the caller's business logic, not this engine's.
            const confirmed = pendingRef.current!
            stopScanning()
            onDetectedRef.current?.(confirmed.code, confirmed.format)
          }
        } else {
          // No decodable code on this frame — a genuine miss (not a
          // conflicting read) doesn't reset the streak, since scanners
          // routinely have a handful of no-decode frames between two
          // valid reads of the same physical barcode (motion, focus
          // hunting). Only a *different* decoded value resets it above.
        }
      } catch {
        // Unexpected errors elsewhere in the tick (frame capture, module
        // import, etc.) — the primary/fallback decode attempts above
        // already handle their own NotFoundException cases inline, so
        // reaching here is not the normal "no code in frame" case; just
        // try again next frame either way.
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
    if (barcodeReaderRef.current) {
      try { barcodeReaderRef.current.reset?.() } catch {}
      barcodeReaderRef.current = null
    }
    if (qrReaderRef.current) {
      try { qrReaderRef.current.reset?.() } catch {}
      qrReaderRef.current = null
    }
    barcodeReaderPromiseRef.current = null
    qrReaderPromiseRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    videoRef, containerRef,
    openCamera, closeCamera, retryPermission, attachStream,
    toggleFlash, switchCamera, setZoom,
    startScanning, stopScanning, scanImageFile,
    setMode,
  }
}

export type BarcodeEngine = ReturnType<typeof useBarcodeEngine>
