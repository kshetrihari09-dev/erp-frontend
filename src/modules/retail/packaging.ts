/**
 * packaging.ts — which model and which gestures a scanned medicine gets.
 *
 * The product's packaging comes from data the app ALREADY has: its `unit`
 * (Strip / Bottle / Tube …) plus, for blisters, the Retail Sale profile
 * (`tablets_per_strip`). No new database field is involved.
 *
 *   unit Bottle / Tube / Vial / Ampoule / Sachet / Box / Pcs / Kg / Ltr
 *        (and no tablets-per-strip)                 → that package, billed whole
 *   unit Strip/Tablet/Capsule + valid pack size     → blister
 *   unit Strip/Tablet/Capsule, no valid pack size   → needs-setup (blister, incomplete)
 *   anything else, or contradictory data            → ambiguous
 *
 * "Ambiguous" is never guessed. The page shows no cuttable or draggable model;
 * a user with product-edit permission can pick the type for that scan.
 */
import type { Product } from '@/types'
import { MAX_PACK, MIN_PACK } from './blisterGeometry'

export type PackagingType =
  | 'blister' | 'bottle' | 'tube' | 'vial' | 'ampoule' | 'sachet' | 'box' | 'piece' | 'kg' | 'ltr'

export const PACKAGING_LABEL: Record<PackagingType, string> = {
  blister: 'Blister pack', bottle: 'Bottle', tube: 'Tube', vial: 'Vial', ampoule: 'Ampoule',
  sachet: 'Sachet', box: 'Box', piece: 'Piece', kg: 'Bulk (Kg)', ltr: 'Bulk (Ltr)',
}

/** Exact instruction line shown for each active packaging. */
export const PACKAGING_INSTRUCTION: Record<PackagingType, string> = {
  blister: 'Swipe to cut · Double-tap or drag a piece to the basket.',
  bottle:  'Double-tap or drag the bottle to the basket.',
  tube:    'Double-tap or drag the tube to the basket.',
  vial:    'Double-tap or drag the vial to the basket.',
  ampoule: 'Double-tap or drag the ampoule to the basket.',
  sachet:  'Double-tap or drag the sachet to the basket.',
  box:     'Double-tap or drag the box to the basket.',
  piece:   'Double-tap or drag the item to the basket.',
  kg:      'Set the quantity · Double-tap or drag the sack to the basket.',
  ltr:     'Set the quantity · Double-tap or drag the container to the basket.',
}

/** Only a blister can be cut. */
export const canCut = (t: PackagingType) => t === 'blister'

/** Kg / Ltr are sold by measured quantity (e.g. 0.5 Kg); everything else by whole packages. */
export const isBulk = (t: PackagingType) => t === 'kg' || t === 'ltr'

export type PackagingResult =
  | { status: 'ok'; type: PackagingType }
  | { status: 'needs-setup' }
  | { status: 'ambiguous'; reason: string }

export const validPack = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_PACK && v <= MAX_PACK

const BLISTER_UNITS = ['strip', 'tablet', 'capsule']

/** The product form's Unit list, mapped to the model each intact unit gets. */
const INTACT_UNITS: Record<string, PackagingType> = {
  bottle: 'bottle', tube: 'tube', vial: 'vial', ampoule: 'ampoule', sachet: 'sachet', box: 'box', pcs: 'piece', kg: 'kg', ltr: 'ltr',
}

export function resolvePackaging(p: Pick<Product, 'unit' | 'tablets_per_strip'>): PackagingResult {
  const unit = String(p.unit ?? '').trim().toLowerCase()
  const rawPack = p.tablets_per_strip
  const hasPackValue = rawPack !== null && rawPack !== undefined
  const pack = hasPackValue ? Number(rawPack) : NaN

  const intact = INTACT_UNITS[unit]
  if (intact) {
    if (hasPackValue) return { status: 'ambiguous', reason: `The unit is ${p.unit}, but a “tablets per strip” value is also set.` }
    return { status: 'ok', type: intact }
  }
  if (BLISTER_UNITS.includes(unit)) {
    return validPack(pack) ? { status: 'ok', type: 'blister' } : { status: 'needs-setup' }
  }
  return { status: 'ambiguous', reason: unit ? `The unit “${p.unit}” is not one Retail Sale knows.` : 'This product has no unit.' }
}
