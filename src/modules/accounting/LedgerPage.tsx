import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { partiesAPI } from '@/services/api'
import { Button, Empty, SkeletonRows } from '@/components/ui'
import { fmt, fmtDate, downloadCSV } from '@/utils'
import {
  Download, Search, RotateCcw, Printer, TrendingUp,
  TrendingDown, DollarSign, FileText, Receipt, BarChart3,
  Calendar, ChevronLeft, ChevronRight, SlidersHorizontal,
  Building2, Phone, Hash, ArrowUpRight, ArrowDownRight,
  Activity, Clock, CreditCard, CheckCircle, AlertCircle,
  Package, RefreshCw, Eye, Grid3X3, List,
} from 'lucide-react'
import type { Party } from '@/types'

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = '₹' }: { value: number; prefix?: string }) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number>()

  useEffect(() => {
    const start = displayed
    const end = value
    const duration = 800
    const startTime = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(start + (end - start) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])

  return (
    <span>
      {prefix}{Math.round(displayed).toLocaleString('en-IN')}
    </span>
  )
}

// ── Sparkline chart (SVG) ─────────────────────────────────────────────────────
function SparkLine({ data, color = '#2563eb' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 120, h = 40, pad = 4
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <polygon
        points={`${pad},${h - pad} ${pts.join(' ')} ${w - pad},${h - pad}`}
        fill="url(#sg)"
      />
    </svg>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  color: string
  trend?: number
  delay?: number
}
function KpiCard({ icon, label, value, sub, color, trend, delay = 0 }: KpiCardProps) {
  const isPos = value >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono tracking-tight ${!isPos && label.includes('Balance') ? 'text-red-600' : isPos && label.includes('Balance') ? 'text-emerald-600' : 'text-slate-800'}`}>
        <AnimatedNumber value={value} />
      </div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </motion.div>
  )
}

// ── Badge component ──────────────────────────────────────────────────────────
function TxBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    opening:  { label: 'Opening',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    SALES:    { label: 'Sale',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    PURCHASE: { label: 'Purchase', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    RECEIPT:  { label: 'Receipt',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    PAYMENT:  { label: 'Payment',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    RETURN:   { label: 'Return',   cls: 'bg-red-50 text-red-600 border-red-200' },
    'SALES RETURN':    { label: 'Sale Return',    cls: 'bg-red-50 text-red-600 border-red-200' },
    'PURCHASE RETURN': { label: 'Purch. Return',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const config = map[type?.toUpperCase?.()] ?? map[type] ?? { label: type || '—', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${config.cls}`}>
      {config.label}
    </span>
  )
}

