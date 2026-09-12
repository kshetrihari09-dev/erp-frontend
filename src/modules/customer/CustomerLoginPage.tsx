import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Input, Alert, Spinner } from '@/components/ui'
import { customerAuthAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import { useStorefront } from './StorefrontContext'

export default function CustomerLoginPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }
  const setAuth = useCustomerAuthStore(s => s.setAuth)
  const { companyId, name: storeName, status, storeQuery } = useStorefront()
  const storefrontLoading = status === 'loading'
  const missing = status === 'missing'
  const invalid = status === 'invalid' || status === 'error'

  const [phone, setPhone] = useState('')
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
      navigate(location.state?.from?.pathname || '/customer', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (storefrontLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size={28} className="text-brand" />
      </div>
    )
  }

  if (missing || invalid) {
    return (
      <div className="flex items-center justify-center h-screen p-6 text-center">
        <p className="text-sm text-[var(--text-3)]">
          {missing
            ? 'Store configuration is unavailable. Please contact the store administrator.'
            : 'This store is currently unavailable.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h1 className="text-lg font-extrabold text-center mb-1">🛍️ Welcome back</h1>
        <p className="text-xs text-[var(--text-3)] text-center mb-5">
          {storeName ? `Log in to order from ${storeName}` : 'Log in to order online'}
        </p>

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
