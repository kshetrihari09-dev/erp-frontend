import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import { QK, DEFAULT_PAGE_SIZE } from '@/constants'
import {
  productsAPI, salesAPI, purchasesAPI, partiesAPI, accountingAPI,
  reportsAPI, stockAPI, settingsAPI, returnsAPI, dateAPI, companiesAPI,
} from '@/services/api'
import * as manufacturersService from '@/services/manufacturers'
import type { ManufacturerInput } from '@/services/manufacturers'
import { createProductWithOpeningStock } from '@/services/productCreation'
import useUIStore from '@/store/uiStore'
import useAuthStore from '@/store/authStore'

// ─── Helper: extract .data.data from Axios response ──────────────────────────
const unwrap = <T>(res: { data: { data: T } }) => res.data.data
const unwrapPaginated = <T>(res: { data: { data: T; pagination?: unknown } }) =>
  ({ data: res.data.data, pagination: res.data.pagination })

// ─── Products ─────────────────────────────────────────────────────────────────
export function useProducts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.PRODUCTS, params],
    queryFn:  () => productsAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: [QK.PRODUCT, id],
    queryFn:  () => productsAPI.get(id).then(unwrap),
    enabled:  !!id,
  })
}

/**
 * Fetches the next auto-generated barcode to pre-fill the Create Product
 * form's barcode field as soon as it opens. `enabled` lets the caller fire
 * this only for new products (never while editing), and only once per form
 * mount — see ProductForm's `!initial` + empty-deps effect.
 */
export function useNextBarcode(enabled: boolean) {
  return useQuery({
    queryKey: [QK.PRODUCTS, 'next-barcode'],
    queryFn:  () => productsAPI.nextBarcode().then(unwrap),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: createProductWithOpeningStock,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.PRODUCTS] }); success('Product created') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('@/types').Product> }) =>
      productsAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.PRODUCTS] }); success('Product updated') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (id: string) => productsAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.PRODUCTS] }); success('Product deleted') },
    onError:   (e: { message: string }) => error('Cannot delete', e.message),
  })
}

// ── Opening Inventory (Edit Product) ────────────────────────────────────────
// Existing opening-inventory batches for a product, each shown as its own
// separate, unchangeable line (Batch A, Batch B, ...). Read-only — adding a
// new entry always goes through useAddOpeningInventory below, which only
// ever creates a new batch and never touches rows returned by this query.
export function useProductOpeningBatches(productId?: string) {
  return useQuery({
    queryKey: [QK.PRODUCT, productId, 'opening-batches'],
    queryFn:  () => productsAPI.openingBatches(productId!).then(unwrap),
    enabled:  !!productId,
  })
}

// Adds one new, independent opening-inventory batch to an existing product
// (Edit Product → "Add Opening Inventory"). This is purely additive: it
// never updates, replaces, or deletes any prior opening batch — each call
// is its own Batch A / Batch B / Batch C line, all contributing to
// current_stock and all available to FIFO.
export function useAddOpeningInventory() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: ({ productId, qty, batch_no, expiry, purchase_rate }: {
      productId: string; qty: number; batch_no?: string; expiry?: string; purchase_rate?: number
    }) => productsAPI.adjust(productId, { qty, reason: 'Opening stock', batch_no, expiry, purchase_rate }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [QK.PRODUCTS] })
      qc.invalidateQueries({ queryKey: [QK.PRODUCT, vars.productId, 'opening-batches'] })
      success('Opening inventory added')
    },
    onError: (e: { message: string }) => error('Failed', e.message),
  })
}

// ─── Manufacturers ──────────────────────────────────────────────────────────
// Client-side "master data" — see services/manufacturers.ts for why there's
// no real endpoint yet. Shaped exactly like the API-backed hooks around it
// (useCustomers/useCreateCustomer etc.) so ManufacturerSelect,
// QuickAddManufacturerModal, and ManufacturersPage don't need to know or
// care that it isn't hitting the network.
function useCompanyId() {
  return useAuthStore(s => s.company?.id) || 'default'
}

