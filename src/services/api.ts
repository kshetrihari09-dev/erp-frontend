import http from '@/services/http'
import type { ApiResponse, Company, User, Sale, SaleItem, Purchase, PurchaseItem,
  Product, Party, Account, AccountDefault, Voucher, VoucherLine,
  VoucherPosting, PostingStatus, DashboardStats, PnLReport,
  TrialBalanceRow, LedgerEntry, StockBatch, InvoiceTemplate, FiscalYear, AuditLog } from '@/types'

type Params = Record<string, unknown>

// ─── Auth ──────────────────────────────────────────────────────────────────────
export type OTPMethod  = 'whatsapp' | 'email' | 'sms'
export type OTPPurpose = 'signup' | 'login' | 'add_contact' | 'add_phone'

export interface SendOTPParams {
  method:   OTPMethod
  purpose?: OTPPurpose
  phone?:   string
  email?:   string
}

export interface VerifyOTPParams {
  method:       OTPMethod
  destination?: string
  otp:          string
  purpose?:     OTPPurpose
  phone?:       string
  email?:       string
}

export interface VerifyOTPResponse {
  destination?:    string
  method?:         OTPMethod
  verified?:       boolean
  purpose?:        OTPPurpose
  verified_token?: string
  phone_token?:    string
  token?:          string
  refresh_token?:  string
  user?:           User
  company?:        Company
  flow?:           string
}

