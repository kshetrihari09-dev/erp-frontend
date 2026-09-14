import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Store } from 'lucide-react'
import { Button, Input, Alert } from '@/components/ui'
import { customerAuthAPI } from '@/services/customerApi'
import { useStorefront } from './StorefrontContext'

export default function CustomerRegisterPage() {
  const navigate = useNavigate()
  // RequireStorefront (StorefrontContext.tsx) already guarantees status
  // === 'ok' by the time this page renders.
  const { companyId, name: storeName, logo: storeLogo, storeQuery } = useStorefront()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !phone.trim() || password.length < 6) {
      setError('Enter your name, phone number, and a password of at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      const res = await customerAuthAPI.register({ company_id: companyId, name: name.trim(), phone: phone.trim(), password })
      // No token — a new registration goes to approval, not straight into
      // the storefront (routes/customerAuth.js's /register no longer
      // signs a token; migration 037's status defaults to 'pending').
      const data = res.data.data
      navigate(`/customer/registration-status${storeQuery}`, {
        replace: true,
        state: { status: data.status, name: data.name, phone: data.phone, submittedAt: data.submitted_at },
      })
    } catch (err: any) {
      setError(err?.message || 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h1 className="text-lg font-extrabold text-center mb-1">Create an account</h1>
        <p className="text-xs text-[var(--text-3)] text-center mb-4">Your registration will be reviewed by the store before you can order</p>

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {storeLogo
              ? <img src={storeLogo} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
              : <span className="w-7 h-7 rounded-md bg-[var(--brand-light)] text-brand flex items-center justify-center flex-shrink-0"><Store size={14} /></span>}
            <span className="text-xs font-bold truncate">{storeName || 'Store'}</span>
          </div>
          <Link to={`/store?next=${encodeURIComponent('/customer/register')}`} className="text-[11px] font-semibold text-brand flex-shrink-0">Change Store</Link>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <Alert type="danger" message={error} />}
          <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <Input label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={submitting} className="mt-2">Submit Registration</Button>
        </form>

        <p className="text-xs text-center text-[var(--text-3)] mt-4">
          Already have an account? <Link to={`/customer/login${storeQuery}`} className="text-brand font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  )
}
