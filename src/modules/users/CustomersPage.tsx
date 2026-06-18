import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, Search, RotateCcw, Download, ChevronDown,
  Users, UserCheck, TrendingUp, Activity, Eye, Edit2, BookOpen,
  FileText, Printer, Trash2, MoreVertical, X, UserCircle2,
  Phone, CreditCard, MapPin, ShieldCheck, ArrowUpDown,
  ArrowUp, ArrowDown, ChevronRight, Landmark, CheckCircle2
} from 'lucide-react'
import {
  useCustomers, useCreateCustomer, useUpdateParty,
  useDeleteParty, usePartyLedger, useUpdatePartyAccount,
  useAccountDefaults, useAccounts,
} from '@/hooks/useQuery'
import {
  Button, Modal, Pagination, SkeletonRows, Empty, ConfirmDialog
} from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt, fmtDate } from '@/utils'
import type { Party, AccountDefault } from '@/types'

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  name:            z.string().min(1, 'Name is required'),
  phone:           z.string().optional(),
  email:           z.string().email('Invalid email').optional().or(z.literal('')),
  address:         z.string().optional(),
  pan_no:          z.string().optional(),
  credit_limit:    z.coerce.number().optional(),
  credit_days:     z.coerce.number().default(30),
  opening_balance: z.coerce.number().default(0),
})
type Form = z.infer<typeof schema>

