import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { downloadCSV } from '@/utils'
import { todayBS } from '@/utils/nepaliDate'
import useUIStore from '@/store/uiStore'
import {
  fetchAllProducts, fetchNearestBatchByProduct, buildExportRows, exportRowsAsXLSX,
} from '@/services/productExport'

interface ExportProductsModalProps {
  open: boolean
  onClose: () => void
  /** The Product List's current search term, if any. */
  search?: string
  /** Row count matching that search — shown next to the "Current view" option. */
  filteredCount: number
}

type Scope = 'filtered' | 'all'
type Stage = { label: string; fetched: number; total: number } | null

export default function ExportProductsModal({ open, onClose, search, filteredCount }: ExportProductsModalProps) {
  const hasFilter = !!search?.trim()
  const [scope, setScope]       = useState<Scope>(hasFilter ? 'filtered' : 'all')
  const [progress, setProgress] = useState<Stage>(null)
  const { error } = useUIStore()

  const busy = !!progress

  const handleClose = () => { if (!busy) onClose() }

  const runExport = async (format: 'xlsx' | 'csv') => {
    try {
      setProgress({ label: 'Fetching products…', fetched: 0, total: 0 })
      const products = await fetchAllProducts(
        scope === 'filtered' ? search : undefined,
        (fetched, total) => setProgress({ label: 'Fetching products…', fetched, total }),
      )

      setProgress({ label: 'Fetching batch details…', fetched: products.length, total: products.length })
      const batchByProduct = await fetchNearestBatchByProduct()

      setProgress({ label: 'Preparing file…', fetched: products.length, total: products.length })
      const rows     = buildExportRows(products, batchByProduct)
      const filename = `Product_List_${todayBS('YYYY-MM-DD')}`

      if (format === 'xlsx') exportRowsAsXLSX(rows, filename)
      else                   downloadCSV(rows, filename)

      setProgress(null)
      onClose()
    } catch (e: any) {
      setProgress(null)
      error('Export failed', e?.message || 'Could not export the product list. Please try again.')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Export Products" size="sm">
      {hasFilter && !busy && (
        <div className="mb-4">
          <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">
            What would you like to export?
          </label>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setScope('filtered')}
              className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                scope === 'filtered'
                  ? 'border-brand text-brand font-semibold bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
              }`}
            >
              Current view (filtered) — {filteredCount} product{filteredCount === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                scope === 'all'
                  ? 'border-brand text-brand font-semibold bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
              }`}
            >
              All products
            </button>
          </div>
        </div>
      )}

      {progress ? (
        <div className="py-5 text-center">
          <div className="text-sm font-medium text-[var(--text-2)] mb-3">{progress.label}</div>
          {progress.total > 0 && (
            <>
              <div className="w-full h-2 rounded-full bg-[var(--surface-3)] overflow-hidden mb-1.5">
                <div
                  className="h-full bg-brand transition-all duration-150"
                  style={{ width: `${Math.min(100, Math.round((progress.fetched / progress.total) * 100))}%` }}
                />
              </div>
              <div className="text-xs text-[var(--text-4)]">{progress.fetched} of {progress.total} products</div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary" size="lg" className="justify-start"
            icon={<FileSpreadsheet size={16} className="text-green-600" />}
            onClick={() => runExport('xlsx')}
          >
            Excel (.xlsx)
          </Button>
          <Button
            variant="secondary" size="lg" className="justify-start"
            icon={<FileText size={16} className="text-blue-600" />}
            onClick={() => runExport('csv')}
          >
            CSV (.csv)
          </Button>
        </div>
      )}
    </Modal>
  )
}
