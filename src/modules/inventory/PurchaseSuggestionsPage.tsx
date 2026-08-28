import { useMemo, useState } from 'react'
import {
  usePurchaseSuggestions, usePurchaseSuggestionSettings, useUpdatePurchaseSuggestionSettings,
  useCreatePurchaseOrdersFromSuggestions, useSuppliers,
} from '@/hooks/useQuery'
import { useDebounce } from '@/hooks/useDebounce'
import { Button, Modal, Badge, Pagination, SkeletonRows, Empty, SearchInput, Select, ToggleSwitch, Input } from '@/components/ui'
import { fmt } from '@/utils'
import type { PurchaseSuggestion, SuggestionStatus } from '@/types'
import {
  RefreshCw, Settings, AlertTriangle, PackageX, ShoppingCart, DollarSign,
  Minus, Plus, ChevronDown,
} from 'lucide-react'

const PERIOD_OPTIONS = [
  { value: '7',  label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '60', label: 'Last 60 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',                    label: 'Action Needed (default)' },
  { value: 'all',                 label: 'All Products' },
  { value: 'critical',            label: 'Critical' },
  { value: 'low_stock',           label: 'Low Stock' },
  { value: 'reorder_recommended', label: 'Reorder Recommended' },
  { value: 'healthy',             label: 'Healthy' },
  { value: 'no_sales_data',       label: 'No Sales Data' },
]

const STATUS_BADGE: Record<SuggestionStatus, string> = {
  critical:             'badge-red',
  low_stock:            'badge-amber',
  reorder_recommended:  'badge-purple',
  healthy:              'badge-green',
  no_sales_data:        'badge-muted',
}

