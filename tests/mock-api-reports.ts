// Test double for '@/services/api' used by the Reports page test.
export const reportReqs: { kind: string; params: any }[] = []
const ok = (data: any) => Promise.resolve({ data: { success: true, data } })
export const reportsAPI = {
  sales:      (params: any) => { reportReqs.push({ kind: 'sales', params });      return ok([{ id: 's1', invoice_no: `INV-${params.date_from}`, party_name: 'Alpha', net_total: 100, status: 'active' }]) },
  purchases:  (params: any) => { reportReqs.push({ kind: 'purchases', params });  return ok([{ id: 'p1', bill_no: `PB-${params.date_from}`, party_name: 'Sun', net_total: 50, due_amount: 0, status: 'active' }]) },
  profitLoss: (params: any) => { reportReqs.push({ kind: 'pnl', params });        return ok({ income: { rows: [], total: 10 }, expense: { rows: [], total: 4 }, net_profit: 6, date_from: params.date_from, date_to: params.date_to }) },
  stock: () => ok([]), expiry: () => ok([]), partyBalance: () => ok([]), partyBalances: () => ok([]),
}
