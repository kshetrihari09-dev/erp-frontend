/**
 * VoucherPostingsTab — Voucher → Journal Entry Cross-Reference Audit Trail
 *
 * Shows every operational record (sale, purchase, receive, return, payment)
 * and its linked voucher + journal entry status. This is the single-pane
 * view that proves every transaction has gone through PostingEngine.
 *
 * Columns:
 *   Date | Source Type | Reference | Voucher No | Voucher Status | Amount | JE ID
 *
 * Filterable by source_type.
 * Clicking a row opens the voucher detail modal (reuses VouchersTab logic).
 */
import { useState, useEffect } from 'react'
import { ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react'
import { useVoucherPostings } from '@/hooks/useQuery'
import { Empty, SkeletonRows } from '@/components/ui'
import { fmt, fmtDate } from '@/utils'
import type { VoucherPosting } from '@/types'

const SOURCE_TYPE_OPTIONS = [
  { value: '',                label: 'All Sources'      },
  { value: 'SALE',            label: 'Sales'            },
  { value: 'PURCHASE',        label: 'Purchases'        },
  { value: 'RECEIVE',         label: 'Stock Receives'   },
  { value: 'SALE_RETURN',     label: 'Sales Returns'    },
  { value: 'PURCHASE_RETURN', label: 'Purchase Returns' },
  { value: 'PAYMENT',         label: 'Payments'         },
  { value: 'RECEIPT',         label: 'Receipts'         },
]

const SOURCE_BADGE: Record<string, string> = {
  SALE:             'badge-green',
  PURCHASE:         'badge-blue',
  RECEIVE:          'badge-purple',
  SALE_RETURN:      'badge-orange',
  PURCHASE_RETURN:  'badge-orange',
  PAYMENT:          'badge-red',
  RECEIPT:          'badge-teal',
}

function VoucherStatusIcon({ status }: { status: string }) {
  if (status === 'POSTED' || status === 'posted')
    return <CheckCircle size={13} className="text-green-500 shrink-0" />
  if (status === 'CANCELLED' || status === 'cancelled' || status === 'REVERSED' || status === 'reversed')
    return <XCircle size={13} className="text-red-400 shrink-0" />
  return <Clock size={13} className="text-amber-400 shrink-0" />
}

export default function VoucherPostingsTab({ onCount }: { onCount?: (count: number) => void } = {}) {
  const [sourceType, setSourceType] = useState('')
  const [page, setPage]             = useState(1)

  const { data, isLoading } = useVoucherPostings({
    source_type: sourceType || undefined,
    page,
    limit: 25,
  })

  const postings: VoucherPosting[] = (data as any)?.data ?? []
  const pagination = (data as any)?.pagination

  // Report the current row count up to the parent (purely informational — no fetch/logic change).
  useEffect(() => { onCount?.(pagination?.total ?? 0) }, [pagination?.total, onCount])

  return (
    <div>
      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 acc-filter-row">
        <select
          className="erp-input"
          style={{ width: 180 }}
          value={sourceType}
          onChange={e => { setSourceType(e.target.value); setPage(1) }}
        >
          {SOURCE_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {pagination && (
          <span className="text-xs text-[var(--text-3)] ml-auto acc-filter-count">
            {pagination.total} posting{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Posted At</th>
                <th>Source</th>
                <th>Reference</th>
                <th>Voucher No</th>
                <th>Status</th>
                <th className="td-right">Amount</th>
                <th>Journal Entry</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={7} />
                : postings.length === 0
                  ? (
                      <tr>
                        <td colSpan={7}>
                          <Empty message={
                            sourceType
                              ? `No postings found for source type "${sourceType}"`
                              : 'No postings yet — transactions will appear here once the Posting Engine is configured'
                          } />
                        </td>
                      </tr>
                    )
                  : postings.map(p => (
                      <tr key={p.id}>
                        {/* Date */}
                        <td className="text-xs text-[var(--text-2)] whitespace-nowrap">
                          {p.posted_at ? fmtDate(p.posted_at) : <span className="text-[var(--text-3)]">—</span>}
                        </td>

                        {/* Source type badge */}
                        <td>
                          <span className={`badge ${SOURCE_BADGE[p.source_type] ?? 'badge-muted'} text-[10px]`}>
                            {p.source_type.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Reference */}
                        <td>
                          <code className="text-xs font-mono text-[var(--brand)]">
                            {p.source_ref ?? '—'}
                          </code>
                        </td>

                        {/* Voucher number */}
                        <td>
                          <code className="text-xs font-mono">{p.voucher_no}</code>
                        </td>

                        {/* Voucher status */}
                        <td>
                          <span className="flex items-center gap-1.5">
                            <VoucherStatusIcon status={p.voucher_status} />
                            <span className="text-xs capitalize">{p.voucher_status}</span>
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="td-right font-mono text-sm">
                          {p.total_amount != null ? fmt(p.total_amount) : '—'}
                        </td>

                        {/* Journal entry link */}
                        <td>
                          {p.journal_entry_id
                            ? (
                                <span className="flex items-center gap-1 text-xs text-[var(--brand)]">
                                  <CheckCircle size={12} className="text-green-500" />
                                  <code className="font-mono text-[10px]">
                                    {p.journal_entry_id.slice(0, 8)}…
                                  </code>
                                </span>
                              )
                            : <span className="text-xs text-amber-500 flex items-center gap-1">
                                <Clock size={12} />
                                Pending
                              </span>
                          }
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Previous
          </button>
          <span className="text-xs text-[var(--text-3)]">
            Page {page} of {pagination.total_pages}
          </span>
          <button
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
