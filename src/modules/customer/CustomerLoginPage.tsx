import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Store } from 'lucide-react'
import { Button, Input, Alert } from '@/components/ui'
import { customerAuthAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import { useStorefront } from './StorefrontContext'

export default function CustomerLoginPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string }; prefillPhone?: string } }
  const setAuth = useCustomerAuthStore(s => s.setAuth)
  // RequireStorefront (StorefrontContext.tsx) already guarantees status
  // === 'ok' by the time this page renders — no missing/invalid handling
  // needed here anymore.
  const { companyId, name: storeName, logo: storeLogo, storeQuery } = useStorefront()

  // Bounced here from CustomerRegistrationStatusPage's "Check Registration
  // Status" button — save the customer re-typing their phone number.
  const [phone, setPhone] = useState(location.state?.prefillPhone || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim() || !password) { setError('Enter your phone number and password.'); return }
    setSubmitting(true)
    try {
      const res = await customerAuthAPI.login({ company_id: companyId, login_identifier: phone.trim(), password })
      const { token, customer } = res.data.data
      setAuth({ token, customer, companyId })
      navigate(`${location.state?.from?.pathname || '/customer'}${storeQuery}`, { replace: true })
    } catch (err: any) {
      // Approval workflow (routes/customerAuth.js) — a pending/rejected
      // registration is a status to SHOW, not a login error to explain
      // inline; hand it to the same status screen registration itself
      // lands on, with whatever the backend returned (submitted date /
      // rejection reason).
      if (err?.code === 'REGISTRATION_PENDING' || err?.code === 'REGISTRATION_REJECTED') {
        navigate(`/customer/registration-status${storeQuery}`, {
          replace: true,
          state: { status: err.data?.status, name: undefined, phone: phone.trim(), submittedAt: err.data?.submitted_at, reason: err.data?.reason },
        })
        return
      }
      setError(err?.message || 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h1 className="text-lg font-extrabold text-center mb-1">Welcome back</h1>
        <p className="text-xs text-[var(--text-3)] text-center mb-4">Log in to order online</p>

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {storeLogo
              ? <img src={storeLogo} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
              : <span className="w-7 h-7 rounded-md bg-[var(--brand-light)] text-brand flex items-center justify-center flex-shrink-0"><Store size={14} /></span>}
            <span className="text-xs font-bold truncate">{storeName || 'Store'}</span>
          </div>
          <Link to={`/store?next=${encodeURIComponent('/customer/login')}`} className="text-[11px] font-semibold text-brand flex-shrink-0">Change Store</Link>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <Alert type="danger" message={error} />}
          <Input label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98XXXXXXXX" autoFocus />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={submitting} className="mt-2">Log In</Button>
        </form>

        <p className="text-xs text-center text-[var(--text-3)] mt-4">
          New here? <Link to={`/customer/register${storeQuery}`} className="text-brand font-semibold">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
