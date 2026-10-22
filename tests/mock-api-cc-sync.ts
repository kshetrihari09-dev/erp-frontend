// Test double for '@/services/api' used by the CC% sync test (Sales + Purchase pages).
// Product rows are shaped like the REAL API: DECIMAL columns arrive as strings ("5.00").
export const PRODUCTS: any[] = [
  { id: 'p0',  name: 'Zero CC Tab',  item_code: 'Z0',  barcode: '1000', unit: 'Strip', sales_rate: '100.00', purchase_rate: '80.00',  mrp: '120.00', vat_percent: 13, cc_pct: '0.00',  current_stock: 500, is_active: true, company_name: 'Acme' },
  { id: 'p5',  name: 'Five CC Tab',  item_code: 'F5',  barcode: '1005', unit: 'Strip', sales_rate: '200.00', purchase_rate: '150.00', mrp: '250.00', vat_percent: 13, cc_pct: '5.00',  current_stock: 500, is_active: true, company_name: 'Acme' },
  { id: 'p10', name: 'Ten CC Tab',   item_code: 'T10', barcode: '1010', unit: 'Strip', sales_rate: '300.00', purchase_rate: '240.00', mrp: '360.00', vat_percent: 13, cc_pct: '10.00', current_stock: 500, is_active: true, company_name: 'Acme' },
]
export const calls: { salesCreate: any[]; purchaseCreate: any[]; search: string[] } = { salesCreate: [], purchaseCreate: [], search: [] }
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
const generic = (): any => new Proxy({}, { get: () => () => ok([]) })

export const productsAPI = {
  list:   (_p?: any) => ok(PRODUCTS),
  search: (q: string) => { calls.search.push(q); return ok(PRODUCTS.filter(p => p.name.toLowerCase().includes(String(q).toLowerCase()))) },
  get:    (id: string) => ok(PRODUCTS.find(p => p.id === id)),
}
export const partiesAPI = {
  customers: () => ok([{ id: 'c1', code: 'C1', name: 'ABC Traders', type: 'customer', current_balance: 0 }]),
  suppliers: () => ok([{ id: 's1', code: 'S1', name: 'Alpha Pharma', type: 'supplier', current_balance: 0 }]),
}
export const salesAPI = {
  list: () => ok([]), get: () => ok(null),
  create: (payload: any) => { calls.salesCreate.push(payload); return ok({ id: 'sale-1', invoice_no: 'SI-1', total_amount: 0, cc_amount: 0, items: payload.items }) },
}
export const purchasesAPI = {
  list: () => ok([]), get: () => ok(null),
  create: (payload: any) => { calls.purchaseCreate.push(payload); return ok({ id: 'pur-1', purchase_no: 'PI-1', total_amount: 0, cc_amount: 0, items: payload.items }) },
}
export const stockAPI = { batches: () => ok([]) }
export const scannerAPI = { lookup: () => ok(null) }
export const accountingAPI = generic()
export const approvalsAPI = generic()
export const authAPI = generic()
export const cloudStorageAPI = generic()
export const companiesAPI = generic()
export const companyCustomerAPI = generic()
export const creditRiskAPI = generic()
export const customerCompanyAPI = generic()
export const dateAPI = generic()
export const devicesAPI = generic()
export const notificationsAPI = generic()
export const purchaseOrdersAPI = generic()
export const purchaseReturnsAPI = generic()
export const purchaseScansAPI = generic()
export const purchaseSuggestionsAPI = generic()
export const remindersAPI = generic()
export const reportsAPI = generic()
export const returnsAPI = generic()
export const salesReturnsAPI = generic()
export const settingsAPI = generic()
export const stockRegisterAPI = generic()
export const stockSummaryAPI = generic()
