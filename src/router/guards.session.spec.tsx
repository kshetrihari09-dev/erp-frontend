/**
 * Route guards under the memory-only session policy: protected pages are blocked before role verification, nothing in browser
 * storage can open them, and signing out (or a revoked session) takes them away at once — including via the Back button.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'

const api = vi.hoisted(() => ({ me: vi.fn() }))
vi.mock('@/services/api', () => ({ authAPI: api, companiesAPI: {} }))
vi.mock('@/offline/syncEngine', () => ({ isNetworkError: (e: any) => !e?.response }))
vi.mock('@/components/shared/AccessDenied', () => ({ default: () => <div>denied</div> }))

import { RequireAuth, RequireGuest, RequireRoute } from './guards'
import useAuthStore from '@/store/authStore'

const USER: any = { id: 'u1', name: 'A', email: 'a@x.t', role: 'owner', permissions: ['dashboard.view', 'sales.view', 'accounting.view'] }
const CO: any = { id: 'c1', name: 'Co' }
const PROTECTED = ['/dashboard', '/sales', '/ledger', '/stock-register', '/settings', '/reports']

const App = ({ at }: { at: string }) => (
  <MemoryRouter initialEntries={[at]}>
    <Routes>
      <Route path="/login" element={<RequireGuest><div>LOGIN SCREEN</div></RequireGuest>} />
      <Route path="*" element={<RequireAuth><RequireRoute to="/dashboard"><div>PROTECTED CONTENT</div></RequireRoute></RequireAuth>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); useAuthStore.getState().logout(); api.me.mockResolvedValue({ data: { data: { user: USER, company: CO } } }) })

describe('direct navigation / restart', () => {
  test.each(PROTECTED)('opening %s directly without a verified session shows the login screen — no protected content, no API call', async (path) => {
    render(<App at={path} />)
    expect(screen.getByText('LOGIN SCREEN')).toBeTruthy()          // decided synchronously: no loader, no flash
    expect(screen.queryByText('PROTECTED CONTENT')).toBeNull(); expect(screen.queryByText(/Verifying session/i)).toBeNull()
    expect(api.me).not.toHaveBeenCalled()
  })

  test('browser storage cannot open a protected page after a restart (old token, user, company, "remembered" role, refresh token)', async () => {
    localStorage.setItem('erp_raw_token', 'aaa.bbb.ccc'); localStorage.setItem('erp_refresh_token', 'old-refresh')
    localStorage.setItem('erp_auth_state', JSON.stringify({ state: { token: 'aaa.bbb.ccc', user: USER, company: CO, isAuthenticated: true } }))
    localStorage.setItem('erp_active_role', 'owner'); sessionStorage.setItem('erp_raw_token', 'aaa.bbb.ccc')
    // "restart": the store is created fresh from memory only — re-import it the way a new app start would
    vi.resetModules(); const fresh = (await import('@/store/authStore')).default
    expect(fresh.getState().isAuthenticated).toBe(false); expect(fresh.getState().token).toBeNull()
    const { RequireAuth: RA } = await import('./guards')
    render(<MemoryRouter initialEntries={['/sales']}><Routes><Route path="/login" element={<div>LOGIN SCREEN</div>} /><Route path="*" element={<RA><div>PROTECTED CONTENT</div></RA>} /></Routes></MemoryRouter>)
    expect(screen.getByText('LOGIN SCREEN')).toBeTruthy(); expect(screen.queryByText('PROTECTED CONTENT')).toBeNull()
  })
})

describe('verified session in this run', () => {
  test('after role verification the protected page opens (re-validated once with the server)', async () => {
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    render(<App at="/dashboard" />)
    expect(screen.getByText(/Verifying session/i)).toBeTruthy()
    expect(await screen.findByText('PROTECTED CONTENT')).toBeTruthy(); expect(api.me).toHaveBeenCalledTimes(1)
  })

  test('the server saying the session is gone (401) signs out and returns to login; a network failure does not', async () => {
    api.me.mockRejectedValueOnce({ response: { status: 401 } })
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    const a = render(<App at="/dashboard" />)
    expect(await screen.findByText('LOGIN SCREEN')).toBeTruthy(); expect(useAuthStore.getState().isAuthenticated).toBe(false)
    a.unmount()
    api.me.mockRejectedValueOnce(new Error('Network Error'))                                    // offline blip inside a running, verified session
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    render(<App at="/dashboard" />)
    expect(await screen.findByText('PROTECTED CONTENT')).toBeTruthy()
  })

  test('signing out (or any 401 handler calling logout) removes protected content immediately, so Back cannot show it', async () => {
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    render(<App at="/dashboard" />); await screen.findByText('PROTECTED CONTENT')
    act(() => { useAuthStore.getState().logout() })
    expect(await screen.findByText('LOGIN SCREEN')).toBeTruthy(); expect(screen.queryByText('PROTECTED CONTENT')).toBeNull()
  })

  test('history Back after sign-out lands on the login screen again (the guard re-evaluates every route)', async () => {
    let go: ReturnType<typeof useNavigate> | null = null
    const Probe = () => { go = useNavigate(); return null }
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    render(<MemoryRouter initialEntries={['/dashboard']}><Probe /><Routes><Route path="/login" element={<div>LOGIN SCREEN</div>} /><Route path="*" element={<RequireAuth><div>PROTECTED CONTENT</div></RequireAuth>} /></Routes></MemoryRouter>)
    await screen.findByText('PROTECTED CONTENT')
    act(() => { go!('/sales') }); await screen.findByText('PROTECTED CONTENT')
    act(() => { useAuthStore.getState().logout() }); await screen.findByText('LOGIN SCREEN')
    act(() => { go!(-1) })                                                                        // Back to the previous protected entry
    await waitFor(() => expect(screen.getByText('LOGIN SCREEN')).toBeTruthy()); expect(screen.queryByText('PROTECTED CONTENT')).toBeNull()
  })

  test('a signed-in user opening /login is sent to the app; a signed-out one sees it', async () => {
    const r = render(<App at="/login" />); expect(screen.getByText('LOGIN SCREEN')).toBeTruthy(); r.unmount()
    useAuthStore.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    render(<App at="/login" />); expect(screen.queryByText('LOGIN SCREEN')).toBeNull()
  })
})
