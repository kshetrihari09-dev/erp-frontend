/**
 * modules/delivery/DeliveryOrdersPage.tsx — the rider's job list.
 *
 * Everything on this screen comes from GET /delivery/orders, which the
 * backend scopes to this rider's own assignments. There is no filter,
 * search, or order-id entry here on purpose: a rider has no legitimate
 * way to reach an order that was not assigned to them, so the UI never
 * offers one.
 *
 * Note what is absent from each card: no delivery code, and no
 * placeholder where one would go. The rider gets the code from the
 * customer's mouth (spec §15) — showing it here, even masked, would
 * suggest the app knows it and invite "just tap to reveal".
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, ChevronRight, MapPin, CheckCircle2, Truck } from 'lucide-react'
import { Tabs, Empty, SkeletonRows, Badge } from '@/components/ui'
import { useMyDeliveries } from '@/hooks/useQuery'

export default function DeliveryOrdersPage() {
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const navigate = useNavigate()
  const { data: orders = [], isLoading } = useMyDeliveries(tab === 'done')

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        tabs={[{ id: 'active', label: 'To deliver' }, { id: 'done', label: 'Completed' }]}
        active={tab}
        onChange={(id) => setTab(id as 'active' | 'done')}
      />

      {isLoading ? (
        <SkeletonRows cols={1} rows={4} />
      ) : orders.length === 0 ? (
        <Empty
          icon={<Package size={28} />}
          message={tab === 'active' ? 'No deliveries assigned to you right now.' : 'No completed deliveries yet.'}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {orders.map((o: any) => (
            <button
              key={o.id}
              onClick={() => navigate(`/delivery/orders/${o.id}`)}
              className="flex items-start justify-between gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left active:bg-[var(--surface-2)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold">{o.order_no}</span>
                  {o.status === 'delivered'
                    ? <Badge status="completed">DELIVERED</Badge>
                    : o.status === 'out_for_delivery'
                      ? <Badge status="processing">OUT FOR DELIVERY</Badge>
                      : <Badge status={o.status}>{String(o.status).replace(/_/g, ' ').toUpperCase()}</Badge>}
                </div>

                <div className="text-sm font-semibold text-[var(--text-2)] truncate">{o.customer_name}</div>

                {o.delivery_address && (
                  <div className="flex items-start gap-1 mt-0.5 text-xs text-[var(--text-4)]">
                    <MapPin size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{o.delivery_address}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 text-xs">
                  {/* The only money a rider needs: what to collect, and
                      only when it is actually collectable on the doorstep. */}
                  {o.payment_method === 'cash_on_delivery' && o.payment_status !== 'paid' ? (
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Collect Rs. {Number(o.grand_total).toFixed(2)}
                    </span>
                  ) : (
                    <span className="font-medium text-[var(--text-4)]">Already paid</span>
                  )}

                  {o.status === 'delivered' && o.delivered_at && (
                    <span className="flex items-center gap-1 text-green-700 font-medium">
                      <CheckCircle2 size={12} />
                      {new Date(o.delivered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  {o.status === 'out_for_delivery' && o.delivery_arrived_at && (
                    <span className="flex items-center gap-1 text-brand font-medium">
                      <Truck size={12} /> Arrived
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight size={17} className="text-[var(--text-4)] mt-1 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
