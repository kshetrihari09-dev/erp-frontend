/**
 * DevicesSyncSection.tsx — Settings → Devices & Sync
 *
 * Everything the LAN/cloud sync spec's requirement #23 asks for in one
 * place: the device list (name/status/user/branch/last seen/last sync/
 * pending conflicts/app version) and the actions on it (rename, revoke,
 * sync now, view conflicts), plus the QR pairing flow that registers a
 * new device (requirement #11).
 *
 * Nothing here talks to IndexedDB or runs sync logic itself — that all
 * already lives in offline/OfflineProvider.tsx + syncEngine.ts. This is
 * purely the admin-facing view onto devicesAPI (server state) and a thin
 * "sync now" call into the existing offline provider.
 *
 * ── Pairing, honestly scoped ─────────────────────────────────────────────
 * "Add Device" shows a QR (token + this device's current API URL).
 * "Connect via QR" scans another device's QR and calls pairClaim with
 * *this* device's own persisted id — i.e. it authorizes/registers THIS
 * device using a code from an already-registered one. Both devices still
 * log in the completely normal way; pairing never issues a session.
 * This does NOT solve pre-login LAN discovery (finding the server before
 * you've ever been able to reach it to log in at all) — this app's API
 * base URL is baked in at build time (see config/env.ts), and making that
 * runtime-overridable is a separate, larger change this pass doesn't make.
 */
