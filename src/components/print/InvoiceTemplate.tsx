/**
 * InvoiceTemplate.tsx — Print-safe invoice layout
 *
 * NOW DRIVEN BY TemplateConfig from templateStore.
 * Every TemplateConfig flag controls what renders.
 *
 * Rules:
 *   - ONLY inline styles with literal colour values
 *   - NO CSS variables — they resolve to nothing in print context
 *   - NO Tailwind classes
 */
import { forwardRef } from 'react'
import { fmt, fmtDate } from '@/utils'
import type { Company } from '@/types'
import { DEFAULT_TPL, type TemplateConfig } from '@/store/templateStore'

export interface PrintData {
  voucherNo:    string
  type:         'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'JOURNAL' | 'RETURN' | 'SALE_RETURN' | 'PURCHASE_RETURN'
  date:         string
  dateBS?:      string
  narration?:   string
  referenceNo?: string
  status?:      string
  partyName?:   string
  partyAddress?:string
  partyPhone?:  string
  partyPan?:    string
  items?:       PrintItem[]
  subtotal?:    number
  discountAmt?: number
  ccAmount?:    number
  netTotal:     number
  paidAmount?:  number
  dueAmount?:   number
  paymentMode?: string
  company?:     Company | null
}

export interface PrintItem {
  product_name: string
  batch_no?:    string
  expiry?:      string
  qty:          number
  bonus?:       number
  rate:         number
  discount_pct?:number
  cc_pct?:      number
  cc_amount?:   number
  amount:       number
}

const TYPE_LABELS: Record<string, string> = {
  SALE:             'TAX INVOICE',
  PURCHASE:         'PURCHASE BILL',
  RECEIPT:          'RECEIPT VOUCHER',
  PAYMENT:          'PAYMENT VOUCHER',
  JOURNAL:          'JOURNAL VOUCHER',
  RETURN:           'RETURN NOTE',
  SALE_RETURN:      'SALES RETURN NOTE',
  PURCHASE_RETURN:  'PURCHASE RETURN NOTE',
}

const FONT_SIZES = { small: '11px', medium: '13px', large: '15px' }
const FONT_SIZES_TH = { small: '9px',  medium: '10px', large: '11px' }

