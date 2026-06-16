import { useState } from 'react'
import { useStock, useBatches } from '@/hooks/useQuery'
import { Tabs, StatCard, Pagination, SkeletonRows, Empty, SearchInput } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { fmt, fmtDate } from '@/utils'
import { Package, AlertTriangle, DollarSign } from 'lucide-react'

export default function StockPage() {
  const [tab, setTab]      = useState('overview')
  const [page, setPage]    = useState(1)
  const [searchRaw, setSearch] = useState('')
  const search = useDebounce(searchRaw, 400)

  const { data: stockData, isLoading } = useStock({ page, limit: 30, search: search || undefined })
  const { data: batches }              = useBatches()

  const rows  = (stockData?.data  as any[]) || []
  const total = (stockData?.pagination as any)?.total || 0
  const summary = (stockData as any)?.summary || {}

  const tabList = [
    { id: 'overview', label: 'Stock Overview' },
    { id: 'batches',  label: 'Batch Details' },
  ]

  return (
    <div>
      <div className="page-header">
        <div><div className="page-breadcrumb">Inventory</div><h1 className="page-title">Stock Report</h1></div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Stock Value" value={fmt(summary.total_value)} color="var(--purple)" icon={<DollarSign size={20} strokeWidth={1.8}/>} />
        <StatCard label="Low Stock Items"   value={String(summary.low_stock_count || 0)} color="var(--red)"    icon={<AlertTriangle size={20} strokeWidth={1.8}/>} />
        <StatCard label="Total Products"    value={String(total)}                         color="var(--teal)"   icon={<Package size={20} strokeWidth={1.8}/>} />
      </div>

      <Tabs tabs={tabList} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <SearchInput value={searchRaw} onChange={setSearch} className="w-64" />
          </div>
          <div className="table-card">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead><tr><th>Code</th><th>Product</th><th>Unit</th><th className="td-right">Stock</th><th className="td-right">Min</th><th className="td-right">P.Rate</th><th className="td-right">S.Rate</th><th className="td-right">Value</th><th>Status</th></tr></thead>
                <tbody>
                  {isLoading
                    ? <SkeletonRows cols={9} />
                    : rows.length
                      ? rows.map((p: any) => (
                          <tr key={p.id}>
                            <td className="td-mono text-brand">{p.item_code}</td>
                            <td>
                              <div className="font-semibold text-sm">{p.name}</div>
                              {p.company_name && <div className="text-xs text-[var(--text-4)]">{p.company_name}</div>}
                            </td>
                            <td><span className="badge badge-muted">{p.unit}</span></td>
                            <td className={`td-right font-semibold ${p.low_stock ? 'text-red-600' : ''}`}>{p.current_stock}</td>
                            <td className="td-right">{p.min_stock}</td>
                            <td className="td-right">{fmt(p.purchase_rate)}</td>
                            <td className="td-right">{fmt(p.sales_rate)}</td>
                            <td className="td-right font-semibold">{fmt(p.stock_value)}</td>
                            <td>
                              {p.low_stock
                                ? <span className="badge badge-red">⚠ Low</span>
                                : <span className="badge badge-green">OK</span>
                              }
                            </td>
                          </tr>
                        ))
                      : <tr><td colSpan={9}><Empty message="No stock data"/></td></tr>
                  }
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={30} onChange={setPage} />
          </div>
        </>
      )}

      {tab === 'batches' && (
        <div className="table-card">
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead><tr><th>Product</th><th>Code</th><th>Batch</th><th>Expiry</th><th className="td-right">Qty</th><th className="td-right">P.Rate</th><th className="td-right">S.Rate</th></tr></thead>
              <tbody>
                {((batches as any[]) || []).length
                  ? ((batches as any[]) || []).map((b: any, i: number) => {
                      const daysLeft = b.expiry_date ? Math.round((new Date(b.expiry_date).getTime() - Date.now()) / 86400000) : null
                      const nearExpiry = daysLeft !== null && daysLeft < 30
                      return (
                        <tr key={i}>
                          <td className="font-medium">{b.product_name}</td>
                          <td className="td-mono text-brand">{b.item_code}</td>
                          <td className="td-mono">{b.batch_no || '—'}</td>
                          <td className={`td-mono ${nearExpiry ? 'text-red-600 font-semibold' : ''}`}>
                            {b.expiry || '—'}
                            {nearExpiry && <span className="ml-1 text-[10px]">⚠</span>}
                          </td>
                          <td className="td-right">{b.qty_available}</td>
                          <td className="td-right">{fmt(b.purchase_rate)}</td>
                          <td className="td-right">{fmt(b.sales_rate)}</td>
                        </tr>
                      )
                    })
                  : <tr><td colSpan={7}><Empty message="No batch data"/></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
