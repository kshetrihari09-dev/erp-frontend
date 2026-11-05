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
 *  - Double-tap / double-click a piece or package to add it; type any quantity (per drop for packages, or on a basket line).
 *  - Each scan REPLACES the bench: a bottle or tube never inherits cutting from
 *    a previous blister, because the cutting component is simply not mounted.
 *  - NOTHING is posted from this page. "Continue to Sales invoice" only hands
 *    the basket to /sales, which fills its normal invoice rows; batch/expiry
 *    selection, customer, tax, discount, stock deduction, save and posting then
 *    run exactly as they always do.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scissors, Trash2, AlertTriangle, ArrowRight, Undo2, ShoppingBasket, Pill, PackageOpen } from 'lucide-react'
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
import { isShape, parseColors, parseBlisterColor, MIN_PACK, MAX_PACK, type ShapeName } from './blisterGeometry'
import { PACKAGING_LABEL, isBulk, resolvePackaging, validPack, type PackagingType } from './packaging'
import {
  BASKET_STORE_KEY, MAX_QTY, MAX_WHOLE_QTY, RETAIL_HANDOFF_KEY, basketReducer, defaultPricePerTablet, defaultUnitPrice, hasCustomPrice,
  isBulkUnit, isValidPrice, kindOf, lineId, lineTotal, overStock, parseBasket, parseUnitQty, serializeBasket, stockNeeded, toHandoff, totals,
  type BasketLine,
} from './retailBasket'
import QtyEditor from './QtyEditor'

const card = 'rounded-2xl border border-[var(--border-2)] bg-[var(--surface)] p-3.5 md:p-4 shadow-[var(--shadow-sm)]'
const chipBtn = 'inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors'

