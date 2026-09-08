import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, Alert } from '@/components/ui'
import { customerAuthAPI } from '@/services/customerApi'
import useCustomerAuthStore from '@/store/customerAuthStore'
import { useStorefrontCompany } from './useStorefrontCompany'

export default function CustomerRegisterPage() {
  const navigate = useNavigate()
  const setAuth = useCustomerAuthStore(s => s.setAuth)
  const { companyId, missing, invalid } = useStorefrontCompany()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !phone.trim() || password.length < 6) {
      setError('Enter your name, phone number, and a password of at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      const res = await customerAuthAPI.register({ company_id: companyId, name: name.trim(), phone: phone.trim(), password })
      const { token, customer } = res.data.data
      setAuth({ token, customer, companyId })
      navigate('/customer', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  if (missing || invalid) {
    return (
      <div className="flex items-center justify-center h-screen p-6 text-center">
        <p className="text-sm text-[var(--text-3)]">
          {missing
            ? 'Store configuration is missing. Please contact the administrator.'
            : 'Invalid store configuration.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h1 className="text-lg font-extrabold text-center mb-1">Create an account</h1>
        <p className="text-xs text-[var(--text-3)] text-center mb-5">Just a few details to get started</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <Alert type="danger" message={error} />}
          <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <Input label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={loading} className="mt-2">Create Account</Button>
        </form>

        <p className="text-xs text-center text-[var(--text-3)] mt-4">
          Already have an account? <Link to={`/customer/login${companyId ? `?company=${companyId}` : ''}`} className="text-brand font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  )
}
