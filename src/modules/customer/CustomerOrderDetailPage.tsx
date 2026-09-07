import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, Circle } from 'lucide-react'
import { Spinner, Empty, Badge } from '@/components/ui'
import { useCustomerOrder } from '@/hooks/useCustomerQuery'

const STEPS = ['pending', 'confirmed', 'processing', 'ready', 'completed']
const STEP_LABELS: Record<string, string> = {
  pending: 'Order Placed', confirmed: 'Confirmed', processing: 'Processing', ready: 'Ready', completed: 'Completed',
}

export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: order, isLoading } = useCustomerOrder(id!)

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!order) return <Empty icon="🧾" message="Order not found." />

  const currentIdx = STEPS.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'

  return (
    <div className="p-4 pb-8 max-w-lg mx-auto">
      <button onClick={() => navigate('/customer/orders')} className="flex items-center gap-1 text-sm font-semibold text-[var(--text-2)] mb-3">
        <ChevronLeft size={16} /> Back to Orders
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-extrabold">{order.order_no}</h1>
          <p className="text-xs text-[var(--text-4)]">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <Badge status={order.status}>{order.status.toUpperCase()}</Badge>
      </div>

      {isCancelled ? (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          This order was cancelled{order.cancel_reason ? `: ${order.cancel_reason}` : '.'}
        </div>
      ) : (
        <div className="flex items-center mb-5">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${i <= currentIdx ? 'bg-brand text-white' : 'bg-[var(--surface-3)] text-[var(--text-4)]'}`}>
                  {i <= currentIdx ? <Check size={13} /> : <Circle size={8} fill="currentColor" />}
                </div>
                <span className="text-[9.5px] font-semibold text-[var(--text-3)] text-center w-14">{STEP_LABELS[step]}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < currentIdx ? 'bg-brand' : 'bg-[var(--surface-3)]'}`} />}
            </div>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2 mb-4">
        {order.items.map((item: any) => (
          <div key={item.id} className="flex justify-between text-sm">
            <div>
              <div className="font-medium">{item.product_name_snapshot}</div>
              <div className="text-xs text-[var(--text-4)]">{item.quantity} {item.unit_snapshot} × Rs. {Number(item.unit_price).toFixed(2)}</div>
            </div>
            <span className="font-semibold">Rs. {Number(item.subtotal).toFixed(2)}</span>
          </div>
        ))}
      </section>

      <section className="border-t border-[var(--border)] pt-3 flex flex-col gap-1.5 text-sm mb-4">
        <div className="flex justify-between"><span className="text-[var(--text-3)]">Subtotal</span><span>Rs. {Number(order.subtotal).toFixed(2)}</span></div>
        {Number(order.discount_amount) > 0 && <div className="flex justify-between"><span className="text-[var(--text-3)]">Discount</span><span>- Rs. {Number(order.discount_amount).toFixed(2)}</span></div>}
        {Number(order.tax_amount) > 0 && <div className="flex justify-between"><span className="text-[var(--text-3)]">Tax</span><span>Rs. {Number(order.tax_amount).toFixed(2)}</span></div>}
        {Number(order.delivery_charge) > 0 && <div className="flex justify-between"><span className="text-[var(--text-3)]">Delivery</span><span>Rs. {Number(order.delivery_charge).toFixed(2)}</span></div>}
        <div className="flex justify-between text-base font-extrabold pt-1"><span>Total</span><span>Rs. {Number(order.grand_total).toFixed(2)}</span></div>
      </section>

      <section className="text-sm text-[var(--text-2)] flex flex-col gap-1">
        <div><span className="text-[var(--text-4)]">Fulfillment: </span>{order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup'}</div>
        {order.fulfillment_type === 'delivery' && order.delivery_address && (
          <div><span className="text-[var(--text-4)]">Address: </span>{order.delivery_address}</div>
        )}
        <div><span className="text-[var(--text-4)]">Payment: </span>{order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : 'Pay at Store'} ({order.payment_status})</div>
        {order.delivery_notes && <div><span className="text-[var(--text-4)]">Notes: </span>{order.delivery_notes}</div>}
      </section>
    </div>
  )
}
