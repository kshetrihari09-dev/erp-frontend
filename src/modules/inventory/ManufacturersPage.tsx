/**
 * ManufacturersPage.tsx
 *
 * Full Manufacturer directory — the "Manage Manufacturers" destination
 * linked from QuickAddManufacturerModal (opened in a new tab, so the
 * Product form's in-progress data on the original tab is untouched).
 *
 * Backed by the same client-side manufacturers service/hooks as
 * ManufacturerSelect — see services/manufacturers.ts for why there's no
 * backend endpoint yet.
 */
import { useState, useMemo } from 'react'
import { Plus, Factory, Search, Pencil, Trash2 } from 'lucide-react'
import { useManufacturers, useDeleteManufacturer } from '@/hooks/useQuery'
import { Button, Empty, SkeletonRows, ConfirmDialog, SearchInput } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import QuickAddManufacturerModal from '@/components/forms/QuickAddManufacturerModal'
import type { Manufacturer } from '@/types'

export default function ManufacturersPage() {
  const { data: manufacturers = [], isLoading } = useManufacturers()
  const del = useDeleteManufacturer()

  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounce(searchRaw, 300)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<Manufacturer | null>(null)
  const [delId,   setDelId]   = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return manufacturers
    return manufacturers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.short_name || '').toLowerCase().includes(q) ||
      (m.contact_person || '').toLowerCase().includes(q),
    )
  }, [manufacturers, search])

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Inventory</div>
          <h1 className="page-title">Manufacturers</h1>
        </div>
        <Button variant="primary" icon={<Plus size={14}/>} onClick={() => { setEditing(null); setModal(true) }}>
          New Manufacturer
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={searchRaw} onChange={setSearchRaw} placeholder="Search manufacturers…" />
      </div>

      <div className="table-card">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th><th>Short Name</th><th>Contact</th><th>Phone</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <SkeletonRows cols={6} />
                : filtered.length
                  ? filtered.map(m => (
                      <tr key={m.id}>
                        <td className="font-semibold text-sm">{m.name}</td>
                        <td className="text-[var(--text-3)]">{m.short_name || '—'}</td>
                        <td className="text-[var(--text-3)]">{m.contact_person || '—'}</td>
                        <td className="text-[var(--text-3)]">{m.phone || '—'}</td>
                        <td>
                          {m.is_active
                            ? <span className="badge badge-green">Active</span>
                            : <span className="badge badge-red">Inactive</span>}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" icon={<Pencil size={13}/>} onClick={() => { setEditing(m); setModal(true) }}>Edit</Button>
                            <Button variant="danger" size="sm" icon={<Trash2 size={13}/>} onClick={() => setDelId(m.id)}>Del</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : <tr><td colSpan={6}><Empty message="No manufacturers found" icon={<Factory size={32}/>}/></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <QuickAddManufacturerModal
          initial={editing}
          existingNames={manufacturers.filter(m => m.id !== editing?.id).map(m => m.name)}
          onClose={() => { setModal(false); setEditing(null) }}
          onSave={() => { setModal(false); setEditing(null) }}
        />
      )}

      <ConfirmDialog
        open={!!delId} onClose={() => setDelId(null)}
        onConfirm={() => { del.mutate(delId!); setDelId(null) }}
        title="Delete Manufacturer" message="This will remove the manufacturer from the directory. Existing products keep their stored name. Continue?"
        danger
      />
    </div>
  )
}
