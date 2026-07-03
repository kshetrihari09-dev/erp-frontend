import type { CSSProperties } from 'react'

// All surfaces, borders and text use CSS custom properties so every report
// automatically adapts to light / dark mode via globals.css `.dark { }` vars.

export const CARD: CSSProperties = {
  background:   'var(--surface)',
  border:       '1px solid var(--border)',
  borderRadius: 16,
  boxShadow:    'var(--shadow-sm)',
}

export const TH: CSSProperties = {
  padding: '10px 14px',
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border)',
  fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.6px',
  textAlign: 'left', whiteSpace: 'nowrap',
}

export const TD: CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13, color: 'var(--text)',
  verticalAlign: 'middle',
}

export const TDR: CSSProperties = {
  ...TD, textAlign: 'right',
  fontVariantNumeric: 'tabular-nums', fontWeight: 500,
}
