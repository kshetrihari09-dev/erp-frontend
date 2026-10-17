/**
 * requestSignal.ts — "ambient" AbortSignal for the HTTP call made by a function.
 *
 * React Query hands every queryFn an AbortSignal that fires when the query is
 * cancelled (params changed, component unmounted, newer fetch superseded it).
 * Our API helpers (services/api.ts) are plain `productsAPI.list(params)` style
 * functions that do not accept a signal, so those cancellations never reached
 * the network: an obsolete product search kept running and still counted against
 * the rate limit.
 *
 *   runWithSignal(signal, () => productsAPI.search(q))
 *
 * sets the signal for the *synchronous* part of the callback. http.ts' request
 * guard (requestGuard.ts) reads it when axios dispatches the request — which axios
 * does synchronously because all request interceptors are marked `synchronous`.
 * A request that already carries an explicit `signal` keeps it. If the callback
 * awaits something before calling http, the signal is simply not attached (safe no-op).
 */
let current: AbortSignal | undefined

export function runWithSignal<T>(signal: AbortSignal | undefined, fn: () => T): T {
  const prev = current
  current = signal
  try {
    return fn()
  } finally {
    current = prev
  }
}

export function getAmbientSignal(): AbortSignal | undefined {
  return current
}
