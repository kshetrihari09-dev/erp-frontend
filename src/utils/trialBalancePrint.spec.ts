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
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })

  it('writes the document into a REAL-sized, rendered (not hidden) frame, prints it once, and keeps it until printing ends', async () => {
    vi.useFakeTimers()
    const printed = vi.fn()
    const orig = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((n: any) => {
      const r = orig(n); if (n.tagName === 'IFRAME') n.contentWindow.print = printed; return r
    })
    const p = printHtmlDocument('<html><body><p id="x">hello</p></body></html>')
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    // a hidden / zero-size frame prints blank — guard against regressing to one
    const css = frame.style
    expect(css.visibility).not.toBe('hidden'); expect(css.display).not.toBe('none')
    expect(css.width).not.toBe('0px'); expect(css.height).not.toBe('0px')
    expect(frame.contentDocument!.getElementById('x')?.textContent).toBe('hello')   // content is really in the frame
    await vi.advanceTimersByTimeAsync(500); await p
    expect(printed).toHaveBeenCalledTimes(1)
    expect(document.querySelector('iframe')).not.toBeNull()                          // still there right after print()
    frame.contentWindow!.dispatchEvent(new Event('afterprint'))
    await vi.advanceTimersByTimeAsync(600)
    expect(document.querySelector('iframe')).toBeNull()                              // cleaned up afterwards
  })

  it('rejects (so the UI can tell the user) when printing throws', async () => {
    vi.useFakeTimers()
    const orig = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((n: any) => {
      const r = orig(n); if (n.tagName === 'IFRAME') n.contentWindow.print = () => { throw new Error('nope') }; return r
    })
    const p = printHtmlDocument('<p>x</p>'); const assertion = expect(p).rejects.toThrow('nope')
    await vi.advanceTimersByTimeAsync(500); await assertion
  })
})