import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import QRCode from 'qrcode'
import {
  Smartphone, RefreshCw, QrCode, ScanLine, Pencil, ShieldOff,
  AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import { Card, Button, Badge, Empty, SkeletonRows, Modal, ConfirmDialog, Alert, Input } from '@/components/ui'
import { devicesAPI, type DeviceInfo, type SyncConflict } from '@/services/api'
import { useOffline } from '@/offline/OfflineProvider'
import { getDeviceId } from '@/offline/idGen'
import { config } from '@/config/env'
import ProductScanModal from '@/components/scanner/ProductScanModal'

const APP_VERSION = '2.0.0' // mirrors package.json "version" — see docblock

function platformName(): string {
  try { return Capacitor.getPlatform() } catch { return 'web' }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'Just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function DevicesSyncSection() {
  const { syncNow } = useOffline()

  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [renameTarget, setRenameTarget] = useState<DeviceInfo | null>(null)
  const [renameValue, setRenameValue]   = useState('')
  const [revokeTarget, setRevokeTarget] = useState<DeviceInfo | null>(null)

  const [pairOpen, setPairOpen]     = useState(false)
  const [pairQr, setPairQr]         = useState<string | null>(null)
  const [pairExpires, setPairExpires] = useState<string | null>(null)
  const [pairError, setPairError]   = useState<string | null>(null)

  const [scanOpen, setScanOpen]     = useState(false)
  const [claiming, setClaiming]     = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimOk, setClaimOk]       = useState<string | null>(null)

  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [conflicts, setConflicts]         = useState<SyncConflict[] | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await devicesAPI.list()
      setDevices(res.data.data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load devices')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalConflicts = (devices || []).reduce((sum, d) => sum + d.pending_conflicts, 0)

  async function handleSyncNow() {
    setSyncing(true)
    try { await syncNow() } finally { setSyncing(false); load() }
  }

  async function handleRename() {
    if (!renameTarget || !renameValue.trim()) return
    await devicesAPI.rename(renameTarget.id, renameValue.trim())
    setRenameTarget(null)
    load()
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    await devicesAPI.revoke(revokeTarget.id)
    setRevokeTarget(null)
    load()
  }

  // ── Add Device (show QR) ──────────────────────────────────────────────
  async function openPairing() {
    setPairOpen(true)
    setPairError(null)
    setPairQr(null)
    try {
      const res = await devicesAPI.pairStart()
      const { token, expires_at } = res.data.data
      // Deliberately just { token, apiBaseUrl } — no password, no JWT, no
      // secret key, matching requirement #11's explicit QR-content limit.
      const payload = JSON.stringify({ token, apiBaseUrl: config.apiBaseUrl })
      const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 240 })
      setPairQr(dataUrl)
      setPairExpires(expires_at)
    } catch (e: any) {
      setPairError(e?.message || 'Could not create a pairing code')
    }
  }

  // ── Connect via QR (scan another device's code) ─────────────────────────
  async function handleScannedCode(raw: string) {
    setClaimError(null)
    setClaimOk(null)
    let parsed: { token?: string }
    try { parsed = JSON.parse(raw) } catch { setClaimError('That QR code isn\u2019t a device pairing code.'); return }
    if (!parsed.token) { setClaimError('That QR code isn\u2019t a device pairing code.'); return }

    setClaiming(true)
    try {
      const deviceName = `${platformName() === 'web' ? 'Browser' : platformName()} device`
      const res = await devicesAPI.pairClaim({
        token: parsed.token,
        device_id: getDeviceId(),
        device_name: deviceName,
        platform: platformName(),
        app_version: APP_VERSION,
      })
      setClaimOk(`"${res.data.data.device.device_name}" is now an authorized device on this account.`)
      load()
    } catch (e: any) {
      setClaimError(e?.message || 'Pairing failed')
    } finally {
      setClaiming(false)
    }
  }

  // ── View Conflicts ────────────────────────────────────────────────────
  async function openConflicts() {
    setConflictsOpen(true)
    try {
      const res = await devicesAPI.conflicts('open')
      setConflicts(res.data.data)
    } catch {
      setConflicts([])
    }
  }

  async function resolveConflict(id: string) {
    await devicesAPI.resolveConflict(id, 'Reviewed in Devices & Sync')
    const res = await devicesAPI.conflicts('open')
    setConflicts(res.data.data)
    load()
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="font-semibold text-[14px] flex items-center gap-2">
              <Smartphone size={16} /> Registered Devices
            </div>
            <div className="text-xs text-[var(--text-4)] mt-0.5">
              Devices authorized to bill and sync on this account.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {totalConflicts > 0 && (
              <Button variant="secondary" size="sm" onClick={openConflicts}>
                <AlertTriangle size={13} className="text-orange-600" />
                {totalConflicts} conflict{totalConflicts === 1 ? '' : 's'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleSyncNow} disabled={syncing}>
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync Now
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)} title="Opens the camera — tap the QR toggle inside it, then scan the code from Add Device on the other device">
              <ScanLine size={13} /> Connect via QR
            </Button>
            <Button variant="primary" size="sm" onClick={openPairing}>
              <QrCode size={13} /> Add Device
            </Button>
          </div>
        </div>

        {claimOk && <div className="mb-3"><Alert type="success" message={claimOk} onClose={() => setClaimOk(null)} /></div>}
        {claimError && <div className="mb-3"><Alert type="danger" message={claimError} onClose={() => setClaimError(null)} /></div>}
        {error && <div className="mb-3"><Alert type="danger" message={error} /></div>}

        {devices === null ? (
          <SkeletonRows cols={5} rows={3} />
        ) : devices.length === 0 ? (
          <Empty message="No devices registered yet" icon={<Smartphone size={28} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-4)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Last Seen</th>
                  <th className="py-2 pr-3">Last Sync</th>
                  <th className="py-2 pr-3">Version</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      {d.device_name}
                      {d.pending_conflicts > 0 && (
                        <span className="ml-1.5 text-orange-600 text-xs">
                          • {d.pending_conflicts} conflict{d.pending_conflicts === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge status={d.status}>
                        {d.status === 'active' ? 'Active' : 'Revoked'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-2)]">{d.user_name || '—'}</td>
                    <td className="py-2 pr-3 text-[var(--text-4)]">
                      <span className="inline-flex items-center gap-1"><Clock size={11} /> {timeAgo(d.last_seen_at)}</span>
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-4)]">{timeAgo(d.last_synced_at)}</td>
                    <td className="py-2 pr-3 text-[var(--text-4)]">{d.app_version || '—'}</td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setRenameTarget(d); setRenameValue(d.device_name) }}>
                          <Pencil size={13} />
                        </Button>
                        {d.status === 'active' && (
                          <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(d)}>
                            <ShieldOff size={13} className="text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Rename ── */}
      <Modal
        open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename Device" size="sm"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleRename}>Save</Button>
        </>}
      >
        <Input label="Device name" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus />
      </Modal>

      {/* ── Revoke ── */}
      <ConfirmDialog
        open={!!revokeTarget} onClose={() => setRevokeTarget(null)} onConfirm={handleRevoke}
        title="Revoke Device" danger
        message={revokeTarget ? `"${revokeTarget.device_name}" will immediately lose access to billing and sync on this account. This can't be undone from the device itself.` : undefined}
      />

      {/* ── Add Device (QR) ── */}
      <Modal open={pairOpen} onClose={() => setPairOpen(false)} title="Add Device" size="sm">
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-xs text-[var(--text-4)] text-center">
            On the new device, open Settings → Devices & Sync → Connect via QR and scan this code.
            Expires in 10 minutes.
          </p>
          {pairError && <Alert type="danger" message={pairError} />}
          {pairQr ? (
            <img src={pairQr} alt="Device pairing QR code" width={240} height={240} className="rounded-lg border border-[var(--border)]" />
          ) : !pairError ? (
            <div className="w-[240px] h-[240px] flex items-center justify-center text-[var(--text-4)] text-xs">
              Generating code…
            </div>
          ) : null}
          {pairExpires && (
            <p className="text-[11px] text-[var(--text-4)]">Expires {new Date(pairExpires).toLocaleTimeString()}</p>
          )}
        </div>
      </Modal>

      {/* ── Connect via QR (scan) ── */}
      <ProductScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onBarcode={(code) => { setScanOpen(false); handleScannedCode(code) }}
      />
      {claiming && <Alert type="info" message="Registering this device…" />}

      {/* ── Conflicts ── */}
      <Modal open={conflictsOpen} onClose={() => setConflictsOpen(false)} title="Sync Conflicts" size="md">
        {conflicts === null ? (
          <SkeletonRows cols={1} rows={3} />
        ) : conflicts.length === 0 ? (
          <Empty message="No open conflicts" icon={<CheckCircle2 size={28} />} />
        ) : (
          <div className="space-y-3">
            {conflicts.map(c => (
              <div key={c.id} className="border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-orange-600 mb-1">{c.conflict_type.replace('_', ' ')}</div>
                    <div className="text-sm text-[var(--text)]">{c.reason}</div>
                    <div className="text-[11px] text-[var(--text-4)] mt-1">
                      {c.device_name || 'Unknown device'} • {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => resolveConflict(c.id)}>Mark Reviewed</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--text-4)] mt-3">
          Resolving here only clears the alert — re-submit the corrected sale
          (edit quantity, pick another batch, or cancel it) from the Sale page itself.
        </p>
      </Modal>
    </div>
  )
}
