import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { QK } from '@/constants'
import useUIStore from '@/store/uiStore'
import { fetchAllProducts } from '@/services/productExport'
import {
  parseImportFile, buildImportPlan, runImport,
  type ImportPlan, type ImportResult,
} from '@/services/productImport'

interface ImportProductsModalProps {
  open: boolean
  onClose: () => void
}

type Step =
  | { kind: 'select' }
  | { kind: 'reading' }
  | { kind: 'preview'; plan: ImportPlan; fileName: string }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'done'; result: ImportResult }

export default function ImportProductsModal({ open, onClose }: ImportProductsModalProps) {
  const [step, setStep] = useState<Step>({ kind: 'select' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { error } = useUIStore()

  const busy = step.kind === 'reading' || step.kind === 'importing'

  const reset = () => setStep({ kind: 'select' })
  const handleClose = () => { if (!busy) { reset(); onClose() } }

  const handleFile = async (file: File) => {
    setStep({ kind: 'reading' })
    try {
      const { rows, unknownHeaders } = await parseImportFile(file)
      if (rows.length === 0) {
        error('Nothing to import', 'That file has no data rows.')
        setStep({ kind: 'select' })
        return
      }
      // Match against the FULL catalog, not just whatever's currently
      // filtered on the Product List, so updates are detected correctly.
      const existing = await fetchAllProducts(undefined)
      const plan = buildImportPlan(rows, existing)
      plan.unknownHeaders = unknownHeaders
      setStep({ kind: 'preview', plan, fileName: file.name })
    } catch (e: any) {
      error('Could not read file', e?.message || 'Please check the file format and try again.')
      setStep({ kind: 'select' })
    }
  }

  const startImport = async (plan: ImportPlan) => {
    setStep({ kind: 'importing', done: 0, total: plan.toCreate + plan.toUpdate })
    const result = await runImport(plan.rows, (done, total) => setStep({ kind: 'importing', done, total }))
    qc.invalidateQueries({ queryKey: [QK.PRODUCTS] })
    setStep({ kind: 'done', result })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Products" size="md">
      {step.kind === 'select' && (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed border-[var(--border-2)] hover:border-brand cursor-pointer transition-colors"
          >
            <UploadCloud size={28} className="text-[var(--text-4)]" />
            <div className="text-sm font-semibold text-[var(--text-2)]">Click to choose a file</div>
            <div className="text-xs text-[var(--text-4)]">Excel (.xlsx) or CSV (.csv)</div>
          </div>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          />
          <p className="text-xs text-[var(--text-4)] mt-3 leading-relaxed">
            Matches rows to existing products by Barcode, then Product Code — everything else is
            created as a new product. Current Stock, Batch, and Expiry are not imported; use
            Purchase Entry or Stock Adjustment for those.
          </p>
        </div>
      )}

      {step.kind === 'reading' && (
        <div className="py-10 text-center text-sm font-medium text-[var(--text-2)]">Reading file…</div>
      )}

      {step.kind === 'preview' && (
        <div>
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-[var(--surface-3)] text-sm">
            <FileSpreadsheet size={16} className="text-[var(--text-4)] shrink-0" />
            <span className="font-medium truncate">{step.fileName}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center px-2 py-3 rounded-lg bg-green-50 border border-green-200">
              <div className="text-lg font-bold text-green-700">{step.plan.toCreate}</div>
              <div className="text-[11px] text-green-700 font-medium">New</div>
            </div>
            <div className="text-center px-2 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-lg font-bold text-blue-700">{step.plan.toUpdate}</div>
              <div className="text-[11px] text-blue-700 font-medium">To update</div>
            </div>
            <div className="text-center px-2 py-3 rounded-lg bg-red-50 border border-red-200">
              <div className="text-lg font-bold text-red-700">{step.plan.toSkip}</div>
              <div className="text-[11px] text-red-700 font-medium">Errors</div>
            </div>
          </div>

          {step.plan.unknownHeaders.length > 0 && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Unrecognized column{step.plan.unknownHeaders.length > 1 ? 's' : ''} ignored: {step.plan.unknownHeaders.join(', ')}</span>
            </div>
          )}

          {step.plan.toSkip > 0 && (
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-red-200">
              {step.plan.rows.filter(r => r.action === 'error').map(r => (
                <div key={r.rowNumber} className="px-3 py-1.5 text-xs border-b border-red-100 last:border-b-0 bg-red-50">
                  <span className="font-semibold">Row {r.rowNumber}</span>
                  {r.name && <span className="text-[var(--text-3)]"> ({r.name})</span>}
                  <span className="text-red-700"> — {r.errors.join('; ')}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Choose a different file</Button>
            <Button
              variant="primary"
              disabled={step.plan.toCreate + step.plan.toUpdate === 0}
              onClick={() => startImport(step.plan)}
            >
              Import {step.plan.toCreate + step.plan.toUpdate} product{step.plan.toCreate + step.plan.toUpdate === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'importing' && (
        <div className="py-5 text-center">
          <div className="text-sm font-medium text-[var(--text-2)] mb-3">Importing products…</div>
          <div className="w-full h-2 rounded-full bg-[var(--surface-3)] overflow-hidden mb-1.5">
            <div
              className="h-full bg-brand transition-all duration-150"
              style={{ width: `${step.total ? Math.min(100, Math.round((step.done / step.total) * 100)) : 0}%` }}
            />
          </div>
          <div className="text-xs text-[var(--text-4)]">{step.done} of {step.total} products</div>
        </div>
      )}

      {step.kind === 'done' && (
        <div>
          <div className="flex flex-col items-center text-center py-4 mb-2">
            <CheckCircle2 size={32} className="text-green-600 mb-2" />
            <div className="text-sm font-semibold">
              {step.result.created} created, {step.result.updated} updated
              {step.result.failed.length > 0 ? `, ${step.result.failed.length} failed` : ''}
            </div>
          </div>

          {step.result.failed.length > 0 && (
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-red-200">
              {step.result.failed.map(f => (
                <div key={f.rowNumber} className="flex items-start gap-1.5 px-3 py-1.5 text-xs border-b border-red-100 last:border-b-0 bg-red-50">
                  <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                  <span><span className="font-semibold">Row {f.rowNumber}</span> ({f.name}) — {f.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
