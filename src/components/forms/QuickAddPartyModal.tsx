/**
 * QuickAddPartyModal.tsx
 *
 * Inline "Quick Create" dialog for a Customer (Sale page) or Supplier
 * (Purchase page) — opened from the (+) button beside the party
 * selector, so billing never has to leave the page to add a new party.
 *
 * Mirrors QuickAddModal.tsx (the equivalent "quick add product" dialog):
 * same visual language (qam-* classes), same shape — a small, self
 * contained dialog that calls an existing create API directly and hands
 * the new record back to the caller.
 *
 * Uses the existing partiesAPI.createCustomer / createSupplier and the
 * same partySchema validation as the full Customer/Supplier management
 * page (modules/users/PartyPageShared.tsx) — no new endpoint, no new
 * validation rule, no schema change.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, UserPlus, Truck, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { partiesAPI } from '@/services/api'
import { partySchema } from '@/schemas/party'
import { PATHS } from '@/constants'
import type { Party, PartyType } from '@/types'

interface Props {
  type:        PartyType            // 'customer' | 'supplier'
  /** Names already loaded on the Sale/Purchase page — used only for an
   *  immediate, friendly heads-up before hitting the API. The backend's
   *  own rule (whatever it is) still has the final say; this never
   *  blocks a save on its own, it just warns first. */
  existingNames?: string[]
  onSave:  (party: Party) => void
  onClose: () => void
}

interface FormState {
  name:            string
  phone:           string
  address:         string
  email:           string
  pan_no:          string
  credit_limit:    string
  opening_balance: string
  notes:           string
}

const emptyForm: FormState = {
  name: '', phone: '', address: '', email: '',
  pan_no: '', credit_limit: '', opening_balance: '', notes: '',
}

