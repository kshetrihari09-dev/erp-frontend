/**
 * store/customerAuthStore.ts — Customer Product Ordering module.
 *
 * Deliberately a parallel structure to store/authStore.ts, not a shared
 * one: a customer and a staff member are different kinds of principal
 * (see middleware/customerAuth.js's docblock on the backend side for the
 * same reasoning), and this app can have a staff member and a customer
 * logged in via the SAME browser at the same time on two different tabs
 * — sharing one store/token-key would make that impossible and risk one
 * session silently clobbering the other.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Distinct keys from authStore.ts's RAW_TOKEN_KEY/'erp_auth_state' — no
// collision possible even if both are open in the same browser.
export const CUSTOMER_RAW_TOKEN_KEY = 'erp_customer_raw_token'

export interface CustomerSession {
  id: string
  name: string
  phone: string
  email: string | null
  address?: string | null
}

interface CustomerAuthState {
  token:           string | null
  customer:        CustomerSession | null
  companyId:       string | null
  isAuthenticated: boolean
  setAuth:     (p: { token: string; customer: CustomerSession; companyId: string }) => void
  updateCustomer: (customer: Partial<CustomerSession>) => void
  logout:      () => void
}

const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set) => ({
      token: null, customer: null, companyId: null, isAuthenticated: false,

      setAuth: ({ token, customer, companyId }) => {
        localStorage.setItem(CUSTOMER_RAW_TOKEN_KEY, token)
        set({ token, customer, companyId, isAuthenticated: true })
      },

      updateCustomer: (partial) =>
        set((s) => ({ customer: s.customer ? { ...s.customer, ...partial } : null })),

      logout: () => {
        localStorage.removeItem(CUSTOMER_RAW_TOKEN_KEY)
        set({ token: null, customer: null, companyId: null, isAuthenticated: false })
      },
    }),
    {
      name: 'erp_customer_auth_state',
      partialize: (s) => ({ token: s.token, customer: s.customer, companyId: s.companyId, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state?.token && !localStorage.getItem(CUSTOMER_RAW_TOKEN_KEY)) {
          localStorage.setItem(CUSTOMER_RAW_TOKEN_KEY, state.token)
        }
      },
    },
  ),
)

export default useCustomerAuthStore
