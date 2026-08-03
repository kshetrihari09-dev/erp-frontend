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
 * A single scannable price label:
 *
 *   Paracetamol 500mg
 *   |||| ||| || |||||
 *   8901234567890
 *   Rs. 55
 *
 * Renders the barcode into an <svg> (not <canvas>) specifically because
 * SVG markup survives `element.innerHTML` copying — canvas pixel data
 * does not. That matters here because the print-popup path in
 * BarcodePrintPage clones this component's rendered DOM via innerHTML.
 *
 * SIZING — previously `heightMm * 3.4` / `heightMm * 2.1` were passed
 * straight into JsBarcode's `height`/`fontSize` options as if they were
 * already pixel counts. For a 25mm-tall label (~94px on screen), that
 * produced an ~85px bar block plus a ~52px digit font — over 130px of
 * barcode alone, before the name/price rows, stuffed into a 94px box.
 * The flex column overflowed massively and `overflow: hidden` clipped
 * straight through the product-name text (the cut-off letters in the
 * reported screenshot). Fixed by converting mm to real px once
 * (MM_TO_PX) and explicitly budgeting the three stacked rows — name,
 * barcode block, price — as fractions of the label's real pixel height,
 * so they can never add up to more than the label itself.
 */
export default function BarcodeLabel({ name, price, code, widthMm, heightMm, className }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const heightPx = heightMm * MM_TO_PX

  // Fixed, real-px budgets for the name/price rows, clamped so they stay
  // legible on tiny labels without ever ballooning on large ones.
  const namePx  = Math.min(22, Math.max(8, heightPx * 0.22))
  const pricePx = Math.min(24, Math.max(9, heightPx * 0.24))
  const gapsPx  = 3 // breathing room around the barcode block

  // Whatever's left over is the barcode's entire budget — bars AND the
  // digit-display text together, since JsBarcode stacks those inside one
  // SVG and both count against the same vertical space.
  const barcodeBudgetPx = Math.max(14, heightPx - namePx - pricePx - gapsPx)
  const barcodeFontPx   = Math.max(6, Math.min(11, barcodeBudgetPx * 0.30))
  const barsHeightPx    = Math.max(8, barcodeBudgetPx - barcodeFontPx - 3)

  useEffect(() => {
    if (!svgRef.current || !code) return
    try {
      JsBarcode(svgRef.current, code, {
        format: 'CODE128',
        displayValue: true,
        fontSize: barcodeFontPx,
        height: barsHeightPx,
        margin: 0,
        width: heightMm >= 30 ? 1.3 : 1.0,
      })
    } catch {
      // Empty/invalid code (e.g. mid-search, before a product is picked) —
      // leave the SVG blank instead of crashing the whole print page.
      svgRef.current.innerHTML = ''
    }
  }, [code, barcodeFontPx, barsHeightPx, heightMm])

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
      <svg
        ref={svgRef}
        style={{
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          // Safety net only — barsHeightPx/barcodeFontPx already fit the
          // budget, this just guarantees it can shrink (never grow)
          // further if a long code makes the intrinsic SVG width (and
          // therefore, proportionally, its height) exceed the label.
          maxHeight: `${barcodeBudgetPx}px`,
        }}
      />
      <div style={{ fontSize: `${pricePx}px`, fontWeight: 700, lineHeight: 1.1 }}>
        Rs. {price}
      </div>
    </div>
  )
}
