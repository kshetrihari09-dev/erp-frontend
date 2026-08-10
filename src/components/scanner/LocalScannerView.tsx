/**
 * LocalScannerView.tsx
 *
 * The default scanner entry point for Sales/Purchase: full-screen camera
 * opens instantly, barcode scanning starts automatically, and a result is
 * returned the moment a match is picked — no QR, no second device, no
 * waiting screen.
 *
 * All camera chrome — the video, circular scan overlay, top glass bar
 * (close/flash/switch camera), zoom slider, permission/error/loading
 * states, and the success check animation — is the single shared
 * BarcodeScannerView component (see BarcodeScannerView.tsx), the exact
 * same component ProductScanModal (Product Add's scanner) renders. Only
 * what's specific to billing lookups lives here: the mode badge, the
 * "no match yet" notice, and the matches bottom sheet.
 *
 * CONTINUOUS MULTI-SCAN (billing flow):
 *   Tap Scan once → camera opens → scan item #1 → product added → beep +
 *   vibrate + a brief green "Added!" flash (~200ms) → scanning resumes
 *   automatically (camera stays open the whole time, so there's no
 *   re-permission/reopen delay) → scan item #2 → ... The user only taps
 *   the ✕ (top-right, via onClose) when they're done adding items — that's
 *   the one and only thing that closes the camera and this view.
 */

import { useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, RotateCcw, Loader2 } from 'lucide-react'
import useLocalScanner from '@/hooks/scanner/useLocalScanner'
import type { ScanResult } from '@/types/scanner'
import { ModeBadge, ProductCard, BarcodeRectOverlay } from './ScannerUI'
import BarcodeScannerView from './BarcodeScannerView'
import { Z } from '@/styles/zIndex'
import { playSuccessBeep } from '@/utils/beep'

// Full-screen scanner overlay — see src/styles/zIndex.ts for the app-wide
// stacking scale this belongs to. Scanners sit above regular
// dropdowns/modals since they can be launched while other UI is open.
const SCANNER_Z_INDEX = Z.scanner

interface Props {
  open:     boolean
  context:  'sales' | 'purchase'
  onResult: (result: ScanResult) => void
  onClose:  () => void
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch {}
}

export default function LocalScannerView({ open, context, onResult, onClose }: Props) {
  const vibratedRef      = useRef(false)

  // rescan() only exists once useLocalScanner has been called below, but
  // handleResult (passed INTO that same hook as onResult) needs to invoke
  // it — a ref sidesteps the chicken-and-egg ordering rather than
  // restructuring the hook to take a resume callback.
  const rescanRef = useRef<() => void>(() => {})

  const handleResult = useCallback((result: ScanResult) => {
    playSuccessBeep()
    vibrate(60)
    onResult(result)
    // Brief success beat — beep, vibrate, green "Added!" flash — then
    // automatically resume scanning for the next item. The camera is
    // never closed in between (see useLocalScanner's selectProduct), so
    // this resume is instant. The scanner only closes when the user taps
    // the ✕ (onClose), never automatically.
    setTimeout(() => rescanRef.current(), 200)
  }, [onResult])

  const {
    state, videoRef, containerRef, toggleFlash, switchCamera, setZoom,
    selectProduct, rescan, retryPermission,
  } = useLocalScanner({ context, onResult: handleResult, active: open })

  useEffect(() => { rescanRef.current = rescan }, [rescan])

  // One vibration pulse the moment matches are found (device support only)
  if (state.status === 'matches' && !vibratedRef.current) {
    vibratedRef.current = true
    vibrate(40)
  } else if (state.status !== 'matches' && vibratedRef.current) {
    vibratedRef.current = false
  }

  if (!open) return null

  const showDrawer = state.status === 'matches' || state.status === 'submitting'
  // BarcodeScannerView renders the camera whenever the shared engine
  // reports 'ready' — map every one of this hook's "camera is up" states
  // onto that, mirroring the engine's own CameraStatus type.
  const cameraStatus =
    state.status === 'denied' ? 'denied' :
    state.status === 'error'  ? 'error'  :
    state.status === 'requesting-permission' ? 'requesting-permission' :
    'ready'

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
        <BarcodeScannerView
          cameraStatus={cameraStatus}
          error={state.error}
          videoRef={videoRef}
          containerRef={containerRef}
          zoom={state.zoom} zoomMin={state.zoomMin} zoomMax={state.zoomMax} zoomStep={state.zoomStep}
          onZoomChange={setZoom}
          showZoomSlider={!showDrawer}
          flashOn={state.flashOn} flashSupported={state.flashSupported}
          onToggleFlash={toggleFlash}
          onSwitchCamera={switchCamera}
          onClose={onClose}
          onRetryPermission={retryPermission}
          scanOverlay={state.status === 'scanning' ? <BarcodeRectOverlay /> : undefined}
          success={state.status === 'done'}
          successLabel="Added!"
        >
          {/* ── Extra overlays specific to this scanner ── */}
          {/* "No match yet" notice stays centered mid-screen, well clear
              of the bottom controls, so it's unaffected by this. */}
          {state.status === 'scanning' && state.notice && (
            <motion.div
              key="notice"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute left-0 right-0 flex justify-center pointer-events-none"
              style={{ top: '58%' }}
            >
              <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white/90 text-xs font-medium">
                {state.notice}
              </div>
            </motion.div>
          )}

          {/* ── Bottom controls ──────────────────────────────────────────── */}
          {!showDrawer && state.status === 'scanning' && (
            <div
              key="bottom-controls"
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-2 pointer-events-none"
              style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}
            >
              <ModeBadge mode={state.mode} />
            </div>
          )}
        </BarcodeScannerView>

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
                    {state.lastBarcode ? `Barcode: ${state.lastBarcode}` : 'Tap to add to invoice'}
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
