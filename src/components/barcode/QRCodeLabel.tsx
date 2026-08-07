import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// CSS reference pixel density: 96px per inch, 25.4mm per inch.
const MM_TO_PX = 96 / 25.4

export interface QRCodeLabelProps {
  name: string
  price: number | string
  code: string
  widthMm: number
  heightMm: number
  /** className hook only — no Tailwind classes are relied on internally,
   *  every visual rule here is an inline style, mirroring BarcodeLabel so
   *  this same markup survives the print-popup innerHTML clone and the
   *  html2canvas rasterization used for PDF export. */
  className?: string
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
export default function QRCodeLabel({ name, price, code, widthMm, heightMm, className }: QRCodeLabelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    if (!canvasRef.current || !code) return
    const canvas = canvasRef.current
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
    QRCode.toCanvas(canvas, code, {
      width: renderPx,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(() => {
      canvas.style.width = `${qrBudgetPx}px`
      canvas.style.height = `${qrBudgetPx}px`
    }).catch(() => {
      // Empty/invalid code (e.g. mid-search, before a product is picked) —
      // leave the canvas blank instead of crashing the whole print page.
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    })
  }, [code, qrBudgetPx])

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
          display: 'block',
          width: `${qrBudgetPx}px`,
          height: `${qrBudgetPx}px`,
          maxWidth: '100%',
          maxHeight: `${qrBudgetPx}px`,
        }}
      />
      <div style={{ fontSize: `${pricePx}px`, fontWeight: 700, lineHeight: 1.1 }}>
        Rs. {price}
      </div>
    </div>
  )
}
