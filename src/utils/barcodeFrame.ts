/**
 * barcodeFrame.ts
 *
 * Shared by useBarcodeEngine (both scanners) — single source of truth for:
 *
 *   - BARCODE_SCAN_WIDTH / BARCODE_SCAN_HEIGHT: the CSS-pixel size of the
 *     on-screen rectangular scan guide (BarcodeRectOverlay in
 *     ScannerUI.tsx uses the same constants), so the decode region always
 *     matches what's visually lit up for the user — never a different/
 *     larger region than the rectangle suggests.
 *
 *   - captureBarcodeFrame(): crops exactly that rectangle out of the live
 *     <video>, in native pixel coordinates, accounting for both:
 *       1. object-fit: cover (video scaled up to fill the container, then
 *          centered and cropped on the overflowing axis), and
 *       2. digital zoom (the video is CSS `scale(zoom)`'d around its
 *          center, so at zoom > 1 the same on-screen rectangle corresponds
 *          to a smaller, still-centered native region).
 *
 * Restricting decoding to this single small region (instead of the full
 * camera frame) is both faster — a much smaller canvas for ZXing to scan —
 * and more accurate, since stray barcodes/text outside the guide can never
 * produce a false read.
 */

// Size of the rectangular scan guide, in CSS pixels. Wide/short like a
// classic barcode-scanner viewfinder — comfortably wide enough for linear
// barcodes (EAN/UPC/Code-128/Code-39) held at a natural distance, and
// still tall enough for QR/2D codes to fit within it.
export const BARCODE_SCAN_WIDTH  = 280
export const BARCODE_SCAN_HEIGHT = 170

export function captureBarcodeFrame(
  video: HTMLVideoElement,
  containerW: number,
  containerH: number,
  zoom: number,
  boxWidth: number = BARCODE_SCAN_WIDTH,
  boxHeight: number = BARCODE_SCAN_HEIGHT,
): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || !containerW || !containerH) return null

  // object-fit: cover mapping — same technique as ocrImage.ts's
  // captureScanBoxFrame, kept as a separate helper since the crop shape
  // and the zoom handling below are specific to barcode decoding.
  const scale = Math.max(containerW / vw, containerH / vh)
  const dispW = vw * scale
  const dispH = vh * scale
  const offX  = (containerW - dispW) / 2
  const offY  = (containerH - dispH) / 2

  const boxX = (containerW - boxWidth)  / 2
  const boxY = (containerH - boxHeight) / 2

  let sx = (boxX - offX) / scale
  let sy = (boxY - offY) / scale
  let sw = boxWidth  / scale
  let sh = boxHeight / scale

  // Digital zoom: the <video> is CSS-scaled (`transform: scale(zoom)`)
  // around its center, so the same on-screen rectangle now maps to a
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
