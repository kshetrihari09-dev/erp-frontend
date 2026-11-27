/**
 * trialBalancePrint.ts — builds a standalone, print-ready HTML document for the Trial Balance and prints
 * it from a hidden iframe. Printing the live page (position:fixed + `body * {visibility:hidden}`) is
 * unreliable in this app: the report sits inside scroll containers, so the browser prints one clipped or
 * blank page. A separate document has no layout to fight, paginates naturally, and repeats the header row.
 */
import { fmt } from '@/utils'
import { num } from '@/utils/accountBalance'

export interface PrintRow { account_code: string; name: string; account_type: string; closing_debit?: number | string | null; closing_credit?: number | string | null }

export interface TrialBalancePrintInput {
  rows: PrintRow[]
  title?: string
  subtitle?: string          // e.g. "FY 2025/26 · 16 Jul 2025 — 15 Jul 2026"
  note?: string              // e.g. active filters
  /** Totals of the WHOLE report (not just the filtered rows) so the printout states the true balance check. */
  reportTotalDebit: number
  reportTotalCredit: number
  generatedAt?: Date
}

export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const cents = (v: unknown) => Math.round(num(v) * 100)

export function buildTrialBalancePrintHtml(i: TrialBalancePrintInput): string {
  const dr = i.rows.reduce((s, r) => s + cents(r.closing_debit), 0) / 100
  const cr = i.rows.reduce((s, r) => s + cents(r.closing_credit), 0) / 100
  const reportDiff = Math.abs(cents(i.reportTotalDebit) - cents(i.reportTotalCredit)) / 100
  const balanced = reportDiff < 0.01
  const cell = (v: unknown) => (num(v) === 0 ? '' : fmt(num(v)))
  const body = i.rows.length
    ? i.rows.map(r => `<tr><td class="mono">${escapeHtml(r.account_code)}</td><td>${escapeHtml(r.name)}</td><td class="cap">${escapeHtml(r.account_type)}</td><td class="num">${cell(r.closing_debit)}</td><td class="num">${cell(r.closing_credit)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="empty">No accounts to print.</td></tr>`
  const when = (i.generatedAt ?? new Date()).toLocaleString()
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(i.title ?? 'Trial Balance')}</title><style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;background:#fff;margin:0}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#444;margin:0 0 2px} .note{color:#666;font-size:10px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#f1f3f5;border-top:1px solid #999;border-bottom:1px solid #999;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} .mono{font-family:Consolas,monospace;white-space:nowrap} .cap{text-transform:capitalize}
  thead{display:table-header-group} tfoot{display:table-footer-group} tr{page-break-inside:avoid}
  tfoot td{font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;background:#f8f9fa}
  .status{margin-top:10px;font-weight:700;color:${balanced ? '#0a7a3d' : '#b00020'}} .empty{text-align:center;color:#666;padding:16px}
  .foot{margin-top:14px;color:#777;font-size:9px}
  @page{size:A4 portrait;margin:12mm}
  </style></head><body>
  <h1>${escapeHtml(i.title ?? 'Trial Balance')}</h1>
  ${i.subtitle ? `<p class="sub">${escapeHtml(i.subtitle)}</p>` : ''}${i.note ? `<p class="note">${escapeHtml(i.note)}</p>` : ''}
  <table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Closing Debit</th><th class="num">Closing Credit</th></tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td colspan="3">Total${i.note ? ' (listed accounts)' : ''}</td><td class="num">${fmt(dr)}</td><td class="num">${fmt(cr)}</td></tr></tfoot></table>
  <div class="status">${balanced ? 'Trial balance is balanced — Dr = Cr' : `Out of balance by ${fmt(reportDiff)}`} (whole report: Dr ${fmt(num(i.reportTotalDebit))} · Cr ${fmt(num(i.reportTotalCredit))})</div>
  <div class="foot">Generated ${escapeHtml(when)}</div></body></html>`
}

/** Print an HTML document from a hidden iframe (no popup, so popup blockers and WebViews can't swallow it). */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    const cleanup = () => setTimeout(() => frame.remove(), 1000)
    frame.onload = () => {
      try {
        const w = frame.contentWindow
        if (!w) throw new Error('Print frame unavailable')
        w.focus(); w.print(); resolve()
      } catch (e) { reject(e) } finally { cleanup() }
    }
    document.body.appendChild(frame)
    frame.srcdoc = html
  })
}
