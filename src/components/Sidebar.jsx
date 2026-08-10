import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from './Logo'
import { ROLE_LABELS, ROLE_BADGE, navKeyForProfile } from '../lib/roles'

// -- Nav items per role ------------------------------------------------------
const NAV = {
  admin: [
    { label: 'Dashboard',             path: '/admin/dashboard',              Icon: HomeIcon },
    { label: 'Unit Completion',        path: '/admin/unit-completion',        Icon: ChartBarIcon },
    { label: 'Permits Dashboard',      path: '/admin/permits',                Icon: ClipboardListIcon },
    { label: 'Projects',              path: '/projects',                     Icon: FolderIcon },
    { label: 'Standard Permits',      path: '/admin/standard-permits',       Icon: DocumentCheckIcon },
    { label: 'Work Program Template', path: '/admin/work-program-template',  Icon: TemplateIcon },
    { label: 'User Management',       path: '/admin/users',                  Icon: UsersIcon },
    { label: 'Settings',              path: '/admin/settings',               Icon: SettingsIcon },
  ],
  ho: [
    { label: 'Dashboard',         path: '/ho/dashboard',   Icon: HomeIcon },
    { label: 'Projects',          path: '/projects',       Icon: FolderIcon },
    { label: 'Permits Dashboard', path: '/admin/permits',  Icon: ClipboardListIcon },
  ],
  reporter: [
    { label: 'Dashboard', path: '/reporter/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',           Icon: FolderIcon },
  ],
  viewer: [
    { label: 'Dashboard', path: '/viewer/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',         Icon: FolderIcon },
  ],
  member: [
    { label: 'Dashboard', path: '/admin/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',        Icon: FolderIcon },
  ],
}

// -- Component ---------------------------------------------------------------
export default function Sidebar({ profile, open, onClose }) {
  const navigate = useNavigate()
  const items = NAV[navKeyForProfile(profile)] ?? []

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  const initial = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#2d2d2d]',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Safe-area spacer -- clears iOS status bar on PWA */}
        <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

        {/* -- Header: Logo + Close -- */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/5 flex-shrink-0">
          <Logo size="md" variant="white" />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition"
            aria-label="Close menu"
          >
            <XIcon />
          </button>
        </div>

        {/* -- Navigation -- */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <p className="px-4 mb-1.5 text-[10px] font-semibold text-white/20 uppercase tracking-widest select-none">
            Menu
          </p>

          <ul className="space-y-px px-2">
            {items.map((item) => {
              const { Icon } = item

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) => [
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                      'border-l-[3px] transition-all duration-150 group',
                      isActive
                        ? 'bg-white/10 text-white border-[#ed6055]'
                        : 'text-white/45 border-transparent hover:bg-white/[0.06] hover:text-white/80',
                    ].join(' ')}
                  >
                    <Icon className="w-[18px] h-[18px] flex-shrink-0 transition-transform duration-150 group-hover:scale-110" />
                    <span className="text-sm font-medium leading-none">{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>

        </nav>

        {/* -- Footer -- */}
        <div className="border-t border-white/5 flex-shrink-0 px-2 pt-3 pb-3 space-y-0.5">
          {/* User info -- links to profile page */}
          <NavLink
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.06] transition group"
          >
            <div className="w-7 h-7 rounded-full bg-[#ed6055]/20 border border-[#ed6055]/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-[11px] font-bold text-[#ed6055]">{initial}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-semibold truncate leading-tight group-hover:text-white transition">
                {profile?.full_name ?? profile?.email}
              </p>
              {profile?.user_code && (
                <p className="text-white/50 text-[9px] font-mono truncate mt-0.5 leading-tight">
                  {profile.user_code}
                </p>
              )}
              <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[profile?.role] ?? 'bg-gray-500 text-white'}`}>
                {ROLE_LABELS[profile?.role] ?? profile?.role}
              </span>
            </div>
          </NavLink>

          {/* Sign out */}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-white/30 hover:text-white/70 hover:bg-white/[0.06] text-xs font-medium"
          >
            <SignOutIcon className="w-[17px] h-[17px] flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// -- Icons -------------------------------------------------------------------
function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
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
function SignOutIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
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
function TemplateIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
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
