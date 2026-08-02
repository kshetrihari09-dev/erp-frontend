/**
 * productCreation.ts
 *
 * The single source of truth for product-creation validation and the
 * create → (optional) opening-stock-adjust orchestration.
 *
 * Used by BOTH:
 *   - components/forms/QuickAddModal.tsx   (Sale/Purchase "+ New Product")
 *   - modules/inventory/ProductsPage.tsx   ("New Product" on the Products page)
 *
 * so the two flows can never drift apart: same required fields, same
 * defaults, same POST /products + POST /products/:id/adjust orchestration,
 * same opening-stock rules. Neither caller talks to productsAPI directly
 * for creation — everything routes through here.
 */

import { z } from 'zod'
import { productsAPI } from './api'
import type { Product } from '@/types'

// ── Shared field values ─────────────────────────────────────────────────────
// Quick Add's UI/options are intentionally left exactly as they are; Product
// Add is updated to match them (see constants/index.ts PRODUCT_UNITS), so
// both forms only ever save one of these exact strings.
export const PRODUCT_UNIT_OPTIONS = [
  'Strip', 'Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule',
  'Sachet', 'Tube', 'Pcs', 'Box', 'Kg', 'Ltr',
] as const

export const PRODUCT_VAT_OPTIONS = [0, 13] as const

// ── Shared validation schema ────────────────────────────────────────────────
// Mirrors exactly what POST /products / PUT /products/:id require:
//   - name: required
//   - sales_rate: required, must be a real number, >= 0
// Everything else is optional with the same defaults the backend itself
// falls back to, so a blank field behaves identically whichever form it
// was left blank in.
//
// Accepts values as either string (raw <input> state, e.g. Quick Add) or
// number (react-hook-form + valueAsNumber / already-parsed values, e.g.
// Product Add) — both flows validate against this one schema.
const numericField = (defaultValue: number, opts?: { min?: number; max?: number }) =>
  z.union([z.string(), z.number()])
    .optional()
    .transform(v => (v === '' || v === undefined || v === null ? defaultValue : Number(v)))
    .refine(v => !isNaN(v), 'Must be a valid number')
    .refine(v => opts?.min === undefined || v >= opts.min, `Must be ${opts?.min} or greater`)
    .refine(v => opts?.max === undefined || v <= opts.max, `Must be ${opts?.max} or less`)

export const productSchema = z.object({
  name: z.union([z.string(), z.undefined()])
    .transform(v => (v || '').trim())
    .refine(v => v.length > 0, 'Product name is required'),

  generic_name:  z.string().optional().default(''),
  company_name:  z.string().optional().default(''),
  category:      z.string().optional().default(''),
  barcode:       z.string().optional().default(''),
  unit:          z.string().optional().transform(v => v || 'Strip'),

  mrp:            numericField(0,  { min: 0 }),
  purchase_rate:  numericField(0,  { min: 0 }),
  vat_percent:    numericField(13, { min: 0, max: 100 }),
  min_stock:      numericField(50, { min: 0 }),
  // C.C% — bonus-quantity charge, see calcRowAmount in utils/index.ts and
  // the matching field on Sale rows. This is the product's *default*;
  // Sale rows read it via product.cc_pct when a line is added, but can
  // always be overridden per line without touching this stored default.
  cc_percent:     numericField(0,  { min: 0, max: 100 }),

  // Required — but unlike the fields above, an empty value is NOT allowed
  // to silently default to 0. Matches Quick Add's existing check exactly
  // (a blank Sales Rate field has always been rejected there).
  sales_rate: z.union([z.string(), z.number()])
    .refine(v => v !== '' && v !== undefined && v !== null && !isNaN(Number(v)), 'Sales rate is required')
    .transform(v => Number(v))
    .refine(v => v >= 0, 'Sales rate must be 0 or greater'),

  // Opening inventory — optional. 0/empty means "no opening stock": no
  // batch and no stock transaction get created (see createProductWithOpeningStock).
  opening_stock:  numericField(0, { min: 0 }),
  opening_batch:  z.string().optional().default(''),
  opening_expiry: z.string().optional().default(''),
})

export type ProductFormInput = z.input<typeof productSchema>
export type ProductFormValues = z.output<typeof productSchema>

/**
 * Validate a raw product form payload. Returns the first human-readable
 * error message, or null if the payload is valid. Used by Quick Add's
 * manual (non-react-hook-form) save handler; Product Add uses the same
 * `productSchema` directly via react-hook-form's zodResolver, so both
 * ultimately run the exact same rules.
 */
export function validateProductInput(input: ProductFormInput): string | null {
  const result = productSchema.safeParse(input)
  if (result.success) return null
  return result.error.issues[0]?.message || 'Please check the form for errors'
}

/**
 * The one product-creation service used by both Quick Add and Product Add.
 *
 *  1. Creates the product via POST /products (name, generic_name,
 *     company_name, category, unit, barcode, mrp, sales_rate,
 *     purchase_rate, vat_percent, min_stock).
 *  2. Opening stock:
 *       - 0 or empty → skipped entirely. No batch row, no stock
 *         transaction, current_stock stays 0. (Requirement: do not create
 *         a batch/transaction for a zero/empty opening stock.)
 *       - > 0 → POST /products/:id/adjust creates the opening batch
 *         (batch number + expiry saved on it) and records the opening
 *         inventory transaction; current_stock is derived from batches on
 *         every read, so stock reflects the new batch immediately with no
 *         extra step needed.
 *     This is a non-fatal step: if the product is created but the
 *     opening-stock adjustment fails, the product is still returned
 *     successfully (stock can be adjusted later from the Stock page) —
 *     this mirrors Quick Add's existing, already-shipped behavior exactly.
 *
 * Both callers get back the same shape of Product either way, so the
 * two flows always produce identical database records for the same input.
 */
export async function createProductWithOpeningStock(raw: ProductFormInput): Promise<Product> {
  const parsed = productSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Please check the form for errors')
  }
  const input = parsed.data

  const res = await productsAPI.create({
    name:          input.name,
    generic_name:  input.generic_name.trim()  || undefined,
    company_name:  input.company_name.trim()  || undefined,
    category:      input.category.trim()      || undefined,
    barcode:       input.barcode.trim()        || undefined,
    unit:          input.unit,
    sales_rate:    input.sales_rate,
    purchase_rate: input.purchase_rate,
    mrp:           input.mrp,
    vat_percent:   input.vat_percent,
    cc_percent:    input.cc_percent,
    min_stock:     input.min_stock,
  } as any)

  const newProduct: Product = res.data.data

  if (input.opening_stock > 0) {
    try {
      await productsAPI.adjust(newProduct.id, {
        qty:           input.opening_stock,
        reason:        'Opening stock',
        batch_no:      input.opening_batch  || undefined,
        expiry:        input.opening_expiry || undefined,
        purchase_rate: input.purchase_rate,
      } as any)
    } catch {
      // Non-fatal — product still created, stock can be adjusted later.
      // (Matches Quick Add's existing behavior exactly.)
    }
  }

  // Merge vat_percent/sales_rate into the returned product object since
  // some backend read paths (GET /products, GET /products/:id) return VAT
  // under the raw `tax_rate` column name rather than the aliased
  // `vat_percent` that only GET /products/search provides.
  return {
    ...newProduct,
    vat_percent: input.vat_percent,
    sales_rate:  input.sales_rate,
    cc_percent:  input.cc_percent,
  }
}
