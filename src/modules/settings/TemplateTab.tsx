/**
 * TemplateTab.tsx
 *
 * Invoice template settings panel for SettingsPage.
 * Reads / writes useTemplateStore.
 * Shows a live preview of InvoiceTemplate on the right.
 */

import { useRef } from 'react'
import {
  Eye, RotateCcw, Download, Printer,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import useTemplateStore, { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import InvoiceTemplate, { type PrintData } from '@/components/print/InvoiceTemplate'
import { usePrint } from '@/components/print/usePrint'

/* ── Demo print data for live preview ──────────────────────────────────── */
const DEMO_DATA: PrintData = {
  voucherNo:    'INV-2081-0042',
  type:         'SALE',
  date:         new Date().toISOString().split('T')[0],
  dateBS:       '2081-03-15',
  partyName:    'Bishal Prahamic Upchar Kendra',
  partyAddress: 'Badsudawa, Butwal',
  partyPhone:   '071-540123',
  partyPan:     '608980061',
  paymentMode:  'cash',
  narration:    'Regular monthly supply',
  items: [
    { product_name: 'Paracetamol 500mg', batch_no: 'B001', expiry: '06/26', qty: 10, bonus: 1, rate: 12, cc_pct: 2, cc_amount: 2.4, amount: 120 },
    { product_name: 'Amoxicillin 250mg', batch_no: 'B002', expiry: '12/26', qty: 5,  bonus: 0, rate: 45, cc_pct: 0, cc_amount: 0,   amount: 225 },
    { product_name: 'Cetirizine 10mg',   batch_no: 'B003', expiry: '03/27', qty: 20, bonus: 2, rate: 8,  cc_pct: 1, cc_amount: 1.6, amount: 160 },
  ],
  subtotal:   505,
  discountAmt:  5,
  ccAmount:     4,
  netTotal:   504,
  paidAmount: 504,
  dueAmount:    0,
}

/* ── Toggle row ─────────────────────────────────────────────────────────── */
function ToggleRow({
  label, value, onChange, description,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; description?: string
}) {
  return (
    <div
      className="tpl-toggle-row"
      onClick={() => onChange(!value)}
      role="checkbox"
      aria-checked={value}
      tabIndex={0}
      onKeyDown={e => e.key === ' ' && onChange(!value)}
    >
      <div className="tpl-toggle-info">
        <span className="tpl-toggle-label">{label}</span>
        {description && <span className="tpl-toggle-desc">{description}</span>}
      </div>
      <div className={`tpl-toggle-icon ${value ? 'tpl-toggle-icon--on' : ''}`}>
        {value
          ? <ToggleRight size={22} />
          : <ToggleLeft size={22}  />
        }
      </div>
    </div>
  )
}

/* ── Section header ─────────────────────────────────────────────────────── */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="tpl-section-head">{children}</div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function TemplateTab() {
  const { activeTemplate: tpl, setTemplate, resetTemplate } = useTemplateStore()
  const printRef = useRef<HTMLDivElement>(null)
  const { print } = usePrint()

  function set<K extends keyof TemplateConfig>(key: K, val: TemplateConfig[K]) {
    setTemplate({ [key]: val })
  }

  function handleTestPrint() {
    if (!printRef.current) return
    print(printRef, {
      size:      tpl.paperSize === 'thermal' ? 'thermal-80' : 'a4',
      copies:    1,
      voucherNo: DEMO_DATA.voucherNo,
      type:      DEMO_DATA.type,
      date:      DEMO_DATA.date,
      amount:    DEMO_DATA.netTotal,
    })
  }

  return (
    <div className="tpl-layout">

      {/* ── Left panel: controls ─────────────────────────────────────── */}
      <div className="tpl-controls">

        {/* Toolbar */}
        <div className="tpl-toolbar">
          <h2 className="tpl-heading">Invoice Template</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="tpl-btn tpl-btn--ghost" onClick={resetTemplate} title="Reset to defaults">
              <RotateCcw size={13} /> Reset
            </button>
            <button className="tpl-btn tpl-btn--primary" onClick={handleTestPrint}>
              <Printer size={13} /> Test Print
            </button>
          </div>
        </div>

        <div className="tpl-scroll">

          {/* ── Header section ─────────────────────────────────────────── */}
          <SectionHead>Company Header</SectionHead>
          <div className="tpl-group">
            <ToggleRow label="Company Name"    value={tpl.showCompanyName} onChange={v => set('showCompanyName', v)} />
            <ToggleRow label="Address"         value={tpl.showAddress}     onChange={v => set('showAddress', v)} />
            <ToggleRow label="Phone Number"    value={tpl.showPhone}       onChange={v => set('showPhone', v)} />
            <ToggleRow label="PAN / VAT No"    value={tpl.showPAN}         onChange={v => set('showPAN', v)} />
          </div>

          {/* ── Document ───────────────────────────────────────────────── */}
          <SectionHead>Document</SectionHead>
          <div className="tpl-group">
            <div className="tpl-field">
              <label className="tpl-label">Document Title</label>
              <input
                className="erp-input"
                value={tpl.docTitle}
                placeholder="e.g. TAX INVOICE"
                onChange={e => set('docTitle', e.target.value)}
              />
              <p className="tpl-hint">Leave blank to use default (TAX INVOICE, PURCHASE BILL, etc.)</p>
            </div>
            <ToggleRow label="Show Bikram Sambat Date" value={tpl.showDateBS} onChange={v => set('showDateBS', v)} description="Displays BS date alongside AD date" />
          </div>

          {/* ── Columns ────────────────────────────────────────────────── */}
          <SectionHead>Invoice Columns</SectionHead>
          <div className="tpl-group">
            <ToggleRow label="Batch & Expiry"  value={tpl.showBatch}  onChange={v => set('showBatch', v)}  description="Show batch number and expiry date" />
            <ToggleRow label="Bonus Column"    value={tpl.showBonus}  onChange={v => set('showBonus', v)}  description="Show free/bonus quantity column" />
            <ToggleRow label="CC % / Amount"   value={tpl.showCC}     onChange={v => set('showCC', v)}     description="Show credit charge columns" />
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <SectionHead>Footer</SectionHead>
          <div className="tpl-group">
            <ToggleRow label="Notes / Narration"  value={tpl.showNotes}     onChange={v => set('showNotes', v)} />
            <ToggleRow label="Signature Lines"    value={tpl.showSignature} onChange={v => set('showSignature', v)} description="Prepared By / Checked By / Authorised By" />
            <ToggleRow label="Thank You Message"  value={tpl.showThankYou}  onChange={v => set('showThankYou', v)} />
            {tpl.showThankYou && (
              <div className="tpl-field" style={{ marginTop: 4 }}>
                <label className="tpl-label">Thank You Text</label>
                <input
                  className="erp-input"
                  value={tpl.thankYouMessage}
                  onChange={e => set('thankYouMessage', e.target.value)}
                  placeholder="Thank you for your business!"
                />
              </div>
            )}
          </div>

          {/* ── Style ──────────────────────────────────────────────────── */}
          <SectionHead>Style</SectionHead>
          <div className="tpl-group">

            {/* Font size */}
            <div className="tpl-field">
              <label className="tpl-label">Font Size</label>
              <div className="tpl-radio-group">
                {(['small', 'medium', 'large'] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    className={`tpl-radio-btn ${tpl.fontSize === sz ? 'tpl-radio-btn--active' : ''}`}
                    onClick={() => set('fontSize', sz)}
                  >
                    {sz.charAt(0).toUpperCase() + sz.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Paper size */}
            <div className="tpl-field">
              <label className="tpl-label">Default Paper Size</label>
              <div className="tpl-radio-group">
                {([
                  { v: 'A4',     l: 'A4' },
                  { v: 'thermal',l: 'Thermal 80mm' },
                  { v: 'A5',     l: 'A5' },
                ] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    className={`tpl-radio-btn ${tpl.paperSize === v ? 'tpl-radio-btn--active' : ''}`}
                    onClick={() => set('paperSize', v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent colour */}
            <div className="tpl-field">
              <label className="tpl-label">Accent Colour</label>
              <div className="tpl-color-row">
                <input
                  type="color"
                  className="tpl-color-picker"
                  value={tpl.primaryColor}
                  onChange={e => set('primaryColor', e.target.value)}
                />
                <span className="tpl-color-val">{tpl.primaryColor}</span>
                <div className="tpl-color-presets">
                  {['#1d4ed8','#16a34a','#dc2626','#7c3aed','#0891b2','#d97706','#000000'].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`tpl-color-swatch ${tpl.primaryColor === c ? 'tpl-color-swatch--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => set('primaryColor', c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>{/* tpl-scroll */}
      </div>{/* tpl-controls */}

      {/* ── Right panel: live preview ────────────────────────────────── */}
      <div className="tpl-preview-panel">
        <div className="tpl-preview-header">
          <Eye size={14} className="text-brand" />
          Live Preview
          <span className="tpl-preview-badge">Updates instantly</span>
        </div>
        <div className="tpl-preview-scroll">
          <div className="tpl-preview-paper">
            <InvoiceTemplate
              ref={printRef}
              data={DEMO_DATA}
              size={tpl.paperSize === 'thermal' ? 'thermal-80' : 'a4'}
              tpl={tpl}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
