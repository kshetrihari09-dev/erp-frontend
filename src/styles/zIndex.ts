/**
 * zIndex.ts
 *
 * Mirrors the --z-* custom properties defined in src/styles/globals.css.
 * Anything that sets z-index via an inline style or a JS constant (React
 * portals, the full-screen scanner overlays, the dev environment badge)
 * pulls from here instead of hardcoding a number — CSS classes should use
 * the `--z-*` custom properties directly instead of importing this.
 *
 * These two files are the ONLY places a z-index value should be defined.
 * If a new layer is ever needed, add a rung to the scale in BOTH files
 * rather than reaching for an arbitrary number (999999, 9999, etc.) —
 * that ad-hoc pattern is exactly what caused the clipping/stacking bugs
 * this file replaces.
 *
 * Order, low to high: sticky headers < dropdowns/popovers/tooltips <
 * mobile bars/FAB < offline status indicator < drawers/sidebars < modal
 * backdrop < modal panel < full-screen scanner overlay < a modal launched
 * from within another modal or dropdown (e.g. Quick Add Product, opened
 * from a row's autocomplete dropdown) < toast notifications (always the
 * top-most layer) < dev-only badge.
 */
export const Z = {
  base:          1,
  sticky:        100,
  sidebar:       200,
  dropdown:      1000,
  fab:           1100,
  mobileBar:     1150,
  // Small persistent corner pill (see components/offline/
  // OfflineStatusIndicator.tsx) — above ordinary page content and the
  // mobile bar so it's never hidden, but below drawers/modals so opening
  // one doesn't visually fight with it.
  offlineIndicator: 1170,
  drawer:        1200,
  modalBackdrop: 1300,
  modal:         1310,
  scanner:       1400,
  nestedModal:   1500,
  toast:         1600,
  devBadge:      1700,
} as const
