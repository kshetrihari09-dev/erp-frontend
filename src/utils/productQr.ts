/**
 * productQr.ts
 *
 * QR content contract for products — see QRCodePrintPage.tsx (generation)
 * and the backend's GET /scanner/products/barcode/:code (scanning).
 *
 * ── Current contract ─────────────────────────────────────────────────────
 * A product's QR code encodes EXACTLY `product.barcode`, verbatim — no
 * JSON, no accountId, no productId, no prefix/suffix, nothing else. A QR
 * scan and a linear-barcode scan of the same product must decode to the
 * identical string and resolve through the identical exact-match lookup;
 * see QRCodeLabel.tsx / BarcodeLabel.tsx and useLocalScanner.ts.
 *
 * ── Legacy structured payload (read-only, decode-side only) ─────────────
 * QR labels printed before this contract encoded a JSON payload instead
 * — `{ v, accountId, productId, medicineCode }` — specifically to guard
 * against two different multi-tenant accounts coincidentally sharing the
 * same medicine code (Account A's "MD-1" resolving to Account B's
 * unrelated product when scanned under Account B). That collision risk
 * doesn't apply to a real barcode value the same way a short internal
 * code does, and the current contract requires plain-text QR content, so
 * NEW QRs no longer build this payload.
 *
 * `parseProductQrPayload` is kept only so old, already-printed labels in
 * the field keep decoding correctly (see scannerRoutes.js's legacy
 * branch) until they're reprinted — it is never used by QR generation
 * anymore.
 */

export const PRODUCT_QR_VERSION = 1

export interface ProductQrPayload {
  v: number
  accountId: string | number
  productId: string
  medicineCode?: string
}

/**
 * Best-effort decode of a LEGACY structured QR payload, for any UI that
 * wants to recognize/preview an old-format code (e.g. a debug view).
 * Returns null for the current plain-barcode-string format — that isn't
 * malformed, it's simply not this legacy shape.
 */
export function parseProductQrPayload(raw: string): ProductQrPayload | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && parsed.accountId != null && parsed.productId) {
      return parsed as ProductQrPayload
    }
    return null
  } catch {
    return null
  }
}
