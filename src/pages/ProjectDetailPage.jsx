import { useState, useEffect, useRef } from 'react'
import { NavLink, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import useProfile from '../hooks/useProfile'
import LoadingScreen from '../components/LoadingScreen'
import ProjectDetailModal from '../components/ProjectDetailModal'
import Logo from '../components/Logo'
import NotificationBell from '../components/NotificationBell'
import { ROLE_LABELS } from '../lib/roles'

export const slugify = (str) =>
  str?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? ''

const NAV_GROUPS = [
  [
    { label: 'Dashboard',        path: '/admin/dashboard',   Icon: HomeIcon },
    { label: 'Unit Completion',  path: '/unit-completion',   Icon: ChartBarIcon },
    { label: 'Permits Dashboard',path: '/permits',           Icon: ClipboardListIcon },
    { label: 'Projects',         path: '/projects',          Icon: FolderIcon },
  ],
  [
    { label: 'User Management', path: '/admin/users', Icon: UsersIcon },
  ],
]

const PROJECT_NAV = [
  { key: null,               label: 'Project Info',      Icon: InfoIcon },
  { key: 'Work Program',     label: 'Work Program',      Icon: WorkProgramIcon },
  { key: 'Permits',          label: 'Permits',            Icon: PermitsIcon },
  { key: 'S-Curve',          label: 'S-Curve',            Icon: SCurveIcon },
  { key: 'Unit Completion',  label: 'Unit Completion',    Icon: UnitCompletionIcon },
  { key: 'Photos',           label: 'Photos',             Icon: PhotosIcon },
  { key: 'Issues & Concerns',label: 'Issues & Concerns',  Icon: IssuesIcon },
]

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

export default function ProjectDetailPage() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const isSite  = profile?.team === 'site'
  const navGroups = NAV_GROUPS.map(group =>
    group.filter(item => !isSite || item.path === '/projects')
  ).filter(group => group.length > 0)

  const [project,   setProject]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [section,   setSection]   = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || 'Project Info'
    return tab === 'Project Info' ? null : tab
  })
  const [reportOpen,       setReportOpen]       = useState(false)
  const [permitsSearch,    setPermitsSearch]    = useState('')
  const [photosSearch,     setPhotosSearch]     = useState('')
  const [permitsFilter,    setPermitsFilter]    = useState('all')
  const [permitsCreating,    setPermitsCreating]    = useState(false)
  const [permitsFilterOpen,  setPermitsFilterOpen]  = useState(false)
  const [permitsActionsOpen, setPermitsActionsOpen] = useState(false)
  const [photosFilterTags,   setPhotosFilterTags]   = useState([])
  const [photosFilterMonth,  setPhotosFilterMonth]  = useState('')
  const [photosSortOrder,    setPhotosSortOrder]    = useState('newest')
  const [photosFiltersOpen,  setPhotosFiltersOpen]  = useState(false)
  const [photosActionsOpen,  setPhotosActionsOpen]  = useState(false)
  const [photosShowUpload,   setPhotosShowUpload]   = useState(false)
  const [issuesSearch,          setIssuesSearch]          = useState('')
  const [issuesFilterStatus,    setIssuesFilterStatus]    = useState('all')
  const [issuesFilterGroup,     setIssuesFilterGroup]     = useState('all')
  const [issuesFilterMgmtLevel, setIssuesFilterMgmtLevel] = useState('all')
  const [issuesFiltersOpen,     setIssuesFiltersOpen]     = useState(false)
  const [issuesActionsOpen,     setIssuesActionsOpen]     = useState(false)
  const [issuesShowAdd,         setIssuesShowAdd]         = useState(false)
  const issuesFnsRef     = useRef({})
  const ganttFnsRef      = useRef({})
  const mainScrollRef    = useRef(null)
  const [ganttActionsOpen, setGanttActionsOpen] = useState(false)
  const ganttActionsRef  = useRef(null)
  const [ganttBLName, setGanttBLName] = useState(null)
  const [expanded,          setExpanded]          = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [showLabels,        setShowLabels]        = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileSearchOpen,  setMobileSearchOpen]  = useState(false)
  const sidebarExpanded   = mobileSidebarOpen || expanded
  const sidebarShowLabels = mobileSidebarOpen || showLabels
  const tooltipRef    = useRef(null)
  const filterPopRef        = useRef(null)
  const actionsPopRef       = useRef(null)
  const photosFilterPopRef   = useRef(null)
  const photosActionsPopRef  = useRef(null)
  const issuesFilterPopRef   = useRef(null)
  const issuesActionsPopRef  = useRef(null)

  const showTooltip = (e, label) => {
    if (sidebarShowLabels) return
    const rect = e.currentTarget.getBoundingClientRect()
    const el = tooltipRef.current
    if (!el) return
    el.textContent = label
    el.style.top = `${rect.top + rect.height / 2}px`
    el.style.opacity = '1'
  }
  const hideTooltip = () => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0'
  }
  const [menuOpen,    setMenuOpen]    = useState(false)

  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''

  const toggleSidebar = () => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = '0'
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

  useEffect(() => {
    const handler = (e) => {
      if (filterPopRef.current && !filterPopRef.current.contains(e.target)) setPermitsFilterOpen(false)
      if (actionsPopRef.current && !actionsPopRef.current.contains(e.target)) setPermitsActionsOpen(false)
      if (photosFilterPopRef.current && !photosFilterPopRef.current.contains(e.target)) setPhotosFiltersOpen(false)
      if (photosActionsPopRef.current && !photosActionsPopRef.current.contains(e.target)) setPhotosActionsOpen(false)
      if (issuesFilterPopRef.current && !issuesFilterPopRef.current.contains(e.target)) setIssuesFiltersOpen(false)
      if (issuesActionsPopRef.current && !issuesActionsPopRef.current.contains(e.target)) setIssuesActionsOpen(false)
      if (ganttActionsRef.current && !ganttActionsRef.current.contains(e.target)) setGanttActionsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const idFromState = location.state?.id
    if (idFromState) {
      supabase.from('projects').select('*').eq('id', idFromState).single()
        .then(({ data }) => { setProject(data); setLoading(false) })
    } else {
      supabase.from('projects').select('*')
        .then(({ data }) => {
          const match = data?.find(p =>
            slugify(p.project_code) === slug || slugify(p.name) === slug
          )
          setProject(match ?? null)
          setLoading(false)
        })
    }
  }, [slug, location.state?.id])

  useEffect(() => {
    if (!project) return
    document.title = `${project.name} -- D&C Dashboard`
    return () => { document.title = 'D&C Dashboard' }
  }, [project?.name])

  useEffect(() => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0
    setMobileSearchOpen(false)
  }, [section])

  if (loading || profileLoading) return <LoadingScreen />
  if (!project) return <LoadingScreen />

  const activeLabel = section === null ? 'Project Info' : section

  return (
    <div className="flex h-screen overflow-hidden bg-gray-200" style={{ minHeight: '100dvh' }}>

      {/* -- Mobile sidebar backdrop -- */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 sm:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* -- Sidebar -- */}
      <aside
        className={`${mobileSidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} sm:relative sm:flex sm:z-auto flex-shrink-0 flex-col py-3 gap-1`}
        style={{
          width: sidebarExpanded ? 240 : 80,
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: mobileSidebarOpen ? 40 : 1,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 flex-shrink-0 border-b border-white/5 mb-1"
          style={{ paddingLeft: sidebarExpanded ? 16 : 0, justifyContent: sidebarExpanded ? 'flex-start' : 'center' }}
        >
          <Logo size="md" />
          {sidebarShowLabels && (
            <span className="ml-3 text-white font-bold text-base tracking-wide whitespace-nowrap overflow-hidden">D&amp;C Dashboard</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1 w-full px-2 gap-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden">
          {/* Main app nav */}
          {navGroups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {gi > 0 && (
                <div className="my-2 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
              )}
              {group.map((item) => {
                const { Icon } = item
                return (
                  <div key={item.path}>
                    <div className="relative group"
                      onMouseEnter={(e) => showTooltip(e, item.label)}
                      onMouseLeave={hideTooltip}
                    >
                      <NavLink
                        to={item.path}
                        className={({ isActive }) => [
                          'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                          isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                        ].join(' ')}
                        style={{ justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 12 : 0 }}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: '#ed6055' }} />
                            )}
                            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                            {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                          </>
                        )}
                      </NavLink>
                    </div>
                    {item.children?.map(child => {
                      const CIcon = child.Icon
                      if (child.comingSoon) {
                        return (
                          <div key={child.path} className="relative group"
                            onMouseEnter={(e) => showTooltip(e, `${child.label} (Soon)`)}
                            onMouseLeave={hideTooltip}
                          >
                            <div
                              className="flex items-center w-full h-9 rounded-lg cursor-default"
                              style={{ color: 'rgba(255,255,255,0.18)', justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 28 : 0 }}
                            >
                              <CIcon className="w-[15px] h-[15px] flex-shrink-0" />
                              {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{child.label}</span>}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={child.path} className="relative group"
                          onMouseEnter={(e) => showTooltip(e, child.label)}
                          onMouseLeave={hideTooltip}
                        >
                          <NavLink
                            to={child.path}
                            className={({ isActive }) => [
                              'flex items-center w-full h-9 rounded-lg transition-all duration-150',
                              isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                            ].join(' ')}
                            style={{ justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 28 : 0 }}
                          >
                            {({ isActive }) => (
                              <>
                                {isActive && (
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 16, background: '#ed6055' }} />
                                )}
                                <CIcon className="w-[15px] h-[15px] flex-shrink-0" />
                                {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{child.label}</span>}
                              </>
                            )}
                          </NavLink>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}

          {/* -- Project nav section -- */}
          <div className="my-2 mx-1" style={{ height: 1, minHeight: 1, flexShrink: 0, background: 'rgba(255,255,255,0.2)' }} />
          {sidebarShowLabels && (
            <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ color: 'rgba(255,255,255,0.28)' }}>
              {project.name}
            </p>
          )}
          {PROJECT_NAV.map((item) => {
            const { Icon } = item
            const isActive = section === item.key
            return (
              <div key={String(item.key)} className="relative group"
                onMouseEnter={(e) => showTooltip(e, item.label)}
                onMouseLeave={hideTooltip}
              >
                <button
                  onClick={() => {
                    setSection(item.key)
                    setSearchParams({ tab: item.key ?? 'Project Info' })
                  }}
                  className={[
                    'flex items-center w-full h-10 rounded-lg transition-all duration-150',
                    isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                  ].join(' ')}
                  style={{ justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 12 : 0 }}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 16, background: '#ed6055' }} />
                  )}
                  <Icon className="w-[16px] h-[16px] flex-shrink-0" />
                  {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                </button>
              </div>
            )
          })}
          {isAdmin && <div className="my-2 mx-1" style={{ height: 1, minHeight: 1, flexShrink: 0, background: 'rgba(255,255,255,0.2)' }} />}

          {/* Settings + collapse pinned to bottom */}
          <div className="flex-1" />
          {isAdmin && (
            <div className="relative group"
              onMouseEnter={(e) => showTooltip(e, 'Settings')}
              onMouseLeave={hideTooltip}
            >
              <NavLink
                to="/admin/settings"
                className={({ isActive }) => [
                  'flex items-center w-full h-11 rounded-lg transition-all duration-150',
                  isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                ].join(' ')}
                style={{ justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 12 : 0 }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: '#ed6055' }} />}
                    <SettingsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">Settings</span>}
                  </>
                )}
              </NavLink>
            </div>
          )}

          {/* Expand / collapse toggle — hidden on mobile */}
          <div className={`mt-1 relative group ${mobileSidebarOpen ? 'hidden' : ''}`}
            onMouseEnter={(e) => showTooltip(e, sidebarExpanded ? 'Collapse' : 'Expand')}
            onMouseLeave={hideTooltip}
          >
            <button
              onClick={toggleSidebar}
              className="flex items-center w-full h-11 rounded-lg transition-all duration-150 text-white/40 hover:bg-white/[0.07] hover:text-white/75"
              style={{ justifyContent: sidebarExpanded ? 'flex-start' : 'center', paddingLeft: sidebarExpanded ? 12 : 0 }}
            >
              <svg
                className="w-[18px] h-[18px] flex-shrink-0"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 220ms cubic-bezier(0.4,0,0.2,1)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              {sidebarShowLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">Collapse</span>}
            </button>
          </div>
        </nav>
      </aside>

      <div ref={tooltipRef} style={{
        position: 'fixed',
        left: 90,
        top: 0,
        transform: 'translateY(-50%)',
        background: '#1a1a1a',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        opacity: 0,
        transition: 'opacity 100ms',
      }} />

      {/* -- Floating hamburger (mobile only) -- */}
      {!mobileSidebarOpen && (
        <button
          className="sm:hidden fixed z-50 flex items-center justify-center w-9 h-9 rounded-xl shadow-lg"
          style={{ top: 110, left: 12, background: 'rgba(240,240,240,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      )}

      {/* -- Right column -- */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main ref={mainScrollRef} className={`flex-1 min-h-0 flex flex-col ${section === 'Work Program' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

          {/* Header */}
          <header className="flex items-center h-14 px-5 gap-4" style={{ background: 'transparent' }}>
            <span className="text-lg font-bold text-gray-800 tracking-wide truncate">{project.name}</span>
            {activeLabel !== 'Project Info' && (
              <span className="text-sm text-gray-400 hidden sm:flex flex-shrink-0 items-center gap-1.5">
                / {activeLabel}
                {section === 'Work Program' && ganttBLName && (
                  <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-semibold">{ganttBLName}</span>
                )}
              </span>
            )}
            <div className="flex-1" />

            {/* Photos controls — only visible on Photos tab */}
            {section === 'Photos' && (
              <>
              {/* Mobile search toggle */}
              <button
                className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border transition-all flex-shrink-0"
                style={{
                  background: mobileSearchOpen ? '#fff' : '#f9fafb',
                  borderColor: mobileSearchOpen ? '#ed6055' : '#e5e7eb',
                  color: mobileSearchOpen ? '#ed6055' : '#6b7280',
                  boxShadow: mobileSearchOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                }}
                onClick={() => setMobileSearchOpen(v => !v)}
                aria-label="Search"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
              </button>
              {/* Desktop search */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search photos…"
                  value={photosSearch}
                  onChange={e => setPhotosSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
                />
              </div>

              {/* Filter button */}
              {(() => {
                const PHOTO_TAGS = ['Foundation','Structural','MEP','Finishing','Facade','Landscaping','Issues','Progress','Inspection']
                const activeCount = [!!photosFilterMonth, photosFilterTags.length > 0].filter(Boolean).length
                return (
                  <div className="relative flex-shrink-0" ref={photosFilterPopRef}>
                    <button
                      onClick={() => setPhotosFiltersOpen(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                      style={{
                        background: photosFiltersOpen || activeCount > 0 ? '#fff' : '#f9fafb',
                        borderColor: activeCount > 0 ? '#ed6055' : photosFiltersOpen ? '#ed6055' : '#e5e7eb',
                        color: activeCount > 0 ? '#ed6055' : '#6b7280',
                        boxShadow: photosFiltersOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                      {activeCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none">{activeCount}</span>
                      )}
                    </button>
                    {photosFiltersOpen && (
                      <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64 flex flex-col gap-3">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Month</p>
                          <input type="month" value={photosFilterMonth} onChange={e => setPhotosFilterMonth(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/30" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {PHOTO_TAGS.map(tag => (
                              <button key={tag}
                                onClick={() => setPhotosFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                                style={photosFilterTags.includes(tag) ? { background: '#ed6055', color: '#fff' } : { background: '#f3f4f6', color: '#6b7280' }}
                              >{tag}</button>
                            ))}
                          </div>
                        </div>
                        {activeCount > 0 && (
                          <button onClick={() => { setPhotosFilterMonth(''); setPhotosFilterTags([]) }}
                            className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors">
                            Clear all filters
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Actions dropdown */}
              <div className="relative flex-shrink-0" ref={photosActionsPopRef}>
                <button
                  onClick={() => setPhotosActionsOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                  style={{
                    background: photosActionsOpen ? '#fff' : '#f9fafb',
                    borderColor: photosActionsOpen ? '#ed6055' : '#e5e7eb',
                    color: photosActionsOpen ? '#ed6055' : '#6b7280',
                    boxShadow: photosActionsOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                </button>
                {photosActionsOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" style={{ width: 180, animation: 'ph1-dropdown 0.15s ease-out both' }}>
                    <div className="p-1.5 space-y-0.5">
                      {(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
                        <button onClick={() => { setPhotosShowUpload(true); setPhotosActionsOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          Upload Photos
                        </button>
                      )}
                      <button onClick={() => { setPhotosSortOrder(s => s === 'newest' ? 'oldest' : 'newest'); setPhotosActionsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                        <svg className={`w-3.5 h-3.5 text-gray-400 ${photosSortOrder === 'oldest' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
                        </svg>
                        Sort: {photosSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                      </button>
                      <button onClick={() => { setReportOpen(true); setPhotosActionsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                        <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </>
            )}

            {/* Issues & Concerns controls — only visible on Issues tab */}
            {section === 'Issues & Concerns' && (
              <>
                {/* Mobile search toggle */}
                <button
                  className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border transition-all flex-shrink-0"
                  style={{
                    background: mobileSearchOpen ? '#fff' : '#f9fafb',
                    borderColor: mobileSearchOpen ? '#ed6055' : '#e5e7eb',
                    color: mobileSearchOpen ? '#ed6055' : '#6b7280',
                    boxShadow: mobileSearchOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                  onClick={() => setMobileSearchOpen(v => !v)}
                  aria-label="Search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                </button>
                {/* Desktop search */}
                <div className="relative flex-shrink-0 hidden sm:block">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search issues…"
                    value={issuesSearch}
                    onChange={e => setIssuesSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
                  />
                </div>

                {/* Filter button */}
                <div ref={issuesFilterPopRef} className="relative flex-shrink-0">
                  <button
                    onClick={() => setIssuesFiltersOpen(v => !v)}
                    className="relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all flex-shrink-0"
                    style={{
                      background: issuesFiltersOpen || issuesFilterStatus !== 'all' || issuesFilterGroup !== 'all' || issuesFilterMgmtLevel !== 'all' ? '#fff' : '#f9fafb',
                      borderColor: (issuesFilterStatus !== 'all' || issuesFilterGroup !== 'all' || issuesFilterMgmtLevel !== 'all') ? '#ed6055' : issuesFiltersOpen ? '#ed6055' : '#e5e7eb',
                      color: (issuesFilterStatus !== 'all' || issuesFilterGroup !== 'all' || issuesFilterMgmtLevel !== 'all') ? '#ed6055' : '#6b7280',
                      boxShadow: issuesFiltersOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                    {[issuesFilterStatus !== 'all', issuesFilterGroup !== 'all', issuesFilterMgmtLevel !== 'all'].filter(Boolean).length > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#ed6055] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {[issuesFilterStatus !== 'all', issuesFilterGroup !== 'all', issuesFilterMgmtLevel !== 'all'].filter(Boolean).length}
                      </span>
                    )}
                  </button>
                  {issuesFiltersOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden" style={{ width: 220, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', animation: 'ph1-dropdown 0.15s ease-out both' }}>
                      <div className="p-3 space-y-3">
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
                          <div className="flex flex-wrap gap-1">
                            {[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'close', label: 'Close' }, { value: 'hold', label: 'Hold' }].map(o => (
                              <button key={o.value} onClick={() => setIssuesFilterStatus(o.value)}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                                style={issuesFilterStatus === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Group</p>
                          <div className="flex flex-wrap gap-1">
                            {['all', 'Commercial', 'Design', 'Construction', 'Compliance'].map(g => (
                              <button key={g} onClick={() => setIssuesFilterGroup(g)}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                                style={issuesFilterGroup === g ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>
                                {g === 'all' ? 'All' : g}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Management Level</p>
                          <div className="flex flex-wrap gap-1">
                            {['all', 'ESA', 'Management Committee'].map(l => (
                              <button key={l} onClick={() => setIssuesFilterMgmtLevel(l)}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                                style={issuesFilterMgmtLevel === l ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>
                                {l === 'all' ? 'All' : l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(issuesFilterStatus !== 'all' || issuesFilterGroup !== 'all' || issuesFilterMgmtLevel !== 'all') && (
                          <button onClick={() => { setIssuesFilterStatus('all'); setIssuesFilterGroup('all'); setIssuesFilterMgmtLevel('all') }}
                            className="w-full py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition">
                            Clear filters
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions button */}
                <div ref={issuesActionsPopRef} className="relative flex-shrink-0">
                  <button
                    onClick={() => setIssuesActionsOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                    style={{
                      background: issuesActionsOpen ? '#fff' : '#f9fafb',
                      borderColor: issuesActionsOpen ? '#ed6055' : '#e5e7eb',
                      color: issuesActionsOpen ? '#ed6055' : '#6b7280',
                      boxShadow: issuesActionsOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                  {issuesActionsOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" style={{ width: 200, animation: 'ph1-dropdown 0.15s ease-out both' }}>
                      <div className="p-1.5 space-y-0.5">
                        <button onClick={() => { issuesFnsRef.current.export?.(); setIssuesActionsOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          Export to Excel
                        </button>
                        <label className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          Import from Excel
                          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.[0]) { issuesFnsRef.current.import?.(e.target.files[0]); setIssuesActionsOpen(false); e.target.value = '' } }} />
                        </label>
                        {(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
                          <>
                            <div className="h-px bg-gray-100 mx-2 my-1" />
                            <button onClick={() => { setIssuesShowAdd(true); setIssuesActionsOpen(false) }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#ed6055] hover:bg-[#ed6055]/5 transition text-left">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              Add Issue
                            </button>
                          </>
                        )}
                        <div className="h-px bg-gray-100 mx-2 my-1" />
                        <button onClick={() => { setReportOpen(true); setIssuesActionsOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Work Program controls — only visible on Work Program tab */}
            {section === 'Work Program' && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => ganttFnsRef.current.update?.()}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 transition active:scale-[0.97]"
                >
                  Update
                </button>
              <div className="relative flex-shrink-0" ref={ganttActionsRef}>
                <button
                  onClick={() => setGanttActionsOpen(v => !v)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border transition-all"
                  style={{
                    background: ganttActionsOpen ? '#fff' : '#f9fafb',
                    borderColor: ganttActionsOpen ? '#ed6055' : '#e5e7eb',
                    color: ganttActionsOpen ? '#ed6055' : '#6b7280',
                    boxShadow: ganttActionsOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                  aria-label="Actions"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                </button>
                {ganttActionsOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" style={{ width: 180, animation: 'ph1-dropdown 0.15s ease-out both' }}>
                    <div className="p-1.5 space-y-0.5">
                      <button
                        onClick={() => { ganttFnsRef.current.toggleSettings?.(); setGanttActionsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                        Settings
                      </button>
                      <button
                        onClick={() => { setReportOpen(true); setGanttActionsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition text-left"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </div>
            )}

            {/* Permits controls — only visible on Permits tab */}
            {section === 'Permits' && (
              <>
                {/* Mobile search toggle */}
                <button
                  className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border transition-all flex-shrink-0"
                  style={{
                    background: mobileSearchOpen ? '#fff' : '#f9fafb',
                    borderColor: mobileSearchOpen ? '#ed6055' : '#e5e7eb',
                    color: mobileSearchOpen ? '#ed6055' : '#6b7280',
                    boxShadow: mobileSearchOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                  onClick={() => setMobileSearchOpen(v => !v)}
                  aria-label="Search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                </button>
                {/* Desktop search */}
                <div className="relative flex-shrink-0 hidden sm:block">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search permits…"
                    value={permitsSearch}
                    onChange={e => setPermitsSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
                  />
                </div>

                {/* Filter button + popover */}
                <div className="relative flex-shrink-0" ref={filterPopRef}>
                  <button
                    onClick={() => setPermitsFilterOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                    style={{
                      background: permitsFilterOpen || permitsFilter !== 'all' ? '#fff' : '#f9fafb',
                      borderColor: permitsFilter !== 'all' ? '#ed6055' : permitsFilterOpen ? '#ed6055' : '#e5e7eb',
                      color: permitsFilter !== 'all' ? '#ed6055' : '#6b7280',
                      boxShadow: permitsFilterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                    {permitsFilter !== 'all' && (
                      <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">1</span>
                    )}
                  </button>
                  {permitsFilterOpen && (
                    <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-56 flex flex-col gap-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</p>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { key: 'all',          label: 'All' },
                          { key: 'pending',      label: 'Pending' },
                          { key: 'in-progress',  label: 'In Progress' },
                          { key: 'acquired',     label: 'Acquired' },
                          { key: 'overdue',      label: 'Overdue' },
                          { key: 'with-issues',  label: 'With Issues' },
                        ].map(s => (
                          <button key={s.key}
                            onClick={() => { setPermitsFilter(s.key); setPermitsFilterOpen(false) }}
                            className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                            style={permitsFilter === s.key
                              ? { background: '#ed6055', color: '#fff' }
                              : { background: '#f3f4f6', color: '#6b7280' }}
                          >{s.label}</button>
                        ))}
                      </div>
                      {permitsFilter !== 'all' && (
                        <button onClick={() => { setPermitsFilter('all'); setPermitsFilterOpen(false) }}
                          className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors">
                          Clear filter
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions dropdown */}
                <div className="relative flex-shrink-0" ref={actionsPopRef}>
                  <button
                    onClick={() => setPermitsActionsOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                    style={{
                      background: permitsActionsOpen ? '#fff' : '#f9fafb',
                      borderColor: permitsActionsOpen ? '#ed6055' : '#e5e7eb',
                      color: permitsActionsOpen ? '#ed6055' : '#6b7280',
                      boxShadow: permitsActionsOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    </svg>
                  </button>
                  {permitsActionsOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setPermitsActionsOpen(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5 min-w-[160px]">
                        <button
                          onClick={() => { setReportOpen(true); setPermitsActionsOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left"
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          Report
                        </button>
                        {isAdmin && (
                          <>
                            <div className="my-1 border-t border-gray-100" />
                            <button
                              onClick={() => { setPermitsCreating(true); setPermitsActionsOpen(false) }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#ed6055] hover:bg-[#ed6055]/5 transition text-left"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              Add Permit
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Setup button — Unit Completion tab only, opens Planned M4/M5 */}
            {section === 'Unit Completion' && (
              <button
                onClick={() => setSection('Planned M4/M5')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex-shrink-0"
                style={{ background: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Setup
              </button>
            )}

            {/* Report button — hidden on Permits/Photos/Issues/Work Program tabs (lives inside Actions dropdown there) */}
            {section !== 'Permits' && section !== 'Photos' && section !== 'Issues & Concerns' && section !== 'Work Program' && (
              <button
                onClick={() => setReportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex-shrink-0"
                style={{ background: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Report
              </button>
            )}

            <NotificationBell userId={profile?.id} />

            {/* User menu */}
            <div className="relative flex-shrink-0">
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

          {/* Mobile search expansion row */}
          {mobileSearchOpen && (section === 'Photos' || section === 'Issues & Concerns' || section === 'Permits') && (
            <div className="sm:hidden px-4 pb-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  autoFocus
                  placeholder={section === 'Photos' ? 'Search photos…' : section === 'Issues & Concerns' ? 'Search issues…' : 'Search permits…'}
                  value={section === 'Photos' ? photosSearch : section === 'Issues & Concerns' ? issuesSearch : permitsSearch}
                  onChange={e => {
                    const v = e.target.value
                    if (section === 'Photos') setPhotosSearch(v)
                    else if (section === 'Issues & Concerns') setIssuesSearch(v)
                    else setPermitsSearch(v)
                  }}
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-xl bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition"
                />
                {(section === 'Photos' ? photosSearch : section === 'Issues & Concerns' ? issuesSearch : permitsSearch) && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => {
                      if (section === 'Photos') setPhotosSearch('')
                      else if (section === 'Issues & Concerns') setIssuesSearch('')
                      else setPermitsSearch('')
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <ProjectDetailModal
              asPage
              project={project}
              isAdmin={isAdmin}
              onClose={() => navigate('/projects')}
              onProjectUpdated={(updated) => setProject(updated)}
              activeSection={section}
              onSectionChange={(s) => {
                setSection(s)
                setSearchParams({ tab: s ?? 'Project Info' })
                if (s !== 'Photos') { setPhotosSearch(''); setPhotosFilterTags([]); setPhotosFilterMonth(''); setPhotosSortOrder('newest'); setPhotosFiltersOpen(false); setPhotosActionsOpen(false); setPhotosShowUpload(false) }
                if (s !== 'Issues & Concerns') { setIssuesSearch(''); setIssuesFilterStatus('all'); setIssuesFilterGroup('all'); setIssuesFilterMgmtLevel('all'); setIssuesFiltersOpen(false); setIssuesActionsOpen(false); setIssuesShowAdd(false) }
                if (s !== 'Permits') {
                  setPermitsSearch('')
                  setPermitsFilter('all')
                  setPermitsCreating(false)
                  setPermitsFilterOpen(false)
                  setPermitsActionsOpen(false)
                }
              }}
              onTabChange={(tab) => setSearchParams({ tab })}
              reportOpen={reportOpen}
              onReportClose={() => setReportOpen(false)}
              permitsSearch={permitsSearch}
              onPermitsSearchChange={setPermitsSearch}
              permitsFilter={permitsFilter}
              onPermitsFilterChange={setPermitsFilter}
              permitsCreating={permitsCreating}
              onPermitsCreatingChange={setPermitsCreating}
              photosSearch={photosSearch}
              onPhotosSearchChange={setPhotosSearch}
              photosFilterTags={photosFilterTags}
              onPhotosFilterTagsChange={setPhotosFilterTags}
              photosFilterMonth={photosFilterMonth}
              onPhotosFilterMonthChange={setPhotosFilterMonth}
              photosSortOrder={photosSortOrder}
              onPhotosSortOrderChange={setPhotosSortOrder}
              photosShowUpload={photosShowUpload}
              onPhotosShowUploadChange={setPhotosShowUpload}
              issuesSearch={issuesSearch}
              onIssuesSearchChange={setIssuesSearch}
              issuesFilterStatus={issuesFilterStatus}
              onIssuesFilterStatusChange={setIssuesFilterStatus}
              issuesFilterGroup={issuesFilterGroup}
              onIssuesFilterGroupChange={setIssuesFilterGroup}
              issuesFilterMgmtLevel={issuesFilterMgmtLevel}
              onIssuesFilterMgmtLevelChange={setIssuesFilterMgmtLevel}
              issuesShowAdd={issuesShowAdd}
              onIssuesShowAddChange={setIssuesShowAdd}
              onIssuesRegisterFns={fns => { issuesFnsRef.current = fns }}
              onGanttRegisterFns={fns => { ganttFnsRef.current = fns }}
              onGanttActiveBLChange={setGanttBLName}
            />
        </main>
      </div>
    </div>
  )
}

// -- App-level icons -------------------------------------------------------------
function HomeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
}
function ChartBarIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
}
function ClipboardListIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
}
function FolderIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
}
function DocumentCheckIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M7.5 21h9a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0016.5 4.5h-9A2.25 2.25 0 005.25 6.75v12A2.25 2.25 0 007.5 21z" /></svg>
}
function TemplateIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
}
function SettingsIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}

// -- Project-level icons --------------------------------------------------------
function InfoIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
}
function WorkProgramIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h2.5M8 16.5h5.5" />
    </svg>
  )
}
function CalendarIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
}
function PermitsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
function SCurveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 20h18M3 20V8l4 3 4-6 4 4 4-5v16" />
    </svg>
  )
}
function UnitCompletionIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  )
}
function PhotosIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
}
function IssuesIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
}
