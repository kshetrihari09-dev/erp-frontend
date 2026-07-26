import { useState } from 'react'
import { Lock, AlertCircle } from 'lucide-react'
import { Modal, Button } from '@/components/ui'
import { authAPI } from '@/services/api'

interface VoucherEditPasswordDialogProps {
  open: boolean
  /** e.g. the voucher number, shown in the confirmation copy */
  voucherLabel?: string
  onCancel: () => void
  /** Called only after the password has been verified server-side. Reason is mandatory. */
  onUnlock: (reason: string) => void
}

/**
 * "This voucher has already been posted. Enter your password to continue."
 * Verifies against the CURRENTLY LOGGED-IN user's own password via the
 * existing POST /auth/verify-password endpoint (unmodified) — no new
 * password-checking logic is introduced here. There is no path that skips
 * this check: the parent only unlocks the edit form from the onUnlock
 * callback, which only fires after a 200 from that endpoint.
 */
export default function VoucherEditPasswordDialog({ open, voucherLabel, onCancel, onUnlock }: VoucherEditPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [reason,   setReason]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errMsg,   setErrMsg]   = useState('')

  function reset() {
    setPassword(''); setReason(''); setErrMsg(''); setSubmitting(false)
  }
  function handleCancel() {
    reset()
    onCancel()
  }

  async function handleUnlock() {
    setErrMsg('')
    if (!password) { setErrMsg('Enter your password'); return }
    if (!reason.trim()) { setErrMsg('A reason for this edit is required'); return }
    setSubmitting(true)
    try {
      await authAPI.verifyPassword(password)
      const confirmedReason = reason.trim()
      reset()
      onUnlock(confirmedReason)
    } catch (e: any) {
      setErrMsg(e?.message || 'Incorrect password')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleCancel} title="Edit Voucher" size="sm">
      <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
        <Lock size={16} className="mt-0.5 text-[var(--text-4)] shrink-0" />
        <p className="text-[13px] text-[var(--text-3)] leading-snug">
          {voucherLabel ? <>Voucher <span className="font-semibold text-[var(--text)]">{voucherLabel}</span> has</> : 'This voucher has'} already been posted.
          Enter your password to continue.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Password</label>
          <input
            type="password" autoFocus className="erp-input" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Reason for edit</label>
          <input
            className="erp-input" placeholder="Why is this posted voucher being corrected?"
            value={reason} onChange={e => setReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          />
        </div>
        {errMsg && (
          <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle size={13}/> {errMsg}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[var(--border)]">
        <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
        <Button variant="primary" loading={submitting} onClick={handleUnlock}>Unlock Voucher</Button>
      </div>
    </Modal>
  )
}