export default function QuickAddPartyModal({ type, existingNames, onSave, onClose }: Props) {
  const isCustomer = type === 'customer'
  const label      = isCustomer ? 'Customer' : 'Supplier'
  const managePath = isCustomer ? PATHS.CUSTOMERS : PATHS.SUPPLIERS

  const [form, setForm]       = useState<FormState>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')

  const nameRef     = useRef<HTMLInputElement>(null)
  const overlayRef  = useRef<HTMLDivElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  // Escape closes, matching QuickAddModal's own keyboard behaviour.
  // Enter-to-save is handled per-field below (not globally), so it
  // doesn't fire while, e.g., a <select> or button has focus mid-tab.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(key: keyof FormState, val: string) {
    setForm(f => ({ ...f, [key]: val }))
    if (fieldErrors[key]) setFieldErrors(fe => { const { [key]: _drop, ...rest } = fe; return rest })
  }

  function handleFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
  }

  async function handleSave() {
    setError('')

    const trimmedName = form.name.trim()
    const duplicate = trimmedName && existingNames?.some(
      n => n.trim().toLowerCase() === trimmedName.toLowerCase(),
    )

    const parsed = partySchema.safeParse({
      name:            trimmedName,
      phone:           form.phone.trim()   || undefined,
      email:           form.email.trim(),
      address:         form.address.trim() || undefined,
      pan_no:          form.pan_no.trim()  || undefined,
      credit_limit:    form.credit_limit   || undefined,
      opening_balance: form.opening_balance || undefined,
    })

    if (!parsed.success) {
      const fe: Record<string, string> = {}
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] = issue.message
      setFieldErrors(fe)
      setError(parsed.error.issues[0]?.message || 'Please check the form for errors')
      return
    }
    if (duplicate) {
      setFieldErrors(fe => ({ ...fe, name: `A ${label.toLowerCase()} with this name already exists` }))
      setError(`A ${label.toLowerCase()} named "${trimmedName}" already exists — please confirm this isn't a duplicate.`)
      return
    }

    setSaving(true)
    try {
      const payload: Partial<Party> & { notes?: string } = {
        name:            parsed.data.name,
        phone:           parsed.data.phone || undefined,
        email:           parsed.data.email || undefined,
        address:         parsed.data.address || undefined,
        pan_no:          parsed.data.pan_no || undefined,
        credit_limit:    parsed.data.credit_limit,
        credit_days:     parsed.data.credit_days,
        opening_balance: parsed.data.opening_balance,
      }
      // `notes` isn't a field the party create endpoint currently persists
      // (the full management page's own create form doesn't send it
      // either — see PartyPageShared.tsx). Included here only in case a
      // future backend adds it; an unrecognised extra key is otherwise
      // harmless to send.
      if (form.notes.trim()) payload.notes = form.notes.trim()

      const res = isCustomer
        ? await partiesAPI.createCustomer(payload)
        : await partiesAPI.createSupplier(payload)

      onSave(res.data.data)
    } catch (e: any) {
      setError(e.message || `Failed to save ${label.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="qam-overlay"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="qam-panel" role="dialog" aria-modal="true" aria-label={`Quick Add ${label}`}>

        {/* Header */}
        <div className="qam-header">
          <div className="qam-header-icon">
            {isCustomer ? <UserPlus size={16} /> : <Truck size={16} />}
          </div>
          <div>
            <h2 className="qam-title">Quick Add {label}</h2>
            <p className="qam-subtitle">{label} will be saved to database immediately</p>
          </div>
          <button type="button" className="qam-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="qam-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Body */}
        <div className="qam-body">
          {/* Row 1 — Name + Mobile */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">{label} Name <span className="qam-required">*</span></label>
              <input
                ref={nameRef}
                className="erp-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder={isCustomer ? 'e.g. Sunrise Trading Co.' : 'e.g. Himal Distributors Pvt. Ltd.'}
              />
              {fieldErrors.name && <p className="qam-field-error">{fieldErrors.name}</p>}
            </div>
            <div className="qam-field">
              <label className="qam-label">Mobile Number</label>
              <input
                className="erp-input"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="98XXXXXXXX"
              />
              {fieldErrors.phone && <p className="qam-field-error">{fieldErrors.phone}</p>}
            </div>
          </div>

          {/* Row 2 — Address */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">Address</label>
              <input
                className="erp-input"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="Street, city"
              />
            </div>
          </div>

          {/* Row 3 — Email + PAN/VAT */}
          <div className="qam-row">
            <div className="qam-field">
              <label className="qam-label">Email <span className="qam-optional">(optional)</span></label>
              <input
                type="email"
                className="erp-input"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="name@example.com"
              />
              {fieldErrors.email && <p className="qam-field-error">{fieldErrors.email}</p>}
            </div>
            <div className="qam-field">
              <label className="qam-label">PAN / VAT No <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.pan_no}
                onChange={e => set('pan_no', e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="qam-divider">
            <span>Account <span className="qam-optional">(optional)</span></span>
          </div>

          {/* Row 4 — Credit limit + Opening balance */}
          <div className="qam-row">
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Credit Limit</label>
              <div className="qam-input-prefix">
                <span className="qam-prefix">₹</span>
                <input
                  type="number" min="0" step="0.01"
                  className="erp-input qam-has-prefix"
                  value={form.credit_limit}
                  onChange={e => set('credit_limit', e.target.value)}
                  onKeyDown={handleFieldKeyDown}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="qam-field qam-field--sm">
              <label className="qam-label">Opening Balance</label>
              <div className="qam-input-prefix">
                <span className="qam-prefix">₹</span>
                <input
                  type="number" step="0.01"
                  className="erp-input qam-has-prefix"
                  value={form.opening_balance}
                  onChange={e => set('opening_balance', e.target.value)}
                  onKeyDown={handleFieldKeyDown}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Row 5 — Notes */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">Notes <span className="qam-optional">(optional)</span></label>
              <textarea
                className="erp-input"
                rows={2}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any internal remarks…"
                style={{ resize: 'vertical', minHeight: 36 }}
              />
            </div>
          </div>

          {/* Manage link */}
          <a
            href={managePath}
            target="_blank"
            rel="noopener noreferrer"
            className="qam-manage-link"
          >
            <ExternalLink size={12} />
            Manage {label}s
          </a>
        </div>

        {/* Footer */}
        <div className="qam-footer">
          <button type="button" className="qam-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="qam-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="qam-spin" />
                Saving…
              </>
            ) : (
              <>
                {isCustomer ? <UserPlus size={14} /> : <Truck size={14} />}
                Save {label}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
