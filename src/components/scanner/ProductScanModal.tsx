/**
 * ProductScanModal.tsx
 *
 * Full-screen camera scanner used from Product Setup — separate from the
 * billing scanner (ScanButton / LocalScannerView), which looks up existing
 * products. This one is for CREATING a product: point the camera at a
 * barcode; the decoded value is handed back (after a brief success beat,
 * same as the billing scanner) so the caller can drop it straight into
 * the Barcode field.
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
  open:        boolean
  onBarcode:   (code: string) => void
  onClose:     () => void
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
    retryPermission, setZoom, toggleFlash, switchCamera, scanFromGallery,
    scanMode, setScanMode,
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
          onRetryPermission={retryPermission}
          title="Scan Barcode"
          subtitle={scanMode === 'qr' ? 'Align the QR code within the frame' : 'Align the barcode within the frame'}
          scanOverlay={<BarcodeRectOverlay />}
          statusLabel={state.status === 'ready' && !success ? (scanMode === 'qr' ? 'Scanning QR…' : 'Scanning barcode…') : undefined}
          scanMode={scanMode}
          onScanModeChange={setScanMode}
          onGalleryPick={scanFromGallery}
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

          {/* "No barcode found" feedback after a gallery pick that didn't
              decode — centered mid-screen, clear of the bottom controls. */}
          {state.notice && (
            <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: '58%' }}>
              <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white/90 text-xs font-medium">
                {state.notice}
              </div>
            </div>
          )}
        </BarcodeScannerView>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
