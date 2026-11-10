/**
 * Front-end RBAC: route protection, navigation and permission checks for every role.
 *
 * The role → permission table is NOT re-typed here. The tests import the SERVER's contract (backend rbac/permissions.js) and
 * assert that the real router guards, sidebar filter and Settings sections behave correctly for what the server would send
 * each role — so a drift between the two halves fails here.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
// @ts-ignore — CommonJS module from the backend package: the single authoritative definition
import * as serverContract from '../../../erp-unified-backend/src/rbac/permissions.js'

vi.mock('@/services/api', () => ({ authAPI: { me: vi.fn() } }))
vi.mock('@/offline/syncEngine', () => ({ isNetworkError: () => false }))

import useAuthStore from '@/store/authStore'
import { RequireRoute, RequirePermission, RequireRole, HomeRedirect } from '@/router/guards'
import { ROUTE_PERMISSIONS, canOpenPath, landingPathFor, filterNavByPermission, permissionsForPath } from '@/constants/permissions'
import { SETTINGS_SECTIONS, sectionAllowed } from '@/modules/settings/SettingsNav'
import { PATHS } from '@/constants'

const contract: any = (serverContract as any).default ?? serverContract
const ROLES: string[] = contract.USER_ROLES
const permsOf = (role: string) => contract.effectivePermissions({ role })                 // what /auth/me would return
// signIn(role) = the server's permissions for that role; signIn(role, list) / signIn(role, undefined) = exactly that (undefined = legacy session)
const signIn = (role: string, ...rest: [(string[] | undefined)?]) =>
  useAuthStore.setState({ isAuthenticated: true, token: 't', company: { id: 'c' } as any, user: { id: 'u', role, permissions: rest.length ? rest[0] : permsOf(role) } as any })

beforeEach(() => { useAuthStore.setState({ user: null, token: null, company: null, isAuthenticated: false }) })

// Which route each role must be able to open — written out by hand so the table is reviewable.
const EVERYTHING = Object.values(PATHS).filter((p) => !['/login', '/signup'].includes(p))
const EXPECT_OPEN: Record<string, string[]> = {
  owner: EVERYTHING,
  admin: EVERYTHING,
  manager: EVERYTHING,
  accountant: ['/dashboard', '/reminders', '/sales', '/sales-returns', '/customers', '/purchase', '/purchase-returns', '/suppliers', '/products', '/barcode-print',
    '/qrcode-print', '/manufacturers', '/stock', '/stock-register', '/stock-summary', '/purchase-suggestions', '/credit-risk', '/accounting', '/ledger',
    '/reports', '/company-vs-customer', '/customer-vs-company', '/settings'],
  cashier: ['/dashboard', '/reminders', '/sales', '/retail-sale', '/sales-returns', '/purchase-returns', '/customers', '/products', '/barcode-print', '/qrcode-print',
    '/manufacturers', '/stock', '/stock-register', '/stock-summary', '/credit-risk', '/suppliers'],   // parties.view covers customers AND suppliers (as on the server)
  auditor: ['/dashboard', '/reminders', '/sales', '/sales-returns', '/customers', '/purchase', '/purchase-returns', '/suppliers', '/products', '/barcode-print', '/qrcode-print',
    '/manufacturers', '/stock', '/stock-register', '/stock-summary', '/purchase-suggestions', '/credit-risk', '/accounting', '/ledger', '/reports',
    '/company-vs-customer', '/customer-vs-company', '/settings'],
  viewer: ['/dashboard', '/reminders', '/sales', '/sales-returns', '/customers', '/purchase', '/purchase-returns', '/suppliers', '/products', '/barcode-print', '/qrcode-print',
    '/manufacturers', '/stock', '/stock-register', '/stock-summary', '/purchase-suggestions', '/credit-risk', '/accounting', '/ledger', '/reports',
    '/company-vs-customer', '/customer-vs-company'],
}

describe('route table', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../app/Router.tsx'), 'utf8')

  test('every module route in Router.tsx is wrapped in RequireRoute and listed in ROUTE_PERMISSIONS (new pages cannot ship unprotected)', () => {
    const routeLines = src.split('\n').filter((l) => /<Route\s+path="[a-z-]+"/.test(l) && !/Navigate/.test(l))
    expect(routeLines.length).toBeGreaterThanOrEqual(28)
    for (const l of routeLines) {
      const p = /path="([a-z-]+)"/.exec(l)![1]
      expect(l, `/${p} must be wrapped in RequireRoute`).toContain(`<RequireRoute to="/${p}">`)
      expect(ROUTE_PERMISSIONS['/' + p], `/${p} missing from ROUTE_PERMISSIONS`).toBeTruthy()
    }
  })
  test('the index route uses the permission-aware HomeRedirect, and the alias redirect does not bypass a guard', () => {
    expect(src).toContain('<Route index element={<HomeRedirect />} />')
  })
  test('every permission named in the table exists in the server contract (no typos, no invented keys)', () => {
    const known = new Set<string>(contract.PERMISSIONS)
    for (const [route, list] of Object.entries(ROUTE_PERMISSIONS)) for (const p of list) expect(known.has(p), `${route} → ${p}`).toBe(true)
  })
  test('an unknown route is denied (fails closed)', () => {
    expect(permissionsForPath('/brand-new-page')).toBeUndefined()
    expect(canOpenPath(permsOf('owner'), '/brand-new-page')).toBe(false)
  })
})

describe('which modules each role can open', () => {
  test.each(ROLES)('%s', (role) => {
    const open = EVERYTHING.filter((p) => canOpenPath(permsOf(role), p)).sort()
    expect(open).toEqual([...EXPECT_OPEN[role]].sort())
  })
  test('landing page: every role with a dashboard lands there; a user with no permissions lands nowhere', () => {
    for (const role of ROLES) expect(landingPathFor(permsOf(role))).toBe('/dashboard')
    expect(landingPathFor([])).toBeNull(); expect(landingPathFor(undefined)).toBeNull()
    expect(landingPathFor(['products.view'])).toBe('/products')
  })
})

describe('sidebar', () => {
  const NAV = [
    { section: 'DASHBOARD' }, { to: '/dashboard', label: 'Dashboard' },
    { section: 'SALES' }, { to: '/sales', label: 'Sales' }, { to: '/retail-sale', label: 'Retail' },
    { section: 'PURCHASE' }, { to: '/purchase', label: 'Purchase' },
    { section: 'ACCOUNTING' }, { to: '/accounting', label: 'Accounting' }, { to: '/ledger', label: 'Ledger' },
    { section: 'ADMINISTRATION' }, { to: '/settings', label: 'Settings' },
  ]
  const labels = (role: string) => filterNavByPermission(NAV as any[], permsOf(role)).map((i: any) => i.label ?? `[${i.section}]`)
  test('cashier: sales + no purchase/accounting/admin sections at all (empty headers are dropped)', () => {
    expect(labels('cashier')).toEqual(['[DASHBOARD]', 'Dashboard', '[SALES]', 'Sales', 'Retail'])
  })
  test('viewer: read-only screens only — no retail POS, no settings', () => {
    const l = labels('viewer'); expect(l).toContain('Sales'); expect(l).toContain('Accounting'); expect(l).not.toContain('Retail'); expect(l).not.toContain('Settings')
  })
  test('accountant sees accounting; auditor sees settings only for the audit log; manager and admin see everything', () => {
    expect(labels('accountant')).toContain('Ledger'); expect(labels('accountant')).not.toContain('Retail')
    expect(labels('auditor')).toContain('Settings')
    for (const r of ['manager', 'admin', 'owner']) expect(labels(r)).toContain('Settings')
  })
  test('no permissions list (legacy / offline-stale session) shows nothing', () => { expect(filterNavByPermission(NAV as any[], undefined)).toEqual([]) })
})

describe('settings sections (nested navigation)', () => {
  const ids = (role: string) => SETTINGS_SECTIONS.filter((s) => sectionAllowed(s, permsOf(role))).map((s) => s.id)
  test('admin/owner: everything', () => { for (const r of ['owner', 'admin']) expect(ids(r)).toEqual(SETTINGS_SECTIONS.map((s) => s.id)) })
  test('manager: view-level sections only — no users, companies, backup, audit log', () => {
    const m = ids('manager'); for (const hidden of ['users', 'companies', 'backup', 'audit-log']) expect(m).not.toContain(hidden); expect(m).toContain('general')
  })
  test('accountant / auditor: only the Audit Log', () => { expect(ids('accountant')).toEqual(['audit-log']); expect(ids('auditor')).toEqual(['audit-log']) })
  test('cashier / viewer: nothing', () => { expect(ids('cashier')).toEqual([]); expect(ids('viewer')).toEqual([]) })
  test('every section requires a permission that exists on the server', () => {
    const known = new Set<string>(contract.PERMISSIONS); for (const s of SETTINGS_SECTIONS) for (const p of s.requires) expect(known.has(p)).toBe(true)
  })
})

describe('can() — exact match on the server list', () => {
  test('no wildcard matching: a viewer holds sales.view and NOTHING else, "*.view" / "sales.*" do not leak', () => {
    signIn('viewer'); const { can } = useAuthStore.getState()
    expect(can('sales.view')).toBe(true); expect(can('accounting.view')).toBe(true)
    for (const k of ['sales.create', 'sales.*', '*', '*.view', 'settings.view', 'accounting.post']) expect(can(k)).toBe(false)
  })
  test('a role name is not a permission (admin gets no implicit "*")', () => {
    signIn('admin', ['sales.view']); expect(useAuthStore.getState().can('sales.create')).toBe(false); expect(useAuthStore.getState().can('settings.users.manage')).toBe(false)
  })
  test('a session persisted by an older version (no permissions list) is denied everything until /auth/me refreshes it', () => {
    signIn('owner', undefined); expect(useAuthStore.getState().can('dashboard.view')).toBe(false)
    expect(useAuthStore.getState().canAny('sales.view', 'products.view')).toBe(false)
  })
  test('canAny', () => { signIn('cashier'); expect(useAuthStore.getState().canAny('accounting.view', 'sales.create')).toBe(true); expect(useAuthStore.getState().canAny('accounting.view', 'reports.view')).toBe(false) })
})

describe('guards (direct URL navigation)', () => {
  const Where = () => <span data-testid="where">{useLocation().pathname}</span>
  const renderAt = (url: string) => render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/settings" element={<RequireRoute to="/settings"><div>SETTINGS PAGE</div></RequireRoute>} />
        <Route path="/accounting" element={<RequireRoute to="/accounting"><div>ACCOUNTING PAGE</div></RequireRoute>} />
        <Route path="/sales" element={<RequireRoute to="/sales"><div>SALES PAGE</div></RequireRoute>} />
        <Route path="/retail-sale" element={<RequireRoute to="/retail-sale"><div>RETAIL PAGE</div></RequireRoute>} />
        <Route path="/dashboard" element={<RequireRoute to="/dashboard"><div>DASHBOARD PAGE</div></RequireRoute>} />
        <Route path="/new-undeclared" element={<RequireRoute to="/new-undeclared"><div>UNDECLARED</div></RequireRoute>} />
        <Route path="/owner-only" element={<RequireRole roles={['owner']}><div>OWNER ONLY</div></RequireRole>} />
        <Route path="/perm" element={<RequirePermission permissions={['sales.cancel']}><div>CANCEL UI</div></RequirePermission>} />
      </Routes><Where />
    </MemoryRouter>)

  test.each([['cashier', '/accounting'], ['cashier', '/settings'], ['viewer', '/settings'], ['viewer', '/retail-sale'], ['auditor', '/retail-sale']])
  ('%s opening %s directly → Access denied, page never renders', (role, url) => {
    signIn(role); renderAt(url)
    expect(screen.getByTestId('access-denied')).toBeInTheDocument(); expect(screen.queryByText(/PAGE/)).toBeNull()
  })
  test.each([['accountant', '/accounting'], ['cashier', '/sales'], ['cashier', '/retail-sale'], ['viewer', '/accounting'], ['manager', '/settings'], ['auditor', '/settings']])
  ('%s opening %s → allowed', (role, url) => { signIn(role); renderAt(url); expect(screen.queryByTestId('access-denied')).toBeNull(); expect(screen.getByText(/PAGE/)).toBeInTheDocument() })

  test('a signed-out / permission-less user is denied everywhere', () => { renderAt('/sales'); expect(screen.getByTestId('access-denied')).toBeInTheDocument() })
  test('a route missing from the permission table is denied, even to the owner', () => { signIn('owner'); renderAt('/new-undeclared'); expect(screen.getByTestId('access-denied')).toBeInTheDocument() })
  test('the denied screen offers a page the user CAN open', () => { signIn('cashier'); renderAt('/accounting'); expect(screen.getByText(/Go to a page you can open/)).toHaveAttribute('href', '/dashboard') })

  test('"/" sends each user to a module they may open; a user with no permissions sees "No modules assigned"', () => {
    signIn('cashier'); renderAt('/'); expect(screen.getByTestId('where').textContent).toBe('/dashboard'); expect(screen.getByText('DASHBOARD PAGE')).toBeInTheDocument()
  })
  test('landing: a user whose only permission is sales.view is sent to Sales, not to a dashboard they cannot open', () => {
    signIn('custom', ['sales.view']); renderAt('/'); expect(screen.getByTestId('where').textContent).toBe('/sales')
  })
  test('no permissions at all → explanatory screen, no redirect loop', () => {
    signIn('viewer', []); renderAt('/'); expect(screen.getByText('No modules assigned')).toBeInTheDocument()
  })

  test('RequireRole is exact: an admin is NOT an owner, and holding a permission named like a role grants nothing', () => {
    signIn('admin'); renderAt('/owner-only'); expect(screen.getByTestId('access-denied')).toBeInTheDocument()
    signIn('viewer', ['owner']); renderAt('/owner-only'); expect(screen.getAllByTestId('access-denied').length).toBeGreaterThan(0)
  })
  test('RequireRole lets the named role through', () => { signIn('owner'); renderAt('/owner-only'); expect(screen.getByText('OWNER ONLY')).toBeInTheDocument() })
  test('RequirePermission gates a control: cashier (sales.cancel) sees it, viewer does not', () => {
    signIn('cashier'); const a = renderAt('/perm'); expect(screen.getByText('CANCEL UI')).toBeInTheDocument(); a.unmount()
    signIn('viewer'); renderAt('/perm'); expect(screen.queryByText('CANCEL UI')).toBeNull()
  })
  test('a role change takes effect as soon as the store is refreshed from the server (no re-login)', () => {
    signIn('cashier'); const r = renderAt('/sales'); expect(screen.getByText('SALES PAGE')).toBeInTheDocument(); r.unmount()
    useAuthStore.getState().updateUser({ role: 'auditor', permissions: permsOf('auditor') } as any)
    renderAt('/retail-sale'); expect(screen.getByTestId('access-denied')).toBeInTheDocument()
  })
})
