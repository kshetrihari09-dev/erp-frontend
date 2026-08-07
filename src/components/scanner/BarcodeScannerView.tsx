/**
 * BarcodeScannerView.tsx
 *
 * The single shared camera "shell" rendered by BOTH scanners
 * (LocalScannerView for Sales/Purchase, ProductScanModal for Product Add).
 * Everything a person sees and can tap that isn't specific to what happens
 * with a decoded value lives here exactly once:
 *
 *   - the <video> element + pinch-to-zoom handlers
 *   - the rectangular scan guide (BarcodeRectOverlay)
 *   - the zoom slider
 *   - the top glass bar: close, flash toggle (only if the device reports
 *     torch support), switch camera
 *   - "opening camera…" loading state
 *   - camera-access-denied screen (with an optional extra action slot for
 *     e.g. LocalScannerView's "Use Another Device")
 *   - hard camera-error screen
 *   - the success check animation shown for the brief beat after a scan
 *     before the caller closes the view
 *
 * Callers still own their own bottom controls (mode toggles, gallery
 * button, capture button, matches drawer, crop step, etc.) via `children`,
 * and decide which scan guide to show via `scanOverlay` — barcode mode
 * uses BarcodeRectOverlay everywhere; a caller in a different capture
 * mode (e.g. OCR) can swap in its own guide without duplicating any of the
 * chrome above.
 */

import { useRef, useCallback } from 'react'
import type { TouchEvent as ReactTouchEvent, RefObject, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Zap, ZapOff, RefreshCw, CameraOff, AlertCircle, RotateCcw,
  Loader2, CheckCircle2,
} from 'lucide-react'
import type { CameraStatus } from '@/hooks/scanner/useBarcodeEngine'

interface Props {
  cameraStatus: CameraStatus
  error:        string | null

  videoRef:     RefObject<HTMLVideoElement>
  containerRef: RefObject<HTMLDivElement>

  zoom: number; zoomMin: number; zoomMax: number; zoomStep: number
  onZoomChange: (value: number) => void
  showZoomSlider?: boolean

  flashOn: boolean; flashSupported: boolean
  onToggleFlash: () => void
  onSwitchCamera: () => void
  onClose: () => void
  onRetryPermission: () => void

  /** Optional "Done" pill in the top bar, alongside the existing X close
   *  button — only rendered when a caller passes it, so scanners that
   *  don't (LocalScannerView) are completely unaffected. Distinct from
   *  onClose only in that a caller could wire different handlers if it
   *  ever needed to; ProductScanModal wires both to the same close flow,
   *  since "Done" here just means "I'm finished, exit the scanner" —
   *  the same full teardown (camera stream stopped, decoder destroyed,
   *  modal closed) either button already triggers by unmounting. */
  onDone?: () => void
  doneLabel?: string

  title?: string
  scanOverlay?: ReactNode   // e.g. <BarcodeRectOverlay /> — omit to show none
  showTopBar?: boolean

  success?:      boolean
  successLabel?: string

  deniedExtra?: ReactNode   // extra action under the denied-permission screen
  children?:    ReactNode   // bottom controls / extra overlays, shown once ready
}