type StockTone = 'ok' | 'low' | 'out'
const STOCK_STYLE: Record<StockTone, { dot: string; text: string; label: string }> = {
  ok:  { dot: '#10b981', text: 'text-emerald-700 dark:text-emerald-300', label: 'In stock' },
  low: { dot: '#f59e0b', text: 'text-amber-700 dark:text-amber-300', label: 'Low stock' },
  out: { dot: '#ef4444', text: 'text-red-700 dark:text-red-300', label: 'Out of stock' },
}
function stockTone(p: Product): StockTone | null {
  const n = Number(p.current_stock); if (!Number.isFinite(n)) return null
  const min = Number(p.min_stock)
  if (n <= 0) return 'out'
  return Number.isFinite(min) && min > 0 && n <= min ? 'low' : 'ok'
}
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{label}</div>
      <div className="text-sm font-bold tabular-nums text-[var(--text)]">{children}</div>
    </div>
  )
}
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
  blisterColor: string | null
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
  // The basket is one reducer: every change is undoable, and it survives a page reload (this browser tab only).
  const [bs, dispatch] = useReducer(basketReducer, undefined, () => {
    let lines: BasketLine[] = []
    try { lines = parseBasket(sessionStorage.getItem(BASKET_STORE_KEY)) } catch { /* storage unavailable: start empty */ }
    return { lines, past: [] as BasketLine[][] }
  })
  const lines = bs.lines
  const [priceText, setPriceText] = useState<Record<string, string>>({})
  const [hot, setHot] = useState(false)
  const [dropQty, setDropQty] = useState('1')          // how many packages (or Kg / Ltr) one drop / double-tap adds
  const dropQtyRef = useRef('1')
  dropQtyRef.current = dropQty
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
      blisterColor: parseBlisterColor(full.blister_color),
    })
    setHot(false); setDropQty('1')
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
    dispatch({ type: 'addTablets', product: cur.product, pack: cur.pack, tablets })
  }, [])
  const handleAddUnit = useCallback(() => {
    const cur = loadedRef.current; if (!cur || cur.packaging === 'blister') return
    const bulk = isBulk(cur.packaging)
    const qty = parseUnitQty(dropQtyRef.current, bulk)
    if (qty === null) { toastError('Check the quantity', bulk ? `Enter a quantity above 0 (up to ${MAX_QTY}).` : `Enter a whole number from 1 to ${MAX_WHOLE_QTY}.`); return }
    dispatch({ type: 'addUnit', product: cur.product, qty })
    toastInfo(`Added ${qtyLabel(qty, cur.product.unit || PACKAGING_LABEL[cur.packaging])}`)
  }, [toastInfo, toastError])

  const t = useMemo(() => totals(lines), [lines])
  const short = useMemo(() => overStock(lines), [lines])
  const lineKey = lineId

  // keep the basket across a reload; an empty basket removes the stored copy
  useEffect(() => {
    try {
      if (lines.length) sessionStorage.setItem(BASKET_STORE_KEY, serializeBasket(lines))
      else sessionStorage.removeItem(BASKET_STORE_KEY)
    } catch { /* preference only */ }
  }, [lines])
  useEffect(() => { if (lines.length) toastInfo(`Restored your basket (${lines.length} item${lines.length > 1 ? 's' : ''}).`) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd+Z undoes the last basket change (unless you are typing in a box)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault(); dispatch({ type: 'undo' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function commitPrice(l: BasketLine) {
    const raw = priceText[lineKey(l)]; if (raw === undefined) return
    const v = raw.trim() === '' ? NaN : Number(raw)
    if (isValidPrice(v)) dispatch({ type: 'setPrice', id: lineKey(l), ppt: v })
    else toastError('Invalid price', 'Price must be a number, 0 or more.')
    setPriceText(prev => { const { [lineKey(l)]: _drop, ...rest } = prev; return rest })
  }

  function proceed() {
    if (!lines.length) return
    if (lines.some(l => !isValidPrice(l.ppt) || (kindOf(l) === 'unit' ? (l.units ?? 0) : l.tablets) <= 0)) { toastError('Check the basket', 'A line has an invalid price or quantity.'); return }
    if (short.length) { toastError('Not enough stock', `${short.map(l => l.product.name).join(', ')} — reduce the quantity first.`); return }
    try { sessionStorage.setItem(RETAIL_HANDOFF_KEY, JSON.stringify({ at: Date.now(), items: toHandoff(lines) })) }
    catch { toastError('Could not hand over the basket', 'Browser storage is unavailable.'); return }
    try { sessionStorage.removeItem(BASKET_STORE_KEY) } catch { /* ignore */ }   // handed over: do not bring it back (no double billing)
    navigate(PATHS.SALES)
  }

  const unitName = loaded ? (loaded.product.unit || PACKAGING_LABEL[loaded.packaging]) : ''
  const dropN = loaded && loaded.packaging !== 'blister' ? parseUnitQty(dropQty, isBulk(loaded.packaging)) : null

  const tone = loaded ? stockTone(loaded.product) : null
  const scrollToBasket = () => basketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const canContinue = lines.length > 0

  return (
    <div className="retail-pos mx-auto max-w-[1280px] rounded-2xl bg-[var(--bg)] p-3 text-[var(--text)] md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand-light)] text-[var(--rs-link)]"><Scissors size={17} /></span>
          <h1 className="text-lg font-bold tracking-tight">Retail Sale</h1>
        </div>
        {canContinue && (
          <button type="button" onClick={scrollToBasket} className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-2)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-2)] lg:hidden">
            <ShoppingBasket size={14} /> {t.items} · NPR {fmtN(t.grand)}
          </button>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,1fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        {/* ── search + cutting workspace ─────────────────────────────── */}
        <section className={card}>
          <UnifiedProductInput
            ref={inputRef} context="sales" autoFocus
            onProductResolved={handleProduct} onNotFound={handleNotFound}
            onAccountMismatch={msg => { playErrorBeep(); toastError('QR code not valid here', msg) }}
            placeholder="Search or scan a medicine…"
          />

          {needsSetup && (
            <div className="mt-3">
              <Alert type="warning" message={
                <span>
                  <b>{needsSetup.name}</b> has no “Tablets per strip” ({MIN_PACK}–{MAX_PACK}), so its blister can’t be shown.{' '}
                  <Link to={PATHS.PRODUCTS} className="underline font-semibold">Open Products</Link> to set it, with the tablet shape and colour.
                </span>
              } />
            </div>
          )}

          {ambiguous && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
              <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Packaging unclear for {ambiguous.product.name}</div>
              <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">{ambiguous.reason}</p>
              {canChoose ? (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PACKAGING_LABEL) as PackagingType[]).map(ty => (
                      <Button key={ty} variant="secondary" size="md"
                        disabled={ty === 'blister' && !validPack(Number(ambiguous.product.tablets_per_strip))}
                        onClick={() => openBench(ambiguous.product, ty)}>
                        {PACKAGING_LABEL[ty]}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-100/70">
                    Applies to this scan only. {!validPack(Number(ambiguous.product.tablets_per_strip)) && `Blister needs “Tablets per strip” (${MIN_PACK}–${MAX_PACK}). `}
                    Fix it permanently via the product’s Unit in <Link to={PATHS.PRODUCTS} className="underline font-semibold">Products</Link>.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-100/70">Ask a manager or admin to confirm the packaging type.</p>
              )}
            </div>
          )}

          {loaded ? (
            <>
              {/* selected medicine — compact information bar */}
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-[var(--border-2)] bg-[var(--surface-2)] px-3.5 py-3" data-packaging={loaded.packaging}>
                <div className="min-w-[160px] flex-1">
                  <div className="truncate text-[15px] font-bold leading-tight" title={loaded.product.name}>{loaded.product.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-3)]">
                    <span className="font-mono">{loaded.product.barcode || loaded.product.item_code}</span>
                    <span className="rounded-md border border-[rgba(96,165,250,.3)] bg-[rgba(37,99,235,.14)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800 dark:text-[#93c5fd]">{PACKAGING_LABEL[loaded.packaging]}</span>
                  </div>
                </div>
                {loaded.packaging === 'blister' ? (
                  <>
                    <Stat label={`Strip · ${loaded.pack} tabs`}>NPR {fmtN(loaded.product.sales_rate)}</Stat>
                    <Stat label="Tablet">NPR {fmtN(defaultPricePerTablet(loaded.product, loaded.pack), 4)}</Stat>
                  </>
                ) : (
                  <Stat label={`Per ${unitName.toLowerCase()}`}>NPR {fmtN(defaultUnitPrice(loaded.product))}</Stat>
                )}
                {tone && (
                  <Stat label="Stock">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STOCK_STYLE[tone].dot, boxShadow: `0 0 0 3px ${STOCK_STYLE[tone].dot}33` }} />
                      {fmtN(loaded.product.current_stock, 0)} <span className={`text-xs font-semibold ${STOCK_STYLE[tone].text}`}>{loaded.product.unit} · {STOCK_STYLE[tone].label}</span>
                    </span>
                  </Stat>
                )}
              </div>

              <div className="mt-3">
                {loaded.packaging === 'blister' ? (
                  <BlisterWorkbench
                    key={`b-${loaded.key}`}
                    resetKey={loaded.key} packSize={loaded.pack} shape={loaded.shape} colors={loaded.colors} blisterColor={loaded.blisterColor}
                    getDropRect={() => basketRef.current?.getBoundingClientRect() ?? null}
                    onAddPiece={handleAddPiece} onHotChange={setHot}
                    onMessage={m => toastInfo(m)}
                  />
                ) : (
                  <>
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
                      <label className="font-semibold uppercase tracking-wider text-[var(--text-3)]" htmlFor="retail-drop-qty">Qty ({unitName})</label>
                      <input id="retail-drop-qty" type="text" inputMode={isBulk(loaded.packaging) ? 'decimal' : 'numeric'} className="erp-input !h-9 !w-24 !py-1 text-center" value={dropQty}
                        onChange={e => setDropQty(e.target.value)} onFocus={e => e.currentTarget.select()} aria-invalid={dropN === null} />
                      {(isBulk(loaded.packaging) ? ['0.25', '0.5', '1', '5'] : ['1', '2', '5', '10']).map(q => (
                        <button key={q} type="button" onClick={() => setDropQty(q)}
                          className={`${chipBtn} ${dropQty.trim() === q ? 'border-[var(--brand)] bg-[rgba(37,99,235,.2)] text-[var(--rs-link)]' : 'border-[var(--border-2)] text-[var(--text-2)] hover:border-[var(--brand)]'}`}>{q}</button>
                      ))}
                      {dropN === null && <span className="text-red-600 dark:text-red-400">{isBulk(loaded.packaging) ? 'Enter a number above 0' : 'Enter a whole number, 1 or more'}</span>}
                    </div>
                    <IntactPackage
                      key={`${loaded.packaging}-${loaded.key}`}
                      kind={loaded.packaging} name={loaded.product.name} company={loaded.product.company_name} unitLabel={unitName}
                      chip={dropN === null ? `— ${unitName}` : isBulk(loaded.packaging) || dropN > 1 ? qtyLabel(dropN, unitName) : undefined}
                      addLabel={dropN === null ? `Add … ${unitName} to basket` : isBulk(loaded.packaging) || dropN > 1 ? `Add ${qtyLabel(dropN, unitName)} to basket` : undefined}
                      getDropRect={() => basketRef.current?.getBoundingClientRect() ?? null}
                      onAdd={handleAddUnit} onHotChange={setHot}
                    />
                    <p className="mt-2 text-[11px] text-[var(--text-3)]">Double-tap or drag to the basket</p>
                  </>
                )}
              </div>
            </>
          ) : !needsSetup && !ambiguous && (
            <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-2)] py-14 text-[var(--text-3)]">
              <Pill size={30} strokeWidth={1.6} />
              <span className="text-sm font-medium">Search or scan a medicine</span>
            </div>
          )}
        </section>

        {/* ── basket ────────────────────────────────────────────────── */}
        <section ref={basketRef} aria-label="Billing basket"
          className={`${card} relative flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]`}
          style={hot ? { borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 10%, var(--surface))', boxShadow: '0 0 0 3px rgba(37,99,235,.25), var(--shadow-md)', transition: 'all .15s' } : { transition: 'all .15s' }}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBasket size={16} className="text-[var(--rs-link)]" />
              <span className="text-sm font-bold">Basket</span>
              {canContinue && <span className="rounded-full bg-[var(--brand-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--rs-link)]">{t.items}</span>}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!bs.past.length} onClick={() => dispatch({ type: 'undo' })}
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-35"><Undo2 size={15} /></button>
              <button type="button" aria-label="Clear basket" disabled={!lines.length} onClick={() => dispatch({ type: 'clear' })}
                className="h-9 rounded-lg px-2.5 text-xs font-semibold text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-red-600 dark:hover:text-red-300 disabled:pointer-events-none disabled:opacity-35">Clear</button>
            </div>
          </div>

          {!lines.length ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-2)] py-12 text-[var(--text-3)]">
              <ShoppingBasket size={34} strokeWidth={1.5} />
              <span className="text-sm font-medium">No items added</span>
            </div>
          ) : (
            <ul className="-mr-1 grid min-h-0 gap-2 overflow-y-auto pr-1 lg:flex-1">
              {lines.map(l => {
                const unitLine = kindOf(l) === 'unit'
                const qty = unitLine ? (l.units ?? 0) : l.tablets
                const unit = (l.product.unit || 'unit')
                return (
                  <li key={lineKey(l)} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-tight" title={l.product.name}>{l.product.name}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--text-3)]">
                          <span className="font-mono">{l.product.barcode || l.product.item_code}</span> · {unitLine ? qtyLabel(qty, unit) : l.edited ? `${qty} tablet${qty > 1 ? 's' : ''}` : (l.log?.length ?? 0) > 1 ? `${l.log!.join(' + ')} = ${qty} tablets` : `${l.pieces} piece${l.pieces > 1 ? 's' : ''} · ${qty} tablet${qty > 1 ? 's' : ''}`}
                        </div>
                      </div>
                      <button type="button" aria-label={`Remove ${l.product.name}`} onClick={() => dispatch({ type: 'remove', id: lineKey(l) })}
                        className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-3)] hover:bg-[rgba(239,68,68,.12)] hover:text-red-600 dark:hover:text-red-300"><Trash2 size={15} /></button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                        <QtyEditor value={qty} bulk={unitLine && isBulkUnit(unit)} label={`Quantity of ${l.product.name} (${unitLine ? unit.toLowerCase() : 'tablets'})`}
                          onCommit={v => dispatch({ type: 'setQty', id: lineKey(l), qty: v })}
                          onInvalid={() => toastError('Invalid quantity', unitLine && isBulkUnit(unit) ? `Enter a number above 0 (up to ${MAX_QTY}).` : `Enter a whole number from 1 to ${MAX_WHOLE_QTY}.`)} />
                        <span>{unitLine ? unit.toLowerCase() : 'tabs'}</span>
                      </div>
                      <b className="text-sm tabular-nums">NPR {fmtN(lineTotal(l))}</b>
                    </div>
                    <label className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                      <span>NPR / {unitLine ? unit.toLowerCase() : 'tablet'}</span>
                      <input type="number" min={0} step={unitLine ? '0.01' : '0.0001'} inputMode="decimal" className="erp-input !h-8 !w-24 !py-0.5 text-right"
                        value={priceText[lineKey(l)] ?? String(+l.ppt.toFixed(4))}
                        onChange={e => setPriceText(s => ({ ...s, [lineKey(l)]: e.target.value }))}
                        onBlur={() => commitPrice(l)} onKeyDown={e => { if (e.key === 'Enter') commitPrice(l) }} />
                      {hasCustomPrice(l) && <button type="button" className="underline hover:text-[var(--text)]" onClick={() => dispatch({ type: 'resetPrice', id: lineKey(l) })}>Reset to {fmtN(l.basePpt as number, unitLine ? 2 : 4)}</button>}
                    </label>
                    {short.includes(l) && (
                      <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertTriangle size={12} /> Needs {fmtN(stockNeeded(lines, l.product.id), 2)} {unitLine ? unit.toLowerCase() : 'strips'}; only {fmtN(l.product.current_stock, 2)} in stock.</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-3 shrink-0 border-t border-[var(--border-2)] pt-3">
            {canContinue && (
              <div className="mb-3">
                <div className="text-[11px] text-[var(--text-3)]">
                  {[t.tablets ? `${t.tablets} tablets · ${t.pieces} piece${t.pieces > 1 ? 's' : ''}` : '', t.units ? `${+t.units.toFixed(3)} unit${t.units === 1 ? '' : 's'}` : '', `${t.items} item${t.items > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-[var(--rs-link)]">NPR {fmtN(t.grand)}</span>
                </div>
              </div>
            )}
            <Button variant="primary" size="lg" disabled={!canContinue} iconRight={<ArrowRight size={16} />} onClick={proceed}
              className={`w-full !h-11 ${canContinue ? 'max-lg:hidden' : ''}`}>Continue to Sales invoice</Button>
          </div>

          {hot && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center rounded-2xl border-2 border-dashed border-[var(--brand)] bg-[rgba(37,99,235,.12)] pb-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-lg"><PackageOpen size={16} /> Drop to add</span>
            </div>
          )}
        </section>
      </div>

      {/* mobile / tablet: the basket total and the primary action stay reachable while you work */}
      {canContinue && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border-2)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-lg)] lg:hidden">
          <button type="button" onClick={scrollToBasket} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-light)] text-[var(--rs-link)]"><ShoppingBasket size={18} /></span>
            <span className="min-w-0">
              <span className="block text-[11px] text-[var(--text-3)]">{t.items} item{t.items > 1 ? 's' : ''} · view basket</span>
              <span className="block truncate text-base font-bold tabular-nums">NPR {fmtN(t.grand)}</span>
            </span>
          </button>
          <Button variant="primary" size="lg" iconRight={<ArrowRight size={16} />} onClick={proceed} className="!h-11 shrink-0">Continue</Button>
        </div>
      )}

      <ProductNotFoundDialog code={notFound} onClose={() => { setNotFound(null); requestAnimationFrame(() => inputRef.current?.focus()) }} />
    </div>
  )
}
