import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, Circle, Truck, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Spinner, Empty, Badge } from '@/components/ui'
import { useCustomerOrder } from '@/hooks/useCustomerQuery'

/* ── Progress steps ───────────────────────────────────────────────────────
 * Two branches, matching the backend's flow (migration 038): a pickup
 * order still ends at `completed`, a delivery order continues through
 * `out_for_delivery` to `delivered`. A customer should never see a step
 * for a stage their order will never reach, so the tracker is chosen by
 * fulfillment_type rather than showing all seven and greying some out. */
const PICKUP_STEPS   = ['pending', 'confirmed', 'processing', 'ready', 'completed']
const DELIVERY_STEPS = ['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered']
const STEP_LABELS: Record<string, string> = {
  pending: 'Order Placed', confirmed: 'Confirmed', processing: 'Processing', ready: 'Ready',
  out_for_delivery: 'On the way', delivered: 'Delivered', completed: 'Completed',
}

export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: order, isLoading } = useCustomerOrder(id!)

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!order) return <Empty icon="🧾" message="Order not found." />

  const STEPS = order.fulfillment_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS
  const currentIdx = STEPS.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'
  const isOutForDelivery = order.status === 'out_for_delivery'

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

      {/* ── Delivery verification code ───────────────────────────────────
          Shown ONLY while the order is out for delivery (spec §6). The
          backend simply omits `delivery_otp` from the payload at every
          other stage — this page cannot render a code early even if it
          tried, because there is nothing to render. It is also never on
          the cart, checkout, or order-list screens for the same reason.

          `delivery_otp_unavailable` is the expired case: rather than
          showing a stale code that will be rejected at the door, say so
          and point at the partner, who can trigger a resend. */}
      {isOutForDelivery && (order.delivery_otp || order.delivery_otp_unavailable) && (
        <section className="mb-4 rounded-xl border-2 border-brand/30 bg-brand/[0.04] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Truck size={17} className="text-brand" />
            <h2 className="text-sm font-extrabold">Your order is out for delivery</h2>
          </div>

          {order.delivery_otp ? (
            <>
              <p className="text-xs text-[var(--text-3)] mb-2">Your delivery verification code:</p>
              <div className="flex justify-center my-2">
                <span className="text-3xl font-extrabold tracking-[0.3em] tabular-nums text-[var(--text)] select-all">
                  {order.delivery_otp}
                </span>
              </div>
              <p className="text-xs text-[var(--text-3)] text-center">
                Share this code with the delivery partner when your order arrives.
              </p>
              <div className="flex items-start gap-1.5 mt-3 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                <ShieldAlert size={13} className="mt-px shrink-0" />
                <span>Do not share this code before receiving your order.</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--text-3)]">
              Your verification code has expired. Ask the delivery partner to send a new one when they arrive.
            </p>
          )}
        </section>
      )}

      {order.status === 'delivered' && order.delivery_otp_verified_at && (
        <section className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 size={17} className="text-green-600 shrink-0" />
          <span className="text-sm font-semibold text-green-800">
            Delivered at {new Date(order.delivery_otp_verified_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </section>
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
        {/* Name and a number to call, nothing more (spec §24) — the
            backend's select list is what actually enforces this. */}
        {order.delivery_partner_name && (
          <div>
            <span className="text-[var(--text-4)]">Delivery partner: </span>
            {order.delivery_partner_name}
            {order.delivery_partner_phone && (
              <a href={`tel:${order.delivery_partner_phone}`} className="ml-2 font-semibold text-brand">Call</a>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
