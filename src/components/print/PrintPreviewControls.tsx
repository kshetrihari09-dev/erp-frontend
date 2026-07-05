/**
 * PrintPreviewControls.tsx
 *
 * Shared, presentation-only building blocks for the Print Preview panel:
 * labels, dividers, keyboard-shortcut chips, action buttons, the paper-size
 * segmented control, the copies stepper, and the full controls panel used
 * on desktop (right sidebar) and tablet (full-width panel below preview).
 *
 * No business/print logic lives here — everything is driven by props from
 * PrintPreviewModal.tsx.
 */
import type { ReactNode } from 'react'
import {
  Printer, Download, Copy, Mail, MessageCircle,
  ChevronRight, Clock, UploadCloud, Loader2,
} from 'lucide-react'
import type { PrintSize } from './usePrint'

export function SideLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3,#888)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
      {children}
    </div>
  )
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--border,#e2e8f0)', margin: '4px 0', flexShrink: 0 }} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{ background: 'var(--surface-2,#f1f5f9)', border: '1px solid var(--border,#e2e8f0)', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>
      {children}
    </kbd>
  )
}

export function ActionBtn({ icon, label, shortcut, color, onClick, primary, touchLarge }: {
  icon: ReactNode; label: string; shortcut?: string; color: string; onClick: () => void
  primary?: boolean; touchLarge?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%',
        minHeight: touchLarge ? 44 : undefined,
        padding: touchLarge ? '10px 14px' : primary ? '8px 10px' : '6px 10px',
        borderRadius: 8,
        border: primary ? `1.5px solid ${color}` : '1.5px solid var(--border,#e2e8f0)',
        background: primary ? color : 'transparent',
        color:   primary ? '#fff' : color,
        fontSize: touchLarge ? 14 : 12, fontWeight: primary ? 700 : 500,
        cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap' as const,
        boxSizing: 'border-box' as const,
      }}
    >
      {icon}
      <span style={{ flex: 1, textAlign: 'left' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {shortcut && <span style={{ fontSize: 9, opacity: 0.65, fontWeight: 400, flexShrink: 0 }}>{shortcut}</span>}
    </button>
  )
}

export const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
  color: 'var(--text-3,#888)', borderRadius: 6,
  minWidth: 32, minHeight: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export const counterBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  border: '1.5px solid var(--border,#e2e8f0)',
  background: 'transparent', cursor: 'pointer',
  fontSize: 16, fontWeight: 700, color: 'var(--text-2,#444)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

/* ── Paper size segmented control ─────────────────────────────────────────── */

const SIZE_OPTIONS: { value: PrintSize; label: string }[] = [
  { value: 'a4',         label: 'A4' },
  { value: 'thermal-80', label: '80mm' },
  { value: 'thermal-58', label: '58mm' },
]

