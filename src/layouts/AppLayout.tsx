import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, RotateCcw, Package,
  Download, Users, Truck, BookOpen, BookCopy, SlidersHorizontal,
  FileBarChart, Settings, LogOut, Building2, CalendarDays, Moon,
  Sun, Menu, X, AlertTriangle, Bell, Search, ChevronRight, Home,
  PackageX, CalendarClock,
} from 'lucide-react'
import useAuthStore from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import { PATHS, STORAGE_KEYS } from '@/constants'
import { initials, cn } from '@/utils'
import { authAPI, reportsAPI } from '@/services/api'
import ToastContainer from '@/components/shared/ToastContainer'

const SIDEBAR_W  = 256
const MOBILE_BP  = 768

// ─── Nav structure ────────────────────────────────────────────────────────────
const NAV = [
  { section: 'OVERVIEW' },
  { to: PATHS.DASHBOARD,  label: 'Dashboard',     icon: <LayoutDashboard size={17} strokeWidth={1.8}/> },

  { section: 'TRANSACTIONS' },
  { to: PATHS.SALES,      label: 'Sales / POS',   icon: <ShoppingCart    size={17} strokeWidth={1.8}/>, alertKey: 'due' },
  { to: PATHS.PURCHASE,   label: 'Purchase',       icon: <ShoppingBag     size={17} strokeWidth={1.8}/> },
  { to: PATHS.SALES_RETURNS,    label: 'Sales Returns',    icon: <RotateCcw       size={17} strokeWidth={1.8}/> },
  { to: PATHS.PURCHASE_RETURNS, label: 'Purchase Returns', icon: <RotateCcw       size={17} strokeWidth={1.8}/> },

  { section: 'INVENTORY' },
  { to: PATHS.PRODUCTS,   label: 'Products',       icon: <Package         size={17} strokeWidth={1.8}/>, alertKey: 'lowStock' },
  { to: PATHS.RECEIVES,   label: 'Receive Stock',  icon: <Download        size={17} strokeWidth={1.8}/> },

  { section: 'PARTIES' },
  { to: PATHS.CUSTOMERS,  label: 'Customers',      icon: <Users           size={17} strokeWidth={1.8}/> },
  { to: PATHS.SUPPLIERS,  label: 'Suppliers',      icon: <Truck           size={17} strokeWidth={1.8}/> },

  { section: 'FINANCE' },
  { to: PATHS.ACCOUNTING,    label: 'Accounting',     icon: <BookOpen           size={17} strokeWidth={1.8}/> },
  { to: PATHS.ACCOUNT_SETUP, label: 'Account Setup',  icon: <SlidersHorizontal  size={17} strokeWidth={1.8}/> },
  { to: PATHS.LEDGER,        label: 'Ledger',         icon: <BookCopy           size={17} strokeWidth={1.8}/> },

  { section: 'ANALYTICS' },
  { to: PATHS.REPORTS,    label: 'Reports',        icon: <FileBarChart    size={17} strokeWidth={1.8}/> },

  { section: 'SYSTEM' },
  { to: PATHS.SETTINGS,   label: 'Settings',       icon: <Settings        size={17} strokeWidth={1.8}/> },
] as const

type NavEntry = { section: string } | { to: string; label: string; icon: React.ReactNode; alertKey?: string }

// Single safe cast point — NAV's `as const` literal tuple doesn't structurally
// overlap with the wider NavEntry union, so TS wants the `unknown` bridge.
// Cast once here and reuse everywhere below instead of repeating the cast.
const NAV_TYPED = NAV as unknown as NavEntry[]

