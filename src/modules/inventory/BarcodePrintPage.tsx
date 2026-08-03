import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Printer, Download, Search, X, Loader2, Package } from 'lucide-react'
import { productsAPI } from '@/services/api'
import type { Product } from '@/types'
import { Button, Empty } from '@/components/ui'
import BarcodeLabel from '@/components/barcode/BarcodeLabel'

/* ── Label sizes ──────────────────────────────────────────────────────────
 * Presets match the common thermal/inkjet label stock sizes for pharmacy
 * price labels. "Custom" unlocks the two mm inputs below the preset row.
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

export default function BarcodePrintPage() {
  const [searchParams] = useSearchParams()

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
  // The left-hand search box lives inside a `.table-card`, and that class
  // has `overflow: hidden` (rounded-corner clipping). A plain
  // `position: absolute` dropdown nested inside it gets silently clipped
  // at the card's bottom edge — the search itself works fine (results
  // populate), the dropdown is just invisible, which reads exactly like
  // "search isn't working." ProductSearchCell hit the same ancestor-
  // clipping issue and fixed it by portaling to document.body with a
  // real computed position; mirrored here.
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

  // ── Deep-link from Products list: /barcode-print?productId=<id> ─────────
  // pre-adds that one product so "Print" on a product row lands here with
  // it already queued instead of making the user search for it again.
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

  const cols = Math.max(1, Math.floor((PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2) / widthMm))

  // ── Print — opens a popup window with only the label sheet + print CSS,
  // same "clean print" approach as hooks/usePrint.ts, but with its own
  // @page/grid rules since the shared hook doesn't take extra CSS. All
  // label styling is inline (see BarcodeLabel), so it survives the
  // innerHTML clone into the popup unlike Tailwind classes would.
  function printSheet() {
    const el = sheetRef.current
    if (!el || totalLabels === 0) return
    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Barcode Labels</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { background: #fff; }
            @media print { @page { size: A4; margin: ${PAGE_MARGIN_MM}mm; } }
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // ── Download PDF — html2pdf.js (html2canvas + jsPDF), dynamically
  // imported so it doesn't add weight until actually used. Same library
  // already used by utils/htmlToPdfBlob.ts for Cloud Backup exports.
  async function downloadPdf() {
    const el = sheetRef.current
    if (!el || totalLabels === 0) return
    setPdfBusy(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: PAGE_MARGIN_MM,
          filename: 'barcode-labels.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .save()
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Inventory</div>
          <h1 className="page-title">Barcode Print</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={pdfBusy ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
            onClick={downloadPdf} disabled={pdfBusy || totalLabels === 0}>
            Download PDF
          </Button>
          <Button variant="primary" icon={<Printer size={14}/>} onClick={printSheet} disabled={totalLabels === 0}>
            Print A4 Sheet
          </Button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
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
                  className="erp-input w-20" />
                <label className="text-xs text-[var(--text-3)]">Height (mm)</label>
                <input type="number" min={10} value={customH} onChange={e => setCustomH(Number(e.target.value) || 0)}
                  className="erp-input w-20" />
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
                      className="erp-input w-16 text-center"
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
        <div className="table-card p-4 overflow-x-auto">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)] mb-3">
            Preview — {cols} per row on A4
          </div>
          {totalLabels === 0 ? (
            <Empty message="No labels queued yet" icon={<Printer size={28}/>} />
          ) : (
            <div
              ref={sheetRef}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${widthMm}mm)`,
                gap: '2mm',
                justifyContent: 'start',
              }}
            >
              {flatLabels.map(({ item, i }) => (
                <BarcodeLabel
                  key={`${item.product.id}-${i}`}
                  name={item.product.name}
                  price={item.product.sales_rate}
                  code={item.product.barcode || item.product.item_code}
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
