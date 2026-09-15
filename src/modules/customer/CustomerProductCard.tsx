import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Minus, ImageOff } from 'lucide-react'
import { useCartActions } from '@/hooks/useCustomerQuery'
import { Skeleton } from '@/components/ui'

export interface CatalogCard {
  id: string; name: string; unit: string; category: string | null
  image_url: string | null; price: number; unit_label: string
  stock_label: string | null; in_stock: boolean; can_order: boolean
  min_qty: number; max_qty: number | null; qty_step: number
  // Not currently returned by the customer catalog API (routes/
  // customerProducts.js → customerCatalogService.js's toCatalogCard) even
  // though `products.mrp` exists in the database — see the desktop-card
  // redesign notes. Optional and unused until/unless that's wired up; the
  // discount badge and MRP strike-through below simply render nothing
  // while this stays undefined, exactly per spec ("no valid MRP
  // difference → don't show a meaningless crossed-out price").
  mrp?: number | null
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

  const hasDiscount = !!product.mrp && product.mrp > product.price
  const discountPct = hasDiscount ? Math.round((1 - product.price / (product.mrp as number)) * 100) : 0

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
      <Link to={`/customer/products/${product.id}`} className="customer-card-img" aria-label={`View ${product.name}`}>
        {hasDiscount && discountPct > 0 && (
          <span className="customer-card-discount-badge">{discountPct}%<br />OFF</span>
        )}
        {product.image_url && !imgError
          ? <img src={product.image_url} alt={product.name} loading="lazy" onError={() => setImgError(true)} />
          : <ImageOff size={22} aria-hidden="true" />}
      </Link>
      <div className="customer-card-body">
        <Link to={`/customer/products/${product.id}`} className="customer-card-name">{product.name}</Link>
        {product.unit && <span className="customer-card-packsize">{product.unit}</span>}

        {product.stock_label && <span className={`customer-card-stock ${stockClass(product.stock_label)}`}>{product.stock_label}</span>}

        <div className="customer-card-footer">
          <div className="customer-card-price-block">
            <span className="customer-card-price">Rs. {product.price.toFixed(0)}</span>
            {hasDiscount
              ? <span className="customer-card-mrp">Rs. {(product.mrp as number).toFixed(0)}</span>
              : <span className="customer-card-unit">{product.unit_label}</span>}
          </div>

          {!product.can_order ? (
            <button type="button" disabled className="customer-card-addbtn customer-card-addbtn--oos" aria-label={`${product.name} is out of stock`}>
              Out of Stock
            </button>
          ) : cartItem ? (
            <div className="customer-card-stepper" role="group" aria-label={`Quantity for ${product.name}`}>
              <button onClick={() => handleStep(-1)} disabled={isBusy} aria-label="Decrease quantity" className="customer-card-stepper-btn"><Minus size={13} /></button>
              <span className="customer-card-stepper-qty" aria-live="polite">{cartItem.quantity}</span>
              <button onClick={() => handleStep(1)} disabled={isBusy} aria-label="Increase quantity" className="customer-card-stepper-btn"><Plus size={13} /></button>
            </div>
          ) : (
            <button type="button" onClick={handleAdd} disabled={isBusy} className="customer-card-addbtn" aria-label={`Add ${product.name} to cart`}>
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Loading placeholder — same DOM shape/classes as the real card (spec
 *  §21) so the grid never shows empty white boxes or shifts layout once
 *  real data arrives. Used by CustomerHomePage.tsx while products load. */
export function CustomerProductCardSkeleton() {
  return (
    <div className="customer-card customer-card-skeleton" aria-hidden="true">
      <div className="customer-card-img"><Skeleton w="60%" h={60} /></div>
      <div className="customer-card-body">
        <Skeleton w="90%" h={12} />
        <Skeleton w="55%" h={11} />
        <div className="customer-card-footer">
          <Skeleton w={50} h={16} />
          <Skeleton w={54} h={26} />
        </div>
      </div>
    </div>
  )
}
