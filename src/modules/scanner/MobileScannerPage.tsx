/**
 * MobileScannerPage.tsx
 *
 * Full-screen scanner page opened on the user's phone via QR code.
 * Route: /scan?token=TOKEN
 *
 * Runs entirely on the LAN — no internet, no WebSockets.
 * Communicates with the same local backend the desktop uses.
 *
 * The API base URL is inferred from the page's own origin
 * (window.location.origin) since both desktop and mobile hit the same server.
 */

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, AlertCircle, Loader2, ScanLine,
  RotateCcw, X, Zap,
} from 'lucide-react'
import useMobileScanner from '@/hooks/scanner/useMobileScanner'
import type { MobileProduct } from '@/hooks/scanner/useMobileScanner'

/**
 * getApiBase() — figures out the correct backend URL from the phone's browser.
 *
 * The phone opens:  http://192.168.1.7:3000/scan?token=...
 *                                         ^^^^
 *                                         Vite dev-server port (3000)
 *
 * The backend runs: http://192.168.1.7:5000
 *                                         ^^^^
 *                                         Express port (5000)
 *
 * So we CANNOT just use window.location.origin — that gives port 3000 which
 * has no /api/v1 routes.  We take the hostname from the URL (which is the
 * correct LAN IP) and swap in the backend port from the env var.
 *
 * In production: frontend + backend share the same origin → use origin directly.
 */
function getApiBase(): string {
  const env = (import.meta as any).env || {}

  // If VITE_API_BASE_URL is explicitly set and is not localhost, trust it.
  // This handles prod and cases where the user set the env to their LAN IP.
  const explicit = env.VITE_API_BASE_URL as string | undefined
  if (explicit && !explicit.includes('localhost') && !explicit.includes('127.0.0.1')) {
    return explicit
  }

  // Build from the page's own hostname + the backend port env var.
  // window.location.hostname is the LAN IP the phone used to open this page
  // (e.g. 192.168.1.7), so we keep that and swap the port to the backend port.
  const protocol    = window.location.protocol              // 'http:'
  const hostname    = window.location.hostname              // '192.168.1.7'
  const backendPort = env.VITE_BACKEND_PORT || '5000'       // Express port

  return `${protocol}//${hostname}:${backendPort}/api/v1`
}

// ── Scan frame overlay ────────────────────────────────────────────────────────
function ScanFrame({ mode }: { mode: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-64 h-44">
        {/* Corner marks */}
        {[
          'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
          'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
          'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
          'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-7 h-7 border-white/80 ${cls}`} />
        ))}
        {/* Animated scan line */}
        <motion.div
          className={`absolute left-1 right-1 h-0.5 rounded-full shadow-lg ${
            mode === 'ocr' ? 'bg-purple-400/80 shadow-purple-400/50' : 'bg-blue-400/80 shadow-blue-400/50'
          }`}
          animate={{ top: ['10%', '86%', '10%'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

// ── Mode badge ────────────────────────────────────────────────────────────────
function ModeBadge({ mode, ocrProgress }: { mode: string; ocrProgress: number }) {
  if (mode === 'barcode') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 backdrop-blur-sm rounded-full text-white text-xs font-semibold">
        <ScanLine size={11} /> Scanning barcode…
      </div>
    )
  }
  if (mode === 'ocr') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 backdrop-blur-sm rounded-full text-white text-xs font-semibold">
          <span>🔤</span> Reading text{ocrProgress > 0 ? ` ${ocrProgress}%` : '…'}
        </div>
        {ocrProgress > 0 && (
          <div className="w-28 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-purple-400 rounded-full transition-all duration-200" style={{ width: `${ocrProgress}%` }} />
          </div>
        )}
      </div>
    )
  }
  return null
}

