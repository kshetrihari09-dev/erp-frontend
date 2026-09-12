import { useNavigate } from 'react-router-dom'
import { Plus, Minus, Trash2, AlertTriangle, ImageOff } from 'lucide-react'
import { Spinner, Button, Empty } from '@/components/ui'
import { useActiveCart, useCartActions } from '@/hooks/useCustomerQuery'

export default function CustomerCartPage() {
  const navigate = useNavigate()
  const { data: cart, isLoading } = useActiveCart()
  const { setQuantity, removeItem, clear } = useCartActions()

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!cart?.items?.length) {
    return (
      <Empty
        icon="🛒"
        message="Your cart is empty."
        action={<Button variant="primary" size="sm" onClick={() => navigate('/customer')}>Start Shopping</Button>}
      />
    )
  }

  const items = cart.items as any[]

  function stepQty(item: any, delta: number) {
    const next = item.quantity + delta * (item.qty_step || 1)
    setQuantity(item.product_id, item.cart_item_id, next, item.min_qty)
  }

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-base font-extrabold">Your Cart</h1>
        <button onClick={() => { if (confirm('Clear your entire cart?')) clear() }} className="text-xs font-semibold text-red-600">
          Clear all
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {items.map(item => (
          <div key={item.cart_item_id ?? item.product_id} className={`flex gap-3 p-3 rounded-xl border ${item.valid && item.still_online ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-red-300 bg-red-50/40'}`}>
            <div className="w-14 h-14 rounded-lg bg-[var(--surface-3)] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <ImageOff size={16} className="text-[var(--text-4)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{item.name}</div>
              <div className="text-xs text-[var(--text-4)] font-semibold">Rs. {item.price.toFixed(2)} {item.unit_label}</div>
              {(!item.valid || !item.still_online) && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-red-600 mt-1">
                  <AlertTriangle size={11} /> {!item.still_online ? 'No longer available online' : item.issue}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="customer-qty-stepper" style={{ borderRadius: 8 }}>
                  <button onClick={() => stepQty(item, -1)} className="customer-qty-btn" style={{ height: 32, minWidth: 32 }}><Minus size={13} /></button>
                  <span className="customer-qty-value">{item.quantity}</span>
                  <button onClick={() => stepQty(item, 1)} className="customer-qty-btn" style={{ height: 32, minWidth: 32 }}><Plus size={13} /></button>
                </div>
                <span className="text-sm font-bold">Rs. {item.subtotal.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => removeItem(item.product_id, item.cart_item_id)} className="w-8 h-8 flex items-center justify-center text-[var(--text-4)] hover:text-red-600 self-start -mr-1 -mt-1" aria-label="Remove item">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="customer-sticky-cta">
        <div className="customer-sticky-cta-inner">
          <div>
            <div className="text-[10px] text-[var(--text-4)] font-semibold uppercase">
              {cart.discount_amount > 0 || cart.tax_amount > 0 ? 'Total' : 'Subtotal'}
            </div>
            <div className="text-lg font-extrabold">
              Rs. {(cart.subtotal - cart.discount_amount + cart.tax_amount).toFixed(2)}
            </div>
            {(cart.discount_amount > 0 || cart.tax_amount > 0) && (
              <div className="text-[10px] text-[var(--text-4)] font-medium">
                Subtotal Rs. {cart.subtotal.toFixed(2)}
                {cart.discount_amount > 0 && <> · Discount − Rs. {cart.discount_amount.toFixed(2)}</>}
                {cart.tax_amount > 0 && <> · Tax Rs. {cart.tax_amount.toFixed(2)}</>}
              </div>
            )}
          </div>
          <Button
            variant="primary" disabled={cart.has_issues}
            onClick={() => navigate('/customer/checkout')}
            className="flex-1"
          >
            {cart.has_issues ? 'Fix Cart to Continue' : 'Proceed to Checkout'}
          </Button>
        </div>
      </div>
    </div>
  )
}
