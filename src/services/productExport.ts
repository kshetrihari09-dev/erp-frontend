/**
 * productExport.ts — data layer for the Product List "Export" feature.
 *
 * Deliberately uses only the existing /products and /stock/batches
 * endpoints (no backend changes). /products is capped at 200 rows/page
 * server-side (see middleware/helpers.js parsePagination), so exporting
 * "All products" pages through the full result set client-side rather
 * than requesting one giant page.
 */
import * as XLSX from 'xlsx'
import { productsAPI, stockAPI } from './api'
import { fmtDate } from '@/utils'
import type { Product, StockBatch } from '@/types'

const PAGE_LIMIT = 200

export interface ProductExportRow {
  [key: string]:   string | number
  'Product Name':  string
  'Generic Name':  string
  'Brand':         string
  'Category':      string
  'Manufacturer':  string
  'Product Code':  string
  'Barcode':       string
  'Unit':          string
  'Purchase Rate': number
  'Sales Rate':    number
  'Tax/VAT':       string
  'Current Stock': number
  'Minimum Stock': number
  'Batch':         string
  'Expiry':        string
  'Status':        string
}

/**
 * Fetch every product matching `search` (or all products if `search` is
 * omitted), paging through the existing /products endpoint. Calls
 * `onProgress(fetchedSoFar, total)` after every page so callers can show
 * live progress for large exports.
 */
export async function fetchAllProducts(
  search: string | undefined,
  onProgress?: (fetched: number, total: number) => void,
): Promise<Product[]> {
  const all: Product[] = []
  let page = 1
  let total = Infinity

  while (all.length < total) {
    const res  = await productsAPI.list({ page, limit: PAGE_LIMIT, search: search || undefined })
    const body = res.data as any
    const rows = (body?.data as Product[]) || []
    total = Number(body?.pagination?.total ?? rows.length)

    all.push(...rows)
    onProgress?.(all.length, total)

    if (rows.length === 0) break // safety valve — avoids an infinite loop if total is ever wrong
    page += 1
  }

  return all
}

/**
 * The nearest-expiry batch for every product, keyed by product_id.
 * /stock/batches already returns every batch company-wide ordered by
 * expiry_date ascending, so the first occurrence per product is the one
 * expiring soonest.
 */
export async function fetchNearestBatchByProduct(): Promise<Map<string, StockBatch>> {
  const res     = await stockAPI.batches()
  const body    = res.data as any
  const batches = (body?.data as StockBatch[]) || []

  const map = new Map<string, StockBatch>()
  for (const b of batches) {
    if (!map.has(b.product_id)) map.set(b.product_id, b)
  }
  return map
}

function formatVat(p: Product): string {
  const v = p.tax_rate ?? p.vat_percent
  return v == null ? '—' : `${Number(v)}%`
}

function formatExpiry(b: StockBatch | undefined): string {
  if (!b) return '—'
  if (b.expiry_date) return fmtDate(b.expiry_date)
  return b.expiry || '—'
}

/** Product + batch data → clean, display-ready export rows. */
export function buildExportRows(products: Product[], batchByProduct: Map<string, StockBatch>): ProductExportRow[] {
  return products.map(p => {
    const batch = batchByProduct.get(p.id)
    return {
      'Product Name':  p.name || '',
      'Generic Name':  p.generic_name || '—',
      // The data model only has one manufacturer/brand field (company_name)
      // — both columns are populated from it rather than inventing data.
      'Brand':         p.company_name || '—',
      'Category':      p.category || '—',
      'Manufacturer':  p.company_name || '—',
      'Product Code':  p.item_code || '',
      'Barcode':       p.barcode || '—',
      'Unit':          p.unit || '',
      'Purchase Rate': Number(p.purchase_rate) || 0,
      'Sales Rate':    Number(p.sales_rate) || 0,
      'Tax/VAT':       formatVat(p),
      'Current Stock': Number(p.current_stock) || 0,
      'Minimum Stock': Number(p.min_stock) || 0,
      'Batch':         batch?.batch_no || '—',
      'Expiry':        formatExpiry(batch),
      'Status':        p.is_active ? 'Active' : 'Inactive',
    }
  })
}

const COLUMN_WIDTHS = [
  { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 13 }, { wch: 11 },
  { wch: 9 },  { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
]

/** Writes rows to a .xlsx file and triggers a browser download. */
export function exportRowsAsXLSX(rows: ProductExportRow[], filenameNoExt: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = COLUMN_WIDTHS
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')
  XLSX.writeFile(wb, `${filenameNoExt}.xlsx`)
}
