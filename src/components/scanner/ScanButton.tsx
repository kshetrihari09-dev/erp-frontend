/**
 * ScanButton.tsx
 *
 * Drop this beside the "Invoice Items" header in SalesPage and PurchasePage.
 * Lazy-loads the scanner UI — zero cost on initial page load.
 *
 * FLOW:
 *   Tap Scan → local camera opens instantly (LocalScannerView) → scan →
 *   result returned automatically → scanner closes.
 *
 * If this device has no camera at all, the button is disabled with an
 * explanatory title rather than opening anything — there is no
 * cross-device fallback.
 *
 * Usage:
 *   <ScanButton context="sales"    onResult={handleScanResult} />
 *   <ScanButton context="purchase" onResult={handleScanResult} />
 */

import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react'
import { ScanLine } from 'lucide-react'
import type { ScanResult } from '@/types/scanner'

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
// rather than silently failing.
function hasCameraSupport(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export default function ScanButton({ context, onResult, disabled, label, icon, className }: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const cameraSupported = hasCameraSupport()

  const handleClick = useCallback(() => {
    if (localOpen) { setLocalOpen(false); return }
    if (cameraSupported) setLocalOpen(true)
  }, [localOpen, cameraSupported])

  const isActive = localOpen
  const isDisabled = disabled || !cameraSupported

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isDisabled}
        title={
          !cameraSupported
            ? 'No camera available on this device'
            : isActive ? 'Click to cancel scan' : (label ?? 'Scan medicine with camera')
        }
        className={[
          className ??
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-semibold transition-all bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50',
          isActive ? (className ? 'pos-scan-btn-active' : 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200') : '',
          isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].filter(Boolean).join(' ')}
      >
        {icon ?? <ScanLine size={13} className={isActive ? 'text-white' : 'text-blue-500'} />}
        {label ?? 'Scan Medicine'}
      </button>

      <Suspense fallback={null}>
        <LocalScannerView
          open={localOpen}
          context={context}
          onResult={onResult}
          onClose={() => setLocalOpen(false)}
        />
      </Suspense>
    </>
  )
}
