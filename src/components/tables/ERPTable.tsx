import { useState, useMemo } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { cn, downloadCSV } from '@/utils'
import { SearchInput, Pagination, SkeletonRows, Empty } from '@/components/ui'

interface ERPTableProps<T extends object> {
  data:         T[]
  columns:      ColumnDef<T, any>[]
  isLoading?:   boolean
  total?:       number
  page?:        number
  pageSize?:    number
  onPageChange?:(p: number) => void
  onRowClick?:  (row: T) => void
  searchable?:  boolean
  exportable?:  boolean
  exportName?:  string
  emptyMessage?:string
  toolbar?:     React.ReactNode
  footer?:      React.ReactNode
}

export default function ERPTable<T extends object>({
  data, columns, isLoading, total, page = 1, pageSize = 20,
  onPageChange, onRowClick, searchable, exportable, exportName = 'export',
  emptyMessage, toolbar, footer,
}: ERPTableProps<T>) {
  const [sorting, setSorting]       = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state:                  { sorting, globalFilter },
    onSortingChange:        setSorting,
    onGlobalFilterChange:   setGlobalFilter,
    getCoreRowModel:        getCoreRowModel(),
    getSortedRowModel:      getSortedRowModel(),
    getFilteredRowModel:    getFilteredRowModel(),
    manualPagination:       !!onPageChange,
  })

  const rows = table.getRowModel().rows

  return (
    <div className="table-card">
      {/* Toolbar */}
      {(searchable || exportable || toolbar) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 flex-1">
            {searchable && (
              <SearchInput
                value={globalFilter}
                onChange={setGlobalFilter}
                className="w-56"
                placeholder="Search…"
              />
            )}
            {toolbar}
          </div>
          {exportable && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => downloadCSV(data as Record<string, unknown>[], exportName)}
            >
              <Download size={13}/> Export CSV
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-[var(--text-4)]">
                          {header.column.getIsSorted() === 'asc'  ? <ArrowUp size={11}/> :
                           header.column.getIsSorted() === 'desc' ? <ArrowDown size={11}/> :
                           <ArrowUpDown size={11} opacity={.4}/>}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? <SkeletonRows cols={columns.length} rows={6} />
              : rows.length
                ? rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(onRowClick && 'clickable')}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                : <tr>
                    <td colSpan={columns.length}>
                      <Empty message={emptyMessage || 'No records found'} />
                    </td>
                  </tr>
            }
          </tbody>
        </table>
      </div>

      {footer}

      {/* Pagination */}
      {onPageChange && total !== undefined && (
        <Pagination page={page} total={total} limit={pageSize} onChange={onPageChange} />
      )}
    </div>
  )
}
