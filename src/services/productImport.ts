/**
 * productImport.ts — data layer for the Product List "Import" feature.
 *
 * Mirrors productExport.ts's column set so an exported file can be edited
 * and re-imported. Deliberately only ever touches product MASTER fields
 * through the existing single-row POST /products and PUT /products/:id
 * endpoints (there is no bulk-import endpoint, and this app has no
 * dedicated bulk-write API — adding one would be a backend change).
 *
 * Current Stock / Batch / Expiry are intentionally NOT imported: changing
 * stock levels outside a real Purchase/Adjustment flow would desynchronize
 * inventory from accounting. Those columns are recognized (so a round-
 * tripped export doesn't get flagged as "unknown column") but ignored.
 */
import * as XLSX from 'xlsx'
import { productsAPI } from './api'
import type { Product } from '@/types'

export interface ImportRow {
  rowNumber:      number   // 1-based, matches the spreadsheet row (header = row 1)
  name:           string
  generic_name:   string
  company_name:   string   // Brand / Manufacturer — same underlying field, see productExport.ts
  category:       string
  item_code:      string   // used only to MATCH an existing product; never sent on create
  barcode:        string
  unit:           string
  purchase_rate:  number
  sales_rate:     number | null
  tax_rate:       number | null
  min_stock:      number
  is_active:      boolean
  errors:         string[]
}

export type ImportAction = 'create' | 'update' | 'error'

export interface ImportPlanRow extends ImportRow {
  action:            ImportAction
  matchedProductId?: string
}

export interface ImportPlan {
  rows:            ImportPlanRow[]
  toCreate:        number
  toUpdate:        number
  toSkip:          number   // rows with validation errors
  unknownHeaders:  string[]
}

export interface ImportResult {
  created: number
  updated: number
  failed:  { rowNumber: number; name: string; message: string }[]
}

// Recognized headers → canonical field. Includes the export's exact column
// names (case-insensitive) plus a few common aliases.
const HEADER_MAP: Record<string, string> = {
  'product name':   'name',
  'name':           'name',
  'generic name':   'generic_name',
  'brand':          'company_name',
  'manufacturer':   'company_name',
  'category':       'category',
  'product code':   'item_code',
  'code':           'item_code',
  'barcode':        'barcode',
  'unit':           'unit',
  'purchase rate':  'purchase_rate',
  'sales rate':     'sales_rate',
  'sale rate':      'sales_rate',
  'tax/vat':        'tax_rate',
  'tax':            'tax_rate',
  'vat':            'tax_rate',
  'minimum stock':  'min_stock',
  'min stock':      'min_stock',
  'status':         'is_active',
}

// Recognized but deliberately not imported (see file header comment).
const IGNORED_HEADERS = new Set(['current stock', 'batch', 'expiry'])

function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/[,%\s]/g, ''))
  return isNaN(n) ? null : n
}

function toStatusBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return s !== 'inactive' && s !== 'no' && s !== 'false' && s !== '0'
}

/** Reads a .xlsx/.xls/.csv File into an array of raw {header: value} rows. */
async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const isCsv = /\.csv$/i.test(file.name)
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

