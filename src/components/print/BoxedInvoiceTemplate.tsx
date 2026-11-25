/**
 * BoxedInvoiceTemplate.tsx — third invoice layout ("Distributor / boxed"), A4, SALE invoices.
 *
 * Reproduces the supplied distributor invoice: large company header (logo · name · Address /
 * Phone / PAN No), centred INVOICE, a ruled box with Customer Code / Name / Address / PAN / Phone
 * on the left and Invoice No / Invoice Miti / Invoice Date + Time / Challan No / Miti-Date on the
 * right, a second row (MSO Name · Transport · MOP | Cases · CN No · CN Date), a fully ruled item
 * grid (S. No · Description · Unit · Batch No. · Expiry · Qty. · Free · Rate · Amount · Dis. Amt)
 * with free goods in their own column, Remarks / Outstanding Balance beside Sub Total · Discount ·
 * Gross Total · Special Discount · Net Amount, "In Words :", "Printed Date & Time" and the
 * Prepared By / Verified By / For <company> footer.
 *
 * Selected in Settings → Printing → "Invoice Layout". The standard and Pharma layouts are untouched.
 * Print-safe rules (same as the other layouts): inline styles, literal colours, no CSS variables.
 * Details the system doesn't store (MSO, transport, challan, cases, CN, outstanding balance) come
 * from `PrintData.extra` and print blank when absent — the labels stay, as on the paper form.
 */
import { forwardRef } from 'react'
import { adToBS } from '@/utils/nepaliDate'
import { amountInWords } from '@/utils/amountInWords'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import type { PrintData } from './InvoiceTemplate'

const SERIF = "'Times New Roman', Times, serif"
const SANS  = "Arial, Helvetica, sans-serif"
const LINE  = '1.5px solid #000'

const fmt2 = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "2026-11-24" (or ISO) → "24/11/2026" */
const dmy = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(String(s || ''))
  return m ? `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}
/** "2024-07-01" / "2024/07" → "07/2024" */
const expiryMY = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})/.exec(String(s || '').trim())
  return m ? `${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}
