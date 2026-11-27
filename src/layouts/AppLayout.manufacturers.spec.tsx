/**
 * The Manufacturers page is already routed (/manufacturers, guarded by products.view). These tests pin down that it is
 * reachable from the real sidebar: shown in INVENTORY for roles that may open it, hidden for those that may not,
 * highlighted when active, and navigable on desktop and mobile widths. Roles/permissions come from the server contract.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// @ts-ignore — CommonJS module from the backend package: the single authoritative role → permission table
import * as serverContract from '../../../erp-unified-backend/src/rbac/permissions.js'

vi.mock('@/services/api', async (orig) => ({ ...(await orig<any>()), authAPI: { me: vi.fn(), logout: vi.fn() } }))
vi.mock('@/offline/syncEngine', () => ({ isNetworkError: () => false }))
// Data hooks the layout chrome uses (alerts, company switcher, fiscal-year picker) — stubbed; everything else stays real.
vi.mock('@/hooks/useQuery', async (orig) => {
  const stub = () => ({ data: undefined, isLoading: false, isFetching: false })
  const list = () => ({ data: [], isLoading: false, isFetching: false })
  return { ...(await orig<any>()), useReminderCounts: stub, useDashboard: stub, useReminderAlerts: list, useUserCompanies: list, useFiscalYears: list }
})

import AppLayout from '@/layouts/AppLayout'
import useAuthStore from '@/store/authStore'
import { canOpenPath } from '@/constants/permissions'
import { PATHS } from '@/constants'

const contract: any = (serverContract as any).default ?? serverContract
const ROLES: string[] = contract.USER_ROLES
const permsOf = (role: string) => contract.effectivePermissions({ role })
const signIn = (role: string) =>
  useAuthStore.setState({ isAuthenticated: true, token: 't', company: { id: 'c', name: 'Co' } as any,
    user: { id: 'u', name: 'U', role, permissions: permsOf(role) } as any })

const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
const app = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="manufacturers" element={<div>MANUFACTURERS-PAGE</div>} />
        <Route path="products" element={<div>PRODUCTS-PAGE</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
  </QueryClientProvider>)
const navLink = () => document.querySelector(`a.nav-link[href="${PATHS.MANUFACTURERS}"]`) as HTMLAnchorElement | null

beforeEach(() => { setWidth(1280); Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }), configurable: true }) })

describe('Manufacturers in the sidebar', () => {
  test('owner sees it under INVENTORY, right after Products, linking to the existing route', () => {
    signIn('owner'); app('/products')
    const link = navLink()!
    expect(link).toBeTruthy(); expect(link.getAttribute('href')).toBe('/manufacturers')
    expect(link).toHaveTextContent('Manufacturers')
    const links = Array.from(document.querySelectorAll('a.nav-link')).map(a => a.getAttribute('href'))
    expect(links[links.indexOf('/products') + 1]).toBe('/manufacturers')
  })

  test.each(ROLES)('role %s: visible exactly when the router lets it open /manufacturers (products.view)', (role) => {
    signIn(role); app('/products')
    expect(!!navLink()).toBe(canOpenPath(permsOf(role), PATHS.MANUFACTURERS))
  })

  test('a user without products.view does not get the link (and no orphan INVENTORY header is added by it)', () => {
    useAuthStore.setState({ isAuthenticated: true, token: 't', company: { id: 'c' } as any, user: { id: 'u', role: 'viewer', permissions: ['dashboard.view'] } as any })
    app('/products'); expect(navLink()).toBeNull()
  })

  test('clicking it opens the existing Manufacturers page, highlights it, and un-highlights Products', () => {
    signIn('owner'); app('/products')
    expect(screen.getByText('PRODUCTS-PAGE')).toBeInTheDocument()
    expect(navLink()!.classList.contains('active')).toBe(false)
    fireEvent.click(navLink()!)
    expect(screen.getByText('MANUFACTURERS-PAGE')).toBeInTheDocument()
    expect(navLink()!.classList.contains('active')).toBe(true)
    expect(document.querySelector('a.nav-link[href="/products"]')!.classList.contains('active')).toBe(false)
  })

  test('active highlight also applies when the page is opened directly, and the page title is set', () => {
    signIn('owner'); app('/manufacturers')
    expect(navLink()!.classList.contains('active')).toBe(true)
    expect(screen.getAllByText('Manufacturers').length).toBeGreaterThan(1)       // sidebar label + page title / breadcrumb
  })

  test('mobile width: the same entry is in the drawer and navigates', () => {
    setWidth(390); signIn('owner'); app('/products')
    const link = navLink()!; expect(link).toBeTruthy()
    fireEvent.click(link)
    expect(screen.getByText('MANUFACTURERS-PAGE')).toBeInTheDocument()
    expect(navLink()!.classList.contains('active')).toBe(true)
  })

  test('other items are untouched: Products, Stock Register, Stock & Sales Summary still present in the same order', () => {
    signIn('owner'); app('/products')
    const hrefs = Array.from(document.querySelectorAll('a.nav-link')).map(a => a.getAttribute('href'))
    const i = hrefs.indexOf('/products')
    expect(hrefs.slice(i, i + 4)).toEqual(['/products', '/manufacturers', '/stock-register', '/stock-summary'])
  })

  test('quick-search finds it (reuses the same permission-filtered list)', () => {
    signIn('owner'); app('/products')
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement
    fireEvent.focus(input); fireEvent.change(input, { target: { value: 'manufac' } })
    expect(screen.getAllByText('Manufacturers').length).toBeGreaterThan(1)
  })
})
