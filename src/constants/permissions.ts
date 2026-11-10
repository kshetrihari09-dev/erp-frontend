/**
 * Route → permission table. The ONLY place that says which permission opens which module; the router (RequireRoute),
 * the sidebar and the quick-search all read it, so a menu entry is visible exactly when its route would open.
 *
 * Which roles hold which permission is NOT defined here (that would be a second copy of the truth): the server returns
 * the signed-in user's effective `permissions[]` from /auth/me and login (see backend src/rbac/permissions.js), and the
 * front-end only asks "does the list contain it?". Each entry is ANY-OF: one matching permission opens the route.
 *
 * Fails closed: a route with no entry here is denied, never silently open.
 */
import { PATHS } from '@/constants'

export const ROUTE_PERMISSIONS: Record<string, readonly string[]> = {
  [PATHS.DASHBOARD]:            ['dashboard.view'],
  [PATHS.REMINDERS]:            ['dashboard.view'],
  [PATHS.SALES]:                ['sales.view'],
  [PATHS.RETAIL_SALE]:          ['sales.create'],
  [PATHS.SALES_RETURNS]:        ['sales.view', 'sales.return'],
  [PATHS.CUSTOMERS]:            ['parties.view'],
  [PATHS.PURCHASE]:             ['purchases.view'],
  [PATHS.PURCHASE_RETURNS]:     ['purchases.view', 'purchases.return'],
  [PATHS.SUPPLIERS]:            ['parties.view'],
  [PATHS.PRODUCTS]:             ['products.view'],
  [PATHS.BARCODE_PRINT]:        ['products.view'],
  [PATHS.QR_CODE_PRINT]:        ['products.view'],
  [PATHS.MANUFACTURERS]:        ['products.view'],
  [PATHS.STOCK]:                ['stock.view'],
  [PATHS.STOCK_REGISTER]:       ['stock.view'],
  [PATHS.STOCK_SUMMARY]:        ['stock.view'],
  [PATHS.PURCHASE_SUGGESTIONS]: ['purchases.view'],
  [PATHS.CREDIT_RISK]:          ['sales.view', 'accounting.view'],
  [PATHS.ACCOUNTING]:           ['accounting.view'],
  [PATHS.LEDGER]:               ['accounting.view'],
  [PATHS.REPORTS]:              ['reports.view'],
  [PATHS.COMPANY_CUSTOMER_REPORT]: ['reports.view'],
  [PATHS.CUSTOMER_COMPANY_REPORT]: ['reports.view'],
  [PATHS.SETTINGS]:             ['settings.view', 'audit.view'],   // sections are filtered individually (see SettingsNav)
  // aliases that the router also serves
  '/purchases':        ['purchases.view'],
  '/returns':          ['sales.view', 'sales.return', 'purchases.view', 'purchases.return'],
  '/purchase-return':  ['purchases.view', 'purchases.return'],
  '/stock-report':     ['stock.view'],
}

/** Modules in the order a user is sent to when they land on "/" — the first one they are allowed to open. */
export const LANDING_ORDER: readonly string[] = [
  PATHS.DASHBOARD, PATHS.SALES, PATHS.PURCHASE, PATHS.PRODUCTS, PATHS.STOCK, PATHS.CUSTOMERS,
  PATHS.ACCOUNTING, PATHS.REPORTS, PATHS.SETTINGS,
]

export const normalizePath = (p: string) => '/' + String(p).replace(/^\/+/, '').split(/[?#]/)[0].replace(/\/+$/, '')

/** Permissions that open `path` (any-of). `undefined` = the route is not in the table → treated as denied. */
export function permissionsForPath(path: string): readonly string[] | undefined {
  return ROUTE_PERMISSIONS[normalizePath(path)]
}

/** Pure check used by the guard, the sidebar and the search (given the user's permission list). */
export function canOpenPath(permissions: readonly string[] | undefined | null, path: string): boolean {
  const needed = permissionsForPath(path)
  if (!needed || !permissions) return false
  return needed.some((p) => permissions.includes(p))
}

export function landingPathFor(permissions: readonly string[] | undefined | null): string | null {
  return LANDING_ORDER.find((p) => canOpenPath(permissions, p)) ?? null
}

/**
 * Sidebar filter: keep the items whose route the user may open, and drop a section header when none of its items survive.
 * Pure (no React) so the router guard, the sidebar and the tests all use the same rule.
 */
export function filterNavByPermission<T extends { section?: string; to?: string }>(
  items: readonly T[], permissions: readonly string[] | undefined | null,
): T[] {
  const out: T[] = []
  let pending: T | null = null
  for (const item of items) {
    if (item.section !== undefined && item.to === undefined) { pending = item; continue }
    if (!item.to || !canOpenPath(permissions, item.to)) continue
    if (pending) { out.push(pending); pending = null }
    out.push(item)
  }
  return out
}
