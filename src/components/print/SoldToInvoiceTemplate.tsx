/**
 * SoldToInvoiceTemplate.tsx — fourth invoice layout ("Manufacturer / Sold To"), A4, SALE invoices.
 *
 * Reproduces the supplied manufacturer invoice: logo + centred company name with Address / Tel /
 * E-mail lines, PAN and DDA Reg No under the logo, centred INVOICE and "Division:" at the right,
 * a grey-ruled "SOLD TO" box (M/S party, address, phone, PAN | INVOICE NO., DATE, MITI), a
 * Transport / No of cases | C/N.NO. / C/N.Date box, a ruled item grid (Sn# · Description · MRP ·
 * Packing · Unit · Quantity · Free · Batch Nos · Exp. Date · Rate · Amount), then "Amount in words"
 * + Print Date & Time + Payments due on beside Gross Amount · Rounded off · Net Amount, and the
 * Prepared By / Checked By / Dispatched By signature lines.
 *
 * Selected in Settings → Printing → "Invoice Layout". Other layouts are untouched.
 * Print-safe: inline styles, literal colours, no CSS variables. Details the system doesn't store
 * (division, transport, cases, C/N, due date) come from `PrintData.extra` and print blank when absent.
 */
import { forwardRef } from 'react'
import { adToBS } from '@/utils/nepaliDate'
import { amountInWords } from '@/utils/amountInWords'
import useAuthStore from '@/store/authStore'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'
import type { PrintData } from './InvoiceTemplate'

const SANS  = "Arial, Helvetica, sans-serif"
const SERIF = "'Times New Roman', Times, serif"
const GREY  = '1px solid #9a9a9a'
const RULE  = '1px solid #777'

