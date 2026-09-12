import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { RequireAuth, RequireGuest } from '@/router/guards'
import { RequireCustomerAuth, RequireCustomerGuest } from '@/router/customerGuards'
import { StorefrontProvider } from '@/modules/customer/StorefrontContext'
import AppLayout from '@/layouts/AppLayout'
import CustomerLayout from '@/layouts/CustomerLayout'
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

// Customer storefront pages (Customer Product Ordering module)
const CustomerLoginPage    = lazy(() => import('@/modules/customer/CustomerLoginPage'))
const CustomerRegisterPage = lazy(() => import('@/modules/customer/CustomerRegisterPage'))
const CustomerHomePage     = lazy(() => import('@/modules/customer/CustomerHomePage'))
const CustomerProductDetailPage = lazy(() => import('@/modules/customer/CustomerProductDetailPage'))
const CustomerCartPage     = lazy(() => import('@/modules/customer/CustomerCartPage'))
const CustomerCheckoutPage = lazy(() => import('@/modules/customer/CustomerCheckoutPage'))
const CustomerOrdersPage   = lazy(() => import('@/modules/customer/CustomerOrdersPage'))
const CustomerOrderDetailPage = lazy(() => import('@/modules/customer/CustomerOrderDetailPage'))
const CustomerProfilePage  = lazy(() => import('@/modules/customer/CustomerProfilePage'))

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
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
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
               production), never re-resolved independently per page. */}
          <Route path="/customer" element={<StorefrontProvider><Outlet /></StorefrontProvider>}>
            <Route path="login"    element={<RequireCustomerGuest><CustomerLoginPage /></RequireCustomerGuest>} />
            <Route path="register" element={<RequireCustomerGuest><CustomerRegisterPage /></RequireCustomerGuest>} />

            <Route element={<RequireCustomerAuth><CustomerLayout /></RequireCustomerAuth>}>
              <Route index element={<CustomerHomePage />} />
              <Route path="products/:id" element={<CustomerProductDetailPage />} />
              <Route path="cart"         element={<CustomerCartPage />} />
              <Route path="checkout"     element={<CustomerCheckoutPage />} />
              <Route path="orders"       element={<CustomerOrdersPage />} />
              <Route path="orders/:id"   element={<CustomerOrderDetailPage />} />
              <Route path="profile"      element={<CustomerProfilePage />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to={PATHS.LOGIN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
