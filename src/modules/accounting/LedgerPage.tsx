import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { partiesAPI } from '@/services/api'
import { SkeletonRows } from '@/components/ui'
import { fmt, fmtDate, downloadCSV } from '@/utils'
import {
  Download, Search, RotateCcw, Printer, TrendingUp,
  TrendingDown, DollarSign, FileText, Receipt, BarChart3,
  Calendar, ChevronLeft, ChevronRight, SlidersHorizontal,
  Building2, Phone, Hash, ArrowUpRight, ArrowDownRight,
  Activity, Clock, CreditCard, CheckCircle, AlertCircle,
  Package, RefreshCw,
} from 'lucide-react'
import type { Party } from '@/types'

/* ─────────────────────────────────────────────────────────────────────────────
   All colours use CSS custom properties so they automatically adapt to
   light / dark mode without any JS theme detection.
   Dark vars are defined in globals.css under .dark { }
───────────────────────────────────────────────────────────────────────────── */

// Shared card style — var(--surface) is #fff in light, #111827 in dark
const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
  borderRadius: 16,
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  display: 'flex', alignItems: 'center', gap: 4,
  marginBottom: 6, fontFamily: 'var(--font-mono)',
}

// ── Animated number ───────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '₹' }: { value: number; prefix?: string }) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number>()
  useEffect(() => {
    const start = displayed, end = value, duration = 800, t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setDisplayed(start + (end - start) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])
  return <span>{prefix}{Math.round(displayed).toLocaleString('en-IN')}</span>
}

