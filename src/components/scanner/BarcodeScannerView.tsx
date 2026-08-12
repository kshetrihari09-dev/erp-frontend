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
 *     LocalScannerView's denied-permission screen)
 *   - hard camera-error screen
 *   - the success check animation shown for the brief beat after a scan
 *     before the caller closes the view
 *
 * Callers still own their own bottom controls (mode toggles, gallery
 * button, capture button, matches drawer, crop step, etc.) via `children`,
 * and decide which scan guide to show via `scanOverlay` — every caller
 * uses BarcodeRectOverlay, without duplicating any of the chrome above.
 */

import { useRef, useCallback, useState } from 'react'
import type { TouchEvent as ReactTouchEvent, RefObject, ReactNode, ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Zap, ZapOff, RefreshCw, CameraOff, AlertCircle, RotateCcw,
  Loader2, CheckCircle2, ImageIcon, Check,
} from 'lucide-react'
import type { CameraStatus, ScanMode } from '@/hooks/scanner/useBarcodeEngine'
import { ScanStatusPill, ScanModeToggle } from './ScannerUI'

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

  /** Optional "Done" button, bottom-right of the scanner (same row as the
   *  gallery button/zoom slider) — only rendered when a caller passes it,
   *  so scanners that don't (ProductScanModal) are completely unaffected.
   *  Meant for a continuous multi-scan flow (LocalScannerView's Sales/
   *  Purchase scanner): the X top-left already closes the scanner at any
   *  time, but after adding several items in a row, reaching back up to
   *  the top-left corner is awkward one-handed — this puts "I'm finished
   *  scanning" within the same thumb-reachable bottom area as the rest of
   *  the scanning controls. Same full teardown (camera stream stopped,
   *  decoder destroyed, scanner closed) as the X — callers typically wire
   *  this straight to the same onClose. */
  onDone?: () => void
  doneLabel?: string

  title?: string
  /** Small line under the title, e.g. "Align the barcode within the frame". */
  subtitle?: string
  scanOverlay?: ReactNode   // e.g. <BarcodeRectOverlay /> — omit to show none
  showTopBar?: boolean

  /** Compact Barcode/QR segmented toggle shown in the top bar next to the
   *  title (see ScannerUI.tsx's ScanModeToggle). Both props are required
   *  together — omit either to hide the toggle entirely, e.g. for a
   *  scanner that only ever wants one symbology. */
  scanMode?: ScanMode
  onScanModeChange?: (mode: ScanMode) => void

  /** Pill with a pulsing dot shown above the bottom controls, e.g.
   *  "Scanning barcode…" — omit to show nothing. */
  statusLabel?: string

  /** Renders a "Gallery" button in the bottom-left that opens the native
   *  file/photo picker; the picked file is handed back here to decode.
   *  Omit entirely to hide the button (e.g. while a results drawer is up). */
  onGalleryPick?: (file: File) => void
  galleryLabel?: string

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
  title, subtitle, scanOverlay, showTopBar = true,
  scanMode, onScanModeChange,
  statusLabel,
  onGalleryPick, galleryLabel = 'Gallery',
  success = false, successLabel = 'Scanned!',
  deniedExtra, children,
}: Props) {
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [galleryBusy, setGalleryBusy] = useState(false)

  const handleGalleryChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again next time
    if (!file || !onGalleryPick) return
    setGalleryBusy(true)
    try {
      await onGalleryPick(file)
    } finally {
      setGalleryBusy(false)
    }
  }, [onGalleryPick])

  // Digital-zoom presets spread across the actual [zoomMin, zoomMax] range
  // this device/session supports — never a hardcoded number that could
  // exceed it. Deduplicated so a narrow range (e.g. min===max) doesn't
  // render repeat pills.
  const zoomPresets = Array.from(new Set([
    zoomMin,
    Math.round(((zoomMin + zoomMax) / 2) * 10) / 10,
    zoomMax,
  ]))
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
              className="absolute top-0 left-0 right-0 flex items-start justify-between p-3.5"
              style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}
            >
              <button
                onClick={onClose}
                aria-label="Close scanner"
                className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform flex-shrink-0"
              >
                <X size={18} />
              </button>

              {(title || subtitle) && (
                <div className="flex-1 flex flex-col items-center px-2 pt-1.5 min-w-0">
                  {title && (
                    <p className="text-white text-base font-bold leading-tight truncate max-w-full">{title}</p>
                  )}
                  {subtitle && (
                    <p className="text-white/60 text-[11px] font-medium leading-tight mt-0.5 truncate max-w-full">{subtitle}</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 flex-shrink-0">
                {scanMode && onScanModeChange && (
                  <ScanModeToggle mode={scanMode} onChange={onScanModeChange} />
                )}
                {flashSupported && (
                  <button
                    onClick={onToggleFlash}
                    aria-label="Toggle flash"
                    className={`flex items-center gap-1.5 h-10 px-3 rounded-full backdrop-blur-md text-xs font-semibold active:scale-90 transition-all ${
                      flashOn ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white'
                    }`}
                  >
                    {flashOn ? <Zap size={15} /> : <ZapOff size={15} />}
                    {flashOn ? 'On' : 'Off'}
                  </button>
                )}
                <button
                  onClick={onSwitchCamera}
                  aria-label="Switch camera"
                  className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>{children}</AnimatePresence>

          {/* Bottom stack: status pill, then the gallery / zoom-preset row.
              Both fade with `success` so the check animation isn't crowded. */}
          {!success && (
            <div
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pointer-events-none"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
            >
              {statusLabel && (
                <div className="pointer-events-auto">
                  <ScanStatusPill label={statusLabel} />
                </div>
              )}

              {(showZoomSlider || onGalleryPick || onDone) && (
                <div className="w-full flex items-center justify-between pointer-events-auto">
                  {onGalleryPick ? (
                    <button
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={galleryBusy}
                      className="flex flex-col items-center gap-1 w-14 text-white active:scale-90 transition-transform disabled:opacity-50"
                      aria-label="Pick barcode photo from gallery"
                    >
                      <span className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
                        {galleryBusy ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                      </span>
                      <span className="text-[10px] font-medium">{galleryLabel}</span>
                    </button>
                  ) : (
                    <div className="w-14" />
                  )}

                  {showZoomSlider && (
                    <div className="flex items-center gap-1 p-1 rounded-full bg-black/45 backdrop-blur-md">
                      {zoomPresets.map(preset => {
                        const active = Math.abs(zoom - preset) < 0.15
                        return (
                          <button
                            key={preset}
                            onClick={() => onZoomChange(preset)}
                            className={`h-8 min-w-[2.25rem] px-2 rounded-full text-xs font-bold tabular-nums transition-colors ${
                              active ? 'bg-white text-slate-900' : 'text-white/80'
                            }`}
                          >
                            {preset}×
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {onDone ? (
                    <button
                      onClick={onDone}
                      aria-label="Finish scanning"
                      className="flex-shrink-0 px-4 h-10 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-90 transition-transform shadow-lg shadow-blue-900/30"
                    >
                      <Check size={14} /> {doneLabel}
                    </button>
                  ) : (
                    <div className="w-14" />
                  )}
                </div>
              )}

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleGalleryChange}
                className="hidden"
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
