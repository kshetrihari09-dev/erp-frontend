/**
 * useProductCapture.ts
 *
 * Camera engine for the "Product Setup" scanner — distinct from
 * useLocalScanner (which looks up EXISTING products for billing). This
 * one is for CREATING a product: it never calls the product-lookup
 * endpoints. It continuously decodes a barcode and returns the decoded
 * string the moment one is found — the caller drops it straight into the
 * Barcode field.
 *
 * All camera/zoom/flash/camera-switch/barcode-decode concerns come from
 * the shared useBarcodeEngine hook (see useBarcodeEngine.ts) — the exact
 * same engine the billing scanner (useLocalScanner.ts) uses — so both
 * scanners are guaranteed identical camera init, autofocus, zoom, flash,
 * and decode behavior/performance.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import useBarcodeEngine from './useBarcodeEngine'

export type CaptureStatus =
  | 'requesting-permission'
  | 'denied'
  | 'ready'
  | 'error'

export interface CaptureState {
  status:      CaptureStatus
  error:       string | null
  // Transient "no barcode found in that photo" feedback after a gallery
  // pick that didn't decode — distinct from `error`, which is reserved
  // for camera-level failures (denied/hardware).
  notice:      string | null
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
  onBarcode:    (code: string) => void
}

// Re-exported so ProductScanModal's zoom slider keeps working unchanged.
export { ZOOM_MIN as MIN_ZOOM, ZOOM_MAX as MAX_ZOOM } from './useBarcodeEngine'

export default function useProductCapture({ active, onBarcode }: Options) {
  const engine = useBarcodeEngine()
  const { videoRef, containerRef } = engine

  const [state, setState] = useState<CaptureState>({
    status: 'requesting-permission', error: null, notice: null,
    flashOn: false, flashSupported: false, facingMode: 'environment',
    zoom: engine.state.zoom, zoomMin: engine.state.zoomMin, zoomMax: engine.state.zoomMax, zoomStep: engine.state.zoomStep,
  })

  const mountedRef = useRef(true)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current)
    }
  }, [])

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

  // ── Gallery pick — decode a barcode from a photo instead of the live
  //    camera feed. Doesn't touch the live decode loop at all; on a hit it
  //    runs through the exact same handleBarcodeDetected → onBarcode path
  //    a camera read would, so the caller sees no difference in outcome. ──
  const scanFromGallery = useCallback(async (file: File) => {
    const hit = await engine.scanImageFile(file)
    if (!mountedRef.current) return
    if (hit) {
      handleBarcodeDetected(hit.code)
    } else {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current)
      setState(s => ({ ...s, notice: 'No barcode found in that photo' }))
      noticeTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setState(s => ({ ...s, notice: null }))
      }, 2200)
    }
  }, [engine, handleBarcodeDetected])

  const switchCamera = useCallback(async () => {
    await engine.switchCamera()
    // engine.switchCamera() restarts the barcode decode loop itself if it
    // was active before the switch — nothing else to do here.
  }, [engine])

  const retryPermission = useCallback(async () => {
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))
    const ok = await engine.retryPermission()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'ready' }))
      startBarcodeLoop()
    }
  }, [engine, startBarcodeLoop])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      setState(s => ({
        status: 'requesting-permission', error: null, notice: null,
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
      startBarcodeLoop()
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
    retryPermission, setZoom, toggleFlash, switchCamera, scanFromGallery,
    // Barcode-vs-QR symbology toggle — thin passthrough to the shared
    // engine (see useBarcodeEngine.ts).
    scanMode: engine.state.mode, setScanMode: engine.setMode,
  }
}
