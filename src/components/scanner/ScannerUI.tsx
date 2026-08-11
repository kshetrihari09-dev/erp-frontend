/**
 * ScannerUI.tsx
 *
 * Shared, presentation-only scanner UI pieces used by both the local
 * (same-device) scanner and the cross-device mobile scanner page, so
 * they render identical overlays/cards instead of duplicating JSX. No
 * scanning/business logic lives here.
 */
import { motion } from 'framer-motion'
import { ScanLine, QrCode } from 'lucide-react'
import { BARCODE_SCAN_WIDTH, BARCODE_SCAN_HEIGHT, QR_SCAN_SIZE } from '@/utils/barcodeFrame'
import type { ScanMode } from '@/hooks/scanner/useBarcodeEngine'

// ── Barcode scan overlay (rectangular) ───────────────────────────────────────
// The single, shared visual guide for the scanner. Sized from the exact
// same constants useBarcodeEngine's decode loop crops from the video (see
// barcodeFrame.ts) — square QR_SCAN_SIZE guide in QR mode, wide/short
// BARCODE_SCAN_WIDTH/HEIGHT guide otherwise — so what's lit up on screen
// is always exactly the region actually being decoded.
export function BarcodeRectOverlay({ found = false, mode = 'barcode' }: { found?: boolean; mode?: ScanMode }) {
  const width  = mode === 'qr' ? QR_SCAN_SIZE : BARCODE_SCAN_WIDTH
  const height = mode === 'qr' ? QR_SCAN_SIZE : BARCODE_SCAN_HEIGHT
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="relative rounded-[28px]"
        style={{
          width,
          height,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className={`absolute inset-0 rounded-[28px] border transition-colors duration-200 ${
            found ? 'border-green-400/90' : 'border-white/20'
          }`}
        />
        {/* Corner brackets — classic barcode-scanner viewfinder styling,
            softened with a larger radius and heavier stroke to read as a
            deliberate "frame" rather than a plain rectangle. */}
        {!found && [
          'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-[20px]',
          'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-[20px]',
          'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[20px]',
          'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[20px]',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-9 h-9 border-white ${cls}`} />
        ))}
        {found && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-green-500/90 flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
        {!found && (
          <motion.div
            className="absolute left-3 right-3 h-0.5 rounded-full bg-green-400/90 shadow-lg shadow-green-400/50"
            animate={{ top: ['12%', '86%', '12%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    </div>
  )
}

// ── Barcode / QR mode toggle ─────────────────────────────────────────────────
// Lets the person explicitly tell the scanner which symbology to look for
// (see useBarcodeEngine.ts's ScanMode) instead of it silently trying every
// format on every frame. Barcode mode decodes with a reader scoped to
// EAN/UPC/CODE_128 only; QR mode switches to a dedicated QR-only decoder
// and stops the instant a code is read. Deliberately compact — a small
// segmented control, not another full-size button — so it sits comfortably
// in the scanner's top bar next to the title instead of competing with the
// main scan target for attention.
export function ScanModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
  const optionClass = (active: boolean) =>
    `flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold transition-colors ${
      active ? 'bg-white text-slate-900' : 'text-white/75'
    }`

  return (
    <div
      role="group"
      aria-label="Scan mode"
      className="flex items-center p-0.5 rounded-full bg-white/15 backdrop-blur-md flex-shrink-0"
    >
      <button
        type="button"
        onClick={() => onChange('barcode')}
        aria-pressed={mode === 'barcode'}
        className={optionClass(mode === 'barcode')}
      >
        <ScanLine size={13} /> Barcode
      </button>
      <button
        type="button"
        onClick={() => onChange('qr')}
        aria-pressed={mode === 'qr'}
        className={optionClass(mode === 'qr')}
      >
        <QrCode size={13} /> QR
      </button>
    </div>
  )
}

// ── Scan status pill ─────────────────────────────────────────────────────────
// Small dark pill with a pulsing dot — the single shared "here's what's
// happening" indicator both scanners show while the camera is live.
export function ScanStatusPill({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-semibold">
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
      </span>
      {label}
    </div>
  )
}

// Kept as a thin backward-compatible wrapper in case anything else still
// imports the old name/shape.
export function ModeBadge({ mode }: { mode: string }) {
  if (mode !== 'barcode') return null
  return <ScanStatusPill label="Scanning barcode…" />
}

// ── Product match card ────────────────────────────────────────────────────────
export interface ProductCardProduct {
  id:             string
  name:           string
  generic_name?:  string
  item_code?:     string
  unit?:          string
  current_stock?: number
}

export function ProductCard({ product, index, onSelect }: {
  product:  ProductCardProduct
  index:    number
  onSelect: (p: any) => void
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
