/**
 * modules/purchases/ScanPurchaseBillModal.tsx
 *
 * The capture step only (spec #1): camera, image upload, PDF upload,
 * multiple pages, retake/re-upload. Once OCR finishes, this modal hands
 * the extracted data to PurchasePage via onExtracted and closes — the
 * review itself happens on the existing purchase form (spec #8, #13),
 * not in here. This file never touches purchasesAPI.
 */
import { useState, useRef } from 'react'
import { Camera, Upload, FileText, X, Loader2, RotateCcw, AlertTriangle } from 'lucide-react'
import { Modal, Button } from '@/components/ui'
import { useUploadPurchaseScan, usePurchaseScan, useDiscardPurchaseScan } from '@/hooks/useQuery'

interface StagedFile { file: File; previewUrl: string | null }

interface Props {
  open: boolean
  onClose: () => void
  /** Called once OCR finishes with data ready for review. `scanId` must
   *  be carried through to the final purchasesAPI.create() call as
   *  source_scan_id — that's what links the saved purchase back to this
   *  scan and its original document (spec #11). */
  onExtracted: (scanId: string, extracted: any) => void
}

export default function ScanPurchaseBillModal({ open, onClose, onExtracted }: Props) {
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [scanId, setScanId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const uploadMut = useUploadPurchaseScan()
  const discardMut = useDiscardPurchaseScan()
  const { data: scan } = usePurchaseScan(scanId)

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    const next = Array.from(fileList).map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setStaged(prev => [...prev, ...next])
  }

  function removeStaged(idx: number) {
    setStaged(prev => {
      const copy = [...prev]
      if (copy[idx].previewUrl) URL.revokeObjectURL(copy[idx].previewUrl!)
      copy.splice(idx, 1)
      return copy
    })
  }

  function retakeAll() {
    staged.forEach(s => s.previewUrl && URL.revokeObjectURL(s.previewUrl))
    setStaged([])
    setScanId(null)
  }

  async function handleUpload() {
    if (!staged.length) return
    const res = await uploadMut.mutateAsync(staged.map(s => s.file))
    setScanId(res.id)
  }

  async function handleDiscardAndClose() {
    if (scanId && scan?.status !== 'confirmed') await discardMut.mutateAsync(scanId).catch(() => {})
    retakeAll()
    onClose()
  }

  // Once extraction finishes, hand off and reset — but only once, guarded
  // by scanId being cleared right after so a stray re-render doesn't
  // fire onExtracted twice for the same scan.
  if (scan?.status === 'extracted' && scanId) {
    const handoffId = scanId
    setScanId(null)
    onExtracted(handoffId, scan.extracted_data)
    setStaged([])
    onClose()
    return null
  }

  const isProcessing = scan?.status === 'uploaded' || scan?.status === 'processing'
  const isFailed = scan?.status === 'failed'

  return (
    <Modal open={open} onClose={handleDiscardAndClose} title="Scan Purchase Bill" size="lg">
      <div className="flex flex-col gap-4">
        {!scanId && (
          <>
            {/* ── Capture entry points ──────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-[var(--border-2)] hover:border-brand hover:bg-brand/5"
              >
                <Camera size={22} className="text-brand" />
                <span className="text-xs font-semibold">Camera</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-[var(--border-2)] hover:border-brand hover:bg-brand/5"
              >
                <Upload size={22} className="text-brand" />
                <span className="text-xs font-semibold">Photo / Image</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-[var(--border-2)] hover:border-brand hover:bg-brand/5"
              >
                <FileText size={22} className="text-brand" />
                <span className="text-xs font-semibold">PDF</span>
              </button>
            </div>
            {/* capture="environment" opens the rear camera directly on a
                phone; on desktop it degrades to an ordinary file picker. */}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => addFiles(e.target.files)} />
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple hidden
              onChange={e => addFiles(e.target.files)} />

            {/* ── Staged pages ──────────────────────────────────────── */}
            {staged.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-3)]">
                    {staged.length} page{staged.length === 1 ? '' : 's'} ready
                  </span>
                  <button onClick={retakeAll} className="flex items-center gap-1 text-xs font-semibold text-[var(--text-4)] hover:text-red-600">
                    <RotateCcw size={12} /> Clear all
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {staged.map((s, i) => (
                    <div key={i} className="relative shrink-0 w-20 h-24 rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--surface-2)]">
                      {s.previewUrl
                        ? <img src={s.previewUrl} className="w-full h-full object-cover" alt={`Page ${i + 1}`} />
                        : <div className="w-full h-full flex flex-col items-center justify-center gap-1"><FileText size={20} className="text-[var(--text-4)]" /><span className="text-[9px] text-[var(--text-4)]">PDF</span></div>}
                      <button onClick={() => removeStaged(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 w-20 h-24 rounded-lg border-2 border-dashed border-[var(--border-2)] flex items-center justify-center text-[var(--text-4)]"
                  >
                    <Upload size={16} />
                  </button>
                </div>
              </div>
            )}

            <Button
              variant="primary" size="lg" className="w-full"
              disabled={!staged.length}
              loading={uploadMut.isPending}
              onClick={handleUpload}
            >
              {staged.length ? `Scan ${staged.length} page${staged.length === 1 ? '' : 's'}` : 'Add a photo or PDF to continue'}
            </Button>
          </>
        )}

        {/* ── Processing ──────────────────────────────────────────────── */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 size={28} className="animate-spin text-brand" />
            <div>
              <p className="text-sm font-bold">Reading the bill…</p>
              <p className="text-xs text-[var(--text-4)] mt-1">This can take up to a minute for a multi-page bill.</p>
            </div>
          </div>
        )}

        {/* ── Failed ───────────────────────────────────────────────────── */}
        {isFailed && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle size={26} className="text-red-500" />
            <div>
              <p className="text-sm font-bold text-red-700">Couldn't read this bill</p>
              <p className="text-xs text-[var(--text-4)] mt-1 max-w-xs">{scan?.error_message || 'Something went wrong during scanning.'}</p>
            </div>
            <Button variant="secondary" onClick={retakeAll}>
              <RotateCcw size={14} className="mr-1.5" /> Try again
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
