// Test double for '@/services/api' — a controllable notifications endpoint that
// records every request, so tests can count exactly how many polls were sent.
export const calls: Array<{ params: any; signal?: AbortSignal }> = []
export const behavior: { next: (n: number) => Promise<any> | any } = {
  next: () => ({ data: { success: true, data: [], pagination: { total: 0 } } }),
}
export function resetCalls() { calls.length = 0; behavior.next = () => ({ data: { success: true, data: [], pagination: { total: 0 } } }) }
export const notificationsAPI = {
  list: (params: any, cfg?: { signal?: AbortSignal }) => {
    calls.push({ params, signal: cfg?.signal })
    return Promise.resolve().then(() => behavior.next(calls.length))
  },
}
