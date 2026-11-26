/**
 * CommercialInvoiceTemplate.tsx — fifth invoice layout ("Commercial / Formulation"), A4, SALE invoices.
 *
 * Reproduces the supplied manufacturer "COMMERCIAL INVOICE": a full-page border; round logo +
 * large serif company name with address / phone / e-mail icons and a boxed-digit PAN No., the
 * "Com. Regd No." and an accent-coloured INVOICE title at the right; a Party / Add / Tel No. / PAN box
 * beside Invoice No. / Mitti Date / Payment Mode; a tinted-header
 * item grid (S.N. · Product Name · Packing · Batch No. · Exp Date · Quantity · Free · Rate ·
 * Amount · MRP) in a typewriter face that stretches to fill the A4 sheet; Remarks beside Total / Discount /
 * CC Charge / Rounded Off / Grand Total (accent-coloured text); Previous Balance / Total Present Balance / Rupees in words; Terms & Conditions (one line
 * per row of the Footer Text setting); Prepared by / Received by / Authorised Signatory. Accent colours follow
 * the Settings → Printing primary colour; there is no thank-you band.
 *
 * Selected in Settings → Printing → "Invoice Layout". Other layouts are untouched.
 * Print-safe: inline styles, literal colours, no CSS variables. Details the system doesn't store
 * (balances) come from `PrintData.extra`; blank when absent.
 */
import { forwardRef } from 'react'
import { adToBS } from '@/utils/nepaliDate'
import { amountInWords } from '@/utils/amountInWords'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import type { PrintData } from './InvoiceTemplate'

const SANS  = "Arial, Helvetica, sans-serif"
const SERIF = "Georgia, 'Times New Roman', Times, serif"
const MONO  = "'Courier New', Courier, monospace"

/** Mix a #rgb / #rrggbb colour with white: amount 0 → the colour, 1 → white. Used for the grid-header tint. */
function tint(hex: string, amount: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (!/^[0-9a-f]{6}/i.test(h) || Number.isNaN(n)) return '#dbe6f7'
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}
const LINE  = '1.5px solid #222'
const THIN  = '1px solid #444'

