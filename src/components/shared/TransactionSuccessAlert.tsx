/**
 * TransactionSuccessAlert — the single, shared "posted successfully"
 * confirmation used by both PurchasePage and SalesPage.
 *
 * It's a thin wrapper around the existing `Alert` component (see
 * @/components/ui) — no new alert/toast implementation, just a success
 * icon, a bit of structure (voucher no / party / grand total), and an
 * auto-dismiss, all rendered through `Alert`'s existing markup/styling.
 *
 * IMPORTANT: both PurchasePage and SalesPage open a full-screen
 * `PrintPreviewModal` (via createPortal, very high z-index) the instant a
 * sale/purchase saves. An inline alert rendered in the normal page flow
 * would sit *behind* that overlay and never actually be seen. So this
 * renders through its own portal at the app's `Z.toast` layer — the same
 * top-most layer already reserved for toasts in styles/zIndex.ts — so the
 * confirmation is visible whether or not the print preview is open.
 *
 * Defining this once and importing it from both pages is what keeps the
 * Sale and Purchase "success" experience identical without duplicating
 * the markup/logic in each file.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui'
import { fmt } from '@/utils'
import { Z } from '@/styles/zIndex'

/** How long the success confirmation stays up before auto-dismissing. */
export const TRANSACTION_SUCCESS_AUTO_CLOSE_MS = 6000

export interface TransactionSuccessInfo {
  /** e.g. "Invoice" (Sale) or "Purchase Bill" (Purchase) */
  voucherLabel: string
  /** The posted invoice / bill number */
  voucherNo:    string
  /** e.g. "Customer" or "Supplier" */
  partyLabel:   string
  partyName?:   string
  grandTotal:   number
}

export default function TransactionSuccessAlert({
  info, onClose,
}: {
  info:    TransactionSuccessInfo
  onClose: () => void
}) {
  // Own the mount/unmount locally so the exit animation can finish before
  // telling the parent to clear its flash state — the parent is one
  // AnimatePresence removed from this component (it just stops rendering
  // <TransactionSuccessAlert/> entirely), so it can't animate the exit
  // itself.
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), TRANSACTION_SUCCESS_AUTO_CLOSE_MS)
    return () => clearTimeout(t)
  }, [])

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed',
            // OfflineStatusIndicator occupies the top-right corner
            // (top:10, right:10, ~28px tall) whenever a company is logged
            // in — which is always true here, since posting a sale/purchase
            // requires being logged in. Start below it (10 + ~28 + 8px gap)
            // so the two never overlap.
            top: 46,
            right: 16,
            zIndex: Z.toast,
            width: 'min(400px, calc(100vw - 32px))',
          }}
        >
          <Alert
            type="success"
            icon={<CheckCircle2 size={18} className="text-green-500" />}
            onClose={() => setVisible(false)}
            message={
              <div>
                <div className="font-semibold">
                  {info.voucherLabel} {info.voucherNo} posted successfully
                </div>
                <div className="alert-success-details">
                  <span><b>{info.partyLabel}:</b> {info.partyName || '—'}</span>
                  <span><b>Grand Total:</b> {fmt(info.grandTotal)}</span>
                </div>
              </div>
            }
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
