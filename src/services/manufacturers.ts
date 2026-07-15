/**
 * services/manufacturers.ts
 *
 * Manufacturer "master data" backing the Product form's Manufacturer
 * selector (see components/forms/ManufacturerSelect.tsx).
 *
 * IMPORTANT — why this is local rather than a real API call:
 * There is currently no Manufacturer table/endpoint on the backend.
 * Product only ever stored a plain `company_name` string (see
 * types/index.ts:Product) — no manufacturer_id, no separate master.
 * Since this repo has no backend code to add a table/endpoint to, and
 * the task explicitly says not to change the database schema unless a
 * Manufacturer master already exists, this module gives the Product
 * form a real, working manufacturer directory entirely on the client:
 *
 *   - Seeded once per company from the distinct `company_name` values
 *     already present across existing products (via the existing
 *     productsAPI.list — no new endpoint), so it's useful immediately.
 *   - New manufacturers created from the Quick Create dialog persist in
 *     localStorage, scoped per company/tenant.
 *   - Only a manufacturer's *name* is ever written onto a product — that
 *     still goes into the existing `company_name` column exactly as
 *     before (see ProductsPage.tsx). The richer fields below (contact,
 *     phone, website, etc.) live only in this directory.
 *
 * If a real Manufacturer master + API ships on the backend later, this
 * file is the only place that needs to change — hooks/useQuery.ts's
 * useManufacturers/useCreateManufacturer already look and behave exactly
 * like the API-backed hooks next to them.
 */
import type { Manufacturer } from '@/types'

const STORAGE_PREFIX = 'medierp:manufacturers:'
const SEEDED_SUFFIX  = ':seeded'

function keyFor(companyId: string) {
  return `${STORAGE_PREFIX}${companyId || 'default'}`
}

function readStore(companyId: string): Manufacturer[] {
  try {
    const raw = localStorage.getItem(keyFor(companyId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeStore(companyId: string, list: Manufacturer[]) {
  try {
    localStorage.setItem(keyFor(companyId), JSON.stringify(list))
  } catch {
    // Storage full/unavailable — fail silently, same best-effort approach
    // other local caches in this app take (e.g. AutoCloudBackup).
  }
}

function makeId() {
  return `mfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalize(name: string) {
  return name.trim().toLowerCase()
}

/** Active manufacturers first, then alphabetical by name within each group
 *  — matches the Manufacturer selector's "show active first" requirement. */
export function sortManufacturers(list: Manufacturer[]): Manufacturer[] {
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function getAll(companyId: string): Manufacturer[] {
  return sortManufacturers(readStore(companyId))
}

export function findDuplicate(companyId: string, name: string, excludeId?: string): Manufacturer | undefined {
  const key = normalize(name)
  return readStore(companyId).find(m => normalize(m.name) === key && m.id !== excludeId)
}

/**
 * Runs `fetchCompanyNames` (a live lookup of distinct product company
 * names) exactly once per company, ever — subsequent calls are a no-op
 * localStorage read, so re-mounting the Manufacturer selector doesn't
 * refetch products every time. Existing, richer manufacturer entries are
 * never overwritten by a seeded bare-name entry.
 */
export async function ensureSeededOnce(
  companyId: string,
  fetchCompanyNames: () => Promise<(string | undefined)[]>,
): Promise<void> {
  const flagKey = keyFor(companyId) + SEEDED_SUFFIX
  if (localStorage.getItem(flagKey)) return

  let names: (string | undefined)[] = []
  try {
    names = await fetchCompanyNames()
  } catch {
    return // Don't mark as seeded if the fetch failed — try again next time.
  }

  const existing = readStore(companyId)
  const seen = new Set(existing.map(m => normalize(m.name)))
  const additions: Manufacturer[] = []

  for (const raw of names) {
    const name = raw?.trim()
    if (!name) continue
    const key = normalize(name)
    if (seen.has(key)) continue
    seen.add(key)
    additions.push({ id: makeId(), name, is_active: true, created_at: new Date().toISOString() })
  }

  if (additions.length) writeStore(companyId, [...existing, ...additions])
  try { localStorage.setItem(flagKey, '1') } catch { /* best-effort */ }
}

export interface ManufacturerInput {
  name:            string
  short_name?:     string
  contact_person?: string
  phone?:          string
  email?:          string
  address?:        string
  website?:        string
  pan_no?:         string
  is_active?:      boolean
  notes?:          string
}

export function create(companyId: string, input: ManufacturerInput): Manufacturer {
  const name = input.name.trim()
  if (!name) throw new Error('Manufacturer name is required')
  if (findDuplicate(companyId, name)) {
    throw new Error(`A manufacturer named "${name}" already exists`)
  }
  const record: Manufacturer = {
    id:             makeId(),
    name,
    short_name:     input.short_name?.trim()     || undefined,
    contact_person: input.contact_person?.trim() || undefined,
    phone:          input.phone?.trim()          || undefined,
    email:          input.email?.trim()          || undefined,
    address:        input.address?.trim()        || undefined,
    website:        input.website?.trim()        || undefined,
    pan_no:         input.pan_no?.trim()          || undefined,
    is_active:      input.is_active ?? true,
    notes:          input.notes?.trim()          || undefined,
    created_at:     new Date().toISOString(),
  }
  writeStore(companyId, [...readStore(companyId), record])
  return record
}

export function update(companyId: string, id: string, input: Partial<ManufacturerInput>): Manufacturer {
  const list = readStore(companyId)
  const idx  = list.findIndex(m => m.id === id)
  if (idx === -1) throw new Error('Manufacturer not found')

  if (input.name) {
    const dup = findDuplicate(companyId, input.name, id)
    if (dup) throw new Error(`A manufacturer named "${input.name.trim()}" already exists`)
  }

  const updated: Manufacturer = {
    ...list[idx],
    ...input,
    name: input.name?.trim() || list[idx].name,
  }
  const next = [...list]
  next[idx] = updated
  writeStore(companyId, next)
  return updated
}

export function remove(companyId: string, id: string) {
  writeStore(companyId, readStore(companyId).filter(m => m.id !== id))
}
