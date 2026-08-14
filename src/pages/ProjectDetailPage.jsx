import { useState, useEffect } from 'react'
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
    { label: 'Standard Permits',      path: '/admin/standard-permits',      Icon: DocumentCheckIcon, comingSoon: true },
    { label: 'Work Program Template', path: '/admin/work-program-template', Icon: TemplateIcon,      comingSoon: true },
    { label: 'User Management',       path: '/admin/users',                 Icon: UsersIcon },
    { label: 'Settings',              path: '/admin/settings',              Icon: SettingsIcon },
  ],
]

const PROJECT_NAV = [
  { key: null,               label: 'Project Info',      Icon: InfoIcon },
  { key: 'Work Program',     label: 'Work Program',      Icon: WorkProgramIcon },
  { key: 'Planned M4/M5',   label: 'Planned M4/M5',     Icon: CalendarIcon },
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

  const [project,   setProject]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [section,   setSection]   = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || 'Project Info'
    return tab === 'Project Info' ? null : tab
  })
  const [reportOpen,  setReportOpen]  = useState(false)
  const [expanded,    setExpanded]    = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [menuOpen,    setMenuOpen]    = useState(false)

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

  if (loading || profileLoading) return <LoadingScreen />
  if (!project) return <LoadingScreen />

  const activeLabel = section === null ? 'Project Info' : section

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
        <nav className="flex flex-col flex-1 w-full px-2 gap-0.5 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden">
          {/* Main app nav */}
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
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 20, background: '#ed6055' }} />
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

          {/* -- Project nav section -- */}
          <div className="my-2 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
          {expanded && (
            <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ color: 'rgba(255,255,255,0.28)' }}>
              {project.name}
            </p>
          )}
          {PROJECT_NAV.map((item) => {
            const { Icon } = item
            const isActive = section === item.key
            return (
              <div key={String(item.key)} className="relative group">
                <button
                  onClick={() => {
                    setSection(item.key)
                    setSearchParams({ tab: item.key ?? 'Project Info' })
                  }}
                  className={[
                    'flex items-center w-full h-10 rounded-lg transition-all duration-150',
                    isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/75',
                  ].join(' ')}
                  style={{ justifyContent: expanded ? 'flex-start' : 'center', paddingLeft: expanded ? 12 : 0 }}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 3, height: 16, background: '#ed6055' }} />
                  )}
                  <Icon className="w-[16px] h-[16px] flex-shrink-0" />
                  {expanded && <span className="ml-3 text-xs font-medium whitespace-nowrap">{item.label}</span>}
                </button>
                {!expanded && <SidebarTooltip label={item.label} />}
              </div>
            )
          })}

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
        <main className="flex-1 overflow-hidden flex flex-col">

          {/* Header */}
          <header className="flex-shrink-0 flex items-center h-14 px-5 gap-4" style={{ background: 'transparent' }}>
            {/* Back to projects */}
            <button
              onClick={() => navigate('/projects')}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition text-sm flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-lg font-bold text-gray-800 tracking-wide truncate">{project.name}</span>
            {activeLabel !== 'Project Info' && (
              <span className="text-sm text-gray-400 flex-shrink-0">/ {activeLabel}</span>
            )}
            <div className="flex-1" />

            {/* Report button */}
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

            <NotificationBell userId={profile?.id} variant="light" />

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

          {/* Project detail content — fills remaining height */}
          <div className="flex-1 overflow-hidden">
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
              }}
              onTabChange={(tab) => setSearchParams({ tab })}
              reportOpen={reportOpen}
              onReportClose={() => setReportOpen(false)}
            />
          </div>
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
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
}
function WorkProgramIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>
}
function CalendarIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
}
function PermitsIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
}
function SCurveIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
}
function UnitCompletionIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function PhotosIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
}
function IssuesIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
}
