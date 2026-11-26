/**
 * PharmaInvoiceTemplate.tsx — second invoice layout ("Pharma / wholesale"), A4, SALE invoices.
 *
 * A faithful reproduction of the supplied reference invoice: serif company header block, Invoice
 * No. / Transaction Date / Invoice Issue Date (BS + AD + time) on the right, "Page 1 of 1",
 * centred INVOICE, Pay Mode, Party Name / Address / PAN / Tel, an
 * item grid (SN · HS CODE · ITEM DESCRIPTION · PACK · BATCH · EXPIRY · QTY · CC/RATE · AMOUNT ·
 * M.R.P.) with free goods on a "-- do --" row marked "n F" (its CC/RATE cell shows the line's CC amount), "*RE-PRINT[n]" + TOTAL / DISCOUNT /
 * ROUNDING / NET TOTAL, "Inwords Rs. … Only.", the terms lines, Note, and the
 * (Checked By) / (Received By) / For: <company> + user footer.
 *
 * Selected in Settings → Printing → "Invoice layout". The original layout (InvoiceTemplate's
 * standard renderer) is untouched and remains the default.
 *
 * Print-safe rules (same as InvoiceTemplate): inline styles only, literal colours, no CSS
 * variables, no Tailwind. Reads only PrintData (+ the signed-in user as a fallback for "prepared by").
 */
import { forwardRef } from 'react'
import { adToBS } from '@/utils/nepaliDate'
import { amountInWords } from '@/utils/amountInWords'
import useAuthStore from '@/store/authStore'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import type { PrintData } from './InvoiceTemplate'

const fmt2 = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyText = (n: number) => String(Math.round((Number(n) || 0) * 100) / 100)
const slash = (s?: string) => (s ? String(s).slice(0, 10).replace(/-/g, '/') : '')
/** "2028-08-01" / "2028/08" / "2028-8" → "2028/08" (anything else is shown as-is). */
const expiryYM = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})/.exec(String(s || '').trim())
  return m ? `${m[1]}/${m[2].padStart(2, '0')}` : (s || '')
}

const FONT = "Arial, Helvetica, sans-serif"
const SERIF = "'Times New Roman', Times, serif"

// Column widths (%) of the item grid — SN · HS · ITEM · PACK · BATCH · EXPIRY · QTY · RATE · AMOUNT · MRP
const COLS = [4, 8, 24, 5, 10, 9, 7, 11, 12, 10]

interface Props {
  data:       PrintData
  copyLabel?: string
  tpl?:       TemplateConfig
}

