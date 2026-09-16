import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { RequireAuth, RequireGuest } from '@/router/guards'
import { RequireCustomerAuth, RequireCustomerGuest } from '@/router/customerGuards'
import { StorefrontProvider, RequireStorefront } from '@/modules/customer/StorefrontContext'
import AppLayout from '@/layouts/AppLayout'
import CustomerLayout from '@/layouts/CustomerLayout'
import DeliveryLayout from '@/layouts/DeliveryLayout'
import useAuthStore from '@/store/authStore'
import { PATHS } from '@/constants'
import { Spinner } from '@/components/ui'

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
const LoginPage    = lazy(() => import('@/modules/auth/LoginPage'))
const SignupPage   = lazy(() => import('@/modules/auth/SignupPage'))
const Dashboard    = lazy(() => import('@/modules/dashboard/DashboardPage'))
const SalesPage    = lazy(() => import('@/modules/sales/SalesPage'))
const PurchasePage = lazy(() => import('@/modules/purchases/PurchasePage'))
const ReturnsPage  = lazy(() => import('@/modules/billing/ReturnsPage'))
const SalesReturnPage    = lazy(() => import('@/modules/billing/SalesReturnPage'))
const PurchaseReturnPage = lazy(() => import('@/modules/billing/PurchaseReturnPage'))
const ProductsPage = lazy(() => import('@/modules/inventory/ProductsPage'))
const BarcodePrintPage = lazy(() => import('@/modules/inventory/BarcodePrintPage'))
const QRCodePrintPage = lazy(() => import('@/modules/inventory/QRCodePrintPage'))
const ManufacturersPage = lazy(() => import('@/modules/inventory/ManufacturersPage'))
const StockPage    = lazy(() => import('@/modules/inventory/StockPage'))
const PurchaseSuggestionsPage = lazy(() => import('@/modules/inventory/PurchaseSuggestionsPage'))
const CreditRiskDashboardPage = lazy(() => import('@/modules/creditRisk/CreditRiskDashboardPage'))
const CustomersPage= lazy(() => import('@/modules/users/CustomersPage'))
const SuppliersPage= lazy(() => import('@/modules/users/SuppliersPage'))
const AccountingPage=lazy(() => import('@/modules/accounting/AccountingPage'))
const LedgerPage   = lazy(() => import('@/modules/accounting/LedgerPage'))
const ReportsPage  = lazy(() => import('@/modules/reports/ReportsPage'))
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage'))
const RemindersPage = lazy(() => import('@/modules/reminders/RemindersPage'))
const AdminCustomerOrdersPage = lazy(() => import('@/modules/customerOrders/AdminCustomerOrdersPage'))
const AdminCustomerRegistrationsPage = lazy(() => import('@/modules/customerOrders/AdminCustomerRegistrationsPage'))

// Delivery partner app (migration 038)
const DeliveryOrdersPage = lazy(() => import('@/modules/delivery/DeliveryOrdersPage'))
const DeliveryOrderPage  = lazy(() => import('@/modules/delivery/DeliveryOrderPage'))

// Customer storefront pages (Customer Product Ordering module)
const StoreSelectPage      = lazy(() => import('@/modules/customer/StoreSelectPage'))
const CustomerLoginPage    = lazy(() => import('@/modules/customer/CustomerLoginPage'))
const CustomerRegisterPage = lazy(() => import('@/modules/customer/CustomerRegisterPage'))
const CustomerRegistrationStatusPage = lazy(() => import('@/modules/customer/CustomerRegistrationStatusPage'))
const CustomerHomePage     = lazy(() => import('@/modules/customer/CustomerHomePage'))
const CustomerProductDetailPage = lazy(() => import('@/modules/customer/CustomerProductDetailPage'))
const CustomerCartPage     = lazy(() => import('@/modules/customer/CustomerCartPage'))
const CustomerCheckoutPage = lazy(() => import('@/modules/customer/CustomerCheckoutPage'))
const CustomerOrdersPage   = lazy(() => import('@/modules/customer/CustomerOrdersPage'))
const CustomerOrderDetailPage = lazy(() => import('@/modules/customer/CustomerOrderDetailPage'))
const CustomerProfilePage  = lazy(() => import('@/modules/customer/CustomerProfilePage'))

/**
 * A delivery partner has no back office: ROLE_PERMISSIONS for that role
 * is empty and every staff endpoint would reject them, so landing them
 * on /dashboard would show a page of things they cannot do. They get
 * bounced to their own queue instead.
 *
 * This only redirects AWAY from the staff tree — it is a routing
 * convenience, not a security boundary. The boundary is server-side:
 * routes/deliveryPartner.js checks the role and the per-order
 * assignment, and every back-office route has its own guard.
 */
function RequireStaff({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.user?.role)
  if (role === 'delivery_partner') return <Navigate to={PATHS.DELIVERY} replace />
  return <>{children}</>
}

/** The mirror of the above: keep staff out of the rider shell, so an
 *  admin clicking a stale link gets their own app back rather than an
 *  empty "no deliveries assigned to you" screen. */
function RequireDeliveryPartner({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.user?.role)
  if (role && role !== 'delivery_partner' && role !== 'owner') {
    return <Navigate to={PATHS.DASHBOARD} replace />
  }
  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={28} className="text-brand" />
    </div>
  )
}

