import { useEffect, useState } from 'react'

/**
 * usePrintResponsive.ts
 *
 * Lightweight responsive breakpoint hook, scoped to the Print Preview module.
 * Mirrors the same window.innerWidth + resize-listener pattern already used
 * by useAccResponsive (Accounting module) / AppLayout.tsx (sidebar drawer),
 * so layout decisions are driven directly by JS state rather than CSS media
 * queries — this avoids any dependency on stylesheet load order, CSS
 * caching, or specificity (issues previously hit with pure-CSS breakpoints
 * in this project's Vite dev environment).
 *
 * Breakpoints (per Print Preview redesign spec):
 *   mobile:  < 768px
 *   tablet:  768px – 1023px
 *   desktop: >= 1024px
 *
 * Pure frontend layout helper — no business/print/data logic involved.
 */
export function usePrintResponsive() {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const isMobile  = width < 768
  const isTablet  = width >= 768 && width < 1024
  const isDesktop = width >= 1024

  return { width, isMobile, isTablet, isDesktop }
}
