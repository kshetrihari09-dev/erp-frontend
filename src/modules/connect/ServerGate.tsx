/**
 * modules/connect/ServerGate.tsx
 *
 * The App Start → "Saved Server?" branch from the spec:
 *   - No saved server  → render ServerConnectScreen (find/scan/enter + pair)
 *   - Saved server     → test it; if reachable, render the app as normal;
 *                        if not, show "Server unavailable" with
 *                        Retry / Find Another Server / Change Server
 *
 * Only active in LAN-mode builds (config.lanMode) — a normal cloud build
 * (frontend pointed at one fixed hosted backend) never renders this at
 * all, so this can't add a screen or a delay to existing deployments. See
 * config/env.ts / config/serverConnection.ts for the full reasoning.
 *
 * Deliberately does NOT auto-switch to a different discovered server when
 * the saved one is unreachable (requirement #11 — "do not silently switch
 * to another server", "prevent accidental connection to a different
 * company's server") — the person must explicitly choose Retry / Find
 * Another / Change Server.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ServerOff, RefreshCw, Search, LogOut } from 'lucide-react'
import { Card, Button } from '@/components/ui'
import { config } from '@/config/env'
import { getSavedServer, clearSavedServer, type SavedServer } from '@/config/serverConnection'
import { probeServerUrl } from '@/services/discovery'
import ServerConnectScreen from './ServerConnectScreen'

type Status = 'checking' | 'ok' | 'unreachable' | 'none'

export default function ServerGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(config.lanMode ? 'checking' : 'ok')
  const [saved, setSaved] = useState<SavedServer | null>(null)
  const [forceConnect, setForceConnect] = useState(false)

  const testSaved = useCallback(async () => {
    const server = getSavedServer()
    setSaved(server)
    if (!server) { setStatus('none'); return }
    setStatus('checking')
    const found = await probeServerUrl(server.baseUrl)
    setStatus(found ? 'ok' : 'unreachable')
  }, [])

  useEffect(() => {
    if (!config.lanMode) return
    void testSaved()
  }, [testSaved])

  if (!config.lanMode) return <>{children}</>

  if (forceConnect || status === 'none') {
    return <ServerConnectScreen onConnected={() => { setForceConnect(false); void testSaved() }} />
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-2)]">
        <div className="flex items-center gap-2 text-sm text-[var(--text-3)]">
          <RefreshCw size={16} className="animate-spin" /> Connecting to {saved?.name || 'server'}…
        </div>
      </div>
    )
  }

  if (status === 'unreachable') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-2)] p-4">
        <div className="w-full max-w-sm">
          <Card>
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                <ServerOff size={22} />
              </div>
              <div>
                <p className="font-semibold text-[var(--text)]">Server unavailable</p>
                <p className="text-sm text-[var(--text-4)] mt-1">
                  Couldn't reach <span className="font-medium">{saved?.name}</span>{saved ? ` (${new URL(saved.baseUrl).host})` : ''}.
                  Make sure the server PC is on and this device is on the same network.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full pt-2">
                <Button variant="primary" onClick={() => void testSaved()}>
                  <RefreshCw size={14} /> Retry
                </Button>
                <Button variant="secondary" onClick={() => setForceConnect(true)}>
                  <Search size={14} /> Find Another Server
                </Button>
                <Button variant="ghost" onClick={() => { clearSavedServer(); setForceConnect(true) }}>
                  <LogOut size={14} /> Change Server
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
