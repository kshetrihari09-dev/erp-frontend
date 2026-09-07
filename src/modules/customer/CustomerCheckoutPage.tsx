import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Textarea, Alert, Spinner } from '@/components/ui'
import { useCustomerCart, useCheckout } from '@/hooks/useCustomerQuery'
import useCustomerAuthStore from '@/store/customerAuthStore'

export default function CustomerCheckoutPage() {
  const navigate = useNavigate()
  const { data: cart, isLoading } = useCustomerCart()
  const customer = useCustomerAuthStore(s => s.customer)
  const checkout = useCheckout()

  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState(customer?.address || '')
  const [phone, setPhone] = useState(customer?.phone || '')
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState<'cash_on_delivery' | 'pay_at_store'>('pay_at_store')
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<any[]>([])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!cart?.items?.length) { navigate('/customer/cart', { replace: true }); return null }

  async function handlePlaceOrder() {
    setError(''); setProblems([])
    if (fulfillment === 'delivery' && !address.trim()) { setError('Delivery address is required.'); return }

    try {
      const order = await checkout.mutateAsync({
        fulfillment_type: fulfillment,
        delivery_address: fulfillment === 'delivery' ? address.trim() : undefined,
        delivery_phone: fulfillment === 'delivery' ? phone.trim() : undefined,
        delivery_notes: notes.trim() || undefined,
        payment_method: payment,
      })
      navigate(`/customer/orders/${order.id}`, { replace: true })
    } catch (err: any) {
      if (err?.problems) { setProblems(err.problems); setError('Some items in your cart need attention — please review your cart.') }
      else setError(err?.message || 'Could not place your order.')
    }
  }

  return (
    <div className="p-4 pb-8 flex flex-col gap-5 max-w-lg mx-auto">
      <h1 className="text-base font-extrabold">Checkout</h1>

      {error && (
        <div>
          <Alert type="danger" message={error} />
          {problems.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 list-disc pl-5">
              {problems.map((p, i) => <li key={i}>{p.name}: {p.message}</li>)}
            </ul>
          )}
          {problems.length > 0 && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate('/customer/cart')}>Review Cart</Button>
          )}
        </div>
      )}

      <section>
        <h2 className="text-xs font-bold uppercase text-[var(--text-4)] mb-2">Fulfillment</h2>
        <div className="flex gap-2">
          {(['pickup', 'delivery'] as const).map(opt => (
            <button
              key={opt} onClick={() => setFulfillment(opt)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 capitalize ${fulfillment === opt ? 'border-brand text-brand bg-brand/5' : 'border-[var(--border)] text-[var(--text-2)]'}`}
            >{opt}</button>
          ))}
        </div>
      </section>

      {fulfillment === 'delivery' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase text-[var(--text-4)]">Delivery Details</h2>
          <Textarea label="Address *" value={address} onChange={e => setAddress(e.target.value)} rows={2} />
          <Input label="Contact Phone" value={phone} onChange={e => setPhone(e.target.value)} />
          <Textarea label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </section>
      )}

      <section>
        <h2 className="text-xs font-bold uppercase text-[var(--text-4)] mb-2">Payment</h2>
        <div className="flex flex-col gap-2">
          {[
            { value: 'pay_at_store', label: 'Pay at Store' },
            { value: 'cash_on_delivery', label: 'Cash on Delivery' },
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-2 p-3 border border-[var(--border)] rounded-lg cursor-pointer">
              <input type="radio" checked={payment === opt.value} onChange={() => setPayment(opt.value as any)} />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between"><span className="text-[var(--text-3)]">Subtotal</span><span>Rs. {cart.subtotal.toFixed(2)}</span></div>
        {cart.discount_amount > 0 && <div className="flex justify-between"><span className="text-[var(--text-3)]">Discount</span><span>- Rs. {cart.discount_amount.toFixed(2)}</span></div>}
        {cart.tax_amount > 0 && <div className="flex justify-between"><span className="text-[var(--text-3)]">Tax</span><span>Rs. {cart.tax_amount.toFixed(2)}</span></div>}
        <div className="flex justify-between text-base font-extrabold pt-1"><span>Total</span><span>Rs. {(cart.subtotal - cart.discount_amount + cart.tax_amount).toFixed(2)}</span></div>
      </section>

      <Button variant="primary" loading={checkout.isPending} onClick={handlePlaceOrder}>Place Order</Button>
    </div>
  )
}
