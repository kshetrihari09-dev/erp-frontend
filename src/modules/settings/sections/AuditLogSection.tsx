import { useMemo, useState } from 'react'
import { Shield, Download, Search, X } from 'lucide-react'
import { useAuditLog, useUsers } from '@/hooks/useQuery'
import { Pagination, SkeletonRows, Empty, Select, Input, Button, Modal } from '@/components/ui'
import { fmtDateTime } from '@/utils'
import type { User } from '@/types'

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'POST', 'REVERSE', 'LOGIN']
const ENTITIES = ['sale', 'purchase', 'voucher', 'product', 'party', 'user', 'company_settings', 'backup', 'fiscal_year']

function actionBadgeClass(action?: string) {
  if (!action) return 'badge-blue'
  if (action.includes('DELETE') || action.includes('CANCEL')) return 'badge-red'
  if (action.includes('CREATE')) return 'badge-green'
  return 'badge-blue'
}

function detailText(l: any) {
  return l.payload_after
    ? (typeof l.payload_after === 'string' ? l.payload_after : JSON.stringify(l.payload_after))
    : (l.new_value || '')
}

function exportCSV(rows: any[]) {
  const header = ['Time', 'User', 'Action', 'Entity', 'IP', 'Details']
  const lines = rows.map(l => [
    fmtDateTime(l.created_at), l.user_name || '', l.action || '', l.entity_type || l.entity || '',
    l.ip_address || '', detailText(l).replace(/[\r\n,]+/g, ' ').slice(0, 300),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function AuditLogSection() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [detail, setDetail] = useState<any | null>(null)

  const { data: usersData } = useUsers()
  const users = (usersData?.data as User[]) || []

  const params = useMemo(() => ({
    page, limit: 30,
    ...(search ? { search } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(action ? { action } : {}),
    ...(entity ? { entity_type: entity } : {}),
  }), [page, search, dateFrom, dateTo, userId, action, entity])

  const { data, isLoading } = useAuditLog(params)
  const rows  = (data?.data  as any[]) || []
  const total = (data?.pagination as any)?.total || 0

  const hasFilters = !!(search || dateFrom || dateTo || userId || action || entity)
  function clearFilters() {
    setSearch(''); setDateFrom(''); setDateTo(''); setUserId(''); setAction(''); setEntity(''); setPage(1)
  }

  return (
    <div className="table-card">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-[var(--text-4)]"/>
            <span className="font-semibold text-sm">Audit Trail</span>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={<X size={12}/>} onClick={clearFilters}>Clear Filters</Button>
            )}
            <Button variant="secondary" size="sm" icon={<Download size={13}/>} onClick={() => exportCSV(rows)}>Export</Button>
          </div>
        </div>
        <div className="stp-audit-filters">
          <Input
            prefix={<Search size={13}/>}
            placeholder="Search user, action, entity, IP…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <input type="date" className="erp-input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} title="From date" />
          <input type="date" className="erp-input" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} title="To date" />
          <Select value={userId} onChange={e => { setUserId(e.target.value); setPage(1) }}
            options={[{ value: '', label: 'All Users' }, ...users.map(u => ({ value: u.id, label: u.name }))]} />
          <Select value={action} onChange={e => { setAction(e.target.value); setPage(1) }}
            options={[{ value: '', label: 'All Actions' }, ...ACTIONS.map(a => ({ value: a, label: a }))]} />
          <Select value={entity} onChange={e => { setEntity(e.target.value); setPage(1) }}
            options={[{ value: '', label: 'All Entities' }, ...ENTITIES.map(e => ({ value: e, label: e }))]} />
        </div>
      </div>

      {/* Desktop */}
      <div className="overflow-x-auto stp-desktop-table">
        <table className="erp-table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {isLoading
              ? <SkeletonRows cols={6} />
              : rows.length
                ? rows.map((l: any, i: number) => (
                    <tr key={i} className="cursor-pointer" onClick={() => setDetail(l)}>
                      <td className="td-mono text-[var(--text-3)]">{fmtDateTime(l.created_at)}</td>
                      <td className="font-semibold">{l.user_name}</td>
                      <td><span className={`badge ${actionBadgeClass(l.action)}`}>{l.action}</span></td>
                      <td className="td-mono">{l.entity_type || l.entity || '—'}</td>
                      <td className="max-w-[200px] truncate text-[var(--text-3)] text-xs">{detailText(l).slice(0, 80) || '—'}</td>
                      <td className="td-mono text-[var(--text-4)]">{l.ip_address || '—'}</td>
                    </tr>
                  ))
                : <tr><td colSpan={6}><Empty message="No audit entries"/></td></tr>
            }
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="stp-mobile-list">
        {isLoading
          ? [1,2,3,4].map(i => <div key={i} className="stp-card stp-card-skel"/>)
          : rows.length === 0
            ? <Empty message="No audit entries"/>
            : rows.map((l: any, i: number) => (
                <div key={i} className="stp-card" onClick={() => setDetail(l)} role="button">
                  <div className="stp-card-top">
                    <div className="stp-card-main">
                      <p className="stp-card-title">{l.user_name}</p>
                      <p className="stp-card-sub">{fmtDateTime(l.created_at)}</p>
                    </div>
                    <span className={`badge ${actionBadgeClass(l.action)}`}>{l.action}</span>
                  </div>
                  <div className="stp-card-chips">
                    <span className="stp-audit-entity">{l.entity_type || l.entity || '—'}</span>
                    {l.ip_address && <span className="stp-card-meta">{l.ip_address}</span>}
                  </div>
                  <div className="stp-audit-detail">{detailText(l).slice(0, 120) || '—'}</div>
                </div>
              ))
        }
      </div>
      <Pagination page={page} total={total} limit={30} onChange={setPage} />

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Audit Entry" size="md">
        {detail && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-[11px] text-[var(--text-4)] uppercase block">Time</span>{fmtDateTime(detail.created_at)}</div>
              <div><span className="text-[11px] text-[var(--text-4)] uppercase block">User</span>{detail.user_name || '—'}</div>
              <div><span className="text-[11px] text-[var(--text-4)] uppercase block">Action</span><span className={`badge ${actionBadgeClass(detail.action)}`}>{detail.action}</span></div>
              <div><span className="text-[11px] text-[var(--text-4)] uppercase block">Entity</span>{detail.entity_type || detail.entity || '—'}</div>
              <div><span className="text-[11px] text-[var(--text-4)] uppercase block">IP</span>{detail.ip_address || '—'}</div>
            </div>
            {(detail.payload_before || detail.old_value) && (
              <div>
                <span className="text-[11px] text-[var(--text-4)] uppercase block mb-1">Before</span>
                <pre className="text-xs bg-[var(--surface-2,#f8fafc)] border border-[var(--border)] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
                  {typeof (detail.payload_before || detail.old_value) === 'string' ? (detail.payload_before || detail.old_value) : JSON.stringify(detail.payload_before || detail.old_value, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <span className="text-[11px] text-[var(--text-4)] uppercase block mb-1">After</span>
              <pre className="text-xs bg-[var(--surface-2,#f8fafc)] border border-[var(--border)] rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
                {detailText(detail) || '—'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
