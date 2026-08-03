import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

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
 */
export default function BarcodeLabel({ name, price, code, widthMm, heightMm, className }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !code) return
    try {
      JsBarcode(svgRef.current, code, {
        format: 'CODE128',
        displayValue: true,
        fontSize: Math.max(7, Math.round(heightMm * 2.1)),
        height: Math.max(16, Math.round(heightMm * 3.4)),
        margin: 0,
        width: heightMm >= 30 ? 1.6 : 1.3,
      })
    } catch {
      // Empty/invalid code (e.g. mid-search, before a product is picked) —
      // leave the SVG blank instead of crashing the whole print page.
      svgRef.current.innerHTML = ''
    }
  }, [code, heightMm])

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
          fontSize: `${Math.max(2.2, heightMm * 0.16)}mm`,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          lineHeight: 1.15,
        }}
      >
        {name}
      </div>
      <svg ref={svgRef} style={{ width: '92%', height: 'auto', display: 'block' }} />
      <div style={{ fontSize: `${Math.max(2.4, heightMm * 0.19)}mm`, fontWeight: 700, lineHeight: 1.15 }}>
        Rs. {price}
      </div>
    </div>
  )
}
