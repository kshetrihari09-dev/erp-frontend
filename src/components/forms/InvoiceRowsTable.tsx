/**
 * InvoiceRowsTable.tsx
 *
 * Invoice line-item grid.
 * Product column replaced with ProductSearchCell — a real-time search
 * combobox with keyboard navigation and quick-create support.
 *
 * All other logic (calcRowAmount, field names, InvoiceRow interface)
 * is unchanged from the previous version.
 */

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fmt, calcRowAmount } from '@/utils'
import type { Product } from '@/types'
import ProductSearchCell, { type ProductSearchCellHandle } from './ProductSearchCell'
import BatchSelect from './BatchSelect'
import QtyGate from './QtyGate'

/* ── Public types ─────────────────────────────────────────────────────────── */

export interface InvoiceRow {
  _id:          number
  /** Client-only marker: true if this row was added by the barcode
   *  scanner (BarcodeScanInput) rather than manual product search.
   *  Never read by onSubmit (which maps only explicit named fields onto
   *  the API payload — see SalesPage.tsx), so this never reaches the
   *  backend. Used only to opt this one row into "auto-select if a
   *  single batch exists" (see BatchSelect's `autoSelectSingle` prop)
   *  without changing that behaviour for manually-added rows. */
  _scanned?:    boolean
  product_id:   string
  product_name: string
  batch_no:     string
  /** id of the exact inventory_batches lot picked in the Batch Selection
   *  popup (Sale mode) — lets the backend deduct from that precise batch
   *  instead of guessing by batch_no, which can repeat across lots.
   *  Purchase mode doesn't set this (batches are freely typed/new). */
  batch_id?:    string
  expiry:       string
  qty:          number
  bonus:        number
  rate:          number | string
  discount_pct: number
  cc_pct:       number
  amount:       number
  cc_amount:    number
}

export const newRow = (): InvoiceRow => ({
  _id: Math.random(), product_id: '', product_name: '',
  batch_no: '', batch_id: undefined, expiry: '', qty: 1, bonus: 0, rate: '',
  discount_pct: 0, cc_pct: 0, amount: 0, cc_amount: 0,
})

/** Imperative API for keyboard-shortcut integration (see
 *  hooks/useKeyboardShortcuts.ts). `idx` defaults to the row containing
 *  document.activeElement, falling back to the last row — i.e. "whichever
 *  row the user is currently working on". */
export interface InvoiceRowsTableHandle {
  focusProductSearch: (idx?: number) => void
  openCreateProduct:  (idx?: number) => void
  openBatchSelect:    (idx?: number) => void
  deleteRow:          (idx?: number) => void
  addRow:             () => void
}

interface Props {
  rows:          InvoiceRow[]
  products:      Product[]
  onChange:      (rows: InvoiceRow[]) => void
  onProductsChange?: (products: Product[]) => void  // add newly-created product to master list
  showBonus?:    boolean
  showCC?:       boolean
  showDiscount?: boolean
  showExpiry?:   boolean
  showBatch?:    boolean
  /** "sale" (default): batch is pick-only from existing stock.
   *  "purchase": batch is freely typeable (new batches are the normal
   *  case), with an optional button to browse existing batches — see
   *  BatchSelect.tsx/QtyGate.tsx for the full rationale. */
  mode?:         'sale' | 'purchase'
  /** Fired when a scanned row's (row._scanned === true) batch gets
   *  resolved — auto-selected (single batch) or picked from the popup
   *  (multiple batches). SalesPage uses this to return focus to the
   *  barcode scan input. Rows not added via a scan never trigger this —
   *  their batch selection focuses Qty exactly as it always has. */
  onBarcodeRowResolved?: (idx: number) => void
  /** InvoiceRow._id of a row to briefly highlight — SalesPage sets this
   *  for ~600ms right after a scan adds or increments a row, purely as
   *  visual confirmation. No effect on data/validation. */
  flashRowId?: number
}

/* ── Component ───────────────────────────────────────────────────────────── */

