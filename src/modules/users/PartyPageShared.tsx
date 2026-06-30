
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, Search, RotateCcw, Download, ChevronDown,
  Eye, Edit2, BookOpen, FileText, Printer, Trash2,
  MoreVertical, X, Phone, MapPin, ArrowUpDown,
  ArrowUp, ArrowDown, ChevronRight, Landmark, CheckCircle2,
} from 'lucide-react'
import {
  useUpdateParty, useDeleteParty, usePartyLedger,
  useUpdatePartyAccount, useAccountDefaults, useAccounts,
} from '@/hooks/useQuery'
import { Button, Modal, Pagination, SkeletonRows, Empty, ConfirmDialog } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt, fmtDate } from '@/utils'
import type { Party, AccountDefault } from '@/types'

// ── Schema ────────────────────────────────────────────────────────────────────
export const partySchema = z.object({
  name:            z.string().min(1, 'Name is required'),
  phone:           z.string().optional(),
  email:           z.string().email('Invalid email').optional().or(z.literal('')),
  address:         z.string().optional(),
  pan_no:          z.string().optional(),
  credit_limit:    z.coerce.number().optional(),
  credit_days:     z.coerce.number().default(30),
  opening_balance: z.coerce.number().default(0),
})
export type PartyForm = z.infer<typeof partySchema>

// ── Accent colour config ──────────────────────────────────────────────────────
export interface AccentConfig {
  /** e.g. '#4f46e5' */
  solid: string
  /** e.g. 'rgba(79,70,229,0.12)' */
  subtle: string
  /** e.g. 'rgba(79,70,229,0.25)' */
  border: string
  /** e.g. 'rgba(79,70,229,0.08)' */
  faint: string
}

export const INDIGO: AccentConfig = {
  solid:  '#4f46e5',
  subtle: 'rgba(79,70,229,0.12)',
  border: 'rgba(79,70,229,0.25)',
  faint:  'rgba(79,70,229,0.07)',
}
export const TEAL: AccentConfig = {
  solid:  '#0d9488',
  subtle: 'rgba(13,148,136,0.12)',
  border: 'rgba(13,148,136,0.25)',
  faint:  'rgba(13,148,136,0.07)',
}

// ── Shared card style using CSS vars ─────────────────────────────────────────
export const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  boxShadow: 'var(--shadow-sm)',
}

