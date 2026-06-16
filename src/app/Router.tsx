import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, RequireGuest } from '@/router/guards'
import AppLayout from '@/layouts/AppLayout'
import { PATHS } from '@/constants'
import { Spinner } from '@/components/ui'

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
const LoginPage    = lazy(() => import('@/modules/auth/LoginPage'))
const SignupPage   = lazy(() => import('@/modules/auth/SignupPage'))
const Dashboard    = lazy(() => import('@/modules/dashboard/DashboardPage'))
const SalesPage    = lazy(() => import('@/modules/sales/SalesPage'))
const PurchasePage = lazy(() => import('@/modules/purchases/PurchasePage'))
const ReturnsPage  = lazy(() => import('@/modules/billing/ReturnsPage'))
const ProductsPage = lazy(() => import('@/modules/inventory/ProductsPage'))
const StockPage    = lazy(() => import('@/modules/inventory/StockPage'))
const ReceivePage  = lazy(() => import('@/modules/inventory/ReceivePage'))
const CustomersPage= lazy(() => import('@/modules/users/CustomersPage'))
const SuppliersPage= lazy(() => import('@/modules/users/SuppliersPage'))
const AccountingPage=lazy(() => import('@/modules/accounting/AccountingPage'))
const LedgerPage   = lazy(() => import('@/modules/accounting/LedgerPage'))
const ReportsPage  = lazy(() => import('@/modules/reports/ReportsPage'))
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage'))

// NEW: Mobile scanner page — public route, no auth, no layout
const MobileScannerPage = lazy(() => import('@/modules/scanner/MobileScannerPage'))

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

          {/* NEW: Mobile scanner — public, no auth, no AppLayout wrapper */}
          <Route path="/scan" element={<MobileScannerPage />} />

          {/* Protected */}
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Navigate to={PATHS.DASHBOARD} replace />} />

            <Route path="dashboard"    element={<Dashboard />} />

            {/* Transactions */}
            <Route path="sales"        element={<SalesPage />} />
            <Route path="purchase"     element={<PurchasePage />} />
            <Route path="purchases"    element={<PurchasePage />} />
            <Route path="returns"          element={<ReturnsPage />} />
            <Route path="sales-returns"    element={<ReturnsPage />} />
            <Route path="purchase-return"  element={<ReturnsPage />} />
            <Route path="purchase-returns" element={<ReturnsPage />} />

            {/* Inventory */}
            <Route path="products"     element={<ProductsPage />} />
            <Route path="stock"        element={<StockPage />} />
            <Route path="stock-report" element={<StockPage />} />
            <Route path="receives"     element={<ReceivePage />} />

            {/* Parties */}
            <Route path="customers"    element={<CustomersPage />} />
            <Route path="suppliers"    element={<SuppliersPage />} />

            {/* Finance */}
            <Route path="accounting"   element={<AccountingPage />} />
            <Route path="ledger"       element={<LedgerPage />} />

            {/* Analytics */}
            <Route path="reports"      element={<ReportsPage />} />

            {/* System */}
            <Route path="settings"     element={<SettingsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to={PATHS.LOGIN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
