import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Minus, ImageOff } from 'lucide-react'
import { Spinner, Button, Empty } from '@/components/ui'
import { useCustomerProduct, useActiveCart, useCartActions } from '@/hooks/useCustomerQuery'

export default function CustomerProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: product, isLoading, isError } = useCustomerProduct(id!)
  const { data: cart } = useActiveCart()
  const { addItem, setQuantity, isBusy } = useCartActions()
  const [imgError, setImgError] = useState(false)

  const cartItem = cart?.items?.find((i: any) => i.product_id === id)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (product) setQty(cartItem?.quantity || product.min_qty || 1)
  }, [product?.id, cartItem?.quantity]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (isError || !product) return <Empty icon="📦" message="Product not found." />

  const step = product.qty_step || 1
  // See CustomerProductCard.tsx — `mrp` isn't returned by the customer
  // catalog API today, so this stays dormant (no badge/strike-through)
  // until/unless that's wired up; never fabricated here.
  const hasDiscount = !!(product as any).mrp && (product as any).mrp > product.price
  const discountPct = hasDiscount ? Math.round((1 - product.price / (product as any).mrp) * 100) : 0

  function adjust(delta: number) {
    setQty(q => Math.max(product.min_qty, q + delta * step))
  }

  function handlePrimaryAction() {
    if (cartItem) setQuantity(product.id, cartItem.cart_item_id, qty, product.min_qty)
    else addItem(product.id, qty)
  }

  const actionLabel = !product.can_order ? 'Out of Stock' : cartItem ? 'Update Cart' : 'Add to Cart'

  return (
    <div className="pb-4 customer-pdp">
      {/* Mobile-only back button — unchanged from before. The desktop
       * breadcrumb below serves the same "way back" purpose there, so
       * this is hidden at the desktop breakpoint instead of doubling up. */}
      <button onClick={() => navigate(-1)} className="customer-pdp-back">
        <ChevronLeft size={16} /> Back
      </button>

      {/* Desktop-only breadcrumb (Home / Category / Product) — hidden on
       * mobile, where the back button above already covers this. Category
       * links to the home grid pre-filtered to it (CustomerHomePage.tsx
       * reads ?category= on mount) — reuses the exact same filtering
       * that already exists, nothing new. */}
      <nav className="customer-pdp-breadcrumb" aria-label="Breadcrumb">
        <Link to="/customer">Home</Link>
        {product.category && (
          <>
            <ChevronRight size={12} />
            <Link to={`/customer?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
          </>
        )}
        <ChevronRight size={12} />
        <span className="customer-pdp-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="customer-pdp-layout">
        <div className="customer-pdp-img">
          {hasDiscount && discountPct > 0 && (
            <span className="customer-card-discount-badge customer-pdp-discount-badge">{discountPct}%<br />OFF</span>
          )}
          {product.image_url && !imgError
            ? <img src={product.image_url} alt={product.name} onError={() => setImgError(true)} />
            : <ImageOff size={40} className="text-[var(--text-4)]" />}
        </div>

        <div className="customer-pdp-info">
          <h1 className="customer-pdp-name">{product.name}</h1>
          {product.unit && <span className="customer-pdp-packsize">{product.unit}</span>}

          <div className="customer-pdp-price-row">
            <span className="customer-pdp-price">Rs. {product.price.toFixed(2)}</span>
            {hasDiscount && <span className="customer-pdp-mrp">MRP Rs. {(product as any).mrp.toFixed(2)}</span>}
            {hasDiscount && discountPct > 0 && <span className="customer-pdp-discount-pill">{discountPct}% OFF</span>}
          </div>

          {product.stock_label && (
            <span className={`text-xs font-bold ${product.stock_label === 'Out of Stock' ? 'text-red-600' : 'text-green-600'}`}>
              {product.stock_label}
            </span>
          )}

          {product.description && <p className="text-sm text-[var(--text-2)] leading-relaxed mt-1">{product.description}</p>}

          <div className="customer-pdp-action">
            {product.can_order && (
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-[var(--text-2)]">Quantity</span>
                <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
                  <button onClick={() => adjust(-1)} aria-label="Decrease quantity" className="w-9 h-9 flex items-center justify-center hover:bg-[var(--surface-2)]"><Minus size={14} /></button>
                  <span className="w-10 text-center text-sm font-bold" aria-live="polite">{qty}</span>
                  <button onClick={() => adjust(1)} aria-label="Increase quantity" className="w-9 h-9 flex items-center justify-center hover:bg-[var(--surface-2)]"><Plus size={14} /></button>
                </div>
              </div>
            )}

            <Button
              variant="primary" className="customer-pdp-addbtn" loading={isBusy} disabled={!product.can_order}
              onClick={handlePrimaryAction} aria-label={`${actionLabel} — ${product.name}`}
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
