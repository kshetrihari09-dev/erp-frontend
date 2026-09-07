import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Input, Alert } from '@/components/ui'
import { customerAuthAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import { useStorefrontCompany } from './useStorefrontCompany'

export default function CustomerLoginPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }
  const setAuth = useCustomerAuthStore(s => s.setAuth)
  const { companyId, missing } = useStorefrontCompany()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim() || !password) { setError('Enter your phone number and password.'); return }
    setLoading(true)
    try {
      const res = await customerAuthAPI.login({ company_id: companyId, login_identifier: phone.trim(), password })
      const { token, customer } = res.data.data
      setAuth({ token, customer, companyId })
      navigate(location.state?.from?.pathname || '/customer', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  if (missing) {
    return (
      <div className="flex items-center justify-center h-screen p-6 text-center">
        <p className="text-sm text-[var(--text-3)]">This storefront isn't configured yet. Please contact the store owner.</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h1 className="text-lg font-extrabold text-center mb-1">🛍️ Welcome back</h1>
        <p className="text-xs text-[var(--text-3)] text-center mb-5">Log in to order online</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <Alert type="danger" message={error} />}
          <Input label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98XXXXXXXX" autoFocus />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={loading} className="mt-2">Log In</Button>
        </form>

        <p className="text-xs text-center text-[var(--text-3)] mt-4">
          New here? <Link to={`/customer/register${companyId ? `?company=${companyId}` : ''}`} className="text-brand font-semibold">Create an account</Link>
        </p>
      </div>
    </div>
  )
}
