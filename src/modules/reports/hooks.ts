import { useEffect, useState } from 'react'

/** Raw viewport width, updated on resize. */
export function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return width
}

/**
 * Returns the actual horizontal padding of `.page-content` at the current
 * viewport width — mirrors the media queries in globals.css exactly.
 */
export function usePagePx() {
  const w = useWindowWidth()
  if (w <= 640) return 10
  if (w <= 768) return 14
  return 28
}
