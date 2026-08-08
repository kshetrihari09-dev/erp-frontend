/**
 * ocrImage.ts
 *
 * Shared image-processing helpers, used by both scanner hooks
 * (useProductCapture.ts's still-frame + manual-crop flow, and
 * useLocalScanner.ts's new continuous small-box flow):
 *
 *   - preprocessForOcr: grayscale + Otsu binarization + 2x upscale, so
 *     Tesseract sees clean, high-contrast pixels instead of a raw noisy
 *     camera frame.
 *   - SCAN_BOX_WIDTH / SCAN_BOX_HEIGHT + captureScanBoxFrame: a fixed,
 *     centered "viewfinder" rectangle (like a barcode scanner) that both
 *     the on-screen overlay (ScannerUI's ScanFrame) and the actual OCR
 *     capture use as their single source of truth, so the crop always
 *     matches exactly what's dimmed/undimmed on screen — never a
 *     different region than what the user is looking at.
 */

// Fixed CSS-pixel size of the scan box, centered in the camera view. This
// is deliberately compact and wide/short — a barcode-scanner-style
// viewfinder — rather than the old "photograph the whole label" capture
// area, so the user aligns a single line of text (the product name) in it
// and OCR only ever has to read that.
export const SCAN_BOX_WIDTH  = 240
export const SCAN_BOX_HEIGHT = 130

export function preprocessForOcr(source: CanvasImageSource, srcWidth: number, srcHeight: number): HTMLCanvasElement {
  const SCALE = 2
  const canvas = document.createElement('canvas')
  canvas.width  = srcWidth  * SCALE
  canvas.height = srcHeight * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data       = imageData.data
  const pixelCount = canvas.width * canvas.height

  const gray      = new Uint8ClampedArray(pixelCount)
  const histogram = new Array(256).fill(0)
  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    gray[p] = g
    histogram[g]++
  }

  // Otsu's method — finds the threshold that best separates ink from
  // background for THIS frame, rather than assuming a fixed cutoff that
  // breaks under different lighting.
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * histogram[t]
  let sumB = 0, wB = 0, varMax = -1, threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]
    if (wB === 0) continue
    const wF = pixelCount - wB
    if (wF === 0) break
    sumB += t * histogram[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const varBetween = wB * wF * (mB - mF) * (mB - mF)
    if (varBetween > varMax) { varMax = varBetween; threshold = t }
  }

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const v = gray[p] > threshold ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// Crops exactly the on-screen scan box out of a <video> element that's
// rendered with `object-fit: cover` inside a `containerW x containerH`
// box, mapping screen-space (CSS pixel) coordinates to the video's native
// pixel coordinates. Returns null if the video has no dimensions yet.
//
// object-fit: cover math — the video is scaled up (never letterboxed)
// until it fills the container on both axes, then centered and cropped on
// whichever axis overflows. That's the opposite of the "contain" math
// used by CropOverlay for static images, so this is intentionally a
// separate helper rather than a shared one.
export function captureScanBoxFrame(
  video: HTMLVideoElement,
  containerW: number,
  containerH: number,
): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || !containerW || !containerH) return null

  const scale = Math.max(containerW / vw, containerH / vh)
  const dispW = vw * scale
  const dispH = vh * scale
  const offX  = (containerW - dispW) / 2
  const offY  = (containerH - dispH) / 2

  const boxX = (containerW - SCAN_BOX_WIDTH)  / 2
  const boxY = (containerH - SCAN_BOX_HEIGHT) / 2

  const sx = (boxX - offX) / scale
  const sy = (boxY - offY) / scale
  const sw = SCAN_BOX_WIDTH  / scale
  const sh = SCAN_BOX_HEIGHT / scale

  // Clamp to the video's actual bounds — the box is a fixed CSS size, but
  // an unusual viewport or camera aspect ratio could otherwise push the
  // crop rect outside the source frame.
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
