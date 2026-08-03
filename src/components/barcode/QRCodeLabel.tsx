import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// Print-quality target for the QR raster: 300 DPI (dots per inch),
// converted to dots-per-mm. The QR is rendered into the canvas at this
// resolution regardless of on-screen zoom, so it stays crisp both in the
// live preview and in the exported/printed output.
const PX_PER_MM_AT_300DPI = 300 / 25.4

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
 * A single scannable QR label:
 *
 *   ┌────────────────┐
 *   │                │
 *   │     QR CODE    │
 *   │                │
 *   │ Paracetamol... │
 *   │    Rs. 7.75    │
 *   └────────────────┘
 *
 * LAYOUT MODEL — everything below is sized as a *proportion* of the
 * label's own physical mm dimensions (never fixed px), so a 50×25mm,
 * 60×30mm, 70×35mm, or Custom label all scale the same way instead of
 * needing separate cases. Concretely:
 *
 *  - Padding, gaps, and font sizes are all expressed in mm and derived
 *    from `Math.min(widthMm, heightMm)` so nothing overflows a narrow
 *    label or looks tiny on a large one.
 *  - The QR block is always a perfect square: its wrapper's CSS width
 *    and height are set to the *same* mm value, and the canvas itself is
 *    rendered with equal pixel width/height, so it can never stretch.
 *  - The product name is a genuine 2-line clamp (`-webkit-line-clamp`)
 *    with word-wrapping and an ellipsis on overflow, instead of the old
 *    single-line `nowrap` truncation that could visually collide with
 *    the price row below it.
 *  - Whatever vertical space the name+price rows need is *reserved
 *    first*; the QR only ever gets what's left over (bounded by both the
 *    label's remaining height and its full width), which is what
 *    guarantees the layout can never overflow the label box.
 *  - The QR canvas is rasterized at 300 DPI-equivalent resolution
 *    (`PX_PER_MM_AT_300DPI`) based on its *physical mm size*, so it looks
 *    identical — and stays sharp — in the on-screen preview, the print
 *    popup, and the exported PDF.
 */
export default function QRCodeLabel({ name, price, code, widthMm, heightMm, className }: QRCodeLabelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const minSideMm = Math.min(widthMm, heightMm)

  // Padding on all four sides — proportional, clamped so tiny labels
  // still get breathing room and large labels don't get an absurd border.
  const padMm = Math.min(3, Math.max(1, minSideMm * 0.08))

  // Gap between the three stacked blocks (QR → name → price).
  const gapMm = Math.min(1.5, Math.max(0.4, minSideMm * 0.05))

  // Content box left after padding.
  const contentWMm = Math.max(1, widthMm - padMm * 2)
  const contentHMm = Math.max(1, heightMm - padMm * 2)

  // Ideal (unclamped-by-space) font sizes, proportional to label height.
  let nameFontMm  = Math.min(3.4, Math.max(1.8, heightMm * 0.14))
  let priceFontMm = Math.min(3.8, Math.max(2.0, heightMm * 0.16))

  const lineHeight = 1.15
  let nameBlockHMm  = nameFontMm * lineHeight * 2   // reserved for up to 2 lines
  let priceBlockHMm = priceFontMm * lineHeight       // single line

  // Space left for the QR after the text rows and the two gaps between
  // the three blocks are reserved.
  let qrSizeMm = contentHMm - nameBlockHMm - priceBlockHMm - gapMm * 2
  // The QR is a square, so it's also capped by the available width.
  qrSizeMm = Math.min(qrSizeMm, contentWMm)

  // On very small/squat custom labels the ideal text sizes may leave too
  // little (or negative) room for the QR. Shrink the text proportionally
  // — down to 55% of its ideal size — to free up space, rather than
  // letting the QR vanish or the blocks overlap.
  const MIN_QR_MM = Math.min(6, contentWMm, contentHMm)
  if (qrSizeMm < MIN_QR_MM) {
    const textHNeeded = contentHMm - MIN_QR_MM - gapMm * 2
    const idealTextH = nameBlockHMm + priceBlockHMm
    const scale = Math.max(0.55, Math.min(1, textHNeeded / Math.max(idealTextH, 0.001)))
    nameFontMm *= scale
    priceFontMm *= scale
    nameBlockHMm = nameFontMm * lineHeight * 2
    priceBlockHMm = priceFontMm * lineHeight
    qrSizeMm = Math.max(MIN_QR_MM, Math.min(contentWMm, contentHMm - nameBlockHMm - priceBlockHMm - gapMm * 2))
  }

  // Raster resolution for the QR canvas — 300-DPI-equivalent based on its
  // real physical size, so it prints crisp instead of a scaled-up blur.
  const qrRenderPx = Math.max(64, Math.round(qrSizeMm * PX_PER_MM_AT_300DPI))

  useEffect(() => {
    if (!canvasRef.current || !code) return
    QRCode.toCanvas(canvasRef.current, code, {
      width: qrRenderPx,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {
      // Empty/invalid code (e.g. mid-search, before a product is picked) —
      // leave the canvas blank instead of crashing the whole print page.
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    })
  }, [code, qrRenderPx])

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
        padding: `${padMm}mm`,
        overflow: 'hidden',
        fontFamily: 'Arial, Helvetica, sans-serif',
        background: '#fff',
        color: '#000',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      {/* QR block — fixed square, centered horizontally by the parent's
          alignItems:center. Width and height are always the same mm
          value, and the canvas fills it 1:1, so the QR can never stretch
          or get cropped. */}
      <div
        style={{
          width: `${qrSizeMm}mm`,
          height: `${qrSizeMm}mm`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {/* Product name — centered, wraps automatically, clamps to a
          maximum of 2 lines and ellipsizes anything beyond that. */}
      <div
        style={{
          marginTop: `${gapMm}mm`,
          width: '100%',
          maxHeight: `${nameBlockHMm}mm`,
          fontSize: `${nameFontMm}mm`,
          fontWeight: 700,
          lineHeight,
          textAlign: 'center',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word',
        }}
      >
        {name}
      </div>

      {/* Price — always below the name, bold, centered, single line so
          it can never overlap the name above it. */}
      <div
        style={{
          marginTop: `${gapMm}mm`,
          width: '100%',
          maxHeight: `${priceBlockHMm}mm`,
          fontSize: `${priceFontMm}mm`,
          fontWeight: 800,
          lineHeight,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        Rs. {price}
      </div>
    </div>
  )
}
