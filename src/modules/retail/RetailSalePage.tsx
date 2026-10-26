/**
 * RetailSalePage.tsx — "Retail Sale": scan a medicine, then bill it the way it is
 * packaged — cut a blister into pieces, or drag a whole bottle / tube — into the
 * basket, and continue on the normal Sales invoice.
 *
 * Integration notes
 *  - Scanning, search, camera/QR and "not found" handling all reuse the same
 *    UnifiedProductInput + ProductNotFoundDialog the Sales page uses.
 *  - Packaging comes from the product's own data (unit + Retail Sale profile),
 *    see packaging.ts. It is never guessed: ambiguous products ask an
 *    authorised user (products.update) to pick the type for that scan.
 *  - Each scan REPLACES the bench: a bottle or tube never inherits cutting from
 *    a previous blister, because the cutting component is simply not mounted.
 *  - NOTHING is posted from this page. "Continue to Sales invoice" only hands
 *    the basket to /sales, which fills its normal invoice rows; batch/expiry
 *    selection, customer, tax, discount, stock deduction, save and posting then
 *    run exactly as they always do.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scissors, Trash2, AlertTriangle, ArrowRight } from 'lucide-react'
import UnifiedProductInput, { type UnifiedProductInputHandle } from '@/components/forms/UnifiedProductInput'
import ProductNotFoundDialog from '@/components/scanner/ProductNotFoundDialog'
import { productsAPI } from '@/services/api'
import { playSuccessBeep, playErrorBeep } from '@/utils/beep'
import useUIStore from '@/store/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { Button, Alert } from '@/components/ui'
import { PATHS } from '@/constants'
import { fmtN } from '@/utils'
import type { Product } from '@/types'
import BlisterWorkbench from './BlisterWorkbench'
import IntactPackage from './IntactPackage'
import { isShape, parseColors, MIN_PACK, MAX_PACK, type ShapeName } from './blisterGeometry'
import { PACKAGING_INSTRUCTION, PACKAGING_LABEL, isBulk, resolvePackaging, validPack, type PackagingType } from './packaging'
import {
  MAX_QTY, RETAIL_HANDOFF_KEY, addToBasket, addUnitToBasket, defaultPricePerTablet, defaultUnitPrice, isValidPrice, kindOf,
  lineTotal, overStock, parseQuantity, toHandoff, totals, type BasketLine,
} from './retailBasket'

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4'
// Whole packages pluralise (2 bottles); measured/abbreviated units do not (2.5 Kg, 3 Pcs).
const NO_PLURAL = ['kg', 'ltr', 'pcs']
const qtyLabel = (n: number, unit: string) => `${+n.toFixed(3)} ${NO_PLURAL.includes(unit.toLowerCase()) || n === 1 || !Number.isInteger(n) ? unit : unit.toLowerCase() + 's'}`

interface Loaded {
  product: Product
  packaging: PackagingType
  key: number
  pack: number            // tablets per strip (blister only; 1 otherwise)
  shape: ShapeName
  colors: string[]
}

export default function RetailSalePage() {
  const navigate = useNavigate()
  const { error: toastError, info: toastInfo } = useUIStore()
  const { can } = usePermission()
  const canChoose = can('products.update')
  const inputRef = useRef<UnifiedProductInputHandle>(null)
  const basketRef = useRef<HTMLDivElement>(null)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [needsSetup, setNeedsSetup] = useState<Product | null>(null)
  const [ambiguous, setAmbiguous] = useState<{ product: Product; reason: string } | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [lines, setLines] = useState<BasketLine[]>([])
  const [priceText, setPriceText] = useState<Record<string, string>>({})
  const [hot, setHot] = useState(false)
  const [bulkQty, setBulkQty] = useState('1')          // quantity to add per drop for Kg / Ltr products
  const bulkQtyRef = useRef('1')
  bulkQtyRef.current = bulkQty
  const loadSeq = useRef(0)
  const loadedRef = useRef<Loaded | null>(null)
  loadedRef.current = loaded

  // Opens the bench for `type`. Replaces whatever was there before.
  const openBench = useCallback((full: Product, type: PackagingType) => {
    const pack = Number(full.tablets_per_strip)
    if (type === 'blister' && !validPack(pack)) { setNeedsSetup(full); setAmbiguous(null); setLoaded(null); return }
    setNeedsSetup(null); setAmbiguous(null)
    setLoaded({
      product: full, packaging: type, key: ++loadSeq.current,
      pack: type === 'blister' ? pack : 1,
      shape: isShape(full.tablet_shape) ? full.tablet_shape : 'round',
      colors: parseColors(full.tablet_colors),
    })
    setHot(false); setBulkQty('1')
    requestAnimationFrame(() => inputRef.current?.focusSilently())
  }, [])

  // A scanned/picked product → hydrate the full record (GET /products/:id returns every
  // column incl. the retail profile and current stock) → decide the packaging.
  const handleProduct = useCallback(async (p: Product) => {
    let full: Product = p
    try { full = (await productsAPI.get(p.id)).data.data ?? p } catch { /* offline: use the scanned record */ }
    const res = resolvePackaging(full)
    if (res.status === 'ok') { playSuccessBeep(); openBench(full, res.type); return }
    playErrorBeep(); setLoaded(null)
    if (res.status === 'needs-setup') { setAmbiguous(null); setNeedsSetup(full) }
    else { setNeedsSetup(null); setAmbiguous({ product: full, reason: res.reason }) }
  }, [openBench])

  const handleNotFound = useCallback((code: string) => { playErrorBeep(); setNotFound(code) }, [])

  // One call per successful drop / "Add" press. The bench guarantees at-most-once.
  const handleAddPiece = useCallback((tablets: number) => {
    const cur = loadedRef.current; if (!cur || cur.packaging !== 'blister') return
    setLines(prev => addToBasket(prev, cur.product, cur.pack, tablets))
  }, [])
  const handleAddUnit = useCallback(() => {
    const cur = loadedRef.current; if (!cur || cur.packaging === 'blister') return
    let qty = 1
    if (isBulk(cur.packaging)) {
      const q = parseQuantity(bulkQtyRef.current)
      if (q === null) { toastError('Check the quantity', `Enter a quantity above 0 (up to ${MAX_QTY}).`); return }
      qty = q
    }
    setLines(prev => addUnitToBasket(prev, cur.product, undefined, qty))
    toastInfo(`Added ${qtyLabel(qty, cur.product.unit || PACKAGING_LABEL[cur.packaging])}`)
  }, [toastInfo, toastError])

  const t = useMemo(() => totals(lines), [lines])
  const short = useMemo(() => overStock(lines), [lines])
  const lineKey = (l: BasketLine) => `${l.product.id}:${kindOf(l)}`

  function commitPrice(l: BasketLine) {
    const raw = priceText[lineKey(l)]; if (raw === undefined) return
    const v = raw.trim() === '' ? NaN : Number(raw)
    if (isValidPrice(v)) setLines(prev => prev.map(x => (lineKey(x) === lineKey(l) ? { ...x, ppt: v } : x)))
    else toastError('Invalid price', 'Price must be a number, 0 or more.')
    setPriceText(prev => { const { [lineKey(l)]: _drop, ...rest } = prev; return rest })
  }

  function proceed() {
    if (!lines.length) return
    if (lines.some(l => !isValidPrice(l.ppt) || (kindOf(l) === 'unit' ? (l.units ?? 0) : l.tablets) <= 0)) { toastError('Check the basket', 'A line has an invalid price or quantity.'); return }
    if (short.length) { toastError('Not enough stock', `${short.map(l => l.product.name).join(', ')} — reduce the quantity first.`); return }
    try { sessionStorage.setItem(RETAIL_HANDOFF_KEY, JSON.stringify({ at: Date.now(), items: toHandoff(lines) })) }
    catch { toastError('Could not hand over the basket', 'Browser storage is unavailable.'); return }
    navigate(PATHS.SALES)
  }

  const unitName = loaded ? (loaded.product.unit || PACKAGING_LABEL[loaded.packaging]) : ''

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Scissors size={18} className="text-brand" />
        <h1 className="text-lg font-bold text-[var(--text)]">Retail Sale</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-start">
        {/* ── bench ─────────────────────────────────────────────────── */}
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
                  <b>{needsSetup.name}</b> is a strip but has no “Tablets per strip” set ({MIN_PACK}–{MAX_PACK}), so its blister can’t be shown.{' '}
                  <Link to={PATHS.PRODUCTS} className="underline font-semibold">Open Products</Link> to set it, along with the tablet shape and colour.
                </span>
              } />
            </div>
          )}

          {ambiguous && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
              <div className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Packaging type unclear for {ambiguous.product.name}</div>
              <p className="mt-1">{ambiguous.reason} Nothing is shown until the packaging is confirmed.</p>
              {canChoose ? (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PACKAGING_LABEL) as PackagingType[]).map(ty => (
                      <Button key={ty} variant="secondary" size="sm"
                        disabled={ty === 'blister' && !validPack(Number(ambiguous.product.tablets_per_strip))}
                        onClick={() => openBench(ambiguous.product, ty)}>
                        {PACKAGING_LABEL[ty]}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs">
                    This choice applies to this scan only. {!validPack(Number(ambiguous.product.tablets_per_strip)) && `Blister needs “Tablets per strip” (${MIN_PACK}–${MAX_PACK}) on the product. `}
                    To fix it permanently, correct the product’s Unit in <Link to={PATHS.PRODUCTS} className="underline font-semibold">Products</Link>.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs">Ask a manager or admin to confirm the packaging type (or correct the product’s Unit).</p>
              )}
            </div>
          )}

          {loaded ? (
            <>
              <div className="mt-3 text-sm text-[var(--text-3)]">
                <b className="text-[var(--text)]">{loaded.product.name}</b> · {loaded.product.barcode || loaded.product.item_code}
                {loaded.packaging === 'blister'
                  ? <> · NPR {fmtN(loaded.product.sales_rate)} per strip of {loaded.pack} · NPR {fmtN(defaultPricePerTablet(loaded.product, loaded.pack), 4)} per tablet</>
                  : <> · NPR {fmtN(defaultUnitPrice(loaded.product))} per {unitName.toLowerCase()}</>}
                {Number.isFinite(Number(loaded.product.current_stock)) && <> · stock {fmtN(loaded.product.current_stock, 0)} {loaded.product.unit}</>}
              </div>

              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--text-2)]" data-packaging={loaded.packaging}>
                <span className="uppercase tracking-wide text-[var(--text-3)]">{PACKAGING_LABEL[loaded.packaging]}</span>
                <span>{PACKAGING_INSTRUCTION[loaded.packaging]}</span>
              </div>

              <div className="mt-3">
                {loaded.packaging === 'blister' ? (
                  <BlisterWorkbench
                    key={`b-${loaded.key}`}
                    resetKey={loaded.key} packSize={loaded.pack} shape={loaded.shape} colors={loaded.colors}
                    getDropRect={() => basketRef.current?.getBoundingClientRect() ?? null}
                    onAddPiece={handleAddPiece} onHotChange={setHot}
                    onMessage={m => toastInfo(m)}
                  />
                ) : (
                  <>
                    {isBulk(loaded.packaging) && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <label className="font-semibold uppercase tracking-wide text-[var(--text-3)]" htmlFor="retail-bulk-qty">Quantity ({unitName})</label>
                        <input id="retail-bulk-qty" type="text" inputMode="decimal" className="erp-input w-24 !py-1" value={bulkQty}
                          onChange={e => setBulkQty(e.target.value)} aria-invalid={parseQuantity(bulkQty) === null} />
                        {['0.25', '0.5', '1', '5'].map(q => (
                          <button key={q} type="button" onClick={() => setBulkQty(q)} className="px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-2)]">{q}</button>
                        ))}
                        {parseQuantity(bulkQty) === null && <span className="text-red-500">Enter a number above 0</span>}
                      </div>
                    )}
                  <IntactPackage
                    key={`${loaded.packaging}-${loaded.key}`}
                    kind={loaded.packaging} name={loaded.product.name} company={loaded.product.company_name} unitLabel={unitName}
                    chip={isBulk(loaded.packaging) ? `${parseQuantity(bulkQty) ?? '—'} ${unitName}` : undefined}
                    addLabel={isBulk(loaded.packaging) ? `Add ${parseQuantity(bulkQty) ?? '…'} ${unitName} to basket` : undefined}
                    getDropRect={() => basketRef.current?.getBoundingClientRect() ?? null}
                    onAdd={handleAddUnit} onHotChange={setHot}
                  />
                  </>
                )}
              </div>
            </>
          ) : !needsSetup && !ambiguous && (
            <p className="mt-4 text-sm text-[var(--text-3)]">Scan a medicine to open it. Blisters can be cut; every other package (bottle, tube, vial, ampoule, sachet, box, pcs) is billed whole, and Kg / Ltr by quantity. The basket is kept between scans.</p>
          )}
        </section>

        {/* ── basket ────────────────────────────────────────────────── */}
        <section ref={basketRef} className={card}
          style={hot ? { borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 10%, var(--surface))' } : { borderStyle: 'dashed', borderWidth: 2 }}>
          <div className="text-sm font-bold text-[var(--text)] mb-2">Billing basket</div>
          {!lines.length && <p className="text-sm text-[var(--text-3)]">Drag a cut piece, bottle or tube here, or select it and press “Add to basket”.</p>}

          {lines.map(l => {
            const unitLine = kindOf(l) === 'unit'
            const qty = unitLine ? (l.units ?? 0) : l.tablets
            const unit = (l.product.unit || 'unit')
            return (
              <div key={lineKey(l)} className="border-t border-[var(--border)] py-2.5 grid gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-[var(--text)]">{l.product.name}</div>
                    <div className="text-xs text-[var(--text-3)]">
                      {l.product.barcode || l.product.item_code} · {unitLine ? qtyLabel(qty, unit) : `${l.pieces} piece${l.pieces > 1 ? 's' : ''} · ${qty} tablet${qty > 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <button type="button" aria-label={`Remove ${l.product.name}`} onClick={() => setLines(p => p.filter(x => lineKey(x) !== lineKey(l)))}
                    className="p-1.5 rounded-md text-[var(--text-3)] hover:bg-[var(--surface-3)]"><Trash2 size={15} /></button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-[var(--text-3)] flex items-center gap-1.5">NPR / {unitLine ? unit.toLowerCase() : 'tablet'}
                    <input type="number" min={0} step={unitLine ? '0.01' : '0.0001'} inputMode="decimal" className="erp-input w-24 !py-1"
                      value={priceText[lineKey(l)] ?? String(+l.ppt.toFixed(4))}
                      onChange={e => setPriceText(s => ({ ...s, [lineKey(l)]: e.target.value }))}
                      onBlur={() => commitPrice(l)} onKeyDown={e => { if (e.key === 'Enter') commitPrice(l) }} />
                  </label>
                  <b className="tabular-nums text-sm">NPR {fmtN(lineTotal(l))}</b>
                </div>
                {short.includes(l) && (
                  <div className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> Needs {fmtN(unitLine ? qty : l.tablets / l.pack, 2)} {unitLine ? unit.toLowerCase() : 'strips'}; only {fmtN(l.product.current_stock, 2)} in stock.</div>
                )}
              </div>
            )
          })}

          {!!lines.length && (
            <div className="border-t-2 border-[var(--border)] pt-2 mt-1">
              <div className="text-xs text-[var(--text-3)]">
                {[t.tablets ? `${t.tablets} tablets · ${t.pieces} piece${t.pieces > 1 ? 's' : ''}` : '', t.units ? `${+t.units.toFixed(3)} unit${t.units === 1 ? '' : 's'}` : '', `${t.items} item${t.items > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
              </div>
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
          <p className="mt-2 text-xs text-[var(--text-4)]">Nothing is saved or posted here. Loose tablets are billed as a fraction of a strip; other packages as whole units (Kg / Ltr by quantity) at the product’s rate. You pick the batch and confirm on the Sales invoice.</p>
        </section>
      </div>

      <ProductNotFoundDialog code={notFound} onClose={() => { setNotFound(null); requestAnimationFrame(() => inputRef.current?.focus()) }} />
    </div>
  )
}
