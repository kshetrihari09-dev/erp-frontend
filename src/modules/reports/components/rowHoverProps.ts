import type { CSSProperties, MouseEvent } from 'react'
import { A } from '../constants'

/** Zebra-striped table row with a subtle brand-tint hover highlight. */
export function rowHoverProps(i: number) {
  const base = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
  return {
    style: { background: base } as CSSProperties,
    onMouseEnter: (e: MouseEvent<HTMLTableRowElement>) => { e.currentTarget.style.background = A.primary + '08' },
    onMouseLeave: (e: MouseEvent<HTMLTableRowElement>) => { e.currentTarget.style.background = base },
  }
}
