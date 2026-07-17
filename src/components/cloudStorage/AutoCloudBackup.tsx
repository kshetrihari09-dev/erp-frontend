/**
 * AutoCloudBackup.tsx
 *
 * Silently, automatically backs up a posted voucher (sale, purchase,
 * return, etc.) to the connected cloud storage provider as a PDF — no
 * click, no modal, nothing visible to the user unless something needs
 * their attention (a toast only on failure; success stays quiet since
 * this fires after every single post).
 *
 * Reuses the exact same rendering + conversion pipeline as the manual
 * "Backup to Cloud" button in PrintPreviewModal (InvoiceTemplate +
 * htmlToPdfBlob + uploadDocumentToCloud) — just against an off-screen
 * copy of the template instead of the one visible in an open modal, so
 * this works whether or not the user ever opens the print preview.
 *
 * Usage — drop this once near the bottom of any page that posts a
 * voucher, right next to the existing <PrintPreviewModal>, passing it
 * the exact same `printData` state:
 *
 *   <AutoCloudBackup data={printData} />
 *
 * It does nothing until `data` changes to a new, not-yet-backed-up
 * voucher (tracked by voucherNo), and does nothing at all if no cloud
 * storage provider is connected — this is a bonus safety net, not a
 * required step, so it must never block or interrupt posting a sale.
 */
import { useEffect, useRef, useState } from 'react'
import { htmlToPdfBlob } from '@/utils/htmlToPdfBlob'
import { uploadDocumentToCloud } from './CloudBackupButton'
import { cloudStorageAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'
import useTemplateStore from '@/store/templateStore'
import InvoiceTemplate, { type PrintData } from '@/components/print/InvoiceTemplate'
import { adToBS } from '@/utils/nepaliDate'

interface Props {
  data: PrintData | null
  /** Set to false to disable auto-backup on a specific page without removing it. */
  enabled?: boolean
}

// Cached across every AutoCloudBackup instance so multiple vouchers
// posted in the same session don't each re-check the connection over
// the network — cleared on a hard refresh, which is fine since a new
// connection wouldn't exist mid-session anyway.
let connectionCheck: Promise<boolean> | null = null
function hasCloudConnection(): Promise<boolean> {
  if (!connectionCheck) {
    connectionCheck = cloudStorageAPI.connections()
      .then(r => (r.data.data || []).some((c: any) => c.status === 'connected'))
      .catch(() => false)
  }
  return connectionCheck
}

// Same mapping PrintPreviewModal uses — thermal receipts still archive
// as an a4 PDF page (a physical 80mm-wide PDF isn't a useful document to
// keep), so 'a4' is the only real option here.
function toInvoiceTemplateSize(s: 'A4' | 'thermal' | 'A5'): 'a4' | 'thermal-80' {
  return s === 'thermal' ? 'thermal-80' : 'a4'
}

export default function AutoCloudBackup({ data, enabled = true }: Props) {
  const { company }  = useAuthStore()
  const { error: toastError } = useUIStore()
  const tpl          = useTemplateStore(s => s.activeTemplate)
  const ref          = useRef<HTMLDivElement>(null)
  const lastBackedUp = useRef<string | null>(null)
  const [renderData, setRenderData] = useState<PrintData | null>(null)

  const printData: PrintData | null = data
    ? { ...data, company: data.company ?? company, dateBS: data.dateBS ?? adToBS(data.date) }
    : null

  // Step 1: as soon as a new voucher comes in, mount the off-screen
  // template for it. Split from the actual upload (below) because the
  // upload needs printRef to already be attached to a laid-out element.
  useEffect(() => {
    if (!enabled || !printData || printData.voucherNo === lastBackedUp.current) return
    setRenderData(printData)
  }, [enabled, printData?.voucherNo])

  // Step 2: once mounted, convert to PDF and upload.
  useEffect(() => {
    if (!renderData || !ref.current) return
    const voucherNo = renderData.voucherNo
    if (voucherNo === lastBackedUp.current) return

    let cancelled = false
    ;(async () => {
      const connected = await hasCloudConnection()
      if (cancelled || !connected) return

      // Two animation-frame ticks so the off-screen element has actually
      // finished laying out (company logo, web fonts) before html2canvas
      // snapshots it — capturing on the same tick it mounts risks a
      // half-rendered frame.
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      if (cancelled || !ref.current) return

      try {
        const blob = await htmlToPdfBlob(ref.current, { paperSize: 'a4' })
        if (cancelled) return
        await uploadDocumentToCloud(blob, `${voucherNo}.pdf`)
        lastBackedUp.current = voucherNo
        // No success toast on purpose — this runs after every post, and
        // stacking it on top of the existing "Invoice posted!" flash
        // would be noisy for something that's meant to be invisible.
        // Failures still surface, since that's the one outcome the user
        // actually needs to know about.
      } catch (e: any) {
        if (!cancelled) {
          toastError('Automatic cloud backup failed', e?.response?.data?.message || e.message)
        }
      }
    })()

    return () => { cancelled = true }
  }, [renderData, toastError])

  if (!renderData) return null

  return (
    <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
      <InvoiceTemplate ref={ref} data={renderData} size={toInvoiceTemplateSize(tpl.paperSize)} tpl={tpl} />
    </div>
  )
}