export const authAPI = {
  login: (data: { email: string; password: string }) =>
    http.post<ApiResponse<{ token: string; access_token?: string; refresh_token?: string; user: User; company: Company }>>('/auth/login', data),
  register: (data: Params) =>
    http.post<ApiResponse<{ token: string; refresh_token: string; user: User; company: Company }>>('/auth/register', data),
  logout:         () => http.post('/auth/logout'),
  me:             () => http.get<ApiResponse<{ user: User; company: Company }>>('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) =>
    http.put('/auth/change-password', data),
  refresh: (data: { refresh_token: string }) => http.post('/auth/refresh', data),

  // ── Multi-channel OTP ─────────────────────────────────────────────────────
  sendOTP: (data: SendOTPParams) =>
    http.post<ApiResponse<{ method: string; destination: string; expires_in: number; _dev_otp?: string }>>('/auth/send-otp', data),
  verifyOTP: (data: VerifyOTPParams) =>
    http.post<ApiResponse<VerifyOTPResponse>>('/auth/verify-otp', data),
  addContact: (data: { verified_token: string }) =>
    http.post('/auth/add-contact', data),
  addPhone: (data: { phone_token: string }) =>
    http.post('/auth/add-phone', data),
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsAPI = {
  list:       (params?: Params) => http.get<ApiResponse<Product[]>>('/products', { params }),
  get:        (id: string)      => http.get<ApiResponse<Product>>(`/products/${id}`),
  create:     (data: Partial<Product>) => http.post<ApiResponse<Product>>('/products', data),
  update:     (id: string, data: Partial<Product>) => http.put<ApiResponse<Product>>(`/products/${id}`, data),
  delete:     (id: string)      => http.delete(`/products/${id}`),
  stock:      (id: string)      => http.get(`/products/${id}/stock`),
  adjust:     (id: string, data: { qty: number; reason: string }) =>
    http.post(`/products/${id}/adjust`, data),
  categories: ()                => http.get('/products/categories'),

  /**
   * Prefix search — returns products whose name STARTS WITH `q`.
   * Uses GET /products/search?q=par&limit=20
   * Never does a contains/substring scan.
   */
  search: (q: string, limit = 20) =>
    http.get<ApiResponse<Product[]>>('/products/search', { params: { q, limit } }),
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export const salesAPI = {
  list:   (params?: Params) => http.get<ApiResponse<Sale[]>>('/sales', { params }),
  get:    (id: string)      => http.get<ApiResponse<Sale>>(`/sales/${id}`),
  create: (data: {
    party_id?: string; date_ad: string; payment_mode: string;
    discount_pct?: number; notes?: string; items: SaleItem[]
  }) => http.post<ApiResponse<Sale>>('/sales', data),
  cancel: (id: string, data?: { reason?: string }) => http.put(`/sales/${id}/cancel`, data || {}),
  stats:  (params?: Params) => http.get<ApiResponse<DashboardStats>>('/sales/summary/stats', { params }),
}

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchasesAPI = {
  list:   (params?: Params) => http.get<ApiResponse<Purchase[]>>('/purchases', { params }),
  get:    (id: string)      => http.get<ApiResponse<Purchase>>(`/purchases/${id}`),
  create: (data: {
    party_id?: string; date_ad: string; payment_mode: string;
    supplier_bill_no?: string; items: PurchaseItem[]
  }) => http.post<ApiResponse<Purchase>>('/purchases', data),
  cancel: (id: string) => http.put(`/purchases/${id}/cancel`),
}

// ─── Returns ──────────────────────────────────────────────────────────────────
export const returnsAPI = {
  list:   (params?: Params) => http.get('/returns', { params }),
  get:    (id: string)      => http.get(`/returns/${id}`),
  create: (data: Params)    => http.post('/returns', data),
}

// ─── Receives (Inventory In) ──────────────────────────────────────────────────
export const receivesAPI = {
  list:   (params?: Params) => http.get('/receives', { params }),
  create: (data: Params)    => http.post('/receives', data),
  delete: (id: string)      => http.delete(`/receives/${id}`),
}

// ─── Stock ────────────────────────────────────────────────────────────────────
export const stockAPI = {
  list:    (params?: Params) => http.get('/stock', { params }),
  batches: (params?: Params) => http.get<ApiResponse<StockBatch[]>>('/stock/batches', { params }),
  summary: ()                => http.get('/stock/summary'),
}

// ─── Parties ──────────────────────────────────────────────────────────────────
export const partiesAPI = {
  customers:      (params?: Params) => http.get<ApiResponse<Party[]>>('/parties/customers', { params }),
  suppliers:      (params?: Params) => http.get<ApiResponse<Party[]>>('/parties/suppliers', { params }),
  get:            (id: string)      => http.get<ApiResponse<Party>>(`/parties/${id}`),
  createCustomer: (data: Partial<Party>) => http.post<ApiResponse<Party>>('/parties/customers', data),
  createSupplier: (data: Partial<Party>) => http.post<ApiResponse<Party>>('/parties/suppliers', data),
  update:         (id: string, data: Partial<Party>) => http.put<ApiResponse<Party>>(`/parties/${id}`, data),
  delete:         (id: string)      => http.delete(`/parties/${id}`),
  ledger:         (id: string, params?: Params) =>
    http.get<ApiResponse<LedgerEntry[]>>(`/parties/${id}/ledger`, { params }),
}

// ─── Accounting ───────────────────────────────────────────────────────────────
export const accountingAPI = {
  // Accounts
  accounts:      (params?: Params) => http.get<ApiResponse<Account[]>>('/accounting/accounts', { params }),
  createAccount: (data: Partial<Account>) => http.post<ApiResponse<Account>>('/accounting/accounts', data),
  updateAccount: (id: string, data: Partial<Account>) => http.put(`/accounting/accounts/${id}`, data),

  // Vouchers (generic — covers receipts, payments, journal)
  vouchers:       (params?: Params) => http.get<ApiResponse<Voucher[]>>('/accounting/vouchers', { params }),
  voucher:        (id: string)      => http.get<ApiResponse<Voucher>>(`/accounting/vouchers/${id}`),
  createVoucher:  (data: { voucher_type: string; voucher_date: string; narration?: string; party_id?: string; lines: VoucherLine[] }) =>
    http.post<ApiResponse<Voucher>>('/accounting/vouchers', data),
  postVoucher:    (id: string)      => http.post(`/accounting/vouchers/${id}/post`, {}),
  reverseVoucher: (id: string)      => http.post(`/accounting/vouchers/${id}/reverse`, {}),

  // Specific voucher endpoints (kept for backwards compat)
  receipts:      (params?: Params) => http.get('/accounting/receipts', { params }),
  createReceipt: (data: Params)    => http.post('/accounting/receipts', data),
  payments:      (params?: Params) => http.get('/accounting/payments', { params }),
  createPayment: (data: Params)    => http.post('/accounting/payments', data),
  journal:       (params?: Params) => http.get('/accounting/journal', { params }),
  createJV:      (data: Params)    => http.post('/accounting/journal', data),

  // Reports
  trialBalance:  (params?: Params) =>
    http.get<ApiResponse<TrialBalanceRow[]>>('/accounting/reports/trial-balance', { params }),
  pnl:           (params?: Params) =>
    http.get<ApiResponse<PnLReport>>('/accounting/reports/pnl', { params }),
  balanceSheet:  (params?: Params) =>
    http.get('/accounting/reports/balance-sheet', { params }),
  partyLedger:   (id: string, params?: Params) =>
    http.get(`/accounting/party-ledger/${id}`, { params }),

  // Periods
  periods:       ()           => http.get('/accounting/periods'),
  lockPeriod:    (id: string) => http.post(`/accounting/periods/${id}/lock`, {}),
  unlockPeriod:  (id: string) => http.post(`/accounting/periods/${id}/unlock`, {}),

  // Account Defaults — COA role mapping for PostingEngine
  accountDefaults:      ()                                    => http.get<ApiResponse<AccountDefault[]>>('/accounting/account-defaults'),
  setAccountDefault:    (data: { role: string; account_id: string; description?: string }) =>
    http.post<ApiResponse<AccountDefault>>('/accounting/account-defaults', data),
  deleteAccountDefault: (role: string)                       => http.delete(`/accounting/account-defaults/${role}`),

  // Voucher Postings — cross-reference between ops records and journal entries
  voucherPostings:  (params?: Params) => http.get<ApiResponse<VoucherPosting[]>>('/accounting/voucher-postings', { params }),
  postingStatus:    (sourceType: string, sourceId: string) =>
    http.get<ApiResponse<PostingStatus>>(`/accounting/posting-status/${sourceType}/${sourceId}`),
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsAPI = {
  dashboard:   (params?: Params) => http.get<ApiResponse<DashboardStats>>('/reports/dashboard', { params }),
  sales:       (params?: Params) => http.get('/reports/sales',        { params }),
  purchases:   (params?: Params) => http.get('/reports/purchases',    { params }),
  profitLoss:  (params?: Params) => http.get('/reports/profit-loss',  { params }),
  stock:       (params?: Params) => http.get('/reports/stock',        { params }),
  stockLedger: (params?: Params) => http.get('/reports/stock-ledger', { params }),
  expiry:      (params?: Params) => http.get('/reports/expiry',       { params }),
  lowStock:    ()                => http.get('/reports/low-stock'),
  partyBalance:(params?: Params) => http.get('/reports/party-balance',{ params }),
}

// ─── Mobile Scanner ───────────────────────────────────────────────────────────
//
// All calls go through the same `http` axios instance as every other API in
// the app.  The request interceptor attaches the current JWT automatically,
// and the response interceptor silently refreshes an expired token and
// retries — so there is no way to get a 401 just from opening the modal.
//
// Endpoints:
//   POST   /scanner/session              — create session (desktop, auth required)
//   GET    /scanner/session/:token/poll  — desktop polls for result (auth required)
//   DELETE /scanner/session/:token       — cancel session (auth required)
//   GET    /scanner/network-info         — returns server LAN IP for QR URL (auth required)
//
export const scannerAPI = {
  /**
   * Create a new scanning session.
   * Returns { token, expiresAt, ttlSeconds }.
   */
  createSession: (context: 'sales' | 'purchase') =>
    http.post<ApiResponse<{ token: string; expiresAt: number; ttlSeconds: number }>>(
      '/scanner/session',
      { context },
    ),

  /**
   * Poll for a scan result from the mobile device.
   * Returns { status, result }.
   */
  pollSession: (token: string) =>
    http.get<ApiResponse<{ status: string; result: unknown }>>(
      `/scanner/session/${token}/poll`,
    ),

  /**
   * Cancel / clean up a session when the modal closes.
   */
  cancelSession: (token: string) =>
    http.delete(`/scanner/session/${token}`),

  /**
   * Ask the server what LAN IP it is listening on.
   * Used to build a QR URL the mobile phone can actually reach
   * (avoids encoding "localhost" which only works on the desktop itself).
   * Returns { ip, port }.
   */
  networkInfo: () =>
    http.get<ApiResponse<{ ip: string; port: number }>>(
      '/scanner/network-info',
    ),
}

// ─── Date utility ─────────────────────────────────────────────────────────────
export const dateAPI = {
  today:    ()                       => http.get('/date/today'),
  adToBS:   (date: string)           => http.get('/date/ad-to-bs', { params: { date } }),
  bsToAD:   (y: number, m: number, d: number) =>
    http.get('/date/bs-to-ad', { params: { year: y, month: m, day: d } }),
  calendar: (y: number, m: number)   => http.get('/date/calendar', { params: { year: y, month: m } }),
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsAPI = {
  company:          ()           => http.get<ApiResponse<Company>>('/settings/company'),
  updateCompany:    (data: Partial<Company>) => http.put('/settings/company', data),
  uploadLogo:       (file: File) => {
    const fd = new FormData(); fd.append('logo', file)
    return http.post('/settings/company/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  users:            (params?: Params) => http.get<ApiResponse<User[]>>('/settings/users', { params }),
  createUser:       (data: Partial<User> & { password: string }) =>
    http.post<ApiResponse<User>>('/settings/users', data),
  updateUser:       (id: string, data: Partial<User>) => http.put(`/settings/users/${id}`, data),
  templates:        () => http.get<ApiResponse<InvoiceTemplate[]>>('/settings/invoice-templates'),
  createTemplate:   (data: Params) => http.post('/settings/invoice-templates', data),
  updateTemplate:   (id: string, data: Params) => http.put(`/settings/invoice-templates/${id}`, data),
  deleteTemplate:   (id: string) => http.delete(`/settings/invoice-templates/${id}`),
  setDefaultTemplate:(id: string) => http.put(`/settings/invoice-templates/${id}/set-default`),
  fiscalYears:      () => http.get<ApiResponse<FiscalYear[]>>('/settings/fiscal-years'),
  createFiscalYear: (data: Params) => http.post('/settings/fiscal-years', data),
  auditLog:         (params?: Params) => http.get<ApiResponse<AuditLog[]>>('/settings/audit-log', { params }),
}
