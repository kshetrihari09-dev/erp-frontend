/**
 * ProductScanModal.tsx
 *
 * Full-screen camera scanner used from Product Setup — separate from the
 * billing scanner (ScanButton / LocalScannerView), which looks up existing
 * products. This one is for CREATING a product:
 *
 *   - "barcode" mode: point the camera at a barcode; the decoded value is
 *     handed back immediately (no server lookup) so the caller can drop it
 *     straight into the Barcode field.
 *   - "label" mode: point the camera at the product box/label and tap
 *     Capture; the frame is OCR'd with Tesseract.js and the extracted text
 *     is parsed into candidate fields (name, generic name, company, MRP)
 *     which the caller shows in an editable review step before applying —
 *     OCR off real packaging is never 100% reliable, so the user always
 *     confirms before anything is written to the form.
 */

import { useRef, useState, useCallback } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Zap, ScanLine, Type, CameraOff, AlertCircle,
  RotateCcw, Loader2, ImageIcon, CheckCircle2,
} from 'lucide-react'
import useProductCapture, { type CaptureMode, MIN_ZOOM, MAX_ZOOM } from '@/hooks/scanner/useProductCapture'
import CropOverlay from './CropOverlay'
import { Z } from '@/styles/zIndex'

const Z_INDEX = Z.scanner

interface Props {
  open:        boolean
  initialMode: CaptureMode
  onBarcode:   (code: string) => void
  onOcrText:   (text: string) => void
  onClose:     () => void
}

