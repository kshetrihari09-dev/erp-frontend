/**
 * AccountDefaultsTab — Chart of Accounts Role Mapping
 *
 * Lets admins/accountants configure which ledger account to use for each
 * PostingEngine role (accounts_receivable, sales_revenue, cash, etc.).
 *
 * Until these are configured, Sales/Purchase/Returns save successfully but
 * create no journal entries. Once all required roles are mapped, every
 * subsequent transaction automatically flows through PostingEngine.
 *
 * Required roles (red if missing):
 *   accounts_receivable, accounts_payable, sales_revenue, inventory,
 *   cash, bank, tax_payable, tax_input
 *
 * Optional roles (grey):
 *   cogs, purchase_expense, discount_given, discount_received
 */
import { useState, useMemo } from 'react'
import { CheckCircle, AlertCircle, Trash2, Settings, ChevronRight, Info } from 'lucide-react'
import {
  useAccountDefaults,
  useSetAccountDefault,
  useDeleteAccountDefault,
  useAccounts,
} from '@/hooks/useQuery'
import { Button, Modal, Empty, SkeletonRows } from '@/components/ui'
import { ACCOUNT_DEFAULT_ROLES, type AccountDefault, type AccountDefaultRole } from '@/types'
import type { Account } from '@/types'

// Roles that MUST be configured for the engine to post any transaction
const REQUIRED_ROLES = new Set([
  'accounts_receivable',
  'accounts_payable',
  'sales_revenue',
  'inventory',
  'cash',
  'bank',
  'tax_payable',
  'tax_input',
])

// ─── Role Assignment Modal ─────────────────────────────────────────────────────

interface AssignModalProps {
  role:     string
  label:    string
  hint:     string
  current?: AccountDefault
  accounts: Account[]
  onClose:  () => void
}

