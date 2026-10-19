// Test double for '@/services/api' used by the Purchase Return page test.
export const calls: { bills: any[]; bill: string[]; preview: any[]; create: any[]; list: any[]; detail: string[] } =
  { bills: [], bill: [], preview: [], create: [], list: [], detail: [] }
export const state = { refundable: 0, createDelayMs: 40, createFails: '' as string, listRows: [] as any[], listTotal: 0 }
const ok = (data: any, extra: any = {}) => Promise.resolve({ data: { success: true, data, ...extra } })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const BILL = {
  id: 'pur-1', bill_no: 'PB-0001', supplier_bill_no: 'SUP-77', date_ad: '2026-06-01', payment_mode: 'credit', payment_status: 'unpaid',
  net_total: 1400, paid_amount: 0, due_amount: 1400, prior_credit: 180, returnable_value: 1220, supplier_balance: 1400,
  party: { id: 's1', name: 'Alpha Pharma', phone: '9811111111' },
  previous_returns: [{ id: 'r0', return_no: 'DN-0000', return_date: '2026-06-02', net_credit: 180, settlement: 'adjust' }],
  items: [
    // 8 still returnable on the bill, but only 3 left in stock (5 already sold) → cap is 3
    { id: 'l1', product_id: 'p1', product_name: 'Paracetamol 500', batch_no: 'B1', expiry: '12/2028', expiry_date: '2028-12-31', purchased_qty: 10, bonus_qty: 0, returned_qty: 2,
      remaining_qty: 8, stock_available: 3, max_returnable_now: 3, batch_missing: false, rate: 100, discount_pct: 10, cc_amount: 0, line_amount: 900, unit_credit: 90, expired: false },
    { id: 'l2', product_id: 'p2', product_name: 'Amoxicillin 250', batch_no: 'B9', expiry: '01/2020', expiry_date: '2020-01-31', purchased_qty: 5, bonus_qty: 0, returned_qty: 0,
      remaining_qty: 5, stock_available: 5, max_returnable_now: 5, batch_missing: false, rate: 100, discount_pct: 0, cc_amount: 0, line_amount: 500, unit_credit: 100, expired: true },
  ],
}
const unit: Record<string, number> = { l1: 90, l2: 100 }

export const partiesAPI = { suppliers: (p: any) => ok([{ id: 's1', name: 'Alpha Pharma', phone: '9811111111' }].filter(c => !p?.search || c.name.toLowerCase().includes(String(p.search).toLowerCase()))) }
export const purchaseReturnsAPI = {
  bills: (p: any) => { calls.bills.push(p); return ok([{ id: 'pur-1', bill_no: 'PB-0001', supplier_bill_no: 'SUP-77', date_ad: '2026-06-01', party_id: 's1', party_name: 'Alpha Pharma', net_total: 1400,
    payment_status: 'unpaid', payment_mode: 'credit', purchased_qty: 15, returned_qty: 2, returnable_qty: 13, returnable_value: 1220 }], { pagination: { total: 1, page: 1, limit: 8 } }) },
  bill: (id: string) => { calls.bill.push(id); return ok(BILL) },
  preview: (body: any) => {
    calls.preview.push(body)
    const lines = body.items.map((i: any) => ({ purchase_item_id: i.purchase_item_id, qty: i.qty, gross: i.qty * 100, discount: i.qty * 100 - i.qty * unit[i.purchase_item_id], net: i.qty * unit[i.purchase_item_id] }))
    const net = lines.reduce((s: number, l: any) => s + l.net, 0)
    return ok({ totals: { goods: lines.reduce((s: number, l: any) => s + l.gross, 0), discount: lines.reduce((s: number, l: any) => s + l.discount, 0), cc: 0, tax: 0, round_off: 0, net_credit: net, completes_invoice: false },
      lines, supplier_balance: 1400, refundable: state.refundable, bill_due: 1400, applied_if_adjusted: Math.min(net, 1400) })
  },
  create: async (body: any) => {
    calls.create.push(body); await sleep(state.createDelayMs)
    if (state.createFails) return Promise.reject({ response: { data: { message: state.createFails, code: 'INSUFFICIENT_BATCH_STOCK' } } })
    const items = body.items.map((i: any, n: number) => ({ id: `ri${n}`, product_name: i.purchase_item_id === 'l1' ? 'Paracetamol 500' : 'Amoxicillin 250', batch_no: i.purchase_item_id === 'l1' ? 'B1' : 'B9', expiry: '', qty: i.qty,
      rate: 100, discount_pct: i.purchase_item_id === 'l1' ? 10 : 0, gross_amount: i.qty * 100, discount_amount: i.qty * 100 - i.qty * unit[i.purchase_item_id], net_amount: i.qty * unit[i.purchase_item_id] }))
    const net = items.reduce((s: number, i: any) => s + i.net_amount, 0)
    return ok({ id: 'pret-1', return_no: 'DN-2026-00001', return_date: body.date_ad, bill_no: 'PB-0001', party_name: 'Alpha Pharma', goods_amount: items.reduce((s: number, i: any) => s + i.gross_amount, 0),
      discount_amount: items.reduce((s: number, i: any) => s + i.discount_amount, 0), cc_amount: 0, tax_amount: 0, round_off: 0, net_credit: net, applied_to_bill: net, supplier_credit: 0,
      refund_amount: 0, settlement: body.settlement, items })
  },
  list: (p: any) => { calls.list.push(p); return ok(state.listRows, { pagination: { total: state.listTotal || state.listRows.length, page: p.page, limit: p.limit } }) },
  detail: (id: string) => { calls.detail.push(id); return Promise.reject({ response: { status: 404, data: { message: 'n/a' } } }) },
}
