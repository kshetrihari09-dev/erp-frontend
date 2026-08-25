/**
 * UnifiedProductInput.tsx
 *
 * ONE product-entry field for Sale/Purchase that replaces the previously
 * separate "dedicated barcode field" + "desktop-only camera button" +
 * "mobile-only camera/QR button row" combo with a single component that's
 * mounted exactly once and works identically (and responsively, via plain
 * flex-wrap — not CSS breakpoint duplication) on desktop, tablet, and
 * mobile. See BatchSelect.tsx's isRootVisible() fix for the bug that
 * pattern caused when it was applied per-invoice-row; this component
 * avoids it from the start by never having more than one mounted copy.
 *
 * Supports, through ONE input:
 *   - Hardware/Bluetooth scanner input (types the code, sends Enter/Tab)
 *   - Manual barcode / item-code entry
 *   - Product name search
 *   - Generic name / company name / item-code ("SKU") fuzzy search
 *   - Search suggestions, keyboard-navigable
 *   - Camera barcode scan + camera QR scan (via the existing ScanButton /
 *     LocalScannerView pipeline — untouched, just wired in twice with
 *     different initialMode)
 *
 * Behaviour:
 *   - Typing 2+ chars runs a 200ms-debounced GET /scanner/products/fuzzy
 *     (name + generic_name + company_name + item_code — see
 *     scannerRoutes.js) and shows a suggestion dropdown.
 *   - Enter/Tab with a suggestion highlighted selects it.
 *   - Enter/Tab with NO suggestion highlighted (empty dropdown, or fired
 *     before the debounce even resolves — the common case for a fast
 *     hardware scanner "type + Enter") tries one exact
 *     GET /scanner/products/barcode/:code lookup instead. This is what
 *     makes a raw barcode "just work" through the same field a cashier
 *     is also typing product names into.
 *   - A suggestion picked from fuzzy search only carries name/code/price
 *     fields (no stock/batches — see scannerAPI.fuzzySearch's return
 *     type), so selecting one does one more lookupBarcode(item_code) to
 *     hydrate the full record before calling onProductResolved — the
 *     exact same hydration LocalScannerView already does for a camera
 *     scan, so every path ends up with an identically "full" Product.
 *   - Camera barcode/QR scans resolve through the same onProductResolved
 *     callback — see the ARCHITECTURE note in the Sales/Purchase page for
 *     why that single shared callback matters (it's where the actual
 *     "add to invoice vs. bump existing qty" business logic lives, so it
 *     never has to be duplicated per input method).
 *   - Offline: search and barcode lookups both fall back to the same
 *     IndexedDB catalog (offline/productLookup.ts) every other scan path
 *     already uses, so this one field keeps working without a network
 *     connection the same way BarcodeScanInput/ProductSearchCell did.
 */

import {
  useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle,
  type KeyboardEvent,
} from 'react'
import { Search, ScanLine, QrCode, Loader2, PackageSearch } from 'lucide-react'
import { scannerAPI } from '@/services/api'
import type { Product } from '@/types'
import type { ScannedProduct, ScanResult } from '@/types/scanner'
import type { ScanMode } from '@/hooks/scanner/useBarcodeEngine'
import ScanButton from '@/components/scanner/ScanButton'
import { useOffline } from '@/offline/OfflineProvider'
import { isNetworkError } from '@/offline/syncEngine'
import { lookupByCodeOffline, searchProductsOffline, toProduct } from '@/offline/productLookup'
import useAuthStore from '@/store/authStore'

// Exact copy of the message the backend returns for QR_ACCOUNT_MISMATCH —
// see BarcodeScanInput.tsx for the same literal and why it's kept as one.
const QR_ACCOUNT_MISMATCH_MSG = 'This QR Code belongs to another account and cannot be used in the current account.'

type FuzzyResult = Omit<ScannedProduct, 'current_stock' | 'batches'>

function scannedToProduct(s: ScannedProduct | (FuzzyResult & { current_stock?: number })): Product {
  return {
    id: s.id,
    item_code: s.item_code,
    name: s.name,
    generic_name: s.generic_name,
    company_name: s.company_name,
    unit: s.unit,
    sales_rate: s.sales_rate,
    purchase_rate: s.purchase_rate,
    mrp: s.mrp,
    vat_percent: s.vat_percent,
    cc_pct: s.cc_pct,
    current_stock: (s as any).current_stock ?? 0,
    min_stock: 0,
    is_active: true,
  }
}

