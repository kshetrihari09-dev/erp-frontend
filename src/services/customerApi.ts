import customerHttp from './customerHttp'

type Params = Record<string, unknown>

// Public — no customer token required/sent (resolved before any customer
// is logged in). Backend: routes/storefront.js.
export const storefrontAPI = {
  config: (params: { store?: string; company?: string }) =>
    customerHttp.get('/storefront/config', { params }),
}

export const customerAuthAPI = {
  register: (data: { company_id: string; name: string; phone: string; password: string; email?: string; address?: string }) =>
    customerHttp.post('/customer-auth/register', data),
  login: (data: { company_id: string; login_identifier: string; password: string }) =>
    customerHttp.post('/customer-auth/login', data),
  me: () => customerHttp.get('/customer-auth/me'),
  updateProfile: (data: { name?: string; email?: string; address?: string }) =>
    customerHttp.patch('/customer-auth/profile', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    customerHttp.patch('/customer-auth/password', data),
}

export const customerProductsAPI = {
  list: (params?: Params) => customerHttp.get('/customer-products', { params }),
  categories: () => customerHttp.get('/customer-products/categories'),
  get: (id: string) => customerHttp.get(`/customer-products/${id}`),
}

export const customerCartAPI = {
  list: () => customerHttp.get('/customer-cart'),
  add: (product_id: string, quantity: number) => customerHttp.post('/customer-cart', { product_id, quantity }),
  update: (itemId: string, quantity: number) => customerHttp.patch(`/customer-cart/${itemId}`, { quantity }),
  remove: (itemId: string) => customerHttp.delete(`/customer-cart/${itemId}`),
  clear: () => customerHttp.delete('/customer-cart'),
  // Guest checkout (spec §14) — stateless equivalent of `list()`: prices/
  // validates whatever the browser-held guest cart currently holds,
  // nothing persisted server-side. See store/guestCartStore.ts.
  preview: (items: { product_id: string; quantity: number }[]) =>
    customerHttp.post('/customer-cart/preview', { items }),
}

export const customerOrdersAPI = {
  checkout: (data: {
    fulfillment_type: 'pickup' | 'delivery'
    delivery_address?: string; delivery_phone?: string; delivery_notes?: string
    payment_method: 'cash_on_delivery' | 'pay_at_store'
    notes?: string
    // Guest checkout only — omitted entirely for a logged-in customer,
    // who already has a persisted server-side cart the backend reads
    // instead (routes/customerOrders.js branches on req.customer).
    items?: { product_id: string; quantity: number }[]
    guest_name?: string
    guest_phone?: string
  }) => customerHttp.post('/customer-orders', data),
  list: (params?: Params) => customerHttp.get('/customer-orders', { params }),
  get: (id: string) => customerHttp.get(`/customer-orders/${id}`),
}
