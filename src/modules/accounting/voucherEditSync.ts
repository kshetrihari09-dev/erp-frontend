/**
 * voucherEditSync.ts — keep the UI in step with the server after a POSTED
 * Receipt/Payment edit.
 *
 * An edit changes the voucher itself AND everything derived from it on the
 * server (account ledger, party ledger, party balance, trial balance, …).
 * The server is the single source of truth, so after a successful edit we
 * never patch local state — we invalidate every read model that could hold
 * the old figures and let it refetch.
 */
import type { QueryClient } from '@tanstack/react-query'
import { QK } from '@/constants'
import type { Account } from '@/types'

/** Query keys that can contain a receipt/payment's amount, account, party or date. */
const AFFECTED_KEYS = [
  QK.VOUCHERS, QK.VOUCHER, QK.RECEIPTS, QK.PAYMENTS,
  QK.LEDGER, QK.PARTY, QK.TRIAL_BAL, QK.REPORTS, QK.VOUCHER_POSTINGS, QK.ACCOUNTS,
]

export function invalidateAfterVoucherEdit(qc: QueryClient, voucherId?: string) {
  for (const key of AFFECTED_KEYS) qc.invalidateQueries({ queryKey: [key] })
  // Party ledgers/balances are keyed by party id under several prefixes; a
  // predicate catches every variant without hard-coding each one.
  qc.invalidateQueries({
    predicate: q => q.queryKey.some(k => typeof k === 'string' && /ledger|balance|party|parties/i.test(k)),
  })
  if (voucherId) qc.removeQueries({ queryKey: [QK.VOUCHER, voucherId] })
}

/**
 * "Received Into" (RECEIPT) / "Paid From" (PAYMENT) from the voucher's
 * CURRENT lines — i.e. what GET /accounting/vouchers/:id returns, which after
 * an edit is the corrected set — never from list rows or cached form state.
 *
 * RECEIPT: Dr cash/bank, Cr party control account  → the cash/bank DEBIT line.
 * PAYMENT: Dr party control account, Cr cash/bank  → the cash/bank CREDIT line.
 * If account metadata is available, prefer the line that really is a
 * cash/bank account (robust if a voucher ever has extra lines).
 */
export function currentCashBankAccountId(
  type: 'RECEIPT' | 'PAYMENT',
  lines: Array<{ account_id: string; debit: number | string; credit: number | string }>,
  accounts: Account[] = [],
): string | undefined {
  const side = (l: { debit: number | string; credit: number | string }) =>
    type === 'RECEIPT' ? Number(l.debit) > 0 : Number(l.credit) > 0
  const candidates = lines.filter(side)
  const isCashBank = (id: string) => {
    const st = (accounts.find(a => a.id === id) as any)?.sub_type
    return st === 'cash' || st === 'bank'
  }
  return (candidates.find(l => isCashBank(l.account_id)) ?? candidates[0])?.account_id
}
