/**
 * usePrint.ts — Fixed print service
 *
 * BUGS FIXED:
 *  1. 1x1 iframe → content never renders → blank print
 *  2. inline script in doc.write → blocked by CSP in modern browsers
 *  3. CSS variables (var(--text)) → resolve to nothing in iframe
 *
 * NEW APPROACH:
 *  - Inject a hidden #print-root div directly into document.body
 *  - Render the invoice HTML with all styles inlined (no CSS vars)
 *  - Call window.print() — the print CSS in globals.css hides everything
 *    except #print-root
 *  - Remove the div after printing via window.onafterprint
 */
import { useCallback } from 'react'

export type PrintSize = 'a4' | 'thermal-58' | 'thermal-80'

export interface PrintJob {
  id:        string
  voucherNo: string
  type:      string
  partyName?: string
  amount:    number
  date:      string
  printedAt: string
  copies:    number
}

const PRINT_HISTORY_KEY = 'erp_print_history'

export function getPrintHistory(): PrintJob[] {
  try { return JSON.parse(sessionStorage.getItem(PRINT_HISTORY_KEY) || '[]') } catch { return [] }
}

function addPrintHistory(job: Omit<PrintJob, 'id' | 'printedAt'> & Partial<Pick<PrintJob, 'id' | 'printedAt'>>) {
  const history = getPrintHistory()
  history.unshift({ ...job, id: Date.now().toString(), printedAt: new Date().toISOString() })
  sessionStorage.setItem(PRINT_HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
}

// Page size CSS
const PAGE_CSS: Record<PrintSize, string> = {
  'a4':         '@page { size: A4 portrait; margin: 12mm; }',
  'thermal-80': '@page { size: 80mm auto; margin: 3mm; }',
  'thermal-58': '@page { size: 58mm auto; margin: 2mm; }',
}

export function usePrint() {

  const print = useCallback((
    contentRef: React.RefObject<HTMLElement>,
    opts: {
      size?: PrintSize; copies?: number
      voucherNo?: string; type?: string
      partyName?: string; amount?: number; date?: string
    } = {}
  ) => {
    const { size = 'a4', copies = 1, voucherNo = '', type = '', partyName, amount = 0, date = '' } = opts
    const el = contentRef.current
    if (!el) { console.warn('[usePrint] contentRef is null'); return }

    // Remove any previous print root
    document.getElementById('erp-print-root')?.remove()

    // Create a print container with fully inlined styles
    const printRoot = document.createElement('div')
    printRoot.id = 'erp-print-root'
    printRoot.style.cssText = 'display:none'

    // Add print-specific style tag
    const styleTag = document.createElement('style')
    styleTag.textContent = `
      ${PAGE_CSS[size]}
      @media print {
        body > *:not(#erp-print-root) { display: none !important; }
        #erp-print-root {
          display: block !important;
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #000 !important;
          background: #fff !important;
          font-size: ${size === 'a4' ? '12pt' : '9pt'};
        }
        #erp-print-root * {
          color: #000 !important;
          border-color: #000 !important;
          background-color: transparent !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #erp-print-root table {
          border-collapse: collapse;
          width: 100%;
        }
        #erp-print-root th, #erp-print-root td {
          border: 1px solid #000 !important;
          padding: 4px 6px;
        }
        #erp-print-root thead tr {
          background: #f0f0f0 !important;
          -webkit-print-color-adjust: exact;
        }
        .no-print { display: none !important; }
      }
    `
    document.head.appendChild(styleTag)

    // Clone content and inline all computed styles
    const clone = el.cloneNode(true) as HTMLElement
    inlineStyles(clone)

    // Build copies HTML
    const copiesHTML = Array.from({ length: copies }, (_, i) => {
      const copy = clone.cloneNode(true) as HTMLElement
      if (i > 0) copy.style.pageBreakBefore = 'always'
      // Add DUPLICATE watermark for extra copies
      if (i > 0) {
        const wm = document.createElement('div')
        wm.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:60pt;color:rgba(0,0,0,0.06);font-weight:bold;pointer-events:none;z-index:9999;'
        wm.textContent = 'DUPLICATE'
        copy.insertBefore(wm, copy.firstChild)
      }
      return copy.outerHTML
    }).join('')

    printRoot.innerHTML = copiesHTML
    document.body.appendChild(printRoot)

    // Small delay to let the DOM settle, then print
    requestAnimationFrame(() => {
      window.print()
      window.onafterprint = () => {
        printRoot.remove()
        styleTag.remove()
        window.onafterprint = null
      }
      // Fallback cleanup if onafterprint doesn't fire
      setTimeout(() => {
        printRoot.remove()
        styleTag.remove()
      }, 5000)
    })

    if (voucherNo) {
      addPrintHistory({ voucherNo, type, partyName, amount, date, copies })
    }
  }, [])

  const downloadPDF = useCallback((
    contentRef: React.RefObject<HTMLElement>,
    filename: string,
    opts: { size?: PrintSize } = {}
  ) => {
    // PDF = trigger print dialog with save-as-PDF instructions
    // This is the most reliable cross-browser approach
    print(contentRef, { ...opts, voucherNo: filename })
  }, [print])

  return { print, downloadPDF }
}

// ── Inline all computed styles to survive iframe/print context ─────────────────
function inlineStyles(el: Element) {
  if (!(el instanceof HTMLElement)) return

  try {
    const computed = window.getComputedStyle(el)
    const important: string[] = [
      'font-family','font-size','font-weight','color','background-color',
      'border','border-color','border-width','border-style',
      'padding','margin','text-align','display','width',
      'border-collapse','border-top','border-bottom','border-left','border-right',
    ]
    important.forEach(prop => {
      const val = computed.getPropertyValue(prop)
      if (val) {
        // Replace CSS variables with black/white defaults for print
        const resolved = val
          .replace(/var\(--[^)]+\)/g, prop.includes('color') || prop.includes('border') ? '#000' : 'transparent')
        ;(el.style as any)[prop.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())] = resolved
      }
    })
  } catch {}

  Array.from(el.children).forEach(child => inlineStyles(child))
}
