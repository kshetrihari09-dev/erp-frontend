import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/constants'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id:      string
  type:    ToastType
  title:   string
  message?: string
  duration?: number
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void

  // Theme
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void

  // Toasts
  toasts: Toast[]
  addToast:    (t: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info:    (title: string, message?: string) => void

  // Command palette
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Sidebar
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // Theme
      theme: 'light',
      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        set({ theme })
      },
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        document.documentElement.classList.toggle('dark', next === 'dark')
        set({ theme: next })
      },

      // Toasts
      toasts: [],
      addToast: (t) => {
        const id = `toast-${Date.now()}-${Math.random()}`
        const duration = t.duration ?? 4000
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
        if (duration > 0) {
          setTimeout(() => get().removeToast(id), duration)
        }
      },
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      success: (title, message) => get().addToast({ type: 'success', title, message }),
      error:   (title, message) => get().addToast({ type: 'error',   title, message, duration: 6000 }),
      warning: (title, message) => get().addToast({ type: 'warning', title, message }),
      info:    (title, message) => get().addToast({ type: 'info',    title, message }),

      // Command palette
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
    }),
    {
      name: STORAGE_KEYS.THEME,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme }),
    }
  )
)

export default useUIStore