// eslint-disable-next-line react/display-name
const InvoiceTemplate = forwardRef<HTMLDivElement, {
  data:        PrintData
  size?:       'a4' | 'thermal-80' | 'thermal-58'
  copyLabel?:  string
  tpl?:        TemplateConfig
}>(({ data, size = 'a4', copyLabel = 'ORIGINAL', tpl = DEFAULT_TPL }, ref) => {
  const isA4      = size === 'a4'
  const isThermal = size.startsWith('thermal')
  const co        = data.company
  const hasItems  = (data.items?.length ?? 0) > 0
  const accent    = tpl.primaryColor || '#1d4ed8'
  const baseFontSize = isA4
    ? FONT_SIZES[tpl.fontSize]
    : FONT_SIZES_TH[tpl.fontSize]

  // Computed docTitle: use tpl.docTitle or fallback to type label
  const docTitle = tpl.docTitle?.trim()
    ? tpl.docTitle
    : TYPE_LABELS[data.type] || data.type

  const s = {
    wrap: {
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize:   baseFontSize,
      color:      '#000',
      background: '#fff',
      width:      isA4 ? '100%' : size === 'thermal-80' ? '74mm' : '54mm',
      padding:    isA4 ? '0' : '3mm',
      lineHeight: '1.5',
    } as React.CSSProperties,
    copyLabel: {
      textAlign: 'right' as const,
      fontSize: '9px',
      color: '#555',
      marginBottom: '4px',
    },
    header: {
      textAlign: 'center' as const,
      borderBottom: `2px solid ${accent}`,
      paddingBottom: isA4 ? '10px' : '5px',
      marginBottom:  isA4 ? '10px' : '5px',
    },
    companyName: {
      fontSize: isA4 ? '20px' : '14px',
      fontWeight: 'bold' as const,
      letterSpacing: '0.5px',
      color: accent,
    },
    companyDetail: {
      fontSize: '11px',
      color: '#333',
      marginTop: '2px',
    },
    typeTitle: {
      textAlign: 'center' as const,
      fontWeight: 'bold' as const,
      fontSize: isA4 ? '14px' : '11px',
      marginBottom: isA4 ? '10px' : '5px',
      textDecoration: 'underline',
      letterSpacing: '0.5px',
      color: '#000',
    },
    metaRow: {
      display: 'flex' as const,
      justifyContent: 'space-between' as const,
      marginBottom: isA4 ? '12px' : '6px',
    },
    metaLabel: {
      color: '#555',
      fontWeight: '500' as const,
      paddingRight: '8px',
      fontSize: '11px',
    },
    metaVal: {
      fontWeight: 'bold' as const,
      fontSize: '11px',
      color: '#000',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: isA4 ? '12px' : '9px',
      marginBottom: isA4 ? '12px' : '6px',
      border: '1px solid #000',
    },
    th: {
      padding: '5px 5px',
      background: accent + '18',
      borderBottom: `1.5px solid ${accent}`,
      borderRight: '1px solid #ccc',
      fontWeight: 'bold' as const,
      color: '#000',
      fontSize: isA4 ? '11px' : '9px',
    },
    td: {
      padding: '4px 5px',
      borderBottom: '1px solid #eee',
      borderRight: '1px solid #eee',
      color: '#000',
      verticalAlign: 'top' as const,
    },
    tdRight: {
      padding: '4px 5px',
      borderBottom: '1px solid #eee',
      borderRight: '1px solid #eee',
      textAlign: 'right' as const,
      color: '#000',
      fontWeight: '500' as const,
    },
    totalLabel: {
      paddingRight: '16px',
      color: '#444',
      fontWeight: '500' as const,
      fontSize: isA4 ? '12px' : '10px',
    },
    totalVal: {
      textAlign: 'right' as const,
      color: '#000',
      fontSize: isA4 ? '12px' : '10px',
    },
    grandTotal: {
      borderTop: `2px solid ${accent}`,
      fontWeight: 'bold' as const,
      fontSize: isA4 ? '14px' : '11px',
    },
    sigLine: {
      borderTop: '1.5px solid #000',
      width: '130px',
      marginBottom: '4px',
    },
    footer: {
      textAlign: 'center' as const,
      fontSize: '10px',
      color: '#555',
      marginTop: isA4 ? '16px' : '8px',
      borderTop: `1px solid ${accent}`,
      paddingTop: '6px',
    },
  }

  return (
    <div ref={ref} style={s.wrap}>
      {/* Copy label */}
      <div style={s.copyLabel}>{copyLabel}</div>

      {/* ── Company header ──────────────────────────────────────────────── */}
      <div style={s.header}>
        {tpl.showCompanyName && co?.name && (
          <div style={s.companyName}>{co.name}</div>
        )}
        {tpl.showAddress && (co as any)?.address && (
          <div style={s.companyDetail}>{(co as any).address}</div>
        )}
        {tpl.showPhone && (co as any)?.phone && (
          <div style={s.companyDetail}>Tel: {(co as any).phone}</div>
        )}
        {tpl.showPAN && co?.pan_no && (
          <div style={s.companyDetail}>PAN: {co.pan_no}</div>
        )}
      </div>

      {/* ── Document title ──────────────────────────────────────────────── */}
      <div style={s.typeTitle}>{docTitle}</div>

      {/* ── Header meta ─────────────────────────────────────────────────── */}
      {isA4 ? (
        <div style={s.metaRow}>
          <div style={{ flex: 1 }}>
            {data.partyName && (
              <>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                  {data.type === 'SALE' || data.type === 'SALE_RETURN' ? 'Bill To' : 'Vendor'}
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#000' }}>{data.partyName}</div>
                {data.partyAddress && <div style={{ fontSize: '11px', color: '#333' }}>{data.partyAddress}</div>}
                {data.partyPhone   && <div style={{ fontSize: '11px', color: '#333' }}>Tel: {data.partyPhone}</div>}
                {data.partyPan     && <div style={{ fontSize: '11px', color: '#333' }}>PAN: {data.partyPan}</div>}
              </>
            )}
          </div>
          <div>
            <table style={{ fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={s.metaLabel}>Invoice No:</td>
                  <td style={s.metaVal}>{data.voucherNo}</td>
                </tr>
                <tr>
                  <td style={s.metaLabel}>Date (AD):</td>
                  <td style={s.metaVal}>{fmtDate(data.date)}</td>
                </tr>
                {tpl.showDateBS && data.dateBS && (
                  <tr>
                    <td style={s.metaLabel}>Date (BS):</td>
                    <td style={s.metaVal}>{data.dateBS}</td>
                  </tr>
                )}
                {data.paymentMode && (
                  <tr>
                    <td style={s.metaLabel}>Payment:</td>
                    <td style={{ ...s.metaVal, textTransform: 'capitalize' }}>{data.paymentMode}</td>
                  </tr>
                )}
                {data.referenceNo && (
                  <tr>
                    <td style={s.metaLabel}>Ref:</td>
                    <td style={s.metaVal}>{data.referenceNo}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '9px', marginBottom: '4px', color: '#000' }}>
          <div><b>No:</b> {data.voucherNo} &nbsp; <b>Date:</b> {fmtDate(data.date)}</div>
          {tpl.showDateBS && data.dateBS && <div><b>BS:</b> {data.dateBS}</div>}
          {data.partyName   && <div><b>Party:</b> {data.partyName}</div>}
          {data.paymentMode && <div style={{ textTransform: 'capitalize' }}><b>Mode:</b> {data.paymentMode}</div>}
        </div>
      )}

      {/* ── Items table ─────────────────────────────────────────────────── */}
      {hasItems && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '24px', textAlign: 'center' }}>#</th>
              <th style={{ ...s.th, textAlign: 'left' }}>Item</th>
              {!isThermal && tpl.showBatch  && <th style={{ ...s.th, width: '90px' }}>Batch/Exp</th>}
              <th style={{ ...s.th, width: '40px', textAlign: 'right' }}>Qty</th>
              {!isThermal && tpl.showBonus  && <th style={{ ...s.th, width: '40px', textAlign: 'right' }}>Bonus</th>}
              <th style={{ ...s.th, width: '70px', textAlign: 'right' }}>Rate</th>
              {!isThermal && tpl.showCC     && <th style={{ ...s.th, width: '55px', textAlign: 'right' }}>CC Amt</th>}
              <th style={{ ...s.th, width: '80px', textAlign: 'right', borderRight: 'none' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items!.map((item, i) => (
              <tr key={i}>
                <td style={{ ...s.td, textAlign: 'center' }}>{i + 1}</td>
                <td style={s.td}>
                  <div style={{ fontWeight: '500', color: '#000' }}>{item.product_name}</div>
                  {isThermal && tpl.showBatch && item.batch_no && (
                    <div style={{ fontSize: '8px', color: '#555' }}>
                      {item.batch_no}{item.expiry ? ` Exp:${item.expiry}` : ''}
                    </div>
                  )}
                </td>
                {!isThermal && tpl.showBatch && (
                  <td style={s.td}>
                    <div style={{ color: '#000' }}>{item.batch_no || '—'}</div>
                    {item.expiry && <div style={{ fontSize: '9px', color: '#555' }}>{item.expiry}</div>}
                  </td>
                )}
                <td style={{ ...s.td, textAlign: 'right' }}>{item.qty}</td>
                {!isThermal && tpl.showBonus && (
                  <td style={{ ...s.td, textAlign: 'right' }}>{item.bonus || '—'}</td>
                )}
                <td style={{ ...s.td, textAlign: 'right' }}>{fmt(item.rate)}</td>
                {!isThermal && tpl.showCC && (
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {item.cc_amount ? fmt(item.cc_amount) : '—'}
                  </td>
                )}
                <td style={{ ...s.tdRight, borderRight: 'none' }}>{fmt(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Totals ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: isA4 ? '16px' : '8px' }}>
        <table style={{ fontSize: isA4 ? '12px' : '10px', minWidth: isA4 ? '200px' : '130px' }}>
          <tbody>
            {(data.subtotal !== undefined && data.subtotal !== data.netTotal) && (
              <tr><td style={s.totalLabel}>Subtotal</td><td style={s.totalVal}>{fmt(data.subtotal)}</td></tr>
            )}
            {(data.discountAmt ?? 0) > 0 && (
              <tr>
                <td style={{ ...s.totalLabel, color: '#c00' }}>Discount</td>
                <td style={{ ...s.totalVal, color: '#c00' }}>−{fmt(data.discountAmt)}</td>
              </tr>
            )}
            {(data.ccAmount ?? 0) > 0 && (
              <tr><td style={s.totalLabel}>CC Charge</td><td style={s.totalVal}>{fmt(data.ccAmount)}</td></tr>
            )}
            <tr style={s.grandTotal}>
              <td style={{ ...s.totalLabel, paddingTop: '6px', color: accent, fontWeight: 'bold' }}>TOTAL</td>
              <td style={{ ...s.totalVal, paddingTop: '6px', color: accent, fontWeight: 'bold' }}>{fmt(data.netTotal)}</td>
            </tr>
            {(data.paidAmount ?? 0) > 0 && (
              <tr>
                <td style={{ ...s.totalLabel, color: '#16a34a' }}>Paid</td>
                <td style={{ ...s.totalVal, color: '#16a34a' }}>{fmt(data.paidAmount)}</td>
              </tr>
            )}
            {(data.dueAmount ?? 0) > 0 && (
              <tr>
                <td style={{ ...s.totalLabel, color: '#c00', fontWeight: 'bold' }}>Balance Due</td>
                <td style={{ ...s.totalVal, color: '#c00', fontWeight: 'bold' }}>{fmt(data.dueAmount)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Narration ───────────────────────────────────────────────────── */}
      {tpl.showNotes && data.narration && (
        <div style={{ fontSize: '10px', color: '#333', marginBottom: '8px', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
          <b>Narration:</b> {data.narration}
        </div>
      )}

      {/* ── Signature lines — A4 only ────────────────────────────────────── */}
      {isA4 && tpl.showSignature && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', borderTop: '1px solid #ccc', paddingTop: '16px' }}>
          {['Prepared By', 'Checked By', 'Authorised By'].map(label => (
            <div key={label} style={{ textAlign: 'center', fontSize: '10px', color: '#333' }}>
              <div style={s.sigLine}/>
              {label}
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={s.footer}>
        {tpl.showThankYou && (
          <div>{tpl.thankYouMessage}</div>
        )}
        <div style={{ opacity: 0.7, fontSize: '9px', marginTop: 2 }}>
          {isThermal
            ? `${data.voucherNo} • ${fmtDate(data.date)}`
            : `Printed: ${new Date().toLocaleString()}`
          }
        </div>
      </div>
    </div>
  )
})

export default InvoiceTemplate
