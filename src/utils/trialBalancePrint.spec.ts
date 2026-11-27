import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildTrialBalancePrintHtml, escapeHtml, printHtmlDocument } from './trialBalancePrint'

const rows = [
  { account_code: '1010', name: 'Cash & Bank <main>', account_type: 'asset', closing_debit: 40000, closing_credit: 0 },
  { account_code: '2000', name: 'Loan', account_type: 'liability', closing_debit: 0, closing_credit: '5000.00' },
]

describe('buildTrialBalancePrintHtml', () => {
  const html = buildTrialBalancePrintHtml({ rows, subtitle: 'FY 2025/26', reportTotalDebit: 40000, reportTotalCredit: 40000 })
  it('lists every row with code, name and the right column', () => {
    expect(html).toContain('1010'); expect(html).toContain('40,000'); expect(html).toContain('5,000')
  })
  it('escapes account names so they cannot break the document', () => {
    expect(html).toContain('Cash &amp; Bank &lt;main&gt;'); expect(html).not.toContain('<main>')
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;')
  })
  it('totals the printed rows and states the balance of the whole report', () => {
    expect(html).toMatch(/<tfoot>.*40,000.*5,000/s)
    expect(html).toContain('Trial balance is balanced')
    expect(buildTrialBalancePrintHtml({ rows, reportTotalDebit: 100, reportTotalCredit: 90 })).toContain('Out of balance by 10')
  })
  it('handles an empty list', () => {
    expect(buildTrialBalancePrintHtml({ rows: [], reportTotalDebit: 0, reportTotalCredit: 0 })).toContain('No accounts to print')
  })
})

describe('printHtmlDocument', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
  it('loads the document into a hidden iframe, prints it, then removes it', async () => {
    vi.useFakeTimers()
    const printed = vi.fn()
    const orig = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((n: any) => {
      const r = orig(n)
      if (n.tagName === 'IFRAME') {
        Object.defineProperty(n, 'contentWindow', { value: { focus: () => {}, print: printed } })
        queueMicrotask(() => n.onload?.(new Event('load')))
      }
      return r
    })
    const p = printHtmlDocument('<p>hi</p>')
    await vi.advanceTimersByTimeAsync(0); await p
    expect(printed).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(document.querySelector('iframe')).toBeNull()
    vi.useRealTimers()
  })
})
