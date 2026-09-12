/**
 * services/customerHttp.ts — Customer Product Ordering module.
 *
 * A second, independent axios instance rather than reusing services/http.ts:
 * that instance's request interceptor reads RAW_TOKEN_KEY (the STAFF
 * token) and its 401 handling runs the staff refresh-token flow. Sharing
 * it would mean either a customer's requests silently carrying a staff
 * Bearer token (if both happen to be logged in on the same device) or
 * vice versa — exactly the cross-contamination the backend's
 * authenticate/authenticateCustomer split (middleware/index.js /
 * middleware/customerAuth.js) is designed to make impossible. Simpler
 * than http.ts on purpose: customer tokens are long-lived (30 days, no
 * refresh endpoint — see middleware/customerAuth.js), so there's no
 * refresh-subscriber queue to replicate here, just attach-token and
 * handle-401.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { config } from '@/config/env'
import { CUSTOMER_RAW_TOKEN_KEY } from '@/store/customerAuthStore'

const customerHttp = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: config.apiTimeout,
  headers: { 'Content-Type': 'application/json' },
})

customerHttp.interceptors.request.use((config_: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(CUSTOMER_RAW_TOKEN_KEY)
  if (token && token !== 'null') config_.headers.Authorization = `Bearer ${token}`
  return config_
})

customerHttp.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string; code?: string }>) => {
    const status     = error.response?.status
    const rawMessage = error.response?.data?.message || error.message || 'Network error'

    if (status === 401) {
      localStorage.removeItem(CUSTOMER_RAW_TOKEN_KEY)
      localStorage.removeItem('erp_customer_auth_state')
      if (!window.location.pathname.startsWith('/customer/login')) {
        // Preserve ?store=/?company= (StorefrontContext.tsx's resolution
        // params) across the redirect — a multi-tenant deployment with no
        // VITE_STOREFRONT_CODE baked in relies entirely on the URL, and a
        // session-expiry redirect must not silently drop the customer onto
        // an unconfigured storefront.
        window.location.href = `/customer/login${window.location.search}`
      }
    }

    return Promise.reject({ message: rawMessage, status, original: error })
  },
)

export default customerHttp
