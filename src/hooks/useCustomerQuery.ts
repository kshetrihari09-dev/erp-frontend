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
import { customerAuthAPI, customerProductsAPI, customerCartAPI, customerOrdersAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import useUIStore from '@/store/uiStore'

const unwrap = <T,>(res: { data: { data: T } }) => res.data.data
const unwrapPaginated = <T,>(res: { data: { data: T; pagination?: unknown } }) =>
  ({ data: res.data.data, pagination: (res.data as any).pagination })

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

// ─── Checkout / Orders ────────────────────────────────────────────────────
export function useCheckout() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (data: Parameters<typeof customerOrdersAPI.checkout>[0]) =>
      customerOrdersAPI.checkout(data).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-cart'] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      success('Order placed')
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

export function useCustomerOrder(id: string) {
  return useQuery({
    queryKey: ['customer-order', id],
    queryFn: () => customerOrdersAPI.get(id).then(unwrap),
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
