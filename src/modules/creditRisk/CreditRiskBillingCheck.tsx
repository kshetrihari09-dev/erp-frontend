import { useCreditRiskCheckQuery } from '@/hooks/useQuery'
import { useDebounce } from '@/hooks/useDebounce'
import { Badge } from '@/components/ui'
import { fmt } from '@/utils'
import { AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Billing-time credit check (requirement #10). Rendered inline on the Sale
 * screen once a customer + credit payment mode + amount are all present.
 * This is informational/warning-only from the UI's perspective — actual
 * blocking (when the company has opted into it) is enforced server-side by
 * POST /sales, this banner exists so the cashier sees *why* before hitting
 * post rather than only after a rejection.
 *
 * ── Layout stability ────────────────────────────────────────────────────
 * `invoiceAmount` (the grand total) changes on essentially every keystroke
 * while the invoice is being built — every quantity edit, every product
 * added or removed recalculates it. That value used to flow straight into
 * `useCreditRiskCheckQuery`, which puts it in the React Query key, so each
 * edit looked like a *new* query: `isLoading` flipped true and `data` went
 * back to `undefined` until the request resolved. The old component
 * returned `null` in both of those cases, which means it was being
 * unmounted and remounted from the grid on almost every keystroke — and
 * because it sits in `.pos-customer-grid` as a full-width
 * (`gridColumn: '1 / -1'`) item, each mount/unmount added or removed an
 * entire grid row, shoving the Address/PAN/Telephone/Date row (and
 * everything below it) up and down. That was the jump.
 *
 * The fix has three parts, each targeting one contributor:
 *  1. The amount is debounced before it's used for the check at all, so
 *     typing doesn't fire a request (or a query-key change) per keystroke.
 *  2. `useCreditRiskCheckQuery` now keeps the previous result visible while
 *     a new amount/customer is refetched (`placeholderData: keepPreviousData`
 *     in useQuery.ts), so a refetch no longer blanks `check` back to
 *     `undefined`.
 *  3. Whether the warning itself is currently warranted only changes on
 *     genuine state transitions now (debounced amount settled + a stable,
 *     non-flickering `check` result) — and even then it's mounted/unmounted
 *     through AnimatePresence with an animated height/opacity transition
 *     instead of an instant DOM pop, so a real appear/disappear (e.g. risk
 *     clears once the amount drops, or the cashier switches payment method)
 *     is smooth instead of a jump.
 */
export function CreditRiskBillingCheck({ customerId, invoiceAmount, isCredit, onChangePaymentMethod }: {
  customerId: string
  invoiceAmount: number
  isCredit: boolean
  onChangePaymentMethod?: () => void
}) {
  // Settle the amount before it drives any request — this is the same
  // debounce pattern already used for search-as-you-type elsewhere in the
  // app (see hooks/useDebounce.ts, used by ProductsPage/StockPage/etc).
  const debouncedAmount = useDebounce(invoiceAmount, 400)

  // Hard structural gate: only reserve/mount the warning's grid slot once
  // we're actually in a state where a credit check is meaningful. These
  // three conditions change rarely (customer selection, payment-mode
  // choice, cart going from empty to non-empty) — never per keystroke — so
  // mounting/unmounting here is an expected, deliberate transition, not
  // refetch noise.
  const checkActive = isCredit && !!customerId && invoiceAmount > 0

  const { data: check } = useCreditRiskCheckQuery(customerId, debouncedAmount, checkActive)

  const shouldWarn = !!check
    && check.risk_category !== 'insufficient_data'
    && (check.exceeds_available_credit || check.exceeds_recommended_exposure || check.risk_category === 'high')

  if (!checkActive) return null

  // No permanent wrapper element here on purpose: when nothing is warranted
  // (`shouldWarn` false), AnimatePresence renders nothing at all, so a
  // low-risk credit sale doesn't reserve any extra grid row/gap it doesn't
  // need. When the warning *does* need to appear or disappear, AnimatePresence
  // keeps the outgoing element mounted just long enough to animate its
  // height/opacity down to nothing instead of yanking it out of the grid
  // instantly, which is what produced the jump.
  return (
    <AnimatePresence initial={false}>
      {shouldWarn && check && (
        <motion.div
          key="credit-risk-warning"
          className="pos-span2"
          style={{ gridColumn: '1 / -1', overflow: 'hidden' }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <div className={`rounded-lg border p-3 text-sm ${check.blocked ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
