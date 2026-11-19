/**
 * appInstance.ts — the identity of THIS RUN of the app.
 *
 * A random id generated the first time it is asked for after the app starts and kept ONLY IN MEMORY: never in localStorage,
 * sessionStorage, cookies or IndexedDB. It is sent as `X-App-Instance` on every API request, and the server binds every login
 * session to the instance that created it (migration 058). Closing the app and opening it again — or reloading the page —
 * is therefore a different instance: whatever the previous run held (even if some token had been kept) is useless, and the user
 * has to pass account login + Role ID / Role Password verification again.
 */
let instanceId: string | null = null

const b64url = (bytes: Uint8Array) => {
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getAppInstanceId(): string {
  if (!instanceId) {
    const bytes = new Uint8Array(24)                 // 192 bits → 32 URL-safe characters
    globalThis.crypto.getRandomValues(bytes)
    instanceId = b64url(bytes)
  }
  return instanceId
}

/** Test helper only: forget the id (as a fresh app start would). */
export function __resetAppInstanceForTests() { instanceId = null }
