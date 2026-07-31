/**
 * CompanyFormModal.tsx — Create or Edit a company.
 *
 * Same field set as Settings → Company (CompanySection.tsx), just usable
 * for ANY company the user belongs to, not only the currently active one.
 * Create goes through POST /companies (full seeding — chart of accounts,
 * opening fiscal year, default invoice template — identical to signup).
 * Edit goes through PUT /companies/:id.
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Modal, Button, Select } from '@/components/ui'
import { companiesAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import type { UserCompany } from '@/types'

interface FormValues {
  name:             string
  address:          string
  phone:            string
  email:            string
  pan_no:           string
  registration_no:  string
  invoice_prefix:   string
  currency:         string
  vat_percent:      number
  date_system:      'AD' | 'BS'
}

const BLANK: FormValues = {
  name: '', address: '', phone: '', email: '',
  pan_no: '', registration_no: '', invoice_prefix: 'INV',
  currency: 'NPR', vat_percent: 13, date_system: 'AD',
}

export default function CompanyFormModal({
  open, onClose, company, onSaved,
}: {
  open:      boolean
  onClose:   () => void
  /** Pass an existing company to edit it; omit/undefined to create a new one. */
  company?:  UserCompany | null
  onSaved:   () => void
}) {
  const { success, error } = useUIStore()
  const isEdit = !!company

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: BLANK,
  })

  useEffect(() => {
    if (!open) return
    reset(company ? {
      name:            company.name || '',
      address:         company.address || '',
      phone:           company.phone || '',
      email:           company.email || '',
      pan_no:          company.pan_no || '',
      registration_no: company.registration_no || '',
      invoice_prefix:  company.invoice_prefix || 'INV',
      currency:        company.currency || 'NPR',
      vat_percent:     company.vat_percent ?? 13,
      date_system:     company.date_system || 'AD',
    } : BLANK)
  }, [open, company])

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEdit && company) {
        await companiesAPI.update(company.id, data)
        onSaved()
        success('Company updated')
      } else {
        await companiesAPI.create(data)
        onSaved()
        success('Company created', 'You can switch into it any time from the company selector.')
      }
      onClose()
    } catch (e: any) {
      error(isEdit ? 'Update failed' : 'Create failed', e?.response?.data?.message || e.message)
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Company' : 'Add Company'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={isSubmitting} onClick={onSubmit}>
            {isEdit ? 'Save Changes' : 'Create Company'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="stp-span2">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Company Name *</label>
          <input className="erp-input" autoFocus {...register('name', { required: true })} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Phone</label>
          <input className="erp-input" {...register('phone')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Email</label>
          <input type="email" className="erp-input" {...register('email')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">PAN / VAT No</label>
          <input className="erp-input" {...register('pan_no')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Registration No</label>
          <input className="erp-input" {...register('registration_no')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Invoice Prefix</label>
          <input className="erp-input" placeholder="INV" {...register('invoice_prefix')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">VAT %</label>
          <input type="number" className="erp-input" {...register('vat_percent')} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Primary Date System</label>
          <Select
            options={[{ value: 'AD', label: 'AD (Gregorian)' }, { value: 'BS', label: 'BS (Bikram Sambat)' }]}
            {...register('date_system')}
          />
        </div>
        <div className="stp-span2">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Address</label>
          <input className="erp-input" placeholder="Kathmandu, Nepal" {...register('address')} />
        </div>
      </div>
      {!isEdit && (
        <p className="text-xs text-[var(--text-4)] mt-4">
          A new chart of accounts, opening fiscal year, and default invoice template
          are set up automatically — separate and isolated from your other companies.
        </p>
      )}
    </Modal>
  )
}
