/**
 * QtyGate.tsx
 *
 * Sale quantity is limited to the stock returned by the backend batch API.
 * Values above available stock are rejected while typing (not just at posting).
 * Purchase quantities remain unrestricted because purchases add stock.
 */
import useProductBatches from '@/hooks/useProductBatches'

interface Props {
  productId?: string
  value: number | string
  onChange: (v: number | '') => void
  className?: string
  min?: number
  step?: string
  placeholder?: string
  mode?: 'sale' | 'purchase'
}

export default function QtyGate({
  productId, value, onChange, className, min = 1, step, placeholder, mode = 'sale',
}: Props) {
  const { batches, loading } = useProductBatches(productId)
  const productBatches = productId ? batches.filter(b => b.product_id === productId) : []
  const availableStock = productBatches.reduce(
    (total, batch) => total + Math.max(0, Number(batch.qty_available) || 0),
    0,
  )
  const blocked = mode === 'sale' && !!productId && !loading && availableStock <= 0
  const stockLimitReached = mode === 'sale' && !!productId && !loading && availableStock > 0
    && Number(value || 0) > availableStock

  return (
    <input
      type="number"
      inputMode="numeric"
      className={`${className || ''} pos-qty-input`.trim()}
      value={value}
      min={min}
      max={mode === 'sale' && productId && !loading ? availableStock : undefined}
      step={step}
      disabled={blocked}
      placeholder={blocked ? 'No stock' : (placeholder ?? '0')}
      title={blocked
        ? 'No available stock for this product'
        : mode === 'sale' && productId && !loading
          ? `Available stock: ${availableStock}`
          : undefined}
      aria-invalid={stockLimitReached || undefined}
      onChange={e => {
        if (e.target.value === '') {
          onChange('')
          return
        }
        const next = Number(e.target.value)
        // HTML max alone does not stop users typing a larger number.
        // Reject the change immediately so the displayed value stays valid.
        if (mode === 'sale' && productId && !loading && next > availableStock) return
        onChange(next)
      }}
    />
  )
}
