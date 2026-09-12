/**
 * AdminCustomerOrdersPage.tsx — Customer Product Ordering module (staff side).
 *
 * "Confirm" is the one action here that does real work server-side:
 * routes/adminCustomerOrders.js converts the order into an actual Sale
 * through the exact same createSaleHandler the Sale page itself uses —
 * nothing about that is reimplemented on this page, it just calls
 * PATCH .../status and shows whatever comes back (including the new
 * invoice number once the order becomes CONFIRMED).
 */
import { useState } from 'react'
import { Search, Package, ChevronRight, X } from 'lucide-react'
import { Tabs, SearchInput, Select, Empty, SkeletonRows, Pagination, Badge, Button, Modal, Input } from '@/components/ui'
import { useAdminCustomerOrders, useAdminCustomerOrder, useSetCustomerOrderStatus } from '@/hooks/useQuery'

const STATUS_FLOW = ['pending', 'confirmed', 'processing', 'ready', 'completed']
const NEXT_LABEL: Record<string, string> = {
  pending: 'Confirm', confirmed: 'Start Processing', processing: 'Mark Ready', ready: 'Mark Completed',
}

export default function AdminCustomerOrdersPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isLoading } = useAdminCustomerOrders({ status: status || undefined, search: search || undefined, page, limit: 20 })
  const orders = data?.data || []
  const pagination = data?.pagination as any

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-2">
        <Package size={20} className="text-brand" />
        <h1 className="text-lg font-bold text-[var(--text)]">Customer Orders</h1>
      </div>

      <Tabs
        tabs={[
          { id: '', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'confirmed', label: 'Confirmed' },
          { id: 'processing', label: 'Processing' }, { id: 'ready', label: 'Ready' },
          { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' },
        ]}
        active={status}
        onChange={(id) => { setStatus(id); setPage(1) }}
      />

      <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search order #, customer name, or phone…" />

      {isLoading ? (
        <SkeletonRows cols={1} rows={6} />
      ) : orders.length === 0 ? (
        <Empty icon={<Package size={28} />} message="No customer orders found." />
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o: any) => (
            <button
              key={o.id} onClick={() => setOpenId(o.id)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-left"
            >
              <div>
                <div className="text-sm font-bold">
                  {o.order_no} <span className="font-normal text-[var(--text-3)]">— {o.customer_name}</span>
                  {o.is_guest && <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 align-middle">Guest</span>}
                </div>
                <div className="text-xs text-[var(--text-4)]">{o.customer_phone} · {new Date(o.created_at).toLocaleString()}</div>
                <div className="text-sm font-extrabold mt-1">Rs. {Number(o.grand_total).toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={o.status}>{o.status.toUpperCase()}</Badge>
                <ChevronRight size={16} className="text-[var(--text-4)]" />
              </div>
            </button>
          ))}
        </div>
      )}

      {orders.length > 0 && pagination && (
        <Pagination page={pagination.page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      {openId && <OrderDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: order, isLoading } = useAdminCustomerOrder(id)
  const setStatusMut = useSetCustomerOrderStatus()
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  if (isLoading || !order) {
    return <Modal open onClose={onClose} title="Order"><SkeletonRows cols={1} rows={4} /></Modal>
  }

  const currentIdx = STATUS_FLOW.indexOf(order.status)
  const nextStatus = STATUS_FLOW[currentIdx + 1]
  const canAdvance = nextStatus && order.status !== 'cancelled'
  const canCancel = order.status !== 'completed' && order.status !== 'cancelled'

  return (
    <Modal open onClose={onClose} title={order.order_no} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold flex items-center gap-1.5">
              {order.customer_name}
              {order.is_guest && <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">Guest</span>}
            </div>
            <div className="text-xs text-[var(--text-4)]">{order.customer_phone}{order.customer_email ? ` · ${order.customer_email}` : ''}</div>
          </div>
          <Badge status={order.status}>{order.status.toUpperCase()}</Badge>
        </div>

        {order.is_guest && (
          <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This order was placed by a guest, with no account on file.
          </div>
        )}

        {order.sale_id && (
          <div className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Converted to a Sale — stock has been deducted.
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-b border-[var(--border)] py-3">
          {order.items.map((item: any) => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <div className="font-medium">{item.product_name_snapshot}</div>
                <div className="text-xs text-[var(--text-4)]">{item.quantity} {item.unit_snapshot} × Rs. {Number(item.unit_price).toFixed(2)}</div>
              </div>
              <span className="font-semibold">Rs. {Number(item.subtotal).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between text-base font-extrabold">
          <span>Total</span><span>Rs. {Number(order.grand_total).toFixed(2)}</span>
        </div>

        <div className="text-sm text-[var(--text-2)] flex flex-col gap-1">
          <div><span className="text-[var(--text-4)]">Fulfillment: </span>{order.fulfillment_type}</div>
          {order.delivery_address && <div><span className="text-[var(--text-4)]">Address: </span>{order.delivery_address}</div>}
          <div><span className="text-[var(--text-4)]">Payment: </span>{order.payment_method}</div>
          {order.cancel_reason && <div><span className="text-[var(--text-4)]">Cancel reason: </span>{order.cancel_reason}</div>}
        </div>

        {cancelling ? (
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Reason (optional)" value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCancelling(false)}>Back</Button>
              <Button
                variant="danger" size="sm" loading={setStatusMut.isPending}
                onClick={() => setStatusMut.mutate({ id: order.id, status: 'cancelled', cancel_reason: cancelReason }, { onSuccess: onClose })}
              >Confirm Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {canAdvance && (
              <Button
                variant="primary" loading={setStatusMut.isPending}
                onClick={() => setStatusMut.mutate({ id: order.id, status: nextStatus })}
              >{NEXT_LABEL[order.status]}</Button>
            )}
            {canCancel && (
              <Button variant="secondary" onClick={() => setCancelling(true)}>Cancel Order</Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
