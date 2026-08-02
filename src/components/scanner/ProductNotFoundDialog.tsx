/**
 * ProductNotFoundDialog.tsx
 *
 * Shown when a scanned barcode doesn't match any product. Built on the
 * shared <Modal> (see components/ui/index.tsx) so it automatically gets
 * the same title-top-left / close-top-right / Esc-to-close / responsive
 * behaviour every other popup in the app already has — nothing bespoke
 * to keep in sync.
 *
 * The invoice itself is never touched here — closing this dialog (via
 * the ✕ button, Esc, or "OK") only ever hands focus back to the barcode
 * input so scanning can continue immediately.
 */
import { AlertTriangle } from 'lucide-react'
import { Modal, Button } from '@/components/ui'

interface Props {
  code:    string | null
  onClose: () => void
}

export default function ProductNotFoundDialog({ code, onClose }: Props) {
  return (
    <Modal
      open={!!code}
      onClose={onClose}
      title="Product Not Found"
      size="sm"
      footer={<Button variant="primary" size="sm" onClick={onClose}>OK</Button>}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--danger-subtle,rgba(239,68,68,0.12))] flex items-center justify-center">
          <AlertTriangle size={17} className="text-[var(--danger,#EF4444)]" />
        </div>
        <div>
          <div className="text-sm text-[var(--text)]">
            No product matches this code:
          </div>
          <div className="mt-1.5 font-mono text-sm font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] inline-block break-all">
            {code}
          </div>
          <div className="mt-2 text-xs text-[var(--text-4)]">
            Check the barcode is assigned to a product, or add it from the Product page.
          </div>
        </div>
      </div>
    </Modal>
  )
}
