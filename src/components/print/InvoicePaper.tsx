/**
 * InvoicePaper.tsx — the white "paper" card an invoice is previewed on, plus the helpers that decide WHAT is drawn on it.
 *
 * ONE source of truth for the invoice preview. It is used by
 *   - PrintPreviewModal   (the print preview that opens from Sales / Purchase / … after saving)
 *   - Settings → Printing (the live template preview)
 * so what you tune in Settings is, by construction, what the Sales page shows and prints. Before this existed the two
 * had separate wrappers (different paper width, padding, no company header in Settings), so they drifted apart.
 *
 * What is shared:
 *   - tplSizeToPrintSize()   paper-size mapping (Settings "A4 / Thermal / A5" → the print pipeline's PrintSize)
 *   - resolvePrintData()     the company is merged into the document exactly as the print modal does it
 *   - salesPreviewCardWidth() the width the Sales print modal gives the paper at a given screen width (same maths as the
 *                             modal's dialog + controls sidebar), so Settings can lay the invoice out at the same width
 *   - <InvoicePaper>         card padding / shadow / max-width per paper size
 */
import { forwardRef } from 'react'
import InvoiceTemplate, { type PrintData } from './InvoiceTemplate'
import type { PrintSize } from './usePrint'
import type { TemplateConfig } from '@/store/templateStore'
import type { Company } from '@/types'

/** Settings paper size → print pipeline size. (A5 has no dedicated print layout yet: it prints as A4, as it always has.) */
export function tplSizeToPrintSize(s: TemplateConfig['paperSize']): PrintSize {
  return s === 'thermal' ? 'thermal-80' : 'a4'
}

/** The company comes from the signed-in session unless the document already carries one — same rule as the print modal. */
export function resolvePrintData(data: PrintData, company: Company | null | undefined): PrintData {
  return { ...data, company: data.company ?? company }
}

const PX_PER_MM = 96 / 25.4
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Width (px) of the paper card inside the Sales print modal at a given viewport width. Mirrors PrintPreviewModal's layout:
 * dialog = min(1000px, 98vw) on desktop (+ a clamp(180px, 20vw, 224px) controls sidebar), min(880px, 96vw) on tablet
 * (controls stacked below), full screen on mobile; the preview area has 12px padding (8px on mobile); the paper is
 * capped at 210mm (A4) / 80mm / 58mm. Keep in sync with PrintPreviewModal if its layout constants change.
 */
export function salesPreviewCardWidth(size: PrintSize, viewportWidth: number): number {
  if (size === 'thermal-80') return 80 * PX_PER_MM
  if (size === 'thermal-58') return 58 * PX_PER_MM
  const vw = viewportWidth
  const mobile = vw < 768, tablet = vw >= 768 && vw < 1024
  const dialog  = mobile ? vw : tablet ? Math.min(880, vw * 0.96) : Math.min(1000, vw * 0.98)
  const sidebar = mobile || tablet ? 0 : clamp(vw * 0.2, 180, 224)
  const pad     = mobile ? 16 : 24
  return Math.min(210 * PX_PER_MM, dialog - sidebar - pad)
}

interface InvoicePaperProps {
  data:      PrintData
  size:      PrintSize
  tpl:       TemplateConfig
  isMobile?: boolean
  /** Fixed card width in px (Settings lays the paper out at the Sales modal's width, then scales it to fit). Omit for the
   *  modal's own fluid sizing. */
  width?:    number
}

// eslint-disable-next-line react/display-name
const InvoicePaper = forwardRef<HTMLDivElement, InvoicePaperProps>(({ data, size, tpl, isMobile = false, width }, ref) => (
  <div style={{
    background: '#fff', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
    padding: size === 'a4' ? (isMobile ? 10 : 16) : (isMobile ? 6 : 10),
    width: width ?? '100%',
    maxWidth: width ?? (size === 'a4' ? 'min(210mm,100%)' : size === 'thermal-80' ? '80mm' : '58mm'),
    overflowX: 'auto', margin: '0 auto', boxSizing: 'border-box' as const,
  }}>
    {/* `ref` points at the invoice itself — that node is what usePrint clones */}
    <InvoiceTemplate ref={ref} data={data} size={size} tpl={tpl} />
  </div>
))

export default InvoicePaper
