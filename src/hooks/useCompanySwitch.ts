/**
 * useCompanySwitch.ts
 *
 * Switching companies re-issues a JWT scoped to the new company_id, so
 * every existing API call (unchanged) is automatically scoped correctly
 * from the very next request. On top of that we:
 *
 *   1. Swap the stored token/refresh-token/user/company into authStore.
 *   2. Clear the React Query cache, so nothing already-fetched under the
 *      previous company can render under the new one.
 *   3. Hard-reload to the dashboard.
 *
 * Step 3 is deliberate, not laziness: several pages in this app fetch data
 * via plain axios + useEffect (not React Query), and may hold component
 * state or in-flight requests tied to the previous company. A full reload
 * is the only way to guarantee zero cross-company leakage everywhere,
 * which is the explicit, non-negotiable requirement here — "never show
 * transactions or balances from another company".
 */
import { queryClient } from '@/app/queryClient'
import { companiesAPI } from '@/services/api'
import useAuthStore, { RAW_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/store/authStore'
import { PATHS } from '@/constants'

export async function switchCompany(companyId: string): Promise<void> {
  const res = await companiesAPI.switchTo(companyId)
  const { token, refresh_token, user, company } = res.data.data

  localStorage.setItem(RAW_TOKEN_KEY, token)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token)
  useAuthStore.getState().setAuth({ token, user, company })

  queryClient.clear()
  window.location.href = PATHS.DASHBOARD
}
