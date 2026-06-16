import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Company, UserRole } from '@/types'
import { ROLE_PERMISSIONS } from '@/constants'

// ── Raw token key — exported so http.ts can read the JWT directly ─────────────
// Zustand persist stores full JSON under 'erp_auth_state'.
// http.ts reads THIS key which holds only the plain JWT string.
export const RAW_TOKEN_KEY     = 'erp_raw_token'
export const REFRESH_TOKEN_KEY = 'erp_refresh_token'

interface AuthState {
  token:           string | null
  user:            User   | null
  company:         Company| null
  isAuthenticated: boolean
  setAuth:     (p: { token: string; user: User; company: Company }) => void
  setCompany:  (company: Company) => void
  updateUser:  (user: Partial<User>) => void
  logout:      () => void
  can:         (permission: string) => boolean
  hasRole:     (role: UserRole | UserRole[]) => boolean
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token:           null,
      user:            null,
      company:         null,
      isAuthenticated: false,

      setAuth: ({ token, user, company }) => {
        // Write raw JWT to its own key so http.ts reads a plain string (not JSON blob)
        localStorage.setItem(RAW_TOKEN_KEY, token)
        set({ token, user, company, isAuthenticated: true })
      },

      setCompany: (company) => set({ company }),

      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : null })),

      logout: () => {
        localStorage.removeItem(RAW_TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        set({ token: null, user: null, company: null, isAuthenticated: false })
      },

      can: (permission: string) => {
        const role  = get().user?.role
        if (!role) return false
        const perms = ROLE_PERMISSIONS[role] || []
        if (perms.includes('*')) return true
        return perms.some((p) => {
          if (p === permission) return true
          const [module] = p.split('.')
          return p.endsWith('.*') && permission.startsWith(module + '.')
        })
      },

      hasRole: (role) => {
        const r = get().user?.role
        if (!r) return false
        return Array.isArray(role) ? role.includes(r) : r === role
      },
    }),
    {
      name: 'erp_auth_state',  // Zustand persist key (JSON blob — NOT the raw token)
      partialize: (s) => ({
        token: s.token, user: s.user,
        company: s.company, isAuthenticated: s.isAuthenticated,
      }),
      // On rehydrate: sync RAW_TOKEN_KEY if missing
      onRehydrateStorage: () => (state) => {
        if (state?.token && !localStorage.getItem(RAW_TOKEN_KEY)) {
          localStorage.setItem(RAW_TOKEN_KEY, state.token)
        }
      },
    }
  )
)

export default useAuthStore
