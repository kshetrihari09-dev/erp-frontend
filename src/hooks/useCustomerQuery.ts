/**
 * hooks/useCustomerQuery.ts — Customer Product Ordering module.
 *
 * Separate from hooks/useQuery.ts on purpose: different axios instance
 * (customerHttp, not http), different auth (customerAuthAPI, never
 * authAPI), and a completely separate React Query cache namespace (all
 * keys prefixed 'customer-') so nothing here can collide with or
 * accidentally invalidate staff-side cached data, or vice versa.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { customerAuthAPI, customerProductsAPI, customerCartAPI, customerOrdersAPI, storefrontAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import useGuestCartStore from '@/store/guestCartStore'
import useUIStore from '@/store/uiStore'

const unwrap = <T,>(res: { data: { data: T } }) => res.data.data
const unwrapPaginated = <T,>(res: { data: { data: T; pagination?: unknown } }) =>
  ({ data: res.data.data, pagination: (res.data as any).pagination })

export interface StorefrontListing { name: string; logo: string | null; address: string | null; storefront_code: string }

// ─── Store selection (customer landing / "Change Store") ───────────────────
export function useStoreList(q: string) {
  return useQuery({
    queryKey: ['storefront-list', q],
    // /storefront/list responds { success, stores: [...] } — no `.data`
    // wrapper, same shape as /storefront/config's `{ success, store }`
    // (see StorefrontContext.tsx), so this reads res.data.stores directly
    // rather than through the customer-auth-API `unwrap` convention.
    queryFn: () => storefrontAPI.list(q ? { q } : undefined).then(res => (res.data as any).stores as StorefrontListing[]),
    placeholderData: keepPreviousData,
  })
}

// ─── Catalog ────────────────────────────────────────────────────────────────
export function useCustomerProducts(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ['customer-products', params],
    queryFn: () => customerProductsAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerProduct(id: string) {
  return useQuery({
    queryKey: ['customer-product', id],
    queryFn: () => customerProductsAPI.get(id).then(unwrap),
    enabled: !!id,
  })
}

export function useCustomerCategories() {
  return useQuery({
    queryKey: ['customer-categories'],
    queryFn: () => customerProductsAPI.categories().then(unwrap),
    staleTime: 5 * 60_000,
  })
}

// ─── Cart ───────────────────────────────────────────────────────────────────
export function useCustomerCart() {
  return useQuery({
    queryKey: ['customer-cart'],
    queryFn: () => customerCartAPI.list().then(unwrap),
  })
}

const EMPTY_CART = { items: [] as any[], has_issues: false, subtotal: 0, discount_amount: 0, tax_amount: 0 }

/** Guest checkout's read of the cart — see store/guestCartStore.ts. No
 *  server-side row to read; this re-prices/re-validates the browser-held
 *  {product_id, quantity} list on every call, same shape as
 *  useCustomerCart() so CustomerCartPage/CustomerCheckoutPage don't need
 *  to know which one they're looking at. */
export function useGuestCartPreview() {
  const guestItems = useGuestCartStore(s => s.items)
  const query = useQuery({
    queryKey: ['guest-cart-preview', guestItems],
    queryFn: () => customerCartAPI.preview(guestItems).then(unwrap),
    enabled: guestItems.length > 0,
    placeholderData: keepPreviousData,
  })
  return guestItems.length > 0 ? query : { ...query, data: EMPTY_CART, isLoading: false, isPending: false }
}

/** Which cart is "the" cart right now — a logged-in customer's persisted
 *  one, or the guest's browser-held one — so pages that show a cart
 *  (CustomerLayout's badge, CustomerCartPage, CustomerCheckoutPage)
 *  don't each re-implement this branch. */
export function useActiveCart() {
  const isLoggedIn = !!useCustomerAuthStore(s => s.customer)
  const customerCart = useCustomerCart()
  const guestCart = useGuestCartPreview()
  return isLoggedIn
    ? { ...customerCart, isGuest: false as const }
    : { ...guestCart, isGuest: true as const }
}

function useCartMutation<TArgs>(fn: (args: TArgs) => Promise<any>) {
  const qc = useQueryClient()
  const { error } = useUIStore()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => qc.setQueryData(['customer-cart'], data),
    onError: (e: { message: string }) => error('Could not update cart', e.message),
  })
}

export function useAddToCart() {
  return useCartMutation(({ productId, quantity }: { productId: string; quantity: number }) =>
    customerCartAPI.add(productId, quantity).then(unwrap))
}
export function useUpdateCartItem() {
  return useCartMutation(({ itemId, quantity }: { itemId: string; quantity: number }) =>
    customerCartAPI.update(itemId, quantity).then(unwrap))
}
export function useRemoveCartItem() {
  return useCartMutation((itemId: string) => customerCartAPI.remove(itemId).then(unwrap))
}
export function useClearCart() {
  return useCartMutation(() => customerCartAPI.clear().then(unwrap))
}