const fmt2 = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(String(s || ''))
  return m ? `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}
const ymdSlash = (s?: string) => (s ? String(s).slice(0, 10).replace(/-/g, '/') : '')
const expiryMY = (s?: string) => {
  const m = /^(\d{4})[-/](\d{1,2})/.exec(String(s || '').trim())
  return m ? `${m[2].padStart(2, '0')}/${m[1]}` : (s || '')
}
const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour12: false })   // 15:04:15

// Sn · Description · MRP · Packing · Unit · Quantity · Free · Batch · Exp. · Rate · Amount  (%)
const COLS = [4, 20, 9, 7, 7, 9, 7, 10, 9, 7, 11]
const FILL_ROWS = 24

interface Props { data: PrintData; copyLabel?: string; tpl?: TemplateConfig }

// eslint-disable-next-line react/display-name
const SoldToInvoiceTemplate = forwardRef<HTMLDivElement, Props>(({ data, tpl = DEFAULT_TPL }, ref) => {
  const sessionUser = useAuthStore(s => s.user?.name)
  const co    = data.company as any
  const x     = data.extra || {}
  const items = data.items || []
  const bs    = data.dateBS || adToBS(data.date)
  const now   = new Date()
  const gross = data.subtotal ?? items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const fillerH = Math.max(0, FILL_ROWS - items.length) * 17

  const th: React.CSSProperties = { fontWeight: 400, fontSize: '12px', textAlign: 'left', padding: '5px 4px', border: GREY, color: '#222' }
  const td = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties =>
    ({ textAlign: align, padding: '3px 4px', borderLeft: GREY, borderRight: GREY, verticalAlign: 'top', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })

  const kv = (label: string, value: React.ReactNode, w = 84) => (
    <div style={{ display: 'flex', marginBottom: 6 }}>
      <span style={{ width: w, flexShrink: 0, fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
  const sumRow = (label: string, value: string, colon = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: '13px' }}>
      <span style={{ fontWeight: 700 }}>{label}{colon ? <span style={{ marginLeft: 14 }}>:</span> : null}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
  const sign = (label: string, name?: string) => (
    <div style={{ width: '24%', textAlign: 'center', fontSize: '12.5px' }}>
      <div style={{ height: 18 }}>{name || ''}</div>
      <div style={{ borderTop: '1px dotted #333' }} />
      <div style={{ marginTop: 8 }}>{label}</div>
    </div>
  )

  return (
    <div ref={ref} style={{ fontFamily: SANS, fontSize: '12px', color: '#111', background: '#fff', width: '100%', lineHeight: 1.4 }}>
      {/* Header: logo + PAN/DDA (left) · name, address lines, INVOICE (centre) */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ width: '24%', flexShrink: 0 }}>
          {tpl.showLogo && co?.logo_url && <img src={co.logo_url} alt="" style={{ maxWidth: 100, maxHeight: 90, objectFit: 'contain', display: 'block' }} />}
          <div style={{ fontWeight: 700, fontSize: '12px', lineHeight: 1.4, marginTop: 6 }}>
            {tpl.showPAN && co?.pan_no && <div>PAN :{co.pan_no}</div>}
            {co?.registration_no && <div>DDA Reg No{co.registration_no}</div>}
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          {tpl.showCompanyName && co?.name && (
            // full-width row (negative side margins reach over the logo column) so a long name stays on one line
            <div style={{ fontWeight: 700, fontSize: '17px', textTransform: 'uppercase', whiteSpace: 'nowrap', margin: '0 -24%' }}>{co.name}</div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: '14px', lineHeight: 1.35 }}>
            {tpl.showAddress && co?.address && <div>{co.address}</div>}
            {tpl.showPhone && co?.phone && <div>Tel:{co.phone}</div>}
            {co?.email && <div>E-mail:- {co.email}</div>}
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', marginTop: 8 }}>{(tpl.docTitle || '').trim() || 'INVOICE'}</div>
        </div>
        <div style={{ width: '24%', flexShrink: 0 }} />
      </div>
      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '12.5px', margin: '6px 4px 2px' }}>
        {x.division ? `Division:  ${x.division}` : '\u00a0'}
      </div>

      {/* Sold to / invoice details */}
      <div style={{ display: 'flex', border: GREY }}>
        <div style={{ flex: '1 1 59%', padding: '4px 12px 6px', borderRight: GREY }}>
          <div style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '0.3px' }}>SOLD TO</div>
          <div style={{ fontWeight: 700, fontSize: '13.5px', margin: '6px 0 8px' }}>M/S&nbsp; {data.partyName || ''}</div>
          <div style={{ fontWeight: 700, fontSize: '12.5px', lineHeight: 1.5 }}>
            <div>{x.partyAddress || ''}</div>
            <div>{x.partyPhone || ''}</div>
            <div>{x.partyPan || ''}</div>
          </div>
        </div>
        <div style={{ flex: '1 1 41%', padding: '10px 14px', fontSize: '13px' }}>
          {kv('INVOICE NO.', data.voucherNo, 110)}
          {kv('DATE', dmy(data.date), 110)}
          {kv('MITI', `(${ymdSlash(bs)})`, 110)}
        </div>
      </div>

      {/* Transport box */}
      <div style={{ display: 'flex', border: GREY, borderTop: 'none', marginTop: 8, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#9a9a9a' }}>
        <div style={{ flex: '1 1 59%', padding: '4px 12px 8px', borderRight: GREY, fontWeight: 700, fontSize: '13px' }}>
          <div>Transport : <span style={{ fontWeight: 400 }}>{x.transport || ''}</span></div>
          <div style={{ marginTop: 8, display: 'flex' }}>
            <span style={{ width: 168 }}>No of cases :</span><span style={{ fontWeight: 400 }}>{x.cases ?? '0'}</span>
          </div>
        </div>
        <div style={{ flex: '1 1 41%', padding: '4px 14px 8px', fontWeight: 700, fontSize: '13px' }}>
          <div>C/N.NO. <span style={{ fontWeight: 400 }}>{x.cnNo || ''}</span></div>
          <div style={{ marginTop: 8 }}>C/N.Date <span style={{ fontWeight: 400 }}>{x.cnDate || ''}</span></div>
        </div>
      </div>

      {/* Item grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: GREY, borderTop: 'none' }}>
        <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th style={th}>Sn#</th><th style={th}>Description</th>
            <th style={{ ...th, textAlign: 'right' }}>MRP</th><th style={th}>Packing</th><th style={th}>Unit</th>
            <th style={{ ...th, textAlign: 'right' }}>Quantity</th><th style={th}>Free</th>
            <th style={th}>Batch Nos</th><th style={th}>Exp. Date</th>
            <th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={td('right')}>{i + 1}</td>
              <td style={{ ...td(), whiteSpace: 'normal' }}>{it.product_name}</td>
              <td style={td('right')}>{it.mrp != null ? fmt2(it.mrp) : ''}</td>
              <td style={td()}>{it.pack ?? ''}</td>
              <td style={td('center')}>{it.unit || ''}</td>
              <td style={td('right')}>{fmt2(it.qty)}</td>
              <td style={td('right')}>{(Number(it.bonus) || 0) > 0 ? fmt2(it.bonus) : '-'}</td>
              <td style={td()}>{tpl.showBatch ? (it.batch_no || '') : ''}</td>
              <td style={td()}>{tpl.showExpiry ? expiryMY(it.expiry) : ''}</td>
              <td style={td('right')}>{fmt2(it.rate)}</td>
              <td style={td('right')}>{fmt2(it.amount)}</td>
            </tr>
          ))}
          {fillerH > 0 && (
            <tr style={{ height: fillerH }}>
              {COLS.map((_, i) => <td key={i} style={{ borderLeft: GREY, borderRight: GREY, padding: 0 }} />)}
            </tr>
          )}
        </tbody>
      </table>

      {/* Words / totals */}
      <div style={{ display: 'flex', border: GREY, borderTop: RULE }}>
        <div style={{ flex: '1 1 72%', padding: '6px 10px', borderRight: GREY, minHeight: 130 }}>
          <div style={{ fontSize: '14px' }}>Amount in words</div>
          <div style={{ fontStyle: 'italic', fontSize: '13px', marginTop: 4 }}>In Words: Rs.{amountInWords(data.netTotal)} Only</div>
          <div style={{ fontSize: '13px', marginTop: 44, paddingLeft: 12 }}>Print Date &amp; Time{dmy(now.toISOString())}&nbsp;&nbsp; {clock(now)}</div>
        </div>
        <div style={{ flex: '1 1 28%', paddingTop: 6 }}>
          {sumRow('Gross Amount', fmt2(gross), true)}
          {sumRow('Rounded off', fmt2(data.roundOff ?? 0))}
        </div>
      </div>
      <div style={{ display: 'flex', border: GREY, borderTop: 'none' }}>
        <div style={{ flex: '1 1 72%', padding: '8px 10px 6px 16px', borderRight: GREY, fontSize: '13.5px' }}>
          <span style={{ fontWeight: 700 }}>Payments due on</span><span style={{ marginLeft: 56 }}>{x.dueDate || ''}</span>
        </div>
        <div style={{ flex: '1 1 28%', paddingTop: 22 }}>{sumRow('Net Amount', fmt2(data.netTotal), true)}</div>
      </div>

      {/* Signatures */}
      {tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', border: GREY, borderTop: 'none', padding: '36px 30px 12px' }}>
          {sign('Prepared By', x.preparedBy || sessionUser)}
          {sign('Checked By')}
          {sign('Dispatched By')}
        </div>
      )}
    </div>
  )
})

export default SoldToInvoiceTemplate
