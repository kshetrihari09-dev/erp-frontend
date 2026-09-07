/**
 * router/customerGuards.tsx — Customer Product Ordering module.
 *
 * Mirrors router/guards.tsx's RequireAuth/RequireGuest shape, but
 * simpler on purpose: the staff guard's offline-fallback logic exists
 * because billing must keep working through a connectivity outage
 * (offline/syncEngine.ts). Browsing a storefront and checking out has no
 * such requirement — it needs the network anyway — so this validates
 * against /customer-auth/me on every mount and, if that fails for any
 * reason (expired token, disabled account, or simply no connection),
 * sends the customer to login rather than guessing whether a stale
 * persisted session is still good.
 */
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useCustomerAuthStore, { CUSTOMER_RAW_TOKEN_KEY } from '@/store/customerAuthStore'
import { customerAuthAPI } from '@/services/customerApi'
import { Spinner } from '@/components/ui'

export function RequireCustomerAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout, updateCustomer } = useCustomerAuthStore()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)

  useEffect(() => {
    const rawToken = localStorage.getItem(CUSTOMER_RAW_TOKEN_KEY)
    if (!rawToken || rawToken === 'null') { setChecking(false); setValid(false); return }

    customerAuthAPI.me()
      .then((res) => { updateCustomer(res.data.data); setValid(true) })
      .catch(() => { logout(); setValid(false) })
      .finally(() => setChecking(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size={28} className="text-brand" />
      </div>
    )
  }
  if (!valid || !isAuthenticated) {
    return <Navigate to="/customer/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

export function RequireCustomerGuest({ children }: { children: React.ReactNode }) {
  const rawToken = localStorage.getItem(CUSTOMER_RAW_TOKEN_KEY)
  const isAuthenticated = useCustomerAuthStore((s) => s.isAuthenticated)
  if (rawToken && rawToken !== 'null' && isAuthenticated) {
    return <Navigate to="/customer" replace />
  }
  return <>{children}</>
}