// ── Product match card ────────────────────────────────────────────────────────
function ProductCard({ product, index, onSelect }: {
  product:  MobileProduct
  index:    number
  onSelect: (p: MobileProduct) => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => onSelect(product)}
      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 active:scale-[.98] active:bg-blue-50 transition-all text-left shadow-sm"
    >
      <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {product.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate leading-tight">{product.name}</p>
        {product.generic_name && (
          <p className="text-xs text-slate-400 truncate">{product.generic_name}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {product.item_code && (
            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{product.item_code}</span>
          )}
          {product.unit && <span className="text-[10px] text-slate-400">{product.unit}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Select</span>
        {typeof product.current_stock === 'number' && (
          <span className={`text-[10px] font-semibold ${product.current_stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
            Stock: {product.current_stock}
          </span>
        )}
      </div>
    </motion.button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileScannerPage() {
  const [params] = useSearchParams()
  const token    = params.get('token') || ''

  const { state, videoRef, toggleFlash, selectProduct, rescan } = useMobileScanner({
    token,
    apiBase: getApiBase(),
  })

  // Prevent body scroll while camera is active
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mb-4">
          <AlertCircle size={28} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-lg mb-2">Scanner Error</p>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">{state.error}</p>
        <button onClick={rescan} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm">
          <RotateCcw size={14} /> Try Again
        </button>
      </div>
    )
  }

  // ── Connecting ─────────────────────────────────────────────────────────────
  if (state.status === 'connecting') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 size={30} className="text-blue-400 animate-spin mb-4" />
        <p className="text-white font-semibold">Connecting…</p>
        <p className="text-slate-500 text-sm mt-1">Make sure you're on the same WiFi</p>
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (state.status === 'done') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.45 }}
          className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-5 shadow-lg shadow-green-500/30"
        >
          <CheckCircle2 size={36} className="text-white" />
        </motion.div>
        <p className="text-white font-bold text-xl mb-2">Sent to Desktop!</p>
        <p className="text-slate-300 text-sm">Medicine has been added to the invoice.</p>
        <button onClick={rescan} className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm">
          <ScanLine size={14} /> Scan Another
        </button>
      </div>
    )
  }

  const showDrawer   = state.status === 'matches' || state.status === 'submitting'
  const scanMethod   = state.lastBarcode ? 'barcode' : 'ocr'

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">

      {/* ── Camera view ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline muted autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Vignette overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

        {/* Scan frame */}
        {(state.status === 'scanning') && <ScanFrame mode={state.mode} />}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <ScanLine size={14} className="text-white" />
            </div>
            <span className="text-white font-bold text-sm">Medicine Scanner</span>
          </div>
          <button
            onClick={toggleFlash}
            className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
          >
            {state.flashOn ? '🔦' : '💡'}
          </button>
        </div>

        {/* Mode badge */}
        {state.status === 'scanning' && (
          <div className="absolute bottom-5 left-0 right-0 flex justify-center">
            <ModeBadge mode={state.mode} ocrProgress={state.ocrProgress} />
          </div>
        )}

        {/* Instruction hint */}
        {state.status === 'scanning' && state.mode === 'barcode' && (
          <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-full text-white/70 text-xs">
              <Zap size={10} className="text-yellow-400" />
              Point at barcode — or hold on medicine name
            </div>
          </div>
        )}
      </div>

      {/* ── Matches bottom sheet ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showDrawer && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[72vh] flex flex-col overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  {state.matches.length === 1 ? 'Medicine Found' : `${state.matches.length} Matches`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {state.lastBarcode
                    ? `Barcode: ${state.lastBarcode}`
                    : state.lastOcrText
                    ? `Text: "${state.lastOcrText.slice(0, 35)}…"`
                    : 'Tap to add to invoice'
                  }
                </p>
              </div>
              <button onClick={rescan} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                <X size={13} />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2">
              {state.status === 'submitting' ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 size={24} className="text-blue-500 animate-spin" />
                  <p className="text-sm text-slate-500">Sending to desktop…</p>
                </div>
              ) : (
                state.matches.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} onSelect={selectProduct} />
                ))
              )}
            </div>

            {/* Rescan */}
            {state.status === 'matches' && (
              <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                <button onClick={rescan} className="w-full h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 flex items-center justify-center gap-2">
                  <RotateCcw size={12} /> Scan Again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
