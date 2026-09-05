import http, { REFRESH_TOKEN_KEY } from '@/services/http'
import type { ApiResponse, Company, User, Sale, SaleItem, Purchase, PurchaseItem,
  Product, Party, Account, AccountDefault, Voucher, VoucherLine,
  VoucherPosting, PostingStatus, DashboardStats, PnLReport,
  TrialBalanceRow, LedgerEntry, StockBatch, OpeningInventoryBatch, InvoiceTemplate, FiscalYear, AuditLog,
  CompanyPreferences, Backup, AccountLedgerResponse, UserCompany,
  PurchaseSuggestion, PurchaseSuggestionSummary, PurchaseSuggestionSettings,
  PurchaseOrder, PurchaseOrderItem,
  CustomerCreditProfile, CreditRiskDashboard, CreditRiskHistoryEntry, CreditRiskSettings,
  CreditRiskCheckResult, Approval } from '@/types'
import type { ScannedProduct } from '@/types/scanner'

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
  // Sends the current refresh token so the server can revoke that specific
  // session (see routes/auth.js POST /auth/logout) — without this, a copy
  // of the token (already leaked, or retried after this call) would keep
  // working until it naturally expired.
  logout: () => http.post('/auth/logout', { refresh_token: localStorage.getItem(REFRESH_TOKEN_KEY) || undefined }),
  /** "Log out everywhere" — revokes every refresh-token session for this user. */
  revokeAllSessions: () => http.post('/auth/revoke-sessions'),
  me:             () => http.get<ApiResponse<{ user: User; company: Company }>>('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) =>
    http.put('/auth/change-password', data),
  refresh: (data: { refresh_token: string }) =>
    http.post<ApiResponse<{ token: string; refresh_token: string }>>('/auth/refresh', data),
  /** Step-up confirmation: checks the current session's user's PIN or password.
   *  On success returns a short-lived stepUpToken to attach as
   *  X-Step-Up-Token on subsequent sensitive requests (see stepUpToken.ts).
   *  `action`, when provided, scopes the returned token to that one
   *  mandatory (non-toggleable) action only — e.g. 'voucherEdit' — instead
   *  of the general-purpose token used for optional/toggleable sensitive
   *  actions. Omit it for the general case. */
  verifyPassword: (credential: { password?: string; pin?: string; action?: string }) =>
    http.post<ApiResponse<{ stepUpToken: string; expiresIn: number }>>('/auth/verify-password', credential),
  /** Sets/changes the 6-digit Security PIN. Always requires the current
   *  account password, even for a first-time PIN. */
  setSecurityPin: (data: { pin: string; current_password: string }) =>
    http.post<ApiResponse<{ stepUpToken: string; expiresIn: number }>>('/auth/security-pin', data),

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

// ─── Multi-Company ──────────────────────────────────────────────────────────
export interface SwitchCompanyResponse {
  token:         string
  refresh_token: string
  user:          User
  company:       Company
}

export const companiesAPI = {
  /** Companies the current user can access (with is_default / is_current flags). */
  list: () => http.get<ApiResponse<UserCompany[]>>('/companies'),
  create: (data: Partial<Company> & { make_default?: boolean }) =>
    http.post<ApiResponse<Company>>('/companies', data),
  update: (id: string, data: Partial<Company>) =>
    http.put<ApiResponse<Company>>(`/companies/${id}`, data),
  /** Deactivates ("deletes") a company. Always requires confirmPassword —
   *  call via useSensitiveConfirm()'s runWithConfirm() so the password
   *  modal is handled automatically. Reversible via restore(). */
  remove: (id: string, confirmPassword?: string) =>
    http.delete<ApiResponse<{ id: string }>>(`/companies/${id}`, { data: { confirmPassword } }),
  restore: (id: string) =>
    http.post<ApiResponse<Company>>(`/companies/${id}/restore`),
  /** Re-issues a token scoped to the given company. Caller must swap the token in. */
  switchTo: (id: string) =>
    http.post<ApiResponse<SwitchCompanyResponse>>(`/companies/${id}/switch`),
  setDefault: (id: string) =>
    http.put<ApiResponse<{ id: string }>>(`/companies/${id}/default`),
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsAPI = {
  list:       (params?: Params) => http.get<ApiResponse<Product[]>>('/products', { params }),
  get:        (id: string)      => http.get<ApiResponse<Product>>(`/products/${id}`),
  create:     (data: Partial<Product>) => http.post<ApiResponse<Product>>('/products', data),
  update:     (id: string, data: Partial<Product>) => http.put<ApiResponse<Product>>(`/products/${id}`, data),
  delete:     (id: string)      => http.delete(`/products/${id}`),
  stock:      (id: string)      => http.get(`/products/${id}/stock`),
  adjust:     (id: string, data: {
    qty: number; reason: string
    batch_no?: string; expiry?: string; purchase_rate?: number
  }) => http.post(`/products/${id}/adjust`, data),
  categories: ()                => http.get('/products/categories'),

  /**
   * Existing opening-inventory batches for a product (Edit Product's
   * "Opening Inventory" section) — each prior entry (Batch A, Batch B, ...)
   * as its own separate line. Never used to edit/merge/delete a batch.
   */
  openingBatches: (id: string)  => http.get<ApiResponse<OpeningInventoryBatch[]>>(`/products/${id}/opening-batches`),

  /**
   * Prefix search — returns products whose name STARTS WITH `q`.
   * Uses GET /products/search?q=par&limit=20
   * Never does a contains/substring scan.
   */
  search: (q: string, limit = 20) =>
    http.get<ApiResponse<Product[]>>('/products/search', { params: { q, limit } }),

  /**
   * Pre-fetches the next auto-generated barcode (same global
   * product_auto_barcode_seq / nextAutoBarcode() used as the fallback on
   * create) so the Create Product form can show it immediately instead of
   * only after submit. Purely a preview — the backend still generates its
   * own fallback barcode on create if none is submitted.
   */
  nextBarcode: () => http.get<ApiResponse<{ barcode: string }>>('/products/next-barcode'),
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export const salesAPI = {
  list:   (params?: Params) => http.get<ApiResponse<Sale[]>>('/sales', { params }),
  get:    (id: string)      => http.get<ApiResponse<Sale>>(`/sales/${id}`),
  create: (data: {
    party_id?: string; date_ad: string; payment_mode: string;
    discount_pct?: number; notes?: string; items: SaleItem[];
    /** Present only when this create is the offline sync engine replaying
     *  a queued sale (see src/offline/syncEngine.ts) — omitted entirely
     *  for a normal online sale, identical to before this field existed. */
    client_txn_id?: string
  }) => http.post<ApiResponse<Sale>>('/sales', data),
  cancel: (id: string, data?: { reason?: string }) => http.put(`/sales/${id}/cancel`, data || {}),
  stats:  (params?: Params) => http.get<ApiResponse<DashboardStats>>('/sales/summary/stats', { params }),
  /**
   * Sales List inline edit — updates ONLY payment_mode on an existing sale.
   * Does not touch totals, stock, accounting, or vouchers.
   */
  updatePaymentMode: (id: string, payment_mode: string) =>
    http.put<ApiResponse<Sale>>(`/sales/${id}/payment-mode`, { payment_mode }),
  /**
   * Sales List inline edit — updates ONLY date_ad (+ derived date_bs) on
   * an existing sale. Does not touch items, totals, stock, or vouchers.
   * confirmPassword is the legacy step-up fallback (see useSensitiveConfirm) —
   * omitted on the normal path, where a cached step-up token header covers it.
   */
  updateDate: (id: string, date_ad: string, confirmPassword?: string) =>
    http.put<ApiResponse<Sale>>(`/sales/${id}/date`, { date_ad, confirmPassword }),
}

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchasesAPI = {
  list:   (params?: Params) => http.get<ApiResponse<Purchase[]>>('/purchases', { params }),
  get:    (id: string)      => http.get<ApiResponse<Purchase>>(`/purchases/${id}`),
  create: (data: {
    party_id?: string; date_ad: string; payment_mode: string;
    supplier_bill_no?: string; items: PurchaseItem[]; purchase_order_id?: string
  }) => http.post<ApiResponse<Purchase>>('/purchases', data),
  cancel: (id: string) => http.put(`/purchases/${id}/cancel`),
}

// ─── Returns ──────────────────────────────────────────────────────────────────
export const returnsAPI = {
  list:   (params?: Params) => http.get('/returns', { params }),
  get:    (id: string)      => http.get(`/returns/${id}`),
  create: (data: Params)    => http.post('/returns', data),
}

// ─── Sales Returns (dedicated module) ──────────────────────────────────────────
export const salesReturnsAPI = {
  listSales: (params?: Params) => http.get<ApiResponse<Sale[]>>('/sales', { params }),
  getSale:   (id: string)      => http.get<ApiResponse<Sale>>(`/sales/${id}`),
  list:      (params?: Params) => http.get('/returns', { params: { ...params, type: 'sales' } }),
  create:    (data: Params)    => http.post('/returns/sales', data),
}

// ─── Purchase Returns (dedicated module) ───────────────────────────────────────
export const purchaseReturnsAPI = {
  listPurchases: (params?: Params) => http.get<ApiResponse<Purchase[]>>('/purchases', { params }),
  getPurchase:   (id: string)      => http.get<ApiResponse<Purchase>>(`/purchases/${id}`),
  list:          (params?: Params) => http.get('/returns', { params: { ...params, type: 'purchase' } }),
  create:        (data: Params)    => http.post('/returns/purchase', data),
}

// ─── Stock ────────────────────────────────────────────────────────────────────
export const stockAPI = {
  list:    (params?: Params) => http.get('/stock', { params }),
  batches: (params?: Params) => http.get<ApiResponse<StockBatch[]>>('/stock/batches', { params }),
  summary: ()                => http.get('/stock/summary'),
}

// ─── Smart Purchase Suggestions ─────────────────────────────────────────────────
export const purchaseSuggestionsAPI = {
  list:    (params?: Params) => http.get<ApiResponse<PurchaseSuggestion[]>>('/purchase-suggestions', { params }),
  summary: (params?: Params) => http.get<ApiResponse<PurchaseSuggestionSummary>>('/purchase-suggestions/summary', { params }),
  getSettings: () => http.get<ApiResponse<PurchaseSuggestionSettings>>('/purchase-suggestions/settings'),
  updateSettings: (data: Partial<PurchaseSuggestionSettings>) =>
    http.put<ApiResponse<PurchaseSuggestionSettings>>('/purchase-suggestions/settings', data),
  createPurchaseOrders: (data: { items: { product_id: string; qty: number; rate?: number; supplier_id?: string }[] }) =>
    http.post<ApiResponse<PurchaseOrder[]>>('/purchase-suggestions/create-purchase-orders', data),
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────────
export const purchaseOrdersAPI = {
  list:    (params?: Params) => http.get<ApiResponse<PurchaseOrder[]>>('/purchase-orders', { params }),
  get:     (id: string)      => http.get<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`),
  create:  (data: { supplier_id?: string; expected_date?: string; notes?: string; items: Partial<PurchaseOrderItem>[] }) =>
    http.post<ApiResponse<PurchaseOrder>>('/purchase-orders', data),
  approve: (id: string) => http.put<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/approve`),
  cancel:  (id: string) => http.put<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/cancel`),
}

// ─── Credit-Risk & Bad-Debt Scoring ────────────────────────────────────────────────
export const creditRiskAPI = {
  dashboard: () => http.get<ApiResponse<CreditRiskDashboard>>('/credit-risk/dashboard'),
  recalculateAll: () => http.post<ApiResponse<{ count: number }>>('/credit-risk/recalculate-all'),
  listCustomers: (params?: Params) => http.get<ApiResponse<CustomerCreditProfile[]>>('/credit-risk/customers', { params }),
  getCustomer: (customerId: string) => http.get<ApiResponse<{ customer: any; profile: CustomerCreditProfile }>>(`/credit-risk/customers/${customerId}`),
  getHistory: (customerId: string, params?: Params) => http.get<ApiResponse<CreditRiskHistoryEntry[]>>(`/credit-risk/customers/${customerId}/history`, { params }),
  recalculate: (customerId: string) => http.post<ApiResponse<CustomerCreditProfile>>(`/credit-risk/customers/${customerId}/recalculate`),
  check: (customerId: string, invoiceAmount: number) =>
    http.get<ApiResponse<CreditRiskCheckResult>>(`/credit-risk/customers/${customerId}/check`, { params: { invoice_amount: invoiceAmount } }),
  writeOff: (customerId: string, data: { amount: number; reason: string; sale_id?: string }) =>
    http.post(`/credit-risk/customers/${customerId}/write-off`, data),
  getSettings: () => http.get<ApiResponse<CreditRiskSettings>>('/credit-risk/settings'),
  updateSettings: (data: Partial<CreditRiskSettings>) => http.put<ApiResponse<CreditRiskSettings>>('/credit-risk/settings', data),
}

// ─── Approvals (generic) ────────────────────────────────────────────────────────────
export const approvalsAPI = {
  list: (params?: Params) => http.get<ApiResponse<Approval[]>>('/approvals', { params }),
  get:  (id: string) => http.get<ApiResponse<Approval>>(`/approvals/${id}`),
  decide: (id: string, decision: 'approve' | 'reject', reason?: string) =>
    http.put<ApiResponse<Approval>>(`/approvals/${id}/decide`, { decision, reason }),
}

// ─── Notifications (generic) ────────────────────────────────────────────────────────
export const notificationsAPI = {
  list: (params?: Params) => http.get('/notifications', { params }),
  markRead: (id: string) => http.put(`/notifications/${id}/read`),
  markAllRead: () => http.put('/notifications/read-all'),
}

// ─── Reminders ────────────────────────────────────────────────────────────────
export const remindersAPI = {
  list:    (params?: Params) => http.get<ApiResponse<any[]>>('/reminders', { params }),
  get:     (id: string)      => http.get<ApiResponse<any>>(`/reminders/${id}`),
  counts:  () => http.get<ApiResponse<{ today: number; overdue: number; upcoming: number; completed: number }>>('/reminders/counts'),
  types:   () => http.get<ApiResponse<{ value: string; label: string }[]>>('/reminders/types'),
  assignableUsers: () => http.get<ApiResponse<{ id: string; name: string }[]>>('/reminders/assignable-users'),
  create:  (data: Record<string, unknown>) => http.post<ApiResponse<any>>('/reminders', data),
  update:  (id: string, data: Record<string, unknown>) => http.patch<ApiResponse<any>>(`/reminders/${id}`, data),
  delete:  (id: string) => http.delete(`/reminders/${id}`),
  complete: (id: string) => http.post<ApiResponse<any>>(`/reminders/${id}/complete`),
  reopen:   (id: string) => http.post<ApiResponse<any>>(`/reminders/${id}/reopen`),
  snooze:  (id: string, body: { preset?: string; snoozed_until?: string; timezone?: string }) =>
    http.post<ApiResponse<any>>(`/reminders/${id}/snooze`, body),
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
    http.get<ApiResponse<{ party: Party; rows: LedgerEntry[]; summary?: unknown; closingBalance?: number; closing_balance?: number; opening_balance?: number }>>(`/parties/${id}/ledger`, { params }),
}

// ─── Accounting ───────────────────────────────────────────────────────────────
export const accountingAPI = {
  // Accounts
  accounts:      (params?: Params) => http.get<ApiResponse<Account[]>>('/accounting/accounts', { params }),
  createAccount: (data: Partial<Account>) => http.post<ApiResponse<Account>>('/accounting/accounts', data),
  updateAccount: (id: string, data: Partial<Account>) => http.put(`/accounting/accounts/${id}`, data),

  // General ledger for any Chart-of-Accounts account (Cash, Bank, Inventory,
  // Sales, Expenses, Equity, ...) — distinct from partiesAPI.ledger, which is
  // for an individual customer/supplier. Pre-existing backend route
  // (accounting.js GET /ledger/:account_id); this is just its first frontend
  // consumer.
  ledger:        (accountId: string, params?: Params) =>
    http.get<ApiResponse<AccountLedgerResponse>>(`/accounting/ledger/${accountId}`, { params }),

  // Vouchers (generic — covers receipts, payments, journal)
  vouchers:       (params?: Params) => http.get<ApiResponse<Voucher[]>>('/accounting/vouchers', { params }),
  voucher:        (id: string)      => http.get<ApiResponse<Voucher>>(`/accounting/vouchers/${id}`),
  createVoucher:  (data: { voucher_type: string; voucher_date: string; narration?: string; party_id?: string; lines: VoucherLine[] }) =>
    http.post<ApiResponse<Voucher>>('/accounting/vouchers', data),
  postVoucher:    (id: string)      => http.post(`/accounting/vouchers/${id}/post`, {}),
  reverseVoucher: (id: string)      => http.post(`/accounting/vouchers/${id}/reverse`, {}),
  /** Password-protected edit of an already-POSTED voucher — same id/no, journal recalculated. */
  editVoucher: (id: string, data: { reason: string; voucher_date?: string; party_id?: string | null; narration?: string; lines: VoucherLine[] }) =>
    http.put<ApiResponse<{ voucher: Voucher; correction_voucher_id: string }>>(`/accounting/vouchers/${id}/edit`, data),
  voucherEditHistory: (id: string) => http.get<ApiResponse<any[]>>(`/accounting/vouchers/${id}/edit-history`),

  // Specific voucher endpoints (kept for backwards compat)
  receipts:      (params?: Params) => http.get('/accounting/receipts', { params }),
  createReceipt: (data: Params)    => http.post('/accounting/receipts', data),
  editReceipt:   (id: string, data: { reason: string; party_id?: string | null; date?: string; amount: number; account_id: string; narration?: string }) =>
    http.put(`/accounting/receipts/${id}/edit`, data),
  payments:      (params?: Params) => http.get('/accounting/payments', { params }),
  createPayment: (data: Params)    => http.post('/accounting/payments', data),
  editPayment:   (id: string, data: { reason: string; party_id?: string | null; date?: string; amount: number; account_id: string; narration?: string }) =>
    http.put(`/accounting/payments/${id}/edit`, data),
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

  // Account Defaults — COA role mapping for PostingEngine (Engine Setup)
  accountDefaults:      ()                                    => http.get<ApiResponse<AccountDefault[]>>('/accounting/account-defaults'),
  setAccountDefault:    (data: { role: string; account_id: string; description?: string }) =>
    http.post<ApiResponse<AccountDefault>>('/accounting/account-defaults', data),
  deleteAccountDefault: (role: string)                       => http.delete(`/accounting/account-defaults/${role}`),
  resetAccountDefault:  (role: string)                       =>
    http.post<ApiResponse<AccountDefault>>(`/accounting/account-defaults/${role}/reset`, {}),
  initializeAccountDefaults: ()                              =>
    http.post<ApiResponse<{ created: Array<{ role: string; account_id: string; account_name: string }> }>>(
      '/accounting/account-defaults/initialize', {},
    ),

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

// ─── Barcode Scanner ────────────────────────────────────────────────────────────
//
// Product lookups used by the local (same-device) camera scanner. Calls go
// through the same `http` axios instance as every other API in the app —
// the request interceptor attaches the current JWT automatically, and the
// response interceptor silently refreshes an expired token and retries.
//
// Endpoints:
//   GET /scanner/products/barcode/:code — barcode lookup (auth required)
//   GET /scanner/products/fuzzy?q=...   — contains search, barcode-miss fallback (auth required)
//
export const scannerAPI = {
  /**
   * Product lookups used by the instant camera scanner (useLocalScanner).
   *
   * lookupBarcode() returns the FULL product shape (current_stock +
   * batches) — it's also used to hydrate a fuzzy-search pick into a
   * complete ScannedProduct before returning the final scan result.
   *
   * `timeoutMs` overrides the default 20s app-wide API timeout
   * (config.apiTimeout) for just this call — see useLocalScanner.ts's
   * searchBarcode(), which passes a short one (SCAN_LOOKUP_TIMEOUT_MS)
   * so a live camera scan under a dead-but-still-"connected" network
   * (Wi-Fi associated, no actual internet — the case navigator.onLine
   * can't detect) fails fast into the offline IndexedDB fallback instead
   * of leaving the scanner stuck waiting out the full 20s per code. Every
   * other caller (manual barcode entry, product search) keeps the
   * default — those are deliberate one-off submits where a slower
   * network is better tolerated than a scan is.
   */
  lookupBarcode: (code: string, opts?: { timeoutMs?: number }) =>
    http.get<ApiResponse<ScannedProduct>>(
      `/scanner/products/barcode/${encodeURIComponent(code)}`,
      opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    ),
  fuzzySearch: (q: string, limit = 15) =>
    http.get<ApiResponse<Array<Omit<ScannedProduct, 'current_stock' | 'batches'>>>>(
      '/scanner/products/fuzzy',
      { params: { q, limit } },
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
  updateUser:       (id: string, data: Partial<User> & { password?: string }) => http.put(`/settings/users/${id}`, data),
  templates:        () => http.get<ApiResponse<InvoiceTemplate[]>>('/settings/invoice-templates'),
  createTemplate:   (data: Params) => http.post('/settings/invoice-templates', data),
  updateTemplate:   (id: string, data: Params) => http.put(`/settings/invoice-templates/${id}`, data),
  deleteTemplate:   (id: string) => http.delete(`/settings/invoice-templates/${id}`),
  setDefaultTemplate:(id: string) => http.put(`/settings/invoice-templates/${id}/set-default`),
  fiscalYears:      () => http.get<ApiResponse<FiscalYear[]>>('/settings/fiscal-years'),
  createFiscalYear: (data: Params) => http.post('/settings/fiscal-years', data),
  auditLog:         (params?: Params) => http.get<ApiResponse<AuditLog[]>>('/settings/audit-log', { params }),

  // ── Preferences (General / Sales & Purchase / Accounting & Vouchers /
  //    Notifications / sensitive-action toggles) — companies.settings jsonb.
  preferences:       () => http.get<ApiResponse<CompanyPreferences>>('/settings/preferences'),
  updatePreferences: (data: Partial<CompanyPreferences> & { confirmPassword?: string }) =>
    http.put<ApiResponse<CompanyPreferences>>('/settings/preferences', data),

  // ── Local Backup & Cloud ─────────────────────────────────────────────────
  backups:        (params?: Params) => http.get<ApiResponse<Backup[]>>('/settings/backup', { params }),
  runBackup:      () => http.post<ApiResponse<Backup>>('/settings/backup/run'),
  verifyBackup:   (id: string) => http.post<ApiResponse<Backup>>(`/settings/backup/${id}/verify`),
  downloadBackup: (id: string) => http.get(`/settings/backup/${id}/download`, { responseType: 'blob' }),
}

// ─── Cloud Storage Integration (new, additive) ─────────────────────────────────
export interface CloudStorageProviderInfo {
  id:         string
  label:      string
  logoKey:    string
  configured: boolean
}

export interface CloudStorageConnection {
  provider:           string
  label:              string
  logoKey:            string
  status:             'connected' | 'disconnected' | 'expired' | 'error'
  accountEmail:       string | null
  accountDisplayName?: string | null
  lastSyncAt:         string | null
  lastSyncStatus?:    string | null
  lastErrorMessage?:  string | null
  isDefault:          boolean
  autoUploadEnabled:  boolean
  folderName:         string
  connectedAt?:       string | null
  tokenExpiresAt?:    string | null
}

export const cloudStorageAPI = {
  providers:    () => http.get<ApiResponse<CloudStorageProviderInfo[]>>('/cloud-storage/providers'),
  connections:  () => http.get<ApiResponse<CloudStorageConnection[]>>('/cloud-storage/connections'),
  connection:   (provider: string) => http.get<ApiResponse<CloudStorageConnection>>(`/cloud-storage/connections/${provider}`),
  connect:      (provider: string) => http.post<ApiResponse<{ authUrl: string }>>(`/cloud-storage/connections/${provider}/connect`),
  disconnect:   (provider: string) => http.post<ApiResponse<{ success: boolean }>>(`/cloud-storage/connections/${provider}/disconnect`),
  testConnection: (provider: string) => http.post<ApiResponse<{ ok: boolean; message?: string }>>(`/cloud-storage/connections/${provider}/test`),
  updateSettings: (provider: string, data: { folderName?: string; autoUploadEnabled?: boolean }) =>
    http.put<ApiResponse<CloudStorageConnection>>(`/cloud-storage/connections/${provider}/settings`, data),
  setDefault:   (provider: string) => http.post<ApiResponse<CloudStorageConnection[]>>('/cloud-storage/default', { provider }),
}

// ─── Devices & Sync ────────────────────────────────────────────────────────────
// Backs Settings → Devices & Sync (DevicesSyncSection.tsx) and the pre-login
// LAN connect flow (modules/connect/ServerConnectScreen.tsx). Both talk to
// the same backend routes — see erp-unified-backend/src/routes/devices.js —
// deliberately: there is exactly one device-registration/pairing mechanism,
// used both from inside the authenticated app and from the pre-login screen.
export interface DeviceInfo {
  id:                string
  device_name:       string
  platform:           string | null
  app_version:        string | null
  status:             'active' | 'revoked'
  user_id:            string | null
  user_name?:         string | null
  branch_id:          string | null
  registered_at:      string
  last_seen_at:       string | null
  last_synced_at?:    string | null
  pending_conflicts:  number
}

export interface SyncConflict {
  id:             string
  conflict_type:  string
  reason:         string
  device_id?:     string | null
  device_name?:   string | null
  created_at:     string
  resolved_at?:   string | null
}

export const devicesAPI = {
  list: () => http.get<ApiResponse<DeviceInfo[]>>('/devices'),

  /** Creates/updates THIS device's own registration. `device_secret`, when
   *  returned, must be persisted (see config/serverConnection.ts) and sent
   *  back as X-Device-Secret on later register/heartbeat calls — see the
   *  security audit note in erp-unified-backend/src/routes/devices.js. */
  register: (data: { device_id: string; device_name: string; platform?: string; app_version?: string; branch_id?: string }) =>
    http.post<ApiResponse<DeviceInfo & { device_secret?: string }>>('/devices/register', data),

  heartbeat: (deviceId: string) =>
    http.post<ApiResponse<{ status: string; last_seen_at: string }>>('/devices/heartbeat', { device_id: deviceId }, { headers: { 'X-Device-Id': deviceId } }),

  rename: (id: string, device_name: string) =>
    http.patch<ApiResponse<DeviceInfo>>(`/devices/${id}`, { device_name }),

  revoke: (id: string) =>
    http.post<ApiResponse<{ success: boolean }>>(`/devices/${id}/revoke`),

  conflicts: (status: 'open' | 'resolved' = 'open') =>
    http.get<ApiResponse<SyncConflict[]>>('/devices/conflicts', { params: { status } }),

  resolveConflict: (id: string, note?: string) =>
    http.post<ApiResponse<SyncConflict>>(`/devices/conflicts/${id}/resolve`, { note }),

  /** Authenticated owner/admin generates a short-lived pairing token
   *  (shown as a QR + a plain-text code) for another device to claim. */
  pairStart: (data?: { branch_id?: string }) =>
    http.post<ApiResponse<{ token: string; expires_at: string; ttl_seconds: number }>>('/devices/pair/start', data),

  /** PUBLIC — no auth token needed/sent, because the device calling this
   *  hasn't logged in yet (that's the whole point of pre-login pairing).
   *  http.ts still attaches an Authorization header if a stale one exists
   *  in storage, which is harmless here since this route ignores it. */
  pairClaim: (data: { token: string; device_id: string; device_name: string; platform?: string; app_version?: string }) =>
    http.post<ApiResponse<{ device: DeviceInfo & { device_secret?: string }; company_id: string; branch_id: string | null }>>('/devices/pair/claim', data),
}
