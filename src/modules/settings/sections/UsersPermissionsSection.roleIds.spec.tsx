/** Settings → Users & Permissions shows each user's User ID and Role ID(s); disabled / missing ones are marked. */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const USERS = [
  { id: 'ff9ddcaa-bf6c-49d3-a535-ef5f73db6c4b', name: 'Bishal Owner', email: 'owner@demo.test', role: 'owner', is_active: true,
    role_credentials: [{ role: 'owner', role_code: 'OWN-DEMO1', is_active: true }] },
  { id: '071441d4-0000-4000-8000-000000000001', name: 'New Hire', email: 'hire@demo.test', role: 'viewer', is_active: true, role_credentials: [] },
  { id: '09ca22f6-0000-4000-8000-000000000002', name: 'Sita Manager', email: 'manager@demo.test', role: 'manager', is_active: true,
    role_credentials: [{ role: 'cashier', role_code: 'CSH-SITA2', is_active: true }, { role: 'manager', role_code: 'MGR-SITA1', is_active: false }] },
]
vi.mock('@/hooks/useQuery', () => ({ useUsers: () => ({ data: { data: USERS }, isLoading: false }) }))
vi.mock('@/services/api', () => ({
  settingsAPI: { rolesMatrix: () => new Promise(() => {}), createUser: vi.fn(), updateUser: vi.fn() },
  authAPI: { setUserRoleCredential: vi.fn(), setUserRoleCredentialActive: vi.fn() },
}))
import UsersPermissionsSection from './UsersPermissionsSection'

const renderIt = () => render(<QueryClientProvider client={new QueryClient()}><UsersPermissionsSection /></QueryClientProvider>)

describe('Users & Permissions — IDs', () => {
  test('desktop table: User ID under the name, Role ID column with one chip per credential', () => {
    const { container } = renderIt()
    const table = container.querySelector('.stp-desktop-table') as HTMLElement
    expect(within(table).getByText('Name / User ID')).toBeTruthy(); expect(within(table).getByText('Role ID')).toBeTruthy()
    expect(within(table).getByText('ff9ddcaa…')).toBeTruthy()                        // shortened User ID (full one is copied)
    expect(within(table).getByTitle(/User ID ff9ddcaa-bf6c-49d3-a535-ef5f73db6c4b/)).toBeTruthy()
    expect(within(table).getByText('OWN-DEMO1')).toBeTruthy()
    expect(within(table).getByText('CSH-SITA2')).toBeTruthy(); expect(within(table).getByText('MGR-SITA1')).toBeTruthy()   // multi-role
  })
  test('a user with no Role ID yet is marked "Not set up"; a disabled role is struck through', () => {
    const { container } = renderIt()
    const table = container.querySelector('.stp-desktop-table') as HTMLElement
    expect(within(table).getByText('Not set up')).toBeTruthy()
    expect(within(table).getByText('MGR-SITA1').closest('span[title]')?.className).toMatch(/line-through/)
  })
  test('mobile cards show User ID and Role ID too', () => {
    const { container } = renderIt()
    const list = container.querySelector('.stp-mobile-list') as HTMLElement
    expect(within(list).getAllByText('User ID').length).toBe(3); expect(within(list).getAllByText('Role ID').length).toBe(3)
    expect(within(list).getByText('OWN-DEMO1')).toBeTruthy()
  })
  test('no password or hash is ever rendered', () => {
    const { container } = renderIt(); expect(container.textContent).not.toMatch(/password_hash|\$2[aby]\$/)
  })
})
