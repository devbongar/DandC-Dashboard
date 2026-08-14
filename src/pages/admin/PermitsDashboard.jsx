import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import PermitDetail from '../../components/PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../../lib/permitUtils'
import SearchDropdown from '../../components/SearchDropdown'
import Logo from '../../components/Logo'
import NotificationBell from '../../components/NotificationBell'
import { ROLE_LABELS } from '../../lib/roles'
import useMinLoading from '../../hooks/useMinLoading'

const NAV_GROUPS = [
  [
    { label: 'Dashboard',             path: '/admin/dashboard',             Icon: HomeIcon },
    { label: 'Unit Completion',        path: '/unit-completion',             Icon: ChartBarIcon },
    { label: 'Permits Dashboard',      path: '/permits',                     Icon: ClipboardListIcon },
    { label: 'Projects',              path: '/projects',                    Icon: FolderIcon },
  ],
  [
    { label: 'Standard Permits',      path: '/admin/standard-permits',      Icon: DocumentCheckIcon, comingSoon: true },
    { label: 'Work Program Template', path: '/admin/work-program-template', Icon: TemplateIcon,      comingSoon: true },
    { label: 'User Management',       path: '/admin/users',                 Icon: UsersIcon },
    { label: 'Settings',             path: '/admin/settings',              Icon: SettingsIcon },
  ],
]

const CARD_ICONS = {
  pending:    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />,
  inProgress: <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />,
  acquired:   <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />,
  overdue:    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />,
  withIssues: <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />,
}

const CARDS = [
  { label: 'Pending',     key: 'pending',    filterKey: 'pending',     color: '#6b7280' },
  { label: 'In Progress', key: 'inProgress', filterKey: 'in-progress', color: '#fbbf24' },
  { label: 'Acquired',    key: 'acquired',   filterKey: 'acquired',    color: '#34d399' },
  { label: 'Overdue',     key: 'overdue',    filterKey: 'overdue',     color: '#f87171' },
  { label: 'With Issues', key: 'withIssues', filterKey: 'with-issues', color: '#fb923c' },
]

function IssueIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400 drop-shadow-sm flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

