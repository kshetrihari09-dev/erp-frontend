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
    <div className="ar-page">
      <style>{`
        /* ── Returns (combined) — mobile/tablet responsive (self-contained, additive) ── */
        .ar-page { max-width: 100%; overflow-x: hidden; }

        @media (min-width: 768px) and (max-width: 1024px) {
          .ar-desktop-table { overflow-x: auto; }
          .ar-desktop-table table { min-width: 640px; font-size: 12.5px; }
        }

        @media (max-width: 767px) {
          .ar-desktop-table { display: none !important; }
          .ar-mobile-list   { display: flex !important; flex-direction: column; gap: 10px; padding: 4px 2px; }

          .ar-hist-card {
            background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px;
            padding: 11px 13px; display: flex; flex-direction: column; gap: 6px;
          }
          .ar-hist-top, .ar-hist-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
          .ar-hist-no { font-family: var(--font-mono, monospace); font-size: 12.5px; font-weight: 700; color: var(--brand); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .ar-hist-amount { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 800; color: var(--text); flex-shrink: 0; }
          .ar-hist-party { font-size: 12.5px; font-weight: 500; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
          .ar-hist-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
          .ar-hist-actions { display: flex; gap: 7px; padding-top: 7px; border-top: 1px solid var(--border); align-items: center; justify-content: space-between; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Transactions</div>
          <h1 className="page-title">Returns</h1>
        </div>
      </div>

      <div className="table-card">
        <div className="ar-desktop-table overflow-x-auto">
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

        <div className="ar-mobile-list">
          {loading ? (
            <div className="acc-mobile-skel-wrap">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="acc-mobile-card-skel" />)}
            </div>
          ) : list.length === 0 ? (
            <Empty message="No return records" />
          ) : list.map((r: any) => (
            <div key={r.id} className="ar-hist-card">
              <div className="ar-hist-top">
                <span className="ar-hist-no">{r.return_no || r.voucher_no || r.id?.slice(0, 8)}</span>
                <span className="ar-hist-amount">{fmt(r.amount ?? r.total_amount ?? r.net_total ?? 0)}</span>
              </div>
              <div className="ar-hist-sub">
                <span className="ar-hist-party">{r.party_name || '—'}</span>
                <span className="text-[11px] font-mono text-[var(--text-3)]">{fmtDate(r.date || r.voucher_date)}</span>
              </div>
              <div className="ar-hist-sub">
                <span className="text-xs text-[var(--text-3)]">Ref: {r.original_invoice_no || r.reference_no || '—'}</span>
                <div className="ar-hist-chips">
                  <Badge status={
                    (r.type || r.voucher_type || 'returned')
                      .toLowerCase()
                      .replace('sale_return', 'sale-return')
                      .replace('purchase_return', 'purchase-return')
                  }/>
                  <Badge status={(r.status || 'posted').toLowerCase()}/>
                </div>
              </div>
              <div className="ar-hist-actions">
                <span />
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
              </div>
            </div>
          ))}
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