export default function Router() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path={PATHS.LOGIN}  element={<RequireGuest><LoginPage /></RequireGuest>} />
          <Route path={PATHS.SIGNUP} element={<RequireGuest><SignupPage /></RequireGuest>} />

          {/* Protected */}
          {/* ── Delivery partner app (migration 038) ───────────────────
               Same staff session and token as the back office — a rider
               is an ordinary `users` row — but its own shell, because
               the sidebar app is entirely inapplicable to them. See
               layouts/DeliveryLayout.tsx. */}
          <Route
            path={PATHS.DELIVERY}
            element={<RequireAuth><RequireDeliveryPartner><DeliveryLayout /></RequireDeliveryPartner></RequireAuth>}
          >
            <Route index element={<DeliveryOrdersPage />} />
            <Route path="orders" element={<Navigate to={PATHS.DELIVERY} replace />} />
            <Route path="orders/:id" element={<DeliveryOrderPage />} />
          </Route>

          <Route path="/" element={<RequireAuth><RequireStaff><AppLayout /></RequireStaff></RequireAuth>}>
            <Route index element={<Navigate to={PATHS.DASHBOARD} replace />} />

            <Route path="dashboard"    element={<Dashboard />} />

            {/* Transactions */}
            <Route path="sales"        element={<SalesPage />} />
            <Route path="purchase"     element={<PurchasePage />} />
            <Route path="purchases"    element={<PurchasePage />} />
            <Route path="returns"          element={<ReturnsPage />} />
            <Route path="sales-returns"    element={<SalesReturnPage />} />
            <Route path="purchase-return"  element={<PurchaseReturnPage />} />
            <Route path="purchase-returns" element={<PurchaseReturnPage />} />

            {/* Inventory */}
            <Route path="products"     element={<ProductsPage />} />
            <Route path="barcode-print" element={<BarcodePrintPage />} />
            <Route path="qrcode-print" element={<QRCodePrintPage />} />
            <Route path="manufacturers" element={<ManufacturersPage />} />
            <Route path="stock"        element={<StockPage />} />
            <Route path="stock-report" element={<StockPage />} />
            <Route path="purchase-suggestions" element={<PurchaseSuggestionsPage />} />
            <Route path="credit-risk" element={<CreditRiskDashboardPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="customer-orders" element={<AdminCustomerOrdersPage />} />
            <Route path="customer-registrations" element={<AdminCustomerRegistrationsPage />} />

            {/* Parties */}
            <Route path="customers"    element={<CustomersPage />} />
            <Route path="suppliers"    element={<SuppliersPage />} />

            {/* Finance */}
            <Route path="accounting"     element={<AccountingPage />} />
            {/* Account Setup page removed — merged into Accounting → Engine Setup tab */}
            <Route path="account-setup"  element={<Navigate to="/accounting?tab=account-defaults" replace />} />
            <Route path="ledger"           element={<LedgerPage />} />

            {/* Analytics */}
            <Route path="reports"      element={<ReportsPage />} />

            {/* System */}
            <Route path="settings"     element={<SettingsPage />} />
          </Route>

          {/* ── Customer storefront (Customer Product Ordering module) ──────
               Entirely separate from the staff tree above: its own guards
               (RequireCustomerAuth/Guest — router/customerGuards.tsx), its
               own layout (CustomerLayout, no staff sidebar/nav), its own
               auth store/token. A customer session and a staff session can
               coexist in the same browser (different tabs) without
               interfering with each other.

               StorefrontProvider (modules/customer/StorefrontContext.tsx) is
               mounted once here, above every /customer/* page — the single
               source of truth for "which company" (spec §5), resolved from
               ?store=<slug> / VITE_STOREFRONT_CODE (no UUID in the URL in
               production), never re-resolved independently per page.
               RequireStorefront (same file) is what turns "no store chosen
               yet" into a redirect to the /store picker below instead of
               every page dead-ending on its own "store unavailable"
               message — see that component's docblock. */}
          <Route path="/store" element={<StoreSelectPage />} />

          <Route path="/customer" element={<StorefrontProvider><RequireStorefront><Outlet /></RequireStorefront></StorefrontProvider>}>
            <Route path="login"    element={<RequireCustomerGuest><CustomerLoginPage /></RequireCustomerGuest>} />
            <Route path="register" element={<RequireCustomerGuest><CustomerRegisterPage /></RequireCustomerGuest>} />
            <Route path="registration-status" element={<RequireCustomerGuest><CustomerRegistrationStatusPage /></RequireCustomerGuest>} />

            {/* CustomerLayout itself is NOT behind RequireCustomerAuth —
                spec §14: browsing, cart, and checkout all work for a guest.
                Only order history and profile (which need an actual
                account) are individually guarded below. */}
            <Route element={<CustomerLayout />}>
              <Route index element={<CustomerHomePage />} />
              <Route path="products/:id" element={<CustomerProductDetailPage />} />
              <Route path="cart"         element={<CustomerCartPage />} />
              <Route path="checkout"     element={<CustomerCheckoutPage />} />
              <Route path="orders"       element={<RequireCustomerAuth><CustomerOrdersPage /></RequireCustomerAuth>} />
              <Route path="orders/:id"   element={<RequireCustomerAuth><CustomerOrderDetailPage /></RequireCustomerAuth>} />
              <Route path="profile"      element={<RequireCustomerAuth><CustomerProfilePage /></RequireCustomerAuth>} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to={PATHS.LOGIN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