export default function PermitsDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const [expanded,       setExpanded]       = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [filterOpen,     setFilterOpen]     = useState(false)
  const [permits,        setPermits]        = useState([])
  const [projects,       setProjects]       = useState([])
  const [dataLoading,    setDataLoading]    = useState(true)
  const [filterProject,  setFilterProject]  = useState('all')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [search,         setSearch]         = useState('')
  const [selected,       setSelected]       = useState(null)

  const menuRef      = useRef(null)
  const filterRef    = useRef(null)
  const cardScrollRef = useRef(null)
  const [cardScrollPos, setCardScrollPos] = useState(0)

  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''

  const toggleSidebar = () => {
    setExpanded(v => {
      const next = !v
      localStorage.setItem('sidebar_expanded', String(next))
      return next
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setDataLoading(true)
    const [{ data: pData }, { data: projData }] = await Promise.all([
      supabase
        .from('permits')
        .select('*, projects(name), permit_requirements(id, is_complete), permit_issues(id, status)')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
    ])
    setPermits(pData ?? [])
    setProjects(projData ?? [])
    setDataLoading(false)
  }

  function scrollCards(dir) {
    cardScrollRef.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  }

  const rows = permits.filter(p => {
    const effectiveStatus = computePermitStatus(p)
    const hasIssue = (p.permit_issues ?? []).some(i => i.status === 'open')
    const matchProject = filterProject === 'all' || p.project_id === filterProject
    const matchStatus  = filterStatus === 'all' ? true
      : filterStatus === 'with-issues' ? hasIssue
      : effectiveStatus === filterStatus
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.id?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      (p.projects?.name ?? '').toLowerCase().includes(q) ||
      (p.responsible_person ?? '').toLowerCase().includes(q)
    return matchProject && matchStatus && matchSearch
  })

  const counts = {
    pending:    rows.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: rows.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   rows.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    rows.filter(p => computePermitStatus(p) === 'overdue').length,
    withIssues: rows.filter(p => (p.permit_issues ?? []).some(i => i.status === 'open')).length,
  }

  const hasActiveFilter = filterStatus !== 'all' || filterProject !== 'all' || search !== ''

  function clearFilters() {
    setFilterStatus('all')
    setFilterProject('all')
    setSearch('')
  }

  if (showLoading) return <LoadingScreen />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" style={{ minHeight: '100dvh' }}>

      {/* -- Sidebar -- */}
      <aside
        className="flex-shrink-0 flex flex-col py-3 gap-1 overflow-hidden"
        style={{
          width: expanded ? 240 : 80,
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 flex-shrink-0 border-b border-white/5 mb-1"
          style={{ paddingLeft: expanded ? 16 : 0, justifyContent: expanded ? 'flex-start' : 'center' }}
        >
          <Logo size="md" variant="white" />
          {expanded && (
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
                if (item.comingSoon) {
                  return (
                    <div key={item.path} className="relative group">
                      <div
                        className="flex items-center w-full h-11 rounded-lg cursor-default"
                        style={{ color: 'rgba(255,255,255,0.18)', justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
                      >
                        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                        {expanded && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                      </div>
                      {!expanded && <SidebarTooltip label={`${item.label} (Soon)`} />}
                    </div>
                  )
                }
                return (
                  <div key={item.path} className="relative group">
                    <NavLink
                      to={item.path}
                      className={({ isActive }) => [
                        'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                        isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
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
                          {expanded && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                    {!expanded && <SidebarTooltip label={item.label} />}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Expand / collapse toggle */}
          <div className="mt-2 relative group">
            <button
              onClick={toggleSidebar}
              className="flex items-center w-full h-11 rounded-lg transition-all duration-150 text-white/40 hover:bg-white/[0.07] hover:text-white/75"
              style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
            >
              <svg
                className="w-[18px] h-[18px] flex-shrink-0"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms cubic-bezier(0.4,0,0.2,1)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              {expanded && <span className="ml-3 text-xs font-medium whitespace-nowrap">Collapse</span>}
            </button>
            {!expanded && <SidebarTooltip label="Expand" />}
          </div>
        </nav>
      </aside>

      {/* -- Right column -- */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Main content */}
        <main className="flex-1 overflow-auto">

        {/* Header */}
        <header
          className="flex items-center h-14 px-5 gap-4"
          style={{ background: 'transparent', borderBottom: 'none', boxShadow: 'none' }}
        >
          <span className="text-lg font-bold text-gray-800 tracking-wide">Permits Monitoring</span>
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search permits or projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
            />
          </div>

          {/* Filter button + popover */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
              style={{
                background: filterOpen || filterStatus !== 'all' || filterProject !== 'all' ? '#fff' : '#f9fafb',
                borderColor: filterStatus !== 'all' || filterProject !== 'all' ? '#ed6055' : filterOpen ? '#ed6055' : '#e5e7eb',
                color: filterStatus !== 'all' || filterProject !== 'all' ? '#ed6055' : '#6b7280',
                boxShadow: filterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              {(filterStatus !== 'all' || filterProject !== 'all') && (
                <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                  {[filterStatus !== 'all', filterProject !== 'all'].filter(Boolean).length}
                </span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Status</p>
                  <div className="flex flex-wrap gap-1">
                    {[{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'in-progress', label: 'In Progress' }, { key: 'acquired', label: 'Acquired' }, { key: 'overdue', label: 'Overdue' }, { key: 'with-issues', label: 'With Issues' }].map(s => (
                      <button key={s.key} onClick={() => setFilterStatus(s.key)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                        style={filterStatus === s.key
                          ? { background: '#ed6055', color: '#fff' }
                          : { background: '#f3f4f6', color: '#6b7280' }}
                      >{s.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Project</p>
                  <SearchDropdown fluid
                    options={projects.map(p => ({ value: p.id, label: p.name }))}
                    value={filterProject} onChange={setFilterProject}
                    emptyValue="all" emptyLabel="All Projects" placeholder="Search projects…"
                    icon="M2.25 21l.75-9m4.5 0l.75 9M9.75 3h4.5M12 3v18M4.5 12H3m18 0h-1.5M6.75 6.75h10.5"
                  />
                </div>
                {(filterStatus !== 'all' || filterProject !== 'all') && (
                  <button onClick={clearFilters}
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
                style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', animation: 'ph1-dropdown 0.15s ease-out both' }}
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

        <div className="p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            {/* Summary cards */}
            <div className="relative -mx-4 sm:mx-0">
              <div
                ref={cardScrollRef}
                onScroll={() => setCardScrollPos(cardScrollRef.current?.scrollLeft ?? 0)}
                className="flex gap-3 overflow-x-auto py-2 px-4 sm:grid sm:grid-cols-5 sm:overflow-visible sm:py-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {CARDS.map(c => {
                  const active = filterStatus === c.filterKey
                  const total  = permits.length
                  const pct    = total > 0 ? Math.round((counts[c.key] / total) * 100) : 0
                  const size   = 52
                  const sw     = 4
                  const r      = (size - sw) / 2
                  const circ   = 2 * Math.PI * r
                  const dash   = (pct / 100) * circ
                  return (
                    <button
                      key={c.label}
                      onClick={() => setFilterStatus(active ? 'all' : c.filterKey)}
                      className={`flex-none w-36 sm:w-auto text-left rounded-xl border p-4 transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/60 ${
                        active
                          ? 'bg-white border-transparent ring-2 ring-[#ed6055] shadow-xl'
                          : 'bg-white border-gray-100 shadow-md hover:shadow-xl'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                          <p className="text-2xl font-bold tabular-nums text-gray-900">{counts[c.key]}</p>
                        </div>
                        <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
                          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c.color} strokeWidth={sw}
                            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
                          <text x={size/2} y={size/2} dominantBaseline="middle" textAnchor="middle"
                            style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: 10, fontWeight: 700, fill: c.color }}>
                            {pct}%
                          </text>
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => scrollCards(-1)} aria-label="Scroll left"
                className={`sm:hidden absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-r from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollPos > 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              <button onClick={() => scrollCards(1)} aria-label="Scroll right"
                className={`sm:hidden absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-l from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollRef.current && cardScrollPos < cardScrollRef.current.scrollWidth - cardScrollRef.current.clientWidth - 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </div>


            {/* Mobile card list */}
            <div className="md:hidden space-y-2">
              {rows.length === 0 && (
                <div className="py-12 text-center bg-white rounded-xl border border-gray-200">
                  <p className="text-sm font-medium text-gray-500">No permits found</p>
                  {hasActiveFilter && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-[#ed6055] hover:underline">Clear filters</button>
                  )}
                </div>
              )}
              {(() => {
                const map = {}
                for (const p of rows) {
                  const key = p.project_id
                  if (!map[key]) map[key] = { name: p.projects?.name ?? p.project_id, permits: [] }
                  map[key].permits.push(p)
                }
                return Object.entries(map).map(([pid, group]) => (
                  <div key={pid}>
                    <div className="flex items-center gap-2 px-1 py-1.5">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">{group.permits.length}</span>
                    </div>
                    <div className="space-y-2">
                      {group.permits.map(permit => {
                        const status   = computePermitStatus(permit)
                        const reqs     = permit.permit_requirements ?? []
                        const reqDone  = reqs.filter(r => r.is_complete).length
                        const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
                        const delayed  = permit.planned_finish && status !== 'acquired'
                          ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000)) : 0
                        return (
                          <button key={permit.id} onClick={() => setSelected(permit)}
                            className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 active:scale-[0.99] transition-[transform,box-shadow] shadow-sm hover:shadow-md">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{permit.name}</span>
                                  {hasIssue && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold flex-shrink-0">
                                      <IssueIcon />Issue
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-mono text-gray-400 mt-0.5">{permit.id}</p>
                              </div>
                              <span className={`flex-shrink-0 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {reqs.length > 0 && (
                                <span className={`text-xs ${reqDone === reqs.length ? 'text-emerald-600' : 'text-gray-500'}`}>{reqDone}/{reqs.length} reqs</span>
                              )}
                              {permit.planned_finish && <span className="text-xs text-gray-400">Planned {permit.planned_finish}</span>}
                              {delayed > 0 && <span className="text-xs font-semibold text-red-600">{delayed}d delayed</span>}
                              {permit.responsible_person && <span className="text-xs text-gray-400 truncate">{permit.responsible_person}</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>

            {/* Desktop cards */}
            <div className="hidden md:block space-y-6">
              {rows.length === 0 && (
                <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
                  <p className="text-sm font-medium text-gray-500">No permits found</p>
                  {hasActiveFilter && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-[#ed6055] hover:underline">Clear filters</button>
                  )}
                </div>
              )}
              {(() => {
                const map = {}
                for (const p of rows) {
                  const key = p.project_id
                  if (!map[key]) map[key] = { name: p.projects?.name ?? p.project_id, permits: [] }
                  map[key].permits.push(p)
                }
                return Object.entries(map).map(([pid, group]) => (
                  <div key={pid}>
                    {/* Project header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{group.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">{group.permits.length}</span>
                    </div>
                    {/* Card grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {group.permits.map(permit => {
                        const status   = computePermitStatus(permit)
                        const reqs     = permit.permit_requirements ?? []
                        const reqDone  = reqs.filter(r => r.is_complete).length
                        const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
                        const delayed  = permit.planned_finish && status !== 'acquired'
                          ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000)) : 0
                        const reqPct   = reqs.length > 0 ? Math.round((reqDone / reqs.length) * 100) : null

                        return (
                          <button
                            key={permit.id}
                            onClick={() => setSelected(permit)}
                            className="text-left rounded-xl p-4 transition-all duration-200 ease-out flex flex-col gap-3 hover:-translate-y-1 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/50"
                            style={{
                              background: 'rgba(255,255,255,0.55)',
                              backdropFilter: 'blur(12px)',
                              WebkitBackdropFilter: 'blur(12px)',
                              border: '1px solid rgba(255,255,255,0.7)',
                              boxShadow: '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'}
                          >
                            {/* 3-col 2-row layout */}
                            <div className="grid grid-cols-3 gap-x-3 gap-y-2">

                              {/* Row 1 */}
                              {/* Col 1: icon + name + issue flag */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{permit.name}</p>
                                  {hasIssue && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold w-fit mt-0.5">
                                      <IssueIcon />Issue
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Col 2: requirement ring */}
                              <div className="flex items-center justify-center">
                                {reqs.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <RequirementsRing done={reqDone} total={reqs.length} />
                                    <div>
                                      <p className="text-[10px] text-gray-400 leading-tight">out of {reqs.length}</p>
                                      <p className="text-[11px] font-semibold leading-tight mt-0.5 text-gray-500">reqt completed</p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Col 3: status badge */}
                              <div className="flex items-start justify-end">
                                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                              </div>

                              {/* Row 2 divider */}
                              <div className="col-span-3" style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

                              {/* Col 1: planned finish */}
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Planned</span>
                                <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.planned_finish ?? '--'}</span>
                              </div>

                              {/* Col 2: forecast finish */}
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Forecast</span>
                                <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.forecast_finish ?? '--'}</span>
                              </div>

                              {/* Col 3: days delayed / on track */}
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Delay</span>
                                {delayed > 0
                                  ? <span className="text-[10px] font-semibold text-red-500">{delayed}d</span>
                                  : <span className="text-[10px] font-semibold text-emerald-600">On track</span>
                                }
                              </div>

                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>

          </div>
        </div>
        </main>
      </div>

      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={profile?.role === 'head'}
          isReporter={profile?.role === 'reporter'}
          isViewer={profile?.role === 'viewer'}
          currentUserId={profile?.id}
          projectName={selected?.projects?.name}
          onClose={() => setSelected(null)}
          onUpdated={fetchAll}
        />
      )}
    </div>
  )
}

// -- Sidebar tooltip ---------------------------------------------------------
function RequirementsRing({ done, total }) {
  const size = 48
  const strokeWidth = 4
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  const dash = pct * circ
  const color = done === total ? '#10b981' : '#ed6055'
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        dominantBaseline="middle" textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px`, fontSize: 13, fontWeight: 700, fill: color }}
      >
        {done}
      </text>
    </svg>
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

// -- Icons -------------------------------------------------------------------
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
