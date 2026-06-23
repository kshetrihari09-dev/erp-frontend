/**
 * ScanButton.tsx
 *
 * Drop this beside the "Invoice Items" header in SalesPage and PurchasePage.
 * Lazy-loads ScannerModal — zero cost on initial page load.
 *
 * Usage:
 *   <ScanButton context="sales"    onResult={handleScanResult} />
 *   <ScanButton context="purchase" onResult={handleScanResult} />
 */

import { lazy, Suspense, useCallback } from 'react'
import { ScanLine } from 'lucide-react'
import useScannerSession from '@/hooks/scanner/useScannerSession'
import type { ScanResult } from '@/types/scanner'

const ScannerModal = lazy(() => import('./ScannerModal'))

interface Props {
  context:   'sales' | 'purchase'
  onResult:  (result: ScanResult) => void
  disabled?: boolean
}

export default function ScanButton({ context, onResult, disabled }: Props) {
  const { state, open, close, retry } = useScannerSession({ context, onResult })

  const handleClick = useCallback(() => {
    if (state.isOpen) close(); else open()
  }, [state.isOpen, open, close])

  const isActive    = state.isOpen
  const isConnected = state.status === 'connected'
  const isDone      = state.status === 'done'

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        title={isActive ? 'Click to cancel scan' : 'Scan medicine with phone camera'}
        className={[
          'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-semibold transition-all',
          isActive
            ? 'bg-brand text-white border-brand shadow-sm'
            : 'bg-[var(--surface)] text-[var(--text-3)] border-[var(--border-2)] hover:border-brand hover:text-brand hover:bg-[var(--brand-light)]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {isConnected
          ? <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          : <ScanLine size={13} className={isActive ? 'text-white' : 'text-brand'} />
        }
        {isDone ? 'Added ✓' : isConnected ? 'Scanning…' : 'Scan Medicine'}
      </button>

      <Suspense fallback={null}>
        <ScannerModal state={state} context={context} onClose={close} onRetry={retry} />
      </Suspense>
    </>
  )
}