/** Parses an uploaded file into validated import rows + any unrecognized column names. */
export async function parseImportFile(file: File): Promise<{ rows: ImportRow[]; unknownHeaders: string[] }> {
  const raw = await readRows(file)
  const unknownHeaders = new Set<string>()

  const rows: ImportRow[] = raw.map((r, i) => {
    const mapped: Record<string, unknown> = {}
    for (const key of Object.keys(r)) {
      const norm = key.trim().toLowerCase()
      const field = HEADER_MAP[norm]
      if (field) mapped[field] = r[key]
      else if (!IGNORED_HEADERS.has(norm)) unknownHeaders.add(key)
    }

    const errors: string[] = []
    const name = String(mapped.name ?? '').trim()
    if (!name) errors.push('Product Name is required')

    const sales_rate = toNumberOrNull(mapped.sales_rate)
    if (sales_rate == null) errors.push('Sales Rate is required and must be a number')
    else if (sales_rate < 0) errors.push('Sales Rate must be 0 or greater')

    const purchase_rate = toNumberOrNull(mapped.purchase_rate) ?? 0
    const tax_rate       = toNumberOrNull(mapped.tax_rate)
    if (tax_rate != null && (tax_rate < 0 || tax_rate > 100)) errors.push('Tax/VAT must be between 0 and 100')

    const min_stock = toNumberOrNull(mapped.min_stock) ?? 50

    return {
      rowNumber:     i + 2, // header is row 1
      name,
      generic_name:  String(mapped.generic_name ?? '').trim(),
      company_name:  String(mapped.company_name ?? '').trim(),
      category:      String(mapped.category ?? '').trim(),
      item_code:     String(mapped.item_code ?? '').trim(),
      barcode:       String(mapped.barcode ?? '').trim(),
      unit:          String(mapped.unit ?? '').trim() || 'Strip',
      purchase_rate,
      sales_rate,
      tax_rate,
      min_stock,
      is_active:     mapped.is_active === undefined ? true : toStatusBool(mapped.is_active),
      errors,
    }
  })

  return { rows, unknownHeaders: [...unknownHeaders] }
}

/**
 * Decides create vs. update for each row by matching against the current
 * product list: Barcode first (it's the backend's own uniqueness key),
 * then Product Code, else it's a new product.
 */
export function buildImportPlan(rows: ImportRow[], existingProducts: Product[]): ImportPlan {
  const byBarcode  = new Map(existingProducts.filter(p => p.barcode).map(p => [p.barcode!.trim().toLowerCase(), p]))
  const byItemCode = new Map(existingProducts.map(p => [p.item_code.trim().toLowerCase(), p]))

  let toCreate = 0, toUpdate = 0, toSkip = 0
  const planRows: ImportPlanRow[] = rows.map(row => {
    if (row.errors.length) { toSkip++; return { ...row, action: 'error' } }

    const match = (row.barcode && byBarcode.get(row.barcode.toLowerCase()))
      || (row.item_code && byItemCode.get(row.item_code.toLowerCase()))

    if (match) { toUpdate++; return { ...row, action: 'update', matchedProductId: match.id } }
    toCreate++
    return { ...row, action: 'create' }
  })

  return { rows: planRows, toCreate, toUpdate, toSkip, unknownHeaders: [] }
}

/**
 * Executes the plan sequentially against the existing single-row
 * create/update endpoints (no bulk endpoint exists), reporting progress
 * and collecting per-row failures instead of aborting the whole import.
 */
export async function runImport(
  planRows: ImportPlanRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const actionable = planRows.filter(r => r.action !== 'error')
  const result: ImportResult = { created: 0, updated: 0, failed: [] }

  for (let i = 0; i < actionable.length; i++) {
    const row = actionable[i]
    const payload: Partial<Product> = {
      name:          row.name,
      generic_name:  row.generic_name || undefined,
      company_name:  row.company_name || undefined,
      category:      row.category || undefined,
      barcode:       row.barcode || undefined,
      unit:          row.unit,
      purchase_rate: row.purchase_rate,
      sales_rate:    row.sales_rate as number,
      min_stock:     row.min_stock,
      is_active:     row.is_active,
      ...(row.tax_rate != null ? { tax_rate: row.tax_rate } : {}),
    }

    try {
      if (row.action === 'update' && row.matchedProductId) {
        await productsAPI.update(row.matchedProductId, payload)
        result.updated++
      } else {
        await productsAPI.create(payload)
        result.created++
      }
    } catch (e: any) {
      result.failed.push({
        rowNumber: row.rowNumber,
        name:      row.name,
        message:   e?.response?.data?.message || e?.message || 'Failed to save this row',
      })
    }

    onProgress?.(i + 1, actionable.length)
  }

  return result
}
