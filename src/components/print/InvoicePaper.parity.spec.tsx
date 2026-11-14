/**
 * Settings → Printing preview must be the SAME invoice the Sales page shows and prints. Both render through <InvoicePaper>;
 * these tests pin that: identical invoice markup for the same data + template, the Sales modal's layout widths, and the
 * company header (which the Settings preview used to omit).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const strip = (p: any) => { const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = p; return rest }
  const make = (tag: string) => React.forwardRef((p: any, r: any) => React.createElement(tag, { ...strip(p), ref: r }))
  return { motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }), AnimatePresence: ({ children }: any) => children }
})

import TemplateTab, { DEMO_PRINT_DATA } from '@/modules/settings/TemplateTab'
import PrintPreviewModal from '@/components/print/PrintPreviewModal'
import { salesPreviewCardWidth, tplSizeToPrintSize, resolvePrintData } from '@/components/print/InvoicePaper'
import useAuthStore from '@/store/authStore'
import useTemplateStore, { DEFAULT_TPL } from '@/store/templateStore'

const COMPANY: any = { id: 'c', name: 'Zerthix Pharma Pvt. Ltd.', address: 'Traffic Chowk, Butwal-8', phone: '071-540000', pan_no: '600123456',
  date_system: 'AD', invoice_prefix: 'INV', currency: 'NPR', vat_percent: 0 }
const invoiceRoot = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('div')].find(d => d.style.fontFamily.includes('Segoe') && d.style.lineHeight === '1.5') as HTMLElement
// the invoice prints a "Printed: <time>" stamp — ignore it
const norm = (html: string) => html.replace(/Printed:[^<]*/g, 'Printed: -')

beforeEach(() => {
  useAuthStore.getState().setAuth({ token: 't', user: { id: 'u', name: 'O', email: 'o@x.t', role: 'owner', permissions: [] } as any, company: COMPANY })
  useTemplateStore.getState().resetTemplate()
})

describe('Settings preview == Sales print preview', () => {
  test('same data + template → identical invoice markup (A4)', () => {
    const settings = render(<TemplateTab />)
    const sIn = invoiceRoot(settings.container)
    settings.unmount()
    const modal = render(<PrintPreviewModal data={DEMO_PRINT_DATA} open onClose={() => {}} />)
    const mIn = invoiceRoot(document.body)
    expect(sIn).toBeTruthy(); expect(mIn).toBeTruthy()
    expect(norm(sIn.outerHTML)).toBe(norm(mIn.outerHTML))
    modal.unmount()
  })

  test('same for Thermal 80mm and for non-default template options', () => {
    useTemplateStore.getState().setTemplate({ paperSize: 'thermal', primaryColor: '#16a34a', showBatch: false, fontSize: 'large', docTitle: 'CASH MEMO' })
    const settings = render(<TemplateTab />); const sIn = invoiceRoot(settings.container); settings.unmount()
    const modal = render(<PrintPreviewModal data={DEMO_PRINT_DATA} open onClose={() => {}} />); const mIn = invoiceRoot(document.body)
    expect(norm(sIn.outerHTML)).toBe(norm(mIn.outerHTML)); expect(sIn.outerHTML).toContain('CASH MEMO')
    modal.unmount()
  })

  test('the Settings preview shows the company header (name, address, phone, PAN) and honours its toggles', () => {
    const { container, unmount } = render(<TemplateTab />)
    const txt = invoiceRoot(container).textContent || ''
    expect(txt).toContain('Zerthix Pharma Pvt. Ltd.'); expect(txt).toContain('Traffic Chowk'); expect(txt).toContain('Tel: 071-540000'); expect(txt).toContain('PAN: 600123456')
    unmount()
    useTemplateStore.getState().setTemplate({ showCompanyName: false, showAddress: false, showPhone: false, showPAN: false })
    const off = render(<TemplateTab />); const t2 = invoiceRoot(off.container).textContent || ''
    expect(t2).not.toContain('Zerthix Pharma'); expect(t2).not.toContain('Traffic Chowk'); expect(t2).not.toContain('071-540000'); expect(t2).not.toContain('600123456')
  })

  test('the demo document has the shape of a saved sale (no BS date — Sales does not pass one)', () => {
    expect(DEMO_PRINT_DATA.dateBS).toBeUndefined(); expect(DEMO_PRINT_DATA.company).toBeUndefined()
    expect(resolvePrintData(DEMO_PRINT_DATA, COMPANY).company).toBe(COMPANY)
    expect(resolvePrintData({ ...DEMO_PRINT_DATA, company: { ...COMPANY, name: 'Own' } }, COMPANY).company?.name).toBe('Own')   // a document's own company wins
  })
})

describe('layout helpers mirror the Sales modal', () => {
  test('paper width the Sales modal gives A4 / thermal at desktop, tablet and phone widths', () => {
    expect(Math.round(salesPreviewCardWidth('a4', 1440))).toBe(752)     // measured in a real browser
    expect(Math.round(salesPreviewCardWidth('a4', 1280))).toBe(752)
    expect(Math.round(salesPreviewCardWidth('a4', 820))).toBe(763)
    expect(Math.round(salesPreviewCardWidth('a4', 390))).toBe(374)
    expect(Math.round(salesPreviewCardWidth('thermal-80', 1440))).toBe(302)
    expect(Math.round(salesPreviewCardWidth('thermal-58', 390))).toBe(219)
  })
  test('Settings paper size → print size (A5 prints as A4, as before)', () => {
    expect(tplSizeToPrintSize('A4')).toBe('a4'); expect(tplSizeToPrintSize('A5')).toBe('a4'); expect(tplSizeToPrintSize('thermal')).toBe('thermal-80')
    expect(DEFAULT_TPL.paperSize).toBe('A4')
  })
})
