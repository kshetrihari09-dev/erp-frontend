/**
 * ProductScanModal.tsx
 *
 * Full-screen camera scanner used from Product Setup — separate from the
 * billing scanner (ScanButton / LocalScannerView), which looks up existing
 * products. This one is for CREATING a product: point the camera at a
 * barcode, and the decoded value is handed back (after a brief success
 * beat, same as the billing scanner) so the caller can drop it straight
 * into the Barcode field.
 *
 * OCR label-scanning ("Scan Product Label" — photograph the medicine
 * box, run Tesseract, parse the extracted text into candidate name/
 * generic name/company/MRP fields) has been removed. This modal now only
 * ever does barcode capture.
 *
 * All camera chrome — the video, circular scan overlay, top glass bar
 * (close/flash/switch camera), zoom slider, permission/error/loading
 * states, and the success check animation — is the single shared
 * BarcodeScannerView component (see BarcodeScannerView.tsx), the exact
 * same component LocalScannerView (the billing scanner) renders.
 */

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import useProductCapture from '@/hooks/scanner/useProductCapture'
import { BarcodeRectOverlay } from './ScannerUI'
import BarcodeScannerView from './BarcodeScannerView'
import { Z } from '@/styles/zIndex'

const Z_INDEX = Z.scanner

interface Props {
  open:      boolean
  onBarcode: (code: string) => void
  onClose:   () => void
}

export default function ProductScanModal({ open, onBarcode, onClose }: Props) {
  const [success, setSuccess] = useState(false)

  // Same "brief success beat, then hand off" flow as LocalScannerView's
  // handleResult — a decoded barcode is never applied instantly and
  // silently; the person sees a green check first.
  const handleBarcode = useCallback((code: string) => {
    try { navigator.vibrate?.(60) } catch {}
    setSuccess(true)
    setTimeout(() => { onBarcode(code); onClose() }, 550)
  }, [onBarcode, onClose])

  const {
    state, videoRef, containerRef,
    retryPermission, setZoom, toggleFlash, switchCamera,
  } = useProductCapture({ active: open, onBarcode: handleBarcode })

  // Reset the success beat if the modal is re-opened for another scan.
  useEffect(() => { if (open) setSuccess(false) }, [open])

  if (!open) return null

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
          showZoomSlider
          flashOn={state.flashOn} flashSupported={state.flashSupported}
          onToggleFlash={toggleFlash}
          onSwitchCamera={switchCamera}
          onClose={onClose}
          onDone={onClose}
          onRetryPermission={retryPermission}
          title="Scan Barcode"
          scanOverlay={<BarcodeRectOverlay />}
          success={success}
          successLabel="Barcode captured!"
        >
          {state.error && (
            <div className="absolute bottom-[132px] left-4 right-4 flex justify-center pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-red-500/90 text-white text-xs font-medium text-center">
                {state.error}
              </div>
            </div>
          )}

          <div
            key="bottom-controls"
            className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 px-4 pb-2"
            style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}
          >
            <p className="text-white/60 text-[11px] font-medium">Hold steady over the barcode</p>
          </div>
        </BarcodeScannerView>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
