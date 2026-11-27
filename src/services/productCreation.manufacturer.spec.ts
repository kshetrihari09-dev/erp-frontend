import { describe, it, expect } from 'vitest'
import { checkManufacturer, createProductSchema, productSchema, validateProductInput } from './productCreation'
import type { Manufacturer } from '@/types'

const mfg = (name: string, is_active = true): Manufacturer => ({ id: name, name, is_active } as Manufacturer)
const LIST = [mfg('Sun Pharma'), mfg('Cipla'), mfg('Old Labs', false)]
const base = { name: 'Paracetamol', sales_rate: 10 }

describe('checkManufacturer', () => {
  it('blank / whitespace / missing → required', () => {
    for (const v of ['', '   ', undefined, null]) expect(checkManufacturer(LIST, v)).toMatchObject({ ok: false, reason: 'required' })
  })
  it('required wins even while the directory is still loading', () => {
    expect(checkManufacturer(undefined, '')).toMatchObject({ reason: 'required' })
  })
  it('directory not loaded yet → loading (never a false "valid")', () => {
    expect(checkManufacturer(undefined, 'Cipla')).toMatchObject({ ok: false, reason: 'loading' })
  })
  it('name not in the directory → unknown', () => {
    expect(checkManufacturer(LIST, 'Made Up Pharma')).toMatchObject({ ok: false, reason: 'unknown' })
  })
  it('deactivated manufacturer → inactive', () => {
    expect(checkManufacturer(LIST, 'Old Labs')).toMatchObject({ ok: false, reason: 'inactive' })
  })
  it('active manufacturer, matched ignoring case and surrounding spaces', () => {
    const r = checkManufacturer(LIST, '  cIpLa ')
    expect(r.ok).toBe(true); if (r.ok) expect(r.manufacturer.name).toBe('Cipla')
  })
})

describe('createProductSchema (new product)', () => {
  const schema = createProductSchema(LIST)
  it('rejects a product with no manufacturer, on the company_name field', () => {
    const r = schema.safeParse({ ...base })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ['company_name'], message: 'Manufacturer is required' })
  })
  it('rejects an unregistered or inactive manufacturer', () => {
    expect(schema.safeParse({ ...base, company_name: 'Nobody Ltd' }).success).toBe(false)
    expect(schema.safeParse({ ...base, company_name: 'Old Labs' }).success).toBe(false)
  })
  it('accepts a valid manufacturer and saves the directory spelling', () => {
    const r = schema.safeParse({ ...base, company_name: 'sun pharma' })
    expect(r.success).toBe(true); if (r.success) expect(r.data.company_name).toBe('Sun Pharma')
  })
  it('still enforces the other required fields', () => {
    expect(schema.safeParse({ company_name: 'Cipla', sales_rate: 10 }).success).toBe(false)         // no name
    expect(schema.safeParse({ company_name: 'Cipla', name: 'X', sales_rate: '' }).success).toBe(false) // no rate
  })
  it('cannot pass while the manufacturer directory is still loading', () => {
    expect(createProductSchema(undefined).safeParse({ ...base, company_name: 'Cipla' }).success).toBe(false)
  })
})

describe('editing an existing product is unchanged (legacy blank / free-text company_name still saves)', () => {
  it('productSchema does not require a manufacturer', () => {
    expect(productSchema.safeParse({ ...base }).success).toBe(true)
    expect(productSchema.safeParse({ ...base, company_name: 'Legacy free text' }).success).toBe(true)
  })
})

describe('validateProductInput', () => {
  it('without the option: behaves exactly as before', () => { expect(validateProductInput({ ...base } as any)).toBeNull() })
  it('with requireManufacturer: returns the readable message', () => {
    expect(validateProductInput({ ...base } as any, { requireManufacturer: true, manufacturers: LIST })).toBe('Manufacturer is required')
    expect(validateProductInput({ ...base, company_name: 'Cipla' } as any, { requireManufacturer: true, manufacturers: LIST })).toBeNull()
  })
})
