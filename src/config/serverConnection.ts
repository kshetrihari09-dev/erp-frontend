/**
 * config/serverConnection.ts
 *
 * The existing app has exactly ONE way to know its backend: config.apiBaseUrl,
 * baked in at build time (see config/env.ts). That's correct and unchanged
 * for a normal cloud deployment (this frontend built once, pointed at one
 * fixed hosted backend) — nothing here touches that path.
 *
 * In VITE_LAN_MODE builds there is no fixed backend: the same install needs
 * to work against whichever shop's/company's local server it's paired with.
 * This module is the one place that server address is chosen, persisted,
 * and read back — http.ts reads getEffectiveApiBaseUrl() instead of
 * config.apiBaseUrl directly so every existing API call keeps working
 * completely unchanged once a server has been selected.
 */
export interface SavedServer {
  /** Always the full API base, e.g. "http://192.168.1.7:5000/api/v1" — the
   *  same shape config.apiBaseUrl already uses everywhere else. */
  baseUrl: string
  name: string
  connectedAt: string
}

const KEY = 'byapar_server_connection'

export function getSavedServer(): SavedServer | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.baseUrl) return null
    return parsed as SavedServer
  } catch {
    return null
  }
}

export function saveServer(server: SavedServer) {
  localStorage.setItem(KEY, JSON.stringify(server))
}

/** "Change Server" / sign-out-of-this-server. Does NOT touch the user's
 *  login session (see authStore.logout for that) — this only forgets which
 *  backend to talk to, per requirement #11 ("prevent accidental connection
 *  to a different company's server" — clearing this is a deliberate,
 *  explicit action, never automatic). */
export function clearSavedServer() {
  localStorage.removeItem(KEY)
}

/** Normalizes free-form input ("192.168.1.7:5000", "192.168.1.7",
 *  "http://192.168.1.7:5000/", a full .../api/v1 URL) into the
 *  "http(s)://host:port/api/v1" shape the rest of the app expects. */
export function normalizeServerInput(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  try {
    const url = new URL(value)
    if (!url.port) url.port = '5000'
    let path = url.pathname.replace(/\/+$/, '')
    if (!path || path === '') path = '/api/v1'
    else if (!path.endsWith('/api/v1')) path = `${path}/api/v1`
    return `${url.protocol}//${url.host}${path}`
  } catch {
    return null
  }
}

/** What every API call should actually hit right now. */
export function getEffectiveApiBaseUrl(fallback: string): string {
  return getSavedServer()?.baseUrl || fallback
}
