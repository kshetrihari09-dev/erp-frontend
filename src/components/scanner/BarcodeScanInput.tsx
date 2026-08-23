/**
 * BarcodeScanInput.tsx
 *
 * The dedicated, always-focused barcode field for continuous scanning on
 * the Sale page. This is deliberately a SEPARATE field from the
 * per-row ProductSearchCell (which stays name-search-first, with its own
 * barcode fallback for when a scanner happens to be used there — see
 * ProductSearchCell.tsx). This field is the fast path: a USB/Bluetooth
 * scanner (or manual code entry) types into it and hits Enter, and
 * nothing else needs to be clicked.
 *
 * Behaviour:
 *   - No per-keystroke search, no debounce, no "Search" button — a scan
 *     is one discrete event (fast keystrokes + Enter), so we do exactly
 *     one lookup per scan, right on Enter. This is both the simplest
 *     implementation and the one that makes the fewest API calls.
 *   - A tiny in-memory cache means re-scanning the same product twice in
 *     a session (very common at a real counter) costs zero extra
 *     network round-trips after the first time.
 *   - Resolves via the exact same GET /scanner/products/barcode/:code
 *     endpoint the camera scanner already uses (see useLocalScanner.ts) —
 *     one source of truth for "what product does this code map to," so
 *     behaviour never drifts between scan methods.
 *   - Success -> onResolved(product), input clears, success beep.
 *   - Not found -> onNotFound(code), input clears, error beep.
 *   - Never throws / never shows a raw error state — a barcode that
 *     doesn't resolve is just "not found," handled by the caller's
 *     Product Not Found dialog.
 *
 * Focus is owned by the parent (SalesPage) via the exposed `focus()`
 * handle — this component never decides on its own when to steal focus
 * back, only how to react once it has it.
 */

import { useState, useRef, forwardRef, useImperativeHandle, type KeyboardEvent } from 'react'
import { ScanLine, Loader2 } from 'lucide-react'
import { scannerAPI } from '@/services/api'
import type { Product } from '@/types'
import { useOffline } from '@/offline/OfflineProvider'
import { isNetworkError } from '@/offline/syncEngine'
import { lookupByCodeOffline } from '@/offline/productLookup'
import useAuthStore from '@/store/authStore'

export interface BarcodeScanInputHandle {
  focus: () => void
}

interface Props {
  onResolved:  (product: Product) => void
  onNotFound:  (code: string) => void
  /** Fires instead of onNotFound when the backend rejects the scan with
   *  403 QR_ACCOUNT_MISMATCH — a structured QR payload printed under a
   *  different account than the one currently logged in. Optional so
   *  existing callers keep compiling unchanged; if omitted, this falls
   *  back to onNotFound(code) exactly like before (the code will just be
   *  the raw JSON text in that case, which is a worse but still-safe
   *  degradation — the mismatch is still blocked either way). */
  onAccountMismatch?: (message: string) => void
  autoFocus?:  boolean
  /** Optional override for the input's placeholder text — defaults to
   *  "Scan barcode…" below, unchanged for every existing caller. Added so
   *  SalesPage can show a mobile-specific "Scan barcode or search
   *  product…" without touching desktop/tablet, which keep passing
   *  nothing and get the original text. */
  placeholder?: string
}

// Exact copy of the message the backend returns for QR_ACCOUNT_MISMATCH
// (see erp-unified-backend/src/scanner/scannerRoutes.js) — kept as a
// literal so the UI copy is stable even if a future response shape
// changes; res.data?.code is still what actually drives the branch.
const QR_ACCOUNT_MISMATCH_MSG = 'This QR Code belongs to another account and cannot be used in the current account.'

function scannedToProduct(s: {
  id: string; item_code: string; name: string
  generic_name?: string; company_name?: string; unit: string
  sales_rate: number; purchase_rate: number; mrp: number
  vat_percent?: number; cc_pct?: number; current_stock: number
}): Product {
  return {
    id: s.id, item_code: s.item_code, name: s.name,
    generic_name: s.generic_name, company_name: s.company_name, unit: s.unit,
    sales_rate: s.sales_rate, purchase_rate: s.purchase_rate, mrp: s.mrp,
    vat_percent: s.vat_percent, cc_pct: s.cc_pct, current_stock: s.current_stock,
    min_stock: 0, is_active: true,
  }
}

// Module-level (not per-mount) so the cache survives across re-renders
// and across navigating away/back to the Sale page within the same tab.
// Deliberately never expires — product price/stock changes are already
// reflected in `current_stock`/`sales_rate` fetched fresh at post time by
// the backend, so a slightly-stale cached label here costs nothing.
const barcodeCache = new Map<string, Product>()

const BarcodeScanInput = forwardRef<BarcodeScanInputHandle, Props>(function BarcodeScanInput({
  onResolved, onNotFound, onAccountMismatch, autoFocus, placeholder,
}, ref) {
  const { isOnline } = useOffline()
  const companyId = useAuthStore(s => s.company?.id)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  async function resolve(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return

    const cached = barcodeCache.get(trimmed)
    if (cached) {
      setCode('')
      onResolved(cached)
      return
    }

    setBusy(true)

    // Offline: skip the network call entirely and resolve straight from
    // the IndexedDB catalog cache (same lookupByCodeOffline the camera
    // scanner already uses — see useLocalScanner.ts) — the same exact
    // barcode match, just against the local cache instead of the server.
    if (!isOnline) {
      try {
        const offline = companyId ? await lookupByCodeOffline(companyId, trimmed) : null
        if (offline) {
          const product = scannedToProduct(offline)
          barcodeCache.set(trimmed, product)
          setCode('')
          onResolved(product)
        } else {
          setCode('')
          onNotFound(trimmed)
        }
      } finally {
        setBusy(false)
      }
      return
    }

    try {
      const res = await scannerAPI.lookupBarcode(trimmed)
      const data = res.data?.data
      if (data) {
        const product = scannedToProduct(data)
        barcodeCache.set(trimmed, product)
        setCode('')
        onResolved(product)
      } else {
        setCode('')
        onNotFound(trimmed)
      }
    } catch (err: any) {
      // Real network failure (connection dropped mid-scan) — same
      // offline fallback as the isOnline-false branch above, rather than
      // reporting a false "not found" for a product actually in the
      // offline catalog.
      if (isNetworkError(err) && companyId) {
        const offline = await lookupByCodeOffline(companyId, trimmed)
        if (offline) {
          const product = scannedToProduct(offline)
          barcodeCache.set(trimmed, product)
          setCode('')
          onResolved(product)
          setBusy(false)
          return
        }
      }
      setCode('')
      if (err?.response?.status === 403 && err?.response?.data?.code === 'QR_ACCOUNT_MISMATCH') {
        if (onAccountMismatch) onAccountMismatch(QR_ACCOUNT_MISMATCH_MSG)
        else onNotFound(trimmed) // caller hasn't wired the dedicated handler — still blocked, just less clearly labeled
      } else {
        onNotFound(trimmed)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void resolve(code)
    }
  }

  return (
    <div className="bsi-root">
      <ScanLine size={14} className="bsi-icon" />
      <input
        ref={inputRef}
        className="bsi-input"
        value={code}
        onChange={e => setCode(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? 'Scan barcode…'}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
      />
      {busy && <Loader2 size={13} className="bsi-loading" />}
    </div>
  )
})

export default BarcodeScanInput
