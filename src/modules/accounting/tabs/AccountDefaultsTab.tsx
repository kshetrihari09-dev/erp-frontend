/**
 * AccountDefaultsTab — Engine Setup / Chart of Accounts Role Mapping
 *
 * Every role here is pre-assigned a sensible default automatically when
 * the company is created (see auth.js seedAccountDefaults / companies.js),
 * so the ERP is usable immediately without any manual setup. Fields marked
 * "Default" are still using that auto-assigned account.
 *
 * Every field remains fully editable at any time — changing a mapping only
 * affects future postings; existing vouchers and journal entries always
 * keep the account they were originally posted against. "Reset to Default"
 * restores the original auto-assigned account for a role.
 *
 * For companies that existed before this feature (so have no defaults yet),
 * this page auto-runs a one-time, idempotent "initialize" pass on first
 * load that fills in any still-unmapped roles it can match from the
 * existing Chart of Accounts — it never overwrites a role that's already
 * configured.
 *
 * Required roles (red if missing):
 *   accounts_receivable, accounts_payable, sales_revenue, inventory,
 *   cash, bank, tax_payable, tax_input
 *
 * Optional roles (grey):
 *   cogs, purchase_expense, discount_given, discount_received
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { CheckCircle, AlertCircle, Trash2, Settings, ChevronRight, Info, RotateCcw, Sparkles } from 'lucide-react'
import {
  useAccountDefaults,
  useSetAccountDefault,
  useDeleteAccountDefault,
  useResetAccountDefault,
  useInitializeAccountDefaults,
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
      (a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
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
                  <code className="text-[11px] font-mono text-[var(--brand)] shrink-0">{a.code}</code>
                  <span className="text-sm font-medium truncate">{a.name}</span>
                </span>
                <span className="text-[11px] text-[var(--text-3)] shrink-0 capitalize">{a.type}</span>
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

  const deleteDefault    = useDeleteAccountDefault()
  const resetDefault     = useResetAccountDefault()
  const initializeAll    = useInitializeAccountDefaults()

  // One-time, silent auto-assign for companies that opened this page before
  // any defaults existed (e.g. created before this feature shipped). Never
  // overwrites roles that are already configured — see /account-defaults/initialize.
  const hasAutoInitialized = useRef(false)
  useEffect(() => {
    if (loadingDefaults) return
    if (hasAutoInitialized.current) return
    if ((defaults as AccountDefault[]).length >= ACCOUNT_DEFAULT_ROLES.length) return
    hasAutoInitialized.current = true
    initializeAll.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDefaults, defaults])

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
        <div className="flex-1">
          <p className={[
            'text-sm font-semibold',
            allRequiredDone ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300',
          ].join(' ')}>
            {allRequiredDone
              ? `Posting Engine active — all ${ACCOUNT_DEFAULT_ROLES.length} roles configured (${configuredCount}/${ACCOUNT_DEFAULT_ROLES.length})`
              : `${requiredMissing.length} required role${requiredMissing.length > 1 ? 's' : ''} not yet configured — transactions save but no journal entries are created`
            }
          </p>
          <p className="text-xs mt-1 opacity-80">
            Every field below is pre-assigned a sensible default and ready to use — edit or reset any of them anytime.
          </p>
          {!allRequiredDone && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Missing: {requiredMissing.join(', ')}
            </p>
          )}
        </div>
        {!allRequiredDone && (
          <Button
            variant="secondary"
            size="sm"
            loading={initializeAll.isPending}
            onClick={() => initializeAll.mutate()}
          >
            <Sparkles size={13} className="mr-1" />
            Auto-Assign Defaults
          </Button>
        )}
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
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  <code className="text-[11px] font-mono text-[var(--brand)]">
                                    {mapped.account_code}
                                  </code>
                                  <span className="font-medium text-sm">{mapped.account_name}</span>
                                  {mapped.is_default && (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider
                                        text-[var(--brand)] bg-[var(--brand-light)] px-1.5 py-0.5 rounded"
                                      title="Auto-assigned when the company was set up — not yet changed"
                                    >
                                      <Sparkles size={9} />
                                      Default
                                    </span>
                                  )}
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
                            {mapped && !mapped.is_default && mapped.default_account_id && (
                              <button
                                onClick={() => resetDefault.mutate(role)}
                                disabled={resetDefault.isPending}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md
                                  bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)]
                                  text-[var(--text-2)] transition-colors"
                                title={`Restore ${mapped.default_account_code ?? ''} ${mapped.default_account_name ?? ''}`.trim()}
                              >
                                <RotateCcw size={11} />
                                Reset
                              </button>
                            )}
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
            Still missing a few roles?
          </h3>
          <p className="text-xs text-[var(--text-2)] mb-2">
            New companies get all 12 roles pre-assigned automatically. If some are still
            missing here, click <strong>Auto-Assign Defaults</strong> above to match them
            against your existing Chart of Accounts — it only fills in gaps and never
            changes a role you've already configured. Anything it can't match (e.g. no
            matching account exists yet) you can assign manually:
          </p>
          <ol className="text-xs text-[var(--text-2)] space-y-1 list-decimal list-inside">
            <li>Go to <strong>Chart of Accounts</strong> and create the missing account (if needed).</li>
            <li>Return here and click <strong>Assign</strong> for that role.</li>
            <li>Select the matching ledger account — search by code or name.</li>
          </ol>
          <p className="text-xs text-[var(--text-3)] mt-3">
            <strong>Tip:</strong> the same matching logic is also available as a one-off
            server script:
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
