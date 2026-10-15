// Test double for '@/services/api' used by the Ledger page test.
export const ledgerRequests: any[] = []
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
export const partiesAPI = {
  customers: () => ok([{ id: 'p1', name: 'Alpha Pharma', phone: '', pan_no: '' }]),
  suppliers: () => ok([]),
  ledger: (id: string, params: any) => { ledgerRequests.push({ id, ...params }); return ok({ party: { name: 'Alpha Pharma' }, opening_balance: 0, closing_balance: 100,
    rows: [{ id: 'r1', date: params.date_from, voucher_no: 'V1', transaction_type: 'SALES', debit: 100, credit: 0, running_balance: 100, narration: `from ${params.date_from}` }] }) },
}
export const accountingAPI = { accounts: () => ok([]), ledger: () => ok({ rows: [] }) }
