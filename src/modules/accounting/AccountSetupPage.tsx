/**
 * AccountSetupPage — Centralized accounting control-account mappings.
 *
 * Reads from / writes to the existing `account_defaults` table via
 * accountingAPI.accountDefaults / setAccountDefault / deleteAccountDefault.
 * No schema changes. No existing data touched.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Settings2, Search, ChevronDown, CheckCircle2, AlertCircle,
  Landmark, Users, Truck, Banknote, Building2, ShoppingCart,
  ShoppingBag, RotateCcw, Receipt, CreditCard, Tag, X,
  RefreshCw, Info, Save, Shield,
} from 'lucide-react'
import {
  useAccountDefaults, useSetAccountDefault, useDeleteAccountDefault,
  useAccounts,
} from '@/hooks/useQuery'
import type { Account, AccountDefault } from '@/types'
import { ACCOUNT_DEFAULT_ROLES } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface RoleConfig {
  value:    string
  label:    string
  hint:     string
  icon:     React.ReactNode
  group:    string
  required: boolean
}

// ─── Role registry (extends ACCOUNT_DEFAULT_ROLES with UI metadata) ───────────
const ROLE_CONFIG: RoleConfig[] = [
  // Parties
  {
    value: 'accounts_receivable', label: 'Sundry Debtors',
    hint: 'Default control account for all customers (Accounts Receivable)',
    icon: <Users size={15} />, group: 'Party Control Accounts', required: true,
  },
  {
    value: 'accounts_payable', label: 'Sundry Creditors',
    hint: 'Default control account for all suppliers (Accounts Payable)',
    icon: <Truck size={15} />, group: 'Party Control Accounts', required: true,
  },
  // Cash & Bank
  {
    value: 'cash', label: 'Cash in Hand',
    hint: 'Used for cash sales, cash purchases, and payment vouchers',
    icon: <Banknote size={15} />, group: 'Cash & Bank', required: true,
  },
  {
    value: 'bank', label: 'Bank Account',
    hint: 'Used for bank transfers, UPI, card, and cheque transactions',
    icon: <Building2 size={15} />, group: 'Cash & Bank', required: true,
  },
  // Revenue & Cost
  {
    value: 'sales_revenue', label: 'Sales Account',
    hint: 'Credit side of all sales invoices',
    icon: <ShoppingCart size={15} />, group: 'Revenue & Cost', required: true,
  },
  {
    value: 'purchase_expense', label: 'Purchase Account',
    hint: 'Debit side of all purchase bills',
    icon: <ShoppingBag size={15} />, group: 'Revenue & Cost', required: true,
  },
  {
    value: 'cogs', label: 'Cost of Goods Sold',
    hint: 'Debit on sale when using perpetual inventory / COGS method',
    icon: <Receipt size={15} />, group: 'Revenue & Cost', required: false,
  },
  {
    value: 'inventory', label: 'Inventory Asset',
    hint: 'Asset account for stock value (perpetual inventory)',
    icon: <Tag size={15} />, group: 'Revenue & Cost', required: false,
  },
  // Returns
  {
    value: 'discount_given', label: 'Sales Returns / Discount Expense',
    hint: 'Discount or return contra account on the sales side',
    icon: <RotateCcw size={15} />, group: 'Returns & Discounts', required: false,
  },
  {
    value: 'discount_received', label: 'Purchase Returns / Discount Income',
    hint: 'Discount or return contra account on the purchase side',
    icon: <RotateCcw size={15} />, group: 'Returns & Discounts', required: false,
  },
  // Tax
  {
    value: 'tax_payable', label: 'VAT / Tax Payable',
    hint: 'Output tax liability account (credit on sales)',
    icon: <Shield size={15} />, group: 'Tax', required: false,
  },
  {
    value: 'tax_input', label: 'Input Tax Credit (ITC)',
    hint: 'Input VAT recoverable account (debit on purchases)',
    icon: <CreditCard size={15} />, group: 'Tax', required: false,
  },
]

const GROUPS = Array.from(new Set(ROLE_CONFIG.map(r => r.group)))

// ─── AccountSearchDropdown ─────────────────────────────────────────────────────
function AccountSearchDropdown({
  value, accounts, onChange, placeholder = 'Search accounts…',
}: {
  value?: string | null
  accounts: Account[]
  onChange: (id: string | null) => void
  placeholder?: string
}) {
  const [open, setOpen]   = useState(false)
  const [q, setQ]         = useState('')
  const ref               = useRef<HTMLDivElement>(null)

  const selected = accounts.find(a => a.id === value)

  const filtered = useMemo(() => {
    if (!q) return accounts.slice(0, 50)
    const lq = q.toLowerCase()
    return accounts.filter(a =>
      a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq)
    ).slice(0, 50)
  }, [q, accounts])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQ('') }}
        className={`
          w-full flex items-center justify-between gap-2 h-10 px-3 rounded-xl border text-sm
          transition-all duration-150
          ${open
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-900'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'
          }
        `}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded shrink-0">
              {selected.code}
            </span>
            <span className="text-slate-800 dark:text-slate-100 truncate font-medium">{selected.name}</span>
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500 flex-1 text-left">{placeholder}</span>
        )}
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 h-8">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Type to search…"
                className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Clear option */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors border-b border-slate-100 dark:border-slate-800"
            >
              <X size={11} /> Clear mapping
            </button>
          )}

          {/* Results */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No accounts found</div>
            ) : (
              filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onChange(a.id); setOpen(false); setQ('') }}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors
                    ${a.id === value
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }
                  `}
                >
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 w-14 shrink-0">{a.code}</span>
                  <span className="flex-1 font-medium truncate">{a.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 ${
                    a.type === 'asset'     ? 'bg-blue-50   dark:bg-blue-950   text-blue-600   dark:text-blue-400'   :
                    a.type === 'liability' ? 'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400' :
                    a.type === 'income'    ? 'bg-green-50  dark:bg-green-950  text-green-600  dark:text-green-400'  :
                    a.type === 'expense'   ? 'bg-red-50    dark:bg-red-950    text-red-600    dark:text-red-400'    :
                    'bg-slate-50 dark:bg-slate-800 text-slate-500'
                  }`}>{a.type}</span>
                  {a.id === value && <CheckCircle2 size={13} className="text-indigo-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MappingCard ──────────────────────────────────────────────────────────────
function MappingCard({
  cfg, current, accounts, onSave, onClear, saving,
}: {
  cfg:      RoleConfig
  current?: AccountDefault
  accounts: Account[]
  onSave:   (accountId: string) => void
  onClear:  () => void
  saving:   boolean
}) {
  const [draft, setDraft] = useState<string | null>(current?.account_id ?? null)
  const dirty = draft !== (current?.account_id ?? null)

  // Keep in sync if external data changes
  useEffect(() => {
    setDraft(current?.account_id ?? null)
  }, [current?.account_id])

  const mapped = !!current?.account_id
  const statusColor = mapped
    ? 'border-green-200 dark:border-green-800'
    : cfg.required
    ? 'border-amber-200 dark:border-amber-800'
    : 'border-slate-200 dark:border-slate-700'

  return (
    <div className={`
      group bg-white dark:bg-slate-900 rounded-2xl border p-5
      transition-all duration-200 hover:shadow-md
      ${statusColor}
    `}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`
          w-9 h-9 rounded-xl flex items-center justify-center shrink-0
          ${mapped
            ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'
            : cfg.required
            ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
          }
        `}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-tight">{cfg.label}</p>
            {cfg.required && (
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                Required
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{cfg.hint}</p>
        </div>

        {/* Status indicator */}
        <div className="shrink-0">
          {mapped
            ? <CheckCircle2 size={15} className="text-green-500" />
            : cfg.required
            ? <AlertCircle  size={15} className="text-amber-400" />
            : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 dark:border-slate-700" />
          }
        </div>
      </div>

      {/* Current mapped account (read-only pill) */}
      {current && (
        <div className="mb-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
          <Landmark size={11} className="text-slate-400 shrink-0" />
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide shrink-0">Mapped to</span>
          <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 shrink-0">{current.account_code}</span>
          <span className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate">{current.account_name}</span>
        </div>
      )}

      {/* Dropdown */}
      <AccountSearchDropdown
        value={draft}
        accounts={accounts}
        onChange={setDraft}
        placeholder={`Select ${cfg.label} account…`}
      />

      {/* Actions */}
      {dirty && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(current?.account_id ?? null)}
            className="flex-1 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!draft || saving}
            onClick={() => draft && onSave(draft)}
            className="flex-1 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AccountSetupPage() {
  const { data: defaults = [], isLoading: loadingDefaults } = useAccountDefaults()
  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts({ is_active: true, is_group: false })
  const setDefault    = useSetAccountDefault()
  const clearDefault  = useDeleteAccountDefault()
  const [savingRole, setSavingRole] = useState<string | null>(null)

  // Index defaults by role
  const defaultMap = useMemo(() => {
    const m: Record<string, AccountDefault> = {}
    ;(defaults as AccountDefault[]).forEach(d => { m[d.role] = d })
    return m
  }, [defaults])

  // Summary stats
  const required    = ROLE_CONFIG.filter(r => r.required)
  const mapped      = required.filter(r => defaultMap[r.value])
  const allRequired = mapped.length === required.length

  async function handleSave(role: string, accountId: string) {
    setSavingRole(role)
    try {
      await setDefault.mutateAsync({ role, account_id: accountId })
    } finally {
      setSavingRole(null)
    }
  }

  async function handleClear(role: string) {
    setSavingRole(role)
    try {
      await clearDefault.mutateAsync(role)
    } finally {
      setSavingRole(null)
    }
  }

  const loading = loadingDefaults || loadingAccounts

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-8">

          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900">
                <Settings2 size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Account Setup</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Map ledger accounts to accounting roles used across the ERP
                </p>
              </div>
            </div>

            {/* Progress badge */}
            <div className={`
              flex items-center gap-2.5 px-4 py-2.5 rounded-xl border
              ${allRequired
                ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
              }
            `}>
              {allRequired
                ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                : <AlertCircle  size={16} className="text-amber-500" />
              }
              <div>
                <p className={`text-sm font-bold leading-none ${allRequired ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {mapped.length}/{required.length} Required
                </p>
                <p className={`text-[11px] mt-0.5 ${allRequired ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {allRequired ? 'All required accounts mapped' : 'Mappings incomplete'}
                </p>
              </div>
            </div>
          </div>

          {/* Info bar */}
          <div className="mt-6 flex items-start gap-2.5 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-xl px-4 py-3">
            <Info size={14} className="text-indigo-500 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
              These mappings define which ledger accounts are used as control accounts for Customers (Sundry Debtors),
              Suppliers (Sundry Creditors), Cash, Bank, and all transaction types. Existing journal entries and balances
              are <strong>not affected</strong> — only future transactions will use updated mappings.
              Each party can also override their individual control account from the Customer or Supplier page.
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          GROUPS.map(group => {
            const roles = ROLE_CONFIG.filter(r => r.group === group)
            const groupMapped   = roles.filter(r => defaultMap[r.value]).length
            const groupRequired = roles.filter(r => r.required).length

            return (
              <section key={group}>
                {/* Group header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                      {group}
                    </h2>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {groupMapped}/{roles.length} mapped
                      {groupRequired > 0 && ` · ${groupRequired} required`}
                    </p>
                  </div>
                  <div className="h-px flex-1 mx-4 bg-slate-200 dark:bg-slate-800" />
                  {groupMapped === roles.length && (
                    <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {roles.map(cfg => (
                    <MappingCard
                      key={cfg.value}
                      cfg={cfg}
                      current={defaultMap[cfg.value]}
                      accounts={accounts as Account[]}
                      onSave={(id) => handleSave(cfg.value, id)}
                      onClear={() => handleClear(cfg.value)}
                      saving={savingRole === cfg.value}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}

        {/* Footer note */}
        <div className="flex items-start gap-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3">
          <Shield size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Account mappings are company-specific and stored securely. Only accounts marked
            <em> is_group = false</em> (leaf accounts) are shown as mapping options.
            Changes take effect immediately for new transactions — no restart required.
          </p>
        </div>
      </div>
    </div>
  )
}
