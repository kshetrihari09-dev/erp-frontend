/**
 * DiscountReviewModal.tsx
 *
 * The final review step in the redesigned Sale workflow:
 *   Create Invoice → Next (F12) → Review & Apply Discount → Post Invoice
 *
 * Body content depends on the active discount scope (Invoice / Company /
 * Product — see the Sale page's scope selector). Posting logic itself
 * lives on the Sale page (onPost) — this component only ever edits the
 * discount inputs and shows a live preview before handing off to it.
 */
import { useRef } from 'react'
import { Button, Modal, Kbd } from '@/components/ui'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import type { Product } from '@/types'
import {
  type DiscountScope, type DiscountEntry,
  buildCompanyGroups, buildProductRows,
} from './discountUtils'
import InvoiceDiscountPanel from './InvoiceDiscountPanel'
import CompanyDiscountTable from './CompanyDiscountTable'
import ProductDiscountTable from './ProductDiscountTable'

interface Props {
  open:     boolean
  onClose:  () => void   // Back / Esc — returns to the Sale page unposted
  scope:    DiscountScope
  rows:     InvoiceRow[]
  products: Product[]
  subtotal: number

  invoiceDiscount: DiscountEntry
  onInvoiceDiscountChange: (d: DiscountEntry) => void
  companyDiscounts: Record<string, DiscountEntry>
  onCompanyDiscountChange: (key: string, entry: DiscountEntry) => void
  productDiscounts: Record<number, DiscountEntry>
  onProductDiscountChange: (rowId: number, entry: DiscountEntry) => void

  onClearAll: () => void
  onPost:     () => void
  posting:    boolean
}

const SCOPE_TITLE: Record<DiscountScope, string> = {
  invoice: 'Discount Review — Invoice',
  company: 'Discount Review — Company / Manufacturer',
  product: 'Discount Review — Product',
}

export default function DiscountReviewModal({
  open, onClose, scope, rows, products, subtotal,
  invoiceDiscount, onInvoiceDiscountChange,
  companyDiscounts, onCompanyDiscountChange,
  productDiscounts, onProductDiscountChange,
  onClearAll, onPost, posting,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)

  const focusableInputs = () =>
    Array.from(bodyRef.current?.querySelectorAll<HTMLInputElement>('.drv-value-input, .drv-cell-value') || [])

  const moveFocus = (dir: 1 | -1) => {
    const inputs = focusableInputs()
    if (!inputs.length) return
    const idx  = inputs.findIndex(el => el === document.activeElement)
    const next = inputs[(idx === -1 ? 0 : idx + dir + inputs.length) % inputs.length]
    next?.focus()
    next?.select?.()
  }

  // This scope becomes topmost the instant it mounts (Modal is a child
  // component, so its own Esc-only scope registers first and would
  // otherwise be shadowed) — so Esc is handled here directly, matching
  // Modal's own behaviour of returning to the Sale page.
  useKeyboardShortcuts([
    { combo: 'esc',        description: 'Back to Sale Page', handler: onClose },
    { combo: 'enter',      description: 'Next field',  allowInInput: true, handler: () => moveFocus(1) },
    { combo: 'arrowdown',  description: 'Next row',     allowInInput: true, handler: () => moveFocus(1) },
    { combo: 'arrowup',    description: 'Previous row', allowInInput: true, handler: () => moveFocus(-1) },
    { combo: 'ctrl+enter', description: 'Post Invoice', allowInInput: true, handler: () => { if (!posting) onPost() } },
  ], { enabled: open })

  const companyGroups = scope === 'company' ? buildCompanyGroups(rows, products, companyDiscounts) : []
  const productRows   = scope === 'product' ? buildProductRows(rows, products, productDiscounts)   : []

  return (
    <Modal
      open={open} onClose={onClose}
      title={SCOPE_TITLE[scope]}
      size="lg"
      footer={
        <>
          <div className="flex-1 flex items-center gap-2 text-[11px] text-[var(--text-4)]">
            <Kbd>Tab</Kbd> Next field <Kbd>↑↓</Kbd> Rows <Kbd>Ctrl+Enter</Kbd> Post <Kbd>Esc</Kbd> Back
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>Back</Button>
          <Button variant="outline" size="sm" onClick={onClearAll}>
            {scope === 'invoice' ? 'Clear' : 'Clear All'}
          </Button>
          <Button variant="primary" size="sm" loading={posting} onClick={onPost}>
            Post Invoice
          </Button>
        </>
      }
    >
      <div ref={bodyRef}>
        {scope === 'invoice' && (
          <InvoiceDiscountPanel
            rows={rows} subtotal={subtotal}
            discount={invoiceDiscount} onChange={onInvoiceDiscountChange}
          />
        )}
        {scope === 'company' && (
          <CompanyDiscountTable rows={rows} groups={companyGroups} onChange={onCompanyDiscountChange} />
        )}
        {scope === 'product' && (
          <ProductDiscountTable rows={rows} productRows={productRows} onChange={onProductDiscountChange} />
        )}
      </div>
    </Modal>
  )
}
