/**
 * OfflineStatusIndicator.tsx
 *
 * Deliberately small and easy to ignore — a corner pill, never a modal or
 * full-width banner (requirement #4: "Do not create a large blocking
 * offline popup"). Pure presentation; all the actual state comes from
 * OfflineProvider's context, so this component has no logic of its own
 * beyond picking which of the four states to render.
 */
import useAuthStore from '@/store/authStore'
import { useOffline } from '@/offline/OfflineProvider'
import { Z } from '@/styles/zIndex'

export default function OfflineStatusIndicator() {
  const company = useAuthStore(s => s.company)
  const { isOnline, syncPhase, pendingCount, justSyncedCount } = useOffline()

  // No company = not logged in yet — nothing to show a connection status
  // for (the login page itself doesn't need offline billing).
  if (!company) return null

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

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: Z.offlineIndicator,
        maxWidth: 'calc(100vw - 20px)',
        padding: '5px 10px',
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
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',   // never intercepts taps/clicks underneath it
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )
}
