import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Default minimum QR *print* size in mm. Configurable per-instance via the
// `minQrMm` prop — kept as a top-level constant so callers that don't pass
// it still get a sane, scan-friendly floor.
const DEFAULT_MIN_QR_MM = 25

// Absolute floor — below this a QR code stops being reliably scannable by
// phone cameras regardless of how small the label stock is. `minQrMm` is
// honoured whenever the label has room for it; this is the last-resort
// clamp for very small custom label sizes.
const ABSOLUTE_MIN_QR_MM = 12

// Quiet zone around the QR modules, expressed in "modules" (the unit the
// `qrcode` library's `margin` option uses) — 4 is the value the QR
// specification recommends; most generators (including this one before)
// use 0–1 and rely on external padding, which is why scanners sometimes
// struggle right at the label edge. Baking the quiet zone into the QR
// artwork itself means it survives no matter how the label gets cropped,
// exported, or re-scaled downstream.
const QR_QUIET_ZONE_MODULES = 4

// Module-level cache so printing many copies of the same product (qty > 1)
// or re-rendering during layout changes never regenerates identical QR
// artwork. SVG markup is tiny, so this is a plain unbounded Map for the
// lifetime of the page — cleared naturally on navigation/reload.
const svgCache = new Map<string, string>()

export interface QRCodeLabelProps {
  name: string
  price: number | string
  code: string
  widthMm: number
  heightMm: number
  /** Minimum QR square size in mm, honoured whenever the label has room
   *  for it. Defaults to 25mm per standard scannability guidance; pass a
   *  smaller value for label stock that's deliberately tiny. */
  minQrMm?: number
  /** className hook only — no Tailwind classes are relied on internally,
   *  every visual rule here is an inline style, mirroring BarcodeLabel so
   *  this same markup survives the print-popup innerHTML clone used by
   *  QRCodePrintPage's printSheet(). */
  className?: string
}

/**
 * A single scannable QR label — same three-row layout as BarcodeLabel
 * (name / code / price) but with a square QR in place of the linear
 * barcode.
 *
 * Renders the QR as inline **SVG** rather than `<canvas>`. That fixes the
 * whole class of print-quality bugs that come from rasterizing a QR at a
 * fixed pixel size and then stretching it for print/PDF:
 *   - SVG is resolution-independent, so it's always print-sharp — there's
 *     no DPI to pick and no upscale blur, at 25mm or 250mm.
 *   - SVG survives `element.innerHTML` cloning (used by the print-popup
 *     path), so the old "swap every canvas for a toDataURL() <img> before
 *     cloning, then restore it after" workaround is no longer needed.
 *   - `viewBox` + `preserveAspectRatio` (SVG defaults to `xMidYMid meet`)
 *     guarantee the code can never stretch into a non-square rectangle,
 *     whatever size the container ends up being.
 *
 * Sizing still follows the budgeted-rows approach: the name and price
 * rows get fixed, clamped mm budgets, and whatever remains — bounded by
 * `minQrMm` on one side and the label's own dimensions on the other — is
 * the QR's square budget.
 */
