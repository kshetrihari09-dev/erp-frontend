/**
 * LocalScannerView.tsx
 *
 * The new default scanner entry point: full-screen camera opens instantly,
 * scanning starts automatically (barcode → OCR fallback, exactly as before),
 * and a result is returned the moment a match is picked — no QR, no second
 * device, no waiting screen.
 *
 * The QR / cross-device flow (ScannerModal + useScannerSession) is untouched
 * and still available — via the "Use Another Device" affordance here, which
 * simply closes this view and opens that existing modal.
 *
 * Lazy-loaded from ScanButton so it (and its zxing/tesseract dependencies)
 * cost nothing until a user actually opens the scanner.
 */

import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Zap, ZapOff, RefreshCw, ImageIcon, ScanLine, Type,
  CheckCircle2, AlertCircle, CameraOff, RotateCcw, Smartphone, Loader2,
} from 'lucide-react'
import useLocalScanner from '@/hooks/scanner/useLocalScanner'
import type { ScanResult } from '@/types/scanner'
import { ScanFrame, ModeBadge, ProductCard } from './ScannerUI'

// Highest z-index used anywhere in this codebase is `.psc-dropdown` at
// 99999 (globals.css) — a mobile product-search combobox that can still be
// mounted when the scanner opens. The scanner must always win, so this is
// set well above that (and above .sidebar 200 / .topbar 100 / toasts 9999).
const SCANNER_Z_INDEX = 999999

interface Props {
  open:               boolean
  context:            'sales' | 'purchase'
  onResult:           (result: ScanResult) => void
  onClose:            () => void
  onUseAnotherDevice: () => void
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch {}
}

