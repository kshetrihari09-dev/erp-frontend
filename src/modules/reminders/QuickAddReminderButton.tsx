/**
 * QuickAddReminderButton.tsx — the "🔔 + Reminder" quick action (spec
 * section 6). Self-contained on purpose: a page drops this in with just
 * the record to link, and doesn't need to know about ReminderFormModal,
 * hooks, or state — matches how little a page has to do to add a "Sale"
 * or "Payment" button next to a customer today.
 */
import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui'
import ReminderFormModal, { type ReminderFormInitial } from './ReminderFormModal'

interface Props {
  /** Pre-fills the form and links the new reminder to this record. */
  initial: ReminderFormInitial
  /** Defaults to "🔔 Reminder"; pages can override (e.g. "🔔 Follow Up" on an invoice). */
  label?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'secondary' | 'outline' | 'ghost'
}

export default function QuickAddReminderButton({ initial, label = 'Reminder', size = 'sm', variant = 'secondary' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} icon={<Bell size={13} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ReminderFormModal open={open} onClose={() => setOpen(false)} initial={initial} />}
    </>
  )
}
