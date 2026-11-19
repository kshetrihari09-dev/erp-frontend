/**
 * Mandatory role verification at every app start — client side:
 *   - the session is held in memory only; nothing that grants access is ever written to browser storage;
 *   - whatever an older version left in storage is deleted at startup and never trusted;
 *   - the app-instance id is per run, in memory, and different after a restart;
 *   - the HTTP client sends only what memory holds, treats finished sessions as final, and never persists refreshed tokens;
 *   - the company switch and the closing beacon behave as specified.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const nav = vi.hoisted(() => ({ navigateTo: vi.fn(), registerNavigator: vi.fn() }))
vi.mock('@/services/navigation', () => nav)
const switchTo = vi.hoisted(() => vi.fn())
vi.mock('@/services/api', () => ({ companiesAPI: { switchTo } , authAPI: {} }))

const USER: any = { id: 'u1', name: 'A', email: 'a@x.t', role: 'cashier', permissions: ['sales.view'] }
const CO: any = { id: 'c1', name: 'Co' }
const LEGACY = { erp_raw_token: 'aaa.bbb.ccc', erp_refresh_token: 'refresh-old', erp_auth_state: JSON.stringify({ state: { token: 'aaa.bbb.ccc', user: USER, company: CO, isAuthenticated: true }, version: 0 }) }
const seedLegacy = () => Object.entries(LEGACY).forEach(([k, v]) => { localStorage.setItem(k, v); sessionStorage.setItem(k, v) })

beforeEach(() => { vi.resetModules(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const freshStore = async () => (await import('@/store/authStore')).default

describe('authStore: memory only', () => {
  test('signing in, refreshing tokens, switching company and signing out never write to localStorage / sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const store = await freshStore()
    store.getState().setAuth({ token: 'a.b.c', refreshToken: 'r1', user: USER, company: CO })
    store.getState().setTokens({ token: 'd.e.f', refreshToken: 'r2' })
    store.getState().replaceSession({ token: 'g.h.i', refreshToken: 'r3', user: USER, company: CO })
    store.getState().updateUser({ name: 'B' }); store.getState().setCompany({ ...CO, name: 'Co2' })
    store.getState().logout()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0)
  })

  test('a session cannot be restored from storage after a restart: legacy keys are deleted at startup and never read', async () => {
    seedLegacy()                                                   // what an old version (or an attacker) left behind
    const store = await freshStore()                               // = the app starting again
    const s = store.getState()
    expect(s.isAuthenticated).toBe(false); expect(s.token).toBeNull(); expect(s.refreshToken).toBeNull(); expect(s.user).toBeNull(); expect(s.company).toBeNull()
    for (const k of Object.keys(LEGACY)) { expect(localStorage.getItem(k)).toBeNull(); expect(sessionStorage.getItem(k)).toBeNull() }
  })

  test('a "remembered" session in storage does not authenticate the HTTP client either', async () => {
    seedLegacy(); await freshStore()
    const http = (await import('@/services/http')).default
    const h: any = (http.interceptors.request as any).handlers.find(Boolean)
    const cfg = h.fulfilled({ headers: {}, url: '/sales' })
    expect(cfg.headers.Authorization).toBeUndefined()              // nothing in memory → no Bearer, whatever storage holds
    expect(cfg.headers['X-App-Instance']).toMatch(/^[A-Za-z0-9_-]{22,128}$/)
  })

  test('logout also drops the service-worker API response cache (it is keyed by URL, not by user)', async () => {
    const del = vi.fn().mockResolvedValue(true); vi.stubGlobal('caches', { delete: del })
    const store = await freshStore()
    store.getState().setAuth({ token: 'a.b.c', user: USER, company: CO }); expect(del).toHaveBeenCalledWith('zerthix-api-get-cache')
    del.mockClear(); store.getState().replaceSession({ token: 'a.b.d', user: USER, company: CO }); expect(del).toHaveBeenCalledTimes(1)
    del.mockClear(); store.getState().logout(); expect(del).toHaveBeenCalledTimes(1)
  })

  test('permission helpers keep their original behaviour (exact match from the server list; arrays for hasRole)', async () => {
    const store = await freshStore()
    store.getState().setAuth({ token: 'a.b.c', user: { ...USER, role: 'manager' }, company: CO })
    expect(store.getState().can('sales.view')).toBe(true); expect(store.getState().can('sales.*')).toBe(false)
    expect(store.getState().canAny('x', 'sales.view')).toBe(true); expect(store.getState().hasRole(['manager', 'owner'])).toBe(true); expect(store.getState().hasRole('owner')).toBe(false)
    store.getState().logout(); expect(store.getState().can('sales.view')).toBe(false)
  })
})

describe('app instance id', () => {
  test('stable within a run, random per start, URL-safe, and never stored', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const a = await import('@/services/appInstance')
    const id1 = a.getAppInstanceId(); expect(a.getAppInstanceId()).toBe(id1); expect(id1).toMatch(/^[A-Za-z0-9_-]{32}$/)
    vi.resetModules(); const b = await import('@/services/appInstance')                          // "the app was closed and reopened"
    expect(b.getAppInstanceId()).not.toBe(id1)
    expect(setItem).not.toHaveBeenCalled(); expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(id1)
  })
})

describe('HTTP client', () => {
  const fakeOk = async (cfg: any) => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: cfg })
  const mkError = (status: number, code: string | undefined, url = '/sales') => ({
    config: { url, headers: {}, method: 'get' }, message: 'x', isAxiosError: true,
    response: { status, data: { message: 'nope', code }, headers: {} },
  })
  const rejected = (http: any) => http.interceptors.response.handlers.find(Boolean).rejected

  test('attaches the in-memory token and the instance id to every request', async () => {
    const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    const http = (await import('@/services/http')).default
    const cfg = (http.interceptors.request as any).handlers.find(Boolean).fulfilled({ headers: {}, url: '/x' })
    expect(cfg.headers.Authorization).toBe('Bearer aa.bb.cc')
    const { getAppInstanceId } = await import('@/services/appInstance'); expect(cfg.headers['X-App-Instance']).toBe(getAppInstanceId())
  })

  test.each(['SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_INSTANCE_MISMATCH', 'ROLE_REVOKED', 'ROLE_VERIFICATION_REQUIRED'])(
    '401 %s ends the session at once: signed out, sent to login, and NO refresh is attempted', async (code) => {
      const axios = (await import('axios')).default; const post = vi.spyOn(axios, 'post')
      const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', refreshToken: 'r1', user: USER, company: CO })
      const http = (await import('@/services/http')).default
      await expect(rejected(http)(mkError(401, code))).rejects.toMatchObject({ status: 401, code })
      expect(store.getState().isAuthenticated).toBe(false); expect(store.getState().token).toBeNull(); expect(store.getState().refreshToken).toBeNull()
      expect(post).not.toHaveBeenCalled(); expect(nav.navigateTo).toHaveBeenCalledWith('/login', { replace: true })
    })

  test('an expired access token is refreshed silently — the refreshed tokens stay in memory, the instance id is sent, storage untouched', async () => {
    const axios = (await import('axios')).default
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { token: 'new.tok.en', refresh_token: 'r2' } } } as any)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', refreshToken: 'r1', user: USER, company: CO })
    const http = (await import('@/services/http')).default; http.defaults.adapter = fakeOk as any
    const res = await rejected(http)(mkError(401, undefined))
    expect(res.data).toEqual({ ok: true })
    expect(post.mock.calls[0][0]).toMatch(/\/auth\/refresh$/); expect(post.mock.calls[0][1]).toEqual({ refresh_token: 'r1' })
    const { getAppInstanceId } = await import('@/services/appInstance'); expect((post.mock.calls[0][2] as any).headers['X-App-Instance']).toBe(getAppInstanceId())
    expect(store.getState().token).toBe('new.tok.en'); expect(store.getState().refreshToken).toBe('r2')
    expect(setItem).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0)
  })

  test('with no refresh token in memory (e.g. after a restart) a 401 goes straight to login', async () => {
    const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })        // no refresh token
    const http = (await import('@/services/http')).default
    await expect(rejected(http)(mkError(401, undefined))).rejects.toMatchObject({ status: 401 })
    expect(store.getState().isAuthenticated).toBe(false); expect(nav.navigateTo).toHaveBeenCalledWith('/login', { replace: true })
  })

  test('a rejected refresh token ends the session; a wrong Role Password (login-window 401) does NOT sign anyone out', async () => {
    const axios = (await import('axios')).default
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status: 401 }, isAxiosError: true })
    const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', refreshToken: 'r1', user: USER, company: CO })
    const http = (await import('@/services/http')).default
    await expect(rejected(http)(mkError(401, undefined))).rejects.toMatchObject({ status: 401 })
    expect(store.getState().isAuthenticated).toBe(false)
    nav.navigateTo.mockClear(); store.getState().setAuth({ token: 'aa.bb.cc', refreshToken: 'r1', user: USER, company: CO })
    await expect(rejected(http)(mkError(401, 'ROLE_VERIFICATION_FAILED', '/auth/verify-role'))).rejects.toMatchObject({ status: 401 })
    expect(nav.navigateTo).not.toHaveBeenCalled(); expect(store.getState().isAuthenticated).toBe(true)          // credential endpoints are form errors
  })
})

describe('company switch', () => {
  test('no page load: new tokens in memory, UI remounted (epoch), caches reset, navigates to the dashboard, storage untouched', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const assign = vi.fn(); vi.stubGlobal('location', { ...window.location, assign, replace: assign, href: 'http://localhost/sales', pathname: '/sales' })
    const store = await freshStore(); store.getState().setAuth({ token: 'aa.bb.cc', refreshToken: 'r1', user: USER, company: CO })
    const { setStepUpToken, getValidStepUpToken } = await import('@/services/stepUpToken'); setStepUpToken('step-up', 300)
    const fy = await import('@/services/fiscalYearSelection'); fy.setSelectedFiscalYearId('fy-1')
    switchTo.mockResolvedValue({ data: { data: { token: 'new.tok.en', refresh_token: 'r2', user: { ...USER, role: 'cashier' }, company: { id: 'c2', name: 'Co2' } } } })
    const epoch = store.getState().sessionEpoch
    const { switchCompany } = await import('@/hooks/useCompanySwitch'); await switchCompany('c2')
    const s = store.getState()
    expect(s.token).toBe('new.tok.en'); expect(s.refreshToken).toBe('r2'); expect(s.company?.id).toBe('c2'); expect(s.isAuthenticated).toBe(true)
    expect(s.sessionEpoch).toBe(epoch + 1)
    expect(getValidStepUpToken()).toBeNull(); expect(fy.getSelectedFiscalYearId()).toBeNull()
    expect(nav.navigateTo).toHaveBeenCalledWith('/dashboard', { replace: true }); expect(assign).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('closing beacon (best effort)', () => {
  test('on pagehide the token is sent to /auth/end-session with keepalive; nothing is sent when signed out or when the page goes to the bfcache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({}); vi.stubGlobal('fetch', fetchMock)
    const store = await freshStore(); const { endSessionOnPageHide } = await import('@/hooks/useSessionLifecycle')
    endSessionOnPageHide({ persisted: false }); expect(fetchMock).not.toHaveBeenCalled()                    // no session → nothing to end
    store.getState().setAuth({ token: 'aa.bb.cc', user: USER, company: CO })
    endSessionOnPageHide({ persisted: true }); expect(fetchMock).not.toHaveBeenCalled()                     // bfcache, not closing
    endSessionOnPageHide({ persisted: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/end-session$/); expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' })
    expect(JSON.parse(init.body)).toEqual({ token: 'aa.bb.cc' })
  })
})
