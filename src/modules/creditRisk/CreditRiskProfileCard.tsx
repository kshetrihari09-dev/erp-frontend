import { useState } from 'react'
import {
  useCreditRiskCustomer, useCreditRiskHistory, useRecalculateCreditRisk, useWriteOffBadDebt,
} from '@/hooks/useQuery'
import { Button, Modal, Badge, SkeletonRows, Empty, Input } from '@/components/ui'
import { fmt, fmtDate } from '@/utils'
import useAuthStore from '@/store/authStore'
import type { RiskCategory } from '@/types'
import { RefreshCw, FileSearch, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const RISK_LABEL: Record<RiskCategory, string> = {
  low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk', insufficient_data: 'Insufficient Data',
}
const TREND_LABEL = { improving: 'Improving', stable: 'Stable', worsening: 'Worsening' }
const TREND_ICON = { improving: <TrendingUp size={13} className="text-green-500" />, stable: <Minus size={13} className="text-[var(--text-4)]" />, worsening: <TrendingDown size={13} className="text-red-500" /> }

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[var(--text-3)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--text)]">{value}</span>
    </div>
  )
}

function DetailModal({ customerId, open, onClose }: { customerId: string; open: boolean; onClose: () => void }) {
  const { data } = useCreditRiskCustomer(customerId)
  const { data: history } = useCreditRiskHistory(customerId, { limit: 12 })
  const recalc = useRecalculateCreditRisk()
  const writeOff = useWriteOffBadDebt()
  const hasRole = useAuthStore((s) => s.hasRole)
  const [writeOffOpen, setWriteOffOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const profile = data?.profile
  const historyRows: any[] = (history?.data as any) || []

  const submitWriteOff = async () => {
    await writeOff.mutateAsync({ customerId, data: { amount: Number(amount), reason } })
    setWriteOffOpen(false); setAmount(''); setReason('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Detailed Credit Risk Analysis" size="lg"
      footer={<>
        <Button variant="secondary" icon={<RefreshCw size={14} className={recalc.isPending ? 'animate-spin' : ''} />} onClick={() => recalc.mutate(customerId)}>Recalculate</Button>
        {hasRole(['owner', 'admin', 'manager']) && <Button variant="secondary" onClick={() => setWriteOffOpen(true)}>Record Bad Debt / Write-off</Button>}
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}
    >
      {!profile ? <SkeletonRows cols={1} rows={6} /> : (
        <div className="space-y-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-2">Why is this customer {RISK_LABEL[profile.risk_category]}?</div>
            <ul className="text-sm space-y-1 list-disc list-inside text-[var(--text-2)]">
              {profile.factors.explanation.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-2">Score Breakdown</div>
            <div className="space-y-1.5">
              {profile.factors.breakdown.map((b) => (
                <div key={b.factor} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-3)] capitalize">{b.factor.replace(/([A-Z])/g, ' $1')} <span className="text-[var(--text-4)]">({b.weight_pct}%)</span></span>
                  <span className="font-semibold">{b.score !== null ? `${b.score}/100` : b.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-2">Risk History</div>
            {historyRows.length ? (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[var(--text-4)]"><th className="pb-1">Date</th><th className="pb-1">Score</th><th className="pb-1">Risk</th><th className="pb-1">Trend</th></tr></thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.id} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{fmtDate(h.calculated_at)}</td>
                      <td className="py-1.5 font-semibold">{h.risk_score ?? '—'}</td>
                      <td className="py-1.5"><Badge status={h.risk_category}>{RISK_LABEL[h.risk_category as RiskCategory]}</Badge></td>
                      <td className="py-1.5">{TREND_LABEL[h.payment_trend as keyof typeof TREND_LABEL]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty message="No history yet" />}
          </div>
        </div>
      )}

      <Modal open={writeOffOpen} onClose={() => setWriteOffOpen(false)} title="Record Bad Debt / Write-off"
        footer={<>
          <Button variant="secondary" onClick={() => setWriteOffOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={writeOff.isPending} disabled={!amount || !reason} onClick={submitWriteOff}>Record Write-off</Button>
        </>}
      >
        <div className="space-y-3">
          <Input label="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Reason</label>
            <textarea className="erp-input w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being written off?" />
          </div>
          <p className="text-xs text-[var(--text-4)]">This posts a journal entry (Dr Bad Debt Expense, Cr Accounts Receivable) and permanently records the incident in this customer's credit history, even if invoices are later reopened.</p>
        </div>
      </Modal>
    </Modal>
  )
}

export function CreditRiskProfileCard({ customerId }: { customerId: string }) {
  const { data, isLoading } = useCreditRiskCustomer(customerId)
  const [detailOpen, setDetailOpen] = useState(false)
  const profile = data?.profile

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Credit Risk Profile</p>

      {isLoading || !profile ? <SkeletonRows cols={1} rows={4} /> : profile.risk_category === 'insufficient_data' ? (
        <div className="text-sm text-[var(--text-4)] py-2">Insufficient Credit History — no credit sales on record yet.</div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-[var(--text)]">{profile.current_risk_score}<span className="text-sm text-[var(--text-4)] font-normal"> / 100</span></span>
            <Badge status={profile.risk_category}>{RISK_LABEL[profile.risk_category]}</Badge>
          </div>
          <Row label="Payment Trend" value={<span className="flex items-center gap-1">{TREND_ICON[profile.payment_trend]} {TREND_LABEL[profile.payment_trend]}</span>} />
          <Row label="Outstanding" value={`Rs. ${fmt(profile.outstanding_amount)}`} />
          <Row label="Overdue" value={`Rs. ${fmt(profile.overdue_amount)}`} />
          {profile.credit_utilization != null && <Row label="Credit Utilization" value={`${profile.credit_utilization}%`} />}
          <Row label="Estimated Bad-Debt Risk" value={profile.bad_debt_probability != null ? `${profile.bad_debt_probability}%` : '—'} />
          <Row label="Expected Credit Loss" value={profile.expected_credit_loss != null ? `Rs. ${fmt(profile.expected_credit_loss)}` : '—'} />
          <button className="mt-2 w-full text-xs font-semibold text-[var(--brand)] flex items-center justify-center gap-1.5 py-1.5" onClick={() => setDetailOpen(true)}>
            <FileSearch size={13} /> View Detailed Analysis
          </button>
        </>
      )}

      <DetailModal customerId={customerId} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  )
}
