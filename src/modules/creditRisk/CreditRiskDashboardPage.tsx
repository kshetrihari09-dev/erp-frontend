import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCreditRiskDashboard, useCreditRiskCustomers, useApprovals, useDecideApproval,
  useCreditRiskSettings, useUpdateCreditRiskSettings,
} from '@/hooks/useQuery'
import { Button, Modal, Badge, SkeletonRows, Empty, SearchInput, Select, Input } from '@/components/ui'
import { fmt } from '@/utils'
import { PATHS } from '@/constants'
import type { RiskCategory, CreditRiskCustomerSummary } from '@/types'
import { AlertTriangle, Settings, RefreshCw, TrendingUp, TrendingDown, Minus, Users, ShieldAlert, DollarSign, Wallet } from 'lucide-react'

const RISK_LABEL: Record<RiskCategory, string> = {
  low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk', insufficient_data: 'Insufficient Data',
}
const TREND_ICON = { improving: <TrendingUp size={13} className="text-green-500" />, stable: <Minus size={13} className="text-[var(--text-4)]" />, worsening: <TrendingDown size={13} className="text-red-500" /> }

function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${tone}1a`, color: tone }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[var(--text-4)] uppercase tracking-wide truncate">{label}</div>
        <div className="text-lg font-bold text-[var(--text)]">{value}</div>
      </div>
    </div>
  )
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: settings, isLoading } = useCreditRiskSettings()
  const update = useUpdateCreditRiskSettings()
  const [form, setForm] = useState<any>(null)
  const effective = form || settings
  if (open && settings && !form) setForm(JSON.parse(JSON.stringify(settings)))

  const setWeight = (k: string, v: number) => setForm((f: any) => ({ ...f, weights: { ...f.weights, [k]: v } }))
  const setThreshold = (k: string, v: number) => setForm((f: any) => ({ ...f, thresholds: { ...f.thresholds, [k]: v } }))
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const weightTotal = effective ? Object.values(effective.weights).reduce((s: number, n: any) => s + Number(n), 0) : 100

  const save = async () => { await update.mutateAsync(form); onClose() }

  return (
    <Modal
      open={open} onClose={() => { setForm(null); onClose() }} title="Credit Risk Settings"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={update.isPending} disabled={Math.round(weightTotal) !== 100} onClick={save}>Save Settings</Button>
      </>}
    >
      {isLoading || !effective ? <SkeletonRows cols={1} rows={6} /> : (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Scoring Period</div>
            <Select value={String(effective.scoringPeriodDays)} onChange={(e) => set('scoringPeriodDays', Number(e.target.value))}
              options={[90, 180, 365].map(d => ({ value: String(d), label: d === 90 ? 'Last 3 Months' : d === 180 ? 'Last 6 Months' : 'Last 12 Months' }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)]">Risk Weights</div>
              <span className={`text-xs font-semibold ${Math.round(weightTotal) === 100 ? 'text-green-600' : 'text-red-500'}`}>Total: {weightTotal}%</span>
            </div>
            <div className="form-grid col2">
              <Input label="On-Time Payment Rate (%)" type="number" value={effective.weights.onTimePaymentRate} onChange={(e) => setWeight('onTimePaymentRate', Number(e.target.value))} />
              <Input label="Payment Delay (%)" type="number" value={effective.weights.paymentDelay} onChange={(e) => setWeight('paymentDelay', Number(e.target.value))} />
              <Input label="Overdue Exposure (%)" type="number" value={effective.weights.overdueExposure} onChange={(e) => setWeight('overdueExposure', Number(e.target.value))} />
              <Input label="Credit Utilization (%)" type="number" value={effective.weights.creditUtilization} onChange={(e) => setWeight('creditUtilization', Number(e.target.value))} />
              <Input label="Late Payment Frequency (%)" type="number" value={effective.weights.latePaymentFrequency} onChange={(e) => setWeight('latePaymentFrequency', Number(e.target.value))} />
              <Input label="Default History (%)" type="number" value={effective.weights.defaultHistory} onChange={(e) => setWeight('defaultHistory', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Risk Thresholds</div>
            <div className="form-grid col2">
              <Input label="Low Risk Minimum Score" type="number" value={effective.thresholds.lowRiskMin} onChange={(e) => setThreshold('lowRiskMin', Number(e.target.value))} />
              <Input label="Medium Risk Minimum Score" type="number" value={effective.thresholds.mediumRiskMin} onChange={(e) => setThreshold('mediumRiskMin', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Automatic Actions</div>
            <Select value={effective.automaticActions} onChange={(e) => set('automaticActions', e.target.value)} options={[
              { value: 'recommendation_only', label: 'Recommendation Only' },
              { value: 'require_approval', label: 'Require Approval' },
              { value: 'block_high_risk', label: 'Block High-Risk Credit Sales' },
            ]} />
            <p className="text-xs text-[var(--text-4)] mt-2">Recommendations are never applied automatically regardless of this setting — an authorized user always makes the final decision via Approvals.</p>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ApprovalsPanel() {
  const { data } = useApprovals({ status: 'pending', limit: 10 })
  const decide = useDecideApproval()
  const rows: any[] = (data?.data as any) || []
  if (!rows.length) return null

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5">
      <div className="text-sm font-bold text-[var(--text)] mb-3 flex items-center gap-2">
        <ShieldAlert size={16} className="text-amber-500" /> Pending Approvals ({rows.length})
      </div>
      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 bg-[var(--surface-3)] rounded-lg px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{a.customer_name || 'Customer'} — {a.type.replace(/_/g, ' ')}</div>
              <div className="text-xs text-[var(--text-4)] truncate">{a.reason}</div>
              {a.payload?.to_limit != null && (
                <div className="text-xs text-[var(--text-3)] mt-0.5">Rs. {fmt(a.payload.from_limit)} → Rs. {fmt(a.payload.to_limit)}</div>
              )}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <Button variant="secondary" size="sm" onClick={() => decide.mutate({ id: a.id, decision: 'reject' })}>Keep Current</Button>
              <Button variant="primary" size="sm" onClick={() => decide.mutate({ id: a.id, decision: 'approve' })}>Approve Change</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CustomerRow({ c }: { c: CreditRiskCustomerSummary }) {
  const navigate = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-[var(--surface-3)]" onClick={() => navigate(`${PATHS.CUSTOMERS}?id=${c.customer_id}`)}>
      <td>
        <div className="font-semibold text-sm">{c.customer_name}</div>
        <div className="text-xs text-[var(--text-4)]">{c.customer_code}</div>
      </td>
      <td className="td-right font-semibold">{c.risk_score ?? '—'}</td>
      <td className="td-right">Rs. {fmt(c.outstanding_amount)}</td>
      <td className="td-right">Rs. {fmt(c.overdue_amount)}</td>
      <td className="td-right">{c.bad_debt_probability != null ? `${c.bad_debt_probability}%` : '—'}</td>
      <td>{TREND_ICON[c.payment_trend]}</td>
      <td className="text-xs max-w-[220px] truncate" title={c.recommended_action}>{c.recommended_action}</td>
    </tr>
  )
}

export default function CreditRiskDashboardPage() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const { data: dashboard, isLoading, isFetching, refetch } = useCreditRiskDashboard()
  const { data: customersData } = useCreditRiskCustomers({ search: search || undefined, risk_category: categoryFilter || undefined, limit: 50 })

  const customers: any[] = (customersData?.data as any) || []

  if (isLoading || !dashboard) {
    return <div><SkeletonRows cols={1} rows={8} /></div>
  }

  const { summary, payment_risk_trend, high_risk_customers, highest_potential_loss } = dashboard

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Accounting</div>
          <h1 className="page-title">Credit Risk Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />} onClick={() => refetch()}>Refresh</Button>
          <Button variant="secondary" icon={<Settings size={14} />} onClick={() => setSettingsOpen(true)}>Settings</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Total Customers" value={String(summary.total_customers)} icon={<Users size={16} strokeWidth={1.8} />} tone="var(--brand)" />
        <SummaryCard label="Low Risk" value={String(summary.low_risk_customers)} icon={<Users size={16} strokeWidth={1.8} />} tone="#16a34a" />
        <SummaryCard label="Medium Risk" value={String(summary.medium_risk_customers)} icon={<Users size={16} strokeWidth={1.8} />} tone="#d97706" />
        <SummaryCard label="High Risk" value={String(summary.high_risk_customers)} icon={<AlertTriangle size={16} strokeWidth={1.8} />} tone="#dc2626" />
        <SummaryCard label="Total Outstanding" value={`Rs. ${fmt(summary.total_outstanding)}`} icon={<Wallet size={16} strokeWidth={1.8} />} tone="var(--brand)" />
        <SummaryCard label="At-Risk Outstanding" value={`Rs. ${fmt(summary.at_risk_outstanding)}`} icon={<AlertTriangle size={16} strokeWidth={1.8} />} tone="#d97706" />
        <SummaryCard label="Estimated Credit Loss" value={`Rs. ${fmt(summary.estimated_credit_loss)}`} icon={<DollarSign size={16} strokeWidth={1.8} />} tone="#dc2626" />
        <SummaryCard label="Insufficient Data" value={String(summary.insufficient_data_customers)} icon={<Users size={16} strokeWidth={1.8} />} tone="var(--text-4)" />
      </div>

      <ApprovalsPanel />

      {/* Payment Risk Trend */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <div className="text-sm font-bold text-[var(--text)] mb-3">Payment Risk Trend</div>
        <div className="flex gap-6">
          <div className="flex items-center gap-2 text-sm"><TrendingUp size={15} className="text-green-500" /> Improving: <b>{payment_risk_trend.improving}</b></div>
          <div className="flex items-center gap-2 text-sm"><Minus size={15} className="text-[var(--text-4)]" /> Stable: <b>{payment_risk_trend.stable}</b></div>
          <div className="flex items-center gap-2 text-sm"><TrendingDown size={15} className="text-red-500" /> Worsening: <b>{payment_risk_trend.worsening}</b></div>
        </div>
      </div>

      {/* High-Risk Customers */}
      <div className="table-card mb-5">
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <div className="text-sm font-bold">High-Risk Customers</div>
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="erp-table">
            <thead><tr><th>Customer</th><th className="td-right">Score</th><th className="td-right">Outstanding</th><th className="td-right">Overdue</th><th className="td-right">Bad-Debt Risk</th><th>Trend</th><th>Recommended Action</th></tr></thead>
            <tbody>
              {high_risk_customers.length ? high_risk_customers.map((c) => <CustomerRow key={c.customer_id} c={c} />)
                : <tr><td colSpan={7}><Empty message="No high-risk customers right now" /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="block md:hidden divide-y divide-[var(--border)]">
          {high_risk_customers.length ? high_risk_customers.map((c) => (
            <div key={c.customer_id} className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{c.customer_name}</span>
                <Badge status="high">{RISK_LABEL.high}</Badge>
              </div>
              <div className="text-xs text-[var(--text-4)] flex flex-wrap gap-x-3">
                <span>Score: <b>{c.risk_score}</b></span>
                <span>Outstanding: <b>Rs. {fmt(c.outstanding_amount)}</b></span>
                <span>Overdue: <b>Rs. {fmt(c.overdue_amount)}</b></span>
              </div>
              <div className="text-xs mt-1 text-[var(--text-3)]">{c.recommended_action}</div>
            </div>
          )) : <Empty message="No high-risk customers right now" />}
        </div>
      </div>

      {/* Highest Potential Loss */}
      <div className="table-card mb-5">
        <div className="p-3 border-b border-[var(--border)] text-sm font-bold">Highest Potential Loss</div>
        <div className="divide-y divide-[var(--border)]">
          {highest_potential_loss.map((c) => (
            <div key={c.customer_id} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Badge status={c.risk_category}>{RISK_LABEL[c.risk_category]}</Badge>
                <span className="text-sm font-medium truncate">{c.customer_name}</span>
              </div>
              <span className="text-sm font-bold text-red-600 flex-shrink-0">Rs. {fmt(c.expected_credit_loss)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All customers browser */}
      <div className="table-card">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[var(--border)]">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="All Risk Categories"
            options={[{ value: 'low', label: 'Low Risk' }, { value: 'medium', label: 'Medium Risk' }, { value: 'high', label: 'High Risk' }, { value: 'insufficient_data', label: 'Insufficient Data' }]} className="w-auto min-w-[170px]" />
          <SearchInput value={search} onChange={setSearch} className="w-56 ml-auto" />
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="erp-table">
            <thead><tr><th>Customer</th><th className="td-right">Score</th><th className="td-right">Outstanding</th><th className="td-right">Overdue</th><th className="td-right">Bad-Debt Risk</th><th>Trend</th><th>Recommended Action</th></tr></thead>
            <tbody>
              {customers.length ? customers.map((c) => (
                <CustomerRow key={c.customer_id} c={{ ...c, customer_id: c.customer_id, risk_score: c.current_risk_score, recommended_action: c.recommended_action }} />
              )) : <tr><td colSpan={7}><Empty message="No customers found" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
