// Test double for '@/services/api' used by catalogSync tests. Mirrors the REAL server
// behaviour verified in erp-unified-backend: /stock/batches ignores page/limit and returns
// everything; /products and /parties/customers cap `limit` at 200 and honour `page`.
export const calls = { products: [] as any[], batches: [] as any[], customers: [] as any[] }
export const data = { batchCount: 600, productRows: 3 as number, ignoreProductPaging: false }
export function resetCatalogMock() {
  calls.products.length = 0; calls.batches.length = 0; calls.customers.length = 0
  data.batchCount = 600; data.productRows = 3; data.ignoreProductPaging = false
}
const mkBatches = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, product_id: `p${i % 10}`, batch_no: `B${i}`, qty_remaining: 5, qty_available: 5 }))
export const stockAPI = {
  batches: (params?: any) => { calls.batches.push(params); return Promise.resolve({ data: { success: true, data: mkBatches(data.batchCount) } }) },
}
export const productsAPI = {
  list: (params: any) => {
    calls.products.push(params)
    const page = data.ignoreProductPaging ? 1 : params.page
    const rows = page === 1 ? Array.from({ length: data.productRows }, (_, i) => ({ id: `p${i}`, name: `Prod ${i}`, item_code: `C${i}` })) : []
    return Promise.resolve({ data: { success: true, data: rows } })
  },
}
export const partiesAPI = {
  customers: (params: any) => { calls.customers.push(params); return Promise.resolve({ data: { success: true, data: [] } }) },
}
