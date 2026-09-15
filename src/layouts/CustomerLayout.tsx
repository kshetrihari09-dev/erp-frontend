/**
 * layouts/CustomerLayout.tsx — Customer Product Ordering module.
 *
 * Deliberately does NOT render AppLayout's sidebar/topbar/nav — a
 * customer must never see staff navigation (spec's own non-negotiable).
 * Mobile-first bottom nav; on wider screens the same nav just becomes a
 * slim top bar instead of taking over the bottom of a desktop window,
 * via CSS breakpoints in globals.css (customer-* classes), not a second
 * duplicated component per screen size.
 *
 * Header reads the real store identity from StorefrontContext (name,
 * logo) instead of a hardcoded label — a customer never sees the
 * company_id/UUID, only what StorefrontContext already resolved for
 * public display. RequireStorefront (StorefrontContext.tsx) guarantees
 * status === 'ok' by the time this renders, so there's no missing/
 * invalid handling needed here anymore.
 */
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ShoppingCart, ClipboardList, User, Search, Store as StoreIcon, ArrowLeftRight } from 'lucide-react'
import { useActiveCart } from '@/hooks/useCustomerQuery'
import useCustomerAuthStore from '@/store/customerAuthStore'
import useGuestCartStore from '@/store/guestCartStore'
import ToastContainer from '@/components/shared/ToastContainer'
import { useStorefront } from '@/modules/customer/StorefrontContext'
import { ConfirmDialog } from '@/components/ui'

const TABS = [
  { to: '/customer',         label: 'Home',    icon: Home,           end: true },
  { to: '/customer/cart',    label: 'Cart',     icon: ShoppingCart },
  { to: '/customer/orders',  label: 'Orders',   icon: ClipboardList },
  { to: '/customer/profile', label: 'Profile',  icon: User },
]

export default function CustomerLayout() {
  const navigate = useNavigate()
  const storefront = useStorefront()
  // useActiveCart() — the persisted server cart when logged in, or the
  // guest's browser-held cart (store/guestCartStore.ts) otherwise — so
  // the badge count is correct either way (browsing/cart work without
  // an account).
  const { data: cart } = useActiveCart()
  const customer = useCustomerAuthStore(s => s.customer)
  const logout = useCustomerAuthStore(s => s.logout)
  const clearGuestCart = useGuestCartStore(s => s.clear)
  const cartCount = cart?.items?.length || 0

  const [confirmChangeStore, setConfirmChangeStore] = useState(false)

  // "Change Store" cart safety: a guest's cart is a plain, unscoped
  // browser bucket of product_ids (store/guestCartStore.ts) — carrying
  // it into a different store's catalog would be meaningless or wrong,
  // so it's cleared on confirmed change. A logged-in customer's account
  // is itself 1:1 with a single company (customer_accounts.company_id,
  // migration 034) — their token only ever authorizes THIS store, so
  // "switching" really means logging out and letting them log in fresh
  // under the new store (their cart/orders at the old store aren't
  // deleted, just no longer the active session — see
  // middleware/customerAuth.js for how that scope is derived and
  // enforced server-side, never from anything set here).
  function requestChangeStore() {
    if (customer || cartCount > 0) { setConfirmChangeStore(true); return }
    goToStorePicker()
  }
  function goToStorePicker() {
    clearGuestCart()
    if (customer) logout()
    navigate('/store')
  }

  return (
    <div className="customer-shell">
      <header className="customer-topbar">
        <div className="customer-topbar-brand">
          {storefront.logo
            ? <img src={storefront.logo} alt="" className="customer-topbar-logo" />
            : <span className="customer-topbar-logo customer-topbar-logo--fallback"><StoreIcon size={15} /></span>}
          <span className="customer-topbar-name">{storefront.name || 'Store'}</span>
        </div>

        <div className="customer-topbar-actions">
          <button onClick={requestChangeStore} className="customer-topbar-iconbtn" aria-label="Change store" title="Change Store">
            <ArrowLeftRight size={17} strokeWidth={1.8} />
            <span className="customer-topbar-iconbtn-label">Change Store</span>
          </button>
          <NavLink to="/customer" end className="customer-topbar-iconbtn" aria-label="Search products" title="Search">
            <Search size={18} strokeWidth={1.8} />
            <span className="customer-topbar-iconbtn-label">Search</span>
          </NavLink>
          <NavLink to="/customer/cart" className="customer-topbar-iconbtn" aria-label="Cart" title="Cart">
            <ShoppingCart size={18} strokeWidth={1.8} />
            <span className="customer-topbar-iconbtn-label">Cart</span>
            {cartCount > 0 && <span className="customer-header-cart-badge">{cartCount}</span>}
          </NavLink>
          <span className="customer-topbar-divider" aria-hidden="true" />
          {customer
            ? <NavLink to="/customer/profile" className="customer-topbar-user" title={customer.name}>
                Hi, {customer.name.split(' ')[0]}
              </NavLink>
            : <button onClick={() => navigate(`/customer/login${window.location.search}`)} className="customer-topbar-user customer-topbar-user--link">
                Sign in
              </button>}
        </div>
      </header>

      <main className="customer-main">
        <div className="customer-content">
          <Outlet />
        </div>
      </main>

      <nav className="customer-bottomnav">
        {TABS.map(tab => (
          <NavLink
            key={tab.to} to={tab.to} end={tab.end}
            className={({ isActive }) => `customer-navitem ${isActive ? 'customer-navitem--active' : ''}`}
          >
            <span className="customer-navitem-icon">
              <tab.icon size={20} strokeWidth={1.8} />
              {tab.to === '/customer/cart' && cartCount > 0 && (
                <span className="customer-cart-badge">{cartCount}</span>
              )}
            </span>
            <span className="customer-navitem-label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <ConfirmDialog
        open={confirmChangeStore}
        onClose={() => setConfirmChangeStore(false)}
        onConfirm={goToStorePicker}
        title="Change Store?"
        confirmLabel="Change Store"
        message={
          customer
            ? `You're logged in to ${storefront.name || 'this store'}. Changing stores will log you out${cartCount > 0 ? ' and clear your cart' : ''}.`
            : `Your cart belongs to ${storefront.name || 'this store'}. Changing stores will clear this cart.`
        }
      />

      <ToastContainer />
    </div>
  )
}
