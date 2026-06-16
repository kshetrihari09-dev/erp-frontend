import { useState, useEffect, useCallback } from 'react'
import { returnsAPI } from '@/services/api'
import { Printer } from 'lucide-react'
import { PrintPreviewModal } from '@/components/print'
import type { PrintData } from '@/components/print'
import useUIStore from '@/store/uiStore'
import { Empty, SkeletonRows, Pagination, Badge, Button } from '@/components/ui'
import { fmt, fmtDate } from '@/utils'

const LIMIT = 20

export default function ReturnsPage() {
  const { error } = useUIStore()
  const [list,    setList]    = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [printData, setPrintData] = useState<PrintData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r    = await returnsAPI.list({ page, limit: LIMIT })
      const body = r.data
      // paginatedResponse returns { success, data: [], pagination: {} }
      setList(body?.data        ?? [])
      setTotal(body?.pagination?.total ?? body?.total ?? 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Returns</h1>
        </div>
      </div>

      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Return No</th>
                <th>Date</th>
                <th>Original Invoice</th>
                <th>Party</th>
                <th className="td-right">Amount</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <SkeletonRows cols={8} />
                : list.length
                  ? list.map((r: any) => (
                      <tr key={r.id}>
                        {/* return_no is mapped from voucher_no in backend */}
                        <td className="td-mono text-brand">
                          {r.return_no || r.voucher_no || r.id?.slice(0, 8)}
                        </td>
                        {/* date is mapped from voucher_date in backend */}
                        <td className="td-mono">
                          {fmtDate(r.date || r.voucher_date)}
                        </td>
                        {/* original_invoice_no is mapped from reference_no */}
                        <td className="td-mono">
                          {r.original_invoice_no || r.reference_no || '—'}
                        </td>
                        <td>{r.party_name || '—'}</td>
                        {/* amount is mapped from total_amount */}
                        <td className="td-right">
                          {fmt(r.amount ?? r.total_amount ?? r.net_total ?? 0)}
                        </td>
                        <td>
                          <Badge status={
                            (r.type || r.voucher_type || 'returned')
                              .toLowerCase()
                              .replace('sale_return', 'sale-return')
                              .replace('purchase_return', 'purchase-return')
                          }/>
                        </td>
                        <td>
                          <Badge status={(r.status || 'posted').toLowerCase()}/>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <Button variant="secondary" size="sm" icon={<Printer size={12}/>}
                            onClick={() => setPrintData({
                              voucherNo:   r.return_no || r.voucher_no || '—',
                              type:        (r.type || r.voucher_type || 'RETURN') as any,
                              date:        r.date || r.voucher_date,
                              partyName:   r.party_name || undefined,
                              referenceNo: r.original_invoice_no || r.reference_no || undefined,
                              netTotal:    Number(r.amount ?? r.total_amount ?? 0),
                            })}
                          >Print</Button>
                        </td>
                      </tr>
                    ))
                  : (
                      <tr>
                        <td colSpan={7}>
                          <Empty message="No return records" />
                        </td>
                      </tr>
                    )
              }
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
      <PrintPreviewModal
        data={printData}
        open={!!printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  )
}
