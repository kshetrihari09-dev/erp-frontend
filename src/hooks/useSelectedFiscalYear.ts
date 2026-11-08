import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsAPI } from '@/services/api'
import { getSelectedFiscalYearId, setSelectedFiscalYearId, subscribeSelectedFiscalYear } from '@/services/fiscalYearSelection'
import useAuthStore from '@/store/authStore'
import type { FiscalYear } from '@/types'

const SELECTED_KEY = 'fiscal-year-selected'

/**
 * The fiscal year the user works in.
 *  - loaded from the server (persisted per user + company); until then no year is sent and the server's date check applies
 *  - changed ONLY by `select()` (the user's own action). A voucher date, a report or a closed year never changes it.
 *  - changing it reloads every list / report, because they are all scoped by the selected year
 */
export function useSelectedFiscalYear() {
  const qc = useQueryClient()
  const companyId = useAuthStore((s) => (s as any).company?.id ?? null)
  const authed = useAuthStore((s) => s.isAuthenticated)
  const selectedId = useSyncExternalStore(subscribeSelectedFiscalYear, getSelectedFiscalYearId, getSelectedFiscalYearId)

  const q = useQuery({
    queryKey: [SELECTED_KEY, companyId],
    enabled: !!authed && !!companyId,
    queryFn: () => settingsAPI.selectedFiscalYear().then((r: any) => r.data.data as { fiscal_year: FiscalYear | null; source: string }),
    staleTime: 60_000,
  })

  // company switch / logout: a year id of another company must never be sent
  useEffect(() => { if (!authed || !companyId) setSelectedFiscalYearId(null) }, [authed, companyId])
  useEffect(() => { setSelectedFiscalYearId(null) }, [companyId])
  useEffect(() => { if (q.data?.fiscal_year?.id) setSelectedFiscalYearId(q.data.fiscal_year.id) }, [q.data])

  const select = useCallback(async (id: string) => {
    if (id === getSelectedFiscalYearId()) return
    const res: any = await settingsAPI.setSelectedFiscalYear(id)            // server validates ownership
    const chosen = res.data.data.fiscal_year as FiscalYear
    setSelectedFiscalYearId(chosen.id)
    qc.setQueryData([SELECTED_KEY, companyId], res.data.data)
    await qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== SELECTED_KEY })   // reload data under the new year
  }, [qc, companyId])

  return { selectedId, selected: q.data?.fiscal_year ?? null, source: q.data?.source ?? null, isLoading: q.isLoading, select }
}
