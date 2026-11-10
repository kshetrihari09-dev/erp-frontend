import useAuthStore from '@/store/authStore'

/**
 * usePermission — ask what the signed-in user may do. Everything is answered from the permission list the SERVER sent
 * (role defaults + per-user switches, from the database); nothing is derived from the role name here.
 *
 *   const { can, canAny } = usePermission()
 *   {can('sales.cancel') && <Button>Cancel invoice</Button>}      // hides a control; the API enforces it regardless
 *
 * `hasRole` is for the few role-defined operations (e.g. owner-only). `isOwner` / `isAdmin` are exact-role checks:
 * an admin is not treated as an owner, and an owner is not "an admin" by accident.
 */
export function usePermission() {
  const can     = useAuthStore((s) => s.can)
  const canAny  = useAuthStore((s) => s.canAny)
  const hasRole = useAuthStore((s) => s.hasRole)
  const role    = useAuthStore((s) => s.user?.role)
  const permissions = useAuthStore((s) => s.user?.permissions)

  return {
    can, canAny, hasRole, role, permissions,
    isOwner:   role === 'owner',
    isAdmin:   role === 'admin',
    isManager: role === 'manager',
    isViewer:  role === 'viewer',
  }
}