export function PaperSizeSegmented({ size, onChange, typeColor, touchLarge }: {
  size: PrintSize; onChange: (s: PrintSize) => void; typeColor: string; touchLarge?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Paper size"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
        width: '100%',
      }}
    >
      {SIZE_OPTIONS.map(opt => {
        const active = size === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            style={{
              minHeight: touchLarge ? 44 : 30,
              borderRadius: 8,
              border: active ? `1.5px solid ${typeColor}` : '1.5px solid var(--border,#e2e8f0)',
              background: active ? typeColor + '14' : 'transparent',
              color: active ? typeColor : 'var(--text-2,#444)',
              fontWeight: active ? 700 : 500,
              fontSize: touchLarge ? 13 : 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              padding: '0 4px',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Copies stepper ────────────────────────────────────────────────────────── */

export function CopiesStepper({ copies, setCopies, touchLarge }: {
  copies: number; setCopies: (fn: (c: number) => number) => void; touchLarge?: boolean
}) {
  const btnStyle: React.CSSProperties = touchLarge
    ? { ...counterBtnStyle, width: 44, height: 44, fontSize: 18 }
    : counterBtnStyle
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: touchLarge ? 12 : 8 }}>
      <button aria-label="Decrease copies" onClick={() => setCopies(c => Math.max(1, c - 1))} style={btnStyle}>−</button>
      <span style={{ fontWeight: 700, fontSize: touchLarge ? 16 : 15, minWidth: 24, textAlign: 'center' }}>{copies}</span>
      <button aria-label="Increase copies" onClick={() => setCopies(c => Math.min(5, c + 1))} style={btnStyle}>+</button>
    </div>
  )
}

/* ── Full controls panel (desktop sidebar / tablet panel) ────────────────── */

export interface ControlsPanelProps {
  layout: 'sidebar' | 'panel'
  size: PrintSize
  setSize: (s: PrintSize) => void
  copies: number
  setCopies: (fn: (c: number) => number) => void
  typeColor: string
  handlePrint: () => void
  handleDownload: () => void
  handleCloudBackup: () => void
  backingUp: boolean
  handleEmail: () => void
  handleWhatsApp: () => void
  handleDuplicate: () => void
  onNextBill?: () => void
  handleNextBill: () => void
  onClose: () => void
}

export function ControlsPanel({
  layout, size, setSize, copies, setCopies, typeColor,
  handlePrint, handleDownload, handleCloudBackup, backingUp,
  handleEmail, handleWhatsApp, handleDuplicate,
  onNextBill, handleNextBill, onClose,
}: ControlsPanelProps) {
  const isSidebar = layout === 'sidebar'

  return (
    <div
      className={isSidebar ? 'ppm-sidebar' : 'ppm-panel'}
      style={
        isSidebar
          ? {
              width: 'clamp(180px, 20vw, 224px)', flexShrink: 0,
              borderLeft: '1px solid var(--border,#e2e8f0)', padding: '16px 12px',
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'var(--surface,#fff)', overflowY: 'auto',
            }
          : {
              width: '100%', borderTop: '1px solid var(--border,#e2e8f0)',
              padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              background: 'var(--surface,#fff)', boxSizing: 'border-box' as const,
            }
      }
    >
      <div style={isSidebar ? undefined : { display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {/* Paper size */}
        <div style={{ marginBottom: isSidebar ? 4 : 0, flex: isSidebar ? undefined : '1 1 220px', minWidth: isSidebar ? undefined : 200 }}>
          <SideLabel>Paper Size</SideLabel>
          {isSidebar ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(['a4', 'thermal-80', 'thermal-58'] as PrintSize[]).map(s => (
                <button key={s} onClick={() => setSize(s)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 8px', borderRadius: 6,
                  border: size === s ? `1.5px solid ${typeColor}` : '1.5px solid transparent',
                  background: size === s ? typeColor + '12' : 'transparent',
                  color: size === s ? typeColor : 'var(--text-2,#444)',
                  fontSize: 12, cursor: 'pointer', fontWeight: size === s ? 600 : 400,
                  transition: 'all 0.15s',
                }}>
                  {s === 'a4' ? 'A4 (Standard)' : s === 'thermal-80' ? 'Thermal 80mm' : 'Thermal 58mm'}
                </button>
              ))}
            </div>
          ) : (
            <PaperSizeSegmented size={size} onChange={setSize} typeColor={typeColor} touchLarge />
          )}
        </div>

        {/* Copies */}
        <div style={{ marginBottom: isSidebar ? 8 : 0, flex: isSidebar ? undefined : '0 0 auto' }}>
          <SideLabel>Copies</SideLabel>
          <CopiesStepper copies={copies} setCopies={setCopies} touchLarge={!isSidebar} />
        </div>
      </div>

      <Divider />

      <div style={isSidebar ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<Printer size={15}/>}   label="Print"          shortcut="Ctrl+P" color={typeColor} onClick={handlePrint}    primary touchLarge={!isSidebar} />
        </div>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<Download size={15}/>}  label="Download PDF"                      color="#2563eb"   onClick={handleDownload} touchLarge={!isSidebar} />
        </div>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<Copy size={15}/>}      label="Print Duplicate"                   color="#7c3aed"   onClick={handleDuplicate} touchLarge={!isSidebar} />
        </div>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn
            icon={backingUp ? <Loader2 size={15} className="animate-spin"/> : <UploadCloud size={15}/>}
            label={backingUp ? 'Backing up…' : 'Backup to Cloud'}
            color="#0d9488"
            onClick={handleCloudBackup}
            touchLarge={!isSidebar}
          />
        </div>
      </div>

      <Divider />

      <div style={isSidebar ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<Mail size={15}/>}           label="Email Invoice" color="#0891b2" onClick={handleEmail} touchLarge={!isSidebar} />
        </div>
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<MessageCircle size={15}/>}  label="WhatsApp"      color="#16a34a" onClick={handleWhatsApp} touchLarge={!isSidebar} />
        </div>
      </div>

      {isSidebar && <div style={{ flex: 1 }} />}

      <div style={isSidebar ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onNextBill && (
          <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
            <ActionBtn icon={<ChevronRight size={15}/>} label="Next Bill" shortcut="Enter" color="#334155" onClick={handleNextBill} primary touchLarge={!isSidebar} />
          </div>
        )}
        <div style={isSidebar ? undefined : { flex: '1 1 160px' }}>
          <ActionBtn icon={<Clock size={15}/>} label="Close" shortcut="Esc" color="#888" onClick={onClose} touchLarge={!isSidebar} />
        </div>
      </div>
    </div>
  )
}
