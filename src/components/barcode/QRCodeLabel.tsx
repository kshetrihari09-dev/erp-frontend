import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// CSS reference pixel density: 96px per inch, 25.4mm per inch.
const MM_TO_PX = 96 / 25.4

// ISO/IEC 18004's own minimum quiet zone for a QR code is 4 modules on
// every side — the blank border a scanner's detector uses to find the
// code's edges in the first place. Passed straight to qrcode's own
// `margin` option (which is specified in modules, not px) so it's baked
// into the rendered bitmap itself, not left to whatever incidental
// whitespace the surrounding label layout happens to leave. That matters
// because the previous `margin: 0` relied entirely on this label's own
// 1mm side padding / 0.5mm row gap for a quiet zone — thin, and shared
// with the printed name/price text and the label's dashed cut line, so
// it could (and in practice did) fall short once actually printed and
// trimmed, even though the on-screen preview looked fine.
const QUIET_ZONE_MODULES = 4

// Minimum module size we'll draw at, mirroring BarcodeLabel's
// MIN_MODULE_WIDTH_PX guard for the same reason: below this, a scanner
// can no longer reliably resolve individual modules, and letting CSS
// silently shrink the canvas past it produces a code that looks fine on
// screen but fails under a real scanner with no visible sign why. Set a
// little higher than the linear barcode's floor (0.75px) because a QR
// module has to be resolved cleanly in both dimensions, not just one, so
// it's more sensitive to the same amount of print/optical blur.
const MIN_QR_MODULE_PX = 1.0

export interface QRCodeLabelProps {
  name: string
  price: number | string
  /** MUST be exactly `product.barcode`, verbatim — no JSON, no product
   *  id, no account id, no prefix/suffix, nothing else appended. Pass
   *  `''` (not a fallback identifier) when the product has no barcode;
   *  the label then shows "Barcode not assigned" instead of drawing a
   *  QR for a different identifier. See utils/productQr.ts. */
  code: string
  widthMm: number
  heightMm: number
  /** className hook only — no Tailwind classes are relied on internally,
   *  every visual rule here is an inline style, mirroring BarcodeLabel so
   *  this same markup survives the print-popup innerHTML clone and the
   *  html2canvas rasterization used for PDF export. */
  className?: string
  /** Fires whenever this code would have to render with modules smaller
   *  than MIN_QR_MODULE_PX to fit widthMm/heightMm — i.e. whenever this
   *  label is blocked from being scannable at this size. Mirrors
   *  BarcodeLabel's identical onTooDense so callers (QRCodePrintPage) can
   *  block printing/exporting for just the affected product(s) instead
   *  of silently shipping a code that won't scan. */
  onTooDense?: (tooDense: boolean) => void
}

/**
 * A single scannable QR label — same three-row layout as BarcodeLabel
 * (name / code / price) but with a square QR square in place of the
 * linear barcode. Sizing follows the same budgeted-rows approach: the
 * name and price rows get fixed, clamped px budgets based on the
 * label's real pixel height, and whatever remains is the QR's square
 * budget, so nothing overflows a small label the way an unclamped
 * barcode height did before.
 */
