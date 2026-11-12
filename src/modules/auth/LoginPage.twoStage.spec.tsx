/**
 * Two-stage login UI: account window → role window. The server is mocked; what is asserted is what the USER can do and
 * what the page sends — in particular that nothing is signed in after stage 1, the e-mail is read-only, only Role ID +
 * Role Password (+ the pending token) are sent, and the session state is only set after stage 2.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const api = vi.hoisted(() => ({
  login: vi.fn(), verifyRole: vi.fn(), verifyOTP: vi.fn(), sendOTP: vi.fn(),
}))
vi.mock('@/services/api', () => ({ authAPI: api }))
vi.mock('@/components/brand/ZerthixLogo', () => ({ default: () => null }))
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = (p: any) => { const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p; return rest }
  const make = (tag: string) => React.forwardRef((p: any, r: any) => React.createElement(tag, { ...strip(p), ref: r }))
  return { motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }), AnimatePresence: ({ children }: any) => children }
})

import LoginPage from './LoginPage'
import useAuthStore from '@/store/authStore'

const renderPage = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<div data-testid="landed" />} />
    </Routes>
  </MemoryRouter>,
)
const fillStage1 = () => {
  fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'cashier@a.test' } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Account#Pass1' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in$/i }))
}
const PENDING = { data: { data: { requires_role_verification: true, stage: 'role_verification', auth_session_token: 'pending-xyz', expires_in: 300, email: 'cashier@a.test' } } }

beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().logout() })

describe('two-stage login page', () => {
  test('enrolled user: stage 1 opens the role window and signs NOTHING in', async () => {
    api.login.mockResolvedValue(PENDING)
    renderPage(); fillStage1()
    await screen.findByText('Verify your role')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('erp_raw_token')).toBeNull()
    expect(localStorage.getItem('erp_refresh_token')).toBeNull()
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('pending-xyz')   // pending token is memory-only
  })

  test('the e-mail is inherited and read-only; Back returns to the account window', async () => {
    api.login.mockResolvedValue(PENDING)
    renderPage(); fillStage1(); await screen.findByText('Verify your role')
    const email = screen.getByDisplayValue('cashier@a.test') as HTMLInputElement
    expect(email.readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await screen.findByText('Welcome back')
    expect(screen.queryByText('Verify your role')).toBeNull()
  })

  test('submitting sends ONLY the pending token, Role ID and Role Password — no email, user id or role', async () => {
    api.login.mockResolvedValue(PENDING)
    api.verifyRole.mockResolvedValue({ data: { data: { token: 't', refresh_token: 'r', role: 'cashier', permissions: ['dashboard.view', 'sales.view'],
      user: { id: 'u1', email: 'cashier@a.test', role: 'cashier', permissions: ['dashboard.view', 'sales.view'] }, company: { id: 'c1' } } } })
    renderPage(); fillStage1(); await screen.findByText('Verify your role')
    fireEvent.change(screen.getByPlaceholderText('e.g. MGR-7K2QXA'), { target: { value: ' CSH-AAAA1 ' } })
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Role#Secret99' } })
    fireEvent.click(screen.getByRole('button', { name: /verify role/i }))
    await screen.findByTestId('landed')
    expect(api.verifyRole).toHaveBeenCalledWith({ auth_session_token: 'pending-xyz', role_id: 'CSH-AAAA1', role_password: 'Role#Secret99' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().user?.role).toBe('cashier')
    expect(localStorage.getItem('erp_refresh_token')).toBe('r')
  })

  test('wrong role credentials: generic error shown, password cleared, still on the role window, not signed in', async () => {
    api.login.mockResolvedValue(PENDING)
    api.verifyRole.mockRejectedValue({ message: 'Invalid Role ID or Role Password.', status: 401, code: 'ROLE_VERIFICATION_FAILED', original: { response: { data: { attempts_left: 4 } } } })
    renderPage(); fillStage1(); await screen.findByText('Verify your role')
    fireEvent.change(screen.getByPlaceholderText('e.g. MGR-7K2QXA'), { target: { value: 'NOPE-1234' } })
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'whatever99' } })
    fireEvent.click(screen.getByRole('button', { name: /verify role/i }))
    await screen.findByText(/Invalid Role ID or Role Password/)
    expect(screen.getByText('Verify your role')).toBeTruthy()
    expect((screen.getAllByPlaceholderText('••••••••')[0] as HTMLInputElement).value).toBe('')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  test('ended session (too many attempts / expired) drops back to the account window with a message', async () => {
    api.login.mockResolvedValue(PENDING)
    api.verifyRole.mockRejectedValue({ message: 'x', status: 401, code: 'ROLE_VERIFICATION_FAILED', original: { response: { data: { session_ended: true } } } })
    renderPage(); fillStage1(); await screen.findByText('Verify your role')
    fireEvent.change(screen.getByPlaceholderText('e.g. MGR-7K2QXA'), { target: { value: 'CSH-AAAA1' } })
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'whatever99' } })
    fireEvent.click(screen.getByRole('button', { name: /verify role/i }))
    await screen.findByText('Welcome back')
    expect(screen.getByText(/Please sign in again/)).toBeTruthy()
  })

  test('empty fields are rejected client-side without calling the server', async () => {
    api.login.mockResolvedValue(PENDING)
    renderPage(); fillStage1(); await screen.findByText('Verify your role')
    fireEvent.click(screen.getByRole('button', { name: /verify role/i }))
    await screen.findByText(/Enter your Role ID/)
    expect(api.verifyRole).not.toHaveBeenCalled()
  })

  test('user without role credentials: single-stage login works exactly as before', async () => {
    api.login.mockResolvedValue({ data: { data: { token: 't', refresh_token: 'r', user: { id: 'u', email: 'legacy@a.test', role: 'cashier', permissions: ['dashboard.view'] }, company: { id: 'c' } } } })
    renderPage(); fillStage1()
    await screen.findByTestId('landed')
    expect(screen.queryByText('Verify your role')).toBeNull(); expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  test('login-by-OTP also routes enrolled users into the role window', async () => {
    api.sendOTP.mockResolvedValue({ data: { data: {} } })
    api.verifyOTP.mockResolvedValue(PENDING)
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: /otp login/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /email/i }))
    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), { target: { value: 'cashier@a.test' } })
    fireEvent.submit(screen.getByPlaceholderText(/you@company.com/i).closest('form')!)
    await waitFor(() => expect(api.sendOTP).toHaveBeenCalled())
    const boxes = await screen.findAllByLabelText(/OTP digit/)
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '123456' } })      // the OTP boxes' own paste path
    await waitFor(() => expect(api.verifyOTP).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'login', destination: 'cashier@a.test' })))
    await screen.findByText('Verify your role')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
