/**
 * layouts/CustomerLayout.tsx — Customer Product Ordering module.
 *
 * Deliberately does NOT render AppLayout's sidebar/topbar/nav — a
 * customer must never see staff navigation (spec's own non-negotiable).
 * Mobile-first bottom nav (spec #26/#44); on wider screens the same nav
 * just becomes a slim top bar instead of taking over the bottom of a
 * desktop window, via CSS breakpoints in globals.css (customer-* classes
 * appended there), not a second duplicated component per screen size.
 *
 * Header reads the real store identity from StorefrontContext (name,
 * logo) instead of a hardcoded "🛍️ Store" label — a customer never sees
 * the company_id/UUID, only what StorefrontContext already resolved for
 * public display. Search/Cart/Account are quick-access icon actions
 * (spec's header requirement); Search links back to the storefront home,
 * where the actual search field lives (CustomerHomePage), rather than
 * duplicating a second search implementation here.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, ShoppingCart, ClipboardList, User, Search, Store as StoreIcon } from 'lucide-react'
import { useActiveCart } from '@/hooks/useCustomerQuery'
import useCustomerAuthStore from '@/store/customerAuthStore'
import ToastContainer from '@/components/shared/ToastContainer'
import { useStorefront } from '@/modules/customer/StorefrontContext'
import { Spinner, Button } from '@/components/ui'

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
  // the badge count is correct either way (spec §14: browsing/cart work
  // without an account).
  const { data: cart } = useActiveCart()
  const customer = useCustomerAuthStore(s => s.customer)
  const cartCount = cart?.items?.length || 0

  // Storefront couldn't be resolved (bad/missing ?store= link, backend
  // down, etc.) — show a clear customer-facing message instead of a
  // shell with an empty catalog and no explanation (spec #14: never
  // surface raw technical errors, but never say nothing either).
  if (storefront.status === 'missing' || storefront.status === 'invalid' || storefront.status === 'error') {
    return (
      <div className="customer-store-error">
        <StoreIcon size={32} className="text-[var(--text-4)]" />
        <h1 className="customer-store-error-title">Store not found</h1>
        <p className="customer-store-error-text">
          {storefront.status === 'invalid'
            ? "This store link doesn't look right. Please check the link and try again."
            : "We couldn't load this store right now. Please check your link or try again shortly."}
        </p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    )
  }

  if (storefront.status === 'loading') {
    return (
      <div className="customer-store-error">
        <Spinner size={26} className="text-brand" />
      </div>
    )
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
          <NavLink to="/customer" end className="customer-topbar-iconbtn" aria-label="Search products">
            <Search size={18} strokeWidth={1.8} />
          </NavLink>
          <NavLink to="/customer/cart" className="customer-topbar-iconbtn" aria-label="Cart">
            <ShoppingCart size={18} strokeWidth={1.8} />
            {cartCount > 0 && <span className="customer-header-cart-badge">{cartCount}</span>}
          </NavLink>
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

      <ToastContainer />
    </div>
  )
}
