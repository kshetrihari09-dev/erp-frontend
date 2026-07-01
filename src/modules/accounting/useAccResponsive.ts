import { useEffect, useState } from 'react'

/**
 * Lightweight responsive breakpoint hook, scoped to the Accounting module.
 * Mirrors the same window.innerWidth + resize-listener pattern already used
 * by AppLayout.tsx for the sidebar drawer, so layout decisions are driven
 * directly by JS state rather than CSS media queries — this avoids any
 * dependency on stylesheet load order, CSS caching, or specificity.
 *
 * Breakpoints:
 *   mobile:  < 768px
 *   tablet:  768px – 1024px
 *   desktop: > 1024px
 *
 * Pure frontend layout helper — no business/data logic involved.
 */
export function useAccResponsive() {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isMobile = width < 768
  const isTablet = width >= 768 && width <= 1024
  const isDesktop = width > 1024

  return { width, isMobile, isTablet, isDesktop }
}
