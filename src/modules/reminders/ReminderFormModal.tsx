/**
 * ReminderFormModal.tsx — manual reminder creation/edit (spec section 5).
 *
 * One shared modal for both "+ Reminder" (create) and editing an existing
 * one — `reminder` prop present = edit mode. Also the target of every
 * quick-add entry point (Customer page, etc. — see QuickAddReminderButton.tsx)
 * via `initial`, which pre-fills fields (e.g. customer_id + a suggested
 * title) without the caller needing to know this form's internals.
 */
import { useEffect, useState } from 'react'
import { Modal, Button, Input, Select, Textarea } from '@/components/ui'
import { useReminderTypes, useReminderAssignableUsers, useCreateReminder, useUpdateReminder } from '@/hooks/useQuery'
import useAuthStore from '@/store/authStore'

export interface ReminderFormInitial {
  title?: string
  description?: string
  reminder_type?: string
  priority?: string
  customer_id?: string
  invoice_id?: string
  purchase_id?: string
  reminder_at?: string // ISO datetime
}

interface Props {
  open: boolean
  onClose: () => void
  /** Present = editing this reminder; absent = creating a new one. */
  reminder?: any
  /** Pre-fill for quick-add entry points (customer/invoice pages). */
  initial?: ReminderFormInitial
  onSaved?: () => void
}

function toDateInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
function toTimeInput(iso?: string) {
  if (!iso) return '09:00'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '09:00'
  return d.toTimeString().slice(0, 5)
}
/** Default reminder time for a brand-new reminder: today, one hour from now,
 *  rounded to the nearest 5 minutes — fast to accept as-is, easy to change. */
function defaultDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return { date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5) }
}

export default function ReminderFormModal({ open, onClose, reminder, initial, onSaved }: Props) {
  const user = useAuthStore(s => s.user)
  const { data: types } = useReminderTypes()
  const { data: users } = useReminderAssignableUsers()
  const create = useCreateReminder()
  const update = useUpdateReminder()

  const editing = !!reminder
  const def = defaultDateTime()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [reminderType, setReminderType] = useState('CUSTOM')
  const [priority, setPriority]       = useState('medium')
  const [date, setDate]               = useState(def.date)
  const [time, setTime]               = useState(def.time)
  const [assignedTo, setAssignedTo]   = useState('')
  const [repeatRule, setRepeatRule]   = useState('')
  const [repeatIntervalDays, setRepeatIntervalDays] = useState('7')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [error, setError]             = useState('')

  // Re-seed the form every time it opens — for either a fresh reminder
  // (`initial`) or an existing one (`reminder`). Runs on `open` rather than
  // mount, since the modal instance is reused across multiple opens.
  useEffect(() => {
    if (!open) return
    if (reminder) {
      setTitle(reminder.title || '')
      setDescription(reminder.description || '')
      setReminderType(reminder.reminder_type || 'CUSTOM')
      setPriority(reminder.priority || 'medium')
      setDate(toDateInput(reminder.reminder_at))
      setTime(toTimeInput(reminder.reminder_at))
      setAssignedTo(reminder.assigned_user_id || '')
      setRepeatRule(reminder.repeat_rule || '')
      setRepeatIntervalDays(String(reminder.repeat_interval_days || 7))
      setRepeatUntil(reminder.repeat_until ? String(reminder.repeat_until).slice(0, 10) : '')
    } else {
      const d = defaultDateTime()
      setTitle(initial?.title || '')
      setDescription(initial?.description || '')
      setReminderType(initial?.reminder_type || 'CUSTOM')
      setPriority(initial?.priority || 'medium')
      setDate(initial?.reminder_at ? toDateInput(initial.reminder_at) : d.date)
      setTime(initial?.reminder_at ? toTimeInput(initial.reminder_at) : d.time)
      setAssignedTo(user?.id || '')
      setRepeatRule('')
      setRepeatIntervalDays('7')
      setRepeatUntil('')
    }
    setError('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setError('')
    if (!title.trim()) { setError('Title is required.'); return }
    if (!date || !time) { setError('Date and time are required.'); return }
    if (repeatRule === 'custom' && !repeatIntervalDays) { setError('Enter a repeat interval in days.'); return }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      reminder_type: reminderType,
      priority,
      reminder_at: new Date(`${date}T${time}:00`).toISOString(),
      assigned_user_id: assignedTo || null,
      repeat_rule: repeatRule || null,
      repeat_interval_days: repeatRule === 'custom' ? Number(repeatIntervalDays) : null,
      repeat_until: repeatUntil || null,
    }
    if (!editing) {
      payload.customer_id = initial?.customer_id || null
      payload.invoice_id  = initial?.invoice_id || null
      payload.purchase_id = initial?.purchase_id || null
    }

    try {
      if (editing) await update.mutateAsync({ id: reminder.id, data: payload })
      else await create.mutateAsync(payload)
      onSaved?.()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not save reminder.')
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal
      open={open} onClose={onClose} title={editing ? 'Edit Reminder' : 'New Reminder'} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSave}>{editing ? 'Save Changes' : 'Create Reminder'}</Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-500">{error}</p>}

        <Input label="Title *" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Call ABC Traders about pending order" autoFocus />
        <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional details" />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Date *" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Input label="Time *" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Priority" value={priority} onChange={e => setPriority(e.target.value)}
            options={[
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
            ]}
          />
          <Select
            label="Reminder Type" value={reminderType} onChange={e => setReminderType(e.target.value)}
            options={(types || []).map(t => ({ value: t.value, label: t.label }))}
          />
        </div>

        <Select
          label="Assign To" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
          placeholder="Unassigned"
          options={(users || []).map(u => ({ value: u.id, label: u.id === user?.id ? `${u.name} (me)` : u.name }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Repeat" value={repeatRule} onChange={e => setRepeatRule(e.target.value)}
            placeholder="None"
            options={[
              { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' },
              { value: 'custom', label: 'Custom interval' },
            ]}
          />
          {repeatRule === 'custom'
            ? <Input label="Every N days" type="number" min={1} value={repeatIntervalDays} onChange={e => setRepeatIntervalDays(e.target.value)} />
            : <div />
          }
        </div>
        {repeatRule && (
          <Input label="Repeat Until (optional)" type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} />
        )}

        {!editing && (initial?.customer_id || initial?.invoice_id || initial?.purchase_id) && (
          <p className="text-xs text-[var(--text-4)]">
            Linked to {initial?.invoice_id ? 'this invoice' : initial?.purchase_id ? 'this purchase' : 'this customer'} automatically.
          </p>
        )}
      </div>
    </Modal>
  )
}
