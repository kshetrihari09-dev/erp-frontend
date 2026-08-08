/**
 * stepUpToken.ts
 *
 * Caches the short-lived step-up token (see backend utils/stepUp.js) that
 * proves the current user recently re-verified their PIN/password, so
 * they're not re-prompted on every single sensitive action within the
 * validity window (~10 minutes, set by the backend).
 *
 * Deliberately an in-memory module-level variable, NOT localStorage or
 * sessionStorage — the security spec is explicit that the PIN/step-up
 * credential must never touch persistent browser storage. A page reload
 * or new tab loses the cached token, which is the correct behavior: the
 * person re-verifies once and moves on, but nothing survives a refresh.
 */

let cached: { token: string; expiresAt: number } | null = null

/** `expiresIn` is in seconds, matching the backend's JWT `expiresIn`. */
export function setStepUpToken(token: string, expiresIn: number) {
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 }
}

/** Returns the cached token only if it hasn't expired yet, else null. */
export function getValidStepUpToken(): string | null {
  if (!cached) return null
  if (Date.now() >= cached.expiresAt) { cached = null; return null }
  return cached.token
}

export function clearStepUpToken() {
  cached = null
}

/** Convenience for attaching to an axios request config's headers. */
export function stepUpHeader(): Record<string, string> {
  const token = getValidStepUpToken()
  return token ? { 'X-Step-Up-Token': token } : {}
}
