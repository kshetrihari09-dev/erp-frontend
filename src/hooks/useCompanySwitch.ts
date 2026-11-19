/**
 * useCompanySwitch.ts
 *
 * Switching companies re-issues the access token scoped to the new company_id — for the SAME role-verified auth session (the
 * server keeps the session id, the verified role and the app-instance binding; a company switch can never change or skip role
 * verification). So every existing API call is automatically scoped to the new company from the very next request. On top of that:
 *
 *   1. The new tokens + user + company replace the in-memory session (authStore.replaceSession).
 *   2. In-flight queries are cancelled and the React Query cache cleared; per-session module state (step-up token, selected
 *      fiscal year) is reset.
 *   3. The whole signed-in UI tree is REMOUNTED (sessionEpoch → <Routes key>, see app/Router.tsx) and the app navigates to the
 *      dashboard — a clean slate, with no page load.
 *
 * Step 3 used to be a hard page reload, to guarantee zero cross-company leakage from component state or in-flight requests of
 * pages that fetch with plain axios + useEffect. The session now lives in memory only (it must not survive a reload — see
 * store/authStore.ts), so a reload would sign the user out; remounting everything gives the same guarantee: no component
 * from the previous company survives, and a response that arrives for an unmounted component is discarded.
 * ("Never show transactions or balances from another company" remains the non-negotiable requirement.)
 */
import { queryClient } from '@/app/queryClient'
import { companiesAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import { clearStepUpToken } from '@/services/stepUpToken'
import { setSelectedFiscalYearId } from '@/services/fiscalYearSelection'
import { navigateTo } from '@/services/navigation'
import { PATHS } from '@/constants'

export async function switchCompany(companyId: string): Promise<void> {
  const res = await companiesAPI.switchTo(companyId)
  const { token, refresh_token, user, company } = res.data.data

  await queryClient.cancelQueries()
  clearStepUpToken()
  setSelectedFiscalYearId(null)
  useAuthStore.getState().replaceSession({ token, refreshToken: refresh_token, user, company })   // bumps sessionEpoch → UI remounts
  queryClient.clear()
  navigateTo(PATHS.DASHBOARD, { replace: true })
}
