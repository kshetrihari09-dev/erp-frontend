import useAuthStore from '@/store/authStore'

/**
 * usePermission — check if the current user has a given permission or role.
 *
 * Usage:
 *   const { can, hasRole, isAdmin } = usePermission()
 *   if (!can('sales.create')) return <AccessDenied />
 */
export function usePermission() {
  const can     = useAuthStore((s) => s.can)
  const hasRole = useAuthStore((s) => s.hasRole)
  const role    = useAuthStore((s) => s.user?.role)

  return {
    can,
    hasRole,
    isAdmin:      role === 'admin',
    isManager:    role === 'manager' || role === 'admin',
    isAccountant: role === 'accountant' || role === 'admin',
    isCashier:    role === 'cashier',
    isViewer:     role === 'viewer',
  }
}
