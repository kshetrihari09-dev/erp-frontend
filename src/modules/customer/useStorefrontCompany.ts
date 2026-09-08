import { useSearchParams } from 'react-router-dom'
import { config } from '@/config/env'

// Mirrors the backend's UUID_RE in routes/customerAuth.js. Checking the
// shape here — not just presence — means a stale/mistyped `?company=`
// link or a copy-pasted-wrong VITE_STOREFRONT_COMPANY_ID fails instantly
// with a clear message instead of round-tripping to the API just to get
// back "Store not found."
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Single source of truth for "which company's catalog is this storefront
 * showing", used by Register, Login (and, transitively, everything past
 * login via the JWT — see middleware/customerAuth.js on the backend,
 * which re-derives req.companyId from the account, never trusting a
 * client-supplied value again after login).
 *
 * Resolution order:
 *   1. `?company=<uuid>` — explicit override, e.g. a QR code or link
 *      pointed at a specific tenant, or testing multiple tenants against
 *      one build without a rebuild.
 *   2. VITE_STOREFRONT_COMPANY_ID — baked in at build time for a
 *      single-store deployment (see .env.example / .env.production).
 *
 * There is, as of this phase, no third mechanism (subdomain/slug-based
 * multi-tenant resolution) implemented anywhere in this codebase — see
 * config/env.ts's docblock on STOREFRONT_COMPANY_ID. Rather than invent
 * one here (which would mean guessing at a company), an unresolved or
 * malformed id surfaces as a clear configuration error so the admin can
 * fix the actual deployment config instead of a customer silently being
 * sent to registration with an empty/garbage company_id.
 */
export type StorefrontCompanyStatus = 'ok' | 'missing' | 'invalid'

export function useStorefrontCompany() {
  const [params] = useSearchParams()
  const raw = (params.get('company') || config.storefrontCompanyId || '').trim()

  if (!raw) {
    return { companyId: '', status: 'missing' as StorefrontCompanyStatus, missing: true, invalid: false }
  }
  if (!UUID_RE.test(raw)) {
    return { companyId: '', status: 'invalid' as StorefrontCompanyStatus, missing: false, invalid: true }
  }
  return { companyId: raw, status: 'ok' as StorefrontCompanyStatus, missing: false, invalid: false }
}
