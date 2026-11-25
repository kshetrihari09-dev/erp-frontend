/**
 * CommercialInvoiceTemplate.tsx — fifth invoice layout ("Commercial / Formulation"), A4, SALE invoices.
 *
 * Reproduces the supplied manufacturer "COMMERCIAL INVOICE": a full-page border; round logo +
 * large serif company name with address / phone / e-mail icons and a boxed-digit PAN No., the
 * "Com. Regd No." and an orange COMMERCIAL INVOICE title at the right; a Party / M/S / Add / Tel No. /
 * PAN box beside Invoice No. / Mitti Date / C.N. No. / No.of Packages / Sent Through; a tinted-header
 * item grid (S.N. · Product Name · Packing · Batch No. · Exp Date · MRP · Quantity · Free · Rate ·
 * Amount) in a typewriter face; Remarks beside Total / Discount / Rounded Off / Grand Total (orange
 * label); Previous Balance / Total Present Balance / Rupees in words; Terms & Conditions (one line
 * per row of the Footer Text setting); Prepared by / Received by / Authorised Signatory; and a blue
 * tagline band (the Thank-you message setting).
 *
 * Selected in Settings → Printing → "Invoice Layout". Other layouts are untouched.
 * Print-safe: inline styles, literal colours, no CSS variables. Details the system doesn't store
 * (C.N. No., packages, sent-through, balances) come from `PrintData.extra`; blank when absent.
 */
import { forwardRef } from 'react'
import { adToBS } from '@/utils/nepaliDate'
import { amountInWords } from '@/utils/amountInWords'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import type { PrintData } from './InvoiceTemplate'

const SANS  = "Arial, Helvetica, sans-serif"
const SERIF = "Georgia, 'Times New Roman', Times, serif"
const MONO  = "'Courier New', Courier, monospace"
const NAVY  = '#1b2a5a'
const ORANGE = '#c8501a'
const LINE  = '1.5px solid #222'
const THIN  = '1px solid #444'

