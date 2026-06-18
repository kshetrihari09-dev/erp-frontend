// ─── API Response Wrapper ──────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  data:    T
  message?: string
  errors?:  Record<string, string[]>
  pagination?: Pagination
}

export interface Pagination {
  page:        number
  limit:       number
  total:       number
  total_pages: number
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'accountant' | 'cashier' | 'viewer'

export interface User {
  id:              string
  name:            string
  email:           string | null
  phone?:          string | null
  phone_verified?: boolean
  email_verified?: boolean
  role:            UserRole
  is_active:       boolean
  company_id:      string
  created_at:      string
  last_login_at?:  string
}

export interface Company {
  id:              string
  name:            string
  address?:        string
  phone?:          string
  email?:          string
  pan_no?:         string
  registration_no?: string
  logo_url?:       string
  date_system:     'BS' | 'AD'
  invoice_prefix:  string
  currency:        string
  vat_percent:     number
}

export interface AuthState {
  token:           string | null
  user:            User | null
  company:         Company | null
  isAuthenticated: boolean
}

// ─── Products / Inventory ─────────────────────────────────────────────────────
export interface Product {
  id:            string
  item_code:     string
  name:          string
  generic_name?: string
  company_name?: string
  category?:     string
  unit:          string
  mrp:           number
  sales_rate:    number
  purchase_rate: number
  tax_rate?:     number   // actual DB column name
  vat_percent?:  number   // aliased in /search route; use tax_rate ?? vat_percent ?? 13
  cc_percent?:   number   // actual DB column name
  cc_pct?:       number   // aliased in /search route
  min_stock:     number
  current_stock: number
  is_active:     boolean
  created_at?:   string
}

export interface StockBatch {
  id:           string
  product_id:   string
  product_name: string
  item_code:    string
  batch_no?:    string
  expiry?:      string
  expiry_date?: string
  qty_available: number
  purchase_rate: number
  sales_rate:   number
}

// ─── Parties ──────────────────────────────────────────────────────────────────
export type PartyType = 'customer' | 'supplier'

export interface Party {
  id:                   string
  code:                 string
  name:                 string
  type:                 PartyType
  phone?:               string
  email?:               string
  address?:             string
  pan_no?:              string
  credit_limit?:        number
  credit_days?:         number
  opening_balance:      number
  current_balance:      number
  is_active:            boolean
  created_at:           string
  control_account_id?:  string
  control_account_name?: string
  control_account_code?: string
}

export interface LedgerEntry {
  date:            string
  reference:       string
  description:     string
  debit:           number
  credit:          number
  running_balance: number
  voucher_type?:   string
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export type PaymentMode   = 'cash' | 'credit' | 'bank' | 'cheque' | 'upi' | 'card' | 'online'
export type InvoiceStatus = 'active' | 'cancelled' | 'returned'

export interface SaleItem {
  product_id:    string
  product_name:  string
  batch_no?:     string
  expiry?:       string
  qty:           number
  bonus?:        number
  rate:          number
  discount_pct?: number
  cc_pct?:       number
  vat_pct?:      number
  amount:        number
  cc_amount?:    number
}

export interface Sale {
  id:           string
  invoice_no:   string
  date_ad:      string
  date_bs?:     string
  party_id?:    string
  party_name?:  string
  payment_mode: PaymentMode
  subtotal:     number
  discount_pct: number
  discount_amt: number
  net_total:    number
  paid_amount:  number
  due_amount:   number
  notes?:       string
  status:       InvoiceStatus
  items?:       SaleItem[]
  created_at:   string
}

// ─── Purchases ────────────────────────────────────────────────────────────────
export interface PurchaseItem {
  product_id:   string
  product_name: string
  batch_no?:    string
  expiry?:      string
  qty:          number
  bonus?:       number
  rate:         number
  vat_pct?:     number
  amount:       number
}

export interface Purchase {
  id:            string
  bill_no:       string
  date_ad:       string
  party_id?:     string
  party_name?:   string
  payment_mode:  PaymentMode
  net_total:     number
  paid_amount:   number
  due_amount:    number
  status:        'active' | 'cancelled'
  items?:        PurchaseItem[]
  created_at:    string
}

// ─── Accounting ───────────────────────────────────────────────────────────────
export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity'
export type VoucherType = 'SALES' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'JOURNAL' | 'CONTRA' | 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'OPENING'
export type VoucherStatus = 'draft' | 'posted' | 'cancelled' | 'reversed'

export interface Account {
  id:           string
  account_code: string
  name:         string
  account_type: AccountType
  sub_type?:    string
  is_group:     boolean
  parent_id?:   string
  balance:      number
  is_active:    boolean
}

export interface VoucherLine {
  account_id:   string
  account_name?: string
  description?: string
  debit:        number
  credit:       number
  party_id?:    string
}

export interface Voucher {
  id:           string
  voucher_no:   string
  voucher_type: VoucherType
  voucher_date: string
  party_id?:    string
  party_name?:  string
  narration?:   string
  total_amount: number
  status:       VoucherStatus
  lines?:       VoucherLine[]
  created_at:   string
}

export interface TrialBalanceRow {
  account_id:     string
  account_code:   string
  name:           string
  account_type:   AccountType
  opening_debit:  number
  opening_credit: number
  period_debit:   number
  period_credit:  number
  closing_debit:  number
  closing_credit: number
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export interface DashboardStats {
  today?:             { sales_total: number; sales_count: number; purchase_total: number }
  this_month?:        { revenue: number; purchases: number; profit: number }
  receivable:         number
  payable:            number
  stock_value:        number
  low_stock_items:    number
  expiry_alerts:      number
  total_customers:    number
  total_products:     number
  cash_balance?:      number
  bank_balance?:      number
}

export interface PnLReport {
  income:     Array<{ name: string; balance: number }>
  expenses:   Array<{ name: string; balance: number }>
  gross_profit: number
  net_profit:   number
  total_income: number
  total_expense:number
}


// ─── Posting Engine ───────────────────────────────────────────────────────────
export interface AccountDefault {
  id:           string
  role:         string
  description?: string
  is_active:    boolean
  account_id:   string
  account_code: string
  account_name: string
  account_type: AccountType
  sub_type?:    string
}

export const ACCOUNT_DEFAULT_ROLES = [
  { value: 'accounts_receivable', label: 'Accounts Receivable',  hint: 'Debit side of credit sales'         },
  { value: 'accounts_payable',    label: 'Accounts Payable',     hint: 'Credit side of credit purchases'    },
  { value: 'sales_revenue',       label: 'Sales Revenue',        hint: 'Credit side of all sales'           },
  { value: 'purchase_expense',    label: 'Purchase / Inventory', hint: 'Debit side of purchases (expense)'  },
  { value: 'inventory',           label: 'Inventory Asset',      hint: 'Debit side of purchase (asset COA)' },
  { value: 'cogs',                label: 'Cost of Goods Sold',   hint: 'Debit on sale when using COGS'      },
  { value: 'cash',                label: 'Cash in Hand',         hint: 'Used for cash sales / payments'     },
  { value: 'bank',                label: 'Bank Account',         hint: 'Used for bank / UPI / card payments'},
  { value: 'tax_payable',         label: 'Tax Payable (VAT)',    hint: 'Credit side of output VAT'          },
  { value: 'tax_input',           label: 'Input Tax Credit',     hint: 'Debit side of input VAT'            },
  { value: 'discount_given',      label: 'Discount Expense',     hint: 'Discount given on sales'            },
  { value: 'discount_received',   label: 'Discount Income',      hint: 'Discount received on purchases'     },
] as const

export type AccountDefaultRole = typeof ACCOUNT_DEFAULT_ROLES[number]['value']

export interface VoucherPosting {
  id:               string
  source_type:      string
  source_ref:       string | null
  posted_at:        string | null
  sale_id?:         string
  purchase_id?:     string
  receive_id?:      string
  voucher_id:       string
  voucher_no:       string
  voucher_status:   VoucherStatus
  total_amount:     number
  journal_entry_id: string | null
  total_debit:      number | null
}

export interface PostingStatus {
  posted:           boolean
  source_type:      string
  source_id:        string
  voucher_no?:      string
  voucher_status?:  VoucherStatus
  journal_entry_id?: string
  total_debit?:     number
  entry_hash?:      string
}
// ─── Settings ─────────────────────────────────────────────────────────────────
export interface InvoiceTemplate {
  id:           string
  name:         string
  is_default:   boolean
  config:       Record<string, unknown>
}

export interface FiscalYear {
  id:         string
  name:       string
  start_date: string
  end_date:   string
  is_active:  boolean
  is_locked:  boolean
}

export interface AuditLog {
  id:          string
  user_name:   string
  action:      string
  entity:      string
  entity_id:   string
  old_value?:  string
  new_value?:  string
  ip_address?: string
  created_at:  string
}
