/**
 * ProductHistoryPopup.tsx
 *
 * "Product History" window shown on the Sales page right after a product is picked and
 * BEFORE the Batch Selection popup (BatchSelect.tsx opens this first, then the batch popup
 * once this one is closed).
 *
 * Shows the product's most recent sale / purchase lines (newest first):
 *   Ad Date · Bs Date · Invoice No. · Batch · Expiry · Qty · Free · Rate · MRP · Disc % · Type
 * so the cashier can see what it was last sold for, to whom-ever, in which batch, at what
 * rate and discount, before choosing a batch.
 *
 * Read-only: nothing here changes the invoice row, pricing, stock or any validation.
 *
 * Keyboard:   ↑ / ↓ (PgUp / PgDn, Home / End)  move the highlighted line
 *             Enter or Esc                      close → the batch popup opens next
 * Mouse:      click a line to highlight it · "Exit" button or a click outside closes
 *
 * Never blocks the sale: no history for the product, being offline, or a failed request all
 * just close this popup straight away (same `onClose`), so the flow continues to batch
 * selection exactly as it did before this window existed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { stockAPI, type ProductHistoryRow } from '@/services/api'
import { adToBS } from '@/utils/nepaliDate'
import { useShortcutScope } from '@/hooks/useKeyboardShortcuts'
import { useOffline } from '@/offline/OfflineProvider'

interface Props {
  open:         boolean
  productId?:   string
  productName?: string
  /** Called when the user closes the window — and also when there is nothing to show
   *  (no history / offline / error). The caller continues to batch selection from here. */
  onClose:      () => void
}

/** 2026-11-18 → 2026/11/18 (the format used by the reference screen). */
const slashDate = (s?: string) => (s ? String(s).slice(0, 10).replace(/-/g, '/') : '')
/** Whole numbers plain ("10"), fractions up to 2 dp ("0.5"). */
const qtyText = (n: number) => String(Math.round((Number(n) || 0) * 100) / 100)
const money = (n: number) => (Number(n) || 0).toFixed(2)

export default function ProductHistoryPopup({ open, productId, productName, onClose }: Props) {
  const { isOnline } = useOffline()
  const [rows, setRows]       = useState<ProductHistoryRow[] | null>(null)   // null = loading
  const [hl, setHL]           = useState(0)
  const panelRef              = useRef<HTMLDivElement>(null)
  const bodyRef               = useRef<HTMLTableSectionElement>(null)
  const onCloseRef            = useRef(onClose)
  onCloseRef.current = onClose

  // While open, the Sales page's F-key shortcuts underneath go quiet (same as the batch popup).
  useShortcutScope(open)

  const close = useCallback(() => onCloseRef.current(), [])

  /* ── Fetch on open ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    setRows(null)
    setHL(0)
    if (!productId || !isOnline) { close(); return }

    let cancelled = false
    stockAPI.productHistory({ product_id: productId })
      .then(res => {
        if (cancelled) return
        const data = ((res.data as any)?.data as ProductHistoryRow[]) || []
        if (data.length === 0) { close(); return }       // nothing to show → straight on to batches
        setRows(data)
      })
      .catch(() => { if (!cancelled) close() })          // never block the sale on a history failure
    return () => { cancelled = true }
  }, [open, productId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Keyboard (window, capture phase) ───────────────────────────────────────
   * The product search box behind this popup may still hold focus for a moment after the
   * popup opens, so keys are handled at window level and stopped before they can reach it.
   * Auto-repeat is ignored so a held Enter (from picking the product) can't skip the window. */
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      const last = Math.max((rows?.length ?? 1) - 1, 0)
      const stop = () => { e.preventDefault(); e.stopPropagation() }
      switch (e.key) {
        case 'Escape':
        case 'Enter':
          stop(); if (!e.repeat) close(); break
        case 'ArrowDown': stop(); setHL(h => Math.min(h + 1, last)); break
        case 'ArrowUp':   stop(); setHL(h => Math.max(h - 1, 0)); break
        case 'PageDown':  stop(); setHL(h => Math.min(h + 8, last)); break
        case 'PageUp':    stop(); setHL(h => Math.max(h - 8, 0)); break
        case 'Home':      stop(); setHL(0); break
        case 'End':       stop(); setHL(last); break
        case 'Tab':       stop(); break                  // keep focus inside the window
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, rows, close])

  // Pull focus off whatever was behind the window, and keep the highlighted line in view.
  useEffect(() => { if (open && rows) panelRef.current?.focus() }, [open, rows])
  useEffect(() => {
    (bodyRef.current?.children[hl] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [hl])

  if (!open) return null

  return createPortal(
    <div className="phx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div ref={panelRef} tabIndex={-1} className="phx-panel" role="dialog" aria-modal="true" aria-label="Product History">
        <div className="phx-header">
          <div className="phx-heading">
            <span className="phx-title">Product History</span>
            {productName && <span className="phx-subtitle">{productName}</span>}
          </div>
          <button type="button" className="phx-exit" onClick={close}>Exit</button>
        </div>

        {rows === null ? (
          <div className="phx-state">Loading history…</div>
        ) : (
          <div className="phx-table-wrap">
            <table className="phx-table">
              <thead>
                <tr>
                  <th>Ad Date</th><th>Bs Date</th><th>Invoice No.</th><th>Batch</th><th>Expiry</th>
                  <th className="phx-num">Qty</th><th className="phx-num">Free</th>
                  <th className="phx-num">Rate</th><th className="phx-num">MRP</th><th className="phx-num">Disc %</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i === hl ? 'phx-row--hl' : undefined} onClick={() => setHL(i)}>
                    <td>{slashDate(r.date_ad)}</td>
                    <td>{slashDate(r.date_bs || adToBS(r.date_ad))}</td>
                    <td className="phx-strong">{r.invoice_no}</td>
                    <td>{r.batch || '—'}</td>
                    <td>{slashDate(r.expiry) || '—'}</td>
                    <td className="phx-num">{qtyText(r.qty)}</td>
                    <td className="phx-num">{qtyText(r.free)}</td>
                    <td className="phx-num">{money(r.rate)}</td>
                    <td className="phx-num">{money(r.mrp)}</td>
                    <td className="phx-num">{qtyText(r.disc_pct)}</td>
                    <td className={r.type === 'Purchase' ? 'phx-type phx-type--pu' : 'phx-type'}>{r.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="phx-footer">
          <span><kbd className="bsp-kbd">↑↓</kbd> Navigate</span>
          <span><kbd className="bsp-kbd">Enter</kbd> / <kbd className="bsp-kbd">Esc</kbd> Continue to batch selection</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