const money = (n: number | string | null | undefined) => (Number(n) || 0).toFixed(2)
const qtyText = (n: number | string | null | undefined) => String(Math.round((Number(n) || 0) * 100) / 100)
const slashDate = (s?: string) => (s ? String(s).slice(0, 10).replace(/-/g, '/') : '')
const expiryMY = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})/.exec(String(s || '').trim())
  return m ? `${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}

// S.N. · Product · Packing · Batch · Exp · MRP · Qty · Free · Rate · Amount  (%)
const COLS = [5, 20, 12, 9, 12, 7, 8, 6, 9, 12]
const FILL_ROWS = 22

const Icon = ({ d }: { d: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={NAVY} style={{ marginRight: 8, verticalAlign: '-2px' }}><path d={d} /></svg>
)
const PIN   = 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z'
const PHONE = 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z'
const MAIL  = 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4 7v1.6l8 5.2 8-5.2V7z'

interface Props { data: PrintData; copyLabel?: string; tpl?: TemplateConfig }

// eslint-disable-next-line react/display-name
const CommercialInvoiceTemplate = forwardRef<HTMLDivElement, Props>(({ data, tpl = DEFAULT_TPL }, ref) => {
  const co    = data.company as any
  const x     = data.extra || {}
  const items = data.items || []
  const bs    = data.dateBS || adToBS(data.date)
  const total = data.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const disc  = data.discountAmt ?? 0
  const round = data.roundOff ?? 0
  const terms = (tpl.footerText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const title = (tpl.docTitle || '').trim()
  const fillerH = Math.max(0, FILL_ROWS - items.length) * 19

  const th: React.CSSProperties = {
    background: '#dbe6f7', fontFamily: SANS, fontWeight: 700, fontSize: '12px', color: NAVY, textAlign: 'center',
    padding: '6px 2px', borderLeft: THIN, borderRight: THIN, borderTop: THIN, borderBottom: THIN,
  }
  const td = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ fontFamily: MONO, fontWeight: 700, fontSize: '12.5px', textAlign: align, padding: '2px 4px', borderLeft: THIN, borderRight: THIN, verticalAlign: 'top', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })

  const kv = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', fontFamily: SANS, fontSize: '13px', lineHeight: 1.7 }}>
      <span style={{ width: 118, flexShrink: 0 }}>{label}</span>
      <span style={{ width: 14, flexShrink: 0 }}>:</span>
      <span style={{ fontFamily: MONO, fontWeight: 700 }}>{value}</span>
    </div>
  )
  const pLine = (label: string, value: React.ReactNode, labW = 60) => (
    <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1.75 }}>
      <span style={{ width: labW, flexShrink: 0, fontFamily: SANS, fontSize: '13.5px' }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: '13px' }}>{value}</span>
    </div>
  )
  const sumRow = (label: React.ReactNode, value: string, box = false) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '3px 0' }}>
      <span style={box
        ? { background: ORANGE, color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: '13px', padding: '4px 12px', borderRadius: 3 }
        : { fontFamily: SANS, fontSize: '12.5px', fontStyle: label && String(label).startsWith('Less') ? 'italic' : 'normal', fontWeight: String(label).startsWith('Less') ? 400 : 700 }}>{label}</span>
      <span style={{ width: '14%', minWidth: 96, textAlign: 'right', fontFamily: MONO, fontWeight: 700, fontSize: '13px' }}>{value}</span>
    </div>
  )

  return (
    <div ref={ref} style={{ fontFamily: SANS, color: '#111', background: '#fff', width: '100%', border: LINE, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 14px 6px', gap: 14 }}>
        <div style={{ width: 96, height: 96, flexShrink: 0 }}>
          {tpl.showLogo && co?.logo_url && <img src={co.logo_url} alt="" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: '50%' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tpl.showCompanyName && co?.name && (
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '28px', color: NAVY, lineHeight: 1.1, letterSpacing: '0.3px' }}>{co.name}</div>
          )}
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '13.5px', color: NAVY, marginTop: 4, lineHeight: 1.55 }}>
            {tpl.showAddress && co?.address && <div><Icon d={PIN} />{co.address}</div>}
            {tpl.showPhone && co?.phone && <div><Icon d={PHONE} />{co.phone}</div>}
            {co?.email && <div><Icon d={MAIL} />{co.email}</div>}
          </div>
          {tpl.showPAN && co?.pan_no && (
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '12.5px', color: NAVY, marginTop: 3, display: 'flex', alignItems: 'center' }}>
              PAN No.:
              {String(co.pan_no).split('').map((c, i) => (
                <span key={i} style={{ border: '1.5px solid ' + NAVY, minWidth: 13, textAlign: 'center', marginLeft: i ? 1 : 3, padding: '0 1px', lineHeight: 1.25 }}>{c}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: '27%', flexShrink: 0, textAlign: 'right' }}>
          {co?.registration_no && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '11.5px', color: NAVY }}>Com. Regd No. {co.registration_no}</div>}
          <div style={{ marginTop: 34, display: 'inline-block', color: ORANGE, fontWeight: 700, fontSize: '16px', borderBottom: `3px double ${ORANGE}`, padding: '0 2px 1px', whiteSpace: 'nowrap' }}>
            {!title || title.toUpperCase() === 'INVOICE' ? 'COMMERCIAL INVOICE' : title}
          </div>
        </div>
      </div>

      {/* Party / invoice details */}
      <div style={{ display: 'flex', borderTop: LINE, borderBottom: LINE }}>
        <div style={{ flex: '1 1 62%', padding: '6px 12px', borderRight: '4px double #222' }}>
          {pLine('Party:', data.partyName || '')}
          {pLine('M/S:', '')}
          {pLine('Add:', x.partyAddress || '')}
          {pLine('Tel No.', x.partyPhone || '')}
          {pLine('PAN:', x.partyPan || '')}
        </div>
        <div style={{ flex: '1 1 38%', padding: '10px 12px' }}>
          {kv('Invoice No.', data.voucherNo)}
          {kv('Mitti Date', slashDate(bs))}
          {kv('C.N. No.', x.cnNo || '')}
          {kv('No.of Packages', x.cases || '')}
          {kv('Sent Through', x.transport || '')}
        </div>
      </div>

      {/* Item grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th style={th}>S.N.</th><th style={th}>Product Name</th><th style={th}>Packing</th>
            <th style={th}>Batch No.</th><th style={th}>Exp Date</th><th style={th}>MRP</th>
            <th style={th}>Quantity</th><th style={th}>Free</th><th style={th}>Rate</th><th style={th}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={td('left')}>{i + 1}</td>
              <td style={td()}>{it.product_name}</td>
              <td style={td()}>{it.pack ?? ''}</td>
              <td style={td()}>{tpl.showBatch ? (it.batch_no || '') : ''}</td>
              <td style={td('center')}>{tpl.showExpiry ? expiryMY(it.expiry) : ''}</td>
              <td style={td('right')}>{it.mrp != null ? qtyText(it.mrp) : ''}</td>
              <td style={td('right')}>{qtyText(it.qty)}</td>
              <td style={td('right')}>{(Number(it.bonus) || 0) > 0 ? qtyText(it.bonus) : ''}</td>
              <td style={td('right')}>{money(it.rate)}</td>
              <td style={td('right')}>{money(it.amount)}</td>
            </tr>
          ))}
          {fillerH > 0 && (
            <tr style={{ height: fillerH }}>{COLS.map((_, i) => <td key={i} style={{ borderLeft: THIN, borderRight: THIN, padding: 0 }} />)}</tr>
          )}
        </tbody>
      </table>

      {/* Remarks + totals */}
      <div style={{ display: 'flex', borderTop: LINE }}>
        <div style={{ flex: '1 1 55%', padding: '6px 10px', fontFamily: SANS, fontWeight: 700, fontSize: '13px' }}>
          {tpl.showNotes && <>Remarks: <span style={{ fontWeight: 400 }}>{data.narration || ''}</span></>}
        </div>
        <div style={{ flex: '1 1 45%', padding: '4px 8px 4px 0', borderLeft: THIN, borderLeftWidth: 0 }}>
          {sumRow('Total', money(total))}
          {sumRow('Less : Discount', disc ? money(disc) : '')}
          {sumRow('Total', money(total - disc))}
          {sumRow(round ? `Less : Rounded Off (${round < 0 ? '-' : '+'})` : 'Less : Rounded Off (-)', round ? money(Math.abs(round)) : '')}
          {sumRow('Grand Total', money(data.netTotal), true)}
        </div>
      </div>

      {/* Balances + amount in words */}
      <div style={{ borderTop: LINE, padding: '6px 10px', fontFamily: SANS, fontSize: '12.5px', lineHeight: 1.75 }}>
        <div>Previous Balance Rs. <span style={{ fontFamily: MONO, fontWeight: 700 }}>{x.outstanding != null ? money(x.outstanding) : ''}</span></div>
        <div>Total Present Balance Rs.</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>Rupees in words: <span style={{ fontWeight: 400 }}>Rs. {amountInWords(data.netTotal)} Only</span></div>
      </div>

      {/* Terms */}
      <div style={{ borderTop: LINE, padding: '6px 10px', minHeight: 70 }}>
        {terms.length > 0 && <div style={{ color: ORANGE, fontWeight: 700, fontSize: '13px' }}>Terms &amp; Conditions</div>}
        {terms.map((l, i) => <div key={i} style={{ fontSize: '12px', lineHeight: 1.45 }}>{l}</div>)}
      </div>

      {/* Signatures */}
      {tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '34px 26px 6px', fontFamily: SANS, fontWeight: 700, fontSize: '13.5px', color: NAVY }}>
          {['Prepared by', 'Received by', 'Authorised Signatory'].map(l => (
            <div key={l} style={{ width: '27%', textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #444', marginBottom: 8 }} />{l}
            </div>
          ))}
        </div>
      )}

      {/* Tagline band */}
      <div style={{ marginTop: 8, background: 'linear-gradient(180deg,#3a63b8,#1b2f6e)', color: '#fff', textAlign: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: '15px', padding: '9px 8px', minHeight: 20 }}>
        {tpl.showThankYou ? tpl.thankYouMessage : '\u00a0'}
      </div>
    </div>
  )
})

export default CommercialInvoiceTemplate
