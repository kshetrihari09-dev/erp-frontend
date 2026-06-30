/**
 * CloudStorageTab.tsx
 *
 * Settings → Cloud Storage
 *
 * Lets the user connect/disconnect Google Drive, OneDrive, and Dropbox
 * for future automatic document backup. Only manages the connection
 * (OAuth, account info, folder name, auto-upload toggle, default
 * provider) — no documents are uploaded by this screen.
 *
 * This is a self-contained module: it does not import from, or get
 * imported by, any existing accounting feature. Removing this file and
 * its tab entry from SettingsPage.tsx fully removes the feature.
 */
import { useEffect, useState } from 'react'
import { Cloud, CheckCircle2, XCircle, RefreshCw, Link2, Unlink, Star, Clock, Loader2 } from 'lucide-react'
import { cloudStorageAPI, type CloudStorageConnection } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Card, Button, ToggleSwitch, ConfirmDialog, Badge } from '@/components/ui'
import { fmtDateTime } from '@/utils'

// Simple inline brand marks so we don't depend on external logo assets
// or any third-party trademarked image files.
function ProviderLogo({ logoKey }: { logoKey: string }) {
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    google_drive: { bg: '#E8F0FE', fg: '#1A73E8', label: 'GD' },
    onedrive:     { bg: '#E6F1FC', fg: '#0364B8', label: 'OD' },
    dropbox:      { bg: '#E6F0FF', fg: '#0061FF', label: 'DB' },
  }
  const p = palette[logoKey] || { bg: '#F1F1F1', fg: '#666', label: '☁' }
  return (
    <div
      className="flex items-center justify-center rounded-lg font-bold text-sm flex-shrink-0"
      style={{ width: 40, height: 40, background: p.bg, color: p.fg }}
    >
      {p.label}
    </div>
  )
}

function StatusPill({ status }: { status: CloudStorageConnection['status'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <CheckCircle2 size={14} /> Connected
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
        <XCircle size={14} /> Reauthorization needed
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
        <XCircle size={14} /> Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-4)]">
      <XCircle size={14} /> Not Connected
    </span>
  )
}

