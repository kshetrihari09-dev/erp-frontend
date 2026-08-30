import { useCreditRiskCheckQuery } from '@/hooks/useQuery'
import { Badge } from '@/components/ui'
import { fmt } from '@/utils'
import { AlertTriangle } from 'lucide-react'

/**
 * Billing-time credit check (requirement #10). Rendered inline on the Sale
 * screen once a customer + credit payment mode + amount are all present.
 * This is informational/warning-only from the UI's perspective — actual
 * blocking (when the company has opted into it) is enforced server-side by
 * POST /sales, this banner exists so the cashier sees *why* before hitting
 * post rather than only after a rejection.
 */
export function CreditRiskBillingCheck({ customerId, invoiceAmount, isCredit, onChangePaymentMethod }: {
  customerId: string
  invoiceAmount: number
  isCredit: boolean
  onChangePaymentMethod?: () => void
}) {
  const { data: check, isLoading } = useCreditRiskCheckQuery(customerId, invoiceAmount, isCredit)

  if (!isCredit || !customerId || invoiceAmount <= 0) return null
  if (isLoading || !check) return null
  if (check.risk_category === 'insufficient_data') return null
  if (!check.exceeds_available_credit && !check.exceeds_recommended_exposure && check.risk_category !== 'high') return null

  return (
    <div className={`pos-span2 rounded-lg border p-3 text-sm ${check.blocked ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`} style={{ gridColumn: '1 / -1' }}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className={check.blocked ? 'text-red-600' : 'text-amber-600'} style={{ marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[var(--text)] flex items-center gap-2 flex-wrap">
            {check.blocked ? 'Credit Sale Blocked' : 'Credit Risk Warning'}
            <Badge status={check.risk_category}>{check.risk_category === 'high' ? 'High Risk' : check.risk_category === 'medium' ? 'Medium Risk' : 'Low Risk'}</Badge>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-1">
            {check.exceeds_available_credit
              ? `This invoice (Rs. ${fmt(invoiceAmount)}) exceeds ${check.customer_name}'s available credit of Rs. ${fmt(check.available_credit ?? 0)}.`
              : `This customer exceeds the recommended credit exposure.`}
          </p>
          <p className="text-xs text-[var(--text-3)] mt-1"><b>Recommended Action:</b> {check.recommended_action}</p>
          {onChangePaymentMethod && (
            <div className="flex gap-2 mt-2">
              <button type="button" className="text-xs font-semibold text-[var(--brand)]" onClick={onChangePaymentMethod}>Change Payment Method</button>
              {check.requires_approval && <span className="text-xs text-[var(--text-4)]">— or request manager approval before posting</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
