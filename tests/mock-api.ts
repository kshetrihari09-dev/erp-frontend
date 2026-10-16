// Test double for '@/services/api' — records every report request.
export const requests: any[] = []
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
export const companyCustomerAPI = {
  get: (params: any) => { requests.push(params); return ok({
    title: 'Company vs Customer', filters: { from: params.from, to: params.to, company: params.company, customer_type: params.customer_type },
    rows: [{ customer_id: 'c1', customer_code: 'C001', customer_name: `Alpha ${params.from}`, customer_type: 'customer', opening_balance: 11000, sales: 2000, discount: 100, sales_return: 470, sales_return_expiry: 0, net: 1430, receipts: 600, ledger_movement: -100, closing_balance: 10900 }],
    totals: { opening_balance: 11000, sales: 2000, discount: 100, sales_return: 470, sales_return_expiry: 0, net: 1430, receipts: 600, ledger_movement: -100, closing_balance: 10900 } }) },
  companies: () => ok(['Cipla', 'Sun']),
  exportCsv: () => Promise.resolve({ data: new Blob(['x']) }),
}
export const productsAPI = {}; export const stockRegisterAPI = {}
