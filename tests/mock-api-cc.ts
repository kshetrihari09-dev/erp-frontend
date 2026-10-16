// Test double for '@/services/api' used by the Customer vs Company page test.
export const reqs: { get: any[]; search: (string | undefined)[] } = { get: [], search: [] }
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
const CUSTOMERS = [{ id: 'c1', code: 'D1', name: 'Delta Medical' }, { id: 'c2', code: 'E2', name: 'Echo Pharma' }]
export const customerCompanyAPI = {
  customers: (search?: string) => { reqs.search.push(search); return ok(CUSTOMERS.filter(c => !search || (c.name + c.code).toLowerCase().includes(search.toLowerCase()))) },
  get: (p: any) => { reqs.get.push(p); const empty = p.customer_id === 'c2'
    return ok({ title: 'Customer vs Company', customer: CUSTOMERS.find(c => c.id === p.customer_id), filters: p,
      rows: empty ? [] : [
        { company: 'Cipla', sales: 1030, discount: 115, sales_return: 270, sales_return_expiry: 0, net: 645 },
        { company: 'Sun', sales: 1000, discount: 0, sales_return: 0, sales_return_expiry: 200, net: 800 }],
      totals: empty ? { sales: 0, discount: 0, sales_return: 0, sales_return_expiry: 0, net: 0 } : { sales: 2030, discount: 115, sales_return: 270, sales_return_expiry: 200, net: 1445 },
      ledger: { opening_balance: 1000, receipts: 0, closing_balance: 3015 } }) },
  exportCsv: () => Promise.resolve({ data: new Blob(['x']) }),
}
