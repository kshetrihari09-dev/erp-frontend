/**
 * QuickAddManufacturerModal.tsx
 *
 * Inline "Quick Create" dialog for a Manufacturer, opened from the (+)
 * button beside ManufacturerSelect on the Product form. Same shape as
 * QuickAddPartyModal (Customer/Supplier) and QuickAddModal (Product) —
 * a small, self-contained dialog that saves via the existing
 * useCreateManufacturer mutation and hands the new record back.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Factory, AlertCircle, ExternalLink } from 'lucide-react'
import { useCreateManufacturer, useUpdateManufacturer } from '@/hooks/useQuery'
import { PATHS } from '@/constants'
import type { Manufacturer } from '@/types'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

interface Props {
  initialName?:    string
  /** Pass an existing manufacturer to edit it in place instead of creating
   *  a new one (used by ManufacturersPage's own "Edit" action). */
  initial?:        Manufacturer | null
  existingNames?:  string[]
  onSave:  (manufacturer: Manufacturer) => void
  onClose: () => void
}

interface FormState {
  name: string; short_name: string; contact_person: string; phone: string
  email: string; address: string; website: string; pan_no: string
  is_active: boolean; notes: string; cc_pct: string
}

export default function QuickAddManufacturerModal({ initialName, initial, existingNames, onSave, onClose }: Props) {
  const createManufacturer = useCreateManufacturer()
  const updateManufacturer = useUpdateManufacturer()
  const isEdit = !!initial

  const [form, setForm] = useState<FormState>({
    name:           initial?.name           || initialName || '',
    short_name:     initial?.short_name     || '',
    contact_person: initial?.contact_person || '',
    phone:          initial?.phone          || '',
    email:          initial?.email          || '',
    address:        initial?.address        || '',
    website:        initial?.website        || '',
    pan_no:         initial?.pan_no         || '',
    is_active:      initial?.is_active ?? true,
    notes:          initial?.notes          || '',
    cc_pct:         initial?.cc_pct != null ? String(initial.cc_pct) : '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const nameRef    = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  // Esc closes, Ctrl+Enter saves — registering this also suspends the
  // page's own F-key shortcuts while this modal is open (see
  // hooks/useKeyboardShortcuts.ts).
  useKeyboardShortcuts([
    { combo: 'esc', handler: onClose, description: 'Close' },
    { combo: 'ctrl+enter', handler: () => handleSave(), description: 'Save manufacturer' },
  ])

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
    if (fieldErrors[key]) setFieldErrors(fe => { const { [key]: _drop, ...rest } = fe; return rest })
  }

  function handleFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
  }

  async function handleSave() {
    setError('')
    const trimmedName = form.name.trim()

    if (!trimmedName) {
      setFieldErrors({ name: 'Manufacturer name is required' })
      setError('Manufacturer name is required')
      nameRef.current?.focus()
      return
    }
    const duplicate = existingNames?.some(
      n => n.trim().toLowerCase() === trimmedName.toLowerCase() && n.trim().toLowerCase() !== (initial?.name || '').trim().toLowerCase(),
    )
    if (duplicate) {
      setFieldErrors({ name: 'A manufacturer with this name already exists' })
      setError(`A manufacturer named "${trimmedName}" already exists — please confirm this isn't a duplicate.`)
      return
    }

    try {
      const payload = {
        name:           trimmedName,
        short_name:     form.short_name.trim()     || undefined,
        contact_person: form.contact_person.trim() || undefined,
        phone:          form.phone.trim()          || undefined,
        email:          form.email.trim()          || undefined,
        address:        form.address.trim()        || undefined,
        website:        form.website.trim()        || undefined,
        pan_no:         form.pan_no.trim()          || undefined,
        is_active:      form.is_active,
        notes:          form.notes.trim()           || undefined,
        cc_pct:         form.cc_pct.trim() === '' ? undefined : Math.min(100, Math.max(0, Number(form.cc_pct))),
      }
      const saved = isEdit
        ? await updateManufacturer.mutateAsync({ id: initial!.id, data: payload })
        : await createManufacturer.mutateAsync(payload)
      onSave(saved)
    } catch (e: any) {
      setError(e.message || 'Failed to save manufacturer')
    }
  }

  const saving = createManufacturer.isPending || updateManufacturer.isPending

  return createPortal(
    <div
      ref={overlayRef}
      className="qam-overlay"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="qam-panel" role="dialog" aria-modal="true" aria-label="Quick Add Manufacturer">

        {/* Header */}
        <div className="qam-header">
          <div className="qam-header-icon"><Factory size={16} /></div>
          <div>
            <h2 className="qam-title">{isEdit ? 'Edit Manufacturer' : 'Quick Add Manufacturer'}</h2>
            <p className="qam-subtitle">{isEdit ? 'Changes save immediately' : 'Manufacturer will be saved immediately'}</p>
          </div>
          <button type="button" className="qam-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="qam-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="qam-body">
          {/* Row 1 — Name + Short name/Code */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">Manufacturer Name <span className="qam-required">*</span></label>
              <input
                ref={nameRef}
                className="erp-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="e.g. Sunrise Pharmaceuticals Pvt. Ltd."
              />
              {fieldErrors.name && <p className="qam-field-error">{fieldErrors.name}</p>}
            </div>
            <div className="qam-field">
              <label className="qam-label">Short Name / Code <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.short_name}
                onChange={e => set('short_name', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="e.g. SPL"
              />
            </div>
          </div>

          {/* Row 2 — Contact person + Phone */}
          <div className="qam-row">
            <div className="qam-field">
              <label className="qam-label">Contact Person <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.contact_person}
                onChange={e => set('contact_person', e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </div>
            <div className="qam-field">
              <label className="qam-label">Phone Number <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>

          {/* Row 3 — Email + Website */}
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
            </div>
            <div className="qam-field">
              <label className="qam-label">Website <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.website}
                onChange={e => set('website', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="https://example.com"
              />
            </div>
          </div>

          {/* Row 4 — Address */}
          <div className="qam-row">
            <div className="qam-field qam-field--wide">
              <label className="qam-label">Address <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </div>
          </div>

          {/* Row 5 — PAN/VAT + C.C % + Status */}
          <div className="qam-row">
            <div className="qam-field">
              <label className="qam-label">PAN / VAT No <span className="qam-optional">(optional)</span></label>
              <input
                className="erp-input"
                value={form.pan_no}
                onChange={e => set('pan_no', e.target.value)}
                onKeyDown={handleFieldKeyDown}
              />
            </div>
            <div className="qam-field">
              <label className="qam-label">
                Default C.C % <span className="qam-optional">(optional)</span>
              </label>
              <input
                type="number" inputMode="decimal" min={0} max={100} step="0.01"
                className="erp-input"
                value={form.cc_pct}
                onChange={e => set('cc_pct', e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="0"
              />
            </div>
          </div>

          {/* Row 6 — Status */}
          <div className="qam-row">
            <div className="qam-field">
              <label className="qam-label">Status</label>
              <div className="qam-status-toggle">
                <button
                  type="button"
                  className={`qam-status-btn ${form.is_active ? 'qam-status-btn--active' : ''}`}
                  onClick={() => set('is_active', true)}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`qam-status-btn ${!form.is_active ? 'qam-status-btn--inactive' : ''}`}
                  onClick={() => set('is_active', false)}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          {/* Row 7 — Notes */}
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

          {!isEdit && (
            <a
              href={PATHS.MANUFACTURERS}
              target="_blank"
              rel="noopener noreferrer"
              className="qam-manage-link"
            >
              <ExternalLink size={12} />
              Manage Manufacturers
            </a>
          )}
        </div>

        <div className="qam-footer">
          <button type="button" className="qam-btn-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="qam-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (<><Factory size={14} /> {isEdit ? 'Save Changes' : 'Save Manufacturer'}</>)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
