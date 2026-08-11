import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { detectBarcodeFormat } from '@/utils/barcodeFormat'

// CSS reference pixel density: 96px per inch, 25.4mm per inch.
const MM_TO_PX = 96 / 25.4

export interface BarcodeLabelProps {
  name: string
  price: number | string
  code: string
  widthMm: number
  heightMm: number
  /** className hook only — no Tailwind classes are relied on internally,
   *  every visual rule here is an inline style. That's deliberate: this
   *  same markup gets cloned into a print-popup's innerHTML (see
   *  BarcodePrintPage's printSheet()) and rasterized by html2canvas for
   *  the PDF export, and neither of those picks up the app's Tailwind
   *  bundle — only inline styles survive both paths. */
  className?: string
  /** Fires whenever this label's own too-dense-to-scan-reliably state
   *  changes (see ACCURATE SCANNING below). Optional — callers that just
   *  want a visual (like the Product page's single-label preview) can
   *  ignore it; BarcodePrintPage uses it to roll up a page-level warning
   *  naming the specific products affected. */
  onTooDense?: (tooDense: boolean) => void
}

// Absolute floor for the narrow-bar module width, in real px at 96dpi.
// Below this, bars are thinner than what commodity laser/thermal
// printers and handheld/POS scanners reliably resolve together — GS1
// guidance treats ~0.19mm (X-dimension) as the practical minimum, which
// is ~0.72px at 96dpi; 0.75 keeps a small safety margin above that.
const MIN_MODULE_WIDTH_PX = 0.75

/**
 * A single scannable price label, styled to match a clean printed
 * sticker: bold name, hairline rule, bars-only barcode, the human-
 * readable code on its own line, a second hairline, then the price.
 *
 *   ┌──────────────────────┐
 *   │     BAL AMRIT SYP     │
 *   │ ───────────────────── │
 *   │  |||| ||| || |||||   │
 *   │     20000002002001    │
 *   │ ───────────────────── │
 *   │       Rs. 145.00      │
 *   └──────────────────────┘
 *
 * Renders the barcode into an <svg> (not <canvas>) specifically because
 * SVG markup survives `element.innerHTML` copying — canvas pixel data
 * does not. That matters here because the print-popup path in
 * BarcodePrintPage clones this component's rendered DOM via innerHTML.
 *
 * JsBarcode's own `displayValue` text is turned OFF — its digit font
 * sits glued directly under the bars with no control over spacing or
 * weight, which is what made older labels look cramped/smudgy. Instead
 * the human-readable code is a separate, independently-styled row, so
 * it keeps the small, evenly tracked look of a real price sticker no
 * matter how tight the label is.
 *
 * SIZING — all four rows (name / barcode / code / price) plus the two
 * hairline rules are budgeted as fixed real-px fractions of the
 * label's actual pixel height (MM_TO_PX), clamped so text stays
 * legible on tiny labels without ballooning on large ones and without
 * ever summing to more than the label itself.
 */