export default function LocalScannerView({ open, context, onResult, onClose, onUseAnotherDevice }: Props) {
  const [showSettingsHelp, setShowSettingsHelp] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const vibratedRef      = useRef(false)

  const handleResult = useCallback((result: ScanResult) => {
    vibrate(60)
    onResult(result)
    // Brief success beat so the green check + "Added" state is visible,
    // then close automatically — per the "auto-return + close" flow.
    setTimeout(() => onClose(), 650)
  }, [onResult, onClose])

  const {
    state, videoRef, toggleFlash, switchCamera, setMode,
    selectProduct, rescan, retryPermission, scanImageFile,
  } = useLocalScanner({ context, onResult: handleResult, active: open })

  // One vibration pulse the moment matches are found (device support only)
  if (state.status === 'matches' && !vibratedRef.current) {
    vibratedRef.current = true
    vibrate(40)
  } else if (state.status !== 'matches' && vibratedRef.current) {
    vibratedRef.current = false
  }

  if (!open) return null

  const showDrawer = state.status === 'matches' || state.status === 'submitting'

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="bg-black flex flex-col overflow-hidden"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: SCANNER_Z_INDEX,
        }}
      >
        {/* ── Denied permission ────────────────────────────────────────────── */}
        {state.status === 'denied' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
              <CameraOff size={28} className="text-red-400" />
            </div>
            <p className="text-white font-bold text-lg mb-2">Camera access needed</p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
              We need permission to use your camera to scan barcodes and medicine packaging.
            </p>
            <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
              <button
                onClick={retryPermission}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm"
              >
                <RotateCcw size={14} /> Try Again
              </button>
              <button
                onClick={() => setShowSettingsHelp(v => !v)}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm"
              >
                Open Camera Settings
              </button>
              <button
                onClick={onUseAnotherDevice}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-400 text-xs font-medium mt-1"
              >
                <Smartphone size={13} /> Use Another Device Instead
              </button>
            </div>
            {showSettingsHelp && (
              <div className="mt-5 max-w-xs text-xs text-slate-400 bg-white/5 border border-white/10 rounded-xl p-3.5 text-left leading-relaxed">
                Your browser blocks apps from opening settings directly. Look for a camera/lock icon
                in your address bar, or go to your browser/phone Settings → Site or App Permissions →
                Camera, and allow access for this app.
              </div>
            )}
          </div>
        )}

        {/* ── Hard error (no camera device, etc.) ─────────────────────────── */}
        {state.status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <p className="text-white font-bold text-lg mb-2">Scanner error</p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">{state.error}</p>
            <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
              <button onClick={rescan} className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm">
                <RotateCcw size={14} /> Try Again
              </button>
              <button onClick={onUseAnotherDevice} className="flex items-center justify-center gap-2 px-5 py-2.5 text-slate-400 text-xs font-medium">
                <Smartphone size={13} /> Use Another Device Instead
              </button>
            </div>
          </div>
        )}

        {/* ── Requesting permission (camera opening) ──────────────────────── */}
        {state.status === 'requesting-permission' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 size={26} className="text-blue-400 animate-spin" />
            <p className="text-white/70 text-sm">Opening camera…</p>
          </div>
        )}

        {/* ── Camera + scanning UI ─────────────────────────────────────────── */}
        {(state.status === 'scanning' || state.status === 'matches' || state.status === 'submitting' || state.status === 'done') && (
          <div className="relative flex-1 overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline muted autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65 pointer-events-none" />

            {state.status === 'scanning' && <ScanFrame mode={state.mode} />}

            {/* Success overlay */}
            {state.status === 'done' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.4 }}
                  className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40"
                >
                  <CheckCircle2 size={38} className="text-white" />
                </motion.div>
                <p className="text-white font-bold text-base">Added!</p>
              </div>
            )}

            {/* ── Top glass bar ──────────────────────────────────────────── */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3.5"
                 style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}>
              <button
                onClick={onClose}
                aria-label="Close scanner"
                className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleFlash}
                  aria-label="Toggle flash"
                  className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                  {state.flashOn ? <ZapOff size={17} /> : <Zap size={17} />}
                </button>
                <button
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {/* Mode badge */}
            {state.status === 'scanning' && (
              <div className="absolute bottom-[132px] left-0 right-0 flex justify-center pointer-events-none">
                <ModeBadge mode={state.mode} ocrProgress={state.ocrProgress} />
              </div>
            )}

            {/* ── Bottom controls ────────────────────────────────────────── */}
            {!showDrawer && (
              <div
                className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-2"
                style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}
              >
                <button
                  onClick={onUseAnotherDevice}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-white/80 text-xs font-medium"
                >
                  <Smartphone size={12} /> Use Another Device
                </button>

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
                      state.mode === 'barcode' ? 'bg-blue-600 text-white' : 'bg-white/15 backdrop-blur-md text-white'
                    }`}
                  >
                    <ScanLine size={22} />
                  </button>
                  <button
                    onClick={() => setMode('ocr')}
                    aria-label="OCR mode"
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                      state.mode === 'ocr' ? 'bg-purple-600 text-white' : 'bg-white/12 backdrop-blur-md text-white'
                    }`}
                  >
                    <Type size={19} />
                  </button>
                </div>

                <input
                  ref={galleryInputRef}
                  type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) scanImageFile(f); e.target.value = '' }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Matches bottom sheet ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showDrawer && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[72vh] flex flex-col overflow-hidden"
            >
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-100 flex-shrink-0">
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {state.matches.length === 1 ? 'Medicine Found' : `${state.matches.length} Matches`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {state.lastBarcode
                      ? `Barcode: ${state.lastBarcode}`
                      : state.lastOcrText
                      ? `Text: "${state.lastOcrText.slice(0, 35)}…"`
                      : 'Tap to add to invoice'}
                  </p>
                </div>
                <button onClick={rescan} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                  <X size={13} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2">
                {state.status === 'submitting' ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 size={24} className="text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Adding to invoice…</p>
                  </div>
                ) : (
                  state.matches.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} onSelect={selectProduct} />
                  ))
                )}
              </div>

              {state.status === 'matches' && (
                <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                  <button onClick={rescan} className="w-full h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 flex items-center justify-center gap-2">
                    <RotateCcw size={12} /> Scan Again
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
