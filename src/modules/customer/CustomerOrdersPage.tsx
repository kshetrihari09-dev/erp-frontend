import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Spinner, Empty, Badge, Button } from '@/components/ui'
import { useCustomerOrders } from '@/hooks/useCustomerQuery'

export default function CustomerOrdersPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useCustomerOrders({ limit: 30 })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (!data?.data?.length) {
    return (
      <Empty
        icon="🧾"
        message="No orders yet."
        action={<Button variant="primary" size="sm" onClick={() => navigate('/customer')}>Start Shopping</Button>}
      />
    )
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      {data.data.map((order: any) => (
        <Link
          key={order.id} to={`/customer/orders/${order.id}`}
          className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div>
            <div className="text-sm font-bold">{order.order_no}</div>
            <div className="text-xs text-[var(--text-4)] mt-0.5">{new Date(order.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-sm font-extrabold">Rs. {Number(order.grand_total).toFixed(2)}</span>
              {Array.isArray(order.items) && (
                <span className="text-[11px] text-[var(--text-4)] font-semibold">
                  {order.items.length} item{order.items.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={order.status}>{order.status.toUpperCase()}</Badge>
            <ChevronRight size={16} className="text-[var(--text-4)]" />
          </div>
        </Link>
      ))}
    </div>
  )
}
