import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Printer, Download, Search, X, Loader2, Package, QrCode } from 'lucide-react'
import { productsAPI } from '@/services/api'
import type { Product } from '@/types'
import { Button, Empty } from '@/components/ui'
import QRCodeLabel from '@/components/barcode/QRCodeLabel'
import useAuthStore from '@/store/authStore'
import { buildProductQrPayload } from '@/utils/productQr'

/* ── Label sizes ──────────────────────────────────────────────────────────
 * Same presets as BarcodePrintPage — common thermal/inkjet label stock
 * sizes for pharmacy price labels. "Custom" unlocks the two mm inputs
 * below the preset row.
 */
const LABEL_PRESETS = [
  { key: '50x25', label: '50 × 25 mm', w: 50, h: 25 },
  { key: '60x30', label: '60 × 30 mm', w: 60, h: 30 },
  { key: '70x35', label: '70 × 35 mm', w: 70, h: 35 },
  { key: 'custom', label: 'Custom',     w: 0,  h: 0  },
] as const

type PresetKey = typeof LABEL_PRESETS[number]['key']

const PAGE_WIDTH_MM  = 210   // A4 portrait
const PAGE_MARGIN_MM = 8

interface LabelItem {
  product: Product
  qty: number
}

export default function QRCodePrintPage() {
  const [searchParams] = useSearchParams()
  // Whichever account is currently logged in — this is what gets baked
  // into every generated QR's `accountId`, so the scanner can tell a QR
  // printed here apart from one printed under a different account. See
  // utils/productQr.ts for the full payload shape and rationale.
  const accountId = useAuthStore(s => s.company?.id)

  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [items, setItems]     = useState<LabelItem[]>([])

  const [preset, setPreset]   = useState<PresetKey>('50x25')
  const [customW, setCustomW] = useState(40)
  const [customH, setCustomH] = useState(20)

  const sheetRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  // ── Dropdown position — portaled to document.body ───────────────────────
  // Same ancestor-clipping fix as BarcodePrintPage/ProductSearchCell: the
  // search box sits inside a `.table-card` with `overflow: hidden`, so a
  // plain absolute dropdown gets silently clipped at the card's bottom
  // edge. Portaling to document.body with a real computed position avoids
  // that.
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const updateDropdownPosition = useCallback(() => {
    const el = searchWrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => {
    if (!query.trim()) return
    updateDropdownPosition()
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true)
      window.removeEventListener('resize', updateDropdownPosition)
    }
  }, [query, updateDropdownPosition])

  // ── Prefix search, debounced (mirrors ProductSearchCell's pattern) ──────
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await productsAPI.search(q, 20)
        if (!cancelled) setResults((res.data as any)?.data || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  // ── Deep-link from Products list: /qrcode-print?productId=<id> ──────────
  // pre-adds that one product so "QR" on a product row lands here with it
  // already queued instead of making the user search for it again.
  useEffect(() => {
    const pid = searchParams.get('productId')
    if (!pid) return
    productsAPI.get(pid).then(res => {
      const p = res.data?.data as Product | undefined
      if (p) addProduct(p)
    }).catch(() => {})
    // Only run once on mount — deliberately not reacting to searchParams
    // changing again afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addProduct(p: Product) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.product.id === p.id)
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { product: p, qty: 1 }]
    })
    setQuery('')
    setResults([])
  }

  function updateQty(productId: string, qty: number) {
    setItems(prev => prev.map(i => i.product.id === productId ? { ...i, qty: Math.max(1, qty) } : i))
  }

  function removeItem(productId: string) {
    setItems(prev => prev.filter(i => i.product.id !== productId))
  }

  const { widthMm, heightMm } = useMemo(() => {
    if (preset === 'custom') return { widthMm: Math.max(10, customW), heightMm: Math.max(10, customH) }
    const p = LABEL_PRESETS.find(p => p.key === preset)!
    return { widthMm: p.w, heightMm: p.h }
  }, [preset, customW, customH])

  // One flat entry per physical label to print (qty=3 → 3 entries).
  const flatLabels = useMemo(
    () => items.flatMap(item => Array.from({ length: item.qty }, (_, i) => ({ item, i }))),
    [items]
  )
  const totalLabels = flatLabels.length

  const GRID_GAP_MM = 2
  const cols = Math.max(1, Math.floor((PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2 + GRID_GAP_MM) / (widthMm + GRID_GAP_MM)))
  // The grid's own box, sized to exactly fit its columns — without this the
  // container (a block-level element) defaults to 100% of its parent card,
  // and `justifyContent:'start'` only shifts the *tracks* inside that
  // oversized box, leaving genuine dead space to the right of the last
  // column instead of actually using it for another label.
  const gridWidthMm = cols * widthMm + (cols - 1) * GRID_GAP_MM

  // ── Print — opens a popup window with only the label sheet + print CSS,
  // same "clean print" approach as BarcodePrintPage. All label styling is
  // inline (see QRCodeLabel), so it survives the innerHTML clone into the
  // popup unlike Tailwind classes would. The QR itself is a <canvas>, and
  // canvas pixel data does NOT survive innerHTML cloning — so we first
  // swap each canvas for a data-URL <img> of the same size, then restore
  // the canvases afterward so the live page keeps working.
  function printSheet() {
    const el = sheetRef.current
    if (!el || totalLabels === 0) return
    const canvases = Array.from(el.querySelectorAll('canvas'))
    const dataUrls = canvases.map(c => c.toDataURL('image/png'))

    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes')
    if (!win) return

    // Build the printable HTML with <img> stand-ins for the canvases so
    // the QR pixels actually make it into the popup document.
    const clone = el.cloneNode(true) as HTMLElement
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'))
    cloneCanvases.forEach((c, i) => {
      const img = document.createElement('img')
      img.src = dataUrls[i]
      img.style.cssText = c.getAttribute('style') || ''
      c.replaceWith(img)
    })

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>QR Code Labels</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { background: #fff; }
            /* Same grid the live preview uses (see the JSX below) — kept
               here too, and repeated !important under @media print,
               purely as a defensive belt-and-suspenders: the inline
               style attribute on the cloned node already carries the
               real column count/width, this just guarantees a browser
               can't silently fall back to block-stacking the children
               if anything about the clone's inline style gets dropped. */
            .qr-print-grid { display: grid; width: 100%; }
            @media print {
              @page { size: A4; margin: ${PAGE_MARGIN_MM}mm; }
              .qr-print-grid { display: grid !important; }
            }
          </style>
        </head>
        <body>${clone.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // ── Download PDF — html2pdf.js (html2canvas + jsPDF), same library
  // already used by BarcodePrintPage and utils/htmlToPdfBlob.ts. Unlike
  // the print path, html2canvas rasterizes the live DOM directly (no
  // innerHTML clone), so the <canvas> QR codes capture correctly as-is.
  //
  // html2canvas-specific workaround: html2canvas does not reliably
  // compute CSS Grid track layout — it's a long-standing upstream
  // limitation (the bundled version here is no exception) where a
  // `display: grid` container's children get captured stacked in a
  // single column with the rest of the container's width left blank,
  // regardless of how many grid-template-columns are defined. That's
  // the exact "one column, wasted page width" bug being fixed here, and
  // it only shows up in this exported PDF — the live on-screen preview
  // and the native browser print (both real Chromium layout, no
  // html2canvas involved) already render the grid correctly.
  //
  // Fix: right before the capture, swap the SAME element from
  // `display:grid` to `display:flex; flex-wrap:wrap` with the columns'
  // fixed mm width preserved on each child. For same-size items wrapped
  // at a fixed container width, flex-wrap produces a pixel-identical
  // row/column layout to the grid — html2canvas handles flex-wrap
  // correctly — then it's swapped back immediately after so the live
  // page (and the next print/PDF) keeps using the real grid.
  async function downloadPdf() {
    const el = sheetRef.current
    if (!el || totalLabels === 0) return
    setPdfBusy(true)
    const prevDisplay = el.style.display
    const prevWrap    = el.style.flexWrap
    try {
      el.style.display  = 'flex'
      el.style.flexWrap = 'wrap'
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: PAGE_MARGIN_MM,
          filename: 'qrcode-labels.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .save()
    } finally {
      el.style.display  = prevDisplay
      el.style.flexWrap = prevWrap
      setPdfBusy(false)
    }
  }

  return (
    <div className="qrp-page">
      <style>{`
        /* ── QR Code Print — mobile/tablet responsive (self-contained, additive) ── */
        .qrp-page { max-width: 100%; overflow-x: hidden; }

        /* Sidebar (search/size/queue) + preview: side-by-side on desktop,
           stacked on tablet/mobile so the preview isn't squeezed into a
           sliver next to a fixed-min-width sidebar. */
        .qrp-layout-grid { grid-template-columns: minmax(280px, 380px) 1fr; }
        @media (max-width: 900px) {
          .qrp-layout-grid { grid-template-columns: 1fr !important; }
        }

        /* Header action buttons: wrap instead of overflowing the header,
           and stack full-width one under the other once the row is too
           narrow for both side by side (matches .page-header's own
           480px breakpoint elsewhere in the app, but scoped so both
           buttons stack together rather than fighting for width). */
        .qrp-header-actions { flex-wrap: wrap; }
        @media (max-width: 560px) {
          .qrp-header-actions { width: 100%; }
          .qrp-header-actions > button { flex: 1 1 auto; }
        }
        @media (max-width: 400px) {
          .qrp-header-actions { flex-direction: column; align-items: stretch; }
          .qrp-header-actions > button { width: 100%; }
        }

        /* Preview sheet: allow horizontal scroll on narrow screens instead
           of clipping/overflowing the card — the label grid's real mm
           widths don't shrink (that would misrepresent the print output),
           so a horizontal scrollbar is the correct fallback, not a bug. */
        .qrp-preview-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

        @media (max-width: 480px) {
          .qrp-page .table-card { padding: 12px !important; }
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Inventory</div>
          <h1 className="page-title">QR Code Print</h1>
        </div>
        <div className="flex items-center gap-2 qrp-header-actions">
          <Button variant="secondary" icon={pdfBusy ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
            onClick={downloadPdf} disabled={pdfBusy || totalLabels === 0}>
            Download PDF
          </Button>
          <Button variant="primary" icon={<Printer size={14}/>} onClick={printSheet} disabled={totalLabels === 0}>
            Print A4 Sheet
          </Button>
        </div>
      </div>

      <div className="grid gap-4 qrp-layout-grid">
        {/* ── Left: search + queued items + label size ─────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="table-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Search Product</div>
            <div className="relative" ref={searchWrapRef}>
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <Search size={14} className="text-[var(--text-4)]" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Type product name…"
                  className="flex-1 outline-none bg-transparent text-sm"
                />
                {searching && <Loader2 size={14} className="animate-spin text-[var(--text-4)]" />}
              </div>

              {query.trim() && dropdownPos && createPortal(
                <div
                  className="max-h-72 overflow-y-auto rounded-lg border bg-[var(--surface)] shadow-lg"
                  style={{
                    position: 'fixed',
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    zIndex: 1000,
                    borderColor: 'var(--border)',
                  }}
                >
                  {results.length === 0 && !searching && (
                    <div className="px-3 py-3 text-xs text-[var(--text-4)]">No products found</div>
                  )}
                  {results.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-[var(--text-4)] font-mono shrink-0">{p.item_code}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>

          <div className="table-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">Label Size</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {LABEL_PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: preset === p.key ? 'var(--brand)' : 'var(--border)',
                    background: preset === p.key ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'transparent',
                    color: preset === p.key ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-3)]">Width (mm)</label>
                <input type="number" min={10} value={customW} onChange={e => setCustomW(Number(e.target.value) || 0)}
                  className="erp-input" style={{ width: 80, flex: '0 0 auto' }} />
                <label className="text-xs text-[var(--text-3)]">Height (mm)</label>
                <input type="number" min={10} value={customH} onChange={e => setCustomH(Number(e.target.value) || 0)}
                  className="erp-input" style={{ width: 80, flex: '0 0 auto' }} />
              </div>
            )}
          </div>

          <div className="table-card p-4 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)] mb-2">
              Queued Products {totalLabels > 0 && <span className="text-[var(--text-4)] font-normal normal-case">· {totalLabels} label{totalLabels === 1 ? '' : 's'}</span>}
            </div>
            {items.length === 0 ? (
              <Empty message="Search and add a product to begin" icon={<Package size={28}/>} />
            ) : (
              <div className="flex flex-col gap-2">
                {items.map(item => (
                  <div key={item.product.id} className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{item.product.name}</div>
                      <div className="text-[10px] text-[var(--text-4)] font-mono">{item.product.barcode || item.product.item_code}</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e => updateQty(item.product.id, Number(e.target.value) || 1)}
                      className="erp-input text-center"
                      style={{ width: 56, flex: '0 0 auto' }}
                    />
                    <button onClick={() => removeItem(item.product.id)} className="text-[var(--text-4)] hover:text-red-500 p-1">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: live preview / actual print & PDF source ───────────── */}
        <div className="table-card p-4 overflow-x-auto qrp-preview-scroll">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)] mb-3">
            Preview — {cols} per row on A4
          </div>
          {totalLabels === 0 ? (
            <Empty message="No labels queued yet" icon={<QrCode size={28}/>} />
          ) : (
            <div
              ref={sheetRef}
              className="qr-print-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${widthMm}mm)`,
                gap: `${GRID_GAP_MM}mm`,
                width: `${gridWidthMm}mm`,
              }}
            >
              {flatLabels.map(({ item, i }) => (
                <QRCodeLabel
                  key={`${item.product.id}-${i}`}
                  name={item.product.name}
                  price={item.product.sales_rate}
                  code={accountId ? buildProductQrPayload(item.product, accountId) : (item.product.barcode || item.product.item_code)}
                  widthMm={widthMm}
                  heightMm={heightMm}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
