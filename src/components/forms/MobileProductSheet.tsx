/**
 * MobileProductSheet.tsx
 *
 * Phone-only bottom sheet that holds an invoice item's EXISTING input fields
 * (Product, Qty, Bonus, Rate, CC%) so they are no longer squeezed into the
 * compact row. One reusable shell for BOTH adding and editing: the page passes
 * the fields as children, bound live to the row being edited — so editing
 * updates that very row (never a duplicate) and every calculation still runs
 * through the page's existing handlers. This file holds no business logic.
 *
 *  - Not dismissed by tapping outside (no accidental loss of an edit); only the
 *    ✕ button or Confirm close it.
 *  - Scrolls inside itself on small screens; follows the visual viewport so it
 *    stays above the on-screen keyboard; respects the bottom safe-area inset.
 *  - Registers a shortcut scope while open so page shortcuts stay quiet.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useShortcutScope } from '@/hooks/useKeyboardShortcuts'
import useProductBatches from '@/hooks/useProductBatches'
import { formatExpiry } from '@/utils/batch'

interface SheetProps {
  open:          boolean
  title:         string
  onClose:       () => void
  confirmLabel?: string
  children:      ReactNode
}

export default function MobileProductSheet({ open, title, onClose, confirmLabel = 'Confirm', children }: SheetProps) {
  useShortcutScope(open)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Keep the sheet inside the *visual* viewport so the keyboard never covers it.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('mps-open')
    const vv = window.visualViewport
    const apply = () => {
      const el = overlayRef.current
      if (!el || !vv) return
      el.style.top    = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    return () => {
      document.body.classList.remove('mps-open')
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div ref={overlayRef} className="mps-overlay">
      <div className="mps-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mps-header">
          <div className="mps-title">{title}</div>
          <button type="button" className="mps-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div
          className="mps-body"
          onFocusCapture={e => {
            const el = e.target as HTMLElement
            setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
          }}
        >
          {children}
        </div>
        <div className="mps-footer">
          <button type="button" className="mps-confirm" onClick={onClose}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Shows the row's current batch (same wording as BatchSelect's own trigger) and, when
 *  tapped, opens that row's existing batch popup by activating its hidden trigger — so
 *  batch picking has exactly one implementation. */
export function SheetBatchField({
  rowId, productId, batchNo, expiry,
}: { rowId: number; productId?: string; batchNo: string; expiry: string }) {
  const { batches, loading } = useProductBatches(productId)
  const forProduct = productId ? batches.filter(b => b.product_id === productId) : []
  const noStock = !!productId && !loading && forProduct.length === 0
  const selected = forProduct.find(b => b.batch_no === batchNo)

  const text = !productId ? '—'
    : loading ? 'Loading…'
    : noStock ? 'No batches available'
    : selected ? `${selected.batch_no || '—'}  ·  ${formatExpiry(expiry || selected.expiry_date || selected.expiry)}`
    : 'Select batch…'

  return (
    <button
      type="button"
      className={`mps-batch${selected ? ' mps-batch--set' : ''}`}
      disabled={!productId || loading || noStock}
      onClick={() => document.querySelector<HTMLButtonElement>(`[data-batch-row="${rowId}"] .bsp-trigger`)?.click()}
    >
      {text}
    </button>
  )
}