function AssignModal({ role, label, hint, current, accounts, onClose }: AssignModalProps) {
  const [selected, setSelected]     = useState(current?.account_id ?? '')
  const [description, setDesc]      = useState(current?.description ?? '')
  const [search, setSearch]         = useState('')
  const setDefault = useSetAccountDefault()

  // Only show non-group leaf accounts
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return accounts.filter(a =>
      !a.is_group && a.is_active &&
      (a.name.toLowerCase().includes(q) || a.account_code.toLowerCase().includes(q))
    )
  }, [accounts, search])

  const handleSave = async () => {
    if (!selected) return
    await setDefault.mutateAsync({ role, account_id: selected, description })
    onClose()
  }

  return (
    <>
      {/* Role description */}
      <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
        <Info size={14} className="mt-0.5 text-[var(--brand)] shrink-0" />
        <p className="text-xs text-[var(--text-2)]">{hint}</p>
      </div>

      {/* Search box */}
      <div className="mb-3">
        <input
          className="erp-input w-full"
          placeholder="Search by account code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Account list */}
      <div className="max-h-60 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
        {filtered.length === 0
          ? <div className="py-6 text-center text-xs text-[var(--text-3)]">No matching accounts</div>
          : filtered.map(a => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={[
                  'w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors',
                  'hover:bg-[var(--surface-2)]',
                  selected === a.id ? 'bg-[var(--brand-light)] border-l-2 border-[var(--brand)]' : '',
                ].join(' ')}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <code className="text-[11px] font-mono text-[var(--brand)] shrink-0">{a.account_code}</code>
                  <span className="text-sm font-medium truncate">{a.name}</span>
                </span>
                <span className="text-[11px] text-[var(--text-3)] shrink-0 capitalize">{a.account_type}</span>
              </button>
            ))
        }
      </div>

      {/* Optional description */}
      <div className="mt-3">
        <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1">
          Note (optional)
        </label>
        <input
          className="erp-input w-full"
          placeholder="Internal note about this mapping…"
          value={description}
          onChange={e => setDesc(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!selected}
          loading={setDefault.isPending}
          onClick={handleSave}
        >
          Save Mapping
        </Button>
      </div>
    </>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function AccountDefaultsTab() {
  const [assignModal, setAssignModal] = useState<{ role: string; label: string; hint: string } | null>(null)

  const { data: defaults = [], isLoading: loadingDefaults } = useAccountDefaults()
  const { data: allAccounts = [], isLoading: loadingAccounts } = useAccounts()
  const accounts = (allAccounts as Account[])

  const deleteDefault = useDeleteAccountDefault()

  // Build a lookup: role → AccountDefault
  const defaultsByRole = useMemo(() => {
    const map: Record<string, AccountDefault> = {}
    for (const d of (defaults as AccountDefault[])) map[d.role] = d
    return map
  }, [defaults])

  const configuredCount = ACCOUNT_DEFAULT_ROLES.filter(r => defaultsByRole[r.value]).length
  const requiredMissing = [...REQUIRED_ROLES].filter(r => !defaultsByRole[r])
  const allRequiredDone = requiredMissing.length === 0

  const currentAssign = assignModal ? defaultsByRole[assignModal.role] : undefined

  return (
    <div>
      {/* ── Status Banner ─────────────────────────────────────────────────── */}
      <div className={[
        'flex items-start gap-3 mb-5 p-4 rounded-xl border',
        allRequiredDone
          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
          : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800',
      ].join(' ')}>
        {allRequiredDone
          ? <CheckCircle size={18} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          : <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        }
        <div>
          <p className={[
            'text-sm font-semibold',
            allRequiredDone ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300',
          ].join(' ')}>
            {allRequiredDone
              ? `Posting Engine active — all ${ACCOUNT_DEFAULT_ROLES.length} roles configured (${configuredCount}/${ACCOUNT_DEFAULT_ROLES.length})`
              : `${requiredMissing.length} required role${requiredMissing.length > 1 ? 's' : ''} not yet configured — transactions save but no journal entries are created`
            }
          </p>
          {!allRequiredDone && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Missing: {requiredMissing.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* ── Role Table ────────────────────────────────────────────────────── */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 18 }}></th>
                <th>Role</th>
                <th>Description</th>
                <th>Mapped Account</th>
                <th>Type</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingDefaults || loadingAccounts
                ? <SkeletonRows cols={6} />
                : ACCOUNT_DEFAULT_ROLES.map(({ value: role, label, hint }) => {
                    const mapped   = defaultsByRole[role]
                    const required = REQUIRED_ROLES.has(role)

                    return (
                      <tr key={role} className={mapped ? '' : required ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                        {/* Status indicator */}
                        <td>
                          {mapped
                            ? <CheckCircle size={14} className="text-green-500" />
                            : required
                              ? <AlertCircle size={14} className="text-red-400" />
                              : <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--border)]" />
                          }
                        </td>

                        {/* Role */}
                        <td>
                          <div className="flex items-center gap-1.5">
                            <code className="text-[11px] font-mono text-[var(--text-2)]">{role}</code>
                            {required && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-red-500 bg-red-100 dark:bg-red-900/30 px-1 py-0.5 rounded">
                                required
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-3)] mt-0.5">{hint}</p>
                        </td>

                        {/* Description */}
                        <td className="text-xs text-[var(--text-3)]">
                          {mapped?.description || '—'}
                        </td>

                        {/* Mapped account */}
                        <td>
                          {mapped
                            ? (
                                <span className="flex items-center gap-1.5">
                                  <code className="text-[11px] font-mono text-[var(--brand)]">
                                    {mapped.account_code}
                                  </code>
                                  <span className="font-medium text-sm">{mapped.account_name}</span>
                                </span>
                              )
                            : <span className="text-[var(--text-3)] text-xs italic">Not set</span>
                          }
                        </td>

                        {/* Account type */}
                        <td>
                          {mapped
                            ? <span className="badge badge-blue capitalize">{mapped.account_type}</span>
                            : null
                          }
                        </td>

                        {/* Actions */}
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setAssignModal({ role, label, hint })}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md
                                bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)]
                                text-[var(--text-2)] transition-colors"
                            >
                              <Settings size={11} />
                              {mapped ? 'Change' : 'Assign'}
                            </button>
                            {mapped && (
                              <button
                                onClick={() => deleteDefault.mutate(role)}
                                className="inline-flex items-center p-1.5 rounded-md
                                  text-[var(--text-3)] hover:text-red-500 hover:bg-red-50
                                  dark:hover:bg-red-950/20 transition-colors"
                                title="Remove mapping"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Setup Guide ───────────────────────────────────────────────────── */}
      {!allRequiredDone && (
        <div className="mt-5 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <ChevronRight size={14} className="text-[var(--brand)]" />
            Quick Setup Guide
          </h3>
          <ol className="text-xs text-[var(--text-2)] space-y-1 list-decimal list-inside">
            <li>Go to <strong>Chart of Accounts</strong> and create the required accounts (if not yet created).</li>
            <li>Return here and click <strong>Assign</strong> for each role marked "required".</li>
            <li>Select the matching ledger account — search by code or name.</li>
            <li>Once all 8 required roles are mapped, PostingEngine activates automatically.</li>
            <li>All future sales, purchases, returns and receives will create journal entries.</li>
          </ol>
          <p className="text-xs text-[var(--text-3)] mt-3">
            <strong>Tip:</strong> You can also run the server-side seed script for auto-detection:
            <code className="ml-1 px-1.5 py-0.5 rounded bg-[var(--surface-3)] font-mono text-[11px]">
              node scripts/seed_account_defaults.js &lt;company_id&gt;
            </code>
          </p>
        </div>
      )}

      {/* ── Assign Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title={`Map: ${assignModal?.label ?? ''}`}
        size="lg"
      >
        {assignModal && (
          <AssignModal
            role={assignModal.role}
            label={assignModal.label}
            hint={assignModal.hint}
            current={currentAssign}
            accounts={accounts}
            onClose={() => setAssignModal(null)}
          />
        )}
      </Modal>
    </div>
  )
}
