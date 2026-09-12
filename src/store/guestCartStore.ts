/**
 * store/guestCartStore.ts — Customer Product Ordering module (guest checkout).
 *
 * A logged-in customer's cart is server-persisted (customer_cart_items —
 * see routes/customerCart.js): it survives across devices and always
 * reflects live price/availability because the server never lets a price
 * be written into it. A guest has no account for the server to key a
 * cart on, so — deliberately, per spec §14's "if guest checkout would
 * require major changes, do not implement it now" — no guest-identity/
 * session concept was invented for this. Instead the guest cart is just
 * {product_id, quantity} pairs held in the browser (this store), and
 * price/availability are re-fetched live from POST /customer-cart/preview
 * (routes/customerCart.js) every time it's read — see
 * hooks/useCustomerQuery.ts's useGuestCartPreview(). The cart NEVER
 * stores a price itself, same discipline as the server-side cart.
 *
 * Cleared automatically once a guest's order is actually placed
 * (CustomerCheckoutPage.tsx, on success) or once they log in/register
 * (their real cart takes over from that point).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GuestCartItem {
  product_id: string
  quantity: number
}

interface GuestCartState {
  items: GuestCartItem[]
  addItem: (productId: string, quantity: number) => void
  setQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  clear: () => void
}

const useGuestCartStore = create<GuestCartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (product_id, quantity) => set((s) => {
        const existing = s.items.find(i => i.product_id === product_id)
        if (existing) {
          return { items: s.items.map(i => i.product_id === product_id ? { ...i, quantity: i.quantity + quantity } : i) }
        }
        return { items: [...s.items, { product_id, quantity }] }
      }),
      setQuantity: (product_id, quantity) => set((s) => {
        if (quantity <= 0) return { items: s.items.filter(i => i.product_id !== product_id) }
        return { items: s.items.map(i => i.product_id === product_id ? { ...i, quantity } : i) }
      }),
      removeItem: (product_id) => set((s) => ({ items: s.items.filter(i => i.product_id !== product_id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'erp_guest_cart' },
  ),
)

export default useGuestCartStore
