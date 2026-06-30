/**
 * CloudBackupButton.tsx
 *
 * Reusable, self-contained component for uploading any generated file
 * (PDF, etc.) to the company's connected cloud storage provider.
 *
 * Deliberately decoupled from how the file is produced — it just takes
 * a Blob/File and a filename. This means it can be dropped onto any
 * existing screen (invoice, purchase bill, journal entry, receipt) as
 * a single new button, without changing how that screen builds its
 * document or print view.
 *
 * Usage:
 *   <CloudBackupButton
 *     getFile={async () => somePdfBlob}   // called only when clicked
 *     fileName="Invoice-INV-2026-0042.pdf"
 *   />
 *
 * If no provider is connected, the button still renders but explains
 * that in the tooltip/disabled state rather than erroring on click.
 */
import { useEffect, useState } from 'react'
import { UploadCloud, Loader2, CheckCircle2 } from 'lucide-react'
import { cloudStorageAPI } from '@/services/api'
import http from '@/services/http'
import useUIStore from '@/store/uiStore'
import { Button } from '@/components/ui'

interface CloudBackupButtonProps {
  /** Lazily produce the file to upload — only called when the user clicks. */
  getFile: () => Promise<Blob | File> | Blob | File
  fileName: string
  /** Optional: target a specific provider instead of the company default. */
  provider?: string
  size?: 'sm' | 'md'
}

/** Thin wrapper keeping the multipart/form-data details in one place. */
export function uploadDocumentToCloud(file: Blob | File, fileName: string, provider?: string) {
  const form = new FormData()
  form.append('file', file, fileName)
  if (provider) form.append('provider', provider)
  return http.post('/cloud-storage/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export default function CloudBackupButton({ getFile, fileName, provider, size = 'sm' }: CloudBackupButtonProps) {
  const { success, error } = useUIStore()
  const [hasConnection, setHasConnection] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)
  const [justUploaded, setJustUploaded] = useState(false)

  useEffect(() => {
    cloudStorageAPI.connections()
      .then((r) => setHasConnection((r.data.data || []).some((c) => c.status === 'connected')))
      .catch(() => setHasConnection(false))
  }, [])

  const handleClick = async () => {
    setUploading(true)
    try {
      const file = await getFile()
      await uploadDocumentToCloud(file, fileName, provider)
      success('Backed up to cloud storage', fileName)
      setJustUploaded(true)
      setTimeout(() => setJustUploaded(false), 2500)
    } catch (e: any) {
      error('Backup failed', e?.response?.data?.message || e.message)
    } finally {
      setUploading(false)
    }
  }

  if (hasConnection === false) {
    return (
      <Button size={size} variant="secondary" disabled title="Connect a cloud storage provider in Settings → Cloud Storage first">
        <UploadCloud size={14} className="mr-1" /> Backup to Cloud
      </Button>
    )
  }

  return (
    <Button size={size} variant="secondary" onClick={handleClick} disabled={uploading || hasConnection === null}>
      {uploading ? (
        <Loader2 size={14} className="mr-1 animate-spin" />
      ) : justUploaded ? (
        <CheckCircle2 size={14} className="mr-1 text-emerald-600" />
      ) : (
        <UploadCloud size={14} className="mr-1" />
      )}
      {justUploaded ? 'Backed up' : 'Backup to Cloud'}
    </Button>
  )
}
