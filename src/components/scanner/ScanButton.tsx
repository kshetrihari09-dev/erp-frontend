/**
 * ScanButton.tsx
 *
 * Drop this beside the "Invoice Items" header in SalesPage and PurchasePage.
 * Lazy-loads the scanner UI — zero cost on initial page load.
 *
 * NEW DEFAULT FLOW (per scanner redesign):
 *   Tap Scan → local camera opens instantly (LocalScannerView) → scan →
 *   result returned automatically → scanner closes.
 *
 * The QR / cross-device flow (ScannerModal + useScannerSession) is
 * unchanged and still fully available:
 *   - automatically, as a fallback, if this device has no camera at all
 *   - manually, via "Use Another Device" inside the local scanner view
 *
 * Usage:
 *   <ScanButton context="sales"    onResult={handleScanResult} />
 *   <ScanButton context="purchase" onResult={handleScanResult} />
 */

import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react'
import { ScanLine } from 'lucide-react'
import useScannerSession from '@/hooks/scanner/useScannerSession'
import type { ScanResult } from '@/types/scanner'

const ScannerModal     = lazy(() => import('./ScannerModal'))
const LocalScannerView = lazy(() => import('./LocalScannerView'))

interface Props {
  context:   'sales' | 'purchase'
  onResult:  (result: ScanResult) => void
  disabled?: boolean
  // Optional label/icon override so the same component can render as
  // e.g. two distinct "Scan Barcode" / "Scan Medicine" buttons without
  // duplicating any of the scanning logic below. Defaults preserve the
  // exact previous single-button copy and icon.
  label?: string
  icon?: ReactNode
  className?: string
}

// A camera counts as "available" if the browser exposes the mediaDevices
// API at all — the actual permission prompt/denial is handled inside
// LocalScannerView so the user always gets a friendly retry screen there
// rather than silently falling back.
function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export default function ScanButton({ context, onResult, disabled, label, icon, className }: Props) {
  const [localOpen, setLocalOpen] = useState(false)

  // Existing cross-device session hook — completely unchanged.
  const { state: qrState, open: openQr, close: closeQr, retry: retryQr } = useScannerSession({ context, onResult })

  const handleClick = useCallback(() => {
    if (localOpen || qrState.isOpen) {
      setLocalOpen(false)
      closeQr()
      return
    }
    if (hasCameraSupport()) {
      setLocalOpen(true)
    } else {
      // No camera on this device at all — go straight to the QR fallback.
      openQr()
    }
  }, [localOpen, qrState.isOpen, closeQr, openQr])

  const handleUseAnotherDevice = useCallback(() => {
    setLocalOpen(false)
    openQr()
  }, [openQr])

  const isActive    = localOpen || qrState.isOpen
  const isConnected = qrState.status === 'connected'
  const isDone      = qrState.status === 'done'

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        title={isActive ? 'Click to cancel scan' : (label ?? 'Scan medicine with camera')}
        className={[
          className ??
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-semibold transition-all bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50',
          isActive ? (className ? 'pos-scan-btn-active' : 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200') : '',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].filter(Boolean).join(' ')}
      >
        {isConnected
          ? <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          : (icon ?? <ScanLine size={13} className={isActive ? 'text-white' : 'text-blue-500'} />)
        }
        {isDone ? 'Added ✓' : isConnected ? 'Scanning…' : (label ?? 'Scan Medicine')}
      </button>

      <Suspense fallback={null}>
        <LocalScannerView
          open={localOpen}
          context={context}
          onResult={onResult}
          onClose={() => setLocalOpen(false)}
          onUseAnotherDevice={handleUseAnotherDevice}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ScannerModal state={qrState} context={context} onClose={closeQr} onRetry={retryQr} />
      </Suspense>
    </>
  )
}
