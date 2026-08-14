/**
 * useLocalScanner.ts
 *
 * Local (same-device) scanner engine — the default entry point used by
 * ScanButton on the Sales/Purchase pages.
 *
 * All camera/zoom/flash/camera-switch/barcode-decode concerns come from
 * the shared useBarcodeEngine hook (see useBarcodeEngine.ts) — the exact
 * same engine the Product Add scanner (useProductCapture.ts) uses — so
 * both scanners are guaranteed identical camera behavior and performance.
 * This file only adds what's specific to billing lookups: looking a
 * decoded barcode up against the product catalog (with a fuzzy-search
 * fallback if there's no exact match), and handing the result back to
 * the caller.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { scannerAPI } from '@/services/api'
import type { ScanResult, ScannedProduct } from '@/types/scanner'
import useBarcodeEngine, { type ScanMode } from './useBarcodeEngine'
import useAuthStore from '@/store/authStore'
import { useOffline } from '@/offline/OfflineProvider'
import { lookupByCodeOffline } from '@/offline/productLookup'
import { isNetworkError } from '@/offline/syncEngine'

// Exact copy of the message the backend returns for QR_ACCOUNT_MISMATCH
// (see erp-unified-backend/src/scanner/scannerRoutes.js) — a structured
// QR payload whose accountId doesn't match the account the user is
// currently logged into. Kept as a literal here (rather than trusting
// whatever string the server sends) so the UI copy stays consistent even
// if a future response is malformed; the `code` field is still what
// actually drives the branch below. Only ever fires for a legacy
// structured-JSON QR printed before QR content was simplified to the
// raw barcode string — see utils/productQr.ts.
const QR_ACCOUNT_MISMATCH_MSG = 'This QR Code belongs to another account and cannot be used in the current account.'

// A "not found" lookup is a transient miss, not a stop condition — the
// scanner has to keep decoding afterwards. But the physical barcode
// typically sits in front of the camera for well over a second after the
// miss is reported, and the decode loop resumes on the very next frame,
// so without this guard the exact same code would immediately re-trigger
// another lookup/notice/beep every couple of frames until the user
// physically moves the item away. This cooldown makes a given not-found
// code inert for a short window (long enough to cover the "keep
// scanning" notice below) — the loop keeps running underneath so a
// *different* barcode is still picked up instantly, but a repeat of the
// same miss is silently ignored until the cooldown lapses or the code
// changes (i.e. the item left frame and something else, or nothing, is
// there now).
const NOT_FOUND_COOLDOWN_MS = 1500

// A live camera scan needs to feel instant regardless of connectivity —
// the app-wide 20s API timeout (config.apiTimeout) is fine for a
// deliberate one-off submit, but is far too long to sit and wait on for
// EVERY scanned code. This matters specifically for the case
// useOnlineStatus can't catch instantly: Wi-Fi/mobile data still
// "connected" at the interface level (so no browser 'offline' event
// fires, and isOnline can still read true) while the actual internet
// path is dead — a real, common situation (weak signal, captive portal,
// backend down). Without a short cap here, a scan in that state would
// hang for up to 20s before searchBarcode's network-error catch ever
// gets a chance to fall back to the offline IndexedDB lookup. 2.5s is
// long enough for a slow-but-real network response to still land
// normally, short enough that a dead connection resolves to the offline
// fallback fast enough to not feel broken.
const SCAN_LOOKUP_TIMEOUT_MS = 2500

export type LocalScanMode   = 'barcode' | 'idle'
export type LocalScanStatus =
  | 'requesting-permission'
  | 'denied'
  | 'scanning'
  | 'matches'
  | 'submitting'
  | 'done'
  | 'error'

// Intermediate list item before a match is hydrated into a full
// ScannedProduct on selection.
export interface LocalProduct {
  id:             string
  item_code:      string
  name:           string
  generic_name?:  string
  company_name?:  string
  unit:           string
  sales_rate:     number
  purchase_rate:  number
  current_stock?: number
}

export interface LocalScannerState {
  status:      LocalScanStatus
  mode:        LocalScanMode
  matches:     LocalProduct[]
  error:       string | null
  notice:      string | null // transient "no match yet" feedback — scanning keeps going
  flashOn:     boolean
  flashSupported: boolean
  facingMode:  'environment' | 'user'
  lastBarcode: string | null
  lastResult:  ScanResult | null
  // Digital zoom — see useBarcodeEngine.ts for why it's CSS scale + a
  // matching canvas crop rather than MediaTrackConstraints.zoom.
  // zoomSupported is always true (digital zoom works on every device);
  // kept as a field so LocalScannerView doesn't need an unrelated
  // prop-shape change.
  zoomSupported: boolean
  zoomMin:       number
  zoomMax:       number
  zoomStep:      number
  zoom:          number
}

interface Options {
  context:  'sales' | 'purchase'
  onResult: (result: ScanResult) => void
  active:   boolean   // whether the scanner view is currently open
  // Which symbology (see useBarcodeEngine.ts's ScanMode) this scanner
  // should be looking for the moment it opens — e.g. a dedicated "Scan
  // QR" entry point can jump straight into QR mode instead of the
  // default 'barcode', without needing any new scanner engine/hook of
  // its own. Purely an initial value: once the camera is open, the
  // in-scanner Barcode|QR toggle (see ScannerUI.tsx / setScanMode below)
  // still works exactly as before and can switch away from it freely.
  // Defaults to 'barcode' to match every existing caller's behavior.
  initialMode?: ScanMode
}

const INITIAL_STATE: LocalScannerState = {
  status: 'requesting-permission', mode: 'idle', matches: [],
  error: null, notice: null, flashOn: false, flashSupported: false, facingMode: 'environment',
  lastBarcode: null, lastResult: null,
  zoomSupported: true, zoomMin: 1, zoomMax: 3, zoomStep: 0.1, zoom: 1,
}

export default function useLocalScanner({ onResult, active, initialMode }: Options) {
  const [state, setState] = useState<LocalScannerState>(INITIAL_STATE)

  const engine = useBarcodeEngine()
  const { videoRef, containerRef } = engine
  const companyId = useAuthStore(s => s.company?.id)
  const { isOnline } = useOffline()

  const mountedRef       = useRef(true)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Duplicate-guard for the "not found" path — see NOT_FOUND_COOLDOWN_MS
  // above. Cleared the moment a lookup succeeds or a different code comes
  // in, so it never suppresses a genuine new scan.
  const lastNotFoundRef  = useRef<{ code: string; at: number } | null>(null)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Mirror the shared engine's camera state into this hook's state so
  //    LocalScannerView keeps reading a single, familiar `state` shape ──────
  useEffect(() => {
    setState(s => ({
      ...s,
      flashOn:        engine.state.flashOn,
      flashSupported: engine.state.flashSupported,
      facingMode:     engine.state.facingMode,
      zoomSupported:  true,
      zoomMin:        engine.state.zoomMin,
      zoomMax:        engine.state.zoomMax,
      zoomStep:       engine.state.zoomStep,
      zoom:           engine.state.zoom,
    }))
  }, [engine.state.flashOn, engine.state.flashSupported, engine.state.facingMode, engine.state.zoomMin, engine.state.zoomMax, engine.state.zoomStep, engine.state.zoom])

  const stopCamera = useCallback(() => {
    engine.closeCamera()
    if (noticeTimeoutRef.current) { clearTimeout(noticeTimeoutRef.current); noticeTimeoutRef.current = null }
  }, [engine])

  // ── Product search (same backend endpoints as before) ──────────────────────
  // The backend can reject a scan outright (403 QR_ACCOUNT_MISMATCH) when
  // the decoded QR is a legacy structured payload printed under a
  // *different* account than the one currently logged in. That's a
  // deliberate, permanent "no" — handleBarcodeDetected surfaces it
  // immediately. New QR labels no longer encode that payload (see
  // utils/productQr.ts) — a QR now decodes to the exact same barcode
  // string a linear-barcode scan of the same product would produce, so
  // this is the ONLY lookup either scan method ever calls: one function,
  // one exact `product.barcode` match, for both.
  //
  // Every lookup is scoped to the products belonging to the current
  // account (scannerAPI carries the logged-in account's auth context),
  // so matching can never surface — let alone select — a product
  // belonging to a different company/account.
  const searchBarcode = useCallback(async (code: string): Promise<LocalProduct[] | 'ACCOUNT_MISMATCH'> => {
    // Offline (requirement #3 + #12 — scanner keeps working, same exact
    // camera/decode path, only the product lookup after a successful
    // decode changes): skip the network call entirely and go straight to
    // the IndexedDB catalog cache (see offline/productLookup.ts), which
    // catalogSync.ts already kept populated while online. Same exact-
    // match-on-barcode contract as the online lookup below — QR and
    // barcode still resolve through this one function either way.
    if (!isOnline) {
      if (!companyId) return []
      const product = await lookupByCodeOffline(companyId, code)
      return product ? [product as unknown as LocalProduct] : []
    }
    try {
      const res = await scannerAPI.lookupBarcode(code, { timeoutMs: SCAN_LOOKUP_TIMEOUT_MS })
      const json: any = res.data
      return json.success && json.data ? [json.data] : []
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.code === 'QR_ACCOUNT_MISMATCH') {
        return 'ACCOUNT_MISMATCH'
      }
      // Covers two cases identically: a real network failure, AND a
      // request that hit SCAN_LOOKUP_TIMEOUT_MS without the server ever
      // responding (axios timeouts also have no `err.response`, so
      // isNetworkError treats them the same way) — either way, fall back
      // to the offline cache exactly as the isOnline-false branch above
      // does, rather than reporting a false "not found" for a product
      // that's actually in the offline catalog.
      if (isNetworkError(err) && companyId) {
        const product = await lookupByCodeOffline(companyId, code)
        if (product) return [product as unknown as LocalProduct]
      }
      return []
    }
  }, [isOnline, companyId])

  const flashNotice = useCallback((message: string) => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current)
    setState(s => ({ ...s, notice: message }))
    noticeTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) setState(s => ({ ...s, notice: null }))
    }, 1400)
  }, [])

  // ── Select a match → hydrate to full ScannedProduct → resolve locally ─────
  //
  // Continuous multi-scan: this only PAUSES the decode loop — it
  // deliberately does NOT call stopCamera(), so the live video stream
  // stays alive across items. LocalScannerView resumes scanning
  // (rescan()) a short beat after each successful add, and since the
  // camera never actually closed, that resume is instant — no re-request
  // of getUserMedia between medicines. The camera only fully closes when
  // the user taps ✕ or the scanner view itself unmounts.
  const selectProduct = useCallback(async (product: LocalProduct) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, status: 'submitting' }))
    engine.stopScanning()
    if (noticeTimeoutRef.current) { clearTimeout(noticeTimeoutRef.current); noticeTimeoutRef.current = null }
    try {
      let full: ScannedProduct | null = null
      if (typeof (product as any).current_stock === 'number' && (product as any).batches) {
        full = product as unknown as ScannedProduct
      } else {
        try {
          const res = await scannerAPI.lookupBarcode(product.item_code, { timeoutMs: SCAN_LOOKUP_TIMEOUT_MS })
          const json: any = res.data
          full = json.success ? json.data : null
        } catch (err: any) {
          // Same short-timeout-then-offline-fallback rule as
          // searchBarcode above — this hydration step is only reached
          // for a fuzzy-search pick (searchBarcode's own offline path
          // always returns an already-full object), but keeping the same
          // fallback here means a fuzzy pick made right as the
          // connection drops still resolves instead of erroring out.
          if (isNetworkError(err) && companyId) {
            full = await lookupByCodeOffline(companyId, product.item_code)
          }
        }
      }
      if (!mountedRef.current) return
      if (!full) {
        setState(s => ({ ...s, status: 'error', error: 'Could not load full product details. Please try again.' }))
        return
      }

      const result: ScanResult = {
        product:    full,
        scanMethod: state.lastBarcode ? 'barcode' : 'manual',
        barcode:    state.lastBarcode,
        scannedAt:  Date.now(),
      }

      setState(s => ({ ...s, status: 'done', lastResult: result }))
      onResult(result)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Something went wrong. Please try again.' }))
    }
  }, [onResult, engine, state.lastBarcode, companyId])

  // ── Barcode/QR scanning — delegates the actual decode loop to the shared
  //    engine; this is purely "what to do with a decoded code." Both a
  //    linear-barcode decode and a QR decode land here through the exact
  //    same path — the engine hands over decoded TEXT with no notion of
  //    which symbology it came from, and from this point on there is only
  //    one lookup: exact `product.barcode` match. No fuzzy/name search is
  //    ever used to resolve a scan — a miss is reported as-is so a scan
  //    can never silently resolve to the wrong product. ─────────────────
  const handleBarcodeDetected = useCallback(async (code: string) => {
    if (!mountedRef.current) return

    // Same code that just missed and is presumably still sitting in front
    // of the camera — the decode loop already stopped itself (see
    // useBarcodeEngine's startScanning), so just re-arm it and skip
    // re-querying/re-notifying. Product found flow is completely
    // untouched by this: it only ever short-circuits a repeat MISS.
    const recentMiss = lastNotFoundRef.current
    if (recentMiss && recentMiss.code === code && Date.now() - recentMiss.at < NOT_FOUND_COOLDOWN_MS) {
      engine.startScanning(handleBarcodeDetected)
      return
    }

    setState(s => ({ ...s, lastBarcode: code }))

    const products = await searchBarcode(code)
    if (!mountedRef.current) return
    if (products === 'ACCOUNT_MISMATCH') {
      setState(s => ({ ...s, status: 'error', error: QR_ACCOUNT_MISMATCH_MSG }))
      return
    }
    if (products.length > 0) {
      // Found — existing behavior, completely unchanged: hand the
      // matches over and stop here. The decode loop stays stopped;
      // selectProduct()/rescan() are what resume it, exactly as before.
      lastNotFoundRef.current = null
      setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
      return
    }

    // No exact product.barcode match — never fall back to a fuzzy/name
    // search here; a scan that doesn't exactly match is reported as not
    // found rather than silently offering a "close enough" product.
    //
    // This is a failed LOOKUP, not a failed SCANNER — the camera stream
    // and scanner view stay exactly as they are. All that happens is:
    //   1. show the existing "not found" notice,
    //   2. remember this code+timestamp so the same barcode sitting
    //      under the camera doesn't immediately refire the same miss
    //      (the cooldown check above), and
    //   3. re-arm the decode loop right away — engine.startScanning()
    //      itself resets the confirm/duplicate-guard state (pendingRef)
    //      for a clean read next detection — so scanning resumes
    //      automatically with no reopen required.
    lastNotFoundRef.current = { code, at: Date.now() }
    flashNotice('Product not found — keep scanning')
    engine.startScanning(handleBarcodeDetected)
  }, [searchBarcode, flashNotice, engine])

  const startBarcodeLoop = useCallback(() => {
    engine.startScanning(handleBarcodeDetected)
  }, [engine, handleBarcodeDetected])

  // ── Flash / camera switch — thin passthroughs to the shared engine ────────
  const toggleFlash = useCallback(() => engine.toggleFlash(), [engine])

  const switchCamera = useCallback(async () => {
    setState(s => ({ ...s, mode: 'idle' }))
    const ok = await engine.switchCamera()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      // engine.switchCamera() already restarts the barcode decode loop
      // itself if it was active before the switch.
    }
  }, [engine])

  const setZoom = useCallback((value: number) => engine.setZoom(value), [engine])

  // ── Gallery pick — decode a barcode from a photo instead of the live
  //    camera feed. On a hit it feeds straight into the same
  //    handleBarcodeDetected path a camera read would (product lookup,
  //    fuzzy fallback, matches drawer) — a gallery scan is indistinguishable
  //    from a camera scan to every downstream consumer. ─────────────────────
  const scanFromGallery = useCallback(async (file: File) => {
    const hit = await engine.scanImageFile(file)
    if (!mountedRef.current) return
    if (hit) {
      handleBarcodeDetected(hit.code)
    } else {
      flashNotice('No barcode found in that photo')
    }
  }, [engine, handleBarcodeDetected, flashNotice])

  // ── Rescan / retry ──────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    engine.stopScanning()
    lastNotFoundRef.current = null
    setState(s => ({
      ...s, status: 'scanning', mode: 'barcode', matches: [],
      error: null, notice: null, lastBarcode: null,
    }))
    const ok = engine.state.cameraStatus === 'ready' ? true : await engine.openCamera(engine.state.facingMode)
    if (ok) startBarcodeLoop()
  }, [engine, startBarcodeLoop])

  const retryPermission = useCallback(async () => {
    const ok = await engine.retryPermission()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      startBarcodeLoop()
    }
  }, [engine, startBarcodeLoop])

  // ── Lifecycle: request permission + start camera as soon as the scanner
  //    view opens; tear everything down when it closes ──────────────────────
  useEffect(() => {
    if (!active) {
      stopCamera()
      lastNotFoundRef.current = null
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false
    lastNotFoundRef.current = null
    setState(() => ({ ...INITIAL_STATE, status: 'requesting-permission' }))

    async function init() {
      const ok = await engine.openCamera('environment')
      if (cancelled || !mountedRef.current || !ok) return
      // Apply the requested entry-point symbology (see Options.initialMode
      // above) before the decode loop starts, so e.g. a "Scan QR" button
      // opens straight into QR mode on the very first frame rather than
      // briefly scanning for barcodes first. engine.setMode() is a no-op
      // if it's already the current mode (see useBarcodeEngine.ts), so
      // this is exactly as cheap as the previous hardcoded default.
      engine.setMode(initialMode ?? 'barcode')
      if (cancelled || !mountedRef.current) return
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ── Map the engine's camera status onto this hook's status while the
  //    camera itself hasn't finished opening yet (denied/error) ──────────────
  useEffect(() => {
    if (!active) return
    if (engine.state.cameraStatus === 'denied') {
      setState(s => (s.status === 'denied' ? s : { ...s, status: 'denied', error: engine.state.error }))
    } else if (engine.state.cameraStatus === 'error') {
      setState(s => (s.status === 'error' ? s : { ...s, status: 'error', error: engine.state.error }))
    }
  }, [active, engine.state.cameraStatus, engine.state.error])

  // ── Defensive re-attach ──────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    engine.attachStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.status])

  return {
    state, videoRef, containerRef,
    toggleFlash, switchCamera, setZoom,
    selectProduct, rescan, retryPermission, scanFromGallery,
    // Barcode-vs-QR symbology toggle — thin passthrough to the shared
    // engine (see useBarcodeEngine.ts). Deliberately exposed under a
    // different name than this hook's own `state.mode` (which tracks
    // scan-loop lifecycle: 'idle' | 'barcode') to avoid confusing the two.
    scanMode: engine.state.mode, setScanMode: engine.setMode,
  }
}