export function useManufacturers() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [QK.MANUFACTURERS, companyId],
    queryFn: async () => {
      // Seeds once per company from existing products' company_name
      // values — reuses productsAPI.list, no new endpoint, and only ever
      // runs the fetch on the very first load for a given company.
      await manufacturersService.ensureSeededOnce(companyId, async () => {
        const res = await productsAPI.list({ limit: 500 })
        return ((res.data.data || []) as { company_name?: string }[]).map(p => p.company_name)
      })
      return manufacturersService.getAll(companyId)
    },
  })
}

export function useCreateManufacturer() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: async (input: ManufacturerInput) => manufacturersService.create(companyId, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.MANUFACTURERS, companyId] }); success('Manufacturer created') },
    onError:   (e: Error) => error('Failed', e.message),
  })
}

export function useUpdateManufacturer() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ManufacturerInput> }) =>
      manufacturersService.update(companyId, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.MANUFACTURERS, companyId] }); success('Manufacturer updated') },
    onError:   (e: Error) => error('Failed', e.message),
  })
}

export function useDeleteManufacturer() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: async (id: string) => manufacturersService.remove(companyId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.MANUFACTURERS, companyId] }); success('Manufacturer deleted') },
    onError:   (e: Error) => error('Cannot delete', e.message),
  })
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export function useSales(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.SALES, params],
    queryFn:  () => salesAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useSale(id: string) {
  return useQuery({
    queryKey: [QK.SALE, id],
    queryFn:  () => salesAPI.get(id).then(unwrap),
    enabled:  !!id,
  })
}

export function useCreateSale() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: salesAPI.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.SALES] }); success('Sale created') },
    onError:   (e: { message: string }) => error('Sale failed', e.message),
  })
}

export function useCancelSale() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => salesAPI.cancel(id, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.SALES] }); success('Sale cancelled') },
    onError:   (e: { message: string }) => error('Cannot cancel', e.message),
  })
}

// ─── Purchases ────────────────────────────────────────────────────────────────
export function usePurchases(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.PURCHASES, params],
    queryFn:  () => purchasesAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useCreatePurchase() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: purchasesAPI.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.PURCHASES] }); success('Purchase created') },
    onError:   (e: { message: string }) => error('Purchase failed', e.message),
  })
}

// ─── Parties ──────────────────────────────────────────────────────────────────
export function useCustomers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.CUSTOMERS, params],
    queryFn:  () => partiesAPI.customers(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useSuppliers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.SUPPLIERS, params],
    queryFn:  () => partiesAPI.suppliers(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useParty(id: string) {
  return useQuery({
    queryKey: [QK.PARTY, id],
    queryFn:  () => partiesAPI.get(id).then(unwrap),
    enabled:  !!id,
  })
}

export function usePartyLedger(id: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.LEDGER, id, params],
    queryFn:  async () => {
      const res     = await partiesAPI.ledger(id, params)
      // Backend returns { success, data: { party, rows, summary, closingBalance } }
      const payload = res.data?.data ?? res.data ?? {}
      return {
        rows:           payload.rows           ?? [],
        party:          payload.party          ?? null,
        summary:        payload.summary        ?? null,
        closingBalance: payload.closingBalance ?? payload.closing_balance ?? 0,
        openingBalance: payload.opening_balance ?? 0,
      }
    },
    enabled:  !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: partiesAPI.createCustomer,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.CUSTOMERS] }); success('Customer created') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: partiesAPI.createSupplier,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.SUPPLIERS] }); success('Supplier created') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useUpdateParty() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('@/types').Party> }) =>
      partiesAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.CUSTOMERS] })
      qc.invalidateQueries({ queryKey: [QK.SUPPLIERS] })
      success('Party updated')
    },
    onError: (e: { message: string }) => error('Failed', e.message),
  })
}

export function useDeleteParty() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (id: string) => partiesAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.CUSTOMERS] })
      qc.invalidateQueries({ queryKey: [QK.SUPPLIERS] })
      success('Deleted')
    },
    onError: (e: { message: string }) => error('Cannot delete', e.message),
  })
}