export default function QRCodeLabel({ name, price, code, widthMm, heightMm, className, onTooDense }: QRCodeLabelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderError, setRenderError] = useState(false)
  // See MIN_QR_MODULE_PX above — set when this code's data size (which
  // grows with the length/error-correction of `code`, not with label
  // size) would need modules smaller than that floor to fit this exact
  // label size.
  const [tooDense, setTooDense] = useState(false)

  const heightPx = heightMm * MM_TO_PX
  const widthPx  = widthMm * MM_TO_PX

  const namePx  = Math.min(10, Math.max(5, heightPx * 0.10))
  const pricePx = Math.min(16, Math.max(7, heightPx * 0.16))
  const gapsPx  = 3 // breathing room around the QR block

  // Whatever's left over vertically is the QR's budget — but it also
  // can't exceed the label's own width, since the QR square must fit
  // both dimensions of the label.
  const qrBudgetPx = Math.max(14, Math.min(heightPx - namePx - pricePx - gapsPx, widthPx * 0.9))

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    setRenderError(false)
    setTooDense(false)
    onTooDense?.(false)
    if (!code) {
      // No barcode stored for this product — leave the canvas blank and
      // let the "Barcode not assigned" row (rendered below) carry the
      // state. Never encode item_code, product id, or anything else in
      // its place — that would just be a different silent substitution.
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    // ACCURATE SCANNING — measure BEFORE drawing anything, the same way
    // BarcodeLabel measures its actual rendered width before deciding
    // whether to shrink or give up: QRCode.create() (synchronous) gives
    // us the data grid size in modules for this exact code + error-
    // correction level, *not* counting the quiet zone — so we can work
    // out the real on-label module size this label size would produce
    // and catch it before committing to a draw we already know won't be
    // reliably scannable.
    let dataModules: number
    try {
      dataModules = QRCode.create(code, { errorCorrectionLevel: 'M' }).modules.size
    } catch {
      // QRCode rejected the value outright — surface it rather than
      // silently leaving a blank/different code.
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      setRenderError(true)
      return
    }

    const totalGridModules = dataModules + QUIET_ZONE_MODULES * 2
    const moduleSizePx = qrBudgetPx / totalGridModules
    if (moduleSizePx < MIN_QR_MODULE_PX) {
      // Even with a correct 4-module quiet zone reserved, an individual
      // module would render smaller than MIN_QR_MODULE_PX at this label
      // size — stop rather than draw a QR we already know is likely to
      // fail under a scanner, and surface it (mirrors BarcodeLabel's
      // identical tooDense behavior).
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      setTooDense(true)
      onTooDense?.(true)
      return
    }

    // Render at 4x the display size so it stays crisp when scaled up for
    // print / PDF export (matches the >1x density BarcodeLabel gets for
    // free from its SVG's vector bars).
    //
    // IMPORTANT: qrcode's canvas renderer sets canvas.style.width/height
    // itself, equal to the `width` option below (see qrcode/lib/renderer
    // /canvas.js clearCanvas) — it does NOT scale the buffer down to fit,
    // it just displays 1:1 at that pixel size. Left alone, that means the
    // QR renders at 4x the intended box (`renderPx`), overflowing the
    // label and overlapping the name/price text above/below it. So after
    // toCanvas finishes, force the CSS size back down to the actual
    // display budget — the oversized buffer stays for crispness, only
    // the on-screen size changes.
    const renderPx = Math.round(qrBudgetPx * 4)
    // `code` is encoded exactly as given — always `product.barcode`
    // verbatim, never JSON/prefixed/combined with any other field. A QR
    // scan of this label must decode to exactly this string.
    QRCode.toCanvas(canvas, code, {
      width: renderPx,
      margin: QUIET_ZONE_MODULES,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(() => {
      canvas.style.width = `${qrBudgetPx}px`
      canvas.style.height = `${qrBudgetPx}px`
    }).catch(() => {
      // QRCode rejected the value outright — surface it rather than
      // silently leaving a blank/different code.
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      setRenderError(true)
    })
  }, [code, qrBudgetPx, onTooDense])

  return (
    <div
      className={className}
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5mm',
        border: '1px dashed #999',
        boxSizing: 'border-box',
        padding: '1mm',
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
        background: '#fff',
        color: '#000',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        style={{
          fontSize: `${namePx}px`,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          lineHeight: 1.1,
        }}
      >
        {name}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: code && !renderError && !tooDense ? 'block' : 'none',
          width: `${qrBudgetPx}px`,
          height: `${qrBudgetPx}px`,
          maxWidth: '100%',
          maxHeight: `${qrBudgetPx}px`,
        }}
      />
      {(!code || renderError || tooDense) && (
        <div
          style={{
            width: `${qrBudgetPx}px`,
            height: `${qrBudgetPx}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            border: '1px dashed #b91c1c',
            boxSizing: 'border-box',
            padding: '2px',
            fontSize: Math.max(6, Math.min(9, qrBudgetPx * 0.12)),
            fontWeight: 600,
            color: '#b91c1c',
            lineHeight: 1.15,
          }}
        >
          {!code ? 'Barcode not assigned' : renderError ? 'Invalid barcode' : 'Too dense to scan reliably'}
        </div>
      )}
      <div style={{ fontSize: `${pricePx}px`, fontWeight: 700, lineHeight: 1.1 }}>
        Rs. {price}
      </div>
    </div>
  )
}
