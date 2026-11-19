/**
 * navigation.ts — lets non-React code (the HTTP client, the company switch) navigate inside the SPA without a page load.
 * A page load would drop the in-memory session, which is deliberately never persisted (see store/authStore.ts).
 * <NavigatorBridge/> in app/Router.tsx registers the router's navigate function.
 */
type Nav = (to: string, opts?: { replace?: boolean }) => void
let nav: Nav | null = null
export const registerNavigator = (fn: Nav | null) => { nav = fn }
/** SPA navigation when the router is mounted, otherwise a normal location change (e.g. before the router exists). */
export function navigateTo(to: string, opts?: { replace?: boolean }) {
  if (nav) nav(to, opts)
  else if (opts?.replace) window.location.replace(to)
  else window.location.assign(to)
}
