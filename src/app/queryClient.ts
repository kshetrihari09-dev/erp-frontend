import { QueryClient } from '@tanstack/react-query'

// A 4xx means the request itself won't succeed on retry (bad params, no
// permission, not found, or — 429 — the server explicitly asking to
// slow down); retrying it immediately just adds another request on top
// of whatever caused the problem. Only worth retrying once for a
// transient network blip or a 5xx, which react-query's default
// (exponential) retryDelay already backs off before attempting.
function shouldRetryQuery(failureCount: number, error: unknown) {
  const status = (error as { status?: number } | null)?.status
  if (status && status >= 400 && status < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 2,   // 2 min
      gcTime:             1000 * 60 * 10,  // 10 min
      retry:              shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
