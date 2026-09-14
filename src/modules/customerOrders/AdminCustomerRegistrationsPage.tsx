/**
 * AdminCustomerRegistrationsPage.tsx — Customer Product Ordering module
 * (staff side), approval workflow (migration 037).
 *
 * Mirrors AdminCustomerOrdersPage.tsx's shape deliberately — same
 * "review something a customer submitted" pattern. requireRole('admin')
 * is enforced server-side (routes/adminCustomerRegistrations.js); this
 * page doesn't re-check role client-side, same as no other admin page in
 * this app gates its own rendering on role — a non-admin simply gets a
 * 403 from every request here, same as visiting any other route they
 * lack permission for.
 */
import { useState } from 'react'
import { UserCheck, ChevronRight, Check, X } from 'lucide-react'
import { Tabs, SearchInput, Empty, SkeletonRows, Pagination, Badge, Button, Modal, Input, ConfirmDialog } from '@/components/ui'
import {
  useAdminCustomerRegistrations, useAdminCustomerRegistration,
  useApproveCustomerRegistration, useRejectCustomerRegistration,
} from '@/hooks/useQuery'

export default function AdminCustomerRegistrationsPage() {
  const [status, setStatus] = useState('pending') // spec: default to Pending so admins immediately see what needs action
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isLoading } = useAdminCustomerRegistrations({ status: status || undefined, search: search || undefined, page, limit: 20 })
  const registrations = data?.data || []
  const pagination = data?.pagination as any

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-2">
        <UserCheck size={20} className="text-brand" />
        <h1 className="text-lg font-bold text-[var(--text)]">Customer Registrations</h1>
      </div>

      <Tabs
        tabs={[
          { id: '', label: 'All' }, { id: 'pending', label: 'Pending' },
          { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' },
        ]}
        active={status}
        onChange={(id) => { setStatus(id); setPage(1) }}
      />

      <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search name, phone, or email…" />

      {isLoading ? (
        <SkeletonRows cols={1} rows={6} />
      ) : registrations.length === 0 ? (
        <Empty icon={<UserCheck size={28} />} message={status === 'pending' ? 'No pending registrations.' : 'No customer registrations found.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {registrations.map((r: any) => (
            <button
              key={r.id} onClick={() => setOpenId(r.id)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-left"
            >
              <div>
                <div className="text-sm font-bold">{r.customer_name}</div>
                <div className="text-xs text-[var(--text-4)]">{r.customer_phone} · Registered {new Date(r.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={r.status}>{r.status.toUpperCase()}</Badge>
                <ChevronRight size={16} className="text-[var(--text-4)]" />
              </div>
            </button>
          ))}
        </div>
      )}

      {registrations.length > 0 && pagination && (
        <Pagination page={pagination.page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      {openId && <RegistrationDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function RegistrationDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: reg, isLoading } = useAdminCustomerRegistration(id)
  const approveMut = useApproveCustomerRegistration()
  const rejectMut = useRejectCustomerRegistration()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmApprove, setConfirmApprove] = useState(false)

  if (isLoading || !reg) {
    return <Modal open onClose={onClose} title="Registration"><SkeletonRows cols={1} rows={4} /></Modal>
  }

  const isPending = reg.status === 'pending'
  const busy = approveMut.isPending || rejectMut.isPending

  return (
    <Modal open onClose={onClose} title="Customer Registration" size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">{reg.customer_name}</div>
            <div className="text-xs text-[var(--text-4)]">{reg.customer_phone}{reg.customer_email ? ` · ${reg.customer_email}` : ''}</div>
          </div>
          <Badge status={reg.status}>{reg.status.toUpperCase()}</Badge>
        </div>

        <div className="text-sm text-[var(--text-2)] flex flex-col gap-1.5">
          {reg.customer_address && <div><span className="text-[var(--text-4)]">Address: </span>{reg.customer_address}</div>}
          <div><span className="text-[var(--text-4)]">Registration Date: </span>{new Date(reg.created_at).toLocaleString()}</div>
          {reg.reviewed_at && (
            <div>
              <span className="text-[var(--text-4)]">{reg.status === 'approved' ? 'Approved' : 'Reviewed'}: </span>
              {new Date(reg.reviewed_at).toLocaleString()}{reg.reviewed_by_name ? ` by ${reg.reviewed_by_name}` : ''}
            </div>
          )}
          {reg.status === 'rejected' && reg.rejection_reason && (
            <div><span className="text-[var(--text-4)]">Reason: </span>{reg.rejection_reason}</div>
          )}
        </div>

        {!isPending && (
          <div className="text-xs font-medium text-[var(--text-3)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
            This registration has already been {reg.status} and can't be changed here.
          </div>
        )}

        {isPending && (rejecting ? (
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Reason (optional)" value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRejecting(false)} disabled={busy}>Cancel</Button>
              <Button
                variant="danger" size="sm" loading={rejectMut.isPending}
                onClick={() => rejectMut.mutate({ id: reg.id, reason }, { onSuccess: onClose })}
              ><X size={14} className="mr-1" />Reject</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" loading={approveMut.isPending} disabled={busy} onClick={() => setConfirmApprove(true)}>
              <Check size={15} className="mr-1" />Approve Customer
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
              <X size={15} className="mr-1" />Reject Customer
            </Button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => approveMut.mutate(reg.id, { onSuccess: onClose })}
        title="Approve Customer?"
        confirmLabel="Approve"
        message={`${reg.customer_name} will be able to log in and place orders.`}
      />
    </Modal>
  )
}