export default function QRCodeLabel({
  name,
  price,
  code,
  widthMm,
  heightMm,
  minQrMm = DEFAULT_MIN_QR_MM,
  className,
}: QRCodeLabelProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('')

  // Budgets computed in mm (the unit the whole label is laid out in) so
  // they scale consistently regardless of screen zoom or print DPI.
  const namePt  = Math.min(5.5, Math.max(2.2, heightMm * 0.16))
  const pricePt = Math.min(6,   Math.max(2.4, heightMm * 0.18))
  const padMm   = Math.max(0.8, Math.min(2, Math.min(widthMm, heightMm) * 0.06))
  const gapMm   = Math.max(0.4, Math.min(1.2, heightMm * 0.03))

  // Rough mm-equivalent of each text row (line-height ~1.15 in mm, using
  // the pt sizes above at 1pt ≈ 0.3528mm) — just enough to reserve real
  // vertical space for the two text rows before handing the rest to the QR.
  const nameRowMm  = namePt * 0.3528 * 1.25
  const priceRowMm = pricePt * 0.3528 * 1.25

  const availableHeightMm = heightMm - padMm * 2 - nameRowMm - priceRowMm - gapMm * 2
  const availableWidthMm  = widthMm - padMm * 2

  // The QR must fit BOTH remaining dimensions and never overlap the name,
  // price, or the label border — hence the min() of both axes. We hand it
  // ALL the remaining space (rather than shrinking to exactly `minQrMm`)
  // because a bigger QR is always at least as scannable as a smaller one;
  // `minQrMm` is a floor to warn about, not a ceiling to clamp to.
  const maxPossibleQrMm = Math.max(0, Math.min(availableHeightMm, availableWidthMm))
  const finalQrSizeMm = maxPossibleQrMm > 0 ? maxPossibleQrMm : ABSOLUTE_MIN_QR_MM

  if (import.meta.env?.DEV && finalQrSizeMm < minQrMm) {
    // Not fatal — the label still renders at the largest square that
    // fits — but flag it so undersized label-stock choices are visible
    // during development rather than discovered on a printed sheet.
    // eslint-disable-next-line no-console
    console.warn(
      `[QRCodeLabel] ${widthMm}×${heightMm}mm label only fits a ${finalQrSizeMm.toFixed(1)}mm QR, ` +
      `below the requested minimum of ${minQrMm}mm. Use a larger label size for reliable scanning.`
    )
  }

  useEffect(() => {
    if (!code) {
      setSvgMarkup('')
      return
    }
    const cacheKey = `${code}|${QR_QUIET_ZONE_MODULES}`
    const cached = svgCache.get(cacheKey)
    if (cached) {
      setSvgMarkup(cached)
      return
    }
    let cancelled = false
    QRCode.toString(code, {
      type: 'svg',
      margin: QR_QUIET_ZONE_MODULES, // proper quiet zone baked into the artwork
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(svg => {
        if (cancelled) return
        // The library emits fixed pixel width/height attributes sized off
        // its internal module scale. Strip those so the SVG fills its
        // container via CSS instead — the viewBox (left untouched) keeps
        // it perfectly square no matter what size that container is.
        const responsive = svg
          .replace(/width="[^"]*"/, 'width="100%"')
          .replace(/height="[^"]*"/, 'height="100%"')
        svgCache.set(cacheKey, responsive)
        setSvgMarkup(responsive)
      })
      .catch(() => {
        // Empty/invalid code (e.g. mid-search, before a product is picked)
        // — leave the slot blank instead of crashing the whole print page.
        if (!cancelled) setSvgMarkup('')
      })
    return () => { cancelled = true }
  }, [code])

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
        gap: `${gapMm}mm`,
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
      <div
        style={{
          fontSize: `${namePt}mm`,
          fontWeight: 700,
          lineHeight: 1.15,
          width: '100%',
          textAlign: 'center',
          // Wrap up to 2 lines when there's room; beyond that, truncate
          // gracefully rather than pushing the QR out of position.
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word',
          maxHeight: `${nameRowMm}mm`,
        }}
      >
        {name}
      </div>

      {/* Fixed mm × mm square, aspect-ratio locked as a belt-and-braces
         guard on top of the width/height already being equal — never a
         percentage of the parent, so it can't be stretched or squashed by
         a flex/grid ancestor recalculating layout. */}
      <div
        style={{
          width: `${finalQrSizeMm}mm`,
          height: `${finalQrSizeMm}mm`,
          aspectRatio: '1 / 1',
          flexShrink: 0,
          display: 'block',
          boxSizing: 'border-box',
        }}
        // eslint-disable-next-line react/no-danger -- trusted output of
        // the `qrcode` library, not user input.
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />

      <div
        style={{
          fontSize: `${pricePt}mm`,
          fontWeight: 700,
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        Rs. {price}
      </div>
    </div>
  )
}
