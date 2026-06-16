/**
 * DevBadge.tsx
 * Shows a small badge in the corner when running in dev mode.
 * Automatically hidden in production (VITE_SHOW_DEV_BADGE=false).
 * Shows which backend URL is being used.
 */
import { useState } from 'react'
import { config } from '@/config/env'

export default function DevBadge() {
  const [expanded, setExpanded] = useState(false)

  // Only render in dev when flag is enabled
  if (!config.showDevBadge) return null

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        position:     'fixed',
        bottom:       12,
        right:        12,
        zIndex:       99999,
        cursor:       'pointer',
        userSelect:   'none',
        fontFamily:   'monospace',
        fontSize:     11,
        lineHeight:   1.4,
      }}
    >
      {/* Collapsed pill */}
      {!expanded && (
        <div style={{
          background:   '#f59e0b',
          color:        '#000',
          padding:      '3px 10px',
          borderRadius: 99,
          fontWeight:   700,
          letterSpacing: 0.5,
          boxShadow:    '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          ⚡ DEV
        </div>
      )}

      {/* Expanded info panel */}
      {expanded && (
        <div style={{
          background:   '#1e293b',
          color:        '#e2e8f0',
          padding:      '10px 14px',
          borderRadius: 10,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.4)',
          minWidth:     220,
        }}>
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>
            ⚡ DEV MODE
          </div>
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}>
            Backend
          </div>
          <div style={{ color: config.isLocalBackend ? '#4ade80' : '#60a5fa', wordBreak: 'break-all' }}>
            {config.isLocalBackend ? '🖥 Local' : '☁️ Remote'}: {config.backendUrl}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 6, marginBottom: 2 }}>
            Mode
          </div>
          <div>{config.mode}</div>
          <div style={{ color: '#475569', fontSize: 9, marginTop: 8, borderTop: '1px solid #334155', paddingTop: 6 }}>
            Click to collapse
          </div>
        </div>
      )}
    </div>
  )
}
