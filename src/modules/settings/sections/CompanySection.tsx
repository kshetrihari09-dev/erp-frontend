import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Save } from 'lucide-react'
import { useCompanySettings } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import { Button, Select } from '@/components/ui'
import { useSensitiveConfirm } from '../hooks/useSensitiveConfirm'

export default function CompanySection() {
  const { success, error } = useUIStore()
  const setCompany = useAuthStore(s => s.setCompany)
  const { data: company, isLoading } = useCompanySettings()
  const { runWithConfirm, dialog } = useSensitiveConfirm()

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      name: '', address: '', phone: '', email: '',
      pan_no: '', registration_no: '', invoice_prefix: 'INV',
      currency: 'NPR', vat_percent: 13, date_system: 'AD' as 'AD' | 'BS',
    },
  })

  useEffect(() => {
    if (company) {
      reset({
        name:             company.name || '',
        address:          company.address || '',
        phone:            company.phone || '',
        email:            company.email || '',
        pan_no:           company.pan_no || '',
        registration_no:  company.registration_no || '',
        invoice_prefix:   company.invoice_prefix || 'INV',
        currency:         company.currency || 'NPR',
        vat_percent:      company.vat_percent || 13,
        date_system:      company.date_system || 'AD',
      })
    }
  }, [company])

  const onSubmit = handleSubmit(async (data) => {
    try {
      const r = await runWithConfirm(confirmPassword =>
        settingsAPI.updateCompany(confirmPassword ? { ...data, confirmPassword } as any : data)
      )
      if (r.data.data) setCompany(r.data.data)
      success('Company settings saved')
    } catch (e: any) { error('Save failed', e?.response?.data?.message || e.message) }
  })

  if (isLoading) return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>

  return (
    <div className="max-w-2xl">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card">
        <div className="font-bold text-sm mb-4">Company Information</div>
        <div className="form-grid">
          <div className="stp-span2">
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Company Name *</label>
            <input className="erp-input" {...register('name')} />
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
        <div className="flex justify-end mt-5">
          <Button variant="primary" icon={<Save size={14}/>} loading={isSubmitting} onClick={onSubmit}>
            Save Changes
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  )
}