export interface UnifiedProductInputHandle {
  focus: () => void
  /** Refocuses the field only on desktop-capable devices (see
   *  `canUseDesktopAutoFocus` below) — a no-op everywhere else. Used for
   *  the "hand focus back to this field so scanning can continue" call
   *  sites (see SalesPage.tsx's BatchSelect `onAutoResolved`, and the
   *  post-scan refocuses in handleProductSelected) that fire
   *  automatically the instant a scan finishes resolving, with no tap
   *  from the user at all. A plain focus() there was silently
   *  triggering the mobile/tablet on-screen keyboard after every single
   *  scan, covering the screen mid-workflow — see `finish()` below for
   *  the same fix applied to this component's own internal refocus. */
  focusSilently: () => void
}

/** Desktop-capable = has a mouse (fine pointer) that can hover, which a
 *  touch-only phone or tablet does not — this is what actually
 *  determines whether programmatically focusing an input will pop the
 *  OS's on-screen keyboard, not screen width (a docked/external-keyboard
 *  tablet is rare enough, and detecting it wrong just means one extra
 *  manual tap, vs. width-based detection getting a mid-size touch
 *  tablet wrong and popping the keyboard anyway). */
function canUseDesktopAutoFocus(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

interface Props {
  context: 'sales' | 'purchase'
  /** Fires for EVERY successful resolution — typed search pick, exact
   *  barcode/manual entry, hardware scanner, camera barcode, camera QR.
   *  This is the single hand-off point to the page's own "add to
   *  invoice vs. bump qty" logic. */
  onProductResolved: (product: Product) => void
  /** A typed/scanned code that matched nothing, by any method. */
  onNotFound?: (code: string) => void
  /** 403 QR_ACCOUNT_MISMATCH from a camera QR scan or manual code entry. */
  onAccountMismatch?: (message: string) => void
  placeholder?: string
  /** Only actually focuses on desktop-capable devices (see
   *  canUseDesktopAutoFocus) — on mobile/tablet this is a no-op, so the
   *  page's initial "focus the scan field on load" doesn't pop the
   *  keyboard the instant a phone/tablet opens the Sale page. Manually
   *  tapping the field still opens the keyboard normally either way. */
  autoFocus?: boolean
  className?: string
}

const UnifiedProductInput = forwardRef<UnifiedProductInputHandle, Props>(function UnifiedProductInput({
  context, onProductResolved, onNotFound, onAccountMismatch, placeholder, autoFocus, className,
}, ref) {
  const { isOnline } = useOffline()
  const companyId = useAuthStore(s => s.company?.id)

  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<FuzzyResult[]>([])
  const [open,    setOpen]    = useState(false)
  const [hl,      setHL]      = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy,    setBusy]    = useState(false) // resolving a pick/barcode/scan

  const inputRef      = useRef<HTMLInputElement>(null)
  const listRef        = useRef<HTMLUListElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether the results currently on screen came from the online fuzzy
  // endpoint (partial — needs a hydrate step on pick) or the offline
  // catalog (already a full Product — no extra lookup needed on pick).
  const resultsOnlineRef = useRef(true)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    focusSilently: () => {
      if (canUseDesktopAutoFocus()) inputRef.current?.focus()
    },
  }))

  useEffect(() => {
    if (autoFocus && canUseDesktopAutoFocus()) inputRef.current?.focus()
  }, [autoFocus])

  /* ── Close dropdown on outside click ──────────────────────────────────── */
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const el = listRef.current?.children[hl] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  /* ── Debounced multi-field search (name / generic / company / code) ──── */
  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      setOpen(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        if (!isOnline) {
          resultsOnlineRef.current = false
          const offline = companyId ? await searchProductsOffline(companyId, trimmed, 8) : []
          setResults(offline.map(toProduct) as unknown as FuzzyResult[])
        } else {
          resultsOnlineRef.current = true
          const res = await scannerAPI.fuzzySearch(trimmed, 8)
          setResults((res.data as any)?.data || [])
        }
        setOpen(true)
        setHL(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [isOnline, companyId])

  function handleQueryChange(v: string) {
    setQuery(v)
    runSearch(v)
  }

  function finish(product: Product) {
    onProductResolved(product)
    setQuery('')
    setResults([])
    setOpen(false)
    setHL(0)
    // Fires after EVERY resolution — including camera barcode/QR scans,
    // which finish with zero tap from the user. Refocusing unconditionally
    // here is exactly what was popping the on-screen keyboard right after
    // a successful mobile/tablet scan; only re-arm the field automatically
    // on desktop-capable devices. Mobile/tablet users can still tap the
    // field themselves to search or scan again.
    if (canUseDesktopAutoFocus()) {
      requestAnimationFrame(() => { inputRef.current?.focus() })
    }
  }

  /** One exact code lookup — used for both "user picked a search
   *  suggestion" (hydrate the partial fuzzy result) and "Enter/Tab with
   *  nothing highlighted" (treat the typed text as a barcode/item code). */
  async function resolveByCode(code: string, partial?: FuzzyResult) {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      if (!isOnline) {
        if (!companyId) { onNotFound?.(trimmed); return }
        const offline = await lookupByCodeOffline(companyId, trimmed)
        if (offline) finish(scannedToProduct(offline))
        else onNotFound?.(trimmed)
        return
      }
      const res = await scannerAPI.lookupBarcode(trimmed)
      const data = (res.data as any)?.data
      if (data) {
        finish(scannedToProduct(data))
      } else if (partial) {
        // Fuzzy match existed but the code itself didn't resolve via the
        // barcode endpoint (shouldn't normally happen) — fall back to
        // the partial record rather than losing the pick entirely.
        finish(scannedToProduct(partial))
      } else {
        onNotFound?.(trimmed)
      }
    } catch (err: any) {
      if (isNetworkError(err) && companyId) {
        const offline = await lookupByCodeOffline(companyId, trimmed)
        if (offline) { finish(scannedToProduct(offline)); return }
      }
      if (err?.response?.status === 403 && err?.response?.data?.code === 'QR_ACCOUNT_MISMATCH') {
        onAccountMismatch?.(QR_ACCOUNT_MISMATCH_MSG)
      } else {
        onNotFound?.(trimmed)
      }
    } finally {
      setBusy(false)
    }
  }

  function selectSuggestion(p: FuzzyResult) {
    if (resultsOnlineRef.current) void resolveByCode(p.item_code, p)
    else finish(scannedToProduct(p as unknown as ScannedProduct)) // offline results are already full Products
  }

  function handleCameraResult(result: ScanResult) {
    finish(scannedToProduct(result.product))
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (busy) { e.preventDefault(); return }
    switch (e.key) {
      case 'ArrowDown':
        if (open && results.length) { e.preventDefault(); setHL(h => Math.min(h + 1, results.length - 1)) }
        break
      case 'ArrowUp':
        if (open && results.length) { e.preventDefault(); setHL(h => Math.max(h - 1, 0)) }
        break
      case 'Enter':
      case 'Tab': {
        const trimmed = query.trim()
        if (!trimmed) break
        e.preventDefault()
        if (open && results[hl]) selectSuggestion(results[hl])
        else void resolveByCode(trimmed)
        break
      }
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  return (
    <div ref={containerRef} className={`relative flex flex-wrap items-stretch gap-2 w-full ${className || ''}`}>
      <div className="relative flex-1 min-w-[220px] flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => { if (results.length) setOpen(true) }}
          placeholder={placeholder ?? 'Scan barcode or search product by name, code or SKU…'}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        {(loading || busy) && <Loader2 size={13} className="text-slate-400 animate-spin flex-shrink-0" />}

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-lg border border-slate-200 shadow-lg max-h-72 overflow-y-auto">
            <ul ref={listRef} role="listbox">
              {results.length === 0 && !loading && (
                <li className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
                  <PackageSearch size={14} />
                  No product found for &quot;{query.trim()}&quot;
                </li>
              )}
              {results.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === hl}
                  onMouseEnter={() => setHL(i)}
                  onMouseDown={e => { e.preventDefault(); selectSuggestion(p) }}
                  className={`px-3 py-2 cursor-pointer text-sm ${i === hl ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="font-medium text-slate-800">{p.name}</div>
                  {(p.generic_name || p.item_code) && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {p.item_code && <span className="font-mono">{p.item_code}</span>}
                      {p.generic_name && <span>{p.generic_name}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="upi-scan-buttons flex items-stretch gap-2 flex-shrink-0">
        <ScanButton
          context={context}
          onResult={handleCameraResult}
          initialMode={'barcode' as ScanMode}
          label="Scan Barcode"
          description="Scan product barcode"
          icon={<ScanLine size={15} />}
          iconChipClassName="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0"
          className="upi-scan-btn upi-scan-btn-barcode inline-flex items-center gap-2.5 px-3 h-9 rounded-lg border transition-all bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50 whitespace-nowrap"
        />
        <ScanButton
          context={context}
          onResult={handleCameraResult}
          initialMode={'qr' as ScanMode}
          label="Scan QR"
          description="Scan QR code"
          icon={<QrCode size={15} />}
          iconChipClassName="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex-shrink-0"
          className="upi-scan-btn upi-scan-btn-qr inline-flex items-center gap-2.5 px-3 h-9 rounded-lg border transition-all bg-white border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 whitespace-nowrap"
        />
      </div>
    </div>
  )
})

export default UnifiedProductInput
