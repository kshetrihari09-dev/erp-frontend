/**
 * pollIntervals.ts — pure "when should this query poll next?" decisions.
 *
 * react-query calls `refetchInterval(query)` after every fetch. Returning `false`
 * stops polling; a number schedules the next fetch. It never overlaps requests
 * (the next timer starts only after the current fetch settles) and pauses while the
 * tab is hidden (refetchIntervalInBackground defaults to false).
 */

interface PollState {
  data?: { status?: string } | null
  error?: { status?: number; retryAfterMs?: number | null } | null
  dataUpdateCount: number
  fetchFailureCount: number
}

export const SCAN_POLL_FAST_MS = 2_000
export const SCAN_POLL_MEDIUM_MS = 5_000
export const SCAN_POLL_SLOW_MS = 10_000
export const SCAN_POLL_MAX_BACKOFF_MS = 30_000
/** Polls at 2 s for the first 30 s, 5 s up to ~2.5 min, 10 s up to ~7.5 min, then stops (≈ 10 min total). */
const FAST_POLLS = 15
const MEDIUM_POLLS = 45
const SLOW_POLLS = 75

const IN_PROGRESS = new Set(['uploaded', 'processing'])

/**
 * Purchase-bill OCR status poll.
 *  - finished / failed / cancelled status      → stop (the operation completed)
 *  - permanent HTTP error (403, 404, 410 …)    → stop (retrying cannot succeed)
 *  - 429                                       → keep going, but not sooner than Retry-After
 *  - network / 5xx                             → exponential backoff, capped at 30 s
 *  - healthy                                   → 2 s → 5 s → 10 s, bounded (≈ 10 minutes)
 */
export function purchaseScanPollInterval(state: PollState): number | false {
  const status = state.data?.status
  if (state.data && !IN_PROGRESS.has(String(status))) return false
  if (!state.data && !state.error) return SCAN_POLL_FAST_MS

  const err = state.error
  if (err && state.fetchFailureCount > 0) {
    const http = err.status
    if (http === 429) return Math.max(SCAN_POLL_MEDIUM_MS, Math.min(err.retryAfterMs ?? 60_000, 5 * 60_000))
    if (typeof http === 'number' && http >= 400 && http < 500 && http !== 408) return false
    const backoff = SCAN_POLL_FAST_MS * 2 ** Math.min(state.fetchFailureCount, 4)
    return Math.min(SCAN_POLL_MAX_BACKOFF_MS, backoff)
  }

  const n = state.dataUpdateCount
  if (n < FAST_POLLS) return SCAN_POLL_FAST_MS
  if (n < MEDIUM_POLLS) return SCAN_POLL_MEDIUM_MS
  if (n < SLOW_POLLS) return SCAN_POLL_SLOW_MS
  return false
}

/** Reminder overdue/due-today badge: low-urgency, so every 2 minutes (was 1). */
export const REMINDER_COUNTS_POLL_MS = 120_000
