import { describe, it, expect } from 'vitest'
import { formatAccountBalance, trialBalanceRangeFor, periodsOfFiscalYear, num } from './accountBalance'

describe('formatAccountBalance', () => {
  it('debit balance shows the amount with Dr', () => {
    expect(formatAccountBalance({ balance: 40000, balance_side: 'Dr' }).text).toBe('40,000 Dr')
  })
  it('abnormal / credit balance shows Cr', () => {
    expect(formatAccountBalance({ balance: 5000, balance_side: 'Cr' }).text).toBe('5,000 Cr')
  })
  it('zero shows a bare 0 with no side', () => {
    expect(formatAccountBalance({ balance: 0, balance_side: null })).toEqual({ amount: '0', side: null, text: '0' })
  })
  it('missing fields (old server) read as 0, never NaN', () => {
    expect(formatAccountBalance({}).text).toBe('0')
    expect(formatAccountBalance({ balance: null }).text).toBe('0')
  })
  it('derives the side from a signed net_balance when balance_side is absent', () => {
    expect(formatAccountBalance({ net_balance: -5000 }).text).toBe('5,000 Cr')
    expect(formatAccountBalance({ net_balance: '120000.00' }).text).toBe('1,20,000 Dr')
  })
  it('accepts NUMERIC strings', () => {
    expect(formatAccountBalance({ balance: '1234.56', balance_side: 'Dr' }).text).toBe('1,234.56 Dr')
  })
  it('desktop and mobile use the same function → identical output for the same account', () => {
    const a = { balance: 15000, balance_side: 'Dr' as const }
    expect(formatAccountBalance(a).text).toBe(formatAccountBalance({ ...a }).text)
  })
})

describe('trialBalanceRangeFor', () => {
  it('uses the fiscal year\'s own dates, not January 1', () => {
    expect(trialBalanceRangeFor({ start_date_ad: '2025-07-16', end_date_ad: '2026-07-15' })).toEqual({ from: '2025-07-16', to: '2026-07-15' })
  })
  it('null when no fiscal year / incomplete dates', () => {
    expect(trialBalanceRangeFor(null)).toBeNull()
    expect(trialBalanceRangeFor({ start_date_ad: '2025-07-16', end_date_ad: null })).toBeNull()
  })
})

describe('periodsOfFiscalYear / num', () => {
  const ps = [{ id: 'a', fiscal_year_id: 'y1' }, { id: 'b', fiscal_year_id: 'y2' }, { id: 'c', fiscal_year_id: null }]
  it('filters to the fiscal year', () => { expect(periodsOfFiscalYear(ps, 'y1').map(p => p.id)).toEqual(['a']) })
  it('no year → all', () => { expect(periodsOfFiscalYear(ps, null)).toHaveLength(3); expect(periodsOfFiscalYear(undefined, 'y1')).toEqual([]) })
  it('num coerces strings and garbage', () => { expect([num('40000.00'), num(null), num('x'), num(undefined)]).toEqual([40000, 0, 0, 0]) })
})
