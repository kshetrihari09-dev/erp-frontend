/**
 * scanner.ts — Type definitions for offline/LAN Medicine Scanner.
 * Additive only — no existing types modified.
 */

export type ScannerStatus =
  | 'idle'        // modal not open
  | 'creating'    // POST /scanner/session in flight
  | 'waiting'     // QR shown, mobile hasn't opened page yet
  | 'connected'   // mobile opened the page (ping received)
  | 'done'        // result received from mobile
  | 'expired'     // session timed out
  | 'error'

export interface ScannerSession {
  token:      string
  expiresAt:  number
  status:     ScannerStatus
}

export interface ScannedProduct {
  id:            string
  item_code:     string
  name:          string
  generic_name?: string
  company_name?: string
  unit:          string
  sales_rate:    number
  purchase_rate: number
  mrp:           number
  vat_percent?:  number
  cc_pct?:       number
  current_stock: number
  batches:       Array<{ batch_no: string; expiry_date: string; qty: number }>
}

export interface ScanResult {
  product:    ScannedProduct
  scanMethod: 'barcode' | 'ocr' | 'manual'
  barcode?:   string | null
  ocrText?:   string | null
  scannedAt:  number
}