/** Add/step/remove/clear by product_id, working the same way whether the
 *  active cart is the logged-in customer's persisted one or the guest's
 *  browser-held one (store/guestCartStore.ts) — CustomerProductCard.tsx,
 *  CustomerProductDetailPage.tsx, and CustomerCartPage.tsx all just call
 *  this rather than branching on auth state themselves. The guest branch
 *  is synchronous local state, so `isBusy` only ever reflects the
 *  logged-in-customer network calls. */
export function useCartActions() {
  const isLoggedIn = !!useCustomerAuthStore(s => s.customer)
  const addToCart = useAddToCart()
  const updateItem = useUpdateCartItem()
  const removeCartItem = useRemoveCartItem()
  const clearCart = useClearCart()
  const guest = useGuestCartStore()

  function removeItem(productId: string, cartItemId: string | null) {
    if (isLoggedIn) { if (cartItemId) removeCartItem.mutate(cartItemId) }
    else guest.removeItem(productId)
  }

  return {
    isBusy: isLoggedIn && (addToCart.isPending || updateItem.isPending || removeCartItem.isPending),
    addItem(productId: string, quantity: number) {
      if (isLoggedIn) addToCart.mutate({ productId, quantity })
      else guest.addItem(productId, quantity)
    },
    /** cartItemId is only meaningful for a logged-in customer's persisted
     *  cart row — pass whatever CustomerCartPage/Card already has (null
     *  for a guest, who's keyed by product_id alone). */
    setQuantity(productId: string, cartItemId: string | null, quantity: number, minQty: number) {
      if (quantity < minQty) { removeItem(productId, cartItemId); return }
      if (isLoggedIn) { if (cartItemId) updateItem.mutate({ itemId: cartItemId, quantity }) }
      else guest.setQuantity(productId, quantity)
    },
    removeItem,
    clear() {
      if (isLoggedIn) clearCart.mutate(undefined)
      else guest.clear()
    },
  }
}

// ─── Checkout / Orders ────────────────────────────────────────────────────
export function useCheckout() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  const clearGuestCart = useGuestCartStore(s => s.clear)
  return useMutation({
    mutationFn: (data: Parameters<typeof customerOrdersAPI.checkout>[0]) =>
      customerOrdersAPI.checkout(data).then(unwrap),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['customer-cart'] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      clearGuestCart() // no-op for a logged-in customer, who has nothing in it
      success('Order placed', data?.order_no ? `Order #${data.order_no}` : undefined)
    },
    onError: (e: { message: string; problems?: unknown }) => error('Could not place order', e.message),
  })
}

export function useCustomerOrders(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['customer-orders', params],
    queryFn: () => customerOrdersAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

/**
 * One order, as routes/customerOrders.js's GET /:id returns it.
 *
 * Typed explicitly because `unwrap` is generic over a parameter these
 * hooks never supplied, so every consumer was reading an untyped `{}`
 * and reaching for properties TypeScript could not see. The delivery
 * fields would have compounded that, so the shape is written down here
 * instead.
 *
 * `delivery_otp` is optional on purpose, and that is the type mirroring
 * a real backend guarantee rather than laziness: the server omits the
 * field entirely at every stage except out_for_delivery, so a component
 * is forced to narrow before rendering it and cannot show a code that
 * was never sent.
 */
export interface CustomerOrderDetail {
  id: string
  order_no: string
  status: 'pending' | 'confirmed' | 'processing' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled'
  fulfillment_type: 'pickup' | 'delivery'
  payment_method: 'cash_on_delivery' | 'pay_at_store'
  payment_status: 'unpaid' | 'paid'
  delivery_address: string | null
  delivery_notes: string | null
  cancel_reason: string | null
  subtotal: number | string
  discount_amount: number | string
  tax_amount: number | string
  delivery_charge: number | string
  grand_total: number | string
  created_at: string
  items: {
    id: string
    product_name_snapshot: string
    unit_snapshot: string | null
    unit_price: number | string
    quantity: number | string
    subtotal: number | string
  }[]

  // ── Delivery verification (migration 038) ──
  /** Present ONLY while status === 'out_for_delivery'. */
  delivery_otp?: string
  delivery_otp_expires_at?: string
  /** Set when a code was issued but can no longer be shown (expired). */
  delivery_otp_unavailable?: boolean
  delivery_otp_verified_at: string | null
  /** Display name only — never an id (spec §24). */
  delivery_partner_name: string | null
  delivery_partner_phone: string | null
}

export function useCustomerOrder(id: string) {
  return useQuery({
    queryKey: ['customer-order', id],
    queryFn: () => customerOrdersAPI.get(id).then(unwrap<CustomerOrderDetail>),
    enabled: !!id,
  })
}

// ─── Profile ────────────────────────────────────────────────────────────────
export function useUpdateCustomerProfile() {
  const updateCustomer = useCustomerAuthStore(s => s.updateCustomer)
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (data: { name?: string; email?: string; address?: string }) =>
      customerAuthAPI.updateProfile(data).then(unwrap),
    onSuccess: (data) => { updateCustomer(data); success('Profile updated') },
    onError: (e: { message: string }) => error('Could not update profile', e.message),
  })
}

export function useChangeCustomerPassword() {
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) => customerAuthAPI.changePassword(data),
    onSuccess: () => success('Password updated'),
    onError: (e: { message: string }) => error('Could not update password', e.message),
  })
}
