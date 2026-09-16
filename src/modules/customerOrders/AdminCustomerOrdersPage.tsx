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
import { Search, Package, ChevronRight, X, Truck, ShieldCheck, ShieldAlert, Clock } from 'lucide-react'
import { Tabs, SearchInput, Select, Empty, SkeletonRows, Pagination, Badge, Button, Modal, Input } from '@/components/ui'
import {
  useAdminCustomerOrders, useAdminCustomerOrder, useSetCustomerOrderStatus,
  useDeliveryPartners, useAssignDeliveryPartner, useOverrideDelivery,
} from '@/hooks/useQuery'
import useAuthStore from '@/store/authStore'

/* ── Status flow (mirrors routes/adminCustomerOrders.js) ──────────────────
 * Two branches on fulfillment_type. The important asymmetry: the
 * delivery branch's last step, `delivered`, is NOT reachable from this
 * screen. The backend returns 403 for it, because a delivery is only
 * completed by a rider passing OTP verification or by an explicit,
 * audited override — leaving it as an ordinary "next status" button
 * would hand every staff account a one-click bypass of the whole
 * feature. So NEXT_LABEL has no entry for out_for_delivery, and
 * canAdvance below goes false there. */
const PICKUP_FLOW   = ['pending', 'confirmed', 'processing', 'ready', 'completed']
const DELIVERY_FLOW = ['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered']
const STATUS_FLOW   = PICKUP_FLOW

