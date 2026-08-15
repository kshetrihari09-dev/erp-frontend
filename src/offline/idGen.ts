/**
 * offline/idGen.ts
 *
 * Two distinct IDs are generated per offline transaction, and they must
 * stay distinct (see requirement #9):
 *   - client_txn_id : a real UUID, sent to the server, used as the
 *                      idempotency key (erp-unified-backend migration
 *                      025) — never shown to the cashier.
 *   - temp_ref       : a short human-readable label ("OFFLINE-3F2A9C")
 *                      shown on screen/print while the sale is still
 *                      queued, replaced by the server's real invoice_no
 *                      the moment it syncs. Deliberately NOT a valid-
 *                      looking invoice number — see SalesPage's offline
 *                      success state — so it can never be mistaken for
 *                      one, even briefly.
 */

/** RFC4122 v4 UUID. crypto.randomUUID() is available in every browser
 *  this app already requires for the camera scanner (Chrome/Safari/
 *  Firefox current, all support it) — a manual fallback is included
 *  purely for older embedded WebViews some POS hardware still ships. */
export function generateClientTxnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback: not cryptographically strong, but only ever needs to be
  // unique per-device — collision odds are irrelevant at this volume.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function generateTempRef(clientTxnId: string): string {
  return `OFFLINE-${clientTxnId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

/** Stable per-browser-install identifier, used only as the `device_id`
 *  attached to queued transactions (requirement #6 / stock-conflict
 *  debugging — "Device A ... Device B ..."). Not an auth mechanism, not
 *  sent anywhere except inside the transaction payload itself. */
export function getDeviceId(): string {
  const KEY = 'byapar_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = generateClientTxnId()
    localStorage.setItem(KEY, id)
  }
  return id
}
