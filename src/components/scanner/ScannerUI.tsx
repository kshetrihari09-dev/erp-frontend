/**
 * ScannerUI.tsx
 *
 * Shared, presentation-only scanner UI pieces used by both the local
 * (same-device) scanner and the cross-device mobile scanner page, so
 * they render identical overlays/cards instead of duplicating JSX. No
 * scanning/business logic lives here.
 */
import { motion } from 'framer-motion'
import { BARCODE_SCAN_WIDTH, BARCODE_SCAN_HEIGHT } from '@/utils/barcodeFrame'

// ── Barcode scan overlay (rectangular) ───────────────────────────────────────
// The single, shared visual guide for the scanner — the exact rectangle
// size here is BARCODE_SCAN_WIDTH/HEIGHT, the same constants
// useBarcodeEngine's decode loop crops from the video (via
// captureBarcodeFrame in barcodeFrame.ts), so what's lit up on screen is
// always exactly the region actually being decoded.
export function BarcodeRectOverlay({ found = false }: { found?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="relative rounded-2xl"
        style={{
          width: BARCODE_SCAN_WIDTH,
          height: BARCODE_SCAN_HEIGHT,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className={`absolute inset-0 rounded-2xl border-2 transition-colors duration-200 ${
            found ? 'border-green-400/90' : 'border-white/40'
          }`}
        />
        {/* Corner marks — classic barcode-scanner viewfinder styling */}
        {!found && [
          'top-0 left-0 border-t-2 border-l-2 rounded-tl-2xl',
          'top-0 right-0 border-t-2 border-r-2 rounded-tr-2xl',
          'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-2xl',
          'bottom-0 right-0 border-b-2 border-r-2 rounded-br-2xl',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-7 h-7 border-white/90 ${cls}`} />
        ))}
        {!found && (
          <motion.div
            className="absolute left-3 right-3 h-0.5 rounded-full bg-blue-400/80 shadow-lg shadow-blue-400/50"
            animate={{ top: ['12%', '86%', '12%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    </div>
  )
}

// ── Mode badge ────────────────────────────────────────────────────────────────
export function ModeBadge({ mode }: { mode: string }) {
  if (mode === 'barcode') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 backdrop-blur-sm rounded-full text-white text-xs font-semibold">
        <span>📷</span> Scanning barcode…
      </div>
    )
  }
  return null
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
