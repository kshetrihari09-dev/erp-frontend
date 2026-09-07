import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Minus, ImageOff } from 'lucide-react'
import { Spinner, Button, Empty } from '@/components/ui'
import { useCustomerProduct, useCustomerCart, useAddToCart, useUpdateCartItem } from '@/hooks/useCustomerQuery'

export default function CustomerProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: product, isLoading, isError } = useCustomerProduct(id!)
  const { data: cart } = useCustomerCart()
  const addToCart = useAddToCart()
  const updateItem = useUpdateCartItem()
  const [imgError, setImgError] = useState(false)

  const cartItem = cart?.items?.find((i: any) => i.product_id === id)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (product) setQty(cartItem?.quantity || product.min_qty || 1)
  }, [product?.id, cartItem?.quantity]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size={26} className="text-brand" /></div>
  if (isError || !product) return <Empty icon="📦" message="Product not found." />

  const step = product.qty_step || 1
  function adjust(delta: number) {
    setQty(q => Math.max(product.min_qty, q + delta * step))
  }

  function handlePrimaryAction() {
    if (cartItem) updateItem.mutate({ itemId: cartItem.cart_item_id, quantity: qty })
    else addToCart.mutate({ productId: product.id, quantity: qty })
  }

  const busy = addToCart.isPending || updateItem.isPending

  return (
    <div className="pb-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-semibold text-[var(--text-2)] p-3">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="aspect-square bg-[var(--surface-3)] flex items-center justify-center mx-3 rounded-2xl overflow-hidden">
        {product.image_url && !imgError
          ? <img src={product.image_url} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover" />
          : <ImageOff size={40} className="text-[var(--text-4)]" />}
      </div>

      <div className="p-4 flex flex-col gap-2">
        <h1 className="text-base font-extrabold">{product.name}</h1>
        {product.category && <span className="text-xs text-[var(--text-4)] font-semibold">{product.category}</span>}

        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold text-brand">Rs. {product.price.toFixed(2)}</span>
          <span className="text-xs text-[var(--text-4)] font-semibold">{product.unit_label}</span>
        </div>

        {product.stock_label && (
          <span className={`text-xs font-bold ${product.stock_label === 'Out of Stock' ? 'text-red-600' : 'text-green-600'}`}>
            {product.stock_label}
          </span>
        )}

        {product.description && <p className="text-sm text-[var(--text-2)] leading-relaxed mt-1">{product.description}</p>}

        {product.can_order && (
          <div className="flex items-center gap-4 mt-4">
            <span className="text-sm font-semibold text-[var(--text-2)]">Quantity</span>
            <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
              <button onClick={() => adjust(-1)} className="w-9 h-9 flex items-center justify-center hover:bg-[var(--surface-2)]"><Minus size={14} /></button>
              <span className="w-10 text-center text-sm font-bold">{qty}</span>
              <button onClick={() => adjust(1)} className="w-9 h-9 flex items-center justify-center hover:bg-[var(--surface-2)]"><Plus size={14} /></button>
            </div>
          </div>
        )}

        <Button
          variant="primary" className="mt-4" loading={busy} disabled={!product.can_order}
          onClick={handlePrimaryAction}
        >
          {!product.can_order ? 'Unavailable' : cartItem ? 'Update Cart' : 'Add to Cart'}
        </Button>
      </div>
    </div>
  )
}
