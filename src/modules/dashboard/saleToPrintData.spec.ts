import { describe, it, expect } from 'vitest'
import { saleToPrintData } from './saleToPrintData'

// A saved sale as GET /sales/:id returns it. Item `amount` is NET of discount and INCLUDES the C.C charge; `subtotal` is net.
const SALE = {
  id: 's1', invoice_no: 'INV-0042', date_ad: '2026-05-05', payment_mode: 'credit', created_at: '2026-05-05T10:15:00Z',
  party_id: 'p1', party_name: 'Delta Medical', party_code: 'C001', party_address: 'Butwal-8', party_phone: '9800000000', party_pan: '600123',
  subtotal: 1155, cc_amount: 5, round_off: -0.4, net_total: 1154.6, paid_amount: 154.6, due_amount: 1000,
  items: [
    { product_id: 'a', product_name: 'Paracetamol 500', batch_no: 'B1', expiry: '2027-01', qty: 10, bonus: 2, rate: 100, discount_pct: 10, cc_pct: 0, cc_amount: 0, amount: 900, mrp: 120 },
    { product_id: 'b', product_name: 'Amoxil', batch_no: 'B2', expiry: '2027-03', qty: 5, bonus: 1, rate: 50, discount_pct: 0, cc_pct: 10, cc_amount: 5, amount: 255, mrp: null },
  ],
}

describe('saleToPrintData — saved invoice → PrintData (same mapping as SalesPage reprint)', () => {
  const d = saleToPrintData(SALE)

  it('header fields', () => {
    expect(d).toMatchObject({ voucherNo: 'INV-0042', type: 'SALE', date: '2026-05-05', paymentMode: 'credit', partyName: 'Delta Medical' })
    expect(d.extra).toMatchObject({ partyCode: 'C001', partyAddress: 'Butwal-8', partyPhone: '9800000000', partyPan: '600123', issuedAt: '2026-05-05T10:15:00Z' })
  })
  it('lines: names, qty, bonus, rate, discount %, C.C, with the display amount = qty × rate', () => {
    expect(d.items![0]).toMatchObject({ product_name: 'Paracetamol 500', batch_no: 'B1', qty: 10, bonus: 2, rate: 100, discount_pct: 10, cc_amount: 0, amount: 1000, mrp: 120 })
    expect(d.items![1]).toMatchObject({ product_name: 'Amoxil', qty: 5, bonus: 1, rate: 50, cc_pct: 10, cc_amount: 5, amount: 250 })
  })
  it('subtotal is the GROSS subtotal and discount is recovered from the saved amounts (not the API\'s net subtotal)', () => {
    expect(d.subtotal).toBe(1250)          // 1000 + 250
    expect(d.discountAmt).toBe(100)        // (1000−900) + (250 − (255−5))
  })
  it('C.C charge, round-off, net, paid and due are the saved values — never recomputed', () => {
    expect(d).toMatchObject({ ccAmount: 5, roundOff: -0.4, netTotal: 1154.6, paidAmount: 154.6, dueAmount: 1000 })
  })
  it('string numerics from the API are converted', () => {
    const r = saleToPrintData({ ...SALE, net_total: '1154.60', paid_amount: '0', due_amount: '1154.60', round_off: '0.00', cc_amount: '5.00',
      items: [{ ...SALE.items[0], qty: '10.00', rate: '100.00', bonus: '2.00', amount: '900.00' }] })
    expect(r.netTotal).toBe(1154.6); expect(r.items![0]).toMatchObject({ qty: 10, rate: 100, bonus: 2, amount: 1000 })
    expect(r.discountAmt).toBe(100)
  })
  it('walk-in sale, no items, missing optional fields: no crash, sensible blanks', () => {
    const r = saleToPrintData({ invoice_no: 'INV-1', date_ad: '2026-05-05', payment_mode: 'cash', net_total: 0, paid_amount: 0, due_amount: 0 })
    expect(r.items).toEqual([]); expect(r.partyName).toBeUndefined(); expect(r).toMatchObject({ subtotal: 0, discountAmt: 0, ccAmount: 0, roundOff: 0 })
    expect(r.extra?.partyAddress).toBeUndefined()
  })
  it('master-data fallbacks (unit / MRP) only fill what the saved line lacks', () => {
    const r = saleToPrintData(SALE, { unitOf: id => (id === 'a' ? 'Strip' : 'Box'), mrpOf: () => 77, reprintCount: 3 })
    expect(r.items![0]).toMatchObject({ unit: 'Strip', mrp: 120 })     // saved MRP wins
    expect(r.items![1]).toMatchObject({ unit: 'Box', mrp: 77 })        // saved MRP was null → master
    expect(r.extra?.reprintCount).toBe(3)
  })
})
