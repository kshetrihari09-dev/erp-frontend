/**
 * reprintCounter.ts — device-local "RE-PRINT[n]" counter for the pharma invoice layout.
 *
 * Each time a SAVED invoice is printed again from the Sales list/detail, the counter for that invoice
 * number goes up and the printed copy shows "*RE-PRINT[n]". The count lives in this browser's
 * localStorage only (the backend does not track prints), so it counts reprints made on this device.
 * Never throws: storage being unavailable simply means no counter (undefined).
 */
const KEY = 'erp_reprint_counts'

export function bumpReprintCount(invoiceNo: string | undefined | null): number | undefined {
  if (!invoiceNo) return undefined
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, number>
    all[invoiceNo] = (Number(all[invoiceNo]) || 0) + 1
    localStorage.setItem(KEY, JSON.stringify(all))
    return all[invoiceNo]
  } catch { return undefined }
}
