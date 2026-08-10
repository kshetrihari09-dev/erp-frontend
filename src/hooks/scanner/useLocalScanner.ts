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
import useBarcodeEngine from './useBarcodeEngine'

// Exact copy of the message the backend returns for QR_ACCOUNT_MISMATCH
// (see erp-unified-backend/src/scanner/scannerRoutes.js) — a structured
// QR payload whose accountId doesn't match the account the user is
// currently logged into. Kept as a literal here (rather than trusting
// whatever string the server sends) so the UI copy stays consistent even
// if a future response is malformed; the `code` field is still what
// actually drives the branch below.
const QR_ACCOUNT_MISMATCH_MSG = 'This QR Code belongs to another account and cannot be used in the current account.'

// Strips punctuation/extra whitespace from a decoded barcode string
// before it's used as a fuzzy-search fallback query.
function normalizeScanText(text: string): string {
  return text.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

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
}

const INITIAL_STATE: LocalScannerState = {
  status: 'requesting-permission', mode: 'idle', matches: [],
  error: null, notice: null, flashOn: false, flashSupported: false, facingMode: 'environment',
  lastBarcode: null, lastResult: null,
  zoomSupported: true, zoomMin: 1, zoomMax: 3, zoomStep: 0.1, zoom: 1,
}

export default function useLocalScanner({ onResult, active }: Options) {
  const [state, setState] = useState<LocalScannerState>(INITIAL_STATE)

  const engine = useBarcodeEngine()
  const { videoRef, containerRef } = engine

  const mountedRef       = useRef(true)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // the decoded QR is a structured payload printed under a *different*
  // account than the one currently logged in. That's a deliberate,
  // permanent "no" — handleBarcodeDetected surfaces it immediately.
  //
  // Every lookup is scoped to the products belonging to the current
  // account (scannerAPI carries the logged-in account's auth context),
  // so matching can never surface — let alone select — a product
  // belonging to a different company/account.
  const searchBarcode = useCallback(async (code: string): Promise<LocalProduct[] | 'ACCOUNT_MISMATCH'> => {
    try {
      const res = await scannerAPI.lookupBarcode(code)
      const json: any = res.data
      return json.success && json.data ? [json.data] : []
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.code === 'QR_ACCOUNT_MISMATCH') {
        return 'ACCOUNT_MISMATCH'
      }
      return []
    }
  }, [])

  const searchFuzzy = useCallback(async (normalizedText: string): Promise<LocalProduct[]> => {
    try {
      if (normalizedText.length < 2) return []
      const res  = await scannerAPI.fuzzySearch(normalizedText.slice(0, 60), 20)
      const json: any = res.data
      return json.success ? (json.data || []) : []
    } catch { return [] }
  }, [])

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
        const res = await scannerAPI.lookupBarcode(product.item_code)
        const json: any = res.data
        full = json.success ? json.data : null
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
  }, [onResult, engine, state.lastBarcode])

  // ── Barcode scanning — delegates the actual decode loop to the shared
  //    engine; this is purely "what to do with a decoded code" ───────────────
  const handleBarcodeDetected = useCallback(async (code: string) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, lastBarcode: code }))

    const products = await searchBarcode(code)
    if (!mountedRef.current) return
    if (products === 'ACCOUNT_MISMATCH') {
      setState(s => ({ ...s, status: 'error', error: QR_ACCOUNT_MISMATCH_MSG }))
      return
    }
    if (products.length > 0) {
      setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
      return
    }

    const normalizedCode = normalizeScanText(code)
    const fuzzy = await searchFuzzy(normalizedCode)
    if (!mountedRef.current) return
    if (fuzzy.length > 0) {
      setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
    } else {
      flashNotice('No matching product found — keep scanning')
    }
  }, [searchBarcode, searchFuzzy, flashNotice])

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

  // ── Rescan / retry ──────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    engine.stopScanning()
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
      setState(INITIAL_STATE)
      return
    }

    let cancelled = false
    setState(() => ({ ...INITIAL_STATE, status: 'requesting-permission' }))

    async function init() {
      const ok = await engine.openCamera('environment')
      if (cancelled || !mountedRef.current || !ok) return
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
    selectProduct, rescan, retryPermission,
  }
}