export default function ProductScanModal({ open, initialMode, onBarcode, onOcrText, onClose }: Props) {
  const [mode, setMode] = useState<CaptureMode>(initialMode)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const handleBarcode = useCallback((code: string) => {
    try { navigator.vibrate?.(60) } catch {}
    onBarcode(code)
  }, [onBarcode])

  const handleOcrText = useCallback((text: string) => {
    try { navigator.vibrate?.(40) } catch {}
    onOcrText(text)
  }, [onOcrText])

  const { state, videoRef, captureFrame, selectFileForCrop, confirmCrop, cancelCrop, retryPermission, setZoom } =
    useProductCapture({ active: open, mode, onBarcode: handleBarcode, onOcrText: handleOcrText })

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────
  // setZoom() is a plain synchronous state update (see useProductCapture.ts —
  // deliberately not tied to async hardware zoom constraints), so tracking
  // it 1:1 with the pinch gesture on every touchmove is inherently smooth:
  // no network/driver round-trip ever sits between the finger and the frame.
  const pinchStartDist = useRef<number | null>(null)
  const pinchStartZoom = useRef(MIN_ZOOM)

  const touchDistance = (touches: ReactTouchEvent['touches']) => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist.current = touchDistance(e.touches)
      pinchStartZoom.current = state.zoom
    }
  }, [state.zoom])

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault()
      const ratio = touchDistance(e.touches) / pinchStartDist.current
      setZoom(pinchStartZoom.current * ratio)
    }
  }, [setZoom])

  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null
  }, [])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="bg-black flex flex-col overflow-hidden"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: Z_INDEX }}
      >
        {/* ── Denied permission ─────────────────────────────────────────── */}
        {state.status === 'denied' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
              <CameraOff size={28} className="text-red-400" />
            </div>
            <p className="text-white font-bold text-lg mb-2">Camera access needed</p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
              Allow camera access to scan a barcode or product label.
            </p>
            <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
              <button onClick={retryPermission}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
                <RotateCcw size={14} /> Try Again
              </button>
              <button onClick={onClose}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-400 text-xs font-medium">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Hard error ────────────────────────────────────────────────── */}
        {state.status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <p className="text-white font-bold text-lg mb-2">Scanner error</p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">{state.error}</p>
            <button onClick={onClose}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm">
              Close
            </button>
          </div>
        )}

        {/* ── Requesting permission ────────────────────────────────────────── */}
        {state.status === 'requesting-permission' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 size={26} className="text-blue-400 animate-spin" />
            <p className="text-white/70 text-sm">Opening camera…</p>
          </div>
        )}

        {/* ── Camera view ───────────────────────────────────────────────── */}
        {state.status === 'ready' && (
          <div
            className="relative flex-1 overflow-hidden bg-black"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <video
              ref={videoRef}
              playsInline muted autoPlay
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: `scale(${state.zoom})`, transformOrigin: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65 pointer-events-none" />

            {/* Frame guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`border-2 rounded-2xl ${mode === 'barcode' ? 'border-blue-400/80' : 'border-purple-400/80'}`}
                style={mode === 'barcode' ? { width: '78%', height: 120 } : { width: '84%', height: '55%' }}
              />
            </div>

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3.5"
                 style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}>
              <button onClick={onClose} aria-label="Close scanner"
                className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform">
                <X size={18} />
              </button>
              <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold">
                {mode === 'barcode' ? 'Scan Barcode' : 'Scan Product Label'}
              </div>
              <div className="w-10" />
            </div>

            {state.error && (
              <div className="absolute bottom-[132px] left-4 right-4 flex justify-center pointer-events-none">
                <div className="px-3 py-2 rounded-lg bg-red-500/90 text-white text-xs font-medium text-center">
                  {state.error}
                </div>
              </div>
            )}

            {/* Zoom slider — pure digital zoom (CSS scale + matching canvas
                crop in useProductCapture.ts), so unlike hardware zoom it
                needs no capability check and is always available here.
                Pinch-to-zoom (handlers on the container above) works
                alongside it for touch devices. */}
            <div
              className="absolute right-3 flex flex-col items-center gap-1.5"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            >
              <span className="text-white/80 text-[10px] font-bold bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full">
                {state.zoom.toFixed(1)}×
              </span>
              <div className="h-32 w-8 flex items-center justify-center">
                <input
                  type="range"
                  aria-label="Camera zoom"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.1}
                  value={state.zoom}
                  onChange={e => setZoom(Number(e.target.value))}
                  className="accent-blue-500"
                  style={{ width: '112px', transform: 'rotate(-90deg)' }}
                />
              </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-2"
                 style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}>

              {mode === 'label' && (
                <button
                  onClick={captureFrame}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-full font-semibold text-sm active:scale-95 transition-transform"
                >
                  <CheckCircle2 size={16} /> Capture
                </button>
              )}

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Scan from gallery"
                  className="w-12 h-12 rounded-full bg-white/12 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                  <ImageIcon size={19} />
                </button>
                <button
                  onClick={() => setMode('barcode')}
                  aria-label="Barcode mode"
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                    mode === 'barcode' ? 'bg-blue-600 text-white' : 'bg-white/15 backdrop-blur-md text-white'
                  }`}
                >
                  <ScanLine size={22} />
                </button>
                <button
                  onClick={() => setMode('label')}
                  aria-label="Label / OCR mode"
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                    mode === 'label' ? 'bg-purple-600 text-white' : 'bg-white/15 backdrop-blur-md text-white'
                  }`}
                >
                  <Type size={22} />
                </button>
                <div className="w-12" />
              </div>

              <p className="text-white/60 text-[11px] font-medium">
                {mode === 'barcode' ? 'Hold steady over the barcode' : 'Frame the label, then tap Capture'}
              </p>
            </div>

            <input
              ref={galleryInputRef}
              type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) selectFileForCrop(f); e.target.value = '' }}
            />
          </div>
        )}

        {/* ── Crop step (label mode only) — tighten the box, then OCR runs ── */}
        {state.status === 'cropping' && state.cropSource && (
          <CropOverlay
            src={state.cropSource.url}
            naturalWidth={state.cropSource.naturalWidth}
            naturalHeight={state.cropSource.naturalHeight}
            suggestedRect={state.cropSource.suggested}
            onConfirm={confirmCrop}
            onCancel={cancelCrop}
          />
        )}

        {/* ── OCR running on the cropped region ────────────────────────────── */}
        {state.status === 'ocr-running' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-black">
            <Loader2 size={26} className="text-purple-300 animate-spin" />
            <p className="text-white text-sm font-medium">Reading text… {state.ocrProgress}%</p>
          </div>
        )}

        {/* Gallery file picker also needs to be reachable from the barcode-only
            camera view above; the input itself lives inside the 'ready' block. */}
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
