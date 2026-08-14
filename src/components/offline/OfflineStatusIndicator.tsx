/**
 * OfflineStatusIndicator.tsx
 *
 * Deliberately small and easy to ignore — a pill, never a modal or
 * full-width banner (requirement #4: "Do not create a large blocking
 * offline popup"). Pure presentation; all the actual state comes from
 * OfflineProvider's context, so this component has no logic of its own
 * beyond picking which of the four states to render.
 *
 * Two render modes:
 *  - inline (default false): sits in normal document flow, sized to match
 *    the topbar row (used next to the quick-search box on desktop — see
 *    AppLayout.tsx). Caller is responsible for placement/spacing.
 *  - fixed (inline=false): the original floating corner pill, still used
 *    on mobile where the topbar has no search box for it to sit beside
 *    (AppLayout hides `.topbar-search` under the MOBILE_BP breakpoint, so
 *    this component mirrors that same breakpoint and renders nothing on
 *    desktop — the inline instance in the topbar covers it there).
 */
import { useEffect, useState, type CSSProperties } from 'react'
import useAuthStore from '@/store/authStore'
import { useOffline } from '@/offline/OfflineProvider'
import { Z } from '@/styles/zIndex'

// Mirrors MOBILE_BP in src/layouts/AppLayout.tsx — keep in sync.
const MOBILE_BP = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BP)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BP)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function OfflineStatusIndicator({ inline = false }: { inline?: boolean }) {
  const company = useAuthStore(s => s.company)
  const { isOnline, syncPhase, pendingCount, justSyncedCount } = useOffline()
  const isMobile = useIsMobile()

  // No company = not logged in yet — nothing to show a connection status
  // for (the login page itself doesn't need offline billing).
  if (!company) return null

  // The fixed corner variant is mobile-only — on desktop the inline
  // instance beside the topbar search box is the one that renders.
  if (!inline && !isMobile) return null

  let label = '🟢 Online'
  let bg = 'rgba(22,163,74,0.12)'
  let color = '#15803d'
  let border = 'rgba(22,163,74,0.28)'

  if (!isOnline) {
    label = '🟠 Offline — Transactions will sync automatically'
    bg = 'rgba(217,119,6,0.12)'; color = '#b45309'; border = 'rgba(217,119,6,0.3)'
  } else if (syncPhase === 'syncing-queue' && pendingCount > 0) {
    label = `🔄 Syncing ${pendingCount} transaction${pendingCount === 1 ? '' : 's'}...`
    bg = 'rgba(37,99,235,0.12)'; color = '#1d4ed8'; border = 'rgba(37,99,235,0.3)'
  } else if (justSyncedCount > 0) {
    label = '🟢 All transactions synced'
  } else if (pendingCount > 0) {
    // Online, but the queue hasn't been picked up yet this tick (e.g.
    // catalog sync is still running ahead of the queue drain) — still
    // worth surfacing so it's never silently invisible that something's
    // waiting.
    label = `🟢 Online — ${pendingCount} pending`
  }

  const sharedStyle: CSSProperties = {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    background: bg,
    color,
    border: `1px solid ${border}`,
    userSelect: 'none',
  }

  const style: CSSProperties = inline
    ? {
        ...sharedStyle,
        // Sits in the topbar's flex row, right after the search box —
        // height-matched to `.topbar-search` (36px) rather than floating.
        display: 'flex',
        alignItems: 'center',
        marginLeft: 10,
        flexShrink: 0,
        height: 36,
        padding: '0 12px',
        maxWidth: 220,
        boxSizing: 'border-box',
      }
    : {
        ...sharedStyle,
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: Z.offlineIndicator,
        maxWidth: 'calc(100vw - 20px)',
        padding: '5px 10px',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',   // never intercepts taps/clicks underneath it
      }

  return (
    <div role="status" aria-live="polite" style={style}>
      {label}
    </div>
  )
}