// ── BalanceChip ───────────────────────────────────────────────────────────────
export function BalanceChip({ value }: { value: number | string }) {
  const n = Number(value)
  const style: React.CSSProperties = n > 0
    ? { background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.25)' }
    : n < 0
    ? { background: 'rgba(220,38,38,0.1)',  color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' }
    : { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)' }
  return (
    <span style={{ ...style, display: 'inline-block', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
      {fmt(n)}
    </span>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />Active
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(100,116,139,0.1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-4)', display: 'inline-block' }} />Inactive
    </span>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon, iconBg, iconColor, loading }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; iconBg: string; iconColor: string; loading?: boolean
}) {
  return (
    <div style={{ ...CARD, padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16, cursor: 'default', transition: 'box-shadow 0.18s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
        {loading
          ? <div style={{ height: 28, width: 80, background: 'var(--surface-3)', borderRadius: 6 }} />
          : <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        }
        {sub && !loading && <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── ActionsMenu ───────────────────────────────────────────────────────────────
export function ActionsMenu({ label, onView, onEdit, onLedger, onDelete }: {
  label: string; onView: () => void; onEdit: () => void; onLedger: () => void; onDelete: () => void
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
    { icon: <Eye size={13} />,      text: `View ${label}`,     action: onView },
    { icon: <Edit2 size={13} />,    text: `Edit ${label}`,     action: onEdit },
    { icon: <BookOpen size={13} />, text: 'Open Ledger',        action: onLedger },
    { icon: <FileText size={13} />, text: 'View Transactions',  action: () => {} },
    { icon: <Printer size={13} />,  text: 'Print Statement',    action: () => {} },
    null,
    { icon: <Trash2 size={13} />,   text: `Delete ${label}`,   action: onDelete, danger: true },
  ]

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', transition: 'all 0.14s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 32, zIndex: 50, width: 176, ...CARD, borderRadius: 12, padding: '4px 0', overflow: 'hidden' }}>
          {items.map((item, i) =>
            item === null
              ? <div key={i} style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              : (
                <button
                  key={item.text}
                  onClick={e => { e.stopPropagation(); item.action(); setOpen(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: item.danger ? '#dc2626' : 'var(--text)', textAlign: 'left', transition: 'background 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.danger ? 'rgba(220,38,38,0.07)' : 'var(--surface-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {item.icon}{item.text}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}

// ── AccountPicker ─────────────────────────────────────────────────────────────
export function AccountPicker({ value, accounts, onChange, accent }: {
  value: string | null; accounts: any[]; onChange: (id: string | null) => void; accent: AccentConfig
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = accounts.find((a: any) => a.id === value)
  const filtered = useMemo(() => {
    const lq = q.toLowerCase()
    return accounts.filter((a: any) => a.name.toLowerCase().includes(lq) || a.code.toLowerCase().includes(lq)).slice(0, 40)
  }, [q, accounts])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" onClick={() => { setOpen(v => !v); setQ('') }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent.solid }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        {selected
          ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, background: accent.subtle, color: accent.solid, padding: '2px 6px', borderRadius: 4 }}>{selected.code}</span>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
            </span>
          : <span style={{ color: 'var(--text-4)' }}>Use company default</span>
        }
        <ChevronDown size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4, ...CARD, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 8, padding: '4px 8px', height: 28 }}>
              <Search size={11} style={{ color: 'var(--text-4)' }} />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                style={{ flex: 1, background: 'transparent', fontSize: 12, outline: 'none', border: 'none', color: 'var(--text)' }} />
            </div>
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(null); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <X size={11} /> Clear (use company default)
            </button>
          )}
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.map((a: any) => (
              <button key={a.id} type="button" onClick={() => { onChange(a.id); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', background: a.id === value ? accent.subtle : 'transparent', cursor: 'pointer', fontSize: 13, color: a.id === value ? accent.solid : 'var(--text)', textAlign: 'left', transition: 'background 0.12s' }}
                onMouseEnter={e => { if (a.id !== value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { if (a.id !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-4)', width: 48, flexShrink: 0 }}>{a.code}</span>
                <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                {a.id === value && <CheckCircle2 size={12} style={{ color: accent.solid, flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PartyForm ─────────────────────────────────────────────────────────────────
export function PartyForm({ initial, onClose, onCreate, label, defaultRole, accent }: {
  initial?: Party | null; onClose: () => void; onCreate: (d: PartyForm) => Promise<void>
  label: string; defaultRole: string; accent: AccentConfig
}) {
  const update     = useUpdateParty()
  const updateAcct = useUpdatePartyAccount()
  const { data: allAccounts = [] } = useAccounts({ is_active: true, is_group: false })
  const [ctrlAcct, setCtrlAcct]   = useState<string | null>(initial?.control_account_id ?? null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PartyForm>({
    resolver: zodResolver(partySchema),
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
      if (ctrlAcct !== (initial.control_account_id ?? null))
        await updateAcct.mutateAsync({ id: initial.id, control_account_id: ctrlAcct })
    } else {
      await onCreate(data)
    }
    onClose()
  })

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%', height: 36, padding: '0 12px', borderRadius: 8, fontSize: 13,
    background: hasError ? 'rgba(220,38,38,0.05)' : 'var(--surface)',
    border: `1px solid ${hasError ? 'rgba(220,38,38,0.5)' : 'var(--border)'}`,
    color: 'var(--text)', outline: 'none', transition: 'border-color 0.15s',
  })

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  }

  return (
    <>
      <div className="pp-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 4 }}>
        <div className="pp-form-span2" style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>{label} Name *</label>
          <input style={inputStyle(!!errors.name)} placeholder={`e.g. ${label === 'Customer' ? 'Sunrise Trading Co.' : 'Himal Distributors Pvt. Ltd.'}`} {...register('name')} />
          {errors.name && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{errors.name.message}</p>}
        </div>
        {([
          ['Phone', 'phone', 'text'], ['Email', 'email', 'email'],
          ['PAN / VAT No', 'pan_no', 'text'], ['Credit Limit', 'credit_limit', 'number'],
          ['Credit Days', 'credit_days', 'number'], ['Opening Balance', 'opening_balance', 'number'],
        ] as [string, keyof PartyForm, string][]).map(([lbl, name, type]) => (
          <div key={name as string}>
            <label style={labelStyle}>{lbl}</label>
            <input type={type} style={inputStyle(!!(errors as any)[name])} {...register(name)} />
            {(errors as any)[name] && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{(errors as any)[name]?.message}</p>}
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Address</label>
          <input style={inputStyle(false)} {...register('address')} />
        </div>
        {initial && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Landmark size={12} style={{ color: accent.solid }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Control Account Override</label>
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>(optional)</span>
            </div>
            <AccountPicker value={ctrlAcct} accounts={allAccounts as any[]} onChange={setCtrlAcct} accent={accent} />
            <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>Leave blank to use company-wide default from Account Setup.</p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting} onClick={onSubmit}
          style={{ background: accent.solid }}>
          {initial ? 'Save Changes' : `Create ${label}`}
        </Button>
      </div>
    </>
  )
}

// ── LedgerTable ───────────────────────────────────────────────────────────────
export function LedgerTable({ partyId, accent }: { partyId: string; accent: AccentConfig }) {
  const { data, isLoading } = usePartyLedger(partyId)
  const rows           = (data as any)?.rows           ?? []
  const closingBalance = (data as any)?.closingBalance ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Closing Balance</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: Number(closingBalance) > 0 ? '#b45309' : '#059669' }}>
          {fmt(closingBalance)}
        </span>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['Date','Reference','Description','Debit','Credit','Balance'].map(h => (
                <th key={h} style={{ padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: ['Debit','Credit','Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-4)' }}>Loading…</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={6}><Empty message="No ledger entries" /></td></tr>
              : rows.map((e: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: e.type === 'opening' ? accent.faint : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}
                  onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'var(--surface-3)' }}
                  onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = e.type === 'opening' ? accent.faint : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}
                >
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>{e.date ? fmtDate(e.date_ad || e.date) : '—'}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: accent.solid, fontWeight: 600 }}>{e.reference || '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-2)' }}>{e.description || '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#dc2626', fontWeight: 500 }}>{Number(e.debit)  > 0 ? fmt(e.debit)  : '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: 500 }}>{Number(e.credit) > 0 ? fmt(e.credit) : '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{fmt(e.running_balance ?? e.balance ?? 0)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── SideDrawer ────────────────────────────────────────────────────────────────
export function SideDrawer({ party, label, defaultRole, accent, onClose, onEdit, onLedger }: {
  party: Party; label: string; defaultRole: string; accent: AccentConfig
  onClose: () => void; onEdit: () => void; onLedger: () => void
}) {
  const { data: ledgerData, isLoading } = usePartyLedger(party.id)
  const recentRows = ((ledgerData as any)?.rows ?? []).slice(0, 5)
  const closing    = (ledgerData as any)?.closingBalance ?? 0
  const { data: defaults = [] } = useAccountDefaults()
  const defaultAcct = (defaults as AccountDefault[]).find(d => d.role === defaultRole)

  return (
    <div style={{ width:'100%', position: 'fixed', inset: 0, zIndex: 999, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(1px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'var(--surface)', height: '100%', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: accent.solid, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
              {party.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, lineHeight: 1.2 }}>{party.name}</p>
              <p style={{ fontSize: 11, color: accent.solid, fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>{party.code}</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge active={party.is_active} />
            <BalanceChip value={closing} />
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: <Phone size={12} />,  label: 'Phone',   value: party.phone   || '—' },
              { icon: <span style={{ fontSize: 11 }}>💳</span>, label: 'PAN/VAT', value: party.pan_no  || '—' },
              { icon: <MapPin size={12} />, label: 'Address', value: party.address || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ marginTop: 2, width: 24, height: 24, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0 }}>
                  {row.icon}
                </span>
                <div>
                  <p style={{ fontSize: 9, color: 'var(--text-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.label}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, marginTop: 1 }}>{row.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Financials */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Financials</p>
            {/* Control account */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: accent.subtle, border: `1px solid ${accent.border}`, borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Landmark size={11} style={{ color: accent.solid }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: accent.solid, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Control Account</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {party.control_account_name
                  ? <span style={{ fontSize: 12, fontWeight: 600, color: accent.solid }}>{party.control_account_name}</span>
                  : defaultAcct
                  ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{defaultAcct.account_name} <span style={{ fontSize: 10, color: 'var(--text-4)' }}>(default)</span></span>
                  : <span style={{ fontSize: 11, color: '#b45309' }}>Not configured</span>
                }
              </div>
            </div>
            {[
              { label: 'Opening Balance', value: fmt(party.opening_balance), color: 'var(--text)' },
              { label: 'Current Balance', value: fmt(party.current_balance), color: Number(party.current_balance) > 0 ? '#b45309' : '#059669' },
              ...(party.credit_limit != null ? [{ label: 'Credit Limit', value: fmt(party.credit_limit), color: 'var(--text)' }] : []),
              { label: 'Credit Days', value: String(party.credit_days ?? 30), color: 'var(--text)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: row.color }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Recent Activity</p>
            {isLoading ? (
              [1,2,3].map(i => <div key={i} style={{ height: 40, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 6 }} />)
            ) : recentRows.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>No transactions yet</p>
            ) : (
              recentRows.map((row: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < recentRows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>{row.description || row.reference || '—'}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>{row.date ? fmtDate(row.date_ad || row.date) : '—'}</p>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: Number(row.debit) > 0 ? '#dc2626' : '#059669' }}>
                    {Number(row.debit) > 0 ? `-${fmt(row.debit)}` : `+${fmt(row.credit)}`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onEdit} style={{ flex: 1 }}>
            <Edit2 size={13} /> Edit
          </Button>
          <Button variant="primary" size="sm" onClick={onLedger}
            style={{ flex: 1, background: accent.solid }}>
            <BookOpen size={13} /> Ledger
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
export type SortKey = 'name' | 'code' | 'balance' | 'credit_limit' | 'created_at'
export type SortDir = 'asc' | 'desc'

export function SortIcon({ col, sortKey, sortDir, accent }: { col: SortKey; sortKey: SortKey; sortDir: SortDir; accent: AccentConfig }) {
  if (col !== sortKey) return <ArrowUpDown size={11} style={{ opacity: 0.3, marginLeft: 3, display: 'inline' }} />
  return sortDir === 'asc'
    ? <ArrowUp   size={11} style={{ marginLeft: 3, display: 'inline', color: accent.solid }} />
    : <ArrowDown size={11} style={{ marginLeft: 3, display: 'inline', color: accent.solid }} />
}

// ── PartyPage shell ───────────────────────────────────────────────────────────
export interface PartyPageConfig {
  label:       string        // 'Customer' | 'Supplier'
  defaultRole: string        // 'accounts_receivable' | 'accounts_payable'
  accent:      AccentConfig
  icon:        React.ReactNode
  kpiLabel:    string        // 'Total Receivable' | 'Total Payable'
  kpiIcon:     React.ReactNode
  createMutation: () => { mutateAsync: (d: PartyForm) => Promise<any> }
  listQuery: (params: any) => { data: any; isLoading: boolean }
}

export function PartyPage({
  label, defaultRole, accent, icon, kpiLabel, kpiIcon,
  createMutation, listQuery,
}: PartyPageConfig) {
  const [page,         setPage]      = useState(1)
  const [searchRaw,    setSearch]    = useState('')
  const [statusFilter, setStatus]    = useState<'all'|'active'|'inactive'>('all')
  const [balFilter,    setBalFilter] = useState<'all'|'positive'|'zero'>('all')
  const [sortKey,      setSortKey]   = useState<SortKey>('name')
  const [sortDir,      setSortDir]   = useState<SortDir>('asc')
  const [modal,        setModal]     = useState(false)
  const [editing,      setEditing]   = useState<Party | null>(null)
  const [delId,        setDelId]     = useState<string | null>(null)
  const [ledger,       setLedger]    = useState<Party | null>(null)
  const [preview,      setPreview]   = useState<Party | null>(null)
  const [selected,     setSelected]  = useState<Set<string>>(new Set())

  const search = useDebounce(searchRaw, 400)
  const create = createMutation()
  const del    = useDeleteParty()

  const { data, isLoading } = listQuery({ page, limit: 20, search: search || undefined })
  const rows  = useMemo(() => (data?.data as Party[]) || [], [data])
  const total = (data?.pagination as any)?.total || 0

  const activeCount     = useMemo(() => rows.filter(r => r.is_active).length, [rows])
  const totalBalance    = useMemo(() => rows.reduce((s, r) => s + Number(r.current_balance), 0), [rows])
  const totalCreditLim  = useMemo(() => rows.reduce((s, r) => s + Number(r.credit_limit ?? 0), 0), [rows])

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
    setSortKey(prev => { if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key }; setSortDir('asc'); return key })
  }, [])

  const allSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.id))
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filteredRows.map(r => r.id)))
  const toggleRow   = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // th helper
  const ThCol = ({ col, lbl, right = false }: { col: SortKey; lbl: string; right?: boolean }) => (
    <th onClick={() => toggleSort(col)}
      style={{ padding: '11px 16px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }}>
      {lbl}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} accent={accent} />
    </th>
  )

  const thStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap' }

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Page header */}
      <div className="pp-header" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 0 16px', marginBottom: 20, position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="pp-header-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <nav style={{ display: 'flex',alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-4)', marginBottom: 4,}}>
              <span>Parties</span>
              <ChevronRight size={11} />
              <span style={{ color: accent.solid, fontWeight: 600 }}>{label}s</span>
            </nav>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>{label}s</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Manage {label.toLowerCase()} information, balances, and transactions</p>
          </div>
          <Button variant="primary" size="md" icon={<Plus size={14} />}
            onClick={() => { setEditing(null); setModal(true) }}
            style={{ background: accent.solid, borderRadius: 12 }}>
            New {label}
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="pp-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard label={`Total ${label}s`}    value={isLoading ? '—' : total}             sub="Across all pages"     icon={icon}      iconBg={accent.subtle} iconColor={accent.solid} loading={isLoading} />
        <KpiCard label={`Active ${label}s`}   value={isLoading ? '—' : activeCount}       sub="On this page"        icon={<span style={{fontSize:18}}>✅</span>} iconBg="rgba(16,185,129,0.1)" iconColor="#059669" loading={isLoading} />
        <KpiCard label={kpiLabel}             value={isLoading ? '—' : fmt(totalBalance)} sub="Outstanding balance"  icon={kpiIcon}   iconBg="rgba(245,158,11,0.1)" iconColor="#b45309" loading={isLoading} />
        <KpiCard label="Total Credit Limit"   value={isLoading ? '—' : fmt(totalCreditLim)} sub="Combined credit lines" icon={<span style={{fontSize:18}}>🛡️</span>} iconBg="rgba(139,92,246,0.1)" iconColor="#7c3aed" loading={isLoading} />
      </div>

      {/* Filter toolbar */}
      <div className="pp-toolbar" style={{ ...CARD, padding: '14px 18px', marginBottom: 20 }}>
        <div className="pp-toolbar-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div className="pp-search-wrap" style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
            <input className="erp-input" style={{ width: '100%', paddingLeft: 30 }}
              placeholder={`Search ${label.toLowerCase()}s…`}
              value={searchRaw} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>

          <div className="pp-filter-selects" style={{ display: 'flex', gap: 10 }}>
            {[
              { val: statusFilter, set: (v: any) => setStatus(v), opts: [['all','All Status'],['active','Active'],['inactive','Inactive']] },
              { val: balFilter,    set: (v: any) => setBalFilter(v), opts: [['all','All Balances'],['positive','Has Balance'],['zero','Zero Balance']] },
            ].map((sel, i) => (
              <div key={i} style={{ position: 'relative', flex: 1 }}>
                <select value={sel.val} onChange={e => sel.set(e.target.value)} className="erp-input" style={{ width: '100%', paddingRight: 28, appearance: 'none', cursor: 'pointer' }}>
                  {sel.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
              </div>
            ))}
          </div>

          <div className="pp-toolbar-actions" style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('all'); setBalFilter('all'); setSortKey('name'); setSortDir('asc') }}>
              <RotateCcw size={12} /> Reset
            </Button>
            <Button variant="secondary" size="sm"><Download size={12} /> Export</Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="pp-table-card" style={{ ...CARD, overflow: 'hidden' }}>
        {selected.size > 0 && (
          <div className="pp-bulk-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: accent.subtle, borderBottom: `1px solid ${accent.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: accent.solid }}>{selected.size} selected</span>
            <Button variant="ghost" size="sm" style={{ color: '#dc2626' }}><Trash2 size={12} /> Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}><X size={12} /> Clear</Button>
          </div>
        )}

        <div className="pp-desktop-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: accent.solid }} />
                </th>
                <ThCol col="code"         lbl="Code" />
                <ThCol col="name"         lbl={label} />
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>PAN/VAT</th>
                <ThCol col="credit_limit" lbl="Credit Limit" right />
                <ThCol col="balance"      lbl="Balance"      right />
                <th style={thStyle}>Control Account</th>
                <th style={thStyle}>Status</th>
                <ThCol col="created_at"   lbl="Added" />
                <th style={{ ...thStyle, width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={11} /> : filteredRows.length === 0 ? (
                <tr><td colSpan={11}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontSize: 28 }}>
                      {label === 'Customer' ? '👤' : '🏭'}
                    </div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>No {label.toLowerCase()}s found</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
                      {searchRaw || statusFilter !== 'all' || balFilter !== 'all' ? 'Try adjusting your filters' : `Add your first ${label.toLowerCase()} to get started`}
                    </p>
                    {!(searchRaw || statusFilter !== 'all' || balFilter !== 'all') && (
                      <Button variant="primary" size="sm" icon={<Plus size={12}/>}
                        style={{ background: accent.solid }}
                        onClick={() => { setEditing(null); setModal(true) }}>
                        Create {label}
                      </Button>
                    )}
                  </div>
                </td></tr>
              ) : filteredRows.map((p, i) => {
                const rowBg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                return (
                  <tr key={p.id} onClick={() => setPreview(p)}
                    style={{ background: rowBg, borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = accent.faint }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = rowBg }}
                  >
                    <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleRow(p.id)}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: accent.solid }} />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, background: accent.subtle, color: accent.solid, padding: '2px 7px', borderRadius: 5 }}>
                        {p.code}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${accent.solid}, ${accent.solid}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, lineHeight: 1.2 }}>{p.name}</p>
                          {p.email && <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{p.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-2)' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '11px 16px' }}>
                      {p.pan_no
                        ? <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>{p.pan_no}</span>
                        : <span style={{ color: 'var(--text-4)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>
                      {p.credit_limit ? fmt(p.credit_limit) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <BalanceChip value={p.current_balance} />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      {p.control_account_name
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: accent.solid, background: accent.subtle, border: `1px solid ${accent.border}`, padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                            <Landmark size={10} />{p.control_account_name}
                          </span>
                        : <span style={{ fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic' }}>company default</span>
                      }
                    </td>
                    <td style={{ padding: '11px 16px' }}><StatusBadge active={p.is_active} /></td>
                    <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)' }}>
                      {p.created_at ? fmtDate(p.created_at) : '—'}
                    </td>
                    <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                      <ActionsMenu
                        label={label}
                        onView={()   => setPreview(p)}
                        onEdit={()   => { setEditing(p); setModal(true) }}
                        onLedger={()  => setLedger(p)}
                        onDelete={() => setDelId(p.id)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE: card list (hidden on desktop via CSS) ─────────── */}
        <div className="pp-mobile-list">
          {isLoading ? (
            <div className="pp-mobile-skel-wrap">
              {[1,2,3,4,5].map(i => <div key={i} className="pp-mobile-card pp-mobile-card-skel" />)}
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontSize: 28 }}>
                {label === 'Customer' ? '👤' : '🏭'}
              </div>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>No {label.toLowerCase()}s found</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
                {searchRaw || statusFilter !== 'all' || balFilter !== 'all' ? 'Try adjusting your filters' : `Add your first ${label.toLowerCase()} to get started`}
              </p>
              {!(searchRaw || statusFilter !== 'all' || balFilter !== 'all') && (
                <Button variant="primary" size="sm" icon={<Plus size={12}/>}
                  style={{ background: accent.solid }}
                  onClick={() => { setEditing(null); setModal(true) }}>
                  Create {label}
                </Button>
              )}
            </div>
          ) : (
            filteredRows.map(p => (
              <div key={p.id} className="pp-mobile-card" onClick={() => setPreview(p)}>
                {/* Top row: avatar + name/code + balance */}
                <div className="pp-mc-top">
                  <div className="pp-mc-avatar" style={{ background: `linear-gradient(135deg, ${accent.solid}, ${accent.solid}cc)` }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="pp-mc-name-wrap">
                    <p className="pp-mc-name">{p.name}</p>
                    <span className="pp-mc-code" style={{ background: accent.subtle, color: accent.solid }}>{p.code}</span>
                  </div>
                  <div className="pp-mc-balance">
                    <BalanceChip value={p.current_balance} />
                  </div>
                </div>

                {/* Contact row */}
                {(p.phone || p.pan_no) && (
                  <div className="pp-mc-contact">
                    {p.phone  && <span className="pp-mc-contact-item"><Phone size={11}/> {p.phone}</span>}
                    {p.pan_no && <span className="pp-mc-contact-item pp-mc-pan">{p.pan_no}</span>}
                  </div>
                )}

                {/* Chips row */}
                <div className="pp-mc-chips">
                  <StatusBadge active={p.is_active} />
                  {p.credit_limit ? (
                    <span className="pp-mc-credit">Limit {fmt(p.credit_limit)}</span>
                  ) : null}
                  {p.control_account_name && (
                    <span className="pp-mc-control" style={{ color: accent.solid, background: accent.subtle, border: `1px solid ${accent.border}` }}>
                      <Landmark size={10} />{p.control_account_name}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="pp-mc-actions" onClick={e => e.stopPropagation()}>
                  <button className="pp-mc-action-btn" onClick={() => setPreview(p)}>
                    <Eye size={13}/> View
                  </button>
                  <button className="pp-mc-action-btn" onClick={() => { setEditing(p); setModal(true) }}>
                    <Edit2 size={13}/> Edit
                  </button>
                  <button className="pp-mc-action-btn" onClick={() => setLedger(p)}>
                    <BookOpen size={13}/> Ledger
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <Pagination page={page} total={total} limit={20} onChange={setPage} />
        </div>
      </div>

      {/* Side Drawer */}
      {preview && (
        <SideDrawer party={preview} label={label} defaultRole={defaultRole} accent={accent}
          onClose={() => setPreview(null)}
          onEdit={() => { setEditing(preview); setPreview(null); setModal(true) }}
          onLedger={() => { setLedger(preview); setPreview(null) }}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null) }}
        title={editing ? `Edit ${label}` : `New ${label}`} size="lg">
        <PartyForm initial={editing} onClose={() => { setModal(false); setEditing(null) }}
          onCreate={(d) => create.mutateAsync(d)}
          label={label} defaultRole={defaultRole} accent={accent} />
      </Modal>

      {/* Ledger Modal */}
      {ledger && (
        <Modal open onClose={() => setLedger(null)} title={`Ledger — ${ledger.name}`} size="xl">
          <LedgerTable partyId={ledger.id} accent={accent} />
        </Modal>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!delId} onClose={() => setDelId(null)}
        onConfirm={() => del.mutate(delId!)}
        title={`Delete ${label}`}
        message={`This will permanently delete the ${label.toLowerCase()} and cannot be undone.`}
        danger
      />
    </div>
  )
}
