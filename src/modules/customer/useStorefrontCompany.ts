import { useSearchParams } from 'react-router-dom'
import { config } from '@/config/env'

/**
 * Which company's catalog this storefront is showing. See config/env.ts's
 * docblock on STOREFRONT_COMPANY_ID for why this exists and what's
 * intentionally NOT built yet (subdomain/slug-based multi-tenant
 * resolution). `?company=<id>` lets one build be pointed at a different
 * tenant without rebuilding — useful for testing, and a reasonable
 * stand-in until real store-resolution is designed.
 */
export function useStorefrontCompany() {
  const [params] = useSearchParams()
  const companyId = params.get('company') || config.storefrontCompanyId || ''
  return { companyId, missing: !companyId }
}
