/**
 * Salary module — front-end rules. Permissions are taken from the SERVER's contract (backend rbac/permissions.js) exactly like
 * router/rbac.spec.tsx, so a drift between the two halves fails here.
 */
import { describe, test, expect } from 'vitest'
// @ts-ignore — CommonJS module from the backend package: the single authoritative definition
import * as serverContract from '../../../../erp-unified-backend/src/rbac/permissions.js'
import { canOpenPath, filterNavByPermission, ROUTE_PERMISSIONS } from '@/constants/permissions'
import { PATHS } from '@/constants'
import { slipActions, previewTotals, canReverseSalary, isMonth, monthLabel, currentMonth } from './salaryRules'

const contract: any = (serverContract as any).default ?? serverContract
const permsOf = (role: string, flags: Record<string, boolean> = {}) => contract.effectivePermissions({ role, ...flags }) as string[]
const canOf = (perms: string[]) => (p: string) => perms.includes(p)

describe('who can open the Salary page', () => {
  test('route is registered and needs salary.view', () => { expect(ROUTE_PERMISSIONS[PATHS.SALARY]).toEqual(['salary.view']) })
  test.each(['owner', 'admin', 'accountant', 'auditor'])('%s can open /salary', (r) => { expect(canOpenPath(permsOf(r), '/salary')).toBe(true) })
  test.each(['manager', 'cashier', 'viewer'])('%s cannot open /salary and does not see it in the sidebar', (r) => {
    expect(canOpenPath(permsOf(r), '/salary')).toBe(false)
    const nav = filterNavByPermission([{ section: 'ACCOUNTING' }, { to: '/accounting' }, { to: '/salary' }] as any, permsOf(r))
    expect(nav.some((n: any) => n.to === '/salary')).toBe(false)
  })
  test('a role with NO permission list (legacy session) is denied — fails closed', () => { expect(canOpenPath(undefined, '/salary')).toBe(false) })
})

describe('slipActions — what the slip dialog offers', () => {
  const owner = canOf(permsOf('owner', { can_reverse_entries: true }))           // reversal is flag-backed: even an owner needs the per-user switch
  const ownerNoSwitch = canOf(permsOf('owner'))
  const acct = canOf(permsOf('accountant'))                                   // salary.* except the reverse switch
  const acctRev = canOf(permsOf('accountant', { can_reverse_entries: true }))
  const audit = canOf(permsOf('auditor'))

  test('DRAFT: edit, cancel and approve — nothing else', () => {
    expect(slipActions('DRAFT', false, owner)).toEqual({ edit: true, cancel: true, approve: true, pay: false, reverseApproval: false, reversePayment: false })
  })
  test('APPROVED: pay, and reverse the approval — but NOT edit', () => {
    const a = slipActions('APPROVED', false, owner)
    expect(a).toMatchObject({ edit: false, cancel: false, approve: false, pay: true, reverseApproval: true })
  })
  test('PARTIALLY_PAID with an active payment: pay more, reverse the payment, but the approval cannot be reversed yet', () => {
    expect(slipActions('PARTIALLY_PAID', true, owner)).toMatchObject({ pay: true, reversePayment: true, reverseApproval: false })
  })
  test('PAID: no edit / approve / pay; reversal only', () => {
    expect(slipActions('PAID', true, owner)).toMatchObject({ edit: false, approve: false, pay: false, reversePayment: true })
    expect(slipActions('PAID', false, owner).reverseApproval).toBe(true)
  })
  test('CANCELLED offers nothing', () => { expect(Object.values(slipActions('CANCELLED', false, owner)).every((v) => v === false)).toBe(true) })
  test('reversal needs the per-user reverse-entries switch — even for an owner', () => {
    expect(slipActions('APPROVED', false, ownerNoSwitch)).toMatchObject({ pay: true, reverseApproval: false })
    expect(slipActions('PARTIALLY_PAID', true, ownerNoSwitch).reversePayment).toBe(false)
  })
  test('auditor: read-only', () => {
    for (const s of ['DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID'] as const) expect(Object.values(slipActions(s, s !== 'DRAFT' && s !== 'APPROVED', audit)).every((v) => v === false)).toBe(true)
  })
  test('accountant can approve and pay but needs the reverse switch to reverse', () => {
    expect(slipActions('DRAFT', false, acct)).toMatchObject({ edit: true, approve: true })
    expect(slipActions('APPROVED', false, acct)).toMatchObject({ pay: true, reverseApproval: false })
    expect(canReverseSalary(acct)).toBe(false)
    expect(slipActions('APPROVED', false, acctRev).reverseApproval).toBe(true)
  })
})

describe('previewTotals mirrors the server identities', () => {
  test('gross, deductions and net', () => {
    expect(previewTotals(30000, [
      { kind: 'earning', posting_role: 'salary_expense', amount: 5000 }, { kind: 'deduction', posting_role: 'staff_advance', amount: 2000 }, { kind: 'deduction', posting_role: 'custom', amount: 300.5 },
    ])).toEqual({ earnings: 5000, gross: 35000, advance: 2000, other: 300.5, deductions: 2300.5, net: 32699.5 })
  })
  test('no float drift', () => { expect(previewTotals(0.1, [{ kind: 'earning', posting_role: 'x', amount: 0.2 }]).gross).toBe(0.3) })
})

describe('month helpers', () => {
  test('validation and labels', () => {
    expect(isMonth('2026-08')).toBe(true); expect(isMonth('2026-13')).toBe(false); expect(isMonth('Aug')).toBe(false)
    expect(monthLabel('2026-08')).toBe('August 2026'); expect(isMonth(currentMonth())).toBe(true)
  })
})
