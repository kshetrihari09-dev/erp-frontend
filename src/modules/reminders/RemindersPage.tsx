/**
 * RemindersPage.tsx — the 🔔 Reminders dashboard (spec section 7).
 *
 * Desktop: header counts + filters + list, single column (a calendar
 * view / two-column layout are listed as "optional" in the spec — this
 * ships the list view first since it's what every other action in this
 * feature — quick-add, notifications, complete/snooze — actually points
 * back to).
 * Mobile/tablet: the same layout reflows to full-width cards — no
 * horizontal scroll, no separate mobile-only component needed, matching
 * how the rest of this app's newer pages (Credit Risk, Purchase
 * Suggestions) already handle responsiveness with plain flex/grid.
 */
import { useState } from 'react'
import { Bell, Plus } from 'lucide-react'
import { Tabs, Button, SearchInput, Select, Empty, SkeletonRows, Pagination } from '@/components/ui'
import { useReminders, useReminderCounts, useReminderTypes, useReminderAssignableUsers } from '@/hooks/useQuery'
import ReminderCard from './ReminderCard'
import ReminderFormModal from './ReminderFormModal'

type Bucket = 'today' | 'upcoming' | 'overdue' | 'completed' | 'all'

export default function RemindersPage() {
  const [bucket, setBucket]     = useState<Bucket>('today')
  const [search, setSearch]     = useState('')
  const [priority, setPriority] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [assignee, setAssignee] = useState('')
  const [page, setPage]         = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<any>(null)

  const { data: counts } = useReminderCounts()
  const { data: types }  = useReminderTypes()
  const { data: users }  = useReminderAssignableUsers()

  const { data, isLoading } = useReminders({
    bucket: bucket === 'all' ? undefined : bucket,
    search: search || undefined,
    priority: priority || undefined,
    reminder_type: typeFilter || undefined,
    assigned_user_id: assignee || undefined,
    page, limit: 20,
  })

  const reminders = data?.data || []
  const pagination = data?.pagination as any

  function openCreate() { setEditing(null); setFormOpen(true) }
  function openEdit(r: any) { setEditing(r); setFormOpen(true) }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-brand" />
          <h1 className="text-lg font-bold text-[var(--text)]">Reminders</h1>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>
          Add Reminder
        </Button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'today',     label: 'Today',     value: counts?.today ?? 0,     color: '#d97706' },
          { key: 'overdue',   label: 'Overdue',   value: counts?.overdue ?? 0,   color: '#dc2626' },
          { key: 'upcoming',  label: 'Upcoming',  value: counts?.upcoming ?? 0,  color: '#2563eb' },
          { key: 'completed', label: 'Completed', value: counts?.completed ?? 0, color: '#16a34a' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => { setBucket(c.key as Bucket); setPage(1) }}
            className={`text-left p-3 rounded-xl border transition-colors ${bucket === c.key ? 'border-brand bg-brand/5' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">{c.label}</div>
            <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' },
          { id: 'overdue', label: 'Overdue' }, { id: 'completed', label: 'Completed' },
          { id: 'all', label: 'All' },
        ]}
        active={bucket}
        onChange={(id) => { setBucket(id as Bucket); setPage(1) }}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search title, customer, invoice…" className="flex-1 min-w-[200px]" />
        <Select
          value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}
          placeholder="All priorities" className="w-40"
          options={[{ value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]}
        />
        <Select
          value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          placeholder="All types" className="w-48"
          options={(types || []).map(t => ({ value: t.value, label: t.label }))}
        />
        <Select
          value={assignee} onChange={e => { setAssignee(e.target.value); setPage(1) }}
          placeholder="All assignees" className="w-44"
          options={(users || []).map(u => ({ value: u.id, label: u.name }))}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <SkeletonRows cols={1} rows={5} />
        ) : reminders.length === 0 ? (
          <Empty
            icon={<Bell size={28} />}
            message={
              bucket === 'today' ? "🔔 No reminders today — you're all caught up!"
              : bucket === 'overdue' ? 'Nothing overdue.'
              : bucket === 'completed' ? 'No completed reminders yet.'
              : 'No reminders found.'
            }
          />
        ) : (
          reminders.map((r: any) => <ReminderCard key={r.id} reminder={r} onEdit={() => openEdit(r)} />)
        )}
      </div>

      {reminders.length > 0 && pagination && (
        <Pagination page={pagination.page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      <ReminderFormModal open={formOpen} onClose={() => setFormOpen(false)} reminder={editing} />
    </div>
  )
}
