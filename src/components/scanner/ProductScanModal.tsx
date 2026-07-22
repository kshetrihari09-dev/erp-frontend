/**
 * ProductScanModal.tsx
 *
 * Full-screen camera scanner used from Product Setup — separate from the
 * billing scanner (ScanButton / LocalScannerView), which looks up existing
 * products. This one is for CREATING a product:
 *
 *   - "barcode" mode: point the camera at a barcode; the decoded value is
 *     handed back (after a brief success beat, same as the billing
 *     scanner) so the caller can drop it straight into the Barcode field.
 *   - "label" mode: point the camera at the product box/label and tap
 *     Capture; the frame is OCR'd with Tesseract.js and the extracted text
 *     is parsed into candidate fields (name, generic name, company, MRP)
 *     which the caller shows in an editable review step before applying —
 *     OCR off real packaging is never 100% reliable, so the user always
 *     confirms before anything is written to the form.
 *
 * All camera chrome — the video, circular scan overlay, top glass bar
 * (close/flash/switch camera), zoom slider, permission/error/loading
 * states, and the success check animation — is the single shared
 * BarcodeScannerView component (see BarcodeScannerView.tsx), the exact
 * same component LocalScannerView (the billing scanner) renders. Only
 * what's specific to product creation lives here: the label/barcode mode
 * toggle, the Capture button, and the crop → OCR flow.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ScanLine, Type, ImageIcon, CheckCircle2, Loader2,
} from 'lucide-react'
import useProductCapture, { type CaptureMode } from '@/hooks/scanner/useProductCapture'
import CropOverlay from './CropOverlay'
import { BarcodeCircleOverlay } from './ScannerUI'
import BarcodeScannerView from './BarcodeScannerView'
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
  const [mode, setMode]       = useState<CaptureMode>(initialMode)
  const [success, setSuccess] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Same "brief success beat, then hand off" flow as LocalScannerView's
  // handleResult — a decoded barcode is never applied instantly and
  // silently; the person sees a green check first.
  const handleBarcode = useCallback((code: string) => {
    try { navigator.vibrate?.(60) } catch {}
    setSuccess(true)
    setTimeout(() => { onBarcode(code); onClose() }, 550)
  }, [onBarcode, onClose])

  const handleOcrText = useCallback((text: string) => {
    try { navigator.vibrate?.(40) } catch {}
    onOcrText(text)
  }, [onOcrText])

  const {
    state, videoRef, containerRef, captureFrame, selectFileForCrop, confirmCrop, cancelCrop,
    retryPermission, setZoom, toggleFlash, switchCamera,
  } = useProductCapture({ active: open, mode, onBarcode: handleBarcode, onOcrText: handleOcrText })

  // Reset the success beat if the modal is re-opened for another scan.
  useEffect(() => { if (open) setSuccess(false) }, [open])

  if (!open) return null

  const showDrawer = state.status === 'cropping' || state.status === 'ocr-running'
  // BarcodeScannerView renders the camera whenever the shared engine
  // reports 'ready' — 'cropping'/'ocr-running' both happen with the
  // camera still live underneath (crop overlay / OCR spinner render on
  // top as siblings below), so they map onto 'ready' too.
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
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: Z_INDEX }}
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
          title={mode === 'barcode' ? 'Scan Barcode' : 'Scan Product Label'}
          scanOverlay={
            !showDrawer
              ? (mode === 'barcode'
                  ? <BarcodeCircleOverlay />
                  : (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="border-2 rounded-2xl border-purple-400/80" style={{ width: '84%', height: '55%' }} />
                    </div>
                  ))
              : undefined
          }
          success={success}
          successLabel="Barcode captured!"
        >
          {state.error && !showDrawer && (
            <div className="absolute bottom-[132px] left-4 right-4 flex justify-center pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-red-500/90 text-white text-xs font-medium text-center">
                {state.error}
              </div>
            </div>
          )}

          {/* Bottom controls */}
          {!showDrawer && (
            <div
              key="bottom-controls"
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-2"
              style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}
            >
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
          )}

          <input
            ref={galleryInputRef}
            type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) selectFileForCrop(f); e.target.value = '' }}
          />
        </BarcodeScannerView>

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
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
