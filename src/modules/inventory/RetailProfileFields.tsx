/**
 * RetailProfileFields.tsx — the optional "Retail Sale (blister)" section of the
 * product form: tablets per strip, tablet shape, tablet colour(s), blister colour.
 *
 * Mirrors the Inventory Planning section's pattern: its own small state, its own
 * payload builder, saved through the normal product create/update endpoints.
 * Leaving everything blank keeps the product exactly as it was.
 */
import type { Product } from '@/types'
import { SHAPE_NAMES, MIN_PACK, MAX_PACK } from '../retail/blisterGeometry'

export interface RetailProfileState { pack: string; shape: string; two: boolean; c1: string; c2: string; blister: string }

export function emptyRetailProfile(p?: Product | null): RetailProfileState {
  const cols = String(p?.tablet_colors ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return {
    pack:  p?.tablets_per_strip ? String(p.tablets_per_strip) : '',
    shape: p?.tablet_shape || '',
    two:   cols.length > 1,
    c1:    cols[0] || '#ffffff',
    c2:    cols[1] || '#d9534f',
    blister: /^#[0-9a-fA-F]{6}$/.test(String(p?.blister_color ?? '')) ? String(p!.blister_color) : '',   // '' = default silver
  }
}

export function retailProfileError(s: RetailProfileState): string | null {
  if (s.pack.trim() === '') return null
  const n = Number(s.pack)
  if (!Number.isInteger(n) || n < MIN_PACK || n > MAX_PACK) return `Tablets per strip must be a whole number from ${MIN_PACK} to ${MAX_PACK}.`
  return null
}

/** Blank pack clears the whole profile; colours are saved only with a pack size. */
export function retailProfileToPayload(s: RetailProfileState) {
  const hasPack = s.pack.trim() !== ''
  return {
    tablets_per_strip: hasPack ? Number(s.pack) : null,
    tablet_shape:      hasPack ? (s.shape || 'round') : null,
    tablet_colors:     hasPack ? (s.two ? `${s.c1},${s.c2}` : s.c1) : null,
    blister_color:     hasPack && s.blister ? s.blister : null,
  }
}

const label = 'text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5'

export function RetailProfileSection({ value, onChange }: { value: RetailProfileState; onChange: (v: RetailProfileState) => void }) {
  const set = (k: keyof RetailProfileState, v: any) => onChange({ ...value, [k]: v })
  const err = retailProfileError(value)
  return (
    <div className="mt-5 pt-4 border-t border-[var(--border)]">
      <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-2)] mb-3">
        Retail Sale <span className="normal-case font-medium text-[var(--text-4)]">(optional — blister cutting)</span>
      </div>
      <div className="form-grid">
        <div>
          <label className={label}>Tablets per strip</label>
          <input type="number" min={MIN_PACK} max={MAX_PACK} step={1} inputMode="numeric" className="erp-input" placeholder="e.g. 10"
            value={value.pack} onChange={e => set('pack', e.target.value)} />
          {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        </div>
        <div>
          <label className={label}>Tablet shape</label>
          <select className="erp-input" value={value.shape || 'round'} onChange={e => set('shape', e.target.value)} disabled={!value.pack.trim()}>
            {SHAPE_NAMES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Tablet colour</label>
          <div className="flex items-center gap-2">
            <input type="color" aria-label="Tablet colour 1" value={value.c1} onChange={e => set('c1', e.target.value)} disabled={!value.pack.trim()} style={{ width: 38, height: 34, padding: 0 }} />
            {value.two && <input type="color" aria-label="Tablet colour 2" value={value.c2} onChange={e => set('c2', e.target.value)} style={{ width: 38, height: 34, padding: 0 }} />}
            <label className="text-xs text-[var(--text-3)] flex items-center gap-1.5">
              <input type="checkbox" checked={value.two} onChange={e => set('two', e.target.checked)} disabled={!value.pack.trim()} /> Two-tone
            </label>
          </div>
        </div>
        <div>
          <label className={label}>Blister colour</label>
          <div className="flex items-center gap-2">
            <input type="color" aria-label="Blister colour" value={value.blister || '#c3c9cf'} onChange={e => set('blister', e.target.value)} disabled={!value.pack.trim()} style={{ width: 38, height: 34, padding: 0 }} />
            <span className="text-xs text-[var(--text-3)]">{value.blister ? value.blister : 'Default (silver foil)'}</span>
            {value.blister && <button type="button" className="text-xs underline text-[var(--text-3)]" onClick={() => set('blister', '')}>Reset</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