// eslint-disable-next-line react/display-name
const PharmaInvoiceTemplate = forwardRef<HTMLDivElement, Props>(({ data, tpl = DEFAULT_TPL }, ref) => {
  const sessionUser = useAuthStore(s => s.user?.name)
  const co     = data.company as any
  const x      = data.extra || {}
  const items  = data.items || []

  const bs       = data.dateBS || adToBS(data.date)
  const issuedAt = x.issuedAt ? new Date(x.issuedAt) : new Date()
  const timeText = issuedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const total    = data.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const discount = data.discountAmt ?? 0
  const rounding = data.roundOff ?? 0
  const payMode  = data.paymentMode ? data.paymentMode.charAt(0).toUpperCase() + data.paymentMode.slice(1) : ''
  const terms    = (tpl.footerText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const accent   = '#000'

  const cell = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ padding: '2px 3px', textAlign: align, verticalAlign: 'top', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
  const head = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ ...cell(align), padding: '3px 3px', fontWeight: 400, borderBottom: `1px solid ${accent}` })

  const rows: React.ReactNode[] = []
  items.forEach((it, i) => {
    const mrp = it.mrp != null ? fmt2(it.mrp) : ''
    rows.push(
      <tr key={`r${i}`}>
        <td style={cell('center')}>{i + 1}</td>
        <td style={cell()}>{it.hs_code || ''}</td>
        <td style={{ ...cell(), whiteSpace: 'normal' }}>{it.product_name}</td>
        <td style={cell('center')}>{it.pack ?? 1}</td>
        <td style={cell()}>{tpl.showBatch ? (it.batch_no || '') : ''}</td>
        <td style={cell()}>{tpl.showExpiry ? expiryYM(it.expiry) : ''}</td>
        <td style={cell('right')}>{qtyText(it.qty)}</td>
        <td style={cell('right')}>{fmt2(it.rate)}</td>
        <td style={cell('right')}>{fmt2(it.amount)}</td>
        <td style={cell('right')}>{mrp}</td>
      </tr>,
    )
    if ((Number(it.bonus) || 0) > 0) {
      rows.push(
        <tr key={`f${i}`}>
          <td style={cell()} /><td style={cell()} />
          <td style={cell()}>-- do --</td>
          <td style={cell()} />
          <td style={cell()}>{tpl.showBatch ? (it.batch_no || '') : ''}</td>
          <td style={cell()}>{tpl.showExpiry ? expiryYM(it.expiry) : ''}</td>
          <td style={cell('right')}>{qtyText(it.bonus!)} F</td>
          <td style={cell('right')}>{fmt2(it.cc_amount ?? 0)}</td>
          <td style={cell('right')}>{fmt2(0)}</td>
          <td style={cell('right')}>{mrp}</td>
        </tr>,
      )
    }
  })

  const totLabel: React.CSSProperties = { padding: '1px 0', textAlign: 'left' }
  const totVal:   React.CSSProperties = { padding: '1px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div ref={ref} style={{ fontFamily: FONT, fontSize: '10px', color: '#000', background: '#fff', width: '100%', lineHeight: 1.35 }}>
      {/* Page x of y — single sheet */}
      <div style={{ textAlign: 'right', fontSize: '10px', marginBottom: 8 }}>Page 1 of 1</div>

      {/* Company block (left) + invoice meta (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {tpl.showCompanyName && co?.name && (
            <div style={{ fontFamily: SERIF, fontSize: '17px', textTransform: 'uppercase', lineHeight: 1.2 }}>{co.name}</div>
          )}
          {tpl.showAddress && co?.address && <div style={{ fontSize: '11px' }}>{co.address}</div>}
          {tpl.showPAN   && co?.pan_no  && <div style={{ fontSize: '9px', marginTop: 2 }}>{co.pan_no}</div>}
          {tpl.showPhone && co?.phone   && <div style={{ fontSize: '9px' }}>{co.phone}</div>}
        </div>
        <table style={{ fontSize: '9px', borderCollapse: 'collapse', marginTop: 12 }}>
          <tbody>
            <tr><td style={{ textAlign: 'right', padding: '0 6px' }}>Invoice No.:</td><td style={{ fontWeight: 700 }}>{data.voucherNo}</td></tr>
            <tr><td style={{ textAlign: 'right', padding: '0 6px' }}>Transaction Date:</td><td style={{ textAlign: 'right' }}>{slash(bs)}</td></tr>
            <tr><td style={{ textAlign: 'right', padding: '0 6px', verticalAlign: 'top' }}>Invoice Issue Date:</td>
              <td style={{ textAlign: 'right' }}>{slash(bs)}<br />{slash(data.date)}<br />{timeText}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Title + copy label; Pay Mode on the left */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: -6, borderBottom: `1px solid ${accent}`, paddingBottom: 3 }}>
        <div style={{ flex: 1, fontSize: '9px', fontWeight: 700 }}>{payMode && `Pay Mode: ${payMode}`}</div>
        <div style={{ flex: 2, textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{(tpl.docTitle || '').trim() || 'INVOICE'}</div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Party block */}
      <div style={{ fontSize: '9px', marginTop: 4, borderBottom: `1px solid ${accent}`, paddingBottom: 3 }}>
        <div>Party Name: {[x.partyCode, data.partyName].filter(Boolean).join(' ')}</div>
        <div style={{ display: 'flex' }}>
          <div style={{ width: '48%' }}>Address &nbsp;: {x.partyAddress || ''}</div>
          <div style={{ width: '30%' }}>PAN:{x.partyPan || ''}</div>
          <div style={{ flex: 1 }}>Tel: {x.partyPhone || ''}</div>
        </div>
      </div>

      {/* Item grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '9px', marginTop: 4 }}>
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th style={head()}>SN</th>
            <th style={head()}>HS CODE</th>
            <th style={head()}>ITEM DESCRIPTION</th>
            <th style={head('center')}>PACK</th>
            <th style={head()}>BATCH</th>
            <th style={head()}>EXPIRY</th>
            <th style={head('right')}>QTY</th>
            <th style={head('right')}>CC/RATE</th>
            <th style={head('right')}>AMOUNT</th>
            <th style={head('right')}>M.R.P.</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      {/* Re-print mark (left) + totals (right), under a rule */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: `1px solid ${accent}`, marginTop: 2, paddingTop: 2, paddingRight: `${COLS[9]}%` }}>
        <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px' }}>
          {(x.reprintCount ?? 0) > 0 ? `*RE-PRINT[${x.reprintCount}]` : ''}
        </div>
        <table style={{ width: '28%', fontSize: '9px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={totLabel}>TOTAL</td><td style={totVal}>{fmt2(total)}</td></tr>
            <tr><td style={totLabel}>DISCOUNT</td><td style={totVal}>{fmt2(discount)}</td></tr>
            <tr><td style={totLabel}>ROUNDING</td><td style={totVal}>{fmt2(rounding)}</td></tr>
            <tr>
              <td style={{ ...totLabel, paddingTop: 3 }}>NET TOTAL</td>
              <td style={{ ...totVal, paddingTop: 3, borderTop: `1px solid ${accent}`, borderBottom: `3px double ${accent}` }}>{fmt2(data.netTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words, terms, note */}
      <div style={{ fontSize: '11px', marginTop: 6 }}>Inwords Rs. {amountInWords(data.netTotal)} Only.</div>
      <div style={{ borderTop: `1px solid ${accent}`, marginTop: 2, paddingTop: 2, fontSize: '8.5px' }}>
        {terms.map((l, i) => <div key={i}>{l}</div>)}
        {tpl.showNotes && <div>Note : {data.narration || ''}</div>}
      </div>

      {/* Signatures + issuer */}
      {tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 30, fontSize: '8.5px' }}>
          <div style={{ width: '30%' }}>(Checked By)</div>
          <div style={{ flex: 1 }}>(Received By)</div>
          <div style={{ textAlign: 'right' }}>
            <div>For: {co?.name || ''}</div>
            <div style={{ marginTop: 6 }}>{x.preparedBy || sessionUser || ''}</div>
          </div>
        </div>
      )}
    </div>
  )
})

export default PharmaInvoiceTemplate
