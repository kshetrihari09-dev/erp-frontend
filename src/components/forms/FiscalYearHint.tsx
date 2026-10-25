import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsAPI } from '@/services/api'
import { QK } from '@/constants'
import { fmtDate } from '@/utils'
import type { FiscalYear } from '@/types'

/**
 * Fiscal-year awareness for transaction forms.
 *
 * The SERVER is authoritative (every voucher / invoice is validated against the fiscal year in the database
 * and API). This only gives the user an early, clear answer next to the date field and lets the form block
 * Post/Submit when the entered date can't be accepted — it is never the security control.
 *
 * The check runs on the canonical AD date (YYYY-MM-DD) that every form already holds, so it is correct
 * whichever calendar (AD/BS) the user types in. Strings are compared, never JS Dates (no timezone drift).
 *
 * A company with NO fiscal years configured is not restricted (matches the server): status 'not-configured'.
 */
export type FiscalYearCheckStatus = 'loading' | 'not-configured' | 'no-date' | 'ok' | 'outside' | 'closed'

export interface FiscalYearCheck {
  status:  FiscalYearCheckStatus
  /** The fiscal year the date belongs to (also set when it is closed). */
  fy:      FiscalYear | null
  /** Text to show the user when blocked; same wording the API uses. */
  message: string | null
  /** True when the form should not allow posting with this date. */
  blocked: boolean
}

export const FY_MESSAGES = {
  outside: 'Transaction date is outside every configured fiscal year. Create the fiscal year in Settings → Fiscal Years.',
  closed:  'Cannot post transactions to a closed fiscal year.',
} as const

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function checkFiscalYear(
  years: FiscalYear[] | null | undefined,
  dateAD: string | null | undefined,
  loading = false,
): FiscalYearCheck {
  const none = (status: FiscalYearCheckStatus): FiscalYearCheck => ({ status, fy: null, message: null, blocked: false })
  const list = (years ?? []).filter(y => y.start_date_ad && y.end_date_ad)
  if (!list.length) return none(loading ? 'loading' : 'not-configured')
  const d = String(dateAD ?? '').slice(0, 10)
  if (!ISO.test(d)) return none('no-date')           // empty/invalid dates are the form's own validation
  const fy = list.find(y => y.start_date_ad <= d && d <= y.end_date_ad) ?? null
  if (!fy) return { status: 'outside', fy: null, message: FY_MESSAGES.outside, blocked: true }
  if (fy.is_locked) return { status: 'closed', fy, message: FY_MESSAGES.closed, blocked: true }
  return { status: 'ok', fy, message: null, blocked: false }
}

export function useFiscalYearCheck(dateAD: string | null | undefined): FiscalYearCheck {
  // Same query key as useFiscalYears(): Settings → Fiscal Years / Accounting → Periods invalidate it, so a year closed
  // or created there is reflected here immediately.
  const { data, isLoading } = useQuery({ queryKey: [QK.FISCAL_YEARS], queryFn: () => settingsAPI.fiscalYears().then((r: any) => r.data.data as FiscalYear[]) })
  const years: FiscalYear[] = useMemo(() => (Array.isArray(data) ? data : []), [data])
  return useMemo(() => checkFiscalYear(years, dateAD, isLoading), [years, dateAD, isLoading])
}

/** Shows the fiscal year the entered date falls in, or why it can't be used. Renders nothing when there is nothing to say. */
export default function FiscalYearHint({ check }: { check: FiscalYearCheck }) {
  if (check.status === 'ok' && check.fy) {
    return (
      <div className="fy-hint fy-hint-ok" data-testid="fy-hint">
        FY {check.fy.name.replace(/^FY\s*/i, '')} · {fmtDate(check.fy.start_date_ad)} – {fmtDate(check.fy.end_date_ad)}
      </div>
    )
  }
  if (check.blocked) {
    return (
      <div className="fy-hint fy-hint-bad" role="alert" data-testid="fy-hint">
        {check.status === 'closed' && check.fy ? `FY ${check.fy.name.replace(/^FY\s*/i, '')} is closed. ` : ''}{check.message}
      </div>
    )
  }
  return null
}
