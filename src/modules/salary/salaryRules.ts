/**
 * salaryRules.ts — pure helpers for the Salary module (no React, no I/O) so the rules are unit-testable.
 * The SERVER is the authority for every one of these rules (permissions, status transitions, accounting). This file only
 * decides what to SHOW, so a user is never offered a button the API would refuse.
 */
export type SlipStatus = 'DRAFT' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

export const STATUS_LABEL: Record<SlipStatus, string> = {
  DRAFT: 'Draft', APPROVED: 'Approved · unpaid', PARTIALLY_PAID: 'Partly paid', PAID: 'Paid', CANCELLED: 'Cancelled',
}
export const STATUS_BADGE: Record<SlipStatus, string> = {
  DRAFT: 'badge-amber', APPROVED: 'badge-blue', PARTIALLY_PAID: 'badge-purple', PAID: 'badge-green', CANCELLED: 'badge-red',
}

type Can = (permission: string) => boolean

/** Reversal needs the salary permission AND the company's existing per-user "reverse entries" switch (server enforces both). */
export const canReverseSalary = (can: Can) => can('salary.reverse') && can('accounting.reverse')

export interface SlipActions {
  edit: boolean; cancel: boolean; approve: boolean; pay: boolean; reverseApproval: boolean; reversePayment: boolean
}

/** What the slip dialog may offer for a slip in `status`, given the signed-in user's permissions. */
export function slipActions(status: SlipStatus, hasActivePayments: boolean, can: Can): SlipActions {
  const draft = status === 'DRAFT'
  const payable = status === 'APPROVED' || status === 'PARTIALLY_PAID'
  const posted = payable || status === 'PAID'
  return {
    edit: draft && can('salary.manage'),
    cancel: draft && can('salary.manage'),
    approve: draft && can('salary.approve'),
    pay: payable && can('salary.pay'),
    reverseApproval: posted && !hasActivePayments && canReverseSalary(can),     // payments must be reversed first
    reversePayment: hasActivePayments && canReverseSalary(can),
  }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface PreviewLine { kind: 'earning' | 'deduction'; posting_role: string; amount: number }
/** Same identities the server and database enforce — used ONLY to preview while editing; the saved figures always come from the server. */
export function previewTotals(basic: number, lines: PreviewLine[]) {
  let earn = 0, adv = 0, other = 0
  for (const l of lines) {
    const a = r2(Number(l.amount) || 0)
    if (l.kind === 'earning') earn += a
    else if (l.posting_role === 'staff_advance') adv += a
    else other += a
  }
  const gross = r2(r2(basic) + r2(earn)), deductions = r2(adv + other)
  return { earnings: r2(earn), gross, advance: r2(adv), other: r2(other), deductions, net: r2(gross - deductions) }
}

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
export const monthLabel = (m: string) => {
  if (!isMonth(m)) return m
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)
