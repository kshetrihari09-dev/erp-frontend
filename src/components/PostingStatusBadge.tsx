/**
 * PostingStatusBadge — Inline accounting status indicator
 *
 * Shows whether a sale, purchase, or other operational record has been
 * posted to the ledger. Fetches from /accounting/posting-status/:type/:id.
 *
 * Usage:
 *   <PostingStatusBadge sourceType="SALE" sourceId={sale.id} />
 *   <PostingStatusBadge sourceType="PURCHASE" sourceId={purchase.id} compact />
 *
 * Variants:
 *   - compact (default in table rows): small badge icon + voucher number
 *   - full (for detail drawers): card with voucher, JE id, amount, hash
 */
import { CheckCircle, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { usePostingStatus } from '@/hooks/useQuery'
import { fmt } from '@/utils'

interface Props {
  sourceType: string   // 'SALE' | 'PURCHASE' | 'RECEIVE' | etc.
  sourceId:   string
  compact?:   boolean  // true = inline badge, false = expanded card
}

export default function PostingStatusBadge({ sourceType, sourceId, compact = true }: Props) {
  const { data, isLoading } = usePostingStatus(sourceType, sourceId)

  if (isLoading) {
    return compact
      ? <span className="inline-block w-16 h-4 rounded bg-[var(--surface-3)] animate-pulse" />
      : <div className="h-10 rounded-lg bg-[var(--surface-2)] animate-pulse" />
  }

  const status = data as any

  // ── Compact badge for table rows ────────────────────────────────────────────
  if (compact) {
    if (!status?.posted) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600
          bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800
          px-1.5 py-0.5 rounded-full whitespace-nowrap">
          <Clock size={9} />
          Pending
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700
        bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800
        px-1.5 py-0.5 rounded-full whitespace-nowrap"
        title={`Voucher: ${status.voucher_no}`}>
        <CheckCircle size={9} />
        {status.voucher_no}
      </span>
    )
  }

  // ── Full card for detail drawers/modals ─────────────────────────────────────
  if (!status?.posted) {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-lg
        bg-amber-50 border border-amber-200
        dark:bg-amber-950/20 dark:border-amber-800">
        <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Not yet posted to ledger
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
            Configure Chart of Accounts role mappings in Accounting → Engine Setup to activate automatic posting.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-green-50 border border-green-200
      dark:bg-green-950/20 dark:border-green-800">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
        <span className="text-xs font-semibold text-green-800 dark:text-green-300">
          Posted to ledger
        </span>
        <span className={[
          'ml-auto text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
          status.voucher_status === 'POSTED' || status.voucher_status === 'posted'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        ].join(' ')}>
          {status.voucher_status}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div>
          <dt className="text-[var(--text-3)]">Voucher No</dt>
          <dd className="font-mono font-semibold text-[var(--brand)]">{status.voucher_no}</dd>
        </div>
        {status.total_debit != null && (
          <div>
            <dt className="text-[var(--text-3)]">Amount</dt>
            <dd className="font-mono font-semibold">{fmt(status.total_debit)}</dd>
          </div>
        )}
        {status.journal_entry_id && (
          <div className="col-span-2">
            <dt className="text-[var(--text-3)]">Journal Entry ID</dt>
            <dd className="font-mono text-[10px] text-[var(--text-2)] truncate">
              {status.journal_entry_id}
            </dd>
          </div>
        )}
        {status.entry_hash && (
          <div className="col-span-2">
            <dt className="text-[var(--text-3)]">Integrity Hash</dt>
            <dd className="font-mono text-[10px] text-[var(--text-3)] truncate" title={status.entry_hash}>
              {status.entry_hash.slice(0, 32)}…
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
