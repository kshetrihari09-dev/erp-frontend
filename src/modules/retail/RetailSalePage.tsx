/**
 * RetailSalePage.tsx — "Retail Sale": scan a medicine, cut its blister, drag the
 * pieces into the basket, then continue on the normal Sales invoice.
 *
 * Integration notes
 *  - Scanning, search, camera/QR and "not found" handling all reuse the same
 *    UnifiedProductInput + ProductNotFoundDialog the Sales page uses.
 *  - The blister is linked to the product through three optional product
 *    fields (tablets_per_strip, tablet_shape, tablet_colors), set on the
 *    Products page.
 *  - NOTHING is posted from this page. "Continue to Sales invoice" only hands
 *    the basket to /sales, which fills its normal invoice rows; the existing
 *    batch selection, customer, payment, discount, save and print workflow
 *    then applies unchanged.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scissors, Trash2, AlertTriangle, ArrowRight } from 'lucide-react'
import UnifiedProductInput, { type UnifiedProductInputHandle } from '@/components/forms/UnifiedProductInput'
import ProductNotFoundDialog from '@/components/scanner/ProductNotFoundDialog'
import { productsAPI } from '@/services/api'
import { playSuccessBeep, playErrorBeep } from '@/utils/beep'
import useUIStore from '@/store/uiStore'
import { Button, Alert } from '@/components/ui'
import { PATHS } from '@/constants'
import { fmtN } from '@/utils'
import type { Product } from '@/types'
import BlisterWorkbench from './BlisterWorkbench'
import { isShape, parseColors, MIN_PACK, MAX_PACK, type ShapeName } from './blisterGeometry'
import {
  RETAIL_HANDOFF_KEY, addToBasket, defaultPricePerTablet, isValidPrice, lineTotal, overStock, toHandoff, totals,
  type BasketLine,
} from './retailBasket'

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4'

interface Loaded { product: Product; pack: number; shape: ShapeName; colors: string[]; key: number }

export default function RetailSalePage() {
  const navigate = useNavigate()
  const { error: toastError, info: toastInfo } = useUIStore()
  const inputRef = useRef<UnifiedProductInputHandle>(null)
  const basketRef = useRef<HTMLDivElement>(null)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [needsSetup, setNeedsSetup] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [lines, setLines] = useState<BasketLine[]>([])
  const [priceText, setPriceText] = useState<Record<string, string>>({})
  const [hot, setHot] = useState(false)
  const loadSeq = useRef(0)
  const loadedRef = useRef<Loaded | null>(null)
  loadedRef.current = loaded

  // A scanned/picked product → hydrate the full record (GET /products/:id returns
  // every column incl. the retail profile and current stock) → open a fresh blister.
  const handleProduct = useCallback(async (p: Product) => {
    let full: Product = p
    try { full = (await productsAPI.get(p.id)).data.data ?? p } catch { /* offline: use the scanned record */ }
    const pack = Number(full.tablets_per_strip)
    if (!Number.isInteger(pack) || pack < MIN_PACK || pack > MAX_PACK) {
      playErrorBeep(); setLoaded(null); setNeedsSetup(full); return
    }
    playSuccessBeep(); setNeedsSetup(null)
    // Loading another medicine never touches the basket.
    setLoaded({ product: full, pack, shape: isShape(full.tablet_shape) ? full.tablet_shape : 'round', colors: parseColors(full.tablet_colors), key: ++loadSeq.current })
    requestAnimationFrame(() => inputRef.current?.focusSilently())
  }, [])

  const handleNotFound = useCallback((code: string) => { playErrorBeep(); setNotFound(code) }, [])

  // One call per successful drop / "Add" press (BlisterWorkbench removes the piece first).
  const handleAddPiece = useCallback((tablets: number) => {
    const cur = loadedRef.current; if (!cur) return
    setLines(prev => addToBasket(prev, cur.product, cur.pack, tablets))
  }, [])

  const t = useMemo(() => totals(lines), [lines])
  const short = useMemo(() => overStock(lines), [lines])

  function commitPrice(l: BasketLine) {
    const raw = priceText[l.product.id]; if (raw === undefined) return
    const v = raw.trim() === '' ? NaN : Number(raw)
    if (isValidPrice(v)) setLines(prev => prev.map(x => (x.product.id === l.product.id ? { ...x, ppt: v } : x)))
    else toastError('Invalid price', 'Price per tablet must be a number, 0 or more.')
    setPriceText(({ [l.product.id]: _drop, ...rest }) => rest)
  }

  function proceed() {
    if (!lines.length) return
    if (lines.some(l => !isValidPrice(l.ppt) || l.tablets <= 0)) { toastError('Check the basket', 'A line has an invalid price or quantity.'); return }
    if (short.length) { toastError('Not enough stock', `${short.map(l => l.product.name).join(', ')} — reduce the quantity first.`); return }
    try { sessionStorage.setItem(RETAIL_HANDOFF_KEY, JSON.stringify({ at: Date.now(), items: toHandoff(lines) })) }
    catch { toastError('Could not hand over the basket', 'Browser storage is unavailable.'); return }
    navigate(PATHS.SALES)
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Scissors size={18} className="text-brand" />
        <h1 className="text-lg font-bold text-[var(--text)]">Retail Sale</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-start">
        {/* ── workbench ─────────────────────────────────────────────── */}
        <section className={card}>
          <UnifiedProductInput
            ref={inputRef} context="sales" autoFocus
            onProductResolved={handleProduct} onNotFound={handleNotFound}
            onAccountMismatch={msg => { playErrorBeep(); toastError('QR code not valid here', msg) }}
            placeholder="Scan or search a medicine…"
          />

          {needsSetup && (
            <div className="mt-3">
              <Alert type="warning" message={
                <span>
                  <b>{needsSetup.name}</b> has no “Tablets per strip” set (2–{MAX_PACK}), so its blister can’t be shown.{' '}
                  <Link to={PATHS.PRODUCTS} className="underline font-semibold">Open Products</Link> to set it, along with the tablet shape and colour.
                </span>
              } />
            </div>
          )}

          {loaded ? (
            <>
              <div className="mt-3 text-sm text-[var(--text-3)]">
                <b className="text-[var(--text)]">{loaded.product.name}</b> · {loaded.product.barcode || loaded.product.item_code} · NPR {fmtN(loaded.product.sales_rate)} per strip of {loaded.pack}
                {' · '}NPR {fmtN(defaultPricePerTablet(loaded.product, loaded.pack), 4)} per tablet
                {Number.isFinite(Number(loaded.product.current_stock)) && <> · stock {fmtN(loaded.product.current_stock, 0)} {loaded.product.unit}</>}
              </div>
              <div className="mt-3">
                <BlisterWorkbench
                  resetKey={loaded.key} packSize={loaded.pack} shape={loaded.shape} colors={loaded.colors}
                  getDropRect={() => basketRef.current?.getBoundingClientRect() ?? null}
                  onAddPiece={handleAddPiece} onHotChange={setHot}
                  onMessage={m => toastInfo(m)}
                />
              </div>
            </>
          ) : !needsSetup && (
            <p className="mt-4 text-sm text-[var(--text-3)]">Scan a medicine to open its blister. Each scan opens a fresh, uncut blister; the basket is kept.</p>
          )}
        </section>

        {/* ── basket ────────────────────────────────────────────────── */}
        <section ref={basketRef} className={card}
          style={hot ? { borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 10%, var(--surface))' } : { borderStyle: 'dashed', borderWidth: 2 }}>
          <div className="text-sm font-bold text-[var(--text)] mb-2">Billing basket</div>
          {!lines.length && <p className="text-sm text-[var(--text-3)]">Drag a cut piece here, or tap it and press “Add to basket”.</p>}

          {lines.map(l => (
            <div key={l.product.id} className="border-t border-[var(--border)] py-2.5 grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-[var(--text)]">{l.product.name}</div>
                  <div className="text-xs text-[var(--text-3)]">{l.product.barcode || l.product.item_code} · {l.pieces} piece{l.pieces > 1 ? 's' : ''} · {l.tablets} tablet{l.tablets > 1 ? 's' : ''}</div>
                </div>
                <button type="button" aria-label={`Remove ${l.product.name}`} onClick={() => setLines(p => p.filter(x => x.product.id !== l.product.id))}
                  className="p-1.5 rounded-md text-[var(--text-3)] hover:bg-[var(--surface-3)]"><Trash2 size={15} /></button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-[var(--text-3)] flex items-center gap-1.5">NPR / tablet
                  <input type="number" min={0} step="0.0001" inputMode="decimal" className="erp-input w-24 !py-1"
                    value={priceText[l.product.id] ?? String(+l.ppt.toFixed(4))}
                    onChange={e => setPriceText(s => ({ ...s, [l.product.id]: e.target.value }))}
                    onBlur={() => commitPrice(l)} onKeyDown={e => { if (e.key === 'Enter') commitPrice(l) }} />
                </label>
                <b className="tabular-nums text-sm">NPR {fmtN(lineTotal(l))}</b>
              </div>
              {short.includes(l) && (
                <div className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> Needs {fmtN(l.tablets / l.pack, 2)} strips; only {fmtN(l.product.current_stock, 2)} in stock.</div>
              )}
            </div>
          ))}

          {!!lines.length && (
            <div className="border-t-2 border-[var(--border)] pt-2 mt-1">
              <div className="text-xs text-[var(--text-3)]">{t.tablets} tablets · {t.pieces} piece{t.pieces > 1 ? 's' : ''} · {t.items} item{t.items > 1 ? 's' : ''}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">Grand total</span>
                <span className="text-xl font-bold text-brand tabular-nums">NPR {fmtN(t.grand)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" size="sm" disabled={!lines.length} iconRight={<ArrowRight size={14} />} onClick={proceed}>Continue to Sales invoice</Button>
            <Button variant="secondary" size="sm" disabled={!lines.length} onClick={() => setLines([])}>Clear basket</Button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-4)]">Nothing is saved or posted here. Loose tablets are billed as a fraction of a strip on the Sales invoice, where you pick the batch and confirm.</p>
        </section>
      </div>

      <ProductNotFoundDialog code={notFound} onClose={() => { setNotFound(null); requestAnimationFrame(() => inputRef.current?.focus()) }} />
    </div>
  )
}
