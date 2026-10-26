/**
 * packaging.ts — which model and which gestures a scanned medicine gets.
 *
 * The product's packaging comes from data the app ALREADY has: its `unit`
 * (Strip / Bottle / Tube …) plus, for blisters, the Retail Sale profile
 * (`tablets_per_strip`). No new database field is involved.
 *
 *   unit Bottle (and no tablets-per-strip)          → bottle
 *   unit Tube   (and no tablets-per-strip)          → tube
 *   unit Strip/Tablet/Capsule + valid pack size     → blister
 *   unit Strip/Tablet/Capsule, no valid pack size   → needs-setup (blister, incomplete)
 *   anything else, or contradictory data            → ambiguous
 *
 * "Ambiguous" is never guessed. The page shows no cuttable or draggable model;
 * a user with product-edit permission can pick the type for that scan.
 */
import type { Product } from '@/types'
import { MAX_PACK, MIN_PACK } from './blisterGeometry'

export type PackagingType = 'blister' | 'bottle' | 'tube'

export const PACKAGING_LABEL: Record<PackagingType, string> = { blister: 'Blister pack', bottle: 'Bottle', tube: 'Tube' }

/** Exact instruction line shown for each active packaging. */
export const PACKAGING_INSTRUCTION: Record<PackagingType, string> = {
  blister: 'Swipe to cut · Drag pieces to basket.',
  bottle:  'Drag bottle to basket.',
  tube:    'Drag tube to basket.',
}

/** Only a blister can be cut. */
export const canCut = (t: PackagingType) => t === 'blister'

export type PackagingResult =
  | { status: 'ok'; type: PackagingType }
  | { status: 'needs-setup' }
  | { status: 'ambiguous'; reason: string }

export const validPack = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_PACK && v <= MAX_PACK

const BLISTER_UNITS = ['strip', 'tablet', 'capsule']

export function resolvePackaging(p: Pick<Product, 'unit' | 'tablets_per_strip'>): PackagingResult {
  const unit = String(p.unit ?? '').trim().toLowerCase()
  const rawPack = p.tablets_per_strip
  const hasPackValue = rawPack !== null && rawPack !== undefined
  const pack = hasPackValue ? Number(rawPack) : NaN

  if (unit === 'bottle' || unit === 'tube') {
    if (hasPackValue) return { status: 'ambiguous', reason: `The unit is ${p.unit}, but a “tablets per strip” value is also set.` }
    return { status: 'ok', type: unit as PackagingType }
  }
  if (BLISTER_UNITS.includes(unit)) {
    return validPack(pack) ? { status: 'ok', type: 'blister' } : { status: 'needs-setup' }
  }
  return { status: 'ambiguous', reason: unit ? `The unit “${p.unit}” does not say whether this is a blister, bottle or tube.` : 'This product has no unit.' }
}
