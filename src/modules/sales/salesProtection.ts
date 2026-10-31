/**
 * salesProtection.ts — the "update block / delete block / cancel block" rules, as the Sales screen sees them.
 *
 * The REAL protection lives in the database (migration 053_sales_protection: triggers on sales / sale_items, with an
 * audit log). This module mirrors those rules so the screen can tell you up front — a Locked badge, no Cancel /
 * Update Party button, a plain explanation — instead of letting you press a button and get an error.
 * Keep the numbers in step with the settings table:  sales_protection_settings.lock_after_hours / locked_through.
 *
 *   A posted invoice can never be deleted (the screen has no delete; the database refuses one).
 *   Active invoice, first `lockAfterHours` after posting  → can be cancelled; party can be changed.
 *   Older than that                                       → LOCKED: no cancel, no party change. Issue a Sales Return.
 *   Dated in a closed accounting period (≤ closedThrough) → LOCKED for good.
 *   Cancelled or returned                                 → frozen.
 */
import type { Sale } from '@/types'

export interface SalesProtectionPolicy {
  /** hours after posting during which an invoice may still be cancelled / corrected. 0 = no age lock. */
  lockAfterHours: number
  /** invoices dated on or before this day ("YYYY-MM-DD", AD) are in a closed period; null = none closed. */
  closedThrough: string | null
}
export const DEFAULT_SALES_POLICY: SalesProtectionPolicy = { lockAfterHours: 24, closedThrough: null }

export type SaleLockCode = 'cancelled' | 'returned' | 'closed' | 'aged'
export interface SaleLock {
  canCancel: boolean
  canEditParty: boolean
  /** true when the invoice is no longer open to changes (any reason) */
  locked: boolean
  code: SaleLockCode | null
  /** short badge text, e.g. "Locked" — null while the invoice is open */
  label: string | null
  /** one or more plain sentences for a tooltip / explanation */
  reasons: string[]
  /** whole hours left in the open window (active invoices with a known posting time), else null */
  hoursLeft: number | null
}

const HOUR = 3_600_000
const day = (s: string | undefined | null) => String(s ?? '').slice(0, 10)

export function getSaleLock(
  sale: Pick<Sale, 'status' | 'created_at' | 'date_ad'>,
  policy: SalesProtectionPolicy = DEFAULT_SALES_POLICY,
  now: number = Date.now(),
): SaleLock {
  const done = (code: SaleLockCode, label: string, reason: string): SaleLock =>
    ({ canCancel: false, canEditParty: false, locked: true, code, label, reasons: [reason], hoursLeft: null })

  if (sale.status === 'cancelled') return done('cancelled', 'Cancelled', 'This invoice is cancelled and can no longer be changed.')
  if (sale.status === 'returned')  return done('returned', 'Returned', 'This invoice has been returned and can no longer be changed.')

  const d = day(sale.date_ad)
  if (policy.closedThrough && d && d <= day(policy.closedThrough))
    return done('closed', 'Period closed', `Its accounting period is closed (up to ${day(policy.closedThrough)}). It cannot be changed or cancelled.`)

  const posted = Date.parse(String(sale.created_at ?? ''))
  if (policy.lockAfterHours > 0 && Number.isFinite(posted)) {
    const age = now - posted
    if (age > policy.lockAfterHours * HOUR)
      return done('aged', 'Locked', `It was posted more than ${policy.lockAfterHours} hours ago, so it is locked. Use a Sales Return to reverse it.`)
    const left = Math.max(0, Math.ceil((policy.lockAfterHours * HOUR - age) / HOUR))
    return { canCancel: true, canEditParty: true, locked: false, code: null, label: null, hoursLeft: left,
      reasons: [`Can be changed or cancelled for about ${left} more hour${left === 1 ? '' : 's'}, then it locks.`] }
  }
  return { canCancel: true, canEditParty: true, locked: false, code: null, label: null, hoursLeft: null, reasons: [] }
}

/** Did the server refuse because the invoice is protected? (database error SQLSTATE SL001 / "SALES_LOCKED: …") */
export function isSalesLockedError(e: unknown): boolean {
  const x = e as { code?: unknown; response?: { data?: { code?: unknown; message?: unknown } }; message?: unknown } | null
  return x?.code === 'SL001' || x?.response?.data?.code === 'SL001' ||
    /SALES_LOCKED/.test(String(x?.message ?? '')) || /SALES_LOCKED/.test(String(x?.response?.data?.message ?? ''))
}

/** A message fit to show a person: protection errors lose the technical prefix; everything else is passed through. */
export function friendlyProtectionError(e: unknown): string {
  const x = e as { message?: unknown; response?: { data?: { message?: unknown } } } | null
  const raw = String(x?.response?.data?.message ?? x?.message ?? e ?? 'Something went wrong').trim()
  if (!isSalesLockedError(e)) return raw
  const msg = raw.replace(/^.*?SALES_LOCKED:\s*/s, '').trim()
  return `${msg.charAt(0).toUpperCase()}${msg.slice(1)} Posted invoices are protected — cancel within ${DEFAULT_SALES_POLICY.lockAfterHours} hours or issue a Sales Return.`
}