// ── Mini balance chart ────────────────────────────────────────────────────────
function BalanceTrendChart({ rows }: { rows: any[] }) {
  const dataRows = rows.filter(r => r.type !== 'opening')
  if (dataRows.length < 2) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
      Not enough data
    </div>
  )
  // Group by month
  const monthly: Record<string, number> = {}
  dataRows.forEach(r => {
    const d = new Date(r.date_ad || r.date || '')
    if (isNaN(d.getTime())) return
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthly[key] = Number(r.running_balance ?? r.balance ?? 0)
  })
  const keys = Object.keys(monthly).sort()
  if (keys.length < 2) {
    // fallback: just use all running balances
    const vals = dataRows.slice(-12).map(r => Number(r.running_balance ?? r.balance ?? 0))
    return <SparkLine data={vals} color="#2563eb" />
  }
  const vals = keys.map(k => monthly[k])
  const labels = keys.map(k => {	
    const [y, m] = k.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short' })
  })
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const w = 280, h = 90, padX = 8, padY = 12

  const pts = vals.map((v, i) => {
    const x = padX + (i / (vals.length - 1)) * (w - padX * 2)
    const y = padY + (1 - (v - min) / range) * (h - padY * 2)
    return { x, y, v, label: labels[i] }
  })
  const polyPts = pts.map(p => `${p.x},${p.y}`).join(' ')
  const fillPts = `${padX},${h - padY} ${polyPts} ${w - padX},${h - padY}`

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 16}`} className="overflow-visible">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.5, 1].map(t => (
        <line key={t}
          x1={padX} y1={padY + t * (h - padY * 2)}
          x2={w - padX} y2={padY + t * (h - padY * 2)}
          stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4"
        />
      ))}
      <polygon points={fillPts} fill="url(#chartGrad)" />
      <polyline
        points={polyPts}
        fill="none" stroke="#2563eb" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" stroke="white" strokeWidth="2" />
          {i % Math.ceil(pts.length / 5) === 0 && (
            <text x={p.x} y={h + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-slate-100 mb-3" />
      <div className="h-3 w-20 bg-slate-100 rounded mb-2" />
      <div className="h-6 w-28 bg-slate-100 rounded" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
const ROWS_PER_PAGE_OPTIONS = [20, 50, 100]

export default function LedgerPage() {
  const [parties,   setParties]   = useState<Party[]>([])
  const [partyId,   setPartyId]   = useState('')
  const [dateFrom,  setDateFrom]  = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  )
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [txFilter, setTxFilter]   = useState('')

  const [ledgerData, setLedgerData] = useState<any>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  // Pagination
  const [page,     setPage]     = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Search
  const [search, setSearch] = useState('')

  // Load both customers AND suppliers
  useEffect(() => {
    Promise.all([
      partiesAPI.customers({ limit: 500 }),
      partiesAPI.suppliers({ limit: 500 }),
    ]).then(([c, s]) => {
      const customers = (c.data.data || []).map((p: Party) => ({ ...p, _type: 'Customer' }))
      const suppliers = (s.data.data || []).map((p: Party) => ({ ...p, _type: 'Supplier' }))
      setParties([...customers, ...suppliers])
    }).catch(() => {})
  }, [])

  async function generate() {
    if (!partyId) return
    setLoading(true)
    setError('')
    setLedgerData(null)
    setPage(1)
    setSearch('')
    try {
      const r    = await partiesAPI.ledger(partyId, { date_from: dateFrom, date_to: dateTo })
      const body = r.data
      const payload = body?.data ?? body
      if (!payload || (!payload.rows && !payload.data)) {
        setError('No ledger data returned from server')
        return
      }
      const rows = payload.rows ?? payload.data ?? []
      setLedgerData({
        party:          payload.party         ?? parties.find(p => p.id === partyId),
        rows,
        summary:        payload.summary       ?? null,
        closingBalance: payload.closingBalance ?? payload.closing_balance
                         ?? rows[rows.length - 1]?.running_balance ?? 0,
        openingBalance: payload.opening_balance ?? 0,
      })
    } catch (e: any) {
      setError(e.message || 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setPartyId('')
    setDateFrom(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
    setDateTo(new Date().toISOString().split('T')[0])
    setTxFilter('')
    setSearch('')
    setLedgerData(null)
    setError('')
    setPage(1)
  }

  const rows         = ledgerData?.rows           ?? []
  const party        = ledgerData?.party          ?? parties.find(p => p.id === partyId)
  const closingBal   = ledgerData?.closingBalance ?? 0
  const openingBal   = ledgerData?.openingBalance ?? 0
  const summary      = ledgerData?.summary
  const dataRows     = rows.filter((r: any) => r.type !== 'opening')
  const totalDr      = dataRows.reduce((s: number, e: any) => s + (Number(e.debit)  || 0), 0)
  const totalCr      = dataRows.reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0)
  const partyType    = (party as any)?._type ?? (party?.type === 'supplier' ? 'Supplier' : 'Customer')

  // Analytics
  const salesRows    = dataRows.filter((r: any) => r.type === 'SALES')
  const receiptRows  = dataRows.filter((r: any) => r.type === 'RECEIPT')
  const totalSales   = salesRows.reduce((s: number, r: any) => s + (Number(r.debit) || 0), 0)
  const totalReceipts= receiptRows.reduce((s: number, r: any) => s + (Number(r.credit) || 0), 0)
  const avgInvoice   = salesRows.length > 0 ? totalSales / salesRows.length : 0
  const lastTxDate   = dataRows.length > 0
    ? fmtDate(dataRows[dataRows.length - 1]?.date_ad || dataRows[dataRows.length - 1]?.date)
    : '—'

  // Filtered rows
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

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage)
  const pagedRows  = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  const partyPhone = (party as any)?.phone
  const partyPan   = (party as any)?.pan_no

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* ── Filter Card ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5"
      >
        <div className="flex items-end gap-3 flex-wrap">
          {/* Party */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
              <Building2 size={10} /> Party
            </label>
            <select
              className="erp-input"
              style={{ width: '100%', minWidth: 200 }}
              value={partyId}
              onChange={e => { setPartyId(e.target.value); setLedgerData(null); setError('') }}
            >
              <option value="">Select customer or supplier…</option>
              {['Customer', 'Supplier'].map(type => {
                const group = parties.filter((p: any) => p._type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={`── ${type}s ──`}>
                    {group.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* From */}
          <div style={{ width: 150 }}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
              <Calendar size={10} /> From Date
            </label>
            <input
              type="date"
              className="erp-input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>

          {/* To */}
          <div style={{ width: 150 }}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
              <Calendar size={10} /> To Date
            </label>
            <input
              type="date"
              className="erp-input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          {/* Type filter */}
          <div style={{ width: 150 }}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
              <SlidersHorizontal size={10} /> Tx Type
            </label>
            <select
              className="erp-input"
              value={txFilter}
              onChange={e => { setTxFilter(e.target.value); setPage(1) }}
            >
              <option value="">All Types</option>
              <option value="SALES">Sales</option>
              <option value="PURCHASE">Purchase</option>
              <option value="RECEIPT">Receipt</option>
              <option value="PAYMENT">Payment</option>
              <option value="RETURN">Return</option>
              <option value="opening">Opening</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={!partyId || loading}
              onClick={generate}
              className="inline-flex items-center gap-2 h-[35px] px-5 text-sm font-semibold rounded-lg text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
              }}
            >
              {loading
                ? <RefreshCw size={14} className="animate-spin" />
                : <Search size={14} />
              }
              Show Ledger
            </button>

            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all duration-150"
            >
              <RotateCcw size={13} />
              Reset
            </button>

            {rows.length > 0 && (
              <>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all duration-150"
                >
                  <Printer size={13} />
                  Print
                </button>
                <button
                  onClick={() => downloadCSV(rows, `ledger-${party?.name || partyId}`)}
                  className="inline-flex items-center gap-1.5 h-[35px] px-3.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all duration-150"
                >
                  <Download size={13} />
                  Export
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium mb-5"
          >
            <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty / Prompt State ─────────────────────────────────────────────── */}
      {!loading && !ledgerData && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 text-4xl">
            📒
          </div>
          <h3 className="text-base font-bold text-slate-700 mb-1">Select a Party to View Ledger</h3>
          <p className="text-sm text-slate-400">Choose a customer or supplier and click <strong>Show Ledger</strong></p>
        </motion.div>
      )}

      {/* ── Summary Dashboard ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(rows.length > 0 || loading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4 mb-5"
          >
            {/* Party Header Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row">
                {/* Party Info */}
                <div className="flex-1 p-5 border-b lg:border-b-0 lg:border-r border-slate-100">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {party?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h2 className="font-bold text-lg text-slate-800 truncate">{party?.name ?? '—'}</h2>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          partyType === 'Customer'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : partyType === 'Supplier'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                        }`}>
                          {partyType === 'Customer' ? '👤' : '🏭'} {partyType}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        {partyPhone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} /> {partyPhone}
                          </span>
                        )}
                        {partyPan && (
                          <span className="flex items-center gap-1">
                            <Hash size={11} /> PAN: {partyPan}
                          </span>
                        )}
                        {summary && (
                          <span className="flex items-center gap-1">
                            <CheckCircle size={11} className="text-green-500" />
                            Source: {summary.source === 'accounting' ? 'Vouchers' : 'Transactions'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Balance Trend Chart */}
                <div className="p-5 lg:w-72">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Activity size={10} /> Balance Trend
                  </div>
                  {loading ? (
                    <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />
                  ) : (
                    <BalanceTrendChart rows={rows} />
                  )}
                </div>
              </div>
            </motion.div>

            {/* KPI Row 1 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              ) : (
                <>
                  <KpiCard
                    icon={<DollarSign size={18} className="text-blue-600" />}
                    label="Opening Balance"
                    value={Number(openingBal)}
                    sub="Start of period"
                    color="bg-blue-50"
                    delay={0.05}
                  />
                  <KpiCard
                    icon={<FileText size={18} className="text-violet-600" />}
                    label="Total Sales"
                    value={totalSales}
                    sub={`${salesRows.length} invoice${salesRows.length !== 1 ? 's' : ''}`}
                    color="bg-violet-50"
                    delay={0.1}
                  />
                  <KpiCard
                    icon={<Receipt size={18} className="text-emerald-600" />}
                    label="Total Received"
                    value={totalReceipts}
                    sub={`${receiptRows.length} receipt${receiptRows.length !== 1 ? 's' : ''}`}
                    color="bg-emerald-50"
                    delay={0.15}
                  />
                  <KpiCard
                    icon={<BarChart3 size={18} className={Number(closingBal) >= 0 ? 'text-emerald-600' : 'text-red-500'} />}
                    label="Current Balance"
                    value={Number(closingBal)}
                    sub="End of period"
                    color={Number(closingBal) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
                    delay={0.2}
                  />
                </>
              )}
            </div>

            {/* KPI Row 2 — Secondary Analytics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: <Activity size={14} className="text-slate-500" />, label: 'Transactions', value: dataRows.length, isNum: true },
                { icon: <FileText size={14} className="text-blue-500" />, label: 'Invoices', value: salesRows.length, isNum: true },
                { icon: <CreditCard size={14} className="text-emerald-500" />, label: 'Receipts', value: receiptRows.length, isNum: true },
                { icon: <TrendingUp size={14} className="text-violet-500" />, label: 'Avg Invoice', value: fmt(avgInvoice), isNum: false },
                { icon: <Clock size={14} className="text-orange-500" />, label: 'Last Tx', value: lastTxDate, isNum: false },
                { icon: <Package size={14} className="text-red-400" />, label: 'Total Debit', value: fmt(totalDr), isNum: false },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 + i * 0.04 }}
                  className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default"
                >
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    {item.icon} {item.label}
                  </div>
                  <div className="text-sm font-bold text-slate-700 font-mono">
                    {loading ? <span className="block h-4 w-16 bg-slate-100 rounded animate-pulse" /> : item.value}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ledger Table ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(rows.length > 0 || loading) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          >
            {/* Table Toolbar */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder=""
                    className="erp-input pl-8"
                    style={{ width: 220 }}
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                  />
                </div>
                {(search || txFilter) && (
                  <button
                    onClick={() => { setSearch(''); setTxFilter(''); setPage(1) }}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-mono font-semibold text-slate-600">{filteredRows.length}</span> entries
                {filteredRows.length !== rows.length && (
                  <span className="text-blue-500">(filtered from {rows.length})</span>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th className="sticky top-0">Date</th>
                    <th className="sticky top-0">Reference</th>
                    <th className="sticky top-0">Description</th>
                    <th className="sticky top-0">Type</th>
                    <th className="td-right sticky top-0">Debit</th>
                    <th className="td-right sticky top-0">Credit</th>
                    <th className="td-right sticky top-0">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <SkeletonRows cols={7} />
                    : pagedRows.map((e: any, i: number) => {
                        const bal = Number(e.running_balance ?? e.balance ?? 0)
                        const isOpening = e.type === 'opening'
                        return (
                          <tr
                            key={i}
                            className={isOpening ? 'bg-slate-50' : i % 2 === 0 ? '' : 'bg-slate-50/40'}
                          >
                            <td className="td-mono whitespace-nowrap">
                              {isOpening ? (
                                <span className="text-slate-400 italic text-xs">Opening</span>
                              ) : (
                                e.date_ad ? fmtDate(e.date_ad) : (e.date || '—')
                              )}
                            </td>
                            <td className="td-mono text-brand font-semibold">
                              {e.reference || '—'}
                            </td>
                            <td className={isOpening ? 'font-semibold text-slate-500 text-xs' : 'text-slate-700'}>
                              {e.description || '—'}
                            </td>
                            <td>
                              {e.type ? <TxBadge type={e.type} /> : '—'}
                            </td>
                            <td className="td-right">
                              {Number(e.debit) > 0
                                ? <span className="text-red-600 font-semibold font-mono">{fmt(e.debit)}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="td-right">
                              {Number(e.credit) > 0
                                ? <span className="text-emerald-600 font-semibold font-mono">{fmt(e.credit)}</span>
                                : <span className="text-slate-300">—</span>
                              }
                            </td>
                            <td className="td-right">
                              <span className={`font-bold font-mono ${
                                bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-red-600' : 'text-slate-400'
                              }`}>
                                {fmt(bal)}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
                {!loading && pagedRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={4} className="text-right font-bold text-xs pr-3 text-slate-500 uppercase tracking-widest">
                        Period Totals
                      </td>
                      <td className="td-right font-bold font-mono text-red-600">{fmt(totalDr)}</td>
                      <td className="td-right font-bold font-mono text-emerald-600">{fmt(totalCr)}</td>
                      <td className={`td-right font-bold font-mono text-base ${
                        Number(closingBal) > 0 ? 'text-emerald-600' : Number(closingBal) < 0 ? 'text-red-600' : 'text-slate-500'
                      }`}>
                        {fmt(closingBal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination */}
            {!loading && filteredRows.length > rowsPerPage && (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 flex-wrap gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Rows per page:</span>
                  <select
                    className="erp-input text-xs"
                    style={{ width: 64, padding: '4px 6px' }}
                    value={rowsPerPage}
                    onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
                  >
                    {ROWS_PER_PAGE_OPTIONS.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span>
                    Showing {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filteredRows.length)} of {filteredRows.length}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1
                      : page <= 4 ? i + 1
                      : page >= totalPages - 3 ? totalPages - 6 + i
                      : page - 3 + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                          p === page
                            ? 'text-white shadow-sm'
                            : 'border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                        }`}
                        style={p === page ? { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' } : {}}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state after filter ──────────────────────────────────────────── */}
      {!loading && !error && ledgerData && rows.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-3xl mb-4">📭</div>
          <h3 className="font-bold text-slate-700 mb-1">No Transactions Found</h3>
          <p className="text-sm text-slate-400">No entries match the selected date range and party</p>
        </motion.div>
      )}
    </div>
  )
}