const money = (n: number | string | null | undefined) => (Number(n) || 0).toFixed(2)
const qtyText = (n: number | string | null | undefined) => String(Math.round((Number(n) || 0) * 100) / 100)
const slashDate = (s?: string) => (s ? String(s).slice(0, 10).replace(/-/g, '/') : '')
const expiryMY = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})/.exec(String(s || '').trim())
  return m ? `${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}

// S.N. · Product · Packing · Batch · Exp · Qty · Free · Rate · Amount · MRP  (%)
const COLS = [5, 25, 10, 9, 10, 8, 6, 9, 12, 6]
const ROW_H = 19   // fixed row height so the per-column lists line up across the grid

/** One header line: icon + text on the SAME row. Flex (not inline flow) because the app's CSS reset makes
 *  <svg> display:block, which would otherwise drop the text onto the line below its icon. */
const IconLine = ({ d, color, children }: { d: string; color: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill={color} style={{ display: 'block', flexShrink: 0 }}><path d={d} /></svg>
    <span>{children}</span>
  </div>
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
  const payMode = data.paymentMode ? data.paymentMode.charAt(0).toUpperCase() + data.paymentMode.slice(1) : ''
  const terms = (tpl.footerText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const title = (tpl.docTitle || '').trim()
  const GRID: { h: string; align: 'left' | 'right' | 'center'; val: (it: NonNullable<PrintData['items']>[number], i: number) => React.ReactNode }[] = [
    { h: 'S.N.',         align: 'left',   val: (_, i) => i + 1 },
    { h: 'Product Name', align: 'left',   val: it => it.product_name },
    { h: 'Packing',      align: 'left',   val: it => it.pack ?? '' },
    { h: 'Batch No.',    align: 'left',   val: it => (tpl.showBatch ? (it.batch_no || '') : '') },
    { h: 'Exp Date',     align: 'center', val: it => (tpl.showExpiry ? expiryMY(it.expiry) : '') },
    { h: 'Quantity',     align: 'right',  val: it => qtyText(it.qty) },
    { h: 'Free',         align: 'right',  val: it => ((Number(it.bonus) || 0) > 0 ? qtyText(it.bonus) : '') },
    { h: 'Rate',         align: 'right',  val: it => money(it.rate) },
    { h: 'Amount',       align: 'right',  val: it => money(it.amount) },
    { h: 'MRP',          align: 'right',  val: it => (it.mrp != null ? qtyText(it.mrp) : '') },
  ]
  const marginMM = Number(tpl.marginMM ?? 10)
  // Accent colour follows Settings → Printing → Primary colour (default blue when unset/invalid)
  const accent   = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(tpl.primaryColor || '') ? tpl.primaryColor : '#1d4ed8'
  const headTint = tint(accent, 0.86)
  const cc = data.ccAmount ?? 0

  const th: React.CSSProperties = {
    background: headTint, fontFamily: SANS, fontWeight: 700, fontSize: '12px', color: accent, textAlign: 'center',
    padding: '6px 2px', border: THIN, boxSizing: 'border-box', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden',
  }
  const td = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ fontFamily: MONO, fontWeight: 700, fontSize: '12.5px', textAlign: align, padding: '0 4px', height: ROW_H, lineHeight: `${ROW_H}px`, boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })

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
        ? { color: accent, fontFamily: SANS, fontWeight: 700, fontSize: '13.5px' }
        : { fontFamily: SANS, fontSize: '12.5px', fontStyle: /^(Less|Add)/.test(String(label)) ? 'italic' : 'normal', fontWeight: /^(Less|Add)/.test(String(label)) ? 400 : 700 }}>{label}</span>
      <span style={{ width: '14%', minWidth: 96, textAlign: 'right', fontFamily: MONO, fontWeight: 700, fontSize: '13px' }}>{value}</span>
    </div>
  )

  return (
    <div ref={ref} style={{
      fontFamily: SANS, color: '#111', background: '#fff', width: '100%', border: LINE, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      // One A4 sheet: the item grid stretches so totals / terms / signatures sit at the bottom.
      minHeight: `calc(297mm - ${2 * marginMM + 4}mm)`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 14px 6px', gap: 14 }}>
        {tpl.showLogo && co?.logo_url && (
          <div style={{ width: 96, height: 96, flexShrink: 0 }}>
            <img src={co.logo_url} alt="" style={{ display: 'block', width: 96, height: 96, objectFit: 'contain', borderRadius: '50%' }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {tpl.showCompanyName && co?.name && (
            <div style={{
              fontFamily: SERIF, fontWeight: 700, color: accent, lineHeight: 1.15, letterSpacing: '0.3px', whiteSpace: 'nowrap',
              fontSize: String(co.name).length > 34 ? '19px' : String(co.name).length > 26 ? '23px' : '27px',
            }}>{co.name}</div>
          )}
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '13.5px', color: accent, marginTop: 4, lineHeight: 1.55 }}>
            {tpl.showAddress && co?.address && <IconLine d={PIN} color={accent}>{co.address}</IconLine>}
            {tpl.showPhone && co?.phone && <IconLine d={PHONE} color={accent}>{co.phone}</IconLine>}
            {co?.email && <IconLine d={MAIL} color={accent}>{co.email}</IconLine>}
          </div>
          {tpl.showPAN && co?.pan_no && (
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '12.5px', color: accent, marginTop: 3, display: 'flex', alignItems: 'center' }}>
              PAN No.:
              {String(co.pan_no).split('').map((c, i) => (
                <span key={i} style={{ border: '1.5px solid ' + accent, minWidth: 13, textAlign: 'center', marginLeft: i ? 1 : 3, padding: '0 1px', lineHeight: 1.25 }}>{c}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 'auto' }}>
          {co?.registration_no && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: '11.5px', color: accent }}>Com. Regd No. {co.registration_no}</div>}
          <div style={{ marginTop: 34, display: 'inline-block', color: accent, fontWeight: 700, fontSize: '16px', borderBottom: `3px double ${accent}`, padding: '0 2px 1px', whiteSpace: 'nowrap' }}>
            {title || 'INVOICE'}
          </div>
        </div>
      </div>

      {/* Party / invoice details */}
      <div style={{ display: 'flex', borderTop: LINE, borderBottom: LINE }}>
        <div style={{ flex: '1 1 62%', padding: '6px 12px', borderRight: '4px double #222' }}>
          {pLine('Party:', data.partyName || '')}
          {pLine('Add:', x.partyAddress || '')}
          {pLine('Tel No.', x.partyPhone || '')}
          {pLine('PAN:', x.partyPan || '')}
        </div>
        <div style={{ flex: '1 1 38%', padding: '10px 12px' }}>
          {kv('Invoice No.', data.voucherNo)}
          {kv('Mitti Date', slashDate(bs))}
          {kv('Payment Mode', payMode)}
        </div>
      </div>

      {/* Item grid — column containers stretch to fill the sheet, so the ruled columns run down to the totals */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: ROW_H * 6 }}>
        <div style={{ display: 'flex' }}>
          {GRID.map((c, ci) => <div key={c.h} style={{ ...th, ...(ci === GRID.length - 1 ? { flex: '1 1 0' } : { width: `${COLS[ci]}%` }), marginLeft: ci ? -1 : 0 }}>{c.h}</div>)}
        </div>
        <div style={{ display: 'flex', flex: '1 1 auto' }}>
          {GRID.map((c, ci) => (
            <div key={c.h} style={{ ...(ci === GRID.length - 1 ? { flex: '1 1 0' } : { width: `${COLS[ci]}%`, flexShrink: 0 }), boxSizing: 'border-box', borderLeft: THIN, borderRight: THIN, marginLeft: ci ? -1 : 0, minWidth: 0 }}>
              {items.map((it, i) => <div key={i} style={td(c.align)}>{c.val(it, i)}</div>)}
            </div>
          ))}
        </div>
      </div>

      {/* Remarks + totals */}
      <div style={{ display: 'flex', borderTop: LINE }}>
        <div style={{ flex: '1 1 55%', padding: '6px 10px', fontFamily: SANS, fontWeight: 700, fontSize: '13px' }}>
          {tpl.showNotes && <>Remarks: <span style={{ fontWeight: 400 }}>{data.narration || ''}</span></>}
        </div>
        <div style={{ flex: '1 1 45%', padding: '4px 8px 4px 0', borderLeft: THIN, borderLeftWidth: 0 }}>
          {sumRow('Total', money(total))}
          {sumRow('Less : Discount', disc ? money(disc) : '')}
          {sumRow('Add : CC Charge', cc ? money(cc) : '')}
          {sumRow('Total', money(total - disc + cc))}
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
        {terms.length > 0 && <div style={{ color: accent, fontWeight: 700, fontSize: '13px' }}>Terms &amp; Conditions</div>}
        {terms.map((l, i) => <div key={i} style={{ fontSize: '12px', lineHeight: 1.45 }}>{l}</div>)}
      </div>

      {/* Signatures */}
      {tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '34px 26px 6px', fontFamily: SANS, fontWeight: 700, fontSize: '13.5px', color: accent }}>
          {['Prepared by', 'Received by', 'Authorised Signatory'].map(l => (
            <div key={l} style={{ width: '27%', textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #444', marginBottom: 8 }} />{l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default CommercialInvoiceTemplate
