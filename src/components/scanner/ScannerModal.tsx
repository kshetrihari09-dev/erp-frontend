/**
 * ScannerModal.tsx  (FIXED)
 *
 * Desktop modal: shows QR code + connection status + expiry countdown.
 *
 * Status flow (per useScannerSession):
 *   creating  → spinner, "Starting session…" (NEVER shows an error here)
 *   waiting   → QR code visible, "Waiting for phone to connect…" + countdown
 *   connected → green "Phone connected" badge
 *   done      → success message + scanned medicine summary
 *   expired   → "Session expired" + "New QR Code" button
 *   error     → friendly error message + "Try Again" button
 *
 * Lazy-loaded so this (and its `qrcode` dependency) have zero impact on
 * initial bundle size.
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ScanLine, Loader2, CheckCircle2,
  WifiOff, Smartphone, RotateCcw, Zap, Wifi, Clock, AlertTriangle,
} from 'lucide-react'
import type { ScannerState } from '@/hooks/scanner/useScannerSession'

interface Props {
  state:   ScannerState
  context: 'sales' | 'purchase'
  onClose: () => void
  onRetry: () => void
}

function QRCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!url || !ref.current) return
    let cancelled = false
    import('qrcode').then(QRCode => {
      if (cancelled || !ref.current) return
      QRCode.toCanvas(ref.current, url, {
        width: 220, margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [url])
  return (
    <canvas
      ref={ref}
      className="rounded-xl border"
      style={{ width: 220, height: 220, borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}
    />
  )
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function StatusBanner({ state }: { state: ScannerState }) {
  const { status, error, secondsLeft } = state

  if (status === 'error') {
    return (
      <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <WifiOff size={13} className="flex-shrink-0 mt-0.5" />
        <span>{error || 'Something went wrong. Please try again.'}</span>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <Clock size={13} className="flex-shrink-0 mt-0.5" />
        <span>{error || 'This QR code has expired.'}</span>
      </div>
    )
  }

  if (status === 'creating') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
        Starting session…
      </div>
    )
  }

  if (status === 'waiting') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <span className="flex items-center gap-2">
          <Loader2 size={13} className="animate-spin flex-shrink-0" />
          Waiting for phone to connect…
        </span>
        {secondsLeft !== null && (
          <span className="font-mono text-xs font-semibold tabular-nums flex-shrink-0">
            {formatCountdown(secondsLeft)}
          </span>
        )}
      </div>
    )
  }

  if (status === 'connected') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          Phone connected — scanning…
        </span>
        {secondsLeft !== null && (
          <span className="font-mono text-xs font-semibold tabular-nums flex-shrink-0 text-green-600">
            {formatCountdown(secondsLeft)}
          </span>
        )}
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-semibold">
        <CheckCircle2 size={13} className="text-blue-500 flex-shrink-0" />
        Medicine added to invoice!
      </div>
    )
  }

  return null
}

export default function ScannerModal({ state, context, onClose, onRetry }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const { isOpen, status, qrUrl, lastResult, secondsLeft } = state

  const showQr        = status === 'waiting' || status === 'connected' || status === 'done'
  const showRetry     = status === 'error' || status === 'expired'
  const lowOnTime     = secondsLeft !== null && secondsLeft <= 30 && secondsLeft > 0
  const noLanWarning  = qrUrl?.includes('localhost') || qrUrl?.includes('127.0.0.1')

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden z-10"
            style={{ background: 'var(--surface)' }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={  { opacity: 0, scale: 0.95, y: 10  }}
            transition={{ duration: 0.2, ease: [0.22, 0.68, 0, 1.2] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
                  <ScanLine size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-[var(--text)] text-sm leading-tight">Scan Medicine</p>
                  <p className="text-xs text-[var(--text-4)]">{context === 'sales' ? 'Sales Invoice' : 'Purchase Invoice'}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-lg text-[var(--text-4)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] flex items-center justify-center transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 flex flex-col items-center gap-4">

              {/* ── QR / loading / error / expired states ──────────────── */}
              {showQr ? (
                <div className="relative">
                  {qrUrl
                    ? <QRCanvas url={qrUrl} />
                    : <div className="w-[220px] h-[220px] rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <Loader2 size={26} className="text-[var(--text-4)] animate-spin" />
                      </div>
                  }
                  {status === 'connected' && (
                    <div
                      className="absolute -top-2 -right-2 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center"
                      style={{ boxShadow: `0 2px 8px rgba(0,0,0,.15), 0 0 0 2px var(--surface)` }}
                    >
                      <Smartphone size={13} className="text-white" />
                    </div>
                  )}
                  {status === 'done' && (
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface)' }}>
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.4 }}>
                        <CheckCircle2 size={48} className="text-green-500" />
                      </motion.div>
                    </div>
                  )}
                </div>
              ) : status === 'creating' ? (
                <div className="w-[220px] h-[220px] rounded-xl flex flex-col items-center justify-center gap-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <Loader2 size={28} className="text-brand animate-spin" />
                  <p className="text-xs text-[var(--text-4)]">Setting up scanner…</p>
                </div>
              ) : (
                /* error or expired */
                <div className="w-[220px] h-[220px] rounded-xl bg-red-50 border border-red-100 flex flex-col items-center justify-center gap-3">
                  <AlertTriangle size={28} className={status === 'expired' ? 'text-amber-400' : 'text-red-400'} />
                  <p className="text-xs text-[var(--text-4)] px-6 text-center">
                    {status === 'expired' ? 'QR code expired' : 'Could not start scanner'}
                  </p>
                </div>
              )}

              {/* Instructions */}
              {showQr && (
                <div className="text-center">
                  <p className="text-sm font-semibold text-[var(--text-2)]">Open phone camera → scan QR</p>
                  <p className="text-xs text-[var(--text-4)] mt-0.5">Phone must be on the same WiFi network</p>
                </div>
              )}

              {/* WiFi notice */}
              {showQr && (
                <div className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <Wifi size={12} className="flex-shrink-0" />
                  Works offline — same local network only. No internet needed.
                </div>
              )}

              {/* Localhost warning — QR won't be reachable from a phone */}
              {showQr && noLanWarning && (
                <div className="w-full flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Couldn't detect a local network address. This QR code points to{' '}
                    <span className="font-mono">localhost</span> and won't open on a phone.
                    Make sure your computer is connected to WiFi and try again.
                  </span>
                </div>
              )}

              {/* Low-time warning */}
              {showQr && lowOnTime && status !== 'done' && (
                <div className="w-full flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                  <Clock size={12} className="flex-shrink-0" />
                  Expiring soon — scan now or it will refresh automatically.
                </div>
              )}

              {/* Status row */}
              <StatusBanner state={state} />

              {/* Last result */}
              {lastResult && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className="w-full flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div className="w-7 h-7 rounded-lg bg-[var(--brand-light)] flex items-center justify-center flex-shrink-0">
                    <Zap size={12} className="text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-[var(--text-4)] uppercase tracking-wide">Added to invoice</p>
                    <p className="text-sm font-bold text-[var(--text)] truncate">{lastResult.product?.name}</p>
                    <p className="text-[10px] text-[var(--text-4)]">
                      via {lastResult.scanMethod === 'barcode' ? '📷 Barcode' : lastResult.scanMethod === 'ocr' ? '🔤 OCR' : '👆 Manual'}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Steps — only show while waiting for first connection */}
              {(status === 'waiting' || status === 'creating') && (
                <div className="w-full space-y-2">
                  {[
                    ['1', 'Point phone camera at this QR code'],
                    ['2', 'Scanner opens in phone browser'],
                    ['3', 'Scan barcode or point at medicine package'],
                  ].map(([n, txt]) => (
                    <div key={n} className="flex items-center gap-2.5 text-xs text-[var(--text-3)]">
                      <span className="w-5 h-5 rounded-full bg-[var(--brand-light)] text-brand text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ border: '1px solid var(--border)' }}>{n}</span>
                      {txt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-2">
              {showRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 h-9 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw size={12} />
                  {status === 'expired' ? 'New QR Code' : 'Try Again'}
                </button>
              )}
              <button
                onClick={onClose}
                className={`h-9 rounded-xl text-sm font-semibold text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] flex items-center justify-center gap-2 transition-colors ${showRetry ? 'px-4' : 'flex-1'}`}
                style={{ border: '1px solid var(--border-2)' }}
              >
                {!showRetry && <RotateCcw size={12} />}
                {status === 'done' ? 'Close' : showRetry ? 'Cancel' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}