// ─── Storage keys ─────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  TOKEN:   'erp_token',
  USER:    'erp_user',
  COMPANY: 'erp_company',
  THEME:   'erp_theme',
  SIDEBAR: 'erp_sidebar_collapsed',
  TEMPLATE:'erp_template',
} as const

// ─── API ───────────────────────────────────────────────────────────────────────
// API_BASE and API_TIMEOUT are now in src/config/env.ts
// Import from there: import { config } from '@/config/env'
// These are kept as aliases for backward compatibility
import { config as _cfg } from '@/config/env'
export const API_BASE    = _cfg.apiBaseUrl
export const API_TIMEOUT = _cfg.apiTimeout

// ─── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

// ─── Roles & permissions ──────────────────────────────────────────────────────
export const ROLES = {
  ADMIN:      'admin',
  MANAGER:    'manager',
  ACCOUNTANT: 'accountant',
  CASHIER:    'cashier',
  VIEWER:     'viewer',
} as const

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin:      ['*'],
  manager:    ['sales.*', 'purchases.*', 'products.*', 'parties.*', 'reports.*', 'accounting.view', 'settings.view'],
  accountant: ['accounting.*', 'reports.*', 'sales.view', 'purchases.view', 'parties.view'],
  cashier:    ['sales.*', 'products.view', 'parties.view', 'stock.view'],
  viewer:     ['*.view'],
}

// ─── Payment modes ────────────────────────────────────────────────────────────
export const PAYMENT_MODES = [
  { value: 'cash',   label: 'Cash'          },
  { value: 'credit', label: 'Credit'        },
  { value: 'card',   label: 'Card'          },
  { value: 'online', label: 'Online/UPI'    },
  { value: 'bank',   label: 'Bank Transfer' },
] as const

// ─── Account types ────────────────────────────────────────────────────────────
export const ACCOUNT_TYPES = [
  { value: 'asset',     label: 'Asset'     },
  { value: 'liability', label: 'Liability' },
  { value: 'income',    label: 'Income'    },
  { value: 'expense',   label: 'Expense'   },
  { value: 'equity',    label: 'Equity'    },
] as const

export const VOUCHER_TYPES = [
  { value: 'RECEIPT',     label: 'Receipt'      },
  { value: 'PAYMENT',     label: 'Payment'      },
  { value: 'JOURNAL',     label: 'Journal'      },
  { value: 'CONTRA',      label: 'Contra'       },
  { value: 'DEBIT_NOTE',  label: 'Debit Note'   },
  { value: 'CREDIT_NOTE', label: 'Credit Note'  },
  { value: 'OPENING',     label: 'Opening Entry'},
] as const

// ─── Units ────────────────────────────────────────────────────────────────────
// Matches the Quick Add modal's unit list exactly (components/forms/QuickAddModal.tsx)
// so Product Add and Quick Add always save the identical string value for `unit`.
export const PRODUCT_UNITS = ['Strip', 'Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule', 'Sachet', 'Tube', 'Pcs', 'Box', 'Kg', 'Ltr'] as const

// ─── User roles for dropdown ──────────────────────────────────────────────────
export const USER_ROLES = [
  { value: 'admin',      label: 'Admin'      },
  { value: 'manager',    label: 'Manager'    },
  { value: 'accountant', label: 'Accountant' },
  { value: 'cashier',    label: 'Cashier'    },
  { value: 'viewer',     label: 'Viewer'     },
] as const

// ─── Query keys ───────────────────────────────────────────────────────────────
export const QK = {
  PRODUCTS:    'products',
  PRODUCT:     'product',
  MANUFACTURERS: 'manufacturers',
  CUSTOMERS:   'customers',
  SUPPLIERS:   'suppliers',
  PARTY:       'party',
  LEDGER:      'ledger',
  SALES:       'sales',
  SALE:        'sale',
  PURCHASES:   'purchases',
  PURCHASE:    'purchase',
  STOCK:       'stock',
  BATCHES:     'batches',
  ACCOUNTS:    'accounts',
  VOUCHERS:    'vouchers',
  VOUCHER:     'voucher',
  TRIAL_BAL:   'trial-balance',
  RECEIPTS:    'receipts',
  PAYMENTS:    'payments',
  JOURNAL:     'journal',
  DASHBOARD:   'dashboard',
  REPORTS:     'reports',
  COMPANY:     'company',
  COMPANIES:   'companies',
  USERS:       'users',
  TEMPLATES:   'templates',
  FISCAL_YEARS:'fiscal-years',
  AUDIT_LOG:       'audit-log',
  ACCOUNT_DEFAULTS: 'account-defaults',
  VOUCHER_POSTINGS: 'voucher-postings',
  POSTING_STATUS:   'posting-status',
  PREFERENCES:      'preferences',
  BACKUPS:          'backups',
  PURCHASE_SUGGESTIONS:          'purchase-suggestions',
  PURCHASE_SUGGESTIONS_SUMMARY:  'purchase-suggestions-summary',
  PURCHASE_SUGGESTION_SETTINGS:  'purchase-suggestion-settings',
  PURCHASE_ORDERS:               'purchase-orders',
  PURCHASE_ORDER:                'purchase-order',
  CREDIT_RISK_DASHBOARD:  'credit-risk-dashboard',
  CREDIT_RISK_CUSTOMERS:  'credit-risk-customers',
  CREDIT_RISK_CUSTOMER:   'credit-risk-customer',
  CREDIT_RISK_HISTORY:    'credit-risk-history',
  CREDIT_RISK_SETTINGS:   'credit-risk-settings',
  APPROVALS:      'approvals',
  NOTIFICATIONS:  'notifications',
  REMINDERS:      'reminders',
  REMINDER_COUNTS:'reminder-counts',
  REMINDER_TYPES: 'reminder-types',
  REMINDER_ASSIGNABLE_USERS: 'reminder-assignable-users',
} as const

// ─── Routes / paths ───────────────────────────────────────────────────────────
export const PATHS = {
  LOGIN:      '/login',
  SIGNUP:     '/signup',
  DASHBOARD:  '/dashboard',
  SALES:      '/sales',
  PURCHASE:   '/purchase',
  SALES_RETURNS:    '/sales-returns',
  PURCHASE_RETURNS: '/purchase-returns',
  PRODUCTS:   '/products',
  BARCODE_PRINT: '/barcode-print',
  QR_CODE_PRINT: '/qrcode-print',
  MANUFACTURERS: '/manufacturers',
  STOCK:      '/stock',
  PURCHASE_SUGGESTIONS: '/purchase-suggestions',
  CREDIT_RISK: '/credit-risk',
  CUSTOMERS:  '/customers',
  SUPPLIERS:  '/suppliers',
  ACCOUNTING:    '/accounting',
  LEDGER:        '/ledger',
  REPORTS:    '/reports',
  SETTINGS:   '/settings',
  REMINDERS:  '/reminders',
} as const
