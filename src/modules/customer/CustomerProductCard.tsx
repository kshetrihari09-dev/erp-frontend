import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Minus, ImageOff } from 'lucide-react'
import { useCartActions } from '@/hooks/useCustomerQuery'
import { Button } from '@/components/ui'

export interface CatalogCard {
  id: string; name: string; unit: string; category: string | null
  image_url: string | null; price: number; unit_label: string
  stock_label: string | null; in_stock: boolean; can_order: boolean
  min_qty: number; max_qty: number | null; qty_step: number
}

function stockClass(label: string | null) {
  if (!label) return ''
  if (label === 'Out of Stock') return 'customer-card-stock--out'
  if (label.toLowerCase().includes('backorder')) return 'customer-card-stock--low'
  return 'customer-card-stock--ok'
}

export default function CustomerProductCard({ product, cartItem }: {
  product: CatalogCard
  cartItem?: { cart_item_id: string | null; quantity: number } | null
}) {
  const { addItem, setQuantity, isBusy } = useCartActions()
  const [imgError, setImgError] = useState(false)

  function handleAdd() {
    addItem(product.id, product.min_qty || 1)
  }
  function handleStep(delta: number) {
    if (!cartItem) return
    const next = cartItem.quantity + delta * product.qty_step
    setQuantity(product.id, cartItem.cart_item_id, next, product.min_qty)
  }

  return (
    <div className="customer-card">
      <Link to={`/customer/products/${product.id}`} className="customer-card-img">
        {product.image_url && !imgError
          ? <img src={product.image_url} alt={product.name} loading="lazy" onError={() => setImgError(true)} />
          : <ImageOff size={22} />}
      </Link>
      <div className="customer-card-body">
        <Link to={`/customer/products/${product.id}`} className="customer-card-name">{product.name}</Link>
        <div>
          <span className="customer-card-price">Rs. {product.price.toFixed(0)}</span>{' '}
          <span className="customer-card-unit">{product.unit_label}</span>
        </div>
        {product.stock_label && <span className={`customer-card-stock ${stockClass(product.stock_label)}`}>{product.stock_label}</span>}

        {!product.can_order ? (
          <Button variant="secondary" size="sm" disabled className="mt-1">Unavailable</Button>
        ) : cartItem ? (
          <div className="flex items-center justify-between mt-1 border border-[var(--border)] rounded-lg overflow-hidden">
            <button onClick={() => handleStep(-1)} disabled={isBusy} className="flex-1 h-7 flex items-center justify-center hover:bg-[var(--surface-2)]"><Minus size={13} /></button>
            <span className="text-xs font-bold px-2">{cartItem.quantity}</span>
            <button onClick={() => handleStep(1)} disabled={isBusy} className="flex-1 h-7 flex items-center justify-center hover:bg-[var(--surface-2)]"><Plus size={13} /></button>
          </div>
        ) : (
          <Button variant="primary" size="sm" onClick={handleAdd} disabled={isBusy} className="mt-1">Add</Button>
        )}
      </div>
    </div>
  )
}
