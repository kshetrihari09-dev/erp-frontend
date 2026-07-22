/**
 * barcodeFrame.ts
 *
 * Shared by useBarcodeEngine (both scanners) — single source of truth for:
 *
 *   - BARCODE_SCAN_SIZE: the CSS-pixel diameter of the on-screen circular
 *     scan guide (BarcodeCircleOverlay in ScannerUI.tsx uses the same
 *     constant), so the decode region always matches what's visually lit
 *     up for the user — never a different/larger region than the circle
 *     suggests.
 *
 *   - captureBarcodeFrame(): crops exactly that circle's bounding square
 *     out of the live <video>, in native pixel coordinates, accounting for
 *     both:
 *       1. object-fit: cover (video scaled up to fill the container, then
 *          centered and cropped on the overflowing axis), and
 *       2. digital zoom (the video is CSS `scale(zoom)`'d around its
 *          center, so at zoom > 1 the same on-screen circle corresponds to
 *          a smaller, still-centered native region).
 *
 * Restricting decoding to this single small region (instead of the full
 * camera frame) is both faster — a much smaller canvas for ZXing to scan —
 * and more accurate, since stray barcodes/text outside the guide can never
 * produce a false read.
 */

// Diameter of the circular scan guide, in CSS pixels. Deliberately a square
// bounding box works for both orientations of linear barcodes (EAN/UPC/
// Code-128/Code-39, which only need width) and square 2D codes (QR), so a
// single crop shape serves every supported format.
export const BARCODE_SCAN_SIZE = 260

export function captureBarcodeFrame(
  video: HTMLVideoElement,
  containerW: number,
  containerH: number,
  zoom: number,
  boxSize: number = BARCODE_SCAN_SIZE,
): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || !containerW || !containerH) return null

  // object-fit: cover mapping — same technique as ocrImage.ts's
  // captureScanBoxFrame, kept as a separate helper since the crop shape
  // (circle-bounding square vs. a wide/short OCR line box) and the zoom
  // handling below are specific to barcode decoding.
  const scale = Math.max(containerW / vw, containerH / vh)
  const dispW = vw * scale
  const dispH = vh * scale
  const offX  = (containerW - dispW) / 2
  const offY  = (containerH - dispH) / 2

  const boxX = (containerW - boxSize) / 2
  const boxY = (containerH - boxSize) / 2

  let sx = (boxX - offX) / scale
  let sy = (boxY - offY) / scale
  let sw = boxSize / scale
  let sh = boxSize / scale

  // Digital zoom: the <video> is CSS-scaled (`transform: scale(zoom)`)
  // around its center, so the same on-screen circle now maps to a
  // proportionally smaller native region, still centered on the same
  // point. Shrinking sw/sh (rather than re-deriving from scratch) keeps
  // this in lockstep with whatever the user visually sees zoomed in on.
  if (zoom > 1) {
    const cx = sx + sw / 2
    const cy = sy + sh / 2
    sw /= zoom
    sh /= zoom
    sx = cx - sw / 2
    sy = cy - sh / 2
  }

  const clampedSx = Math.max(0, Math.min(sx, vw - 1))
  const clampedSy = Math.max(0, Math.min(sy, vh - 1))
  const clampedSw = Math.max(1, Math.min(sw, vw - clampedSx))
  const clampedSh = Math.max(1, Math.min(sh, vh - clampedSy))

  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(clampedSw)
  canvas.height = Math.round(clampedSh)
  canvas.getContext('2d')!.drawImage(
    video, clampedSx, clampedSy, clampedSw, clampedSh, 0, 0, canvas.width, canvas.height,
  )
  return canvas
}