// ── Balance trend SVG ─────────────────────────────────────────────────────────
function BalanceTrendChart({ rows }: { rows: any[] }) {
  const dataRows = rows.filter(r => r.type !== 'opening')
  if (dataRows.length < 2) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, fontSize: 12, color: 'var(--text-4)' }}>Not enough data</div>
  )
  const monthly: Record<string, number> = {}
  dataRows.forEach(r => {
    const d = new Date(r.date_ad || r.date || '')
    if (isNaN(d.getTime())) return
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthly[key] = Number(r.running_balance ?? r.balance ?? 0)
  })
  const keys = Object.keys(monthly).sort()
  const vals = keys.length >= 2 ? keys.map(k => monthly[k]) : dataRows.slice(-12).map(r => Number(r.running_balance ?? r.balance ?? 0))
  const labels = keys.map(k => { const [y, m] = k.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short' }) })
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const W = 280, H = 80, px = 8, py = 10
  const pts = vals.map((v, i) => ({
    x: px + (i / (vals.length - 1)) * (W - px * 2),
    y: py + (1 - (v - min) / range) * (H - py * 2),
    label: labels[i] ?? '',
  }))
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 16}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ledGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(t => (
        <line key={t} x1={px} y1={py + t * (H - py * 2)} x2={W - px} y2={py + t * (H - py * 2)}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      <polygon points={`${px},${H - py} ${poly} ${W - px},${H - py}`} fill="url(#ledGrad)" />
      <polyline points={poly} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" stroke="var(--surface)" strokeWidth="2" />
          {i % Math.ceil(pts.length / 5) === 0 && (
            <text x={p.x} y={H + 14} textAnchor="middle" fontSize="9" fill="var(--text-4)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, iconBg, iconColor, label, value, sub, valColor, trendPct, delay = 0 }: {
  icon: React.ReactNode; iconBg: string; iconColor: string
  label: string; value: number; sub?: string
  valColor?: string; trendPct?: number; delay?: number
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      style={{ ...CARD, padding: '16px 18px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg, color: iconColor, flexShrink: 0 }}>
          {icon}
        </div>
        {trendPct !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2, color: trendPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {trendPct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', color: valColor ?? 'var(--text)' }}>
        <AnimatedNumber value={value} />
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>{sub}</div>}
    </motion.div>
  )
}

// ── Secondary stat tile ───────────────────────────────────────────────────────
function StatTile({ icon, label, value, loading, delay }: {
  icon: React.ReactNode; label: string; value: any; loading: boolean; delay: number
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{ ...CARD, borderRadius: 12, padding: '12px 14px', cursor: 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
        {loading
          ? <span style={{ display: 'block', height: 14, width: 60, borderRadius: 3, background: 'var(--surface-3)' }} />
          : value}
      </div>
    </motion.div>
  )
}

// ── Tx badge ──────────────────────────────────────────────────────────────────
// Uses translucent tints — look correct on both light and dark surfaces
const TX_BADGE_STYLES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  opening:          { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-3)', border: 'rgba(100,116,139,0.2)', label: 'Opening' },
  SALES:            { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6',       border: 'rgba(59,130,246,0.25)', label: 'Sale' },
  PURCHASE:         { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6',       border: 'rgba(139,92,246,0.25)', label: 'Purchase' },
  RECEIPT:          { bg: 'rgba(16,185,129,0.12)',  color: '#10b981',       border: 'rgba(16,185,129,0.25)', label: 'Receipt' },
  PAYMENT:          { bg: 'rgba(249,115,22,0.12)',  color: '#f97316',       border: 'rgba(249,115,22,0.25)', label: 'Payment' },
  RETURN:           { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444',       border: 'rgba(239,68,68,0.25)',  label: 'Return' },
  'SALES RETURN':   { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444',       border: 'rgba(239,68,68,0.25)',  label: 'Sale Return' },
  'PURCHASE RETURN':{ bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b',       border: 'rgba(245,158,11,0.25)', label: 'Purch. Return' },
}

function TxBadge({ type }: { type: string }) {
  const key = type?.toUpperCase?.() ?? ''
  const s = TX_BADGE_STYLES[key] ?? TX_BADGE_STYLES[type] ?? TX_BADGE_STYLES.opening
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

// ── Secondary button ──────────────────────────────────────────────────────────
function SecBtn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn btn-secondary"
      style={{ height: 35, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 9 }}>
      {children}
    </button>
  )
}

// ── Skeleton KPI card ─────────────────────────────────────────────────────────
function SkeletonKpi() {
  return (
    <div style={{ ...CARD, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-3)', marginBottom: 12 }} />
      <div style={{ height: 10, width: '55%', borderRadius: 3, background: 'var(--surface-3)', marginBottom: 8 }} />
      <div style={{ height: 20, width: '75%', borderRadius: 3, background: 'var(--surface-3)' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
const ROWS_PER_PAGE_OPTIONS = [20, 50, 100]

export default function LedgerPage() {
  const [parties,    setParties   ] = useState<Party[]>([])
  const [partyId,    setPartyId   ] = useState('')
  const [dateFrom,   setDateFrom  ] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [dateTo,     setDateTo    ] = useState(new Date().toISOString().split('T')[0])
  const [txFilter,   setTxFilter  ] = useState('')
  const [ledgerData, setLedgerData] = useState<any>(null)
  const [loading,    setLoading   ] = useState(false)
  const [error,      setError     ] = useState('')
  const [page,       setPage      ] = useState(1)
  const [rowsPerPage,setRowsPerPage] = useState(20)
  const [search,     setSearch    ] = useState('')

  useEffect(() => {
    Promise.all([
      partiesAPI.customers({ limit: 500 }),
      partiesAPI.suppliers({ limit: 500 }),
    ]).then(([c, s]) => {
      setParties([
        ...(c.data.data || []).map((p: Party) => ({ ...p, _type: 'Customer' })),
        ...(s.data.data || []).map((p: Party) => ({ ...p, _type: 'Supplier' })),
      ])
    }).catch(() => {})
  }, [])

  async function generate() {
    if (!partyId) return
    setLoading(true); setError(''); setLedgerData(null); setPage(1); setSearch('')
    try {
      const r = await partiesAPI.ledger(partyId, { date_from: dateFrom, date_to: dateTo })
      const payload = (r.data?.data ?? r.data) as any
      if (!payload || (!payload.rows && !payload.data)) { setError('No ledger data returned'); return }
      const rows = payload.rows ?? payload.data ?? []
      setLedgerData({
        party:          payload.party ?? parties.find(p => p.id === partyId),
        rows,
        summary:        payload.summary ?? null,
        closingBalance: payload.closingBalance ?? payload.closing_balance ?? rows[rows.length - 1]?.running_balance ?? 0,
        openingBalance: payload.opening_balance ?? 0,
      })
    } catch (e: any) { setError(e.message || 'Failed to load ledger') }
    finally { setLoading(false) }
  }

  function reset() {
    setPartyId(''); setLedgerData(null); setError(''); setSearch(''); setTxFilter(''); setPage(1)
    setDateFrom(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
    setDateTo(new Date().toISOString().split('T')[0])
  }

  const rows         = ledgerData?.rows ?? []
  const party        = ledgerData?.party ?? parties.find(p => p.id === partyId)
  const closingBal   = Number(ledgerData?.closingBalance ?? 0)
  const openingBal   = Number(ledgerData?.openingBalance ?? 0)
  const summary      = ledgerData?.summary
  const dataRows     = rows.filter((r: any) => r.type !== 'opening')
  const totalDr      = dataRows.reduce((s: number, e: any) => s + (Number(e.debit)  || 0), 0)
  const totalCr      = dataRows.reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0)
  const partyType    = (party as any)?._type ?? (party?.type === 'supplier' ? 'Supplier' : 'Customer')
  const salesRows    = dataRows.filter((r: any) => r.type === 'SALES')
  const receiptRows  = dataRows.filter((r: any) => r.type === 'RECEIPT')
  const totalSales   = salesRows.reduce((s: number, r: any) => s + (Number(r.debit)   || 0), 0)
  const totalReceipts= receiptRows.reduce((s: number, r: any) => s + (Number(r.credit) || 0), 0)
  const avgInvoice   = salesRows.length > 0 ? totalSales / salesRows.length : 0
  const lastTxDate   = dataRows.length > 0 ? fmtDate(dataRows[dataRows.length - 1]?.date_ad || dataRows[dataRows.length - 1]?.date) : '—'
  const partyPhone   = (party as any)?.phone
  const partyPan     = (party as any)?.pan_no

  const filteredRows = useMemo(() => {
    let r = rows
    if (txFilter) r = r.filter((row: any) => row.type?.toUpperCase() === txFilter.toUpperCase())
    if (search) {
      const q = search.toLowerCase()
      r = r.filter((row: any) =>
        row.description?.toLowerCase().includes(q) ||
        row.reference?.toLowerCase().includes(q) ||
        row.type?.toLowerCase().includes(q)
      )
    }
    return r
  }, [rows, txFilter, search])

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage)
  const pagedRows  = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  // Party type badge colours — translucent, works on light and dark
  const partyBadgeStyle = partyType === 'Supplier'
    ? { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: 'rgba(139,92,246,0.25)' }
    : { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.25)' }

  const balColor = closingBal > 0 ? 'var(--green)' : closingBal < 0 ? 'var(--red)' : 'var(--text-3)'

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── Filter Card ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ ...CARD, padding: '18px 20px', marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          {/* Party */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={LABEL_STYLE}><Building2 size={10} /> Party</label>
            <select className="erp-input" style={{ width: '100%' }} value={partyId}
              onChange={e => { setPartyId(e.target.value); setLedgerData(null); setError('') }}>
              <option value="">Select customer or supplier…</option>
              {['Customer', 'Supplier'].map(type => {
                const group = parties.filter((p: any) => p._type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={`── ${type}s ──`}>
                    {group.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* Date inputs */}
          {[{ label: 'From Date', val: dateFrom, set: setDateFrom }, { label: 'To Date', val: dateTo, set: setDateTo }].map(f => (
            <div key={f.label} style={{ width: 150 }}>
              <label style={LABEL_STYLE}><Calendar size={10} /> {f.label}</label>
              <input type="date" className="erp-input" value={f.val} onChange={e => f.set(e.target.value)} />
            </div>
          ))}

          {/* Tx type */}
          <div style={{ width: 148 }}>
            <label style={LABEL_STYLE}><SlidersHorizontal size={10} /> Tx Type</label>
            <select className="erp-input" value={txFilter} onChange={e => { setTxFilter(e.target.value); setPage(1) }}>
              <option value="">All Types</option>
              {['SALES', 'PURCHASE', 'RECEIPT', 'PAYMENT', 'RETURN', 'opening'].map(t => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={!partyId || loading} onClick={generate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 35, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 9, color: '#fff', border: 'none', cursor: !partyId || loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 2px 10px rgba(37,99,235,.35)', opacity: !partyId || loading ? 0.55 : 1 }}>
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
              Show Ledger
            </button>
            <SecBtn onClick={reset}><RotateCcw size={13} /> Reset</SecBtn>
            {rows.length > 0 && (
              <>
                <SecBtn onClick={() => window.print()}><Printer size={13} /> Print</SecBtn>
                <SecBtn onClick={() => downloadCSV(rows, `ledger-${party?.name || partyId}`)}><Download size={13} /> Export</SecBtn>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty prompt ──────────────────────────────────────────────────────── */}
      {!loading && !ledgerData && !error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '90px 0', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 16 }}>📒</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>Select a Party to View Ledger</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Choose a customer or supplier and click <strong>Show Ledger</strong></div>
        </motion.div>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(rows.length > 0 || loading) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Party header */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {/* Info panel */}
                <div style={{ flex: 1, minWidth: 260, padding: '20px 22px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20, flexShrink: 0 }}>
                      {party?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <h2 style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {party?.name ?? '—'}
                        </h2>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: partyBadgeStyle.bg, color: partyBadgeStyle.color, border: `1px solid ${partyBadgeStyle.border}` }}>
                          {partyType === 'Customer' ? '👤' : '🏭'} {partyType}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                        {partyPhone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{partyPhone}</span>}
                        {partyPan   && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Hash size={11} />PAN: {partyPan}</span>}
                        {summary    && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} style={{ color: 'var(--green)' }} />Source: {summary.source === 'accounting' ? 'Vouchers' : 'Transactions'}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Chart panel */}
                <div style={{ padding: '18px 22px', width: 300, minWidth: 200 }}>
                  <div style={{ ...LABEL_STYLE, marginBottom: 10 }}><Activity size={10} /> Balance Trend</div>
                  {loading
                    ? <div style={{ height: 80, borderRadius: 10, background: 'var(--surface-3)' }} />
                    : <BalanceTrendChart rows={rows} />
                  }
                </div>
              </div>
            </motion.div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)
              ) : (
                <>
                  <KpiCard icon={<DollarSign size={18} />} iconBg="rgba(59,130,246,0.1)" iconColor="#3b82f6" label="Opening Balance" value={openingBal} sub="Start of period" delay={0.05} />
                  <KpiCard icon={<FileText size={18} />} iconBg="rgba(139,92,246,0.1)" iconColor="#8b5cf6" label="Total Sales" value={totalSales} sub={`${salesRows.length} invoice${salesRows.length !== 1 ? 's' : ''}`} delay={0.1} />
                  <KpiCard icon={<Receipt size={18} />} iconBg="rgba(16,185,129,0.1)" iconColor="#10b981" label="Total Received" value={totalReceipts} sub={`${receiptRows.length} receipt${receiptRows.length !== 1 ? 's' : ''}`} delay={0.15} />
                  <KpiCard icon={<BarChart3 size={18} />}
                    iconBg={closingBal >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}
                    iconColor={closingBal >= 0 ? '#10b981' : '#ef4444'}
                    label="Current Balance" value={closingBal} sub="End of period" valColor={balColor} delay={0.2} />
                </>
              )}
            </div>

            {/* Secondary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
              {[
                { icon: <Activity size={13} style={{ color: 'var(--text-3)' }} />,   label: 'Transactions', value: dataRows.length },
                { icon: <FileText  size={13} style={{ color: '#3b82f6' }} />,         label: 'Invoices',     value: salesRows.length },
                { icon: <CreditCard size={13} style={{ color: '#10b981' }} />,        label: 'Receipts',     value: receiptRows.length },
                { icon: <TrendingUp size={13} style={{ color: '#8b5cf6' }} />,        label: 'Avg Invoice',  value: `₹${fmt(avgInvoice)}` },
                { icon: <Clock size={13} style={{ color: '#f59e0b' }} />,             label: 'Last Tx',      value: lastTxDate },
                { icon: <Package size={13} style={{ color: '#ef4444' }} />,           label: 'Total Debit',  value: `₹${fmt(totalDr)}` },
              ].map((s, i) => (
                <StatTile key={i} icon={s.icon} label={s.label} value={s.value} loading={loading} delay={0.25 + i * 0.04} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ledger Table ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(rows.length > 0 || loading) && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
            style={{ ...CARD, overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none' }} />
                  <input type="text" placeholder="Search entries…" className="erp-input" style={{ width: 220, paddingLeft: 32 }}
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
                </div>
                {(search || txFilter) && (
                  <button onClick={() => { setSearch(''); setTxFilter(''); setPage(1) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <RotateCcw size={11} /> Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
                <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{filteredRows.length}</strong> entries
                {filteredRows.length !== rows.length && <span style={{ color: '#3b82f6', marginLeft: 6 }}>(filtered from {rows.length})</span>}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Date', 'Reference', 'Description', 'Type', 'Debit', 'Credit', 'Balance'].map((h, i) => (
                      <th key={h} style={{ padding: '11px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows cols={7} /> : pagedRows.map((e: any, i: number) => {
                    const bal = Number(e.running_balance ?? e.balance ?? 0)
                    const isOpening = e.type === 'opening'
                    const balColor  = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--text-3)'
                    return (
                      <tr key={i}
                        style={{ borderBottom: '1px solid var(--border)', background: isOpening ? 'var(--surface-2)' : i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-3)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isOpening ? 'var(--surface-2)' : i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}
                      >
                        <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                          {isOpening ? <span style={{ fontStyle: 'italic', fontSize: 11 }}>Opening</span> : (e.date_ad ? fmtDate(e.date_ad) : e.date || '—')}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>
                          {e.reference || '—'}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: isOpening ? 'var(--text-3)' : 'var(--text-2)', fontWeight: isOpening ? 600 : 400 }}>
                          {e.description || '—'}
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          {e.type ? <TxBadge type={e.type} /> : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: Number(e.debit) > 0 ? 'var(--red)' : 'var(--text-4)', fontWeight: Number(e.debit) > 0 ? 700 : 400 }}>
                          {Number(e.debit) > 0 ? fmt(e.debit) : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: Number(e.credit) > 0 ? 'var(--green)' : 'var(--text-4)', fontWeight: Number(e.credit) > 0 ? 700 : 400 }}>
                          {Number(e.credit) > 0 ? fmt(e.credit) : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: balColor }}>
                          {fmt(bal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {!loading && pagedRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-2)', background: 'var(--surface-2)' }}>
                      <td colSpan={4} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        Period Totals
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--red)' }}>{fmt(totalDr)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{fmt(totalCr)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: balColor }}>
                        {fmt(closingBal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination */}
            {!loading && filteredRows.length > rowsPerPage && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
                  <span>Rows per page:</span>
                  <select className="erp-input" style={{ width: 64, padding: '4px 6px', fontSize: 12 }}
                    value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1) }}>
                    {ROWS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span>Showing {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filteredRows.length)} of {filteredRows.length}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.35 : 1 }}>
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
                    const isActive = p === page
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: isActive ? 'none' : '1px solid var(--border)', background: isActive ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'transparent', color: isActive ? '#fff' : 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {p}
                      </button>
                    )
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.35 : 1 }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty after generate ──────────────────────────────────────────────── */}
      {!loading && !error && ledgerData && rows.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ ...CARD, padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 14 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>No Transactions Found</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No entries match the selected date range and party</div>
        </motion.div>
      )}
    </div>
  )
}
