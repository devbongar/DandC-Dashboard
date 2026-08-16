import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import { supabase } from '../../lib/supabaseClient'
import { ROLE_LABELS } from '../../lib/roles'
import Logo from '../../components/Logo'
import NotificationBell from '../../components/NotificationBell'
import SearchDropdown from '../../components/SearchDropdown'

const NAV_GROUPS = [
  [
    { label: 'Dashboard',        path: '/admin/dashboard', Icon: HomeIcon },
    { label: 'Unit Completion',  path: '/unit-completion', Icon: ChartBarIcon },
    { label: 'Permits Dashboard',path: '/permits',         Icon: ClipboardListIcon },
    { label: 'Projects',         path: '/projects',        Icon: FolderIcon },
  ],
]

export default function UnitCompletionPage() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  const [expanded,    setExpanded]    = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [showLabels,  setShowLabels]  = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [allProjects, setAllProjects] = useState(null)
  const [is4ph,       setIs4ph]       = useState('all')
  const [projectId,   setProjectId]   = useState('all')
  const [province,    setProvince]    = useState('')
  const [city,        setCity]        = useState('')
  const [timeMode,    setTimeMode]    = useState('monthly')
  const [filterDate,  setFilterDate]  = useState('')
  const menuRef   = useRef(null)
  const filterRef = useRef(null)
  const navigate  = useNavigate()

  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''

  useEffect(() => {
    supabase.from('projects').select('id, name, is_4ph_project, province, city')
      .then(({ data }) => setAllProjects(data ?? []))
  }, [])

  const availableProvinces = useMemo(() => {
    if (!allProjects) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .map(p => p.province).filter(Boolean)
    )].sort()
  }, [allProjects, is4ph])

  const availableCities = useMemo(() => {
    if (!allProjects || !province) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .filter(p => p.province === province)
        .map(p => p.city).filter(Boolean)
    )].sort()
  }, [allProjects, is4ph, province])

  const activeFilterCount = [is4ph !== 'all', projectId !== 'all', !!province, !!city, !!filterDate].filter(Boolean).length

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
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
    <div className="flex h-screen overflow-hidden bg-gray-50" style={{ minHeight: '100dvh' }}>

      {/* -- Sidebar -- */}
      <aside
        className="flex-shrink-0 flex flex-col py-3 gap-1"
        style={{
          width: expanded ? 240 : 80,
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 flex-shrink-0 border-b border-white/5 mb-1"
          style={{ paddingLeft: expanded ? 16 : 0, justifyContent: expanded ? 'flex-start' : 'center' }}
        >
          <Logo size="md" variant="white" />
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
                  <div key={item.path}>
                    <div className="relative group">
                      <NavLink
                        to={item.path}
                        className={({ isActive }) => [
                          'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
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
                    {item.children?.map(child => {
                      const CIcon = child.Icon
                      if (child.comingSoon) {
                        return (
                          <div key={child.path} className="relative group">
                            <div
                              className="flex items-center w-full h-9 rounded-lg cursor-default"
                              style={{ color: 'rgba(255,255,255,0.18)', justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 28 : 0 }}
                            >
                              <CIcon className="w-[15px] h-[15px] flex-shrink-0" />
                              {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{child.label}</span>}
                            </div>
                            {!showLabels && <SidebarTooltip label={`${child.label} (Soon)`} />}
                          </div>
                        )
                      }
                      return (
                        <div key={child.path} className="relative group">
                          <NavLink
                            to={child.path}
                            className={({ isActive }) => [
                              'flex items-center w-full h-9 rounded-lg transition-all duration-150',
                              isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                            ].join(' ')}
                            style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 28 : 0 }}
                          >
                            {({ isActive }) => (
                              <>
                                {isActive && (
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 16, background: '#ed6055' }} />
                                )}
                                <CIcon className="w-[15px] h-[15px] flex-shrink-0" />
                                {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{child.label}</span>}
                              </>
                            )}
                          </NavLink>
                          {!showLabels && <SidebarTooltip label={child.label} />}
                        </div>
                      )
                    })}
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
                isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
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
              className="flex items-center w-full h-11 rounded-lg transition-all duration-150 text-white/40 hover:bg-white/[0.07] hover:text-white/75"
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
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">


        {/* Main content */}
        {/* White top bar */}
        <header
          className="flex-shrink-0 flex items-center h-14 px-5 gap-4"
          style={{
            background: 'transparent',
            borderBottom: 'none',
            boxShadow: 'none',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <span className="text-lg font-bold text-gray-800 tracking-wide">Unit Completion Status</span>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
            />
          </div>

          {/* Filter button + popover */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
              style={{
                background: filterOpen || activeFilterCount > 0 ? '#fff' : '#f9fafb',
                borderColor: activeFilterCount > 0 ? '#ed6055' : filterOpen ? '#ed6055' : '#e5e7eb',
                color: activeFilterCount > 0 ? '#ed6055' : '#6b7280',
                boxShadow: filterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-72 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Type</p>
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg w-full" style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}>
                    {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                      <button key={t.key} onClick={() => { setIs4ph(t.key); setProjectId('all'); setProvince(''); setCity('') }}
                        className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                        style={is4ph === t.key ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)' } : { color: '#6b7280', background: 'transparent' }}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Project</p>
                  <SearchDropdown fluid
                    options={(allProjects ?? []).filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project)).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))}
                    value={projectId} onChange={setProjectId} emptyValue="all" emptyLabel="All Projects" placeholder="Search projects…"
                    icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Province</p>
                  <SearchDropdown fluid
                    options={availableProvinces.map(p => ({ value: p, label: p }))}
                    value={province} onChange={v => { setProvince(v); setCity('') }} emptyValue="" emptyLabel="All Provinces" placeholder="Search provinces…"
                    icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">City</p>
                  <SearchDropdown fluid
                    options={availableCities.map(c => ({ value: c, label: c }))}
                    value={city} onChange={setCity} emptyValue="" emptyLabel="All Cities" placeholder="Search cities…"
                    icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                    disabled={!province || availableCities.length === 0}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">As of Date</p>
                  <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border transition-all outline-none"
                    style={{ borderColor: filterDate ? '#ed6055' : '#e5e7eb', color: filterDate ? '#111827' : '#9ca3af', boxShadow: filterDate ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)' }}
                  />
                  {filterDate && (
                    <button onClick={() => setFilterDate('')} className="mt-1.5 text-[10px] font-semibold text-[#ed6055] hover:underline">Reset to all time</button>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setIs4ph('all'); setProjectId('all'); setProvince(''); setCity(''); setFilterDate('') }}
                    className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          <NotificationBell userId={profile?.id} variant="light" />

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
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200"
                style={{ background: 'rgba(237,96,85,0.15)' }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-xs font-bold text-[#ed6055]">{initial}</span>
                }
              </div>
              <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-5xl mx-auto">
            <UnitCompletionChart
              expanded
              is4ph={is4ph} setIs4ph={setIs4ph}
              projectId={projectId} setProjectId={setProjectId}
              province={province} setProvince={setProvince}
              city={city} setCity={setCity}
              timeMode={timeMode} setTimeMode={setTimeMode}
              filterDate={filterDate} setFilterDate={setFilterDate}
              allProjects={allProjects}
              availableProvinces={availableProvinces}
              availableCities={availableCities}
              activeFilterCount={activeFilterCount}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

// -- Sidebar tooltip ---------------------------------------------------------
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

// -- Icons (same SVGs as Sidebar.jsx) ----------------------------------------
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
function DocumentCheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M7.5 21h9a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0016.5 4.5h-9A2.25 2.25 0 005.25 6.75v12A2.25 2.25 0 007.5 21z" />
    </svg>
  )
}
function TemplateIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
