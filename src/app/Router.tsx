import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, RequireGuest, RequireRoute, HomeRedirect } from '@/router/guards'
import AppLayout from '@/layouts/AppLayout'
import { PATHS } from '@/constants'
import { Spinner } from '@/components/ui'

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
const LoginPage    = lazy(() => import('@/modules/auth/LoginPage'))
const SignupPage   = lazy(() => import('@/modules/auth/SignupPage'))
const Dashboard    = lazy(() => import('@/modules/dashboard/DashboardPage'))
const SalesPage    = lazy(() => import('@/modules/sales/SalesPage'))
const RetailSalePage = lazy(() => import('@/modules/retail/RetailSalePage'))
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
const StockRegisterPage = lazy(() => import('@/modules/inventory/StockRegisterPage'))
const StockSummaryPage  = lazy(() => import('@/modules/inventory/StockSummaryPage'))
const CompanyCustomerReportPage = lazy(() => import('@/modules/reports/CompanyCustomerReportPage'))
const CustomerCompanyReportPage = lazy(() => import('@/modules/reports/CustomerCompanyReportPage'))
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage'))
const RemindersPage = lazy(() => import('@/modules/reminders/RemindersPage'))



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
            <Route index element={<HomeRedirect />} />

            <Route path="dashboard"    element={<RequireRoute to="/dashboard"><Dashboard /></RequireRoute>} />

            {/* Transactions */}
            <Route path="sales"        element={<RequireRoute to="/sales"><SalesPage /></RequireRoute>} />
            <Route path="retail-sale"  element={<RequireRoute to="/retail-sale"><RetailSalePage /></RequireRoute>} />
            <Route path="purchase"     element={<RequireRoute to="/purchase"><PurchasePage /></RequireRoute>} />
            <Route path="purchases"    element={<RequireRoute to="/purchases"><PurchasePage /></RequireRoute>} />
            <Route path="returns"          element={<RequireRoute to="/returns"><ReturnsPage /></RequireRoute>} />
            <Route path="sales-returns"    element={<RequireRoute to="/sales-returns"><SalesReturnPage /></RequireRoute>} />
            <Route path="purchase-return"  element={<RequireRoute to="/purchase-return"><PurchaseReturnPage /></RequireRoute>} />
            <Route path="purchase-returns" element={<RequireRoute to="/purchase-returns"><PurchaseReturnPage /></RequireRoute>} />

            {/* Inventory */}
            <Route path="products"     element={<RequireRoute to="/products"><ProductsPage /></RequireRoute>} />
            <Route path="barcode-print" element={<RequireRoute to="/barcode-print"><BarcodePrintPage /></RequireRoute>} />
            <Route path="qrcode-print" element={<RequireRoute to="/qrcode-print"><QRCodePrintPage /></RequireRoute>} />
            <Route path="manufacturers" element={<RequireRoute to="/manufacturers"><ManufacturersPage /></RequireRoute>} />
            <Route path="stock"        element={<RequireRoute to="/stock"><StockPage /></RequireRoute>} />
            <Route path="stock-report" element={<RequireRoute to="/stock-report"><StockPage /></RequireRoute>} />
            <Route path="stock-register" element={<RequireRoute to="/stock-register"><StockRegisterPage /></RequireRoute>} />
            <Route path="stock-summary" element={<RequireRoute to="/stock-summary"><StockSummaryPage /></RequireRoute>} />
            <Route path="purchase-suggestions" element={<RequireRoute to="/purchase-suggestions"><PurchaseSuggestionsPage /></RequireRoute>} />
            <Route path="credit-risk" element={<RequireRoute to="/credit-risk"><CreditRiskDashboardPage /></RequireRoute>} />
            <Route path="reminders" element={<RequireRoute to="/reminders"><RemindersPage /></RequireRoute>} />

            {/* Parties */}
            <Route path="customers"    element={<RequireRoute to="/customers"><CustomersPage /></RequireRoute>} />
            <Route path="suppliers"    element={<RequireRoute to="/suppliers"><SuppliersPage /></RequireRoute>} />

            {/* Finance */}
            <Route path="accounting"     element={<RequireRoute to="/accounting"><AccountingPage /></RequireRoute>} />
            {/* Account Setup page removed — merged into Accounting → Engine Setup tab */}
            <Route path="account-setup"  element={<Navigate to="/accounting?tab=account-defaults" replace />} />
            <Route path="ledger"           element={<RequireRoute to="/ledger"><LedgerPage /></RequireRoute>} />

            {/* Analytics */}
            <Route path="reports"      element={<RequireRoute to="/reports"><ReportsPage /></RequireRoute>} />
            <Route path="company-vs-customer" element={<RequireRoute to="/company-vs-customer"><CompanyCustomerReportPage /></RequireRoute>} />
            <Route path="customer-vs-company" element={<RequireRoute to="/customer-vs-company"><CustomerCompanyReportPage /></RequireRoute>} />

            {/* System */}
            <Route path="settings"     element={<RequireRoute to="/settings"><SettingsPage /></RequireRoute>} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to={PATHS.LOGIN} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