export default function BarcodeScannerView({
  cameraStatus, error,
  videoRef, containerRef,
  zoom, zoomMin, zoomMax, zoomStep, onZoomChange, showZoomSlider = true,
  flashOn, flashSupported, onToggleFlash, onSwitchCamera, onClose, onRetryPermission,
  onDone, doneLabel = 'Done',
  title, scanOverlay, showTopBar = true,
  success = false, successLabel = 'Scanned!',
  deniedExtra, children,
}: Props) {
  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────
  // Two-finger pinch on the preview adjusts digital zoom, alongside the
  // slider (for precision / non-touch devices). Lives here once so both
  // scanners get identical pinch behavior instead of each re-implementing
  // touch math slightly differently.
  const pinchStartDist = useRef<number | null>(null)
  const pinchStartZoom = useRef(zoomMin)

  const touchDistance = (touches: ReactTouchEvent['touches']) => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist.current = touchDistance(e.touches)
      pinchStartZoom.current = zoom
    }
  }, [zoom])

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault()
      const ratio = touchDistance(e.touches) / pinchStartDist.current
      onZoomChange(pinchStartZoom.current * ratio)
    }
  }, [onZoomChange])

  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null
  }, [])

  return (
    <>
      {/* ── Denied permission ─────────────────────────────────────────── */}
      {cameraStatus === 'denied' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
            <CameraOff size={28} className="text-red-400" />
          </div>
          <p className="text-white font-bold text-lg mb-2">Camera access needed</p>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
            We need permission to use your camera to scan barcodes.
          </p>
          <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
            <button
              onClick={onRetryPermission}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm"
            >
              <RotateCcw size={14} /> Try Again
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-400 text-xs font-medium"
            >
              Cancel
            </button>
            {deniedExtra}
          </div>
        </div>
      )}

      {/* ── Hard error (no camera device, etc.) ─────────────────────────── */}
      {cameraStatus === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <p className="text-white font-bold text-lg mb-2">Scanner error</p>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">{error}</p>
          <button
            onClick={onRetryPermission}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm"
          >
            <RotateCcw size={14} /> Try Again
          </button>
        </div>
      )}

      {/* ── Requesting permission (camera opening) ──────────────────────── */}
      {cameraStatus === 'requesting-permission' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={26} className="text-blue-400 animate-spin" />
          <p className="text-white/70 text-sm">Opening camera…</p>
        </div>
      )}

      {/* ── Camera view ───────────────────────────────────────────────── */}
      {cameraStatus === 'ready' && (
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden bg-black"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <video
            ref={videoRef}
            playsInline muted autoPlay
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65 pointer-events-none" />

          {!success && scanOverlay}

          {/* Success overlay — identical on both scanners */}
          {success && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40"
              >
                <CheckCircle2 size={38} className="text-white" />
              </motion.div>
              <p className="text-white font-bold text-base">{successLabel}</p>
            </div>
          )}

          {/* Top glass bar */}
          {showTopBar && (
            <div
              className="absolute top-0 left-0 right-0 flex items-center justify-between p-3.5"
              style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}
            >
              <button
                onClick={onClose}
                aria-label="Close scanner"
                className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <X size={18} />
              </button>

              {title && (
                <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold">
                  {title}
                </div>
              )}

              <div className="flex items-center gap-2">
                {flashSupported && (
                  <button
                    onClick={onToggleFlash}
                    aria-label="Toggle flash"
                    className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                  >
                    {flashOn ? <ZapOff size={17} /> : <Zap size={17} />}
                  </button>
                )}
                <button
                  onClick={onSwitchCamera}
                  aria-label="Switch camera"
                  className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                  <RefreshCw size={16} />
                </button>
                {onDone && (
                  <button
                    onClick={onDone}
                    className="px-3.5 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white text-xs font-semibold active:scale-90 transition-transform"
                  >
                    {doneLabel}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Zoom slider — pure digital zoom, so it's always available
              regardless of hardware zoom support. */}
          {showZoomSlider && !success && (
            <div
              className="absolute right-3 flex flex-col items-center gap-1.5"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            >
              <span className="text-white/80 text-[10px] font-bold bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full">
                {zoom.toFixed(1)}×
              </span>
              <div className="h-32 w-8 flex items-center justify-center">
                <input
                  type="range"
                  aria-label="Camera zoom"
                  min={zoomMin}
                  max={zoomMax}
                  step={zoomStep}
                  value={zoom}
                  onChange={e => onZoomChange(Number(e.target.value))}
                  className="accent-blue-500"
                  style={{ width: '112px', transform: 'rotate(-90deg)' }}
                />
              </div>
            </div>
          )}

          <AnimatePresence>{children}</AnimatePresence>
        </div>
      )}
    </>
  )
}
