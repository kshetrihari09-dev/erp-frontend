import { useNavigate } from 'react-router-dom'
import { Plus, Minus, Trash2, AlertTriangle, ImageOff } from 'lucide-react'
import { Spinner, Button, Empty } from '@/components/ui'
import { useCustomerCart, useUpdateCartItem, useRemoveCartItem, useClearCart } from '@/hooks/useCustomerQuery'

export default function CustomerCartPage() {
  const navigate = useNavigate()
  const { data: cart, isLoading } = useCustomerCart()
  const updateItem = useUpdateCartItem()
  const removeItem = useRemoveCartItem()
  const clearCart = useClearCart()

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!cart?.items?.length) return <Empty icon="🛒" message="Your cart is empty." />

  const items = cart.items as any[]

  function stepQty(item: any, delta: number) {
    const next = item.quantity + delta * (item.qty_step || 1)
    if (next < item.min_qty) { removeItem.mutate(item.cart_item_id); return }
    updateItem.mutate({ itemId: item.cart_item_id, quantity: next })
  }

  return (
    <div className="pb-28">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-base font-extrabold">Your Cart</h1>
        <button onClick={() => { if (confirm('Clear your entire cart?')) clearCart.mutate(undefined) }} className="text-xs font-semibold text-red-600">
          Clear all
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {items.map(item => (
          <div key={item.cart_item_id} className={`flex gap-3 p-3 rounded-xl border ${item.valid && item.still_online ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-red-300 bg-red-50/40'}`}>
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
                <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
                  <button onClick={() => stepQty(item, -1)} className="w-7 h-7 flex items-center justify-center hover:bg-[var(--surface-2)]"><Minus size={12} /></button>
                  <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                  <button onClick={() => stepQty(item, 1)} className="w-7 h-7 flex items-center justify-center hover:bg-[var(--surface-2)]"><Plus size={12} /></button>
                </div>
                <span className="text-sm font-bold">Rs. {item.subtotal.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => removeItem.mutate(item.cart_item_id)} className="text-[var(--text-4)] hover:text-red-600 self-start">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="fixed bottom-[56px] left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] p-3 flex items-center justify-between gap-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 12px)' }}>
        <div>
          <div className="text-[10px] text-[var(--text-4)] font-semibold uppercase">Subtotal</div>
          <div className="text-lg font-extrabold">Rs. {cart.subtotal.toFixed(2)}</div>
        </div>
        <Button
          variant="primary" disabled={cart.has_issues}
          onClick={() => navigate('/customer/checkout')}
          className="flex-1"
        >
          {cart.has_issues ? 'Fix Cart to Continue' : 'Checkout'}
        </Button>
      </div>
    </div>
  )
}
