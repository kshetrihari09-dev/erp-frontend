/**
 * services/discovery.ts
 *
 * "Automatic LAN discovery" from inside a plain web page / Capacitor
 * webview, honestly scoped: browsers cannot send or receive raw UDP (no
 * API for it), so the real broadcast responder the backend runs
 * (erp-unified-backend/src/services/lanDiscovery.js) isn't reachable from
 * here. What IS reachable, and what this module actually does:
 *
 *   1. Work out this device's own LAN IP via the standard WebRTC
 *      ICE-candidate trick (creating an RTCPeerConnection and reading the
 *      host candidate reveals a private IP even for a page loaded from a
 *      remote origin) — gives us the subnet to sweep, e.g. "192.168.1.".
 *   2. Fire a bounded, parallel HTTP probe at GET {candidate}/api/v1/
 *      discovery/info for a range of hosts on that subnet, short timeout
 *      per host, reporting each responder as it answers (not waiting for
 *      the whole sweep) so the UI can show servers appearing live.
 *   3. Always probe window.location.hostname first (fast path: the
 *      frontend itself is often served BY the same LAN PC running the
 *      backend, e.g. the .env.development LAN setup already documented
 *      in this project) and the build-time config.backendUrl host too.
 *
 * A full 1-254 sweep is inherently a bit slow/noisy over plain fetch; this
 * is the best available mechanism without adding a native UDP dependency
 * (see the backend file above for the fuller tradeoff explanation).
 */
import { config } from '@/config/env'

export interface DiscoveredServer {
  host: string
  port: number
  https: boolean
  baseUrl: string
  name: string
  version?: string
}

const PROBE_TIMEOUT_MS = 900
const SWEEP_CONCURRENCY = 24
const DEFAULT_PORTS = [Number(config.backendPort) || 5000]

async function probeHost(host: string, port: number, https: boolean, signal: AbortSignal): Promise<DiscoveredServer | null> {
  const proto = https ? 'https' : 'http'
  const base = `${proto}://${host}:${port}`
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort)
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/v1/discovery/info`, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    const info = json?.data
    if (!info?.name) return null
    return { host, port, https, baseUrl: `${base}/api/v1`, name: info.name, version: info.version }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

/** Best-effort own-LAN-IP detection via WebRTC host candidates. Returns
 *  null (never throws) if the browser blocks it (some privacy settings/
 *  older WebViews do) — callers fall back to hostname-only probing. */
function detectOwnLanIp(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const RTCPeerConnection = window.RTCPeerConnection
      if (!RTCPeerConnection) return resolve(null)
      const pc = new RTCPeerConnection({ iceServers: [] })
      let resolved = false
      const finish = (ip: string | null) => {
        if (resolved) return
        resolved = true
        try { pc.close() } catch { /* ignore */ }
        resolve(ip)
      }
      pc.createDataChannel('')
      pc.onicecandidate = (e) => {
        if (!e.candidate) { finish(null); return }
        const match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(e.candidate.candidate)
        if (match && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(match[1])) {
          finish(match[1])
        }
      }
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => finish(null))
      setTimeout(() => finish(null), 1500)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Sweeps the local subnet, calling onFound as each server responds.
 * Returns once the sweep is complete (or aborted via `signal`).
 */
export async function discoverLanServers(
  onFound: (server: DiscoveredServer) => void,
  signal: AbortSignal
): Promise<void> {
  const seen = new Set<string>()
  const report = (s: DiscoveredServer | null) => {
    if (!s || signal.aborted) return
    const key = `${s.host}:${s.port}`
    if (seen.has(key)) return
    seen.add(key)
    onFound(s)
  }

  // Fast path: the host this page itself was loaded from, and the
  // build-time configured backend host, are overwhelmingly the most
  // likely answer — check them first, before the slow full sweep.
  const fastHosts = new Set<string>()
  if (typeof window !== 'undefined' && /^(192\.168\.|10\.|172\.)/.test(window.location.hostname)) {
    fastHosts.add(window.location.hostname)
  }
  try {
    const backendHost = new URL(config.backendUrl).hostname
    if (/^(192\.168\.|10\.|172\.)/.test(backendHost)) fastHosts.add(backendHost)
  } catch { /* ignore malformed config */ }

  for (const host of fastHosts) {
    for (const port of DEFAULT_PORTS) {
      // eslint-disable-next-line no-await-in-loop
      report(await probeHost(host, port, false, signal))
    }
  }
  if (signal.aborted) return

  const ownIp = await detectOwnLanIp()
  if (!ownIp || signal.aborted) return
  const prefix = ownIp.split('.').slice(0, 3).join('.') + '.'

  const hosts: string[] = []
  for (let i = 1; i <= 254; i++) hosts.push(`${prefix}${i}`)

  for (let i = 0; i < hosts.length; i += SWEEP_CONCURRENCY) {
    if (signal.aborted) return
    const batch = hosts.slice(i, i + SWEEP_CONCURRENCY)
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.flatMap((host) => DEFAULT_PORTS.map((port) => probeHost(host, port, false, signal)))
    )
    results.forEach(report)
  }
}

/** Used by both the manual-IP form and QR-derived URLs to confirm a
 *  candidate is actually reachable and is a Byapar server before saving it. */
export async function probeServerUrl(baseUrl: string): Promise<DiscoveredServer | null> {
  try {
    const url = new URL(baseUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS * 2)
    try {
      const res = await fetch(`${url.protocol}//${url.host}/api/v1/discovery/info`, { signal: controller.signal, cache: 'no-store' })
      if (!res.ok) return null
      const json = await res.json()
      const info = json?.data
      if (!info?.name) return null
      return {
        host: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        https: url.protocol === 'https:',
        baseUrl,
        name: info.name,
        version: info.version,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}
