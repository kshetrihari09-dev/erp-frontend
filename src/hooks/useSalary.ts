/**
 * useSalary.ts — react-query hooks for the Staff Salary module (backend routes/salary.js).
 * Every successful mutation invalidates the whole ['salary'] family: a payment changes the slip, the outstanding report, the
 * payable balance and the employee ledger at once, and refetching all of them is cheaper than reasoning about which.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { salaryAPI } from '@/services/api'
import useUIStore from '@/store/uiStore'

const unwrap = <T,>(res: { data: { data: T } }) => res.data.data
const unwrapList = (res: { data: { data: any; pagination?: any; totals?: any; total_paid?: number } }) =>
  ({ data: res.data.data as any[], pagination: res.data.pagination, totals: res.data.totals, total_paid: res.data.total_paid })

export const SALARY_QK = 'salary'
const key = (...p: unknown[]) => [SALARY_QK, ...p]

export const useSalaryPaymentAccounts = () => useQuery({ queryKey: key('payment-accounts'), queryFn: () => salaryAPI.paymentAccounts().then(unwrap), staleTime: 60_000 })
export const useSalaryComponents = (includeInactive = false) => useQuery({ queryKey: key('components', includeInactive), queryFn: () => salaryAPI.components({ include_inactive: includeInactive }).then(unwrap) })
export const useSalaryEmployees = (params?: Record<string, unknown>) => useQuery({ queryKey: key('employees', params), queryFn: () => salaryAPI.employees(params).then(unwrapList), placeholderData: keepPreviousData })
export const useSalaryEmployee = (id?: string) => useQuery({ queryKey: key('employee', id), queryFn: () => salaryAPI.employee(id!).then(unwrap), enabled: !!id })
export const useSalarySlips = (params?: Record<string, unknown>) => useQuery({ queryKey: key('slips', params), queryFn: () => salaryAPI.slips(params).then(unwrapList), placeholderData: keepPreviousData })
export const useSalarySlip = (id?: string) => useQuery({ queryKey: key('slip', id), queryFn: () => salaryAPI.slip(id!).then(unwrap), enabled: !!id })
export const useSalaryAdvances = (params?: Record<string, unknown>) => useQuery({ queryKey: key('advances', params), queryFn: () => salaryAPI.advances(params).then(unwrapList), placeholderData: keepPreviousData })
export const useEmployeeLedger = (id?: string, params?: Record<string, unknown>) => useQuery({ queryKey: key('ledger', id, params), queryFn: () => salaryAPI.employeeLedger(id!, params).then(unwrap), enabled: !!id })
export const useAdvanceStatement = (id?: string) => useQuery({ queryKey: key('advance-statement', id), queryFn: () => salaryAPI.advanceStatement(id!).then(unwrap), enabled: !!id })

export const useSalaryReport = (kind: 'monthly' | 'outstanding' | 'payments' | 'deductions' | 'payable', params?: Record<string, unknown>) =>
  useQuery({
    queryKey: key('report', kind, params),
    queryFn: () => {
      switch (kind) {
        case 'monthly':     return salaryAPI.reportMonthly(params).then((r) => r.data)
        case 'outstanding': return salaryAPI.reportOutstanding(params).then((r) => r.data)
        case 'payments':    return salaryAPI.reportPayments(params).then((r) => r.data)
        case 'deductions':  return salaryAPI.reportDeductions(params).then((r) => r.data)
        default:            return salaryAPI.reportPayable(params).then((r) => r.data)
      }
    },
    // Keep the previous rows while a FILTER changes (no flicker) — but never across report TYPES: each report has a
    // different payload shape, and rendering one report's data with another's component crashes it.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey?.[2] === kind ? prev : undefined),
  })

/** One mutation factory: invalidates the salary family, toasts success/failure with the server's message. */
function useSalaryMutation<V, R = any>(fn: (v: V) => Promise<{ data: { data: R; message?: string } }>, okTitle: string | ((r: R) => string), errTitle: string) {
  const qc = useQueryClient()
  const { success, error } = useUIStore()
  return useMutation({
    mutationFn: (v: V) => fn(v).then((r) => r.data.data),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: [SALARY_QK] }); success(typeof okTitle === 'function' ? okTitle(r) : okTitle) },
    onError: (e: { message: string }) => error(errTitle, e.message),
  })
}

export const useCreateEmployee  = () => useSalaryMutation((d: Record<string, unknown>) => salaryAPI.createEmployee(d), 'Employee created', 'Could not create employee')
export const useUpdateEmployee  = () => useSalaryMutation(({ id, data }: { id: string; data: Record<string, unknown> }) => salaryAPI.updateEmployee(id, data), 'Employee updated', 'Could not update employee')
export const useCreateComponent = () => useSalaryMutation((d: Record<string, unknown>) => salaryAPI.createComponent(d), 'Component created', 'Could not create component')
export const useUpdateComponent = () => useSalaryMutation(({ id, data }: { id: string; data: Record<string, unknown> }) => salaryAPI.updateComponent(id, data), 'Component updated', 'Could not update component')
export const useGenerateSalary  = () => useSalaryMutation((d: { salary_month: string; employee_ids?: string[] }) => salaryAPI.generate(d),
  (r: any) => `Salary generated — ${r.created.length} created, ${r.skipped.length} skipped`, 'Could not generate salary')
export const useUpdateSlip      = () => useSalaryMutation(({ id, data }: { id: string; data: Record<string, unknown> }) => salaryAPI.updateSlip(id, data), 'Salary updated', 'Could not save salary')
export const useCancelSlip      = () => useSalaryMutation(({ id, reason }: { id: string; reason: string }) => salaryAPI.cancelSlip(id, reason), 'Salary slip cancelled', 'Could not cancel')
export const useApproveSlip     = () => useSalaryMutation(({ id, data }: { id: string; data?: Record<string, unknown> }) => salaryAPI.approve(id, data),
  (r: any) => (r.already_approved ? 'Already approved' : 'Salary approved and posted to the ledger'), 'Could not approve salary')
export const usePaySlip         = () => useSalaryMutation(({ id, data }: { id: string; data: Record<string, unknown> }) => salaryAPI.pay(id, data),
  (r: any) => (r.already_processed ? 'Payment already recorded' : 'Salary payment recorded'), 'Could not record payment')
export const useReverseApproval = () => useSalaryMutation(({ id, reason }: { id: string; reason: string }) => salaryAPI.reverseApproval(id, reason), 'Approval reversed — slip reopened for editing', 'Could not reverse approval')
export const useReversePayment  = () => useSalaryMutation(({ id, reason }: { id: string; reason: string }) => salaryAPI.reversePayment(id, reason), 'Payment reversed', 'Could not reverse payment')
export const useIssueAdvance    = () => useSalaryMutation((d: Record<string, unknown>) => salaryAPI.issueAdvance(d), 'Advance recorded', 'Could not record advance')
export const useReverseAdvance  = () => useSalaryMutation(({ id, reason }: { id: string; reason: string }) => salaryAPI.reverseAdvance(id, reason), 'Advance reversed', 'Could not reverse advance')
