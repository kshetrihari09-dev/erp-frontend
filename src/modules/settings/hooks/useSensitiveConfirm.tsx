/**
 * useSensitiveConfirm.tsx
 *
 * Generalizes the existing "voucher edit requires a password re-check"
 * pattern to ANY action, driven by the per-company toggles in
 * Settings → Users & Permissions → sensitive actions
 * (companies.settings.sensitiveActions, enforced server-side by
 * requireSensitiveConfirm() in the backend).
 *
 * Step-up upgrade: verification now goes through SecurityPinModal (6-digit
 * PIN, falling back to password) instead of a bare password field, and a
 * successful verification is cached as a short-lived step-up token
 * (services/stepUpToken.ts). The axios interceptor (services/http.ts)
 * attaches that token to every request automatically while it's still
 * valid (~10 minutes), so most calls through runWithConfirm succeed on
 * the FIRST try without ever showing a dialog — it only appears when
 * there's no valid cached token yet.
 *
 * Usage (unchanged from before):
 *   const { runWithConfirm, dialog } = useSensitiveConfirm()
 *   ...
 *   await runWithConfirm(confirmPassword => settingsAPI.updateCompany({ ...data, confirmPassword }))
 *   return <>{form}{dialog}</>
 *
 * The `confirmPassword` param callers can still fold into their request
 * body is kept for backward compatibility (the backend accepts it as a
 * fallback), but the primary path now is the step-up token header, which
 * needs no per-call-site wiring at all.
 */
import { useState, useCallback } from 'react'
import SecurityPinModal from '@/components/auth/SecurityPinModal'

export function useSensitiveConfirm() {
  const [open, setOpen] = useState(false)
  const [pendingFn, setPendingFn] = useState<null | ((pwd?: string) => Promise<any>)>(null)
  const [resolver, setResolver] = useState<null | { resolve: (v: any) => void; reject: (e: any) => void }>(null)

  const close = useCallback(() => {
    setOpen(false); setPendingFn(null); setResolver(null)
  }, [])

  const runWithConfirm = useCallback(async <T,>(fn: (confirmPassword?: string) => Promise<T>): Promise<T> => {
    try {
      // The axios interceptor attaches a cached step-up token here if one
      // is still valid — most calls succeed right here, no dialog shown.
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

  const handleVerified = useCallback(async () => {
    if (!pendingFn || !resolver) return
    try {
      // Step-up token is now cached (SecurityPinModal did that) — the
      // interceptor will attach it to this retry automatically.
      const result = await pendingFn()
      resolver.resolve(result)
      close()
    } catch (e: any) {
      // The action itself failed even after verifying (e.g. a genuine
      // business-rule error unrelated to step-up) — surface it to the
      // original caller rather than silently swallowing it.
      resolver.reject(e)
      close()
    }
  }, [pendingFn, resolver, close])

  const handleCancel = useCallback(() => {
    resolver?.reject({ message: 'Verification cancelled', cancelled: true })
    close()
  }, [resolver, close])

  const dialog = (
    <SecurityPinModal
      open={open}
      onCancel={handleCancel}
      onVerified={handleVerified}
    />
  )

  return { runWithConfirm, dialog }
}
