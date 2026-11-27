/**
 * accountBalance.ts — pure helpers for the Chart of Accounts balance column and the Trial Balance
 * default range. No fiscal-year arithmetic lives here: the range always comes from the fiscal year
 * the app already holds (useSelectedFiscalYear → Settings → Fiscal Years).
 */
import { fmt } from '@/utils'

export interface BalanceFields {
  balance?: number | string | null
  balance_side?: 'Dr' | 'Cr' | null
  net_balance?: number | string | null
}

/**
 * "40,000 Dr" / "5,000 Cr" / "0". Backend sends `balance` as the magnitude and `balance_side`
 * as Dr / Cr; if only a signed `net_balance` is present the side is derived from its sign.
 * Used by BOTH the desktop table and the mobile cards so they can never disagree.
 */
export function formatAccountBalance(a: BalanceFields): { amount: string; side: 'Dr' | 'Cr' | null; text: string } {
  const net = a.net_balance != null ? Number(a.net_balance) : null
  const magnitude = a.balance != null ? Math.abs(Number(a.balance)) : net != null ? Math.abs(net) : 0
  const safe = Number.isFinite(magnitude) ? magnitude : 0
  let side: 'Dr' | 'Cr' | null = safe === 0 ? null : (a.balance_side ?? (net != null ? (net > 0 ? 'Dr' : net < 0 ? 'Cr' : null) : null))
  if (safe === 0) side = null
  const amount = fmt(safe)
  return { amount, side, text: side ? `${amount} ${side}` : amount }
}

/** The fiscal year's own start / end (AD) as the Trial Balance's default range; null when no year is configured. */
export function trialBalanceRangeFor(fy: { start_date_ad?: string | null; end_date_ad?: string | null } | null | undefined):
  { from: string; to: string } | null {
  const from = fy?.start_date_ad ? String(fy.start_date_ad).slice(0, 10) : ''
  const to   = fy?.end_date_ad   ? String(fy.end_date_ad).slice(0, 10)   : ''
  return from && to ? { from, to } : null
}

/** Periods that belong to the given fiscal year (all periods when no year is known). */
export function periodsOfFiscalYear<P extends { fiscal_year_id: string | null }>(periods: P[] | undefined, fyId: string | null | undefined): P[] {
  const list = periods ?? []
  return fyId ? list.filter(p => p.fiscal_year_id === fyId) : list
}

/** Coerce a possibly-string NUMERIC to a finite number (older servers sent "40000.00"). */
export const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
