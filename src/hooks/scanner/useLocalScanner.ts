/**
 * useLocalScanner.ts
 *
 * Local (same-device) scanner engine — the default entry point used by
 * ScanButton on the Sales/Purchase pages.
 *
 * All camera/zoom/flash/camera-switch/barcode-decode concerns now come
 * from the shared useBarcodeEngine hook (see useBarcodeEngine.ts) — the
 * exact same engine the Product Add scanner (useProductCapture.ts) uses —
 * so both scanners are guaranteed identical camera behavior and
 * performance. This file only adds what's specific to billing lookups:
 *
 *   - OCR only ever reads the small, centered "scan box" (see
 *     ocrImage.ts) — not the full camera frame — cropped exactly to what
 *     the dimmed overlay shows on screen.
 *   - A single Tesseract worker is created once per session and reused,
 *     instead of a brand new worker per tick.
 *   - The OCR loop is self-scheduling (next tick is only scheduled once
 *     the previous recognize() call has fully resolved), so overlapping/
 *     duplicate OCR requests are structurally impossible.
 *   - OCR text is normalized and scored against candidates with a fuzzy
 *     similarity — see ocrMatch.ts. >=90% similarity auto-selects the
 *     product immediately (same as a barcode hit); 70-89% shows a short
 *     picker; below 70% is treated as "no match" and scanning continues
 *     automatically, with no user action required to keep trying.
 *   - Scanning stops the instant a confident match is found (barcode or
 *     OCR), and only resumes when the user taps "Scan Again" (rescan()).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { scannerAPI } from '@/services/api'
import type { ScanResult, ScannedProduct } from '@/types/scanner'
import useBarcodeEngine from './useBarcodeEngine'
import { preprocessForOcr, captureScanBoxFrame, SCAN_BOX_WIDTH, SCAN_BOX_HEIGHT } from '@/utils/ocrImage'
import { normalizeOcrText, matchProduct, MATCH_AUTO_THRESHOLD, MATCH_SUGGEST_THRESHOLD, MATCH_SUGGEST_LIMIT } from '@/utils/ocrMatch'

export { SCAN_BOX_WIDTH, SCAN_BOX_HEIGHT } // re-exported for ScannerUI's ScanFrame

// Minimum gap between the END of one OCR recognize() call and the START
// of the next. Deliberately short — the scan box is small, so each
// recognize() call is fast, and the self-scheduling loop already prevents
// overlap regardless of how long a given call takes.
const OCR_TICK_GAP_MS = 250
// Single line — the scan box is a compact, barcode-style viewfinder that
// the user aligns a single line of text in (the product name), rather
// than a full-label photo with multiple disconnected blocks.
const OCR_PSM_SINGLE_LINE = '7'

export type LocalScanMode   = 'barcode' | 'ocr' | 'idle'
export type LocalScanStatus =
  | 'requesting-permission'
  | 'denied'
  | 'scanning'
  | 'matches'
  | 'submitting'
  | 'done'
  | 'error'

// Same shape as useMobileScanner's MobileProduct — intermediate list item
// before a match is hydrated into a full ScannedProduct on selection.
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
  ocrProgress: number
  lastBarcode: string | null
  lastOcrText: string | null
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
  ocrProgress: 0, lastBarcode: null, lastOcrText: null, lastResult: null,
  zoomSupported: true, zoomMin: 1, zoomMax: 3, zoomStep: 0.1, zoom: 1,
}

export default function useLocalScanner({ onResult, active }: Options) {
  const [state, setState] = useState<LocalScannerState>(INITIAL_STATE)

  const engine = useBarcodeEngine()
  const { videoRef, containerRef } = engine

  const mountedRef       = useRef(true)
  const manualModeRef    = useRef<LocalScanMode | null>(null)   // set by user's Barcode/OCR toggle
  const ocrTimer         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ocrWorkerRef     = useRef<any>(null)    // persistent Tesseract worker for this session
  const ocrWorkerPromise = useRef<Promise<any> | null>(null) // avoids creating two workers if init overlaps
  const ocrLoopActiveRef = useRef(false)        // whether the self-scheduling OCR loop should keep going
  const ocrBusyRef       = useRef(false)        // true for the duration of one recognize() call
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

  // ── OCR worker lifecycle ─────────────────────────────────────────────────
  const terminateOcrWorker = useCallback(() => {
    const worker = ocrWorkerRef.current
    ocrWorkerRef.current = null
    ocrWorkerPromise.current = null
    if (worker) worker.terminate().catch(() => {})
  }, [])

  const stopOcrLoop = useCallback(() => {
    ocrLoopActiveRef.current = false
    if (ocrTimer.current) { clearTimeout(ocrTimer.current); ocrTimer.current = null }
  }, [])

  const stopCamera = useCallback(() => {
    engine.closeCamera()
    if (ocrTimer.current)         { clearTimeout(ocrTimer.current);      ocrTimer.current = null }
    if (noticeTimeoutRef.current) { clearTimeout(noticeTimeoutRef.current); noticeTimeoutRef.current = null }
    ocrLoopActiveRef.current = false
    terminateOcrWorker()
  }, [engine, terminateOcrWorker])

  // ── Product search (same backend endpoints as before) ──────────────────────
  const searchBarcode = useCallback(async (code: string): Promise<LocalProduct[]> => {
    try {
      const res = await scannerAPI.lookupBarcode(code)
      const json: any = res.data
      return json.success && json.data ? [json.data] : []
    } catch { return [] }
  }, [])

  // Casts a slightly wider net than before (20 vs. 10) since ranking/
  // filtering now happens on the client against the normalized text —
  // more candidates to score against means a better chance the right one
  // is in the set at all.
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
  // Continuous multi-scan: this only PAUSES the decode loops (barcode RAF
  // loop + OCR tick loop) — it deliberately does NOT call stopCamera(), so
  // the live video stream and (if warmed up) the Tesseract OCR worker both
  // stay alive across items. LocalScannerView resumes scanning (rescan())
  // a short beat after each successful add, and since the camera never
  // actually closed, that resume is instant — no re-request of getUserMedia
  // between medicines. The camera only fully closes when the user taps ✕
  // or the scanner view itself unmounts.
  const selectProduct = useCallback(async (product: LocalProduct) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, status: 'submitting' }))
    engine.stopScanning()
    stopOcrLoop()
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
        scanMethod: state.lastBarcode ? 'barcode' : state.lastOcrText ? 'ocr' : 'manual',
        barcode:    state.lastBarcode,
        ocrText:    state.lastOcrText,
        scannedAt:  Date.now(),
      }

      setState(s => ({ ...s, status: 'done', lastResult: result }))
      onResult(result)
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Something went wrong. Please try again.' }))
    }
  }, [onResult, engine, stopOcrLoop, state.lastBarcode, state.lastOcrText])

  // ── OCR: scan-box-cropped, persistent-worker, self-scheduling loop ────────
  const getOcrWorker = useCallback(async () => {
    if (ocrWorkerRef.current) return ocrWorkerRef.current
    if (!ocrWorkerPromise.current) {
      ocrWorkerPromise.current = (async () => {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('eng', 1, {
          logger: (m: any) => {
            if (m.status === 'recognizing text' && mountedRef.current) {
              setState(s => ({ ...s, ocrProgress: Math.round(m.progress * 100) }))
            }
          },
        })
        await worker.setParameters({ tessedit_pageseg_mode: OCR_PSM_SINGLE_LINE as any })
        ocrWorkerRef.current = worker
        return worker
      })()
    }
    return ocrWorkerPromise.current
  }, [])

  // Applies the same normalize -> fuzzy-search -> score -> threshold pipeline
  // used by the live loop, but as a single call — shared by both the live
  // scan-box tick and the gallery-image path below.
  const matchNormalizedText = useCallback(async (normalized: string): Promise<'auto' | 'suggested' | 'none'> => {
    if (normalized.length < 3) { flashNotice('Could not read any text — try again'); return 'none' }
    setState(s => ({ ...s, lastOcrText: normalized }))

    const candidates = await searchFuzzy(normalized)
    if (!mountedRef.current) return 'none'
    if (candidates.length === 0) { flashNotice('No matching product found'); return 'none' }

    const ranked = matchProduct(normalized, candidates)
    const best = ranked[0]
    if (!best || best.score < MATCH_SUGGEST_THRESHOLD) { flashNotice('No matching product found'); return 'none' }

    if (best.score >= MATCH_AUTO_THRESHOLD) {
      await selectProduct(best.product as unknown as LocalProduct)
      return 'auto'
    }

    const top = ranked.slice(0, MATCH_SUGGEST_LIMIT).map(r => r.product) as unknown as LocalProduct[]
    setState(s => ({ ...s, status: 'matches', matches: top }))
    return 'suggested'
  }, [searchFuzzy, selectProduct, flashNotice])

  const ocrTick = useCallback(async () => {
    if (!ocrLoopActiveRef.current || !mountedRef.current) return
    if (!videoRef.current || videoRef.current.readyState < 2 || !containerRef.current) {
      ocrTimer.current = setTimeout(ocrTick, OCR_TICK_GAP_MS)
      return
    }

    ocrBusyRef.current = true
    try {
      const rect = containerRef.current.getBoundingClientRect()
      const rawCanvas = captureScanBoxFrame(videoRef.current, rect.width, rect.height)
      if (!rawCanvas) return
      const canvas = preprocessForOcr(rawCanvas, rawCanvas.width, rawCanvas.height)

      const worker = await getOcrWorker()
      if (!mountedRef.current || !ocrLoopActiveRef.current) return
      const { data: { text } } = await worker.recognize(canvas)
      if (!mountedRef.current || !ocrLoopActiveRef.current) return

      const normalized = normalizeOcrText(text)
      if (normalized.length < 3) return // nothing readable this tick — keep scanning, no notice (avoid flicker on every empty tick)

      const outcome = await matchNormalizedText(normalized)
      if (outcome !== 'none') ocrLoopActiveRef.current = false // 'auto' or 'suggested' both stop scanning
    } catch {
      // OCR failed this tick — just try again next tick, don't surface an error
    } finally {
      ocrBusyRef.current = false
      if (ocrLoopActiveRef.current && mountedRef.current) {
        ocrTimer.current = setTimeout(ocrTick, OCR_TICK_GAP_MS)
      }
    }
  }, [getOcrWorker, matchNormalizedText, videoRef, containerRef])

  const startOcrLoop = useCallback(() => {
    if (ocrLoopActiveRef.current) return // already running — never start a second overlapping loop
    ocrLoopActiveRef.current = true
    ocrTick()
  }, [ocrTick])

  // ── Barcode scanning — delegates the actual decode loop to the shared
  //    engine; this is purely "what to do with a decoded code" ───────────────
  const handleBarcodeDetected = useCallback(async (code: string) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, lastBarcode: code }))

    const products = await searchBarcode(code)
    if (!mountedRef.current) return
    if (products.length > 0) {
      setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
      return
    }

    const normalizedCode = normalizeOcrText(code)
    const fuzzy = await searchFuzzy(normalizedCode)
    if (!mountedRef.current) return
    if (fuzzy.length > 0) {
      setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
    } else if (manualModeRef.current !== 'barcode') {
      setState(s => ({ ...s, mode: 'ocr' }))
      startOcrLoop()
    }
  }, [searchBarcode, searchFuzzy, startOcrLoop])

  const startBarcodeLoop = useCallback(() => {
    engine.startScanning(handleBarcodeDetected)
  }, [engine, handleBarcodeDetected])

  // ── Manual mode override (Barcode / OCR bottom-bar buttons) ────────────────
  const setMode = useCallback((mode: 'barcode' | 'ocr') => {
    manualModeRef.current = mode
    engine.stopScanning()
    stopOcrLoop()
    setState(s => ({ ...s, mode, status: 'scanning', ocrProgress: 0, notice: null }))
    if (mode === 'barcode') startBarcodeLoop()
    else startOcrLoop()
  }, [engine, startBarcodeLoop, startOcrLoop, stopOcrLoop])

  // ── Flash / camera switch — thin passthroughs to the shared engine ────────
  const toggleFlash = useCallback(() => engine.toggleFlash(), [engine])

  const switchCamera = useCallback(async () => {
    const wasOcr = state.mode === 'ocr'
    ocrLoopActiveRef.current = false
    if (ocrTimer.current) { clearTimeout(ocrTimer.current); ocrTimer.current = null }
    setState(s => ({ ...s, mode: 'idle' }))
    const ok = await engine.switchCamera()
    if (ok && mountedRef.current) {
      const nextMode = manualModeRef.current || (wasOcr ? 'ocr' : 'barcode')
      setState(s => ({ ...s, status: 'scanning', mode: nextMode }))
      if (nextMode === 'ocr') startOcrLoop()
      // engine.switchCamera() already restarts the barcode decode loop
      // itself if it was active before the switch.
    }
  }, [engine, state.mode, startOcrLoop])

  const setZoom = useCallback((value: number) => engine.setZoom(value), [engine])

  // ── Rescan / retry ──────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    engine.stopScanning()
    stopOcrLoop()
    manualModeRef.current = null
    setState(s => ({ ...s, status: 'scanning', mode: 'barcode', matches: [], error: null, notice: null, lastBarcode: null, lastOcrText: null, ocrProgress: 0 }))
    const ok = engine.state.cameraStatus === 'ready' ? true : await engine.openCamera(engine.state.facingMode)
    if (ok) startBarcodeLoop()
  }, [engine, startBarcodeLoop, stopOcrLoop])

  const retryPermission = useCallback(async () => {
    const ok = await engine.retryPermission()
    if (ok && mountedRef.current) {
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      startBarcodeLoop()
    }
  }, [engine, startBarcodeLoop])

  // ── OCR on a gallery-picked image (same recognizer, static image input) ────
  const scanImageFile = useCallback(async (file: File) => {
    if (!mountedRef.current) return
    stopCamera()
    setState(s => ({ ...s, mode: 'ocr', ocrProgress: 0 }))
    try {
      const bitmap = await createImageBitmap(file)
      const rawCanvas = document.createElement('canvas')
      rawCanvas.width  = bitmap.width
      rawCanvas.height = bitmap.height
      rawCanvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      const canvas = preprocessForOcr(rawCanvas, rawCanvas.width, rawCanvas.height)

      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && mountedRef.current) {
            setState(s => ({ ...s, ocrProgress: Math.round(m.progress * 100) }))
          }
        },
      })
      // A gallery photo is a full label shot, not a single aligned line —
      // sparse-text layout detection suits it better than single-line mode.
      await worker.setParameters({ tessedit_pageseg_mode: '11' as any })
      const { data: { text } } = await worker.recognize(canvas)
      await worker.terminate()
      if (!mountedRef.current) return

      const normalized = normalizeOcrText(text)
      if (normalized.length < 3) {
        setState(s => ({ ...s, status: 'error', error: 'Could not read any text from that image.' }))
        return
      }
      setState(s => ({ ...s, lastOcrText: normalized }))
      const candidates = await searchFuzzy(normalized)
      if (!mountedRef.current) return
      if (candidates.length === 0) {
        setState(s => ({ ...s, status: 'error', error: 'No matching product found for that image.' }))
        return
      }
      const ranked = matchProduct(normalized, candidates)
      const best = ranked[0]
      if (!best || best.score < MATCH_SUGGEST_THRESHOLD) {
        setState(s => ({ ...s, status: 'error', error: 'No matching product found for that image.' }))
        return
      }
      if (best.score >= MATCH_AUTO_THRESHOLD) {
        await selectProduct(best.product as unknown as LocalProduct)
      } else {
        const top = ranked.slice(0, MATCH_SUGGEST_LIMIT).map(r => r.product) as unknown as LocalProduct[]
        setState(s => ({ ...s, status: 'matches', matches: top }))
      }
    } catch {
      if (mountedRef.current) setState(s => ({ ...s, status: 'error', error: 'Could not process that image.' }))
    }
  }, [searchFuzzy, selectProduct, stopCamera])

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
    toggleFlash, switchCamera, setMode, setZoom,
    selectProduct, rescan, retryPermission, scanImageFile,
  }
}
