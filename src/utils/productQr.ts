/**
 * productQr.ts
 *
 * Single source of truth for the structured payload encoded into a
 * product's QR code — see QRCodePrintPage.tsx (generation) and the
 * backend's GET /scanner/products/barcode/:code (scanning).
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * This app is multi-tenant: every account (company) has its own
 * completely independent product master. A product's `item_code` /
 * `barcode` is only ever unique *within* its own account — two different
 * accounts can (and routinely do) both have a product coded "MD-1" for
 * two completely unrelated medicines. Encoding just that code into a QR
 * meant scanning Account A's QR while logged into Account B could return
 * Account B's unrelated "MD-1" product instead of an error.
 *
 * The fix: the QR payload now carries *which account* it was generated
 * for (`accountId`) and the product's own globally-unique database id
 * (`productId`), not just the account-local code. The scanner checks
 * `accountId` against whoever is currently logged in BEFORE it ever
 * searches for a product — see scannerRoutes.js.
 *
 * `medicineCode` is kept as a fallback field only — used if `productId`
 * doesn't resolve to a live row (e.g. an old QR reprinted from a payload
 * that predates this field, or the exact product was later deleted) —
 * and even then only ever searched within the already-verified account.
 */

export const PRODUCT_QR_VERSION = 1

export interface ProductQrPayload {
  v: number
  accountId: string | number
  productId: string
  medicineCode?: string
}

/** Builds the JSON string to encode into a product's QR code. */
export function buildProductQrPayload(
  product: { id: string; barcode?: string | null; item_code?: string | null },
  accountId: string | number
): string {
  const payload: ProductQrPayload = {
    v: PRODUCT_QR_VERSION,
    accountId,
    productId: product.id,
    medicineCode: product.barcode || product.item_code || undefined,
  }
  return JSON.stringify(payload)
}

/**
 * Best-effort decode, for any UI that wants to show/preview what a QR
 * encodes without round-tripping to the server (e.g. a debug view).
 * Returns null for legacy plain-string codes — those aren't malformed,
 * they're just the old format, so this deliberately doesn't throw.
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
