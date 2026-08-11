/**
 * qrFallback.ts
 *
 * FALLBACK-ONLY preprocessing for hard-to-read QR codes (faded, gray,
 * old/worn print, low contrast, uneven lighting, slight blur). This never
 * runs on the fast path — useBarcodeEngine's decode loop always tries the
 * raw camera crop with ZXing first, exactly as before, and only reaches
 * into this module when that attempt comes back empty AND the engine is
 * in QR mode. Good-quality QR codes are decoded on the very first frame
 * exactly as fast as before this file existed.
 *
 * ZXing itself is never modified or replaced — every function below just
 * produces a new HTMLCanvasElement, which the caller hands to the same
 * ZXing reader instance already in use (reader.decodeFromCanvas). This
 * file has no opinion about barcode formats, product matching, or the QR
 * payload shape; it only improves the *image* ZXing gets to look at.
 */

// Upscaling a small/blurry crop before ZXing's own finder-pattern search
// gives the detector more pixels per module to work with, which is what
// actually helps with slight blur and small print — text/edge algorithms
// like ZXing's benefit far more from "more pixels, smoothly interpolated"
// than from any single filter alone.
const DEFAULT_UPSCALE_FACTOR = 2.5

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  canvas.getContext('2d')!.drawImage(src, 0, 0)
  return canvas
}

/**
 * Upscale a canvas ~2x-3x using the browser's own high-quality bilinear/
 * bicubic image smoothing. This is step 2-3 of the fallback pipeline:
 * crop is already done by the caller (it reuses the same small region
 * captureBarcodeFrame() cropped for the primary attempt), this just
 * enlarges it before any of the filters below run.
 */
export function upscaleCanvas(
  src: HTMLCanvasElement,
  factor: number = DEFAULT_UPSCALE_FACTOR,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(src.width * factor))
  canvas.height = Math.max(1, Math.round(src.height * factor))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  // @ts-ignore - imageSmoothingQuality isn't in every lib.dom version yet
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Plain luminance grayscale. Cheapest of the variants and often enough on
 * its own for gray-on-white prints where ZXing's own binarizer just
 * needed the color noise removed.
 */
export function toGrayscaleCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(src)
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    d[i] = d[i + 1] = d[i + 2] = gray
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Grayscale + linear contrast stretch anchored to the crop's own actual
 * min/max brightness (rather than a fixed multiplier), which is what
 * makes this effective specifically for LOW-CONTRAST codes: a faded
 * print might only span, say, 90-190 out of 0-255, and stretching that
 * observed range out to the full 0-255 spread makes faint modules far
 * more separable without clipping/blowing out the image the way a fixed
 * contrast multiplier can.
 */
export function increaseContrastCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = toGrayscaleCanvas(src)
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data

  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = Math.max(1, max - min) // avoid divide-by-zero on a flat crop

  for (let i = 0; i < d.length; i += 4) {
    const stretched = ((d[i] - min) / range) * 255
    const clamped = stretched < 0 ? 0 : stretched > 255 ? 255 : stretched
    d[i] = d[i + 1] = d[i + 2] = clamped
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Light unsharp-mask style 3x3 sharpen. Helps recover crisp module edges
 * from slight motion/focus blur, which is precisely what softens QR
 * finder-pattern corners and breaks ZXing's perspective lock the most.
 * Deliberately mild (a classic [0,-1,0,-1,5,-1,0,-1,0] kernel) — an
 * aggressive sharpen amplifies sensor noise as much as edges, which would
 * hurt exactly the faded/low-light cases this pipeline targets.
 */
export function sharpenCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(src)
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const srcData = new Uint8ClampedArray(img.data) // read from a frozen copy
  const dst = img.data
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let k = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4 + c
            sum += srcData[idx] * kernel[k++]
          }
        }
        dst[(y * w + x) * 4 + c] = sum < 0 ? 0 : sum > 255 ? 255 : sum
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Local-mean adaptive threshold (Bradley/Roth style, via an integral
 * image for speed), NOT a single fixed global cutoff. This is the key
 * defense against uneven illumination (a shadow/glare across part of the
 * code would defeat any single global threshold) and against losing
 * faded/gray modules: each pixel is compared against the *average
 * brightness of its own neighborhood*, so a gray module that's merely
 * darker than its immediate surroundings is still correctly classified
 * as "ink", even though its absolute brightness might be well above a
 * naive fixed threshold like 127.
 *
 * SENSITIVITY is intentionally mild (T = 0.85, i.e. a pixel only counts
 * as background if it's within 15% of its local neighborhood's mean) —
 * requirement is to *not* lose gray/faded modules, and a mild threshold
 * errs on the side of keeping ambiguous pixels as "ink" rather than
 * discarding them, since ZXing's own decoder already tolerates some
 * extra noise far better than it tolerates missing modules.
 *
 * invert=true produces the photometric opposite, for the (rarer, but
 * real) case where a printed/faded code's polarity confuses the primary
 * decode — cheap to also try since it reuses the exact same local-mean
 * computation.
 */
