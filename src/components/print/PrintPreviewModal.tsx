/**
 * PrintPreviewModal.tsx
 *
 * Reads from templateStore:
 *   - paperSize → default print size
 *   - primaryColor → type badge colour override
 *   - all other TemplateConfig flags passed to InvoiceTemplate
 *
 * Keyboard shortcuts: Ctrl+P Print | Enter Next Bill | Esc Close
 *
 * Responsive layout (UI/UX only — no business, print, or PDF logic changed):
 *   Desktop (>=1024px): unchanged two-column dialog (preview | sidebar).
 *   Tablet  (768–1023px): large dialog, preview stacked above a full-width
 *                         controls panel.
 *   Mobile  (<768px): fullscreen app-like modal — compact sticky header,
 *                      maximised scrollable preview, sticky bottom action
 *                      bar (paper size, copies, print, download), and a
 *                      "More" sheet for secondary actions (Email, WhatsApp,
 *                      Duplicate, Cloud Backup, Next Bill).
 *
 * Breakpoints are driven by usePrintResponsive() (JS + resize listener)
 * rather than CSS media queries — consistent with the pattern already used
 * for the Accounting module's mobile layout in this codebase.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2, X, CheckCircle2 } from 'lucide-react'
import { fmt } from '@/utils'
import { formatDisplayDate, type DateSystem } from '@/utils/dateSystem'
import { useShortcutScope } from '@/hooks/useKeyboardShortcuts'
import { htmlToPdfBlob } from '@/utils/htmlToPdfBlob'
import { uploadDocumentToCloud } from '@/components/cloudStorage/CloudBackupButton'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'
import useTemplateStore from '@/store/templateStore'
import { usePrint, type PrintSize } from './usePrint'
import { usePrintResponsive } from './usePrintResponsive'
import { type PrintData } from './InvoiceTemplate'
import InvoicePaper, { tplSizeToPrintSize, resolvePrintData } from './InvoicePaper'
import { ControlsPanel, Kbd, iconBtnStyle } from './PrintPreviewControls'
import { MobileHeader, MobileBottomBar, MoreSheet } from './PrintPreviewMobile'
import { Z } from '@/styles/zIndex'

const TYPE_COLORS: Record<string, string> = {
  SALE:            '#16a34a',
  PURCHASE:        '#2563eb',
  RECEIPT:         '#0891b2',
  PAYMENT:         '#7c3aed',
  JOURNAL:         '#d97706',
  RETURN:          '#dc2626',
  SALE_RETURN:     '#dc2626',
  PURCHASE_RETURN: '#b45309',
}

function shareWhatsApp(data: PrintData, dateMode: DateSystem) {
  const msg = encodeURIComponent(
    `*${data.voucherNo}*\nDate: ${formatDisplayDate(data.date, dateMode)}\n${data.partyName ? `Party: ${data.partyName}\n` : ''}Amount: ${fmt(data.netTotal)}`
  )
  window.open(`https://wa.me/?text=${msg}`, '_blank')
}

function shareEmail(data: PrintData, company: any, dateMode: DateSystem) {
  const subject = encodeURIComponent(`${data.voucherNo} from ${company?.name || 'Us'}`)
  const body    = encodeURIComponent(
    `Dear ${data.partyName || 'Customer'},\n\nPlease find your invoice details:\n\nVoucher No: ${data.voucherNo}\nDate: ${formatDisplayDate(data.date, dateMode)}\nAmount: ${fmt(data.netTotal)}\n\nThank you.`
  )
  window.open(`mailto:?subject=${subject}&body=${body}`)
}

interface PrintPreviewModalProps {
  data:        PrintData | null
  open:        boolean
  onClose:     () => void
  onNextBill?: () => void
  autoprint?:  boolean
}

export default function PrintPreviewModal({
  data, open, onClose, onNextBill, autoprint = false,
}: PrintPreviewModalProps) {
  const { company }     = useAuthStore()
  const { success: toastSuccess, error: toastError, dateMode } = useUIStore()
  const [backingUp, setBackingUp] = useState(false)
  const tpl             = useTemplateStore(s => s.activeTemplate)
  const { print, downloadPDF } = usePrint()
  const printRef        = useRef<HTMLDivElement>(null)
  const { isMobile, isTablet, isDesktop } = usePrintResponsive()

  // This modal already has its own Ctrl+P/Enter/Esc handling below —
  // unchanged. This just registers its presence in the shared shortcut
  // scope stack while open, so the underlying Sale/Purchase page's F10/
  // Ctrl+P shortcuts go quiet instead of double-firing alongside these
  // (see hooks/useKeyboardShortcuts.ts).
  useShortcutScope(open)

  // Initialise size from template setting; user can override per-print
  const [size,       setSize]       = useState<PrintSize>(() => tplSizeToPrintSize(tpl.paperSize))
  const [copies,     setCopies]     = useState(() => tpl.copies || 1)
  const [fullscreen, setFullscreen] = useState(false)
  const [moreOpen,   setMoreOpen]   = useState(false)

  // Sync size when template changes
  useEffect(() => { setSize(tplSizeToPrintSize(tpl.paperSize)) }, [tpl.paperSize])

  // Mobile is always a fullscreen, app-like modal
  const effectiveFullscreen = isMobile || fullscreen

  const printData: PrintData | null = data ? resolvePrintData(data, company) : null

  useEffect(() => {
    if (open && autoprint && printData) {
      setTimeout(() => handlePrint(), 600)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); handlePrint() }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { handleNextBill() }
      if (e.key === 'Escape') { moreOpen ? setMoreOpen(false) : onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, size, copies, moreOpen])

  const handlePrint = useCallback(() => {
    if (!printData || !printRef.current) return
    print(printRef, {
      size, copies,
      voucherNo: printData.voucherNo,
      type:      printData.type,
      partyName: printData.partyName,
      amount:    printData.netTotal,
      date:      printData.date,
      marginMM:  tpl.marginMM,
      duplicateLabel: tpl.duplicateLabel,
    })
  }, [printData, size, copies, print, tpl.marginMM, tpl.duplicateLabel])

  const handleDownload = useCallback(() => {
    if (!printData || !printRef.current) return
    downloadPDF(printRef, `${printData.voucherNo}.pdf`, { size })
  }, [printData, size, downloadPDF])

  const handleCloudBackup = useCallback(async () => {
    if (!printData || !printRef.current) return
    setBackingUp(true)
    try {
      const blob = await htmlToPdfBlob(printRef.current, { paperSize: size === 'a4' ? 'a4' : 'a4' })
      await uploadDocumentToCloud(blob, `${printData.voucherNo}.pdf`)
      toastSuccess('Backed up to cloud storage', `${printData.voucherNo}.pdf`)
    } catch (e: any) {
      toastError('Cloud backup failed', e?.response?.data?.message || e.message)
    } finally {
      setBackingUp(false)
    }
  }, [printData, size, toastSuccess, toastError])

  const handleDuplicate = useCallback(() => {
    setCopies(2)
    setTimeout(handlePrint, 100)
  }, [handlePrint])

  const handleEmail    = useCallback(() => { if (printData) shareEmail(printData, company, dateMode) }, [printData, company, dateMode])
  const handleWhatsApp = useCallback(() => { if (printData) shareWhatsApp(printData, dateMode) }, [printData, dateMode])

  const handleNextBill = useCallback(() => {
    onNextBill?.()
    onClose()
  }, [onNextBill, onClose])

  if (!printData) return null
  if (typeof document === 'undefined') return null

  // Use template primaryColor if defined, else fall back to type colour
  const typeColor = tpl.primaryColor || TYPE_COLORS[printData.type] || '#334155'

  // Vertical stacking applies to both tablet (panel below preview) and
  // mobile (fullscreen, bottom bar instead of a panel)
  const stacked = isTablet || isMobile

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={isMobile ? undefined : onClose}
            style={{ position: 'fixed', inset: 0, zIndex: Z.modalBackdrop, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              position: 'fixed',
              top:       effectiveFullscreen ? 0 : '0%',
              left:      effectiveFullscreen ? 0 : '0%',
              transform: effectiveFullscreen ? 'none' : 'translate(0%, 50%)',
              width:     effectiveFullscreen ? '100vw' : isTablet ? 'min(880px, 96vw)' : 'min(1000px, 98vw)',
              height:    effectiveFullscreen ? '100dvh' : 'auto',
              maxHeight: effectiveFullscreen ? '100dvh' : '92dvh',
              zIndex: Z.modal,
              background: 'var(--surface, #fff)',
              borderRadius: effectiveFullscreen ? 0 : '16px',
              boxShadow: '0 25px 80px rgba(0,0,0,0.35)',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* ── Header ────────────────────────────────────────────────── */}
            {isMobile ? (
              <MobileHeader printData={printData} typeColor={typeColor} onClose={onClose} />
            ) : (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,#e2e8f0)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: typeColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={20} style={{ color: typeColor }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {printData.voucherNo}
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, background: typeColor + '18', color: typeColor, padding: '2px 8px', borderRadius: 99, letterSpacing: 0.5 }}>
                      {printData.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3,#888)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {printData.partyName && <span>{printData.partyName} · </span>}
                    {formatDisplayDate(printData.date, dateMode)} · <b style={{ color: typeColor }}>{fmt(printData.netTotal)}</b>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setFullscreen(v => !v)} title="Toggle fullscreen" style={iconBtnStyle}><Maximize2 size={16} /></button>
                  <button onClick={onClose} title="Close (Esc)" style={iconBtnStyle}><X size={18} /></button>
                </div>
              </div>
            )}

            {/* ── Body ──────────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: stacked ? 'column' : 'row', minHeight: 0 }}>

              {/* Preview */}
              <div style={{
                flex: 1, minWidth: 0, minHeight: 0,
                padding: isMobile ? 8 : 12,
                overflow: 'auto',
                background: '#f8f9fa',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                WebkitOverflowScrolling: 'touch',
              }}>
                {/* Shared with Settings → Printing, so the two previews cannot drift apart (see InvoicePaper.tsx) */}
                <InvoicePaper ref={printRef} data={printData} size={size} tpl={tpl} isMobile={isMobile} />
              </div>

              {/* Controls: right sidebar (desktop) or full-width panel (tablet) */}
              {(isDesktop || isTablet) && (
                <ControlsPanel
                  layout={isDesktop ? 'sidebar' : 'panel'}
                  size={size} setSize={setSize}
                  copies={copies} setCopies={setCopies}
                  typeColor={typeColor}
                  handlePrint={handlePrint}
                  handleDownload={handleDownload}
                  handleCloudBackup={handleCloudBackup}
                  backingUp={backingUp}
                  handleEmail={handleEmail}
                  handleWhatsApp={handleWhatsApp}
                  handleDuplicate={handleDuplicate}
                  onNextBill={onNextBill}
                  handleNextBill={handleNextBill}
                  onClose={onClose}
                />
              )}
            </div>

            {/* ── Mobile sticky bottom action bar ──────────────────────── */}
            {isMobile && (
              <MobileBottomBar
                size={size} setSize={setSize}
                copies={copies} setCopies={setCopies}
                typeColor={typeColor}
                onPrint={handlePrint}
                onDownload={handleDownload}
                onMore={() => setMoreOpen(true)}
              />
            )}

            {/* ── Footer hints (desktop / tablet only) ─────────────────── */}
            {!isMobile && (
              <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border,#e2e8f0)', fontSize: 10, color: 'var(--text-4,#aaa)', display: 'flex', gap: 16, flexShrink: 0, background: 'var(--surface,#fff)', flexWrap: 'wrap' }}>
                <span><Kbd>Ctrl+P</Kbd> Print</span>
                {onNextBill && <span><Kbd>Enter</Kbd> Next Bill</span>}
                <span><Kbd>Esc</Kbd> Close</span>
              </div>
            )}
          </motion.div>

          {/* ── Mobile "More" sheet (secondary actions) ────────────────── */}
          {isMobile && (
            <MoreSheet
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              onEmail={handleEmail}
              onWhatsApp={handleWhatsApp}
              onDuplicate={handleDuplicate}
              onCloudBackup={handleCloudBackup}
              backingUp={backingUp}
              onNextBill={onNextBill}
              handleNextBill={handleNextBill}
            />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
