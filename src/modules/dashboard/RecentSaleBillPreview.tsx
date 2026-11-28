import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, X } from 'lucide-react'
import { PrintPreviewModal } from '@/components/print'
import { useSale } from '@/hooks/useQuery'
import { productsAPI } from '@/services/api'
import useTemplateStore from '@/store/templateStore'
import { bumpReprintCount } from '@/utils/reprintCounter'
import { Z } from '@/styles/zIndex'
import { saleToPrintData } from './saleToPrintData'

/* Opens the REAL invoice of a Recent Sales row in the existing print preview. The row only identifies the sale;
   the invoice is built from the full record fetched with useSale(id) — never from the list's summary data. */

interface Props { saleId: string; onClose: () => void }

const errorText = (e: any) => e?.response?.data?.message || e?.message || 'Could not load this invoice.'

export default function RecentSaleBillPreview({ saleId, onClose }: Props) {
  const { data: sale, isLoading, isError, error, refetch, isFetching } = useSale(saleId) as any

  // "RE-PRINT[n]": counted once each time this invoice is opened here (as when reprinting from the Sales list).
  const [reprint, setReprint] = useState<{ id: string; n?: number } | null>(null)
  useEffect(() => {
    if (sale?.id && reprint?.id !== sale.id) setReprint({ id: sale.id, n: bumpReprintCount(sale.invoice_no) })
  }, [sale?.id])                                                    // eslint-disable-line react-hooks/exhaustive-deps

  // Units come from the product master only for layouts that print them — SalesPage does the same lookup.
  const layout = useTemplateStore(s => s.activeTemplate.layout)
  const needsUnit = (layout === 'boxed' || layout === 'soldto') && !!sale?.items?.some((i: any) => !i.unit)
  const { data: products } = useQuery({
    queryKey: ['dashboard-bill-products'], enabled: needsUnit, staleTime: 5 * 60_000,
    queryFn: () => productsAPI.list({ limit: 500 }).then(r => (r.data.data || []) as any[]),
  })

  const printData = useMemo(() => {
    if (!sale || !reprint || reprint.id !== sale.id) return null
    const byId = new Map((products || []).map((p: any) => [p.id, p]))
    return saleToPrintData(sale, {
      reprintCount: reprint.n,
      unitOf: id => (id ? byId.get(id)?.unit : undefined) || undefined,
      mrpOf: id => { const p = id ? byId.get(id) : undefined; return p ? Number(p.mrp) || 0 : undefined },
    })
  }, [sale, reprint, products])

  // While loading / failed (the print modal handles its own Esc once it is open)
  useEffect(() => {
    if (printData) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [printData, onClose])

  if (printData) return <PrintPreviewModal data={printData} open onClose={onClose} />

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: Z.modalBackdrop, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role={isError ? 'alert' : 'status'} aria-live="polite"
        className="relative w-full max-w-[340px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-md)]" style={{ zIndex: Z.modal }}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-[var(--text-3)] hover:text-[var(--text)]"><X size={16} /></button>
        {isError ? (
          <>
            <AlertCircle size={26} className="mx-auto text-rose-500" aria-hidden />
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">Couldn’t load the invoice</div>
            <div className="mt-1 text-xs text-[var(--text-3)]">{errorText(error)}</div>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-lg bg-[var(--brand)] px-4 text-xs font-semibold text-white disabled:opacity-60">Retry</button>
              <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-2)]">Close</button>
            </div>
          </>
        ) : (
          <>
            <Loader2 size={24} className="mx-auto animate-spin text-[var(--brand)]" aria-hidden />
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{isLoading || !sale ? 'Loading invoice…' : 'Preparing preview…'}</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