/** 4:44:00PM — hour without padding, no space before AM/PM (as on the reference). */
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).replace(' ', '')
/** "Twenty-two" → "Twenty-Two" */
const titleHyphen = (w: string) => w.replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`)

// S.No · Description · Unit · Batch · Expiry · Qty · Free · Rate · Amount · Dis. Amt  (%)
const COLS = [5, 28, 5.5, 9.5, 8, 9, 7.5, 7, 13, 7.5]
const FILL_ROWS = 22   // body is padded to about this many rows so the column rules run down the sheet

interface Props {
  data:       PrintData
  copyLabel?: string
  tpl?:       TemplateConfig
}

// eslint-disable-next-line react/display-name
const BoxedInvoiceTemplate = forwardRef<HTMLDivElement, Props>(({ data, tpl = DEFAULT_TPL }, ref) => {
  const co    = data.company as any
  const x     = data.extra || {}
  const items = data.items || []

  const bs       = data.dateBS || adToBS(data.date)
  const issuedAt = x.issuedAt ? new Date(x.issuedAt) : new Date()
  const printed  = new Date()
  const subtotal = data.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const discount = data.discountAmt ?? 0
  const discPct  = subtotal > 0 ? Math.round((discount / subtotal) * 10000) / 100 : 0
  const payMode  = data.paymentMode ? data.paymentMode.charAt(0).toUpperCase() + data.paymentMode.slice(1) : ''

  const lab: React.CSSProperties = { fontWeight: 700 }
  const row = (label: string, value: React.ReactNode, labW = 112, bold = false) => (
    <div style={{ display: 'flex' }}>
      <span style={{ ...lab, width: labW, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, minWidth: 0 }}>: {value}</span>
    </div>
  )

  const th: React.CSSProperties = { fontWeight: 700, textAlign: 'center', padding: '3px 2px', border: LINE, fontSize: '12.5px' }
  const td = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ textAlign: align, padding: '2px 4px', borderLeft: LINE, borderRight: LINE, verticalAlign: 'top', fontSize: '12px' })

  const fillerH = Math.max(0, FILL_ROWS - items.length) * 17

  const totRow = (label: React.ReactNode, value: string, colon = true, last = false) => (
    <tr>
      <td style={{ padding: '4px 6px', fontWeight: 700, borderBottom: last ? undefined : LINE, whiteSpace: 'nowrap' }}>
        {label}{colon ? <span style={{ float: 'right', marginRight: 22 }}>:</span> : null}
      </td>
      <td style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right', borderBottom: last ? undefined : LINE, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )

  return (
    <div ref={ref} style={{ fontFamily: SERIF, fontSize: '12.5px', color: '#000', background: '#fff', width: '100%', lineHeight: 1.45 }}>
      {/* Company header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 90, flexShrink: 0 }}>
          {tpl.showLogo && co?.logo_url && <img src={co.logo_url} alt="" style={{ maxWidth: 90, maxHeight: 90, objectFit: 'contain' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tpl.showCompanyName && co?.name && (
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '25px', lineHeight: 1.15 }}>{co.name}</div>
          )}
          <div style={{ fontWeight: 700, fontSize: '13px', marginTop: 4 }}>
            {tpl.showAddress && co?.address && row('Address', co.address, 62, true)}
            {tpl.showPhone   && co?.phone   && row('Phone',   co.phone,   62, true)}
            {tpl.showPAN     && co?.pan_no  && row('PAN No',  co.pan_no,  62, true)}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '19px', margin: '8px 0 4px' }}>
        {(tpl.docTitle || '').trim() || 'INVOICE'}
      </div>

      {/* Customer / invoice boxes */}
      <div style={{ border: LINE }}>
        <div style={{ display: 'flex' }}>
          <div style={{ flex: '1 1 61%', padding: '3px 6px' }}>
            {row('Customer Code', x.partyCode || '')}
            {row('Customer Name', data.partyName || '')}
            {row('Address', x.partyAddress || '')}
            {row('PAN NO', x.partyPan || '')}
            {row('Cus Pho No', x.partyPhone || '')}
          </div>
          <div style={{ flex: '1 1 39%', borderLeft: LINE, padding: '3px 6px' }}>
            {row('Invoice No', data.voucherNo, 84, true)}
            {row('Invoice Miti', dmy(bs), 84)}
            {row('Invoice Date', <span style={{ whiteSpace: 'nowrap' }}>{dmy(data.date)} <b>Time : {clock(issuedAt)}</b></span>, 84)}
            {row('Challan No', x.challanNo || '', 84)}
            {row('Miti / Date', x.challanDate || '', 84)}
          </div>
        </div>
        <div style={{ display: 'flex', borderTop: LINE }}>
          <div style={{ flex: '1 1 61%', padding: '3px 6px' }}>
            {row('MSO Name', x.msoName || '')}
            {row('Transport', x.transport || '')}
            {row('MOP', payMode)}
          </div>
          <div style={{ flex: '1 1 39%', borderLeft: LINE, padding: '3px 6px' }}>
            {row('Cases', x.cases || '', 84)}
            {row('CN No', x.cnNo || '', 84)}
            {row('CN Date', x.cnDate || '', 84)}
          </div>
        </div>
      </div>

      {/* Item grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderLeft: LINE, borderRight: LINE }}>
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th style={th}>S. No</th><th style={th}>Description</th><th style={th}>Unit</th>
            <th style={th}>Batch No.</th><th style={th}>Expiry</th><th style={th}>Qty.</th>
            <th style={th}>Free</th><th style={th}>Rate</th><th style={th}>Amount</th><th style={th}>Dis. Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const disAmt = (Number(it.amount) || 0) * (Number(it.discount_pct) || 0) / 100
            return (
              <tr key={i}>
                <td style={td('center')}>{i + 1}</td>
                <td style={td()}>{it.product_name}</td>
                <td style={td('center')}>{it.unit || ''}</td>
                <td style={td()}>{tpl.showBatch ? (it.batch_no || '') : ''}</td>
                <td style={td()}>{tpl.showExpiry ? expiryMY(it.expiry) : ''}</td>
                <td style={td('right')}>{fmt2(it.qty)}</td>
                <td style={td('right')}>{fmt2(it.bonus)}</td>
                <td style={td('right')}>{fmt2(it.rate)}</td>
                <td style={td('right')}>{fmt2(it.amount)}</td>
                <td style={td('right')}>{fmt2(disAmt)}</td>
              </tr>
            )
          })}
          {fillerH > 0 && (
            <tr style={{ height: fillerH }}>
              {COLS.map((_, i) => <td key={i} style={{ borderLeft: LINE, borderRight: LINE, padding: 0 }} />)}
            </tr>
          )}
        </tbody>
      </table>

      {/* Remarks / totals */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: LINE }}>
        <colgroup><col style={{ width: '65%' }} /><col style={{ width: '27.5%' }} /><col style={{ width: '7.5%' }} /></colgroup>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', padding: '4px 6px', height: 170, position: 'relative' }}>
              {tpl.showNotes && <div style={{ fontWeight: 700 }}>Remarks : <span style={{ fontWeight: 400 }}>{data.narration || ''}</span></div>}
              <div style={{ fontWeight: 700, position: 'absolute', left: 6, bottom: 4 }}>
                Outstanding Balance : <span style={{ fontWeight: 400 }}>{x.outstanding != null ? fmt2(x.outstanding) : ''}</span>
              </div>
            </td>
            <td colSpan={1} style={{ verticalAlign: 'top', padding: 0, borderLeft: LINE }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  {totRow('Sub Total', fmt2(subtotal))}
                  {totRow(`Discount${discPct ? ` ${discPct} %` : ''}`, discount ? `-${fmt2(discount)}` : fmt2(0), false)}
                  {totRow('Gross Total', fmt2(subtotal))}
                  {totRow('Special Discount', fmt2(0))}
                  {totRow('Net Amount', fmt2(data.netTotal), true, true)}
                </tbody>
              </table>
            </td>
            <td style={{ borderLeft: LINE }} />
          </tr>
        </tbody>
      </table>
      <div style={{ border: LINE, borderTop: 'none', padding: '4px 6px', fontWeight: 700, fontSize: '13.5px' }}>
        In Words :&nbsp; {titleHyphen(amountInWords(data.netTotal))} only
      </div>

      <div style={{ fontWeight: 700, fontSize: '10.5px', marginTop: 5 }}>
        Printed Date &amp; Time &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {dmy(printed.toISOString())} {clock(printed)}
      </div>

      {tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 70, fontWeight: 700, fontSize: '13px', padding: '0 8px' }}>
          <div style={{ width: '33%' }}>Prepared By</div>
          <div style={{ flex: 1 }}>Verified By</div>
          <div style={{ textAlign: 'right' }}>For {co?.name || ''}</div>
        </div>
      )}
    </div>
  )
})

export default BoxedInvoiceTemplate