const InvoiceRowsTable = forwardRef<InvoiceRowsTableHandle, Props>(function InvoiceRowsTable({
  rows, products, onChange, onProductsChange,
  showBonus = true, showCC = true, showDiscount = false,
  showExpiry = true, showBatch = true, mode = 'sale',
  onBarcodeRowResolved, flashRowId,
}, ref) {
  const firstRowRef = useRef<boolean>(true)
  const rowElsRef = useRef<Map<number, HTMLTableRowElement>>(new Map())
  const pscRefsRef = useRef<Map<number, ProductSearchCellHandle>>(new Map())

  /* ── Row update helper (unchanged logic) ──────────────────────────────── */
  function update(idx: number, key: keyof InvoiceRow, val: unknown) {
    const next = rows.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [key]: val }
      if (key === 'product_id') {
        const p = products.find(x => x.id === val)
        if (p) {
          updated.product_name = p.name
          updated.rate         = p.sales_rate
        }
      }
      const { amount, cc_amount } = calcRowAmount({
        qty:          Number(updated.qty),
        rate:         Number(updated.rate),
        bonus:        Number(updated.bonus)        || 0,
        discount_pct: Number(updated.discount_pct) || 0,
        cc_pct:       Number(updated.cc_pct)       || 0,
      })
      return { ...updated, amount, cc_amount }
    })
    onChange(next)
  }

  /* ── Batch selected from the dropdown — fills expiry in the same pass ─── */
  function handleBatchSelect(idx: number, batch: { id?: string; batch_no?: string; expiry?: string; expiry_date?: string }) {
    const next = rows.map((r, i) => {
      if (i !== idx) return r
      return { ...r, batch_no: batch.batch_no || '', batch_id: batch.id || undefined, expiry: batch.expiry_date || batch.expiry || '' }
    })
    onChange(next)
  }

  /* ── Purchase mode only — batch number typed freely, not picked ───────── */
  function handleBatchText(idx: number, text: string) {
    update(idx, 'batch_no', text)
  }

  /* ── Product selected from combobox ──────────────────────────────────── */
  function handleProductSelect(idx: number, p: Product) {
    // Keep the master `products` list in sync with whatever the live
    // search/barcode lookup just resolved — same merge handleProductCreated
    // below already does for quick-created products. Without it, a product
    // outside the initial capped snapshot (e.g. anything alphabetically
    // past it — most visibly names starting U–Z on a catalog over ~500
    // items, since GET /products orders by name ascending) selects
    // correctly but company-scope/product-scope discount grouping
    // (discountUtils.ts's rowCompanyName, which looks products up in this
    // same array) silently falls back to "Unassigned" for it.
    onProductsChange?.(products.some(x => x.id === p.id) ? products : [...products, p])

    const next = rows.map((r, i) => {
      if (i !== idx) return r
      const updated = {
        ...r,
        product_id:   p.id,
        product_name: p.name,
        rate:         p.sales_rate,
        // A previously-picked batch belongs to the OLD product — carrying
        // it over would silently submit the wrong batch. The new
        // BatchSelect fetches this product's own batches fresh and the
        // user picks again, same as a brand new row.
        batch_no:     '',
        batch_id:     undefined,
        expiry:       '',
      }
      const { amount, cc_amount } = calcRowAmount({
        qty:          Number(updated.qty),
        rate:         Number(updated.rate),
        bonus:        Number(updated.bonus)        || 0,
        discount_pct: Number(updated.discount_pct) || 0,
        cc_pct:       Number(updated.cc_pct)       || 0,
      })
      return { ...updated, amount, cc_amount }
    })
    onChange(next)
    // Move on automatically — same destination logic as Tab (see
    // focusNextAfterProduct below), just triggered right away instead of
    // waiting for an explicit Tab press. Deferred one frame because this
    // row's BatchSelect hasn't re-rendered for the new product_id yet at
    // the point onChange() returns (state updates apply on the next
    // render, not synchronously) — so checking immediately would still
    // see the previous product's trigger state.
    requestAnimationFrame(() => focusNextAfterProduct(idx))
  }

  /* ── Quick-created product: add to master list (deduped) ─────────────── */
  function handleProductCreated(p: Product) {
    onProductsChange?.(products.some(x => x.id === p.id) ? products : [...products, p])
  }

  /* ── Rows management ─────────────────────────────────────────────────── */
  function addRow() { onChange([...rows, newRow()]) }

  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx)
    onChange(next.length ? next : [newRow()])
  }

  /** "Current row" = the row containing document.activeElement, falling
   *  back to the last row — matches where a keyboard-driven user's
   *  attention actually is. */
  function resolveIdx(idx?: number): number {
    if (idx !== undefined) return idx
    const active = document.activeElement
    if (active instanceof Node) {
      for (const [i, el] of rowElsRef.current) {
        if (el.contains(active)) return i
      }
    }
    return rows.length - 1
  }

  useImperativeHandle(ref, () => ({
    focusProductSearch: (idx) => pscRefsRef.current.get(resolveIdx(idx))?.focus(),
    openCreateProduct:  (idx) => pscRefsRef.current.get(resolveIdx(idx))?.openCreate(),
    openBatchSelect:    (idx) => {
      const rowEl = rowElsRef.current.get(resolveIdx(idx))
      // Sale mode's real trigger is .bsp-trigger; Purchase mode's "browse
      // existing batches" button next to the free-text batch input is
      // .pos-party-add-btn (see BatchSelect.tsx) — try both.
      const btn = rowEl?.querySelector<HTMLButtonElement>('.bsp-trigger:not([disabled]), .pos-party-add-btn:not([disabled])')
      btn?.click()
    },
    deleteRow: (idx) => removeRow(resolveIdx(idx)),
    addRow,
  }), [rows])

  /* ── Enter key on last row → add row ─────────────────────────────────── */
  function handleRowKeyDown(e: React.KeyboardEvent, idx: number) {
    // Only fire when not inside the ProductSearchCell (it handles its own Enter)
    const target = e.target as HTMLElement
    const inProductField = target.classList.contains('psc-input') || target.classList.contains('psc-trigger')

    // Product → Batch: BatchSelect's trigger button is disabled while its
    // batches are still being fetched (see BatchSelect.tsx), so a Tab
    // pressed in that (very common — right after picking a product) window
    // was natively skipped by the browser, landing on Expiry instead of
    // Batch. Take Tab over here and wait for the fetch to settle before
    // moving focus, instead of racing it.
    if (inProductField && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      focusNextAfterProduct(idx)
      return
    }

    if (inProductField) return
    if (e.key === 'Enter' && idx === rows.length - 1) {
      e.preventDefault()
      onChange([...rows, newRow()])
    }
  }

  /** Resolve Tab's destination after the Product field instead of racing
   *  BatchSelect's async fetch. Once it settles:
   *   - 0 batches → the trigger stays permanently disabled ("No batches
   *     available") and BatchSelect does nothing further, so we land on
   *     Qty ourselves.
   *   - 1+ batches → BatchSelect auto-opens the Batch Selection popup
   *     itself (pre-highlighting the sole/FEFO batch) — we do nothing,
   *     so we don't steal focus back out of it. Focus only reaches Qty
   *     once the user actually confirms a batch in the popup.
   *  Purchase mode's free-text batch input isn't gated by an async fetch
   *  (only by whether a product is picked at all), so it resolves on the
   *  very first check. */
  function focusNextAfterProduct(idx: number, attemptsLeft = 30) {
    const rowEl = rowElsRef.current.get(idx)
    if (!rowEl) return

    const freeInput = rowEl.querySelector<HTMLInputElement>('.bsp-trigger-wrap input') // purchase mode
    if (freeInput) {
      (freeInput.disabled ? rowEl.querySelector<HTMLInputElement>('.pos-qty-input') : freeInput)?.focus()
      return
    }

    const trigger = rowEl.querySelector<HTMLButtonElement>('.bsp-trigger')
    if (!trigger) { rowEl.querySelector<HTMLInputElement>('.pos-qty-input')?.focus(); return } // no Batch column at all

    if (trigger.textContent === 'Loading…' && attemptsLeft > 0) {
      setTimeout(() => focusNextAfterProduct(idx, attemptsLeft - 1), 20)
      return
    }

    // Settled — only the "0 batches" outcome is still our job (see above).
    if (trigger.disabled) rowEl.querySelector<HTMLInputElement>('.pos-qty-input')?.focus()
  }

  /* ── Totals ──────────────────────────────────────────────────────────── */
  const subtotal = rows.reduce((s, r) => s + r.amount, 0)

  /* ── Column visibility ───────────────────────────────────────────────── */
  const colDefs = [
    { key: 'product',      label: 'Product / Particular', minW: 200, always: true },
    { key: 'batch_no',     label: 'Batch',      w: 90,  show: showBatch },
    { key: 'expiry',       label: 'Expiry',     w: 88,  show: showExpiry },
    { key: 'qty',          label: 'Qty',        w: 64,  always: true },
    { key: 'bonus',        label: 'Bonus',      w: 64,  show: showBonus },
    { key: 'rate',         label: 'Rate',       w: 84,  always: true },
    { key: 'discount_pct', label: 'Disc%',      w: 64,  show: showDiscount },
    { key: 'cc_pct',       label: 'C.C %',      w: 64,  show: showCC },
    { key: 'cc_amount',    label: 'C.C Amount', w: 90,  show: showCC, right: true },
    { key: 'amount',       label: 'Amount',     w: 96,  always: true, right: true },
    { key: 'del',          label: '',           w: 36,  always: true },
  ]
  const visibleCols = colDefs.filter(c => c.always || c.show)

  /* ── JSX ─────────────────────────────────────────────────────────────── */
  return (
    <div>
      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              {visibleCols.map(c => (
                <th
                  key={c.key}
                  style={{
                    width:    c.w,
                    minWidth: (c as any).minW,
                    textAlign:c.right ? 'right' : undefined,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row._id}
                ref={el => { if (el) rowElsRef.current.set(idx, el); else rowElsRef.current.delete(idx) }}
                onKeyDown={e => handleRowKeyDown(e, idx)}
                style={row._id === flashRowId
                  ? { backgroundColor: 'var(--brand-subtle, rgba(37,99,235,0.12))', transition: 'background-color 200ms ease' }
                  : { transition: 'background-color 400ms ease' }}
              >

                {/* ── Product combobox ──────────────────────────────── */}
                <td className="psc-cell">
                  <ProductSearchCell
                    ref={el => { if (el) pscRefsRef.current.set(idx, el); else pscRefsRef.current.delete(idx) }}
                    value={row.product_id}
                    products={products}
                    onChange={p => handleProductSelect(idx, p)}
                    onCreated={handleProductCreated}
                    autoFocus={idx === 0 && firstRowRef.current && (firstRowRef.current = false, true)}
                  />
                </td>

                {/* ── Batch ─────────────────────────────────────────── */}
                {showBatch && (
                  <td>
                    <BatchSelect
                      className="pos-cell-input"
                      productId={row.product_id}
                      productName={row.product_name}
                      value={row.batch_no}
                      onSelect={batch => handleBatchSelect(idx, batch)}
                      onTextChange={text => handleBatchText(idx, text)}
                      mode={mode}
                      autoSelectSingle={!!row._scanned}
                      onAutoResolved={row._scanned ? () => onBarcodeRowResolved?.(idx) : undefined}
                    />
                  </td>
                )}

                {/* ── Expiry ────────────────────────────────────────── */}
                {showExpiry && (
                  <td>
                    <input
                      className="pos-cell-input"
                      value={row.expiry}
                      onChange={e => update(idx, 'expiry', e.target.value)}
                      placeholder="MM/YY"
                    />
                  </td>
                )}

                {/* ── Qty ───────────────────────────────────────────── */}
                <td>
                  <QtyGate
                    className="pos-cell-input pos-cell-num"
                    productId={row.product_id}
                    value={row.qty ?? ''}
                    min={1}
                    mode={mode}
                    onChange={v => update(idx, 'qty', v)}
                  />
                </td>

                {/* ── Bonus ─────────────────────────────────────────── */}
                {showBonus && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.bonus ?? ''}
                      min={0}
                      onChange={e => update(idx, 'bonus', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── Rate ──────────────────────────────────────────── */}
                <td>
                  <input
                    type="number"
                    className="pos-cell-input pos-cell-num"
                    value={row.rate ?? ''}
                    min={0}
                    step="0.01"
                    onChange={e => update(idx, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </td>

                {/* ── Discount % ────────────────────────────────────── */}
                {showDiscount && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.discount_pct ?? ''}
                      min={0} max={100}
                      onChange={e => update(idx, 'discount_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── CC % ──────────────────────────────────────────── */}
                {showCC && (
                  <td>
                    <input
                      type="number"
                      className="pos-cell-input pos-cell-num"
                      value={row.cc_pct ?? ''}
                      min={0}
                      step="0.01"
                      onChange={e => update(idx, 'cc_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </td>
                )}

                {/* ── CC Amount (readonly) ───────────────────────────── */}
                {showCC && (
                  <td className="pos-cell-display pos-cell-display--right">
                    {row.cc_amount > 0
                      ? fmt(row.cc_amount)
                      : <span className="text-[var(--text-4)]">—</span>}
                  </td>
                )}

                {/* ── Amount (readonly) ─────────────────────────────── */}
                <td className="pos-cell-display pos-cell-display--right pos-cell-display--bold">
                  {row.amount > 0
                    ? fmt(row.amount)
                    : <span className="text-[var(--text-4)]">—</span>}
                </td>

                {/* ── Delete ────────────────────────────────────────── */}
                <td>
                  <button
                    type="button"
                    className="pos-row-delete"
                    onClick={() => removeRow(idx)}
                    tabIndex={-1}
                    title="Remove row"
                  >
                    <Trash2 size={13}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <button type="button" className="pos-add-row-btn" onClick={addRow}>
          <Plus size={13}/> Add Row
        </button>
        <div className="pos-subtotal">
          <span className="pos-subtotal-label">Sub Total</span>
          <span className="pos-subtotal-value">{fmt(subtotal)}</span>
        </div>
      </div>
    </div>
  )
})

export default InvoiceRowsTable
