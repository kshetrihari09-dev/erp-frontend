/**
 * The fiscal year the user has SELECTED — held in memory so the (synchronous) request interceptor can attach it to every
 * API call as `X-Fiscal-Year-Id`. The SERVER is the source of truth: it persists the choice per user + company and
 * validates the id on every request (an id that is not this company's is a 404, never silently swapped for another year).
 * Nothing here ever derives the year from a voucher date.
 */
type Listener = (id: string | null) => void

let selectedId: string | null = null
const listeners = new Set<Listener>()

export const getSelectedFiscalYearId = (): string | null => selectedId

export function setSelectedFiscalYearId(id: string | null): void {
  if (id === selectedId) return
  selectedId = id
  listeners.forEach((l) => l(id))
}

export function subscribeSelectedFiscalYear(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
