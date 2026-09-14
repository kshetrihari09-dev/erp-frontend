/**
 * modules/customer/StoreSelectPage.tsx — Customer Product Ordering module.
 *
 * The screen a customer lands on when RequireStorefront (StorefrontContext.tsx)
 * has nothing to resolve yet — no ?store=/?company= in the URL, and no
 * remembered store from a previous visit (selectedStore.ts). Deliberately
 * OUTSIDE StorefrontProvider/RequireStorefront: this page's whole job is
 * to run *before* a store is known, so it talks to the one endpoint that
 * doesn't need one, GET /storefront/list (routes/storefront.js).
 *
 * Never asks for or displays a company UUID — a store is picked by name/
 * logo and identified everywhere after by its slug (storefront_code),
 * the same public, non-secret value that already flows through
 * ?store=<slug> (see StorefrontContext.tsx's docblock). Choosing a store
 * here is not an authorization decision; it only ever feeds into that
 * same ?store= URL param, and the backend still re-derives and enforces
 * the real company scope from the customer's JWT once they've logged in
 * (middleware/customerAuth.js) — this page could be deleted entirely and
 * a customer could still reach the same place by typing ?store=<slug>
 * directly, same as before.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Store, Search, MapPin, Check, ChevronRight } from 'lucide-react'
import { Button, Spinner, Empty, Alert } from '@/components/ui'
import { useStoreList, type StorefrontListing } from '@/hooks/useCustomerQuery'
import { getRememberedStore, setRememberedStore } from './selectedStore'

// Same file-local debounce pattern as CustomerHomePage.tsx's product
// search — search-as-you-type without a request per keystroke.
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function StoreSelectPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Where RequireStorefront sent the customer from — e.g. they tried
  // /customer/login directly with no store chosen yet. Used only to
  // pick which action button reads as "primary" below; every button
  // still works regardless.
  const next = params.get('next')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const { data: stores, isLoading, isError } = useStoreList(debouncedSearch)

  const [selected, setSelected] = useState<StorefrontListing | null>(null)

  // Pre-select a returning customer's last store so they can just tap
  // Continue (spec's "Returning customer" flow) — still shown in the
  // list, not skipped past, so they can just as easily pick a different
  // one.
  useEffect(() => {
    const remembered = getRememberedStore()
    if (remembered) setSelected({ ...remembered, address: null })
  }, [])

  function pick(store: StorefrontListing) {
    setSelected(store)
    setRememberedStore(store)
  }

  function goTo(path: string) {
    if (!selected) return
    navigate(`${path}?store=${selected.storefront_code}`)
  }

  return (
    <div className="customer-select-shell">
      <div className="customer-select-inner">
        <div className="customer-select-hero">
          <span className="customer-select-logo"><Store size={22} /></span>
          <h1 className="customer-select-title">Welcome to Online Ordering</h1>
          <p className="customer-select-subtitle">
            {next === '/customer/login' ? 'Select your store to log in'
              : next === '/customer/register' ? 'Select your store to create an account'
              : 'Select your store to continue'}
          </p>
        </div>

        <div className="customer-select-search">
          <Search size={15} className="customer-select-search-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search store name…"
            className="customer-select-search-input"
          />
        </div>

        <div className="customer-select-list">
          {isLoading && (
            <div className="flex justify-center py-10"><Spinner size={24} className="text-brand" /></div>
          )}

          {isError && (
            <Alert type="danger" message="Could not load stores right now. Please try again." />
          )}

          {!isLoading && !isError && stores?.length === 0 && (
            <Empty icon="🏬" message={search ? `No stores match "${search}".` : 'No stores are available right now.'} />
          )}

          {!isLoading && stores?.map(store => {
            const isSelected = selected?.storefront_code === store.storefront_code
            return (
              <button
                key={store.storefront_code}
                onClick={() => pick(store)}
                className={`customer-select-item ${isSelected ? 'customer-select-item--active' : ''}`}
              >
                {store.logo
                  ? <img src={store.logo} alt="" className="customer-select-item-logo" />
                  : <span className="customer-select-item-logo customer-select-item-logo--fallback"><Store size={16} /></span>}
                <span className="customer-select-item-body">
                  <span className="customer-select-item-name">{store.name}</span>
                  {store.address && (
                    <span className="customer-select-item-address"><MapPin size={11} /> {store.address}</span>
                  )}
                </span>
                <span className="customer-select-item-check">
                  {isSelected ? <Check size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="customer-select-actions">
        <div className="customer-select-actions-inner">
          <Button variant="primary" disabled={!selected} onClick={() => goTo('/customer')}>
            {selected ? `Continue to ${selected.name}` : 'Select a store to continue'}
          </Button>
          <div className="customer-select-actions-row">
            <button className="customer-select-link" disabled={!selected} onClick={() => goTo('/customer/login')}>
              Already a customer? <span>Login</span>
            </button>
            <button className="customer-select-link" disabled={!selected} onClick={() => goTo('/customer/register')}>
              New customer? <span>Register</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
