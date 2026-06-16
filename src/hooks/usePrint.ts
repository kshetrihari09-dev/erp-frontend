import { useRef, useCallback } from 'react'

/**
 * usePrint — trigger a clean window.print() for a React ref element.
 * Only the element's HTML is printed; sidebar and chrome are excluded.
 */
export function usePrint() {
  const printRef = useRef<HTMLDivElement>(null)

  const print = useCallback((title = 'Document') => {
    const el = printRef.current
    if (!el) return

    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>${title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com"/>
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'DM Sans', sans-serif; font-size: 12px; color: #111; background: #fff; }
            @media print { @page { margin: 8mm; size: A4; } }
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }, [])

  return { printRef, print }
}
