/**
 * QtyStepper.tsx
 *
 * Pure UI wrapper around QtyGate — adds −/+ tap targets on a mobile
 * invoice row without introducing any new validation. Both buttons call
 * the exact same `onChange` QtyGate's own <input> would call, so a step
 * behaves identically to typing that value by hand; nothing here
 * duplicates or bypasses QtyGate's own logic.
 *
 * Respects QtyGate's existing "no batches yet" gate: it calls the same
 * useProductBatches hook (module-level cached — see useProductBatches.ts
 * — so this doesn't cause an extra network request) purely to know
 * whether to disable the −/+ buttons in lockstep with the input itself.
 */
import { Minus, Plus } from 'lucide-react'
import QtyGate from './QtyGate'
import useProductBatches from '@/hooks/useProductBatches'

interface Props {
  productId?: string
  value:      number
  onChange:   (v: number) => void
  min?:       number
  mode?:      'sale' | 'purchase'
}

export default function QtyStepper({ productId, value, onChange, min = 1, mode = 'sale' }: Props) {
  const { batches, loading } = useProductBatches(productId)
  const blocked = mode === 'sale' && !!productId && !loading && batches.length === 0

  const step = (delta: number) => {
    const next = Math.max(0, (Number(value) || 0) + delta)
    onChange(next)
  }

  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-stepper-btn"
        disabled={blocked || (Number(value) || 0) <= 0}
        onClick={() => step(-1)}
        aria-label="Decrease quantity"
      >
        <Minus size={13} strokeWidth={2.5} />
      </button>
      <QtyGate
        productId={productId}
        value={value === 0 ? '' : value}
        min={min}
        mode={mode}
        className="qty-stepper-input"
        onChange={v => onChange(v === '' ? 0 : v)}
      />
      <button
        type="button"
        className="qty-stepper-btn"
        disabled={blocked}
        onClick={() => step(1)}
        aria-label="Increase quantity"
      >
        <Plus size={13} strokeWidth={2.5} />
      </button>
    </div>
  )
}
