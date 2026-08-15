/**
 * OfflineStatusIndicator.tsx
 *
 * Deliberately small and easy to ignore — a corner pill, never a modal or
 * full-width banner (requirement #4: "Do not create a large blocking
 * offline popup"). Pure presentation; all the actual state comes from
 * OfflineProvider's context, so this component has no logic of its own
 * beyond picking which state to render.
 *
 * ── LAN sync extension ──────────────────────────────────────────────────
 * Per the LAN sync spec: "DO NOT create another status indicator... reuse
 * the existing one... use its tooltip/popover/details for extra states."
 * This is still the ONE global connection/sync indicator — same position,
 * same size, same red/green(/blue/amber) family of colors, same pill
 * shape. What's new:
 *   - a `conflict` state (a queued sale the server's atomic stock check
 *     rejected — see offline/syncEngine.ts) surfaces here rather than
 *     silently sitting in the queue, with a "requires attention" label
 *     matching the spec's own example wording
 *   - a native `title` tooltip carries the fuller detail line ("Server
 *     connected • Synced" / "Offline • 3 pending transactions" / "Sync
 *     conflict • 1 transaction requires attention") without adding any
 *     visible chrome — the pill itself stays exactly as compact as before
 *   - tapping the pill navigates to Settings → Devices & Sync so a
 *     conflict is never more than one tap from being resolved
 *
 * The one deliberate behavior change: the pill now needs pointerEvents
 * `auto` (was `none`) so it can actually receive that tap/hover — it's a
 * small fixed-position badge, so this doesn't meaningfully change what it
 * overlaps in practice, and it's what "use its tooltip" requires.
 */
import { useNavigate } from 'react-router-dom'
import useAuthStore from '@/store/authStore'
import { useOffline } from '@/offline/OfflineProvider'
import { Z } from '@/styles/zIndex'

export default function OfflineStatusIndicator() {
  const company = useAuthStore(s => s.company)
  const navigate = useNavigate()
  const { isOnline, syncPhase, pendingCount, conflictCount, justSyncedCount } = useOffline()

  // No company = not logged in yet — nothing to show a connection status
  // for (the login page itself doesn't need offline billing).
  if (!company) return null

  let label = '🟢 Online'
  let detail = 'Server connected • Synced'
  let bg = 'rgba(22,163,74,0.12)'
  let color = '#15803d'
  let border = 'rgba(22,163,74,0.28)'

  // Conflict takes priority over every other state — it's the one case
  // that genuinely needs a person to act, not just wait.
  if (conflictCount > 0) {
    label = `🟠 Sync conflict • ${conflictCount} transaction${conflictCount === 1 ? '' : 's'} need${conflictCount === 1 ? 's' : ''} attention`
    detail = `Sync conflict • ${conflictCount} transaction${conflictCount === 1 ? '' : 's'} requires attention — tap to review`
    bg = 'rgba(234,88,12,0.14)'; color = '#c2410c'; border = 'rgba(234,88,12,0.32)'
  } else if (!isOnline) {
    label = '🔴 Offline — Transactions will sync automatically'
    detail = pendingCount > 0
      ? `Offline • ${pendingCount} pending transaction${pendingCount === 1 ? '' : 's'}`
      : 'Offline • no pending transactions'
    bg = 'rgba(220,38,38,0.12)'; color = '#b91c1c'; border = 'rgba(220,38,38,0.3)'
  } else if (syncPhase === 'syncing-queue' && pendingCount > 0) {
    label = `🔄 Syncing ${pendingCount} transaction${pendingCount === 1 ? '' : 's'}...`
    detail = `Syncing ${pendingCount} transaction${pendingCount === 1 ? '' : 's'} to server`
    bg = 'rgba(37,99,235,0.12)'; color = '#1d4ed8'; border = 'rgba(37,99,235,0.3)'
  } else if (justSyncedCount > 0) {
    label = '🟢 All transactions synced'
    detail = 'Server connected • Synced'
  } else if (pendingCount > 0) {
    // Online, but the queue hasn't been picked up yet this tick (e.g.
    // catalog sync is still running ahead of the queue drain) — still
    // worth surfacing so it's never silently invisible that something's
    // waiting.
    label = `🟢 Online — ${pendingCount} pending`
    detail = `Server connected • ${pendingCount} pending transaction${pendingCount === 1 ? '' : 's'}`
  }

  const actionable = conflictCount > 0

  return (
    <div
      role="status"
      aria-live="polite"
      title={detail}
      onClick={actionable ? () => navigate('/settings?section=devices') : undefined}
      style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
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
        // Small fixed badge — safe to receive its own tap/hover for the
        // tooltip + "jump to conflicts" affordance without meaningfully
        // blocking anything it happens to sit over.
        pointerEvents: 'auto',
        cursor: actionable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )
}
