/**
 * layouts/CustomerLayout.tsx — Customer Product Ordering module.
 *
 * Deliberately does NOT render AppLayout's sidebar/topbar/nav — a
 * customer must never see staff navigation (spec's own non-negotiable).
 * Mobile-first bottom nav (spec #26/#44); on wider screens the same nav
 * just becomes a slim top bar instead of taking over the bottom of a
 * desktop window, via CSS breakpoints in globals.css (customer-* classes
 * appended there), not a second duplicated component per screen size.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { Home, ShoppingCart, ClipboardList, User } from 'lucide-react'
import { useCustomerCart } from '@/hooks/useCustomerQuery'
import useCustomerAuthStore from '@/store/customerAuthStore'
import ToastContainer from '@/components/shared/ToastContainer'

const TABS = [
  { to: '/customer',         label: 'Home',    icon: Home,           end: true },
  { to: '/customer/cart',    label: 'Cart',     icon: ShoppingCart },
  { to: '/customer/orders',  label: 'Orders',   icon: ClipboardList },
  { to: '/customer/profile', label: 'Profile',  icon: User },
]

export default function CustomerLayout() {
  const { data: cart } = useCustomerCart()
  const customer = useCustomerAuthStore(s => s.customer)
  const cartCount = cart?.items?.length || 0

  return (
    <div className="customer-shell">
      <header className="customer-topbar">
        <span className="customer-topbar-name">🛍️ Store</span>
        {customer && <span className="customer-topbar-user">Hi, {customer.name.split(' ')[0]}</span>}
      </header>

      <main className="customer-main">
        <Outlet />
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
