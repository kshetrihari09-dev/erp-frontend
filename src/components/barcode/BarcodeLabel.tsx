import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

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
}

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
export default function BarcodeLabel({ name, price, code, widthMm, heightMm, className }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

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

  useEffect(() => {
    if (!svgRef.current || !code) return
    try {
      JsBarcode(svgRef.current, code, {
        format: 'CODE128',
        displayValue: false, // human-readable code is rendered as its own styled row below
        margin: 0,
        height: barsHeightPx,
        width: heightMm >= 30 ? 1.3 : 1.0,
      })
    } catch {
      // Empty/invalid code (e.g. mid-search, before a product is picked) —
      // leave the SVG blank instead of crashing the whole print page.
      svgRef.current.innerHTML = ''
    }
  }, [code, barsHeightPx, heightMm])

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
          fontWeight: 400,
          letterSpacing: '1px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {code}
      </div>

      {rule}

      <div style={{ fontSize: `${pricePx}px`, fontWeight: 700, lineHeight: 1.1 }}>
        Rs. {priceDisplay}
      </div>
    </div>
  )
}
