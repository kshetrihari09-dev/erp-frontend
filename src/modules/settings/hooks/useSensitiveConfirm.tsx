/**
 * useSensitiveConfirm.tsx
 *
 * Generalizes the existing "voucher edit requires a password re-check"
 * pattern (see components/forms/VoucherEditPasswordDialog.tsx +
 * POST /auth/verify-password) to ANY action, driven by the per-company
 * toggles in Settings → Users & Permissions → sensitive actions
 * (companies.settings.sensitiveActions, enforced server-side by
 * requireSensitiveConfirm() in the backend).
 *
 * Usage:
 *   const { runWithConfirm, dialog } = useSensitiveConfirm()
 *   ...
 *   await runWithConfirm(confirmPassword => settingsAPI.updateCompany({ ...data, confirmPassword }))
 *   return <>{form}{dialog}</>
 *
 * If the server responds with `requiresPasswordConfirm` (because the admin
 * turned that toggle on), a password modal opens automatically and the
 * same call is retried once the password is entered — no special-casing
 * needed in the caller beyond wrapping the call.
 */
import { useState, useCallback } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { ShieldAlert } from 'lucide-react'

export function useSensitiveConfirm() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [pendingFn, setPendingFn] = useState<null | ((pwd: string) => Promise<any>)>(null)
  const [resolver, setResolver] = useState<null | { resolve: (v: any) => void; reject: (e: any) => void }>(null)

  const close = useCallback(() => {
    setOpen(false); setPassword(''); setErr(''); setPendingFn(null); setResolver(null)
  }, [])

  const runWithConfirm = useCallback(async <T,>(fn: (confirmPassword?: string) => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (e: any) {
      if (e?.response?.data?.requiresPasswordConfirm) {
        return new Promise<T>((resolve, reject) => {
          setPendingFn(() => fn)
          setResolver({ resolve, reject })
          setOpen(true)
        })
      }
      throw e
    }
  }, [])

  const submit = useCallback(async () => {
    if (!pendingFn || !resolver) return
    setVerifying(true); setErr('')
    try {
      const result = await pendingFn(password)
      resolver.resolve(result)
      close()
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Incorrect password')
    } finally {
      setVerifying(false)
    }
  }, [pendingFn, resolver, password, close])

  const dialog = (
    <Modal open={open} onClose={close} title="Confirm your password" size="sm">
      <div className="flex items-start gap-2.5 mb-3">
        <ShieldAlert size={18} className="text-[var(--warning,#d97706)] shrink-0 mt-0.5" />
        <p className="text-[13px] text-[var(--text-3)]">
          This action requires password confirmation (enabled in Users &amp; Permissions settings).
        </p>
      </div>
      <Input
        type="password"
        autoFocus
        placeholder="Your account password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        error={err || undefined}
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={verifying} onClick={submit}>Confirm</Button>
      </div>
    </Modal>
  )

  return { runWithConfirm, dialog }
}
