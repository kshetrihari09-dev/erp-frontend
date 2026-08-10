/**
 * barcodeFormat.ts
 *
 * Single source of truth for turning a *stored* `product.barcode` value
 * into a JsBarcode symbology, without ever changing the value itself.
 *
 * Format is detected, never chosen — the same `code` string that goes
 * into this detector is the exact string handed to JsBarcode and printed
 * as the human-readable digits underneath it. Nothing here regenerates,
 * pads, truncates, or recalculates a barcode; it only decides how the
 * existing digits should be drawn.
 *
 * Detection rule (matches GS1 EAN-13 + the backend's own encoder in
 * erp-unified-backend/src/utils/helpers.js#ean13CheckDigit):
 *   - exactly 13 digits AND a correct EAN-13 check digit  → 'EAN13'
 *   - everything else (letters, other lengths, 13 digits   → 'CODE128'
 *     with a WRONG check digit, etc.)
 * CODE128 is the correct fallback because it can encode the value
 * exactly as-is — arbitrary digits or characters — with no reformatting.
 */

export type BarcodeFormat = 'EAN13' | 'CODE128'

/** GS1/EAN-13 check-digit algorithm — odd positions ×1, even positions
 *  ×3 (0-indexed from the left across the first 12 digits), mirroring
 *  ean13CheckDigit() in erp-unified-backend/src/utils/helpers.js so the
 *  frontend validates by the exact same rule the backend generates by. */
function ean13CheckDigit(digits12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const d = Number(digits12[i])
    sum += i % 2 === 0 ? d : d * 3
  }
  const mod = sum % 10
  return mod === 0 ? 0 : 10 - mod
}

/** True only for a 13-digit string whose 13th digit is the correct
 *  check digit for the first 12. Never mutates or recomputes `code` —
 *  purely a yes/no check against the value as stored. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}

/** Detects the symbology to render `code` with. Does not validate
 *  CODE128-eligibility beyond "non-empty" — JsBarcode itself throws on
 *  characters it can't encode, which callers should catch and surface
 *  rather than silently substituting a different value. */
export function detectBarcodeFormat(code: string): BarcodeFormat {
  return isValidEan13(code) ? 'EAN13' : 'CODE128'
}
