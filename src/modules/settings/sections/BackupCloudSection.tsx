import { useState } from 'react'
import { HardDriveDownload, RefreshCw, ShieldCheck, ShieldAlert, Download, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useBackups, useRunBackup, useVerifyBackup } from '@/hooks/useQuery'
import { usePreferenceSection } from '../hooks/usePreferenceSection'
import { settingsAPI } from '@/services/api'
import { Button, Select, ToggleSwitch, SkeletonRows, Empty } from '@/components/ui'
import { fmtDateTime } from '@/utils'
import type { Backup } from '@/types'
import CloudStorageTab from '../CloudStorageTab'

function fmtBytes(n?: number | null) {
  if (!n) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

function StatusBadge({ status }: { status: Backup['status'] }) {
  if (status === 'success') return <span className="badge badge-green inline-flex items-center gap-1"><CheckCircle2 size={12}/> Success</span>
  if (status === 'failed')  return <span className="badge badge-red inline-flex items-center gap-1"><XCircle size={12}/> Failed</span>
  return <span className="badge badge-blue inline-flex items-center gap-1"><Clock size={12}/> Pending</span>
}

function LocalBackupPanel() {
  const { data, isLoading } = useBackups({ page: 1, limit: 10 })
  const rows = (data?.data as Backup[]) || []
  const runBackup = useRunBackup()
  const verifyBackup = useVerifyBackup()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const { form, set, save, saving, loading, dialog } = usePreferenceSection('backup', 'Backup schedule saved')

  const last = rows.find(b => b.status === 'success')

  async function handleDownload(backup: Backup) {
    setDownloadingId(backup.id)
    try {
      const res = await settingsAPI.downloadBackup(backup.id)
      const blob = res.data as unknown as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = backup.file_name || `${backup.id}.json.gz`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-card mb-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-bold text-sm">Local Backup</div>
          <p className="text-xs text-[var(--text-4)] mt-0.5">
            {last
              ? <>Last successful backup: <b>{fmtDateTime(last.created_at)}</b> ({fmtBytes(last.size_bytes)})</>
              : 'No successful backup yet.'}
          </p>
        </div>
        <Button variant="primary" size="sm" icon={<HardDriveDownload size={14}/>} loading={runBackup.isPending} onClick={() => runBackup.mutate()}>
          Run Backup Now
        </Button>
      </div>

      {!loading && form && (
        <div className="flex flex-wrap items-center gap-4 border-t border-b border-[var(--border)] py-3 mb-3">
          <ToggleSwitch checked={form.autoEnabled} onChange={v => set('autoEnabled', v)} label="Automatic backup" />
          <Select
            className="max-w-[160px]"
            value={form.frequency}
            onChange={e => set('frequency', e.target.value as any)}
            options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
            disabled={!form.autoEnabled}
          />
          <Button variant="secondary" size="sm" loading={saving} onClick={save}>Save Schedule</Button>
        </div>
      )}

      <div className="table-card">
        <div className="overflow-x-auto stp-desktop-table">
          <table className="erp-table">
            <thead><tr><th>Created</th><th>Type</th><th>Status</th><th>Size</th><th>Verified</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : rows.length
                  ? rows.map(b => (
                      <tr key={b.id}>
                        <td className="td-mono">{fmtDateTime(b.created_at)}</td>
                        <td className="capitalize">{b.type}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className="td-mono">{fmtBytes(b.size_bytes)}</td>
                        <td>{b.verified
                          ? <span className="badge badge-green inline-flex items-center gap-1"><ShieldCheck size={12}/> Verified</span>
                          : <span className="badge badge-blue inline-flex items-center gap-1"><ShieldAlert size={12}/> Unverified</span>}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" disabled={b.status !== 'success'} loading={downloadingId === b.id} icon={<Download size={12}/>} onClick={() => handleDownload(b)}>Download</Button>
                            <Button variant="secondary" size="sm" disabled={b.status !== 'success'} loading={verifyBackup.isPending} icon={<RefreshCw size={12}/>} onClick={() => verifyBackup.mutate(b.id)}>Verify</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No backups yet. Click 'Run Backup Now' to create one."/></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      {dialog}
    </div>
  )
}

export default function BackupCloudSection() {
  return (
    <div>
      <LocalBackupPanel />
      <CloudStorageTab />
    </div>
  )
}
