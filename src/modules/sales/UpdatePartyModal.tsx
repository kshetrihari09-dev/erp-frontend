/**
 * UpdatePartyModal.tsx — Sale List "Update Party".
 *
 * Reuses:
 *   - The same `customers` list SalesPage already loads via
 *     partiesAPI.customers() for the New Sale party selector — no new
 *     API/fetch is introduced here.
 *   - The existing Modal/Button/SearchInput/Alert primitives from
 *     components/ui, same as every other modal in this module.
 *
 * Intentionally does NOT offer "+ New Customer" (QuickAddPartyModal) —
 * reassigning an already-saved sale is not the moment to be creating a
 * brand-new party; that flow stays on the New Sale form.
 *
 * The "same party selected" guard is enforced here, client-side, before
 * the Update button is even enabled — matches the spec's "do not make an
 * unnecessary API request" rule. The backend (routes/sales.js PUT
 * /:id/party) enforces the same rule again server-side as the source of
 * truth; this is purely a UX shortcut, not the real validation.
 */
import { useMemo, useState } from 'react'
import { Modal, Button, SearchInput, Alert } from '@/components/ui'
import type { Sale, Party } from '@/types'

export default function UpdatePartyModal({
  sale, customers, onClose, onSubmit,
}: {
  sale: Sale
  /** Active + inactive customers already loaded by the parent — filtered
   *  down to active ones below (an inactive party can't be assigned). */
  customers: Party[]
  onClose: () => void
  /** Rejects on failure (parent shows the toast); resolves on success.
   *  This component does not close itself — the parent does, once its
   *  own success handling (list refresh, etc.) has run. */
  onSubmit: (newPartyId: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    const active = customers.filter(c => c.is_active !== false)
    const list = !q
      ? active
      : active.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q),
        )
    return list.slice(0, 50) // same practical cap as a native <select>'s usable size
  }, [customers, search])

  const selectedParty = customers.find(c => c.id === selectedId)
  const isSameParty   = !!selectedId && selectedId === sale.party_id

  async function handleSubmit() {
    if (!selectedId || isSameParty || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(selectedId)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open onClose={onClose} title="Update Party" size="sm" fullScreenOnMobile
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary" size="sm" loading={submitting}
            disabled={!selectedId || isSameParty}
            onClick={handleSubmit}
          >
            Update Party
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-[var(--text-3)]">
          Invoice: <span className="font-semibold text-[var(--text)]">{sale.invoice_no}</span>
        </div>
        <div className="text-sm text-[var(--text-3)]">
          Current Party: <span className="font-semibold text-[var(--text)]">{sale.party_name || '—'}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">
            Select New Party
          </label>
          <SearchInput value={search} onChange={setSearch} placeholder="Search customer by name, code or phone…" />
          <div className="max-h-56 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            {results.length === 0 ? (
              <div className="p-3 text-sm text-[var(--text-4)]">No customers found</div>
            ) : results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-[var(--surface-3)] transition-colors ${
                  selectedId === c.id ? 'bg-[var(--surface-3)] font-semibold' : ''
                }`}
              >
                <span className="truncate">{c.code ? `${c.code} — ` : ''}{c.name}</span>
                {c.phone && <span className="text-[var(--text-4)] text-xs flex-shrink-0">{c.phone}</span>}
              </button>
            ))}
          </div>
        </div>

        {isSameParty && (
          <Alert type="warning" message="This party is already assigned to this sale." />
        )}

        {selectedParty && !isSameParty && (
          <Alert
            type="info"
            message={<>Invoice <b>{sale.invoice_no}</b> will move from <b>{sale.party_name || '—'}</b> to <b>{selectedParty.name}</b>. Amounts, items and payment details stay unchanged.</>}
          />
        )}
      </div>
    </Modal>
  )
}