// ─── Stock ────────────────────────────────────────────────────────────────────
export function useStock(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.STOCK, params],
    queryFn:  () => stockAPI.list(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useBatches(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.BATCHES, params],
    queryFn:  () => stockAPI.batches(params).then(unwrap),
  })
}

// ─── Accounting ───────────────────────────────────────────────────────────────
export function useAccounts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.ACCOUNTS, params],
    queryFn:  () => accountingAPI.accounts(params).then(unwrap),
  })
}

export function useVouchers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.VOUCHERS, params],
    queryFn:  () => accountingAPI.vouchers(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useVoucher(id: string) {
  return useQuery({
    queryKey: [QK.VOUCHER, id],
    queryFn:  () => accountingAPI.voucher(id).then(unwrap),
    enabled:  !!id,
  })
}

export function useCreateVoucher() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.createVoucher,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.VOUCHERS] }); success('Voucher created') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function usePostVoucher() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (id: string) => accountingAPI.postVoucher(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.VOUCHERS] }); success('Voucher posted') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.createAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK.ACCOUNTS] }); success('Account created') },
    onError:   (e: { message: string }) => error('Failed', e.message),
  })
}

export function useTrialBalance(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.TRIAL_BAL, params],
    queryFn:  () => accountingAPI.trialBalance(params).then(unwrap),
    // as_of_date is the required param — date_from is optional (omitting it
    // means "from the beginning of time", valid for a full trial balance).
    // Bug fix: was checking date_to which is never sent; as_of_date is.
    enabled:  !!(params?.as_of_date),
  })
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({
    queryKey: [QK.DASHBOARD],
    queryFn:  () => reportsAPI.dashboard().then(unwrap),
    staleTime: 1000 * 60, // 1 min
    refetchOnWindowFocus: true,
  })
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export function useCompanySettings() {
  return useQuery({
    queryKey: [QK.COMPANY],
    queryFn:  () => settingsAPI.company().then(unwrap),
  })
}

// ─── Multi-Company ──────────────────────────────────────────────────────────
export function useUserCompanies() {
  return useQuery({
    queryKey: [QK.COMPANIES],
    queryFn:  () => companiesAPI.list().then(unwrap),
    staleTime: 1000 * 30, // company list changes rarely; short stale time is enough
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    // confirmPassword is threaded through by useSensitiveConfirm()'s
    // runWithConfirm(); companiesAPI.remove always requires it server-side.
    mutationFn: ({ id, confirmPassword }: { id: string; confirmPassword?: string }) =>
      companiesAPI.remove(id, confirmPassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.COMPANIES] })
      success('Company deleted')
    },
    onError: (e: any) => {
      // Let the requiresPasswordConfirm flow bubble up silently (no toast) —
      // useSensitiveConfirm's runWithConfirm() catches it and opens the
      // password modal. Only show a toast for genuine failures.
      if (!e?.response?.data?.requiresPasswordConfirm) {
        error('Could not delete company', e?.response?.data?.message || e?.message || '')
      }
    },
  })
}

export function useRestoreCompany() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (id: string) => companiesAPI.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.COMPANIES] })
      success('Company restored')
    },
    onError: (e: any) => error('Could not restore company', e?.response?.data?.message || e?.message || ''),
  })
}

export function useUsers(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.USERS, params],
    queryFn:  () => settingsAPI.users(params).then(unwrapPaginated),
  })
}

export function useInvoiceTemplates() {
  return useQuery({
    queryKey: [QK.TEMPLATES],
    queryFn:  () => settingsAPI.templates().then(unwrap),
  })
}

export function useFiscalYears() {
  return useQuery({
    queryKey: [QK.FISCAL_YEARS],
    queryFn:  () => settingsAPI.fiscalYears().then(unwrap),
  })
}

