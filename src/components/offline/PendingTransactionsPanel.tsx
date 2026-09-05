/**
 * PendingTransactionsPanel.tsx
 *
 * The actual "where do I see pending sales bills" screen — until now the
 * only thing surfacing the offline queue was OfflineStatusIndicator's
 * corner pill, which shows a count and nothing else (not even clickable).
 * This panel opens from that pill and lists every queued transaction:
 * still-offline / waiting-to-retry / needs-attention (permanently failed,
 * e.g. a locked accounting period — see syncEngine.ts's `retryable: false`
 * handling), with the server's own message for why, and two actions:
 *
 *   - Retry now  — re-queues it as immediately due and kicks off a sync
 *     pass right away (OfflineProvider.retryTransaction), instead of
 *     waiting out backoff or, for a permanently-failed item, waiting
 *     forever.
 *   - Discard    — removes it from the queue for good (syncQueue.ts's
 *     discardQueueItem). Only offered on failed items — a deliberate
 *     "give up on this one, I'll re-enter it by hand" action, never
 *     automatic (requirement #5: failed transactions are never silently
 *     removed).
 *
 * Read-only otherwise: this never talks to the server directly, only to
 * the local IndexedDB queue via OfflineProvider — the actual upload still
 * goes through syncEngine.ts's existing runSync, unchanged.
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Clock, RefreshCw, AlertTriangle, Trash2, WifiOff, Loader2, CheckCircle2 } from 'lucide-react'
import { useOffline } from '@/offline/OfflineProvider'
import type { QueuedTransaction } from '@/offline/db'

interface Props {
  onClose: () => void
}

function isPermanentlyFailed(item: QueuedTransaction): boolean {
  return item.status === 'failed' && !item.next_retry_at
}

function estimateTotal(item: QueuedTransaction): number {
  const items = (item.payload?.items as any[]) || []
  return items.reduce((sum, it) => sum + (Number(it.amount) || 0) + (Number(it.cc_amount) || 0), 0)
}

function itemCount(item: QueuedTransaction): number {
  return ((item.payload?.items as any[]) || []).length
}

function StatusBadge({ item }: { item: QueuedTransaction }) {
  if (item.status === 'synced') {
    return <span className="ptp-badge ptp-badge--synced"><CheckCircle2 size={12} /> Synced</span>
  }
  if (item.status === 'syncing') {
    return <span className="ptp-badge ptp-badge--syncing"><Loader2 size={12} className="ptp-spin" /> Syncing…</span>
  }
  if (isPermanentlyFailed(item)) {
    return <span className="ptp-badge ptp-badge--danger"><AlertTriangle size={12} /> Needs attention</span>
  }
  if (item.status === 'failed') {
    return <span className="ptp-badge ptp-badge--warn"><Clock size={12} /> Waiting to retry</span>
  }
  return <span className="ptp-badge ptp-badge--pending"><WifiOff size={12} /> Pending upload</span>
}

export default function PendingTransactionsPanel({ onClose }: Props) {
  const { listPendingTransactions, retryTransaction, discardTransaction, syncNow, isOnline } = useOffline()
  const [items, setItems]     = useState<QueuedTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const all = await listPendingTransactions()
    // Newest first, synced ones (kept briefly by the queue) at the bottom —
    // what needs a person's eyes belongs at the top.
    setItems(
      [...all].sort((a, b) => {
        if (a.status === 'synced' && b.status !== 'synced') return 1
        if (b.status === 'synced' && a.status !== 'synced') return -1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    )
    setLoading(false)
  }, [listPendingTransactions])

  useEffect(() => { refresh() }, [refresh])

  // Light auto-refresh while open so a backoff countdown ticking over, or
  // another tab's sync run completing, doesn't look frozen.
  useEffect(() => {
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  async function handleRetry(clientTxnId: string) {
    setBusyId(clientTxnId)
    try {
      await retryTransaction(clientTxnId)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDiscard(clientTxnId: string) {
    if (!window.confirm('Discard this transaction? It will NOT be uploaded — this cannot be undone.')) return
    setBusyId(clientTxnId)
    try {
      await discardTransaction(clientTxnId)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleSyncAll() {
    setLoading(true)
    await syncNow()
    await refresh()
  }

  const outstanding = items.filter(i => i.status !== 'synced')

  return createPortal(
    <div className="ptp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ptp-panel" role="dialog" aria-modal="true" aria-label="Pending Sales Transactions">
        <div className="ptp-header">
          <div>
            <h2 className="ptp-title">Pending Sales Bills</h2>
            <p className="ptp-subtitle">
              {outstanding.length === 0
                ? 'Everything is synced.'
                : `${outstanding.length} transaction${outstanding.length === 1 ? '' : 's'} not yet on the server`}
            </p>
          </div>
          <button type="button" className="ptp-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="ptp-toolbar">
          <span className="ptp-conn">{isOnline ? '🟢 Online' : '🟠 Offline'}</span>
          <button type="button" className="ptp-btn-sync" onClick={handleSyncAll} disabled={!isOnline || loading}>
            <RefreshCw size={13} className={loading ? 'ptp-spin' : ''} /> Sync now
          </button>
        </div>

        <div className="ptp-body">
          {loading ? (
            <div className="ptp-empty"><Loader2 size={18} className="ptp-spin" /> Loading…</div>
          ) : items.length === 0 ? (
            <div className="ptp-empty">No offline sales bills yet.</div>
          ) : (
            items.map(item => (
              <div key={item.client_txn_id} className="ptp-row">
                <div className="ptp-row-main">
                  <div className="ptp-row-top">
                    <span className="ptp-ref">{item.temp_ref}</span>
                    <StatusBadge item={item} />
                  </div>
                  <div className="ptp-row-meta">
                    {itemCount(item)} item{itemCount(item) === 1 ? '' : 's'} · Rs. {estimateTotal(item).toFixed(2)} ·{' '}
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                  {item.last_error && (
                    <div className="ptp-row-error">{item.last_error}</div>
                  )}
                  {item.status === 'failed' && !isPermanentlyFailed(item) && item.next_retry_at && (
                    <div className="ptp-row-retry-hint">
                      Retrying automatically around {new Date(item.next_retry_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>
                {item.status !== 'synced' && item.status !== 'syncing' && (
                  <div className="ptp-row-actions">
                    <button
                      type="button"
                      className="ptp-btn-retry"
                      onClick={() => handleRetry(item.client_txn_id)}
                      disabled={!isOnline || busyId === item.client_txn_id}
                      title={isOnline ? 'Retry now' : 'Reconnect to retry'}
                    >
                      <RefreshCw size={12} /> Retry
                    </button>
                    {item.status === 'failed' && (
                      <button
                        type="button"
                        className="ptp-btn-discard"
                        onClick={() => handleDiscard(item.client_txn_id)}
                        disabled={busyId === item.client_txn_id}
                        title="Discard — will not be uploaded"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