export function adaptiveThresholdCanvas(
  src: HTMLCanvasElement,
  invert: boolean = false,
): HTMLCanvasElement {
  const gray = toGrayscaleCanvas(src)
  const ctx = gray.getContext('2d')!
  const w = gray.width
  const h = gray.height
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data

  // Integral (summed-area) image of the grayscale channel, so any
  // rectangular neighborhood's sum is an O(1) lookup instead of an O(S^2)
  // rescan per pixel — keeps this fast enough to run on a fallback tick
  // even on modest devices.
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += d[(y * w + x) * 4]
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum
    }
  }

  // Neighborhood window ~1/8th of the crop width (min 15px) — large
  // enough to average over several QR modules (so it reflects local
  // *illumination*, not the QR pattern itself), small enough to still
  // react to real shadow/glare gradients across the code.
  const S = Math.max(15, Math.floor(w / 8))
  const half = Math.floor(S / 2)
  const T = 0.85 // mild sensitivity — see docblock above

  const out = new Uint8ClampedArray(d.length)
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half)
    const y2 = Math.min(h - 1, y + half)
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half)
      const x2 = Math.min(w - 1, x + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1]
      const localMean = sum / count

      const pixel = d[(y * w + x) * 4]
      let isInk = pixel <= localMean * T
      if (invert) isInk = !isInk

      const idx = (y * w + x) * 4
      const val = isInk ? 0 : 255
      out[idx] = val
      out[idx + 1] = val
      out[idx + 2] = val
      out[idx + 3] = 255
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0)
  return gray
}

/**
 * Runs the ordered fallback pipeline against a single already-cropped
 * native-resolution QR frame, stopping the instant any variant decodes.
 * Only called by useBarcodeEngine, and only after the primary (fast,
 * unprocessed) decode attempt on that same frame has already failed.
 *
 * Order matches the spec: grayscale → contrast → sharpen → adaptive
 * threshold → inverted adaptive threshold. Cheapest/most-likely-to-help
 * variants are tried first so the common case (mild fade/gray print)
 * resolves in 1-2 extra decode attempts, not all 5.
 */
export async function decodeWithFallback(
  reader: { decodeFromCanvas: (canvas: HTMLCanvasElement) => Promise<any> },
  originalCrop: HTMLCanvasElement,
): Promise<any | null> {
  const upscaled = upscaleCanvas(originalCrop)

  const variants: Array<() => HTMLCanvasElement> = [
    () => toGrayscaleCanvas(upscaled),
    () => increaseContrastCanvas(upscaled),
    () => sharpenCanvas(increaseContrastCanvas(upscaled)),
    () => adaptiveThresholdCanvas(upscaled, false),
    () => adaptiveThresholdCanvas(upscaled, true),
  ]

  for (const buildVariant of variants) {
    try {
      const candidate = buildVariant()
      const result = await reader.decodeFromCanvas(candidate)
      if (result) return result
    } catch {
      // This variant didn't decode either — expected for most variants
      // on most frames; just move on to the next one.
    }
  }
  return null
}
