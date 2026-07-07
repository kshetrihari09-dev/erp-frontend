/**
 * ScannerUI.tsx
 *
 * Shared, presentation-only scanner UI pieces — extracted verbatim from
 * MobileScannerPage.tsx so both the existing cross-device mobile page and
 * the new local (same-device) scanner render identical overlays/cards
 * instead of duplicating JSX. No scanning/business logic lives here.
 */
import { motion } from 'framer-motion'
import { SCAN_BOX_WIDTH, SCAN_BOX_HEIGHT } from '@/utils/ocrImage'

// ── Scan frame overlay ────────────────────────────────────────────────────────
// The box below is drawn at the exact same pixel size (SCAN_BOX_WIDTH x
// SCAN_BOX_HEIGHT) that useLocalScanner's captureScanBoxFrame() crops from
// the video — this is the literal region OCR/barcode detection reads, not
// just a decorative guide, so what's dimmed vs. lit here must always match
// what gets processed.
export function ScanFrame({ mode }: { mode: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Dims everything outside the box via a huge box-shadow spread —
          the box itself stays fully lit. */}
      <div
        className="relative rounded-xl"
        style={{
          width: SCAN_BOX_WIDTH,
          height: SCAN_BOX_HEIGHT,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
        }}
      >
        {/* Corner marks */}
        {[
          'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
          'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
          'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
          'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-6 h-6 border-white/90 ${cls}`} />
        ))}
        {/* Animated scan line */}
        <motion.div
          className={`absolute left-1 right-1 h-0.5 rounded-full shadow-lg ${
            mode === 'ocr' ? 'bg-purple-400/80 shadow-purple-400/50' : 'bg-blue-400/80 shadow-blue-400/50'
          }`}
          animate={{ top: ['10%', '86%', '10%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

// ── Mode badge ────────────────────────────────────────────────────────────────
export function ModeBadge({ mode, ocrProgress }: { mode: string; ocrProgress: number }) {
  if (mode === 'barcode') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 backdrop-blur-sm rounded-full text-white text-xs font-semibold">
        <span>📷</span> Scanning barcode…
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
