import { useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { A, REPORT_TABS } from './constants'
import { useWindowWidth, usePagePx } from './hooks'
import {
  SalesReportTab, PurchaseReportTab, PnLReportTab,
  StockReportTab, ExpiryReportTab, PartyBalanceReportTab,
} from './tabs'

/**
 * ReportsPage — thin page shell.
 *
 * All report-specific state, data-fetching, and markup lives in
 * `./tabs/*ReportTab.tsx`; this file only owns the tab strip and the
 * full-bleed header. No business logic, API calls, or calculations live
 * here — this file was previously ~1,170 lines with all six reports
 * inlined; it is now ~90.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState('sales')
  const px = usePagePx()
  const w  = useWindowWidth()
  const isMobile = w <= 640
  const isTablet = w <= 768

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* Full-bleed header — negative margins exactly cancel page-content's
          horizontal padding so it stretches edge-to-edge at every breakpoint. */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        marginLeft: -px, marginRight: -px,
        paddingLeft: px, paddingRight: px,
        paddingTop: isMobile ? 14 : 20,
        marginBottom: isMobile ? 16 : 24,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: isMobile ? 12 : 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-4)', marginBottom: 2 }}>Analytics</div>
            <h1 style={{ fontSize: isMobile ? 18 : isTablet ? 20 : 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Reports</h1>
          </div>
          <div style={{ background: A.primary + '12', border: `1px solid ${A.primary}30`, borderRadius: 8, padding: isMobile ? '5px 10px' : '6px 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <BarChart2 size={13} color={A.primary}/>
            <span style={{ fontSize: 11, fontWeight: 600, color: A.primary }}>Live Data</span>
          </div>
        </div>

        {/* Tab strip — scrolls horizontally, never wraps, tab label hidden on very small screens */}
        <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', gap: 0 }}>
          {REPORT_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 5,
              padding: isMobile ? '8px 10px' : '9px 14px',
              fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'transparent', whiteSpace: 'nowrap',
              color: tab === t.id ? A.primary : 'var(--text-2)',
              borderBottom: `2.5px solid ${tab === t.id ? A.primary : 'transparent'}`,
              marginBottom: -1, transition: 'color 0.15s', fontFamily: 'var(--font)',
              flexShrink: 0,
            }}>
              <span style={{ color: tab === t.id ? A.primary : 'var(--text-4)', display: 'flex' }}>{t.icon}</span>
              {isMobile ? t.label.split(' ')[0] : t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === 'sales'     && <SalesReportTab />}
      {tab === 'purchases' && <PurchaseReportTab />}
      {tab === 'pnl'       && <PnLReportTab />}
      {tab === 'stock'     && <StockReportTab />}
      {tab === 'expiry'    && <ExpiryReportTab />}
      {tab === 'party_bal' && <PartyBalanceReportTab />}
    </div>
  )
}
