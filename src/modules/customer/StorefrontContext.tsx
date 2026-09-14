/**
 * modules/customer/StorefrontContext.tsx — Company-Owned Customer
 * architecture (Phase 5).
 *
 * Single source of truth for "which company/store is this storefront"
 * (spec §5: "Do NOT let every page independently determine company_id.
 * There must be one source of truth"). Mounted once, above the whole
 * /customer/* route tree (see app/Router.tsx) — CustomerRegisterPage and
 * CustomerLoginPage (the only two pages that need company_id before a
 * JWT exists) both read it via useStorefront(); every page past login
 * gets its company scoping from the JWT instead (middleware/customerAuth.js
 * re-derives req.companyId server-side on every request, never trusting
 * the client again after login — see that file's docblock).
 *
 * Resolution order (spec §3), most-preferred first:
 *   1. `?store=<slug>`               — production mechanism, safe to put
 *                                       in a real URL/QR code.
 *   2. VITE_STOREFRONT_CODE           — same slug, baked in at build time
 *                                       for a single-store deployment.
 *   3. `?company=<uuid>`              — development/admin fallback only.
 *   4. VITE_STOREFRONT_COMPANY_ID     — legacy build-time UUID fallback.
 *
 * Either a slug or a UUID resolves through the same backend endpoint,
 * GET /storefront/config (routes/storefront.js) — that endpoint is the
 * only place a UUID ever needs to exist for this flow, and it never
 * appears in a URL a real customer sees when a slug is configured.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams, useLocation, Navigate } from 'react-router-dom'
import { config } from '@/config/env'
import { storefrontAPI } from '@/services/customerApi'
import { setGuestStorefrontCompanyId } from '@/services/customerHttp'
import { getRememberedStore } from './selectedStore'
import { Spinner, Button } from '@/components/ui'

export type StorefrontStatus = 'loading' | 'ok' | 'missing' | 'invalid' | 'error'

export interface StorefrontState {
  status: StorefrontStatus
  companyId: string
  name: string
  logo: string | null
  phone: string | null
  address: string | null
  storefrontCode: string | null
  /** Convenience for building same-store links without ever touching a UUID. */
  storeQuery: string
}

const initialState: StorefrontState = {
  status: 'loading',
  companyId: '',
  name: '',
  logo: null,
  phone: null,
  address: null,
  storefrontCode: null,
  storeQuery: '',
}

const StorefrontCtx = createContext<StorefrontState>(initialState)

export function StorefrontProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  const [state, setState] = useState<StorefrontState>(initialState)

  const storeSlug = (params.get('store') || config.storefrontCode || '').trim()
  const companyFallback = (params.get('company') || config.storefrontCompanyId || '').trim()

  useEffect(() => {
    let cancelled = false

    if (!storeSlug && !companyFallback) {
      setState({ ...initialState, status: 'missing' })
      return
    }

    setState((s) => ({ ...s, status: 'loading' }))

    const requestParams = storeSlug ? { store: storeSlug } : { company: companyFallback }
    storefrontAPI.config(requestParams)
      .then((res) => {
        if (cancelled) return
        const store = res.data.data?.store ?? res.data.store
        setGuestStorefrontCompanyId(store.company_id) // see customerHttp.ts — carried as X-Store-Company for guest requests
        setState({
          status: 'ok',
          companyId: store.company_id,
          name: store.name,
          logo: store.logo ?? null,
          phone: store.phone ?? null,
          address: store.address ?? null,
          storefrontCode: store.storefront_code ?? null,
          storeQuery: store.storefront_code ? `?store=${store.storefront_code}` : '',
        })
      })
      .catch((err) => {
        if (cancelled) return
        setGuestStorefrontCompanyId(null)
        const httpStatus = err?.status
        setState({ ...initialState, status: httpStatus === 400 ? 'missing' : httpStatus === 404 ? 'invalid' : 'error' })
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug, companyFallback])

  const value = useMemo(() => state, [state])
  return <StorefrontCtx.Provider value={value}>{children}</StorefrontCtx.Provider>
}

export function useStorefront() {
  return useContext(StorefrontCtx)
}

/**
 * RequireStorefront — sits directly inside StorefrontProvider, wrapping
 * every /customer/* page (login, register, and the whole CustomerLayout
 * tree in app/Router.tsx). Turns the three non-'ok' statuses into the
 * one behavior each actually needs, instead of every page re-deriving
 * `missing`/`invalid` locals and rendering its own dead-end message
 * (as CustomerLoginPage/CustomerRegisterPage/CustomerLayout each used
 * to before the /store picker existed):
 *
 *   'loading'          → spinner, nothing else can render yet.
 *   'missing'          → no ?store=/?company= at all — NOT an error, just
 *                         means "customer hasn't picked a store". Silently
 *                         resume at their remembered store if they have
 *                         one (spec's "Returning customer" flow), else
 *                         send them to the /store picker.
 *   'invalid'/'error'  → a store WAS specified but couldn't be resolved
 *                         (bad slug, deactivated company, backend
 *                         hiccup) — a real message, with a way out.
 *   'ok'                → render the actual page.
 */
export function RequireStorefront({ children }: { children: ReactNode }) {
  const storefront = useStorefront()
  const location = useLocation()

  if (storefront.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size={26} className="text-brand" />
      </div>
    )
  }

  if (storefront.status === 'missing') {
    const remembered = getRememberedStore()
    const target = remembered
      ? `${location.pathname}?store=${remembered.storefront_code}`
      : `/store${location.pathname !== '/customer' ? `?next=${encodeURIComponent(location.pathname)}` : ''}`
    return <Navigate to={target} replace />
  }

  if (storefront.status === 'invalid' || storefront.status === 'error') {
    return (
      <div className="customer-store-error">
        <h1 className="customer-store-error-title">Store not found</h1>
        <p className="customer-store-error-text">
          {storefront.status === 'invalid'
            ? "This store link doesn't look right. Please choose your store below."
            : "We couldn't load this store right now. Please try again, or choose a different store."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Try Again</Button>
          <Button variant="primary" size="sm" onClick={() => { window.location.href = '/store' }}>Choose a Store</Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
