/**
 * layouts/DeliveryLayout.tsx — the rider's shell.
 *
 * Deliberately NOT AppLayout. AppLayout is a desktop back-office frame:
 * a sidebar of twenty modules, a command palette, company switcher,
 * keyboard shortcuts. A delivery partner has access to exactly none of
 * that — ROLE_PERMISSIONS['delivery_partner'] is empty, and every
 * back-office endpoint would 403 them — so rendering that shell would be
 * a screen full of links to places they cannot go.
 *
 * This is the same reasoning the customer storefront already applies
 * with CustomerLayout (see app/Router.tsx's comment on the storefront
 * tree): a different kind of principal gets a different shell, rather
 * than one shell learning to hide most of itself.
 */
import { Outlet, useNavigate } from 'react-router-dom'
import { Truck, LogOut } from 'lucide-react'
import useAuthStore from '@/store/authStore'
import { PATHS } from '@/constants'

export default function DeliveryLayout() {
  const navigate = useNavigate()
  const { user, company, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-[var(--surface-2)] flex flex-col">
      <header className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-lg mx-auto w-full px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate(PATHS.DELIVERY)}
            className="flex items-center gap-2 min-w-0"
          >
            <span className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Truck size={17} className="text-brand" />
            </span>
            <span className="flex flex-col items-start min-w-0">
              <span className="text-sm font-extrabold leading-tight truncate">Deliveries</span>
              <span className="text-[10.5px] text-[var(--text-4)] leading-tight truncate">
                {user?.name}{company?.name ? ` · ${company.name}` : ''}
              </span>
            </span>
          </button>

          <button
            onClick={() => { logout(); navigate(PATHS.LOGIN, { replace: true }) }}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text)] px-2 py-1.5 rounded-lg hover:bg-[var(--surface-3)]"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>

      {/* pb-10 rather than pb-4: the verify button sits near the bottom of
          a phone screen, above the browser chrome that appears on scroll. */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-10">
        <Outlet />
      </main>
    </div>
  )
}
