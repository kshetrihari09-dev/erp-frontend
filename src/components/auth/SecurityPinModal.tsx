/**
 * SecurityPinModal.tsx
 *
 * The step-up verification modal shown before a sensitive action —
 * matches the spec's mockup: a 6-digit PIN field, Verify/Cancel. Handles
 * three states:
 *
 *  1. User already has a PIN → enter it (numeric keypad, masked,
 *     auto-focus, clears on a wrong attempt). A "Use password instead"
 *     link falls back to the account password for this one verification.
 *  2. User has no PIN yet → a one-time "create your Security PIN" flow:
 *     confirm the current account password once, then choose a 6-digit
 *     PIN. Matches requirement: don't force a migration, prompt lazily
 *     the first time a protected action needs it.
 *  3. Either path can fail — shows the exact backend message (including
 *     lockout: "Too many failed attempts. Try again in N minutes.").
 *
 * On success, the resolved value is the API response's `data` (which
 * includes `stepUpToken`/`expiresIn`) — callers are expected to cache it
 * via services/stepUpToken.ts and/or attach it to their next request.
 * The PIN/password itself is never stored anywhere, only sent once over
 * the wire to the verify endpoint (see requirement: don't put it in
 * localStorage or a URL).
 */
import { useEffect, useRef, useState } from 'react'
import { Modal, Button } from '@/components/ui'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { authAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import { setStepUpToken } from '@/services/stepUpToken'

interface Props {
  open: boolean
  /** Optional context line, e.g. "Editing a posted voucher". */
  actionLabel?: string
  onCancel: () => void
  onVerified: (stepUpToken: string) => void
}

type Stage = 'pin' | 'password-fallback' | 'setup-password' | 'setup-pin'

export default function SecurityPinModal({ open, actionLabel, onCancel, onVerified }: Props) {
  const user       = useAuthStore(s => s.user)
  const updateUser = useAuthStore(s => s.updateUser)
  const hasPin     = !!user?.hasPin

  const [stage, setStage]   = useState<Stage>(hasPin ? 'pin' : 'setup-password')
  const [pin, setPin]       = useState('')
  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [err, setErr]       = useState('')
  const [busy, setBusy]     = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStage(hasPin ? 'pin' : 'setup-password')
    setPin(''); setPassword(''); setNewPin(''); setErr(''); setBusy(false)
    // Auto-focus, per spec — small delay so the modal has finished mounting.
    setTimeout(() => pinRef.current?.focus(), 50)
  }, [open, hasPin])

  function reset() { setPin(''); setErr('') }

  async function verifyWith(credential: { pin?: string; password?: string }) {
    setBusy(true); setErr('')
    try {
      const res = await authAPI.verifyPassword(credential)
      const { stepUpToken, expiresIn } = res.data.data!
      setStepUpToken(stepUpToken, expiresIn)
      onVerified(stepUpToken)
    } catch (e: any) {
      setErr(e?.message || 'Verification failed')
      reset() // clear PIN after a failed attempt, per spec
      pinRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function submitCreatePin() {
    if (!/^\d{6}$/.test(newPin)) { setErr('Choose a 6-digit PIN'); return }
    setBusy(true); setErr('')
    try {
      const res = await authAPI.setSecurityPin({ pin: newPin, current_password: password })
      const { stepUpToken, expiresIn } = res.data.data!
      setStepUpToken(stepUpToken, expiresIn)
      updateUser({ hasPin: true })
      onVerified(stepUpToken)
    } catch (e: any) {
      setErr(e?.message || 'Could not save PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title="Security Verification" size="sm">
      <div className="flex flex-col items-center text-center gap-1 mb-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center mb-1"
          style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
          <ShieldCheck size={20} className="text-[var(--brand)]" />
        </div>
        <p className="text-sm text-[var(--text-2)]">
          {actionLabel ? <>This action <span className="font-semibold">({actionLabel})</span> requires</> : 'This action requires'} additional verification.
        </p>
      </div>

      {stage === 'pin' && (
        <div className="flex flex-col items-center gap-3">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">Security PIN</label>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter' && pin.length === 6) verifyWith({ pin }) }}
            className="erp-input text-center"
            style={{ width: 180, fontSize: 26, letterSpacing: '0.5em', padding: '10px 0 10px 0.5em' }}
            placeholder="••••••"
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <Button variant="primary" className="w-full" loading={busy} disabled={pin.length !== 6}
            onClick={() => verifyWith({ pin })}>
            Verify
          </Button>
          <button className="text-xs text-[var(--text-3)] underline underline-offset-2" onClick={() => { setStage('password-fallback'); setErr('') }}>
            Use password instead
          </button>
        </div>
      )}

      {stage === 'password-fallback' && (
        <div className="flex flex-col gap-3">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">Account Password</label>
          <input
            type="password" autoFocus autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && password) verifyWith({ password }) }}
            className="erp-input" placeholder="••••••••"
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <Button variant="primary" loading={busy} disabled={!password} onClick={() => verifyWith({ password })}>
            Verify
          </Button>
          {hasPin && (
            <button className="text-xs text-[var(--text-3)] underline underline-offset-2" onClick={() => { setStage('pin'); setErr(''); setTimeout(() => pinRef.current?.focus(), 50) }}>
              Use Security PIN instead
            </button>
          )}
        </div>
      )}

      {stage === 'setup-password' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--surface-2)] text-xs text-[var(--text-3)]">
            <KeyRound size={14} className="shrink-0 mt-0.5" />
            You don't have a Security PIN yet. Confirm your account password once to create one.
          </div>
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">Account Password</label>
          <input
            type="password" autoFocus autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && password) setStage('setup-pin') }}
            className="erp-input" placeholder="••••••••"
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <Button variant="primary" disabled={!password} onClick={() => { setErr(''); setStage('setup-pin') }}>
            Continue
          </Button>
        </div>
      )}

      {stage === 'setup-pin' && (
        <div className="flex flex-col items-center gap-3">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">Choose a 6-digit PIN</label>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter' && newPin.length === 6) submitCreatePin() }}
            className="erp-input text-center"
            style={{ width: 180, fontSize: 26, letterSpacing: '0.5em', padding: '10px 0 10px 0.5em' }}
            placeholder="••••••"
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <Button variant="primary" className="w-full" loading={busy} disabled={newPin.length !== 6} onClick={submitCreatePin}>
            Save PIN &amp; Continue
          </Button>
          <button className="text-xs text-[var(--text-3)] underline underline-offset-2" onClick={() => { setStage('password-fallback'); setErr('') }}>
            Skip — verify with password this time
          </button>
        </div>
      )}

      <button onClick={onCancel} className="w-full text-center text-xs text-[var(--text-4)] mt-4">
        Cancel
      </button>
    </Modal>
  )
}
