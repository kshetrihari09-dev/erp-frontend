import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchInput, Empty, Pagination } from '@/components/ui'
import { useCustomerProducts, useCustomerCategories, useActiveCart } from '@/hooks/useCustomerQuery'
import CustomerProductCard, { CustomerProductCardSkeleton } from './CustomerProductCard'

/** Standard debounce — search-as-you-type without a request per keystroke
 *  (spec #19/#7's explicit requirement). */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function CustomerHomePage() {
  // Read once on mount so the product-detail page's breadcrumb category
  // link (?category=X) actually lands on a pre-filtered grid, rather than
  // being a dead label — category filtering itself is unchanged, this
  // just seeds its initial state from the URL.
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(() => params.get('category') || '')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search, 350)

  useEffect(() => { setPage(1) }, [debouncedSearch, category])

  const { data: categories } = useCustomerCategories()
  const { data, isLoading, isError, refetch } = useCustomerProducts({
    search: debouncedSearch || undefined, category: category || undefined, page, limit: 24,
  })
  const { data: cart } = useActiveCart()

  const cartMap = useMemo(() => {
    const m = new Map<string, { cart_item_id: string | null; quantity: number }>()
    for (const item of cart?.items || []) m.set(item.product_id, { cart_item_id: item.cart_item_id, quantity: item.quantity })
    return m
  }, [cart])

  return (
    <div>
      <div className="p-3 pb-0">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products…" />
      </div>

      {!!categories?.length && (
        <div className="customer-category-scroll">
          <button
            onClick={() => setCategory('')}
            className={`customer-category-chip ${!category ? 'customer-category-chip--active' : ''}`}
          >All</button>
          {categories.map((c: string) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`customer-category-chip ${category === c ? 'customer-category-chip--active' : ''}`}
            >{c}</button>
          ))}
        </div>
      )}

      {isLoading ? (
        // Skeleton cards in the real grid (spec §21) — same layout the
        // actual cards will occupy, so there's no empty-white-card flash
        // and no layout shift once data arrives.
        <div className="customer-grid">
          {Array.from({ length: 12 }).map((_, i) => <CustomerProductCardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm text-[var(--text-3)]">Something went wrong.</p>
          <button onClick={() => refetch()} className="text-sm font-semibold text-brand">Try Again</button>
        </div>
      ) : !data?.data?.length ? (
        <Empty icon="🛒" message={search || category ? 'No products found.' : 'No online products available yet.'} />
      ) : (
        <>
          <div className="customer-grid">
            {data.data.map((p: any) => (
              <CustomerProductCard key={p.id} product={p} cartItem={cartMap.get(p.id)} />
            ))}
          </div>
          {data.pagination && (
            <Pagination page={data.pagination.page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />
          )}
        </>
      )}
    </div>
  )
}
