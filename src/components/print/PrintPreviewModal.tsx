/**
 * PrintPreviewModal.tsx
 *
 * Now reads from templateStore:
 *   - paperSize → default print size
 *   - primaryColor → type badge colour override
 *   - all other TemplateConfig flags passed to InvoiceTemplate
 *
 * Keyboard shortcuts: Ctrl+P Print | Enter Next Bill | Esc Close
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Printer, Download, X, Copy, Maximize2, Mail,
  MessageCircle, ChevronRight, CheckCircle2, Clock, UploadCloud, Loader2,
} from 'lucide-react'
import { fmt, fmtDate } from '@/utils'
import { htmlToPdfBlob } from '@/utils/htmlToPdfBlob'
import { uploadDocumentToCloud } from '@/components/cloudStorage/CloudBackupButton'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'
import useTemplateStore from '@/store/templateStore'
import { usePrint, type PrintSize } from './usePrint'
import InvoiceTemplate, { type PrintData } from './InvoiceTemplate'

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

function shareWhatsApp(data: PrintData) {
  const msg = encodeURIComponent(
    `*${data.voucherNo}*\nDate: ${fmtDate(data.date)}\n${data.partyName ? `Party: ${data.partyName}\n` : ''}Amount: ${fmt(data.netTotal)}`
  )
  window.open(`https://wa.me/?text=${msg}`, '_blank')
}

function shareEmail(data: PrintData, company: any) {
  const subject = encodeURIComponent(`${data.voucherNo} from ${company?.name || 'Us'}`)
  const body    = encodeURIComponent(
    `Dear ${data.partyName || 'Customer'},\n\nPlease find your invoice details:\n\nVoucher No: ${data.voucherNo}\nDate: ${fmtDate(data.date)}\nAmount: ${fmt(data.netTotal)}\n\nThank you.`
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

// Map templateStore paperSize to PrintSize
function tplSizeToPrintSize(s: 'A4' | 'thermal' | 'A5'): PrintSize {
  if (s === 'thermal') return 'thermal-80'
  return 'a4'
}

export default function PrintPreviewModal({
  data, open, onClose, onNextBill, autoprint = false,
}: PrintPreviewModalProps) {
  const { company }     = useAuthStore()
  const { success: toastSuccess, error: toastError } = useUIStore()
  const [backingUp, setBackingUp] = useState(false)
  const tpl             = useTemplateStore(s => s.activeTemplate)
  const { print, downloadPDF } = usePrint()
  const printRef        = useRef<HTMLDivElement>(null)

  // Initialise size from template setting; user can override per-print
  const [size,       setSize]       = useState<PrintSize>(() => tplSizeToPrintSize(tpl.paperSize))
  const [copies,     setCopies]     = useState(1)
  const [fullscreen, setFullscreen] = useState(false)

  // Sync size when template changes
  useEffect(() => { setSize(tplSizeToPrintSize(tpl.paperSize)) }, [tpl.paperSize])

  const printData: PrintData | null = data ? { ...data, company: data.company ?? company } : null

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
      if (e.key === 'Escape') { onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, size, copies])

  const handlePrint = useCallback(() => {
    if (!printData || !printRef.current) return
    print(printRef, {
      size, copies,
      voucherNo: printData.voucherNo,
      type:      printData.type,
      partyName: printData.partyName,
      amount:    printData.netTotal,
      date:      printData.date,
    })
  }, [printData, size, copies, print])

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

  const handleNextBill = useCallback(() => {
    onNextBill?.()
    onClose()
  }, [onNextBill, onClose])

  if (!printData) return null
  if (typeof document === 'undefined') return null

  // Use template primaryColor if defined, else fall back to type colour
  const typeColor = tpl.primaryColor || TYPE_COLORS[printData.type] || '#334155'

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              position: 'fixed',
              top:    fullscreen ? 0      : '5%',
              left:   fullscreen ? 0      : '20%',
              transform: fullscreen ? 'none' : 'translate(-50%, -50%)',
              width:  fullscreen ? '100vw' : 'min(1000px, 98vw)',
              height: fullscreen ? '100vh' : 'auto',
              maxHeight: fullscreen ? '100vh' : '90vh',
              zIndex: 9999,
              background: 'var(--surface, #fff)',
              borderRadius: fullscreen ? 0 : '16px',
              boxShadow: '0 25px 80px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* ── Header ────────────────────────────────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,#e2e8f0)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: typeColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} style={{ color: typeColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text,#111)' }}>
                  {printData.voucherNo}
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, background: typeColor + '18', color: typeColor, padding: '2px 8px', borderRadius: 99, letterSpacing: 0.5 }}>
                    {printData.type.replace('_', ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3,#888)', marginTop: 2 }}>
                  {printData.partyName && <span>{printData.partyName} · </span>}
                  {fmtDate(printData.date)} · <b style={{ color: typeColor }}>{fmt(printData.netTotal)}</b>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setFullscreen(v => !v)} title="Toggle fullscreen" style={iconBtnStyle}><Maximize2 size={16} /></button>
                <button onClick={onClose} title="Close (Esc)" style={iconBtnStyle}><X size={18} /></button>
              </div>
            </div>

            {/* ── Body ──────────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>

              {/* Preview */}
              <div style={{ flex: 1, padding: 12, overflow: 'auto', background: '#f8f9fa', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minWidth: 0 }}>
                <div style={{
                  background: '#fff', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                  padding: size === 'a4' ? 16 : 10,
                  width: '100%',
                  maxWidth: size === 'a4' ? 'min(210mm,100%)' : size === 'thermal-80' ? '80mm' : '58mm',
                  overflowX: 'auto', margin: '0 auto', boxSizing: 'border-box' as const,
                }}>
                  {/* InvoiceTemplate now receives the full tpl config */}
                  <InvoiceTemplate ref={printRef} data={printData} size={size} tpl={tpl} />
                </div>
              </div>

              {/* Sidebar */}
              <div style={{ width: 196, flexShrink: 0, borderLeft: '1px solid var(--border,#e2e8f0)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface,#fff)' }}>

                {/* Paper size */}
                <div style={{ marginBottom: 4 }}>
                  <SideLabel>Paper Size</SideLabel>
                  {(['a4', 'thermal-80', 'thermal-58'] as PrintSize[]).map(s => (
                    <button key={s} onClick={() => setSize(s)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '5px 8px', marginBottom: 2, borderRadius: 6,
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

                {/* Copies */}
                <div style={{ marginBottom: 8 }}>
                  <SideLabel>Copies</SideLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setCopies(c => Math.max(1, c - 1))} style={counterBtnStyle}>−</button>
                    <span style={{ fontWeight: 700, fontSize: 15, minWidth: 24, textAlign: 'center' }}>{copies}</span>
                    <button onClick={() => setCopies(c => Math.min(5, c + 1))} style={counterBtnStyle}>+</button>
                  </div>
                </div>

                <Divider />

                <ActionBtn icon={<Printer size={15}/>}   label="Print"          shortcut="Ctrl+P" color={typeColor} onClick={handlePrint}    primary />
                <ActionBtn icon={<Download size={15}/>}  label="Download PDF"                      color="#2563eb"   onClick={handleDownload} />
                <ActionBtn icon={<Copy size={15}/>}      label="Print Duplicate"                   color="#7c3aed"   onClick={() => { setCopies(2); setTimeout(handlePrint, 100) }} />
                <ActionBtn
                  icon={backingUp ? <Loader2 size={15} className="animate-spin"/> : <UploadCloud size={15}/>}
                  label={backingUp ? 'Backing up…' : 'Backup to Cloud'}
                  color="#0d9488"
                  onClick={handleCloudBackup}
                />

                <Divider />

                <ActionBtn icon={<Mail size={15}/>}           label="Email Invoice" color="#0891b2" onClick={() => shareEmail(printData, company)} />
                <ActionBtn icon={<MessageCircle size={15}/>}  label="WhatsApp"      color="#16a34a" onClick={() => shareWhatsApp(printData)} />

                <div style={{ flex: 1 }} />

                {onNextBill && (
                  <ActionBtn icon={<ChevronRight size={15}/>} label="Next Bill" shortcut="Enter" color="#334155" onClick={handleNextBill} primary />
                )}
                <ActionBtn icon={<Clock size={15}/>} label="Close" shortcut="Esc" color="#888" onClick={onClose} />
              </div>
            </div>

            {/* ── Footer hints ──────────────────────────────────────────── */}
            <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border,#e2e8f0)', fontSize: 10, color: 'var(--text-4,#aaa)', display: 'flex', gap: 16, flexShrink: 0, background: 'var(--surface,#fff)' }}>
              <span><Kbd>Ctrl+P</Kbd> Print</span>
              {onNextBill && <span><Kbd>Enter</Kbd> Next Bill</span>}
              <span><Kbd>Esc</Kbd> Close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3,#888)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border,#e2e8f0)', margin: '4px 0' }} />
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ background: 'var(--surface-2,#f1f5f9)', border: '1px solid var(--border,#e2e8f0)', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>
      {children}
    </kbd>
  )
}

function ActionBtn({ icon, label, shortcut, color, onClick, primary }: {
  icon: React.ReactNode; label: string; shortcut?: string; color: string; onClick: () => void; primary?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      width: '100%', padding: primary ? '8px 10px' : '6px 10px',
      borderRadius: 8,
      border: primary ? `1.5px solid ${color}` : '1.5px solid var(--border,#e2e8f0)',
      background: primary ? color : 'transparent',
      color:   primary ? '#fff' : color,
      fontSize: 12, fontWeight: primary ? 700 : 500,
      cursor: 'pointer', transition: 'all 0.15s',
      whiteSpace: 'nowrap' as const,
    }}>
      {icon}
      <span style={{ flex: 1, textAlign: 'left' as const }}>{label}</span>
      {shortcut && <span style={{ fontSize: 9, opacity: 0.65, fontWeight: 400 }}>{shortcut}</span>}
    </button>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
  color: 'var(--text-3,#888)', borderRadius: 6,
}
const counterBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  border: '1.5px solid var(--border,#e2e8f0)',
  background: 'transparent', cursor: 'pointer',
  fontSize: 16, fontWeight: 700, color: 'var(--text-2,#444)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