// ─── Helpers ──────────────────────────────────────────────────────────────────
function BalanceChip({ value }: { value: number | string }) {
  const n = Number(value)
  const cls = n > 0
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : n < 0
    ? 'text-red-700 bg-red-50 border-red-200'
    : 'text-green-700 bg-green-50 border-green-200'
  return (
    <span className={`inline-block font-mono text-xs font-semibold px-2 py-0.5 rounded border ${cls}`}>
      {fmt(n)}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Active
      </span>
    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />Inactive
      </span>
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, loading }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string; loading?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-shadow duration-200">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        {loading
          ? <div className="h-7 w-20 bg-slate-100 animate-pulse rounded-md" />
          : <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        }
        {sub && !loading && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────
function ActionsMenu({ onView, onEdit, onLedger, onDelete }: {
  onView: () => void; onEdit: () => void; onLedger: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const items = [
    { icon: <Eye size={13} />,      label: 'View Customer',     action: onView,   cls: '' },
    { icon: <Edit2 size={13} />,    label: 'Edit Customer',     action: onEdit,   cls: '' },
    { icon: <BookOpen size={13} />, label: 'Open Ledger',       action: onLedger, cls: '' },
    { icon: <FileText size={13} />, label: 'View Transactions', action: () => {},  cls: '' },
    { icon: <Printer size={13} />,  label: 'Print Statement',   action: () => {},  cls: '' },
    null,
    { icon: <Trash2 size={13} />,   label: 'Delete Customer',   action: onDelete, cls: 'text-red-600 hover:bg-red-50' },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 overflow-hidden">
          {items.map((item, i) =>
            item === null
              ? <div key={i} className="border-t border-slate-100 my-1" />
              : (
                <button
                  key={item.label}
                  onClick={e => { e.stopPropagation(); item.action(); setOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors ${item.cls}`}
                >
                  {item.icon}{item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Side Drawer ──────────────────────────────────────────────────────────────
function CustomerDrawer({ customer, onClose, onEdit, onLedger }: {
  customer: Party; onClose: () => void; onEdit: () => void; onLedger: () => void
}) {
  const { data: ledgerData, isLoading } = usePartyLedger(customer.id)
  const recentRows = ((ledgerData as any)?.rows ?? []).slice(0, 5)
  const closing    = (ledgerData as any)?.closingBalance ?? 0
  const { data: defaults = [] }   = useAccountDefaults()
  const defaultAR = (defaults as AccountDefault[]).find(d => d.role === 'accounts_receivable')

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
      <div
        className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{customer.name}</p>
              <p className="text-xs text-indigo-600 font-mono font-medium">{customer.code}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex gap-3 flex-wrap">
            <StatusBadge active={customer.is_active} />
            <BalanceChip value={closing} />
          </div>

          {/* Info */}
          <div className="space-y-3">
            {[
              { icon: <Phone size={13} />,      label: 'Phone',       value: customer.phone   || '—' },
              { icon: <CreditCard size={13} />,  label: 'PAN/VAT',     value: customer.pan_no  || '—' },
              { icon: <MapPin size={13} />,      label: 'Address',     value: customer.address || '—' },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                  {row.icon}
                </span>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{row.label}</p>
                  <p className="text-sm text-slate-700 font-medium">{row.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Financials */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Financials</p>
            {/* Control Account */}
            <div className="flex items-center justify-between py-1.5 px-2 bg-indigo-50 rounded-lg border border-indigo-100 mb-2">
              <div className="flex items-center gap-1.5">
                <Landmark size={11} className="text-indigo-400" />
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Control Account</span>
              </div>
              <div className="text-right">
                {customer.control_account_name ? (
                  <span className="text-xs font-semibold text-indigo-700">{customer.control_account_name}</span>
                ) : defaultAR ? (
                  <span className="text-xs text-slate-500">{defaultAR.account_name} <span className="text-[10px] text-slate-400">(default)</span></span>
                ) : (
                  <span className="text-xs text-amber-500">Not configured</span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Opening Balance</span>
              <span className="font-mono font-semibold text-slate-800">{fmt(customer.opening_balance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Current Balance</span>
              <span className={`font-mono font-semibold ${Number(customer.current_balance) > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {fmt(customer.current_balance)}
              </span>
            </div>
            {customer.credit_limit != null && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Credit Limit</span>
                <span className="font-mono font-semibold text-slate-800">{fmt(customer.credit_limit)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Credit Days</span>
              <span className="font-mono font-semibold text-slate-800">{customer.credit_days ?? 30}</span>
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Recent Activity</p>
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />)}
              </div>
            ) : recentRows.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No transactions yet</p>
            ) : (
              <div className="space-y-2">
                {recentRows.map((row: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{row.description || row.reference || '—'}</p>
                      <p className="text-[10px] text-slate-400">{row.date ? fmtDate(row.date_ad || row.date) : '—'}</p>
                    </div>
                    <span className={`text-xs font-mono font-semibold ${Number(row.debit) > 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {Number(row.debit) > 0 ? `-${fmt(row.debit)}` : `+${fmt(row.credit)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Edit2 size={13} /> Edit
          </Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={onLedger}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700">
            <BookOpen size={13} /> Ledger
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Customer Form ─────────────────────────────────────────────────────────────
// ─── Inline account search dropdown (lightweight, no external dep) ─────────────
function AccountPicker({ value, accounts, onChange }: {
  value: string | null; accounts: any[]; onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const ref             = useRef<HTMLDivElement>(null)
  const selected        = accounts.find((a: any) => a.id === value)
  const filtered        = useMemo(() => {
    const lq = q.toLowerCase()
    return accounts.filter((a: any) => a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq)).slice(0, 40)
  }, [q, accounts])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(v => !v); setQ('') }}
        className="w-full flex items-center justify-between h-9 px-3 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
        {selected
          ? <span className="flex items-center gap-2"><span className="font-mono text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{selected.code}</span><span className="text-slate-800 font-medium truncate">{selected.name}</span></span>
          : <span className="text-slate-400">Use company default (Sundry Debtors)</span>}
        <ChevronDown size={13} className="text-slate-400 ml-2 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 h-7">
              <Search size={11} className="text-slate-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </div>
          {value && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-b border-slate-100"><X size={11} /> Clear (use company default)</button>}
          <div className="max-h-44 overflow-y-auto">
            {filtered.map((a: any) => (
              <button key={a.id} type="button" onClick={() => { onChange(a.id); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${a.id === value ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                <span className="font-mono text-[10px] text-slate-400 w-12 shrink-0">{a.code}</span>
                <span className="flex-1 font-medium truncate">{a.name}</span>
                {a.id === value && <CheckCircle2 size={12} className="text-indigo-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerForm({ initial, onClose, onCreate }: {
  initial?: Party | null; onClose: () => void; onCreate: (d: Form) => Promise<void>
}) {
  const update        = useUpdateParty()
  const updateAcct    = useUpdatePartyAccount()
  const { data: allAccounts = [] } = useAccounts({ is_active: true, is_group: false })
  const [ctrlAcct, setCtrlAcct]   = useState<string | null>(initial?.control_account_id ?? null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: initial ? {
      name: initial.name, phone: initial.phone || '', email: initial.email || '',
      address: initial.address || '', pan_no: initial.pan_no || '',
      credit_limit: initial.credit_limit, credit_days: initial.credit_days || 30,
      opening_balance: initial.opening_balance,
    } : { credit_days: 30, opening_balance: 0 },
  })

  const onSubmit = handleSubmit(async (data) => {
    if (initial) {
      await update.mutateAsync({ id: initial.id, data })
      // Save account override separately if changed
      if (ctrlAcct !== (initial.control_account_id ?? null)) {
        await updateAcct.mutateAsync({ id: initial.id, control_account_id: ctrlAcct })
      }
    } else {
      await onCreate(data)
    }
    onClose()
  })

  return (
    <>
      <div className="grid grid-cols-2 gap-4 p-1">
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Customer Name *</label>
          <input
            className={`w-full h-9 px-3 rounded-lg border text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${errors.name ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}
            placeholder="e.g. Sunrise Trading Co."
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        {([
          ['Phone', 'phone', 'text'],
          ['Email', 'email', 'email'],
          ['PAN / VAT No', 'pan_no', 'text'],
          ['Credit Limit', 'credit_limit', 'number'],
          ['Credit Days', 'credit_days', 'number'],
          ['Opening Balance', 'opening_balance', 'number'],
        ] as [string, keyof Form, string][]).map(([label, name, type]) => (
          <div key={name as string}>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
            <input
              type={type}
              className={`w-full h-9 px-3 rounded-lg border text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${(errors as any)[name] ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}
              {...register(name)}
            />
            {(errors as any)[name] && <p className="text-xs text-red-500 mt-1">{(errors as any)[name]?.message}</p>}
          </div>
        ))}
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Address</label>
          <input
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            {...register('address')}
          />
        </div>
        {/* Account Override — only shown when editing an existing customer */}
        {initial && (
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Landmark size={12} className="text-indigo-500" />
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Control Account Override
              </label>
              <span className="text-[10px] text-slate-400 ml-1">(optional — overrides company default)</span>
            </div>
            <AccountPicker
              value={ctrlAcct}
              accounts={allAccounts as any[]}
              onChange={setCtrlAcct}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Leave blank to use the company-wide Sundry Debtors account from Account Setup.
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}
          className="bg-indigo-600 hover:bg-indigo-700">
          {initial ? 'Save Changes' : 'Create Customer'}
        </Button>
      </div>
    </>
  )
}

// ─── Ledger Table ──────────────────────────────────────────────────────────────
function LedgerTable({ partyId }: { partyId: string }) {
  const { data, isLoading } = usePartyLedger(partyId)
  const rows           = (data as any)?.rows           ?? []
  const closingBalance = (data as any)?.closingBalance ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <span className="text-sm text-slate-500 font-medium">Closing Balance</span>
        <span className={`font-bold font-mono text-base ${Number(closingBalance) > 0 ? 'text-amber-700' : 'text-green-700'}`}>
          {fmt(closingBalance)}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Date','Reference','Description','Debit','Credit','Balance'].map(h => (
                <th key={h} className={`px-3 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide ${['Debit','Credit','Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={6} className="text-center py-6 text-slate-400">Loading…</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={6}><Empty message="No ledger entries" /></td></tr>
              : rows.map((e: any, i: number) => (
                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${e.type === 'opening' ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{e.date ? fmtDate(e.date_ad || e.date) : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-indigo-600 font-semibold">{e.reference || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700">{e.description || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-600 font-medium">{Number(e.debit)  > 0 ? fmt(e.debit)  : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-green-700 font-medium">{Number(e.credit) > 0 ? fmt(e.credit) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{fmt(e.running_balance ?? e.balance ?? 0)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = 'name' | 'code' | 'balance' | 'credit_limit' | 'created_at'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={12} className="opacity-30 ml-1" />
  return sortDir === 'asc'
    ? <ArrowUp size={12} className="ml-1 text-indigo-600" />
    : <ArrowDown size={12} className="ml-1 text-indigo-600" />
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [page,         setPage]      = useState(1)
  const [searchRaw,    setSearch]    = useState('')
  const [statusFilter, setStatus]    = useState<'all' | 'active' | 'inactive'>('all')
  const [balFilter,    setBalFilter] = useState<'all' | 'positive' | 'zero'>('all')
  const [sortKey,      setSortKey]   = useState<SortKey>('name')
  const [sortDir,      setSortDir]   = useState<SortDir>('asc')
  const [modal,        setModal]     = useState(false)
  const [editing,      setEditing]   = useState<Party | null>(null)
  const [delId,        setDelId]     = useState<string | null>(null)
  const [ledger,       setLedger]    = useState<Party | null>(null)
  const [preview,      setPreview]   = useState<Party | null>(null)
  const [selected,     setSelected]  = useState<Set<string>>(new Set())

  const search = useDebounce(searchRaw, 400)
  const create = useCreateCustomer()
  const del    = useDeleteParty()

  const { data, isLoading } = useCustomers({ page, limit: 20, search: search || undefined })
  const rows  = useMemo(() => (data?.data as Party[]) || [], [data])
  const total = (data?.pagination as any)?.total || 0

  // KPI derived from current page
  const activeCount    = useMemo(() => rows.filter(r => r.is_active).length, [rows])
  const totalReceivable = useMemo(() => rows.reduce((s, r) => s + Number(r.current_balance), 0), [rows])
  const totalCreditLimit = useMemo(() => rows.reduce((s, r) => s + Number(r.credit_limit ?? 0), 0), [rows])

  // Client-side filter + sort
  const filteredRows = useMemo(() => {
    let r = [...rows]
    if (statusFilter === 'active')   r = r.filter(c => c.is_active)
    if (statusFilter === 'inactive') r = r.filter(c => !c.is_active)
    if (balFilter === 'positive')    r = r.filter(c => Number(c.current_balance) > 0)
    if (balFilter === 'zero')        r = r.filter(c => Number(c.current_balance) === 0)
    r.sort((a, b) => {
      let va: any, vb: any
      if      (sortKey === 'balance')      { va = Number(a.current_balance); vb = Number(b.current_balance) }
      else if (sortKey === 'credit_limit') { va = Number(a.credit_limit ?? 0); vb = Number(b.credit_limit ?? 0) }
      else if (sortKey === 'code')         { va = a.code; vb = b.code }
      else if (sortKey === 'created_at')   { va = a.created_at; vb = b.created_at }
      else                                 { va = a.name.toLowerCase(); vb = b.name.toLowerCase() }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return r
  }, [rows, statusFilter, balFilter, sortKey, sortDir])

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key }
      setSortDir('asc'); return key
    })
  }, [])

  const handleReset = () => {
    setSearch(''); setStatus('all'); setBalFilter('all')
    setSortKey('name'); setSortDir('asc')
  }

  const allSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.id))
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filteredRows.map(r => r.id)))
  const toggleRow   = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const ThCol = ({ col, label, right = false }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      className={`px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  )

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div>
            <nav className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              <span>Parties</span>
              <ChevronRight size={11} />
              <span className="text-indigo-600 font-semibold">Customers</span>
            </nav>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage customer information, balances, and transactions</p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={() => { setEditing(null); setModal(true) }}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200"
          >
            New Customer
          </Button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Customers"
            value={isLoading ? '—' : total}
            sub="Across all pages"
            icon={<Users size={20} className="text-indigo-600" />}
            color="bg-indigo-50"
            loading={isLoading}
          />
          <KpiCard
            label="Active Customers"
            value={isLoading ? '—' : activeCount}
            sub="On this page"
            icon={<UserCheck size={20} className="text-green-600" />}
            color="bg-green-50"
            loading={isLoading}
          />
          <KpiCard
            label="Total Receivable"
            value={isLoading ? '—' : fmt(totalReceivable)}
            sub="Outstanding balance"
            icon={<TrendingUp size={20} className="text-amber-600" />}
            color="bg-amber-50"
            loading={isLoading}
          />
          <KpiCard
            label="Total Credit Limit"
            value={isLoading ? '—' : fmt(totalCreditLimit)}
            sub="Combined credit lines"
            icon={<ShieldCheck size={20} className="text-purple-600" />}
            color="bg-purple-50"
            loading={isLoading}
          />
        </div>

        {/* ── Filter Toolbar ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all placeholder:text-slate-400"
                placeholder="Search customers…"
                value={searchRaw}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatus(e.target.value as any)}
                className="h-9 pl-3 pr-8 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 text-slate-700 appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={balFilter}
                onChange={e => setBalFilter(e.target.value as any)}
                className="h-9 pl-3 pr-8 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 text-slate-700 appearance-none cursor-pointer"
              >
                <option value="all">All Balances</option>
                <option value="positive">Has Balance</option>
                <option value="zero">Zero Balance</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500">
                <RotateCcw size={13} /> Reset
              </Button>
              <Button variant="outline" size="sm">
                <Download size={13} /> Export
              </Button>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
              <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
                <Trash2 size={13} /> Delete Selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X size={13} /> Clear
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                    />
                  </th>
                  <ThCol col="code"  label="Code" />
                  <ThCol col="name"  label="Customer" />
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">PAN/VAT</th>
                  <ThCol col="credit_limit" label="Credit Limit" right />
                  <ThCol col="balance"      label="Balance"      right />
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Control Account</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Status</th>
                  <ThCol col="created_at" label="Added" />
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading
                  ? <SkeletonRows cols={11} />
                  : filteredRows.length === 0
                  ? (
                    <tr>
                      <td colSpan={11}>
                        <div className="flex flex-col items-center justify-center py-16 px-6">
                          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                            <UserCircle2 size={24} className="text-slate-400" />
                          </div>
                          <p className="text-slate-700 font-semibold text-sm mb-1">No customers found</p>
                          <p className="text-slate-400 text-xs text-center mb-4">
                            {searchRaw || statusFilter !== 'all' || balFilter !== 'all'
                              ? 'Try adjusting your filters or search query'
                              : 'Add your first customer to get started'}
                          </p>
                          {!(searchRaw || statusFilter !== 'all' || balFilter !== 'all') && (
                            <Button variant="primary" size="sm" icon={<Plus size={13} />}
                              className="bg-indigo-600 hover:bg-indigo-700"
                              onClick={() => { setEditing(null); setModal(true) }}>
                              Create Customer
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : filteredRows.map(c => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                      onClick={() => setPreview(c)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleRow(c.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {c.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm shadow-indigo-200">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm leading-tight">{c.name}</p>
                            {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.phone || '—'}</td>
                      <td className="px-4 py-3">
                        {c.pan_no
                          ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{c.pan_no}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.credit_limit
                          ? <span className="font-mono text-xs text-slate-700">{fmt(c.credit_limit)}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <BalanceChip value={c.current_balance} />
                      </td>
                      <td className="px-4 py-3">
                        {c.control_account_name ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg font-medium">
                            <Landmark size={10} className="text-indigo-400" />{c.control_account_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 italic">company default</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge active={c.is_active} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                        {c.created_at ? fmtDate(c.created_at) : '—'}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <ActionsMenu
                          onView={()   => setPreview(c)}
                          onEdit={()   => { setEditing(c); setModal(true) }}
                          onLedger={()  => setLedger(c)}
                          onDelete={() => setDelId(c.id)}
                        />
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-100">
            <Pagination page={page} total={total} limit={20} onChange={setPage} />
          </div>
        </div>
      </div>

      {/* ── Side Drawer ── */}
      {preview && (
        <CustomerDrawer
          customer={preview}
          onClose={() => setPreview(null)}
          onEdit={() => { setEditing(preview); setPreview(null); setModal(true) }}
          onLedger={() => { setLedger(preview); setPreview(null) }}
        />
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditing(null) }}
        title={editing ? 'Edit Customer' : 'New Customer'}
        size="lg"
      >
        <CustomerForm
          initial={editing}
          onClose={() => { setModal(false); setEditing(null) }}
          onCreate={(d) => create.mutateAsync(d)}
        />
      </Modal>

      {/* ── Ledger Modal ── */}
      {ledger && (
        <Modal open onClose={() => setLedger(null)} title={`Ledger — ${ledger.name}`} size="xl">
          <LedgerTable partyId={ledger.id} />
        </Modal>
      )}

      {/* ── Confirm Delete ── */}
      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => del.mutate(delId!)}
        title="Delete Customer"
        message="This will permanently delete the customer and cannot be undone."
        danger
      />
    </div>
  )
}
