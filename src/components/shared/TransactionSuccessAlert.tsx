/**
 * TransactionSuccessAlert — the single, shared "posted successfully"
 * confirmation used by both PurchasePage and SalesPage.
 *
 * It's a thin wrapper around the existing `Alert` component (see
 * @/components/ui) — no new alert/toast implementation, just a success
 * icon, a bit of structure (voucher no / party / grand total), and an
 * opt-in auto-dismiss, all of which `Alert` already supports natively.
 *
 * Defining this once and importing it from both pages is what keeps the
 * Sale and Purchase "success" experience identical without duplicating
 * the markup/logic in each file.
 */
import { CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui'
import { fmt } from '@/utils'

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
  return (
    <Alert
      type="success"
      icon={<CheckCircle2 size={18} className="text-green-500" />}
      autoCloseMs={TRANSACTION_SUCCESS_AUTO_CLOSE_MS}
      onClose={onClose}
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
  )
}