export default function BarcodeLabel({ name, price, code, widthMm, heightMm, className, onTooDense }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Set only when JsBarcode itself rejects `code` (characters it can't
  // encode) — surfaced to the label instead of silently leaving a blank
  // SVG, so a bad stored value is visibly wrong rather than invisibly
  // blank. Never triggers a different value being drawn.
  const [renderError, setRenderError] = useState(false)
  // ACCURATE SCANNING: set when the encoded data is too long to fit this
  // label's physical width even at the minimum reliably-scannable module
  // width (see MIN_MODULE_WIDTH_PX below). Rather than let CSS
  // (`maxWidth: 100%`) silently squeeze the bars past that floor — which
  // is exactly how a barcode can look fine on screen and fail under a
  // real scanner — we stop shrinking and surface it instead.
  const [tooDense, setTooDense] = useState(false)

  const heightPx = heightMm * MM_TO_PX

  // Fixed, real-px budgets for each text row, clamped for legibility.
  // Kept deliberately small/tight — these are price-tag labels, not posters.
  const namePx  = Math.min(13, Math.max(6, heightPx * 0.13))
  const codePx  = Math.min(8, Math.max(5, heightPx * 0.08))
  const pricePx = Math.min(15, Math.max(7, heightPx * 0.15))
  const rulePx  = 1              // hairline thickness
  const rowGapPx = Math.max(1.5, heightPx * 0.025) // breathing room between rows

  // Everything not spent on text/rules/gaps is the barcode bars' budget.
  const chromePx = namePx + codePx + pricePx + rulePx * 2 + rowGapPx * 5
  const barsHeightPx = Math.max(10, heightPx - chromePx)

  // `code` here is always `product.barcode`, verbatim — no `|| item_code`
  // fallback, no padding/truncation, nothing regenerated. The format is
  // *detected* from that exact string (13 digits + valid EAN-13 check
  // digit → EAN13, everything else → CODE128); the digits handed to
  // JsBarcode are never altered based on which format gets picked.
  //
  // ACCURATE SCANNING — two real, previously-silent failure modes fixed here:
  //
  //  1. Quiet zone: `margin: 0` (the old setting) removes the blank
  //     space a scanner needs on either side of the bars to find the
  //     start/stop pattern. On a print sheet with labels packed edge to
  //     edge, that reads as "some labels just don't scan" with no
  //     visible defect. We now reserve a real quiet zone via
  //     marginLeft/marginRight (vertical margin stays 0 — our own layout
  //     already budgets the space above/below the bars).
  //
  //  2. Silent over-shrink: the SVG previously had `maxWidth: 100%` as
  //     its only defense against overflowing a small label, which lets
  //     the browser scale the whole barcode down uniformly — including
  //     below the minimum bar width a scanner can resolve — with nothing
  //     in the UI showing it happened. We now measure the actual
  //     rendered width JsBarcode produced and, if it doesn't fit,
  //     recompute a smaller module width ourselves and redraw at that
  //     exact width. If even the minimum reliable module width
  //     (MIN_MODULE_WIDTH_PX) doesn't fit, we stop and flag `tooDense`
  //     instead of drawing bars we already know won't scan.
  useEffect(() => {
    if (!svgRef.current) return
    setRenderError(false)
    setTooDense(false)
    onTooDense?.(false)
    if (!code) {
      // No barcode stored for this product — leave the SVG blank and let
      // the "Barcode not assigned" row (rendered below) carry the state.
      // Never substitute item_code or generate a new code here.
      svgRef.current.innerHTML = ''
      return
    }

    const format = detectBarcodeFormat(code)
    const baseModuleWidthPx = heightMm >= 30 ? 1.3 : 1.0
    // Reserve quiet zone proportional to module width (roughly the "8-10
    // modules" real barcode specs call for), floored so tiny labels still
    // get a usable minimum rather than none.
    const quietZonePx = (moduleWidthPx: number) =>
      Math.max(moduleWidthPx * 8, 1.2 * MM_TO_PX)

    // Physical space actually available for the SVG: label width minus
    // the 1mm content padding and border on each side (matches the
    // container's own box model below).
    const availableWidthPx = widthMm * MM_TO_PX - 2 * MM_TO_PX - 2 * 1.2

    function draw(moduleWidthPx: number): number | null {
      const qz = quietZonePx(moduleWidthPx)
      try {
        JsBarcode(svgRef.current!, code, {
          format,
          displayValue: false, // human-readable code is rendered as its own styled row below
          margin: 0,
          marginLeft: qz,
          marginRight: qz,
          height: barsHeightPx,
          width: moduleWidthPx,
        })
      } catch {
        return null
      }
      // JsBarcode sets the `width` attribute directly to the rendered
      // pixel width (no viewBox scaling in play), so this is the true
      // on-page size of what we just drew.
      return svgRef.current!.width.baseVal.value
    }

    let renderedWidthPx = draw(baseModuleWidthPx)
    if (renderedWidthPx == null) {
      svgRef.current.innerHTML = ''
      setRenderError(true)
      return
    }

    if (renderedWidthPx > availableWidthPx) {
      const scale = availableWidthPx / renderedWidthPx
      const fittedModuleWidthPx = baseModuleWidthPx * scale
      if (fittedModuleWidthPx < MIN_MODULE_WIDTH_PX) {
        // Even the minimum reliably-scannable module width doesn't fit
        // this label at this data length — stop rather than draw bars
        // we already know are too thin to trust, and surface it.
        svgRef.current.innerHTML = ''
        setTooDense(true)
        onTooDense?.(true)
        return
      }
      draw(fittedModuleWidthPx)
    }
  }, [code, barsHeightPx, heightMm, widthMm, onTooDense])

  const rule = (
    <div
      style={{
        width: '100%',
        height: `${rulePx}px`,
        background: '#000',
        flexShrink: 0,
      }}
    />
  )

  const priceNum = typeof price === 'number' ? price : parseFloat(price as string)
  const priceDisplay = Number.isFinite(priceNum) ? priceNum.toFixed(2) : price

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
        gap: `${rowGapPx}px`,
        border: '1.2px solid #000',
        borderRadius: '1.5mm',
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
          letterSpacing: '0.2px',
        }}
      >
        {name}
      </div>

      {rule}

      <svg
        ref={svgRef}
        style={{
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: `${barsHeightPx}px`,
        }}
      />

      <div
        style={{
          fontSize: `${codePx}px`,
          fontWeight: code ? 400 : 600,
          fontStyle: code ? 'normal' : 'italic',
          letterSpacing: code ? '1px' : 'normal',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          color: code && !renderError && !tooDense ? 'inherit' : '#b91c1c',
        }}
      >
        {!code
          ? 'Barcode not assigned'
          : renderError
          ? 'Invalid barcode'
          : tooDense
          ? `${code} (too dense to scan reliably)`
          : code}
      </div>

      {rule}

      <div style={{ fontSize: `${pricePx}px`, fontWeight: 700, lineHeight: 1.1 }}>
        Rs. {priceDisplay}
      </div>
    </div>
  )
}
