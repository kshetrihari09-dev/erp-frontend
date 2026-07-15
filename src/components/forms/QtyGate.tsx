/**
 * QtyGate.tsx
 *
 * Thin wrapper around the Quantity <input> used in the Sale/Purchase
 * invoice rows. It doesn't add a new validation rule — the existing
 * "qty > 0" check at post time (SalesPage/PurchasePage onSubmit) is
 * untouched.
 *
 * Sale (`mode="sale"`, default): disables the field (and explains why)
 * when the row's product has no existing batches at all, so a user
 * can't type a quantity for a product that has nothing to actually
 * ship/sell — the row then naturally fails the existing rule instead of
 * a new one being added.
 *
 * Purchase (`mode="purchase"`): never blocked on batch count. Buying
 * stock commonly *introduces* a brand-new batch with zero prior stock —
 * that's the normal case here, not a reason to stop the user typing a
 * quantity (see BatchSelect.tsx's purchase mode, which is enterable for
 * the same reason).
 *
 * Carries the `pos-qty-input` class so BatchSelect.tsx can find and
 * focus this exact field after a batch is resolved (Enter/Tab/auto-pick).
 */
import useProductBatches from '@/hooks/useProductBatches'

interface Props {
  productId?: string
  value:      number | string
  onChange:   (v: number | '') => void
  className?: string
  min?:       number
  step?:      string
  placeholder?: string
  mode?:      'sale' | 'purchase'
}

export default function QtyGate({
  productId, value, onChange, className, min = 1, step, placeholder, mode = 'sale',
}: Props) {
  const { batches, loading } = useProductBatches(productId)
  const blocked = mode === 'sale' && !!productId && !loading && batches.length === 0

  return (
    <input
      type="number"
      inputMode="numeric"
      className={`${className || ''} pos-qty-input`.trim()}
      value={value}
      min={min}
      step={step}
      disabled={blocked}
      placeholder={blocked ? 'No batches' : (placeholder ?? '0')}
      title={blocked ? 'No batches available for this product' : undefined}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    />
  )
}
