// Test double for '@/services/api' used by the Sales Return page test (auto-linked flow: customer + products, no bill).
export const calls: { preview: any[]; create: any[]; list: any[]; detail: string[]; customers: any[] } = { preview: [], create: [], list: [], detail: [], customers: [] }
export const state = { refundable: 0, createDelayMs: 40, createFails: '' as string, listRows: [] as any[], listTotal: 0 }
const ok = (data: any, extra: any = {}) => Promise.resolve({ data: { success: true, data, ...extra } })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// product → { name, historical net unit credit, returnable }; p1 has two batches (latest invoice first), p9 was never bought
const P: Record<string, { name: string; unit: number; rate: number; disc: number; left: number }> = {
  p1: { name: 'Paracetamol 500', unit: 90, rate: 100, disc: 10, left: 8 },
  p2: { name: 'Amoxicillin 250', unit: 100, rate: 100, disc: 0, left: 5 },
  p9: { name: 'Never Bought', unit: 0, rate: 0, disc: 0, left: 0 },
}
const alloc = (id: string, qty: number, batch?: string) => {
  const p = P[id]
  const b = batch || (id === 'p1' ? 'B1' : 'B9')
  return [{ sale_id: 'sale-1', invoice_no: 'INV-0001', invoice_date: '2026-06-01', sale_item_id: 'l-' + id, batch_no: b, expiry: '12/2028', expiry_date: '2028-12-31', expired: id === 'p2', qty,
    gross: qty * p.rate, discount: qty * p.rate - qty * p.unit, cc: 0, tax: 0, net: qty * p.unit }]
}
export const customersList = [{ id: 'c1', name: 'ABC Traders', phone: '9800000000', address: 'Kathmandu', pan_no: '123456', code: 'C-001' }]
export const partiesAPI = { customers: (p: any) => { calls.customers.push(p); return ok(customersList) } }
export const salesReturnsAPI = {
  preview: (body: any) => {
    calls.preview.push(body)
    const lines = body.lines.map((l: any, index: number) => {
      const p = P[l.product_id]
      const batches = l.product_id === 'p1' ? [{ batch_no: 'B1', expiry: '12/2028', expiry_date: '2028-12-31', returnable_qty: 5 }, { batch_no: 'B0', expiry: '10/2028', expiry_date: '2028-10-31', returnable_qty: 3 }] : []
      if (l.qty > p.left) return { index, product_id: l.product_id, product_name: p.name, requested_qty: l.qty, batch_no: l.batch_no || null, available_qty: p.left, batches, ok: false,
        error: { code: p.left ? 'EXCEEDS_RETURNABLE' : 'NOT_RETURNABLE', message: p.left ? `Cannot return ${l.qty} of "${p.name}" — this customer has only ${p.left} still returnable.` : `No returnable sale of "${p.name}" was found for this customer.` },
        gross: 0, discount: 0, cc: 0, tax: 0, net: 0, rate: 0, discount_pct: 0, allocations: [] }
      return { index, product_id: l.product_id, product_name: p.name, requested_qty: l.qty, batch_no: l.batch_no || null, available_qty: p.left, batches, ok: true, error: null,
        gross: l.qty * p.rate, discount: l.qty * (p.rate - p.unit), cc: 0, tax: 0, net: l.qty * p.unit, rate: p.rate, discount_pct: p.disc, allocations: alloc(l.product_id, l.qty, l.batch_no) }
    })
    const good = lines.filter((l: any) => l.ok)
    const net = good.reduce((s: number, l: any) => s + l.net, 0)
    return ok({ mode: 'auto', lines, has_errors: good.length !== lines.length,
      totals: good.length ? { goods: good.reduce((s: number, l: any) => s + l.gross, 0), discount: good.reduce((s: number, l: any) => s + l.discount, 0), cc: 0, tax: 0, line_net: net, round_off: 0, net_credit: net } : null,
      returns: good.length ? [{ sale_id: 'sale-1', invoice_no: 'INV-0001', invoice_date: '2026-06-01', net_credit: net }] : [],
      customer_balance: 1400, refundable: state.refundable, invoice_due: 1400, applied_if_adjusted: Math.min(net, 1400) })
  },
  create: async (body: any) => {
    calls.create.push(body); await sleep(state.createDelayMs)
    if (state.createFails) return Promise.reject({ response: { data: { message: state.createFails, code: 'EXCEEDS_RETURNABLE' } } })
    const items = body.lines.map((l: any, n: number) => { const p = P[l.product_id]
      return { id: `ri${n}`, product_name: p.name, batch_no: l.product_id === 'p1' ? 'B1' : 'B9', expiry: '', qty: l.qty, rate: p.rate, discount_pct: p.disc,
        gross_amount: l.qty * p.rate, discount_amount: l.qty * (p.rate - p.unit), net_amount: l.qty * p.unit, invoice_no: 'INV-0001' } })
    const net = items.reduce((s: number, i: any) => s + i.net_amount, 0)
    return ok({ id: 'ret-1', return_no: 'CN-2026-00001', return_date: body.date_ad, invoice_no: 'INV-0001', party_name: 'ABC Traders',
      goods_amount: items.reduce((s: number, i: any) => s + i.gross_amount, 0), discount_amount: items.reduce((s: number, i: any) => s + i.discount_amount, 0),
      cc_amount: 0, tax_amount: 0, round_off: 0, net_credit: net, applied_to_invoice: net, customer_credit: 0, refund_amount: 0, settlement: body.settlement, items })
  },
  list: (p: any) => { calls.list.push(p); return ok(state.listRows, { pagination: { total: state.listTotal || state.listRows.length, page: p.page, limit: p.limit } }) },
  detail: (id: string) => { calls.detail.push(id); return Promise.reject({ response: { status: 404, data: { message: 'n/a' } } }) },
}
// the return forms now check the transaction date against the company's fiscal years
export const settingsAPI = { fiscalYears: () => ok([]) }