function ProviderCard({ conn, onChanged }: { conn: CloudStorageConnection; onChanged: () => void }) {
  const { success, error } = useUIStore()
  const [connecting, setConnecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [savingFolder, setSavingFolder] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [folderName, setFolderName] = useState(conn.folderName)

  useEffect(() => { setFolderName(conn.folderName) }, [conn.folderName])

  const isConnected = conn.status === 'connected'
  const needsReauth = conn.status === 'expired' || conn.status === 'error'

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const r = await cloudStorageAPI.connect(conn.provider)
      const authUrl = r.data.data?.authUrl
      if (authUrl) {
        // Full-page redirect through the provider's consent screen; the
        // backend redirects back to /settings/cloud-storage when done.
        window.location.href = authUrl
      }
    } catch (e: any) {
      error('Could not start connection', e?.response?.data?.message || e.message)
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await cloudStorageAPI.disconnect(conn.provider)
      success(`${conn.label} disconnected`)
      onChanged()
    } catch (e: any) {
      error('Disconnect failed', e?.response?.data?.message || e.message)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await cloudStorageAPI.testConnection(conn.provider)
      success('Connection test passed', `${conn.label} is reachable and authorized.`)
      onChanged()
    } catch (e: any) {
      error('Connection test failed', e?.response?.data?.message || e.message)
    } finally {
      setTesting(false)
    }
  }

  const handleFolderSave = async () => {
    setSavingFolder(true)
    try {
      await cloudStorageAPI.updateSettings(conn.provider, { folderName })
      success('Folder updated')
      onChanged()
    } catch (e: any) {
      error('Could not update folder', e?.response?.data?.message || e.message)
    } finally {
      setSavingFolder(false)
    }
  }

  const handleAutoUploadToggle = async (val: boolean) => {
    try {
      await cloudStorageAPI.updateSettings(conn.provider, { autoUploadEnabled: val })
      onChanged()
    } catch (e: any) {
      error('Could not update setting', e?.response?.data?.message || e.message)
    }
  }

  const handleSetDefault = async () => {
    try {
      await cloudStorageAPI.setDefault(conn.provider)
      success(`${conn.label} set as default storage provider`)
      onChanged()
    } catch (e: any) {
      error('Could not set default', e?.response?.data?.message || e.message)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProviderLogo logoKey={conn.logoKey} />
          <div>
            <div className="font-bold text-sm flex items-center gap-2">
              {conn.label}
              {conn.isDefault && (
                <Badge className="!bg-amber-50 !text-amber-700 inline-flex items-center gap-1">
                  <Star size={11} /> Default
                </Badge>
              )}
            </div>
            <StatusPill status={conn.status} />
          </div>
        </div>
      </div>

      {isConnected && (
        <div className="text-xs text-[var(--text-3)] space-y-1 border-t border-[var(--border)] pt-3">
          <div><span className="font-semibold text-[var(--text-2)]">Account:</span> {conn.accountEmail || '—'}</div>
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span className="font-semibold text-[var(--text-2)]">Last sync:</span>{' '}
            {conn.lastSyncAt ? fmtDateTime(conn.lastSyncAt) : 'Never (uploads not yet enabled)'}
          </div>
        </div>
      )}

      {needsReauth && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {conn.lastErrorMessage || 'Your authorization has expired. Please reconnect.'}
        </div>
      )}

      {isConnected && (
        <div className="space-y-3 border-t border-[var(--border)] pt-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
              Backup folder name
            </label>
            <div className="flex gap-2">
              <input
                className="erp-input flex-1"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Accounting Documents"
              />
              <Button size="sm" variant="secondary" disabled={savingFolder || folderName === conn.folderName} onClick={handleFolderSave}>
                {savingFolder ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>

          <ToggleSwitch
            checked={conn.autoUploadEnabled}
            onChange={handleAutoUploadToggle}
            label="Automatic document upload (coming soon)"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        {!isConnected && !needsReauth && (
          <Button size="sm" onClick={handleConnect} disabled={connecting || !conn /* always defined */}>
            {connecting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Link2 size={14} className="mr-1" />}
            Connect
          </Button>
        )}
        {needsReauth && (
          <Button size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
            Reconnect
          </Button>
        )}
        {isConnected && (
          <>
            <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
              Test connection
            </Button>
            {!conn.isDefault && (
              <Button size="sm" variant="secondary" onClick={handleSetDefault}>
                <Star size={14} className="mr-1" /> Set as default
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setConfirmDisconnect(true)}>
              <Unlink size={14} className="mr-1" /> Disconnect
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={handleDisconnect}
        title={`Disconnect ${conn.label}?`}
        message="Your account will be unlinked and stored tokens removed. You can reconnect anytime."
        danger
      />
    </Card>
  )
}

export default function CloudStorageTab() {
  const { error } = useUIStore()
  const [connections, setConnections] = useState<CloudStorageConnection[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const r = await cloudStorageAPI.connections()
      setConnections(r.data.data || [])
    } catch (e: any) {
      error('Could not load cloud storage settings', e?.response?.data?.message || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Surface OAuth redirect results (status=connected|error in the URL,
    // set by the backend after the provider redirects back).
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status')
    if (status) {
      const provider = params.get('provider')
      if (status === 'connected') {
        useUIStore.getState().success('Cloud storage connected', provider ? `${provider} is now connected.` : undefined)
      } else if (status === 'error') {
        useUIStore.getState().error('Connection failed', params.get('message') || undefined)
      }
      // Clean the query string so a refresh doesn't re-trigger the toast.
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return <div className="p-8 text-center text-[var(--text-4)]">Loading…</div>
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Cloud size={18} className="text-brand" />
        </div>
        <div>
          <div className="font-bold text-sm">Cloud Storage</div>
          <p className="text-xs text-[var(--text-3)] mt-0.5 max-w-xl">
            Connect a cloud storage provider for document backup. Once connected, you'll be able to
            enable automatic backup of invoices, purchase bills, journal entries, and receipts in a
            future update — no documents are uploaded yet.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {connections?.map((conn) => (
          <ProviderCard key={conn.provider} conn={conn} onChanged={load} />
        ))}
      </div>

      {!connections?.length && (
        <div className="text-sm text-[var(--text-4)] text-center py-8">No providers available.</div>
      )}
    </div>
  )
}