const NEXT_LABEL: Record<string, string> = {
  pending: 'Confirm', confirmed: 'Start Processing', processing: 'Mark Ready', ready: 'Mark Completed',
}
const DELIVERY_NEXT_LABEL: Record<string, string> = {
  pending: 'Confirm', confirmed: 'Start Processing', processing: 'Mark Packed', ready: 'Send Out for Delivery',
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
          { id: 'out_for_delivery', label: 'Out for Delivery' }, { id: 'delivered', label: 'Delivered' },
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
                {o.delivery_partner_name && (
                  <div className="flex items-center gap-1 text-xs text-[var(--text-3)] mt-0.5">
                    <Truck size={11} /> {o.delivery_partner_name}
                  </div>
                )}
                <div className="text-sm font-extrabold mt-1">Rs. {Number(o.grand_total).toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={o.status}>{String(o.status).replace(/_/g, ' ').toUpperCase()}</Badge>
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
  const assignMut = useAssignDeliveryPartner()
  const overrideMut = useOverrideDelivery()
  const isOwnerOrAdmin = useAuthStore(s => s.user?.role === 'admin' || s.user?.role === 'owner')

  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const isDelivery = order?.fulfillment_type === 'delivery'
  // Only fetch the rider list when there is actually a rider to assign.
  const { data: partners = [] } = useDeliveryPartners(!!order && isDelivery)

  if (isLoading || !order) {
    return <Modal open onClose={onClose} title="Order"><SkeletonRows cols={1} rows={4} /></Modal>
  }

  const flow = isDelivery ? DELIVERY_FLOW : PICKUP_FLOW
  const labels = isDelivery ? DELIVERY_NEXT_LABEL : NEXT_LABEL
  const currentIdx = flow.indexOf(order.status)
  const nextStatus = flow[currentIdx + 1]

  // `delivered` is intentionally unreachable from here — see the
  // NEXT_LABEL comment at the top of this file.
  const canAdvance = !!nextStatus && nextStatus !== 'delivered' && order.status !== 'cancelled'
  const isTerminal = ['completed', 'delivered', 'cancelled'].includes(order.status)
  const canCancel = !isTerminal

  // Dispatching requires a rider, and the backend rejects it without one.
  // Blocking the button here too means the staff member finds out before
  // they tap, not after.
  const needsPartner = isDelivery && nextStatus === 'out_for_delivery' && !order.assigned_delivery_partner_id

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
          <Badge status={order.status}>{String(order.status).replace(/_/g, ' ').toUpperCase()}</Badge>
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

        {/* ── Delivery panel ────────────────────────────────────────────
            Note what this panel never contains: the delivery code. Staff
            see its STATUS (issued / pending / verified / locked) and
            nothing more (spec §19) — the backend has no endpoint that
            would return the code to a staff token, so there is nothing
            for this UI to render even by mistake. A code readable from
            the back office is a code that can be phoned to a rider who
            never reached the customer. */}
        {isDelivery && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-4)]">
              <Truck size={13} /> Delivery
            </div>

            {/* Assignment. Reassignment stays available right up until
                delivery, and deliberately does not reissue the code — the
                code belongs to the customer, not the rider. */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-3)]">Delivery partner</label>
              {isTerminal ? (
                <div className="text-sm font-semibold">{order.delivery_partner_name || '—'}</div>
              ) : (
                <Select
                  value={order.assigned_delivery_partner_id || ''}
                  disabled={assignMut.isPending}
                  placeholder="— Unassigned —"
                  options={partners.map((p: any) => ({
                    value: p.id,
                    label: p.phone ? `${p.name} · ${p.phone}` : p.name,
                  }))}
                  onChange={(e) => assignMut.mutate({
                    id: order.id,
                    delivery_partner_id: e.target.value || null,
                  })}
                />
              )}
              {partners.length === 0 && !isTerminal && (
                <p className="text-[11px] text-amber-700">
                  No delivery partners yet — add a user with the Delivery Partner role in Settings → Users.
                </p>
              )}
            </div>

            {/* OTP status */}
            {order.otp_issued && (
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-4)] font-semibold">OTP status:</span>
                  {order.otp_verified ? (
                    <span className="flex items-center gap-1 font-bold text-green-700">
                      <ShieldCheck size={12} /> Verified
                    </span>
                  ) : order.otp_locked ? (
                    <span className="flex items-center gap-1 font-bold text-red-700">
                      <ShieldAlert size={12} /> Locked — too many attempts
                    </span>
                  ) : order.otp_expired ? (
                    <span className="flex items-center gap-1 font-bold text-amber-700">
                      <Clock size={12} /> Expired
                    </span>
                  ) : (
                    <span className="font-bold text-[var(--text-2)]">Pending verification</span>
                  )}
                </div>

                {order.otp_verified && order.otp_verified_at && (
                  <div>
                    <span className="text-[var(--text-4)]">Verified at: </span>
                    {new Date(order.otp_verified_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {order.delivery_partner_name && (
                      <>
                        <span className="text-[var(--text-4)]"> · by </span>
                        {order.delivery_verification_method === 'override' ? 'Store override' : order.delivery_partner_name}
                      </>
                    )}
                  </div>
                )}

                {order.otp_attempts > 0 && !order.otp_verified && (
                  <div className="text-[var(--text-4)]">
                    {order.otp_attempts} failed attempt{order.otp_attempts === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            )}

            {order.delivery_verification_method === 'override' && (
              <div className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                Completed by override{order.delivery_override_reason ? `: ${order.delivery_override_reason}` : '.'}
              </div>
            )}

            {/* ── Override ──────────────────────────────────────────────
                Owner/admin only, and gated again on the server — a
                cashier or a delivery partner cannot reach this endpoint
                whatever the UI shows. Requires a reason, and writes an
                audit row flagged suspicious so overrides are findable. */}
            {order.status === 'out_for_delivery' && isOwnerOrAdmin && (
              overriding ? (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Reason (e.g. customer phone unavailable)"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                  />
                  <p className="text-[11px] text-[var(--text-4)]">
                    This completes the delivery without the customer's code, and is recorded in the audit log.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setOverriding(false)}>Back</Button>
                    <Button
                      variant="danger" size="sm"
                      loading={overrideMut.isPending}
                      disabled={overrideReason.trim().length < 5}
                      onClick={() => overrideMut.mutate(
                        { id: order.id, reason: overrideReason.trim() },
                        { onSuccess: () => { setOverriding(false); setOverrideReason('') } },
                      )}
                    >Override Verification</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setOverriding(true)}
                  className="text-xs font-semibold text-[var(--text-4)] hover:text-red-700 text-left"
                >
                  Override delivery verification…
                </button>
              )
            )}
          </div>
        )}

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
                disabled={needsPartner}
                title={needsPartner ? 'Assign a delivery partner first' : undefined}
                onClick={() => setStatusMut.mutate({ id: order.id, status: nextStatus })}
              >{labels[order.status] || 'Advance'}</Button>
            )}
            {/* An out-for-delivery order has no staff-side next step at
                all — it is waiting on the rider and the customer's code. */}
            {isDelivery && order.status === 'out_for_delivery' && (
              <span className="text-xs font-medium text-[var(--text-4)] self-center">
                Waiting for delivery verification
              </span>
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
