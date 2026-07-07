/**
 * useLocalScanner.ts
 *
 * Local (same-device) scanner engine — the default entry point used by
 * ScanButton on the Sales/Purchase pages.
 *
 * Camera setup and the @zxing/browser barcode loop (300ms interval, 8s
 * timeout before falling back to OCR) are unchanged. The OCR side has been
 * reworked to behave like barcode scanning, per the scanner redesign:
 *
 *   - OCR only ever reads the small, centered "scan box" (see
 *     ocrImage.ts) — not the full camera frame — cropped exactly to what
 *     the dimmed overlay shows on screen.
 *   - A single Tesseract worker is created once per session and reused,
 *     instead of a brand new worker per tick (that alone was the single
 *     biggest source of lag in the old implementation).
 *   - The loop is self-scheduling (next tick is only scheduled once the
 *     previous recognize() call has fully resolved), so overlapping/
 *     duplicate OCR requests are structurally impossible rather than
 *     merely guarded against.
 *   - OCR text is normalized (case, whitespace, punctuation, common 0/O
 *     and 1/I misreads) and scored against candidates with a fuzzy
 *     similarity — see ocrMatch.ts. >=90% similarity auto-selects the
 *     product immediately (same as a barcode hit); 70-89% shows a short
 *     picker; below 70% is treated as "no match" and scanning continues
 *     automatically, with no user action required to keep trying.
 *   - Scanning stops the instant a confident match is found, and only
 *     resumes when the user taps "Scan Again" (rescan()).
 *
 * New, additive capabilities carried over unchanged (UI/UX only, no
 * change to detection logic): camera permission state, front/back camera
 * switching, manual mode override, OCR on a gallery-picked image.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { scannerAPI } from '@/services/api'
import type { ScanResult, ScannedProduct } from '@/types/scanner'
import { preprocessForOcr, captureScanBoxFrame, SCAN_BOX_WIDTH, SCAN_BOX_HEIGHT } from '@/utils/ocrImage'
import { normalizeOcrText, matchProduct, MATCH_AUTO_THRESHOLD, MATCH_SUGGEST_THRESHOLD, MATCH_SUGGEST_LIMIT } from '@/utils/ocrMatch'

export { SCAN_BOX_WIDTH, SCAN_BOX_HEIGHT } // re-exported for ScannerUI's ScanFrame

const BARCODE_TIMEOUT_MS  = 8_000
const BARCODE_INTERVAL_MS = 300
// Minimum gap between the END of one OCR recognize() call and the START
// of the next. Deliberately short — the scan box is small, so each
// recognize() call is fast, and the self-scheduling loop already prevents
// overlap regardless of how long a given call takes.
const OCR_TICK_GAP_MS = 250
// Single line — the scan box is now a compact, barcode-style viewfinder
// that the user aligns a single line of text in (the product name),
// rather than a full-label photo with multiple disconnected blocks.
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
  facingMode:  'environment' | 'user'
  ocrProgress: number
  lastBarcode: string | null
  lastOcrText: string | null
  lastResult:  ScanResult | null
}

interface Options {
  context:  'sales' | 'purchase'
  onResult: (result: ScanResult) => void
  active:   boolean   // whether the scanner view is currently open
}

const INITIAL_STATE: LocalScannerState = {
  status: 'requesting-permission', mode: 'idle', matches: [],
  error: null, notice: null, flashOn: false, facingMode: 'environment',
  ocrProgress: 0, lastBarcode: null, lastOcrText: null, lastResult: null,
}

export default function useLocalScanner({ onResult, active }: Options) {
  const [state, setState] = useState<LocalScannerState>(INITIAL_STATE)

  const videoRef         = useRef<HTMLVideoElement | null>(null)
  const containerRef     = useRef<HTMLDivElement | null>(null) // the on-screen camera view — for scan-box crop math
  const streamRef        = useRef<MediaStream | null>(null)
  const barcodeTimer     = useRef<ReturnType<typeof setInterval> | null>(null)
  const ocrTimer         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barcodeStart     = useRef<number>(0)
  const mountedRef       = useRef(true)
  const manualModeRef    = useRef<LocalScanMode | null>(null)   // set by user's Barcode/OCR toggle
  const ocrWorkerRef     = useRef<any>(null)    // persistent Tesseract worker for this session
  const ocrWorkerPromise = useRef<Promise<any> | null>(null) // avoids creating two workers if init overlaps
  const ocrLoopActiveRef = useRef(false)        // whether the self-scheduling OCR loop should keep going
  const ocrBusyRef       = useRef(false)        // true for the duration of one recognize() call
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── Camera ─────────────────────────────────────────────────────────────────
  const attachStream = useCallback(async () => {
    const video  = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    try { await video.play() } catch {}
  }, [])

  const startCamera = useCallback(async (facingMode: 'environment' | 'user' = 'environment'): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return false }
      streamRef.current = stream
      await attachStream()
      return true
    } catch (err: any) {
      if (!mountedRef.current) return false
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setState(s => ({ ...s, status: 'denied', error: 'Camera access was denied.' }))
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setState(s => ({ ...s, status: 'error', error: 'No camera found on this device.' }))
      } else {
        setState(s => ({ ...s, status: 'error', error: 'Could not start the camera. Please try again.' }))
      }
      return false
    }
  }, [])

  // ── OCR worker lifecycle ─────────────────────────────────────────────────
  const terminateOcrWorker = useCallback(() => {
    const worker = ocrWorkerRef.current
    ocrWorkerRef.current = null
    ocrWorkerPromise.current = null
    if (worker) worker.terminate().catch(() => {})
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (barcodeTimer.current)     { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    if (ocrTimer.current)         { clearTimeout(ocrTimer.current);      ocrTimer.current = null }
    if (noticeTimeoutRef.current) { clearTimeout(noticeTimeoutRef.current); noticeTimeoutRef.current = null }
    ocrLoopActiveRef.current = false
    terminateOcrWorker()
  }, [terminateOcrWorker])

  // ── Flash ──────────────────────────────────────────────────────────────────
  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0] as any
    if (!track?.getCapabilities?.()?.torch) return
    try {
      const next = !state.flashOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setState(s => ({ ...s, flashOn: next }))
    } catch {}
  }, [state.flashOn])

  // ── Camera switch (front / back) ────────────────────────────────────────────
  const switchCamera = useCallback(async () => {
    const next = state.facingMode === 'environment' ? 'user' : 'environment'
    const wasOcr = state.mode === 'ocr'
    ocrLoopActiveRef.current = false
    if (ocrTimer.current) { clearTimeout(ocrTimer.current); ocrTimer.current = null }
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setState(s => ({ ...s, facingMode: next, mode: 'idle' }))
    const ok = await startCamera(next)
    if (ok && mountedRef.current) {
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: manualModeRef.current || (wasOcr ? 'ocr' : 'barcode') }))
      if (manualModeRef.current === 'ocr' || wasOcr) startOcrLoop()
      else startBarcodeLoop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.facingMode, state.mode, startCamera, attachStream])

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
  const selectProduct = useCallback(async (product: LocalProduct) => {
    if (!mountedRef.current) return
    setState(s => ({ ...s, status: 'submitting' }))
    stopCamera()
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
  }, [onResult, stopCamera, state.lastBarcode, state.lastOcrText])

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
  }, [getOcrWorker, matchNormalizedText])

  const startOcrLoop = useCallback(() => {
    if (ocrLoopActiveRef.current) return // already running — never start a second overlapping loop
    ocrLoopActiveRef.current = true
    ocrTick()
  }, [ocrTick])

  const stopOcrLoop = useCallback(() => {
    ocrLoopActiveRef.current = false
    if (ocrTimer.current) { clearTimeout(ocrTimer.current); ocrTimer.current = null }
  }, [])

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

  // ── Barcode scanning loop ──────────────────────────────────────────────────
  const startBarcodeLoop = useCallback(async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    barcodeStart.current = Date.now()

    barcodeTimer.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || !mountedRef.current) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = videoRef.current.videoWidth  || 640
        canvas.height = videoRef.current.videoHeight || 480
        canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
        const result = await reader.decodeFromCanvas(canvas)
        const code   = result?.getText()
        if (!code || !mountedRef.current) return

        clearInterval(barcodeTimer.current!); barcodeTimer.current = null
        setState(s => ({ ...s, lastBarcode: code }))

        const products = await searchBarcode(code)
        if (!mountedRef.current) return
        if (products.length > 0) {
          setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: products }))
        } else {
          const normalizedCode = normalizeOcrText(code)
          const fuzzy = await searchFuzzy(normalizedCode)
          if (!mountedRef.current) return
          if (fuzzy.length > 0) {
            setState(s => ({ ...s, status: 'matches', mode: 'barcode', matches: fuzzy }))
          } else if (manualModeRef.current !== 'barcode') {
            setState(s => ({ ...s, mode: 'ocr' }))
            startOcrLoop()
          }
        }
      } catch (err: any) {
        if (err?.name === 'NotFoundException') {
          if (manualModeRef.current !== 'barcode' && Date.now() - barcodeStart.current > BARCODE_TIMEOUT_MS) {
            clearInterval(barcodeTimer.current!); barcodeTimer.current = null
            if (!mountedRef.current) return
            setState(s => ({ ...s, mode: 'ocr' }))
            startOcrLoop()
          }
        }
      }
    }, BARCODE_INTERVAL_MS)
  }, [searchBarcode, searchFuzzy, startOcrLoop])

  // ── Manual mode override (Barcode / OCR bottom-bar buttons) ────────────────
  const setMode = useCallback((mode: 'barcode' | 'ocr') => {
    manualModeRef.current = mode
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    stopOcrLoop()
    setState(s => ({ ...s, mode, status: 'scanning', ocrProgress: 0, notice: null }))
    if (mode === 'barcode') startBarcodeLoop()
    else startOcrLoop()
  }, [startBarcodeLoop, startOcrLoop, stopOcrLoop])

  // ── Rescan / retry ──────────────────────────────────────────────────────────
  const rescan = useCallback(async () => {
    if (barcodeTimer.current) { clearInterval(barcodeTimer.current); barcodeTimer.current = null }
    stopOcrLoop()
    manualModeRef.current = null
    setState(s => ({ ...s, status: 'scanning', mode: 'barcode', matches: [], error: null, notice: null, lastBarcode: null, lastOcrText: null, ocrProgress: 0 }))
    const ok = streamRef.current ? true : await startCamera(state.facingMode)
    if (ok) await startBarcodeLoop()
  }, [startCamera, startBarcodeLoop, stopOcrLoop, state.facingMode])

  const retryPermission = useCallback(async () => {
    setState(s => ({ ...s, status: 'requesting-permission', error: null }))
    const ok = await startCamera(state.facingMode)
    if (ok && mountedRef.current) {
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      await startBarcodeLoop()
    }
  }, [startCamera, startBarcodeLoop, state.facingMode, attachStream])

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
      const ok = await startCamera('environment')
      if (cancelled || !mountedRef.current || !ok) return
      await attachStream()
      setState(s => ({ ...s, status: 'scanning', mode: 'barcode' }))
      await startBarcodeLoop()
    }
    init()

    return () => { cancelled = true; stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // ── Defensive re-attach ──────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    attachStream()
  }, [active, state.status, attachStream])

  return {
    state, videoRef, containerRef,
    toggleFlash, switchCamera, setMode,
    selectProduct, rescan, retryPermission, scanImageFile,
  }
}
