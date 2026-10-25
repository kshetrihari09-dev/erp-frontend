// Same API test double as the CC% tests (products, parties, sales/purchase create…) plus a controllable
// fiscal-year list for the fiscal-year date-check tests.
export * from './mock-api-cc-sync'
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
export const fiscal: { years: any[] } = { years: [] }
export const fy = (name: string, start: string, end: string, extra: any = {}) =>
  ({ id: 'fy-' + name, name, start_date: start, end_date: end, start_date_ad: start, end_date_ad: end, is_active: false, is_current: false, is_locked: false, ...extra })
const generic = (): any => new Proxy({}, { get: () => () => ok([]) })
const base: any = generic()
export const settingsAPI: any = new Proxy({}, { get: (_t, m: string) => m === 'fiscalYears' ? () => ok(fiscal.years) : base[m] })
