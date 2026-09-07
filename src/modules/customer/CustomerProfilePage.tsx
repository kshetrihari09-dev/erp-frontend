import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import useCustomerAuthStore from '@/store/customerAuthStore'
import { useUpdateCustomerProfile, useChangeCustomerPassword } from '@/hooks/useCustomerQuery'

export default function CustomerProfilePage() {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore(s => s.customer)
  const logout = useCustomerAuthStore(s => s.logout)
  const updateProfile = useUpdateCustomerProfile()
  const changePassword = useChangeCustomerPassword()

  const [name, setName] = useState(customer?.name || '')
  const [email, setEmail] = useState(customer?.email || '')
  const [address, setAddress] = useState(customer?.address || '')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')

  function handleLogout() {
    logout()
    navigate('/customer/login', { replace: true })
  }

  return (
    <div className="p-4 flex flex-col gap-6 max-w-lg mx-auto">
      <section>
        <h2 className="text-xs font-bold uppercase text-[var(--text-4)] mb-2">Profile</h2>
        <div className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
          <Input label="Phone" value={customer?.phone || ''} disabled />
          <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Textarea label="Address" value={address} onChange={e => setAddress(e.target.value)} rows={2} />
          <Button
            variant="primary" size="sm" loading={updateProfile.isPending}
            onClick={() => updateProfile.mutate({ name, email: email || undefined, address: address || undefined })}
          >Save Changes</Button>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase text-[var(--text-4)] mb-2">Change Password</h2>
        <div className="flex flex-col gap-3">
          <Input label="Current Password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
          <Input label="New Password" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <Button
            variant="secondary" size="sm" loading={changePassword.isPending}
            onClick={() => { changePassword.mutate({ current_password: currentPw, new_password: newPw }); setCurrentPw(''); setNewPw('') }}
          >Update Password</Button>
        </div>
      </section>

      <button onClick={handleLogout} className="flex items-center justify-center gap-2 text-sm font-semibold text-red-600 py-3">
        <LogOut size={15} /> Log Out
      </button>
    </div>
  )
}
