/**
 * modules/customer/selectedStore.ts — Customer Product Ordering module.
 *
 * Remembers which store a customer picked on /store, purely so a
 * *returning* customer doesn't have to pick it again (spec: "Main Page →
 * Previously selected Store → Login/Continue → Storefront"). This is
 * NOT a source of authorization or company scoping — it only ever feeds
 * back into a normal `?store=<slug>` URL, the same public, unauthenticated
 * mechanism StorefrontContext.tsx already resolves through GET
 * /storefront/config. The backend re-derives and enforces the real
 * company scope from the customer's JWT on every request after login
 * (middleware/customerAuth.js) — this file has no security role
 * whatsoever, same as the ?store= URL param it mirrors.
 */
const KEY = 'erp_customer_selected_store'

export interface RememberedStore {
  name: string
  logo: string | null
  storefront_code: string
}

export function getRememberedStore(): RememberedStore | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.storefront_code ? parsed : null
  } catch {
    return null
  }
}

export function setRememberedStore(store: RememberedStore) {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* storage unavailable — non-fatal, just re-prompts next time */ }
}

export function clearRememberedStore() {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}
