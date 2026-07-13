/**
 * PrintPreviewMobile.tsx
 *
 * Mobile-only (< 768px) presentation pieces for the Print Preview modal:
 *   - MobileHeader     compact sticky header (back, title, voucher/party/total)
 *   - MobileBottomBar  sticky bottom panel (paper size, copies, print, download)
 *   - MoreSheet        slide-up sheet for secondary actions
 *
 * No business/print logic lives here — everything is driven by props from
 * PrintPreviewModal.tsx. Touch targets are kept >= 44x44px per spec.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { Z } from '@/styles/zIndex'
import {
  ArrowLeft, Printer, Download, MoreHorizontal, X,
  Mail, MessageCircle, Copy, UploadCloud, Loader2, ChevronRight,
} from 'lucide-react'
import { fmt } from '@/utils'
import type { PrintData } from './InvoiceTemplate'
import type { PrintSize } from './usePrint'
import { PaperSizeSegmented, CopiesStepper } from './PrintPreviewControls'

/* ── Compact sticky header ────────────────────────────────────────────────── */

export function MobileHeader({ printData, typeColor, onClose }: {
  printData: PrintData; typeColor: string; onClose: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', flexShrink: 0,
      borderBottom: '1px solid var(--border,#e2e8f0)',
      background: 'var(--surface,#fff)',
      position: 'sticky', top: 0, zIndex: 2,
    }}>
      <button
        onClick={onClose}
        aria-label="Back"
        style={{
          width: 44, height: 44, minWidth: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 8,
          color: 'var(--text-2,#444)', cursor: 'pointer',
        }}
      >
        <ArrowLeft size={20} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3,#888)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
          Print Preview
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text,#111)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6,
          overflow: 'hidden',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{printData.voucherNo}</span>
          {printData.partyName && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3,#888)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {printData.partyName}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: typeColor, marginLeft: 'auto' }}>{fmt(printData.netTotal)}</span>
        </div>
      </div>
    </div>
  )
}

/* ── Sticky bottom action panel ───────────────────────────────────────────── */

export function MobileBottomBar({
  size, setSize, copies, setCopies, typeColor,
  onPrint, onDownload, onMore,
}: {
  size: PrintSize; setSize: (s: PrintSize) => void
  copies: number; setCopies: (fn: (c: number) => number) => void
  typeColor: string
  onPrint: () => void; onDownload: () => void; onMore: () => void
}) {
  return (
    <div style={{
      flexShrink: 0,
      position: 'sticky', bottom: 0, zIndex: 2,
      background: 'var(--surface,#fff)',
      borderTop: '1px solid var(--border,#e2e8f0)',
      padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 10, alignItems: 'end' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3,#888)', marginBottom: 4, textTransform: 'uppercase' as const }}>Paper Size</div>
          <PaperSizeSegmented size={size} onChange={setSize} typeColor={typeColor} touchLarge />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3,#888)', marginBottom: 4, textTransform: 'uppercase' as const }}>Copies</div>
          <CopiesStepper copies={copies} setCopies={setCopies} touchLarge />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.7fr)', gap: 8 }}>
        <button onClick={onPrint} style={{
          minHeight: 44, borderRadius: 10, border: `1.5px solid ${typeColor}`,
          background: typeColor, color: '#fff', fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: 'pointer',
        }}>
          <Printer size={16} /> Print
        </button>
        <button onClick={onDownload} style={{
          minHeight: 44, borderRadius: 10, border: '1.5px solid #2563eb',
          background: 'transparent', color: '#2563eb', fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: 'pointer',
        }}>
          <Download size={16} /> PDF
        </button>
        <button onClick={onMore} aria-label="More actions" style={{
          minHeight: 44, borderRadius: 10, border: '1.5px solid var(--border,#e2e8f0)',
          background: 'transparent', color: 'var(--text-2,#444)', fontWeight: 600, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          cursor: 'pointer',
        }}>
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  )
}

/* ── "More" sheet (secondary actions) ─────────────────────────────────────── */

export interface MoreSheetProps {
  open: boolean
  onClose: () => void
  onEmail: () => void
  onWhatsApp: () => void
  onDuplicate: () => void
  onCloudBackup: () => void
  backingUp: boolean
  onNextBill?: () => void
  handleNextBill: () => void
}

export function MoreSheet({
  open, onClose, onEmail, onWhatsApp, onDuplicate, onCloudBackup, backingUp,
  onNextBill, handleNextBill,
}: MoreSheetProps) {
  const items: { icon: React.ReactNode; label: string; onClick: () => void; color: string }[] = [
    { icon: <Mail size={18} />,          label: 'Email Invoice',    onClick: onEmail,       color: '#0891b2' },
    { icon: <MessageCircle size={18} />, label: 'WhatsApp',         onClick: onWhatsApp,    color: '#16a34a' },
    { icon: <Copy size={18} />,          label: 'Duplicate Print',  onClick: onDuplicate,   color: '#7c3aed' },
    {
      icon: backingUp ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />,
      label: backingUp ? 'Backing up…' : 'Backup to Cloud',
      onClick: onCloudBackup,
      color: '#0d9488',
    },
  ]
  if (onNextBill) {
    items.push({ icon: <ChevronRight size={18} />, label: 'Next Bill', onClick: handleNextBill, color: '#334155' })
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="more-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: Z.nestedModal, background: 'rgba(0,0,0,0.45)' }}
          />
          <motion.div
            key="more-sheet"
            role="dialog"
            aria-label="More actions"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: Z.nestedModal,
              background: 'var(--surface,#fff)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '10px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.25)',
              maxHeight: '70dvh', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border-2,#ccc)', margin: '2px auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3,#888)', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>More Actions</span>
              <button onClick={onClose} aria-label="Close menu" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-3,#888)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {items.map(item => (
              <button
                key={item.label}
                onClick={() => { item.onClick(); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  minHeight: 44, width: '100%', padding: '10px 8px',
                  background: 'transparent', border: 'none', borderRadius: 10,
                  color: 'var(--text,#111)', fontSize: 15, fontWeight: 500,
                  cursor: 'pointer', textAlign: 'left' as const,
                }}
              >
                <span style={{ color: item.color, display: 'flex' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
