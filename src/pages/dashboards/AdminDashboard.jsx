import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useProfile from '../../hooks/useProfile'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import Logo from '../../components/Logo'
import NotificationBell from '../../components/NotificationBell'
import { ROLE_LABELS } from '../../lib/roles'
import { supabase } from '../../lib/supabaseClient'

const NAV_GROUPS = [
  [
    { label: 'Dashboard',         path: '/admin/dashboard', Icon: HomeIcon },
    { label: 'Unit Completion',   path: '/unit-completion', Icon: ChartBarIcon },
    { label: 'Permits Dashboard', path: '/permits',         Icon: ClipboardListIcon },
    { label: 'Projects',          path: '/projects',        Icon: FolderIcon },
  ],
  [
    { label: 'User Management', path: '/admin/users', Icon: UsersIcon },
  ],
]

export default function AdminDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  const navigate    = useNavigate()

  const [expanded,   setExpanded]   = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [showLabels, setShowLabels] = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [menuOpen,   setMenuOpen]   = useState(false)
  const menuRef = useRef(null)

  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleSidebar = () => {
    setExpanded(v => {
      const next = !v
      localStorage.setItem('sidebar_expanded', String(next))
      if (!next) setShowLabels(false)
      else setTimeout(() => setShowLabels(true), 230)
      return next
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  if (showLoading) return <LoadingScreen />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-200" style={{ minHeight: '100dvh' }}>

      {/* -- Sidebar -- */}
      <aside
        className="sidebar-frost flex-shrink-0 flex flex-col py-3 gap-1"
        style={{
          width: expanded ? 240 : 80,
          background: 'transparent',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.18)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 1px 0 0 rgba(255,255,255,0.06), 4px 0 32px rgba(0,0,0,0.35)',
          borderRadius: 16,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 flex-shrink-0 border-b border-white/5 mb-1"
          style={{ paddingLeft: expanded ? 16 : 0, justifyContent: expanded ? 'flex-start' : 'center' }}
        >
          <Logo size="md" />
          {showLabels && (
            <span className="ml-3 text-white font-bold text-base tracking-wide whitespace-nowrap overflow-hidden">D&amp;C Dashboard</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1 w-full px-2 gap-0.5">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {gi > 0 && (
                <div className="my-2 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
              )}
              {group.map((item) => {
                const { Icon } = item
                return (
                  <div key={item.path} className="relative group">
                    <NavLink
                      to={item.path}
                      className={({ isActive }) => [
                        'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                        isActive
                          ? 'bg-[#ed6055] text-white'
                          : 'text-white hover:bg-white/[0.07]',
                      ].join(' ')}
                      style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                              style={{ width: 3, height: 20, background: '#ed6055' }}
                            />
                          )}
                          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                    {!showLabels && <SidebarTooltip label={item.label} />}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Settings + collapse pinned to bottom */}
          <div className="flex-1" />
          <div className="my-1 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div className="relative group">
            <NavLink
              to="/admin/settings"
              className={({ isActive }) => [
                'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                isActive ? 'bg-[#ed6055] text-white' : 'text-white hover:bg-white/[0.07]',
              ].join(' ')}
              style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: '#ed6055' }} />}
                  <SettingsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">Settings</span>}
                </>
              )}
            </NavLink>
            {!showLabels && <SidebarTooltip label="Settings" />}
          </div>

          {/* Expand / collapse toggle */}
          <div className="mt-1 relative group">
            <button
              onClick={toggleSidebar}
              className="flex items-center w-full h-11 rounded-lg transition-all duration-150 text-white hover:bg-white/[0.07]"
              style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
            >
              <svg
                className="w-[18px] h-[18px] flex-shrink-0 transition-transform duration-220"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">Collapse</span>}
            </button>
            {!showLabels && <SidebarTooltip label="Expand" />}
          </div>
        </nav>
      </aside>

      {/* -- Right column -- */}
      <div className="flex-1 min-w-0 overflow-auto">

        {/* App header */}
        <header
          className="flex items-center h-14 px-5 gap-4"
          style={{
            background: 'transparent',
            borderBottom: 'none',
            boxShadow: 'none',
          }}
        >
          <span className="text-lg font-bold text-gray-800 tracking-wide">Dashboard</span>

          <div className="flex-1" />

          <NotificationBell userId={profile?.id} />

          {/* User menu */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-gray-100 transition"
            >
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-gray-800 leading-tight">{profile?.full_name ?? ''}</p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{roleLabel}</p>
              </div>
              <div
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200"
                style={{ background: 'rgba(237,96,85,0.15)' }}
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-[#ed6055]">{initial}</span>
                }
              </div>
              <svg
                className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-xl z-50 overflow-hidden"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  animation: 'ph1-dropdown 0.15s ease-out both',
                }}
              >
                <button
                  onClick={() => { setMenuOpen(false); navigate('/profile') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <span className="font-medium">View Profile</span>
                </button>
                <div style={{ height: 1, background: '#f3f4f6', margin: '0 12px' }} />
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition text-left"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="p-4">
          <div id="dashboard-content" className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="h-full [&>section]:mb-0 [&>section]:h-full"><ProjectPhasesBoard id="panel-phases" /></div>
              <div className="h-full [&>section]:mb-0 [&>section]:h-full"><UnitCompletionChart id="panel-completion" /></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <div className="[&>section]:mb-0"><IssuesTable id="panel-issues" /></div>
              <div className="[&>section]:mb-0"><ComplianceTable id="panel-compliance" /></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarTooltip({ label }) {
  return (
    <div
      className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
      style={{ background: '#1a1a1a', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
    >
      {label}
    </div>
  )
}

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}
function ChartBarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
function ClipboardListIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}
function FolderIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}
function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}
function SettingsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}