function StatCardSimple({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a`, color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[var(--text-4)] uppercase tracking-wide truncate">{label}</div>
        <div className="text-lg font-bold text-[var(--text)]">{value}</div>
      </div>
    </div>
  )
}

function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-3)] active:bg-[var(--border)]"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-14 h-8 text-center text-sm font-semibold border-x border-[var(--border)] outline-none"
      />
      <button
        type="button"
        className="w-8 h-8 flex items-center justify-center text-[var(--text-3)] hover:bg-[var(--surface-3)] active:bg-[var(--border)]"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: settings, isLoading } = usePurchaseSuggestionSettings()
  const update = useUpdatePurchaseSuggestionSettings()
  const [form, setForm] = useState<any>(null)
  const effective = form || settings

  if (open && settings && !form) setForm({ ...settings })

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    await update.mutateAsync(form)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => { setForm(null); onClose() }}
      title="Purchase Suggestion Settings"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={update.isPending} onClick={save}>Save Settings</Button>
      </>}
    >
      {isLoading || !effective ? <SkeletonRows cols={1} rows={6} /> : (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Demand Settings</div>
            <div className="form-grid col2">
              <Select label="Default Sales History Period" value={String(effective.defaultPeriodDays)}
                onChange={(e) => set('defaultPeriodDays', Number(e.target.value))}
                options={[7, 30, 60, 90].map(d => ({ value: String(d), label: `${d} Days` }))} />
              <div className="flex items-end pb-1">
                <ToggleSwitch checked={effective.includeZeroSalesProducts} onChange={(v) => set('includeZeroSalesProducts', v)} label="Include zero-sales products" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Stock Settings</div>
            <div className="form-grid col2">
              <Input label="Default Supplier Lead Time (days)" type="number" min={0} value={effective.defaultLeadTimeDays}
                onChange={(e) => set('defaultLeadTimeDays', Number(e.target.value))} />
              <Input label="Safety Stock (days)" type="number" min={0} value={effective.safetyStockDays}
                onChange={(e) => set('safetyStockDays', Number(e.target.value))} />
              <Input label="Critical Stock Threshold (days remaining)" type="number" min={0} value={effective.criticalStockDays}
                onChange={(e) => set('criticalStockDays', Number(e.target.value))} />
              <Input label="Low Stock Threshold (days remaining)" type="number" min={0} value={effective.lowStockDays}
                onChange={(e) => set('lowStockDays', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-3)] mb-3">Calculation Settings</div>
            <div className="flex flex-col gap-3">
              <ToggleSwitch checked={effective.considerIncomingPurchaseOrders} onChange={(v) => set('considerIncomingPurchaseOrders', v)} label="Consider incoming purchase orders" />
              <ToggleSwitch checked={effective.considerReservedStock} onChange={(v) => set('considerReservedStock', v)} label="Consider reserved stock" />
              <ToggleSwitch checked={effective.useProductSpecificSettings} onChange={(v) => set('useProductSpecificSettings', v)} label="Use product-specific settings when available" />
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function PurchaseSuggestionsPage() {
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState('30')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState('')
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounce(searchRaw, 400)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({})

  const params = useMemo(() => ({
    page, limit: 20,
    period: period === 'custom' ? undefined : period,
    date_from: period === 'custom' ? dateFrom || undefined : undefined,
    date_to:   period === 'custom' ? dateTo   || undefined : undefined,
    supplier_id: supplierId || undefined,
    status: status || undefined,
    search: search || undefined,
  }), [page, period, dateFrom, dateTo, supplierId, status, search])

  const { data, isLoading, isFetching, refetch } = usePurchaseSuggestions(params)
  const { data: suppliersData } = useSuppliers({ limit: 200 })

  const rows: PurchaseSuggestion[] = (data?.data as any) || []
  const total = (data?.pagination as any)?.total || 0
  const summary = (data as any)?.summary || {}
  const suppliers = (suppliersData?.data as any[]) || []

  const createPOs = useCreatePurchaseOrdersFromSuggestions()

  const qtyFor = (r: PurchaseSuggestion) => qtyOverrides[r.product_id] ?? r.suggested_qty
  const setQty = (id: string, v: number) => setQtyOverrides((m) => ({ ...m, [id]: v }))

  const selectedIds = Object.keys(selected).filter((id) => selected[id])
  const selectedCount = selectedIds.length

  const toggleAll = () => {
    if (selectedCount === rows.length && rows.length > 0) setSelected({})
    else setSelected(Object.fromEntries(rows.map(r => [r.product_id, true])))
  }

  const handleCreatePOs = async () => {
    const items = rows
      .filter(r => selected[r.product_id])
      .map(r => ({
        product_id: r.product_id,
        qty: qtyFor(r),
        rate: r.latest_purchase_price || undefined,
        supplier_id: r.preferred_supplier_id || undefined,
      }))
      .filter(i => i.qty > 0)
    if (!items.length) return
    await createPOs.mutateAsync({ items })
    setSelected({})
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-breadcrumb">Inventory</div>
          <h1 className="page-title">Smart Purchase Suggestions</h1>
          <p className="text-xs text-[var(--text-4)] mt-1">Automatically calculated from sales history and current stock.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />} onClick={() => refetch()}>Refresh</Button>
          <Button variant="secondary" icon={<Settings size={14} />} onClick={() => setSettingsOpen(true)}>Settings</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCardSimple label="Products to Purchase" value={String(summary.products_to_purchase || 0)} color="var(--brand)" icon={<ShoppingCart size={16} strokeWidth={1.8} />} />
        <StatCardSimple label="Critical Products" value={String(summary.critical_products || 0)} color="var(--red)" icon={<AlertTriangle size={16} strokeWidth={1.8} />} />
        <StatCardSimple label="Total Suggested Qty" value={fmt(summary.total_suggested_qty)} color="var(--teal)" icon={<PackageX size={16} strokeWidth={1.8} />} />
        <StatCardSimple label="Estimated Purchase Value" value={fmt(summary.total_estimated_value)} color="var(--purple)" icon={<DollarSign size={16} strokeWidth={1.8} />} />
      </div>

      {/* Filters */}
      <div className="table-card mb-0" style={{ padding: 12 }}>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1) }} options={PERIOD_OPTIONS} className="w-auto min-w-[150px]" />
          {period === 'custom' && (
            <>
              <input type="date" className="erp-input w-auto" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
              <input type="date" className="erp-input w-auto" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
            </>
          )}
          <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(1) }} placeholder="All Suppliers"
            options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} className="w-auto min-w-[150px]" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUS_OPTIONS} className="w-auto min-w-[190px]" />
          <select className="erp-input w-auto opacity-60 cursor-not-allowed" disabled title="This business currently uses a single stock location">
            <option>All Locations</option>
          </select>
          <SearchInput value={searchRaw} onChange={(v) => { setSearchRaw(v); setPage(1) }} className="w-56 ml-auto" />
        </div>
      </div>

      {/* Selection bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between bg-[var(--brand)]/10 border border-[var(--brand)]/30 rounded-xl px-4 py-2.5 my-3">
          <span className="text-sm font-semibold text-[var(--text)]">{selectedCount} Product{selectedCount > 1 ? 's' : ''} Selected</span>
          <Button variant="primary" size="sm" loading={createPOs.isPending} onClick={handleCreatePOs}>Create Purchase Order</Button>
        </div>
      )}

      {/* Desktop table */}
      <div className="table-card mt-3 hidden md:block">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={rows.length > 0 && selectedCount === rows.length} onChange={toggleAll} />
                </th>
                <th>Product</th>
                <th className="td-right">Current Stock</th>
                <th className="td-right">Avg Daily Sales</th>
                <th className="td-right">Days Remaining</th>
                <th className="td-right">Incoming</th>
                <th className="td-right">Suggested Qty</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={9} /> : rows.length ? rows.map((r) => (
                <tr key={r.product_id}>
                  <td><input type="checkbox" checked={!!selected[r.product_id]} onChange={(e) => setSelected((m) => ({ ...m, [r.product_id]: e.target.checked }))} /></td>
                  <td>
                    <div className="font-semibold text-sm">{r.name}</div>
                    <div className="text-xs text-[var(--text-4)]">{r.item_code}</div>
                  </td>
                  <td className="td-right">{fmt(r.current_stock)} {r.unit}</td>
                  <td className="td-right">{fmt(r.avg_daily_sales)}/day</td>
                  <td className="td-right">{r.days_remaining === null ? <span className="text-[var(--text-4)]">No recent sales</span> : `${r.days_remaining}d`}</td>
                  <td className="td-right">{fmt(r.incoming_stock)}</td>
                  <td className="td-right"><QtyStepper value={qtyFor(r)} onChange={(v) => setQty(r.product_id, v)} /></td>
                  <td className="text-xs">{r.preferred_supplier_name || <span className="text-[var(--text-4)]">—</span>}</td>
                  <td><Badge className={STATUS_BADGE[r.status]}>{r.status_label}</Badge></td>
                </tr>
              )) : <tr><td colSpan={9}><Empty message="No products need purchasing right now" /></td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      {/* Mobile / tablet cards */}
      <div className="block md:hidden space-y-3 mt-3">
        {isLoading ? (
          <div className="text-center py-8 text-sm text-[var(--text-4)]">Loading…</div>
        ) : rows.length ? rows.map((r) => (
          <div key={r.product_id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-start gap-2 min-w-0">
                <input type="checkbox" className="mt-1" checked={!!selected[r.product_id]} onChange={(e) => setSelected((m) => ({ ...m, [r.product_id]: e.target.checked }))} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-1">
                    {r.status === 'critical' && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
                    {r.name}
                  </div>
                  <div className="text-xs text-[var(--text-4)]">SKU: {r.item_code}</div>
                </div>
              </div>
              <Badge className={STATUS_BADGE[r.status]}>{r.status_label}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2 text-center">
              <div className="bg-[var(--surface-3)] rounded-lg py-1.5">
                <div className="text-[10px] text-[var(--text-4)] uppercase">Stock</div>
                <div className="text-sm font-bold">{fmt(r.current_stock)}</div>
              </div>
              <div className="bg-[var(--surface-3)] rounded-lg py-1.5">
                <div className="text-[10px] text-[var(--text-4)] uppercase">Avg Sale</div>
                <div className="text-sm font-bold">{fmt(r.avg_daily_sales)}/d</div>
              </div>
              <div className="bg-[var(--surface-3)] rounded-lg py-1.5">
                <div className="text-[10px] text-[var(--text-4)] uppercase">Days Left</div>
                <div className="text-sm font-bold">{r.days_remaining === null ? '—' : r.days_remaining}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] mb-2">
              <span>Incoming: <b>{fmt(r.incoming_stock)}</b></span>
              <span>Supplier: <b>{r.preferred_supplier_name || '—'}</b></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-3)]">Suggested</span>
              <QtyStepper value={qtyFor(r)} onChange={(v) => setQty(r.product_id, v)} />
            </div>
          </div>
        )) : <Empty message="No products need purchasing right now" />}
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