// Flattened, searchable version of NAV (section headers excluded) — used by
// the topbar quick-search. Purely a client-side filter over existing routes;
// it does not call any new API or change any existing nav/route behavior.
const SEARCHABLE_NAV = NAV_TYPED.filter(
  (item): item is { to: string; label: string; icon: React.ReactNode; alertKey?: string } => 'to' in item
)

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, company, logout } = useAuthStore()
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUIStore()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [isMobile, setIsMobile]   = useState(() => window.innerWidth < MOBILE_BP)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [todayBS, setTodayBS]     = useState('')
  const [alerts, setAlerts]       = useState({ lowStock: 0, expiry: 0 })
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)

  // Topbar search (client-side quick-nav over existing routes — no new data)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Notifications dropdown (renders the alerts already fetched below)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifBoxRef = useRef<HTMLDivElement>(null)

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return SEARCHABLE_NAV.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6)
  }, [searchQuery])

  const unreadCount = alerts.lowStock + alerts.expiry

  // Close search/notification dropdowns on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
      if (notifBoxRef.current && !notifBoxRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Responsive
  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < MOBILE_BP
      setIsMobile(mobile)
      if (!mobile) setMobileOpen(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

  // Load alerts
  useEffect(() => {
    reportsAPI.dashboard().then((r) => {
      const d = r.data.data
      setAlerts({ lowStock: d?.low_stock_items || 0, expiry: d?.expiry_alerts || 0 })
    }).catch(() => {})
  }, [])

  // BS date
  useEffect(() => {
    fetch('/api/v1/date/today', {
      headers: { Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}` }
    })
      .then(r => r.json())
      .then(d => setTodayBS(d?.data?.bs || ''))
      .catch(() => {})
  }, [])

  const handleLogout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    logout()
    navigate(PATHS.LOGIN)
  }, [logout, navigate])

  const collapsed = !isMobile && sidebarCollapsed

  const sidebarStyle = isMobile
    ? { transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', width: SIDEBAR_W }
    : { width: collapsed ? 64 : SIDEBAR_W }

  const mainStyle = isMobile
    ? { marginLeft: 0 }
    : { marginLeft: collapsed ? 64 : SIDEBAR_W }

  const pageTitle = Object.entries({
    [PATHS.DASHBOARD]:  'Dashboard',
    [PATHS.SALES]:      'Sales / POS',
    [PATHS.PURCHASE]:   'Purchase',
    [PATHS.SALES_RETURNS]:    'Sales Returns',
    [PATHS.PURCHASE_RETURNS]: 'Purchase Returns',
    [PATHS.PRODUCTS]:   'Products',
    [PATHS.STOCK]:      'Stock Report',
    [PATHS.RECEIVES]:   'Receive Stock',
    [PATHS.CUSTOMERS]:  'Customers',
    [PATHS.SUPPLIERS]:  'Suppliers',
    [PATHS.ACCOUNTING]:    'Accounting',
    [PATHS.ACCOUNT_SETUP]: 'Account Setup',
    [PATHS.LEDGER]:     'Ledger',
    [PATHS.REPORTS]:    'Reports',
    [PATHS.SETTINGS]:   'Settings',
  }).find(([path]) => location.pathname.startsWith(path))?.[1] || ''

  // Section label for the current route (e.g. "FINANCE" above "Ledger") —
  // purely derived from the existing NAV structure for breadcrumb display.
  const currentSection = (() => {
    let section = ''
    for (const item of NAV_TYPED) {
      if ('section' in item) { section = item.section; continue }
      if (location.pathname.startsWith(item.to)) return section
    }
    return ''
  })()

  const handleSearchSelect = useCallback((to: string) => {
    navigate(to)
    setSearchQuery('')
    setSearchFocused(false)
    if (isMobile) setMobileOpen(false)
  }, [navigate, isMobile])

  return (
    <div className="app-layout">
      {/* ── Mobile backdrop ─── */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─── */}
      <aside
        className="sidebar"
        style={{ ...sidebarStyle, transition: 'width 260ms cubic-bezier(.4,0,.2,1), transform 260ms cubic-bezier(.4,0,.2,1)' }}
      >
        {/* Logo */}
        <div className="sidebar-logo" style={{ overflow: 'hidden' }}>
          <div className="sidebar-logo-icon flex-shrink-0">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect width="26" height="26" rx="7" fill="#2563eb"/>
              <path d="M8 13h10M13 8v10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="sidebar-logo-name truncate">{company?.name || 'MediERP'}</div>
              <div className="sidebar-logo-sub">Billing</div>
            </div>
          )}
          {/* Collapse button — desktop only */}
          {!isMobile && (
            <button
              className="sidebar-collapse-btn"
              onClick={toggleSidebar}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{ flexShrink: 0, marginLeft: 'auto' }}
            >
              <Menu size={14} strokeWidth={2}/>
            </button>
          )}
          {/* Mobile close */}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto text-white/50 hover:text-white"
            >
              <X size={18}/>
            </button>
          )}
        </div>

        {/* Company info strip */}
        {!collapsed && company && (
          <div className="px-4 py-2.5 border-b border-[var(--sidebar-line)]">
            <div className="flex items-center gap-2 text-[var(--sidebar-text)] text-xs">
              <Building2 size={12} opacity={.6}/>
              <span className="truncate">{company.pan_no ? `PAN: ${company.pan_no}` : company.name}</span>
            </div>
            {todayBS && (
              <div className="flex items-center gap-2 text-[var(--sidebar-text)] text-xs mt-0.5 opacity-70">
                <CalendarDays size={12}/>
                <span>{todayBS}</span>
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav flex-1">
          {NAV_TYPED.map((item, i) => {
            if ('section' in item) {
              return null
            }
            const badge = item.alertKey === 'lowStock' ? alerts.lowStock : 0
            return (
              <div
                key={item.to}
                className="relative"
                onMouseEnter={() => collapsed && setHoveredNav(item.to)}
                onMouseLeave={() => setHoveredNav(null)}
              >
                <NavLink
                  to={item.to}
                  className={({ isActive }) => cn('nav-link', isActive && 'active')}
                  onClick={() => isMobile && setMobileOpen(false)}
                  style={{ justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? '9px' : undefined }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>
                  )}
                </NavLink>
                {/* Tooltip for collapsed */}
                {collapsed && hoveredNav === item.to && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[300]">
                    <div className="bg-[#1e293b] text-[#f1f5f9] text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                      {item.label}
                      {badge > 0 && <span className="ml-1.5 text-red-400">({badge})</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Alerts strip */}
        {!collapsed && (alerts.lowStock > 0 || alerts.expiry > 0) && (
          <div className="px-3 pb-2">
            {alerts.lowStock > 0 && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-400/10 px-3 py-1.5 rounded-lg mb-1">
                <AlertTriangle size={12}/> {alerts.lowStock} low stock
              </div>
            )}
            {alerts.expiry > 0 && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-1.5 rounded-lg">
                <AlertTriangle size={12}/> {alerts.expiry} near expiry
              </div>
            )}
          </div>
        )}

        {/* Footer / user */}
        <div className="sidebar-footer">
          <div
            className="sidebar-user"
            style={{ justifyContent: collapsed ? 'center' : undefined }}
            onClick={handleLogout}
            title="Logout"
          >
            <div className="sidebar-avatar flex-shrink-0">
              {initials(user?.name)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="sidebar-user-name truncate">{user?.name}</div>
                <div className="sidebar-user-role">{user?.role}</div>
              </div>
            )}
            {!collapsed && <LogOut size={14} className="ml-auto opacity-50 flex-shrink-0"/>}
          </div>
        </div>
      </aside>

      {/* ── MAIN ─── */}
      <div
        className="flex flex-col min-h-screen flex-1"
        style={{ ...mainStyle, transition: 'margin-left 260ms cubic-bezier(.4,0,.2,1)' }}
      >
        {/* Topbar */}
        <header className="topbar">
          {isMobile && (
            <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1 text-[var(--text-3)] hover:text-[var(--text)]">
              <Menu size={20}/>
            </button>
          )}

          {/* Breadcrumb + title */}
          <div className="min-w-0">
            {!isMobile && (
              <div className="page-breadcrumb" style={{ marginBottom: 1 }}>
                <Home size={10} className="page-breadcrumb-home"/>
                {currentSection && (
                  <>
                    <ChevronRight size={10} className="page-breadcrumb-sep"/>
                    <span>{currentSection}</span>
                  </>
                )}
                <ChevronRight size={10} className="page-breadcrumb-sep"/>
                <span style={{ color: 'var(--text-3)' }}>{pageTitle}</span>
              </div>
            )}
           
          </div>

          {/* Quick search — client-side filter over existing nav routes */}
          {!isMobile && (
            <div ref={searchBoxRef} className="relative ml-4" style={{ flexShrink: 0 }}>
              <div className="topbar-search">
                <Search size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }}/>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search pages…"
                  aria-label="Search pages"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="flex-shrink-0 text-[var(--text-4)] hover:text-[var(--text)]"
                    aria-label="Clear search"
                  >
                    <X size={13}/>
                  </button>
                )}
              </div>
              {searchFocused && searchQuery && (
                <div className="topbar-search-results">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="topbar-search-section-label">Pages</div>
                      {searchResults.map((item) => (
                        <div
                          key={item.to}
                          className="topbar-search-item"
                          onClick={() => handleSearchSelect(item.to)}
                        >
                          <span className="flex items-center text-[var(--text-4)]">{item.icon}</span>
                          {item.label}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="topbar-dropdown-empty">No matching pages</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Notifications */}
            <div ref={notifBoxRef} className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="topbar-btn"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={16}/>
                {unreadCount > 0 && <span className="topbar-btn-dot"/>}
              </button>
              {notifOpen && (
                <div className="topbar-dropdown">
                  <div className="topbar-dropdown-header">
                    <span className="topbar-dropdown-title">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="badge badge-blue">{unreadCount}</span>
                    )}
                  </div>
                  <div className="topbar-dropdown-list">
                    {unreadCount === 0 ? (
                      <div className="topbar-dropdown-empty">You're all caught up 🎉</div>
                    ) : (
                      <>
                        {alerts.lowStock > 0 && (
                          <div
                            className="topbar-notif-item"
                            onClick={() => { setNotifOpen(false); navigate(PATHS.PRODUCTS) }}
                          >
                            <span className="topbar-notif-icon" style={{ background: 'var(--amber-50)', color: 'var(--amber)' }}>
                              <PackageX size={14}/>
                            </span>
                            <div className="min-w-0">
                              <div className="topbar-notif-title">{alerts.lowStock} product{alerts.lowStock > 1 ? 's' : ''} low on stock</div>
                              <div className="topbar-notif-sub">Review inventory levels</div>
                            </div>
                          </div>
                        )}
                        {alerts.expiry > 0 && (
                          <div
                            className="topbar-notif-item"
                            onClick={() => { setNotifOpen(false); navigate(PATHS.PRODUCTS) }}
                          >
                            <span className="topbar-notif-icon" style={{ background: 'var(--red-50)', color: 'var(--red)' }}>
                              <CalendarClock size={14}/>
                            </span>
                            <div className="min-w-0">
                              <div className="topbar-notif-title">{alerts.expiry} item{alerts.expiry > 1 ? 's' : ''} near expiry</div>
                              <div className="topbar-notif-sub">Check batch expiry dates</div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="topbar-btn"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
            </button>
            {/* User badge */}
            <div className="hidden md:flex items-center gap-2 text-sm text-[var(--text-3)]">
              <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center text-white text-xs font-bold">
                {initials(user?.name)}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* Toast system */}
      <ToastContainer />
    </div>
  )
}