export function useAuditLog(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.AUDIT_LOG, params],
    queryFn:  () => settingsAPI.auditLog(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

// ─── Preferences (General / Sales & Purchase / Accounting / Notifications) ────
export function usePreferences() {
  return useQuery({
    queryKey: [QK.PREFERENCES],
    queryFn:  () => settingsAPI.preferences().then(unwrap),
  })
}

export function useUpdatePreferences() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: settingsAPI.updatePreferences,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.PREFERENCES] })
      success('Settings saved')
    },
    onError: (err: any) => {
      if (err?.response?.data?.requiresPasswordConfirm) return // handled by caller's password dialog
      error('Failed to save settings', err?.response?.data?.message)
    },
  })
}

// ─── Backup & Cloud (local backups) ────────────────────────────────────────────
export function useBackups(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.BACKUPS, params],
    queryFn:  () => settingsAPI.backups(params).then(unwrapPaginated),
    placeholderData: keepPreviousData,
  })
}

export function useRunBackup() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: settingsAPI.runBackup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.BACKUPS] })
      success('Backup completed')
    },
    onError: (err: any) => error('Backup failed', err?.response?.data?.message),
  })
}

export function useVerifyBackup() {
  const qc = useQueryClient()
  const { success, error, warning } = useUIStore()
  return useMutation({
    mutationFn: settingsAPI.verifyBackup,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: [QK.BACKUPS] })
      if (res?.data?.data?.verified) success('Backup verified', 'Checksum matches')
      else warning('Verification failed', 'The backup file may be corrupted')
    },
    onError: (err: any) => error('Verification failed', err?.response?.data?.message),
  })
}

// ─── Today's BS Date ─────────────────────────────────────────────────────────
export function useTodayBS() {
  return useQuery({
    queryKey: ['today-bs'],
    queryFn:  () => dateAPI.today().then((r) => r.data.data as { bs: string; ad: string }),
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}

// ─── PostingEngine / Account Defaults ────────────────────────────────────────
export function useAccountDefaults() {
  return useQuery({
    queryKey: [QK.ACCOUNT_DEFAULTS],
    queryFn:  () => accountingAPI.accountDefaults().then(unwrap),
    staleTime: 5 * 60_000,
  })
}

export function useSetAccountDefault() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.setAccountDefault,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.ACCOUNT_DEFAULTS] })
      success('Account default saved')
    },
    onError: (e: any) => error('Failed to save', e?.response?.data?.message || e?.message || ''),
  })
}

export function useDeleteAccountDefault() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.deleteAccountDefault,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.ACCOUNT_DEFAULTS] })
      success('Account default removed')
    },
    onError: (e: any) => error('Failed to remove', e?.response?.data?.message || e?.message || ''),
  })
}

export function useResetAccountDefault() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.resetAccountDefault,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.ACCOUNT_DEFAULTS] })
      success('Reset to default')
    },
    onError: (e: any) => error('Failed to reset', e?.response?.data?.message || e?.message || ''),
  })
}

export function useInitializeAccountDefaults() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: accountingAPI.initializeAccountDefaults,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: [QK.ACCOUNT_DEFAULTS] })
      const count = res?.data?.data?.created?.length ?? 0
      if (count > 0) success(`${count} default${count > 1 ? 's' : ''} auto-assigned`)
    },
    onError: (e: any) => error('Failed to auto-assign defaults', e?.response?.data?.message || e?.message || ''),
  })
}

export function useUpdatePartyAccount() {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: ({ id, control_account_id }: { id: string; control_account_id: string | null }) =>
      partiesAPI.update(id, { control_account_id } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK.CUSTOMERS] })
      qc.invalidateQueries({ queryKey: [QK.SUPPLIERS] })
      success('Account override saved')
    },
    onError: (e: any) => error('Failed to save', e?.response?.data?.message || e?.message || ''),
  })
}

export function useVoucherPostings(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [QK.VOUCHER_POSTINGS, params],
    queryFn:  () => accountingAPI.voucherPostings(params).then(unwrapPaginated),
  })
}

export function usePostingStatus(sourceType: string, sourceId: string) {
  return useQuery({
    queryKey: [QK.POSTING_STATUS, sourceType, sourceId],
    queryFn:  () => accountingAPI.postingStatus(sourceType, sourceId).then(unwrap),
    enabled:  !!(sourceType && sourceId),
    staleTime: 30_000,
  })
}

