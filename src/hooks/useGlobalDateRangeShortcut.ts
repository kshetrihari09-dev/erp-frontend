import { useEffect, type RefObject } from 'react'
import { createDateRangeKeyHandler } from '@/utils/dateRangeShortcut'

/**
 * Shift+D opens the date-range popup of whatever page is showing. Call it ONCE, in the app shell (AppLayout), with the
 * ref of the page-content element. Pages need no code of their own.
 */
export function useGlobalDateRangeShortcut(contentRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = createDateRangeKeyHandler(() => contentRef.current)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [contentRef])
}
