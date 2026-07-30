import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, RotateCcw, Package,
  Users, Truck, BookOpen, BookCopy,
  FileBarChart, Settings, LogOut, Building2, CalendarDays, Moon,
  Sun, Menu, X, AlertTriangle, Bell, Search, ChevronRight, Home,
  PackageX, CalendarClock,
} from 'lucide-react'
import useAuthStore from '@/store/authStore'
import useUIStore from '@/store/uiStore'
import { PATHS } from '@/constants'
import { initials, cn } from '@/utils'
import { todayBS as computeTodayBS } from '@/utils/nepaliDate'
import { authAPI, reportsAPI } from '@/services/api'
import ToastContainer from '@/components/shared/ToastContainer'

const SIDEBAR_W       = 260
const SIDEBAR_W_COLL  = 72
const MOBILE_BP  = 768

// ─── Nav structure ────────────────────────────────────────────────────────────
// Same routes, labels, icons, and alert keys as before — only the section
// groupings/headers changed, to match the ERP-standard grouping (Dashboard,
// Sales, Purchase, Inventory, Accounting, Reports, Administration).
const NAV = [
  { section: 'DASHBOARD' },
  { to: PATHS.DASHBOARD,  label: 'Dashboard',     icon: <LayoutDashboard size={20} strokeWidth={1.8}/> },

  { section: 'SALES' },
  { to: PATHS.SALES,      label: 'Sales / POS',   icon: <ShoppingCart    size={20} strokeWidth={1.8}/>, alertKey: 'due' },
  { to: PATHS.SALES_RETURNS,    label: 'Sales Returns',    icon: <RotateCcw       size={20} strokeWidth={1.8}/> },
  { to: PATHS.CUSTOMERS,  label: 'Customers',      icon: <Users           size={20} strokeWidth={1.8}/> },

  { section: 'PURCHASE' },
  { to: PATHS.PURCHASE,   label: 'Purchase',       icon: <ShoppingBag     size={20} strokeWidth={1.8}/> },
  { to: PATHS.PURCHASE_RETURNS, label: 'Purchase Returns', icon: <RotateCcw       size={20} strokeWidth={1.8}/> },
  { to: PATHS.SUPPLIERS,  label: 'Suppliers',      icon: <Truck           size={20} strokeWidth={1.8}/> },

  { section: 'INVENTORY' },
  { to: PATHS.PRODUCTS,   label: 'Products',       icon: <Package         size={20} strokeWidth={1.8}/>, alertKey: 'lowStock' },

  { section: 'ACCOUNTING' },
  { to: PATHS.ACCOUNTING,    label: 'Accounting',     icon: <BookOpen           size={20} strokeWidth={1.8}/> },
  { to: PATHS.LEDGER,        label: 'Ledger',         icon: <BookCopy           size={20} strokeWidth={1.8}/> },

  { section: 'REPORTS' },
  { to: PATHS.REPORTS,    label: 'Reports',        icon: <FileBarChart    size={20} strokeWidth={1.8}/> },

  { section: 'ADMINISTRATION' },
  { to: PATHS.SETTINGS,   label: 'Settings',       icon: <Settings        size={20} strokeWidth={1.8}/> },
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
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar, setSidebarCollapsed, dateMode, toggleDateMode } = useUIStore()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [isMobile, setIsMobile]   = useState(() => window.innerWidth < MOBILE_BP)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [todayBS, setTodayBS]     = useState('')
  const [todayAD, setTodayAD]     = useState('')
  const [alerts, setAlerts]       = useState({ lowStock: 0, expiry: 0 })
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)

  // Topbar search (client-side quick-nav over existing routes — no new data)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Notifications dropdown (renders the alerts already fetched below)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifBoxRef = useRef<HTMLDivElement>(null)

  // Profile dropdown
  const [profileOpen, setProfileOpen] = useState(false)
  const profileBoxRef = useRef<HTMLDivElement>(null)

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
      if (profileBoxRef.current && !profileBoxRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
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

  // BS date — computed locally now that nepali-date-converter is
  // available client-side, instead of a separate authenticated fetch to
  // /date/today just to get a value we can derive here directly.
  useEffect(() => {
    setTodayBS(computeTodayBS())
    setTodayAD(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
  }, [])

  const handleLogout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    logout()
    navigate(PATHS.LOGIN)
  }, [logout, navigate])

  const collapsed = !isMobile && sidebarCollapsed

  const sidebarStyle = isMobile
    ? { transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', width: SIDEBAR_W }
    : { width: collapsed ? SIDEBAR_W_COLL : SIDEBAR_W }

  const mainStyle = isMobile
    ? { marginLeft: 0 }
    : { marginLeft: collapsed ? SIDEBAR_W_COLL : SIDEBAR_W }

  const pageTitle = Object.entries({
    [PATHS.DASHBOARD]:  'Dashboard',
    [PATHS.SALES]:      'Sales / POS',
    [PATHS.PURCHASE]:   'Purchase',
    [PATHS.SALES_RETURNS]:    'Sales Returns',
    [PATHS.PURCHASE_RETURNS]: 'Purchase Returns',
    [PATHS.PRODUCTS]:   'Products',
    [PATHS.STOCK]:      'Stock Report',
    [PATHS.CUSTOMERS]:  'Customers',
    [PATHS.SUPPLIERS]:  'Suppliers',
    [PATHS.ACCOUNTING]:    'Accounting',
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
          className="fixed inset-0 z-[calc(var(--z-drawer)-10)] bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─── */}
      <aside
        className="sidebar"
        style={{ ...sidebarStyle, transition: 'width 300ms cubic-bezier(.4,0,.2,1), transform 300ms cubic-bezier(.4,0,.2,1)' }}
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
              <div className="sidebar-logo-name truncate">{'MediERP'}</div>
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
              className="ml-auto"
              style={{ color: 'var(--sidebar-text-sec)' }}
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
              // Section header — collapsed to a thin divider when the
              // sidebar is collapsed, since the uppercase label has no
              // room to render at 72px.
              return collapsed ? (
                i === 0 ? null : <div key={`sec-${i}`} style={{ height: 1, background: 'var(--sidebar-line)', margin: '10px 12px' }} />
              ) : (
                <div key={`sec-${i}`} className="nav-section-label">{item.section}</div>
              )
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
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[var(--z-dropdown)]">
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
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg mb-1 font-medium"
                style={{
                  color:      'var(--sidebar-lowstock-fg)',
                  background: 'var(--sidebar-lowstock-bg)',
                  border:     'var(--sidebar-lowstock-border-w) solid var(--sidebar-lowstock-border)',
                }}
              >
                <AlertTriangle size={12}/> {alerts.lowStock} low stock
              </div>
            )}
            {alerts.expiry > 0 && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ color: 'var(--red)', background: 'var(--red-50)' }}
              >
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
            onClick={() => { if (collapsed) navigate(PATHS.SETTINGS) }}
            title={collapsed ? user?.name : undefined}
          >
            <div className="sidebar-avatar flex-shrink-0">
              {initials(user?.name)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="sidebar-user-name truncate">{user?.name}</div>
                <div className="sidebar-user-role truncate">{user?.role}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="sidebar-footer-actions">
              <button
                className="sidebar-footer-btn"
                onClick={() => navigate(PATHS.SETTINGS)}
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={13}/> Settings
              </button>
              <button
                className="sidebar-footer-btn danger"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={13}/> Logout
              </button>
            </div>
          )}
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
           
                <span style={{ color: 'var(--text-3)' }}>{pageTitle}</span>
              </div>
            )}
           
          </div>

          {/* AD / BS date toggler */}
          {(todayAD || todayBS) && (
            <button
              onClick={toggleDateMode}
              className="topbar-btn"
              title={`Switch to ${dateMode === 'AD' ? 'Bikram Sambat' : dateMode === 'BS' ? 'both dates' : 'Gregorian'} date`}
              aria-label="Toggle AD/BS date"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: 'auto', padding: '0 10px',
                fontSize: 11.5, fontWeight: 600,
                color: 'var(--text-3)', whiteSpace: 'nowrap',
                marginLeft: isMobile ? 0 : 10, flexShrink: 0,
              }}
            >
              <CalendarDays size={13}/>
              <span>{dateMode === 'AD' ? todayAD : dateMode === 'BS' ? todayBS : `${todayAD} (${todayBS})`}</span>
              <span
                style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: .3,
                  color: 'var(--brand)', background: 'var(--brand-50, rgba(37,99,235,.1))',
                  borderRadius: 4, padding: '1px 5px',
                }}
              >
                {dateMode}
              </span>
            </button>
          )}

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
                            <span className="topbar-notif-icon" style={{ background: 'var(--topbar-warn-bg)', color: 'var(--amber)' }}>
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
                            <span className="topbar-notif-icon" style={{ background: 'var(--topbar-danger-bg)', color: 'var(--red)' }}>
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
            <div ref={profileBoxRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="hidden md:flex items-center gap-2 text-sm text-[var(--text-3)]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 8 }}
                title={user?.name || 'Account'}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  {initials(user?.name)}
                </div>
              </button>
              {profileOpen && (
                <div className="topbar-dropdown" style={{ right: 0, left: 'auto', minWidth: 200 }}>
                  <div className="topbar-dropdown-header">
                    <div className="min-w-0">
                      <div className="topbar-dropdown-title truncate">{user?.name || 'Account'}</div>
                      {user?.email && (
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }} className="truncate">
                          {user.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="topbar-dropdown-list" style={{ padding: 4 }}>
                    <div
                      className="topbar-notif-item"
                      onClick={() => { setProfileOpen(false); navigate(PATHS.SETTINGS) }}
                    >
                      <span className="topbar-notif-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                        <Settings size={14}/>
                      </span>
                      <div className="min-w-0">
                        <div className="topbar-notif-title">Settings</div>
                      </div>
                    </div>
                    <div
                      className="topbar-notif-item"
                      onClick={() => { setProfileOpen(false); handleLogout() }}
                    >
                      <span className="topbar-notif-icon" style={{ background: 'var(--red-50)', color: 'var(--red)' }}>
                        <LogOut size={14}/>
                      </span>
                      <div className="min-w-0">
                        <div className="topbar-notif-title">Log out</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
