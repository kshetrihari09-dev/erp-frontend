import { useState, useEffect, useCallback } from 'react'
import { FilePlus, List } from 'lucide-react'
import { receivesAPI, partiesAPI, productsAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'
import { Button, Tabs, Alert, Empty, SearchInput, Pagination, SkeletonRows, Badge } from '@/components/ui'
import InvoiceRowsTable, { newRow, type InvoiceRow } from '@/components/forms/InvoiceRowsTable'
import { fmtDate } from '@/utils'
import { useForm } from 'react-hook-form'
import type { Party, Product } from '@/types'

const LIMIT = 20

export default function ReceivePage() {
  const { error } = useUIStore()
  const [tab, setTab]     = useState('new')
  const [suppliers, setSuppliers] = useState<Party[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [list,   setList]   = useState<any[]>([])
  const [total,  setTotal]  = useState(0)
  const [page,   setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows]     = useState<InvoiceRow[]>([newRow()])
  const [saving, setSaving] = useState(false)
  const [flash, setFlash]   = useState<{ type: 'success'|'danger'; msg: string } | null>(null)

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { supplier_id: '', date: new Date().toISOString().split('T')[0], notes: '' },
  })

  useEffect(() => {
    partiesAPI.suppliers({ limit: 500 }).then(r => setSuppliers(r.data.data || [])).catch(() => {})
    productsAPI.list({ limit: 500 }).then(r => setProducts(r.data.data || [])).catch(() => {})
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const r = await receivesAPI.list({ page, limit: LIMIT })
      setList(r.data.data || []); setTotal(r.data.pagination?.total || 0)
    } catch (e: any) { error('Load failed', e.message) }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])

  const onSubmit = handleSubmit(async (data) => {
    const validRows = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!validRows.length) { setFlash({ type: 'danger', msg: 'Add at least one product' }); return }
    setSaving(true); setFlash(null)
    try {
      await receivesAPI.create({ ...data, items: validRows })
      setFlash({ type: 'success', msg: 'Stock received successfully' })
      reset(); setRows([newRow()])
    } catch (e: any) { setFlash({ type: 'danger', msg: e.message }) }
    finally { setSaving(false) }
  })

  const tabList = [
    { id: 'new', label: 'Receive Stock', icon: <FilePlus size={14}/> },
    { id: 'list', label: 'History', icon: <List size={14}/> },
  ]

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Receive Stock</h1></div>
      </div>
      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {tab === 'new' && (
        <div>
          {flash && <Alert type={flash.type === 'success' ? 'success' : 'danger'} message={flash.msg} onClose={() => setFlash(null)} />}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
            <div className="form-grid">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Supplier</label>
                <select className="erp-input" {...register('supplier_id')}>
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block mb-1.5">Date</label>
                <input type="date" className="erp-input" {...register('date')} />
              </div>
            </div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 shadow-card">
            <div className="font-bold text-sm mb-3">Items Received</div>
            <InvoiceRowsTable rows={rows} products={products} onChange={setRows} showCC={false} showDiscount={false} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="lg" loading={saving} onClick={onSubmit}>Receive Stock</Button>
          </div>
        </div>
      )}

      {tab === 'list' && (
        <div className="table-card">
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead><tr><th>Ref</th><th>Date</th><th>Supplier</th><th>Status</th></tr></thead>
              <tbody>
                {loading
                  ? <SkeletonRows cols={4} />
                  : list.length
                    ? list.map((r: any) => (
                        <tr key={r.id}>
                          <td className="td-mono text-brand">{r.reference_no || r.id?.slice(0,8)}</td>
                          <td className="td-mono">{fmtDate(r.date)}</td>
                          <td>{r.party_name || '—'}</td>
                          <td><Badge status={r.status || 'active'}/></td>
                        </tr>
                      ))
                    : <tr><td colSpan={4}><Empty message="No receive records"/></td></tr>
                }
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
