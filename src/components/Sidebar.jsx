import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from './Logo'

// ── Nav items per role ──────────────────────────────────────────────────────
const NAV = {
  admin: [
    { label: 'Dashboard',        path: '/admin/dashboard',        Icon: HomeIcon },
    { label: 'Projects',         path: '/projects',               Icon: FolderIcon },
    { label: 'Standard Permits', path: '/admin/standard-permits', Icon: DocumentCheckIcon },
    { label: 'Role Assignment',  path: '/admin/roles',            Icon: ShieldIcon },
  ],
  approver: [
    { label: 'Dashboard', path: '/approver/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',           Icon: FolderIcon },
  ],
  updater: [
    { label: 'Dashboard', path: '/updater/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',          Icon: FolderIcon },
  ],
  viewer: [
    { label: 'Dashboard', path: '/viewer/dashboard', Icon: HomeIcon },
    { label: 'Projects',  path: '/projects',         Icon: FolderIcon },
  ],
}

const ROLE_LABELS = { admin: 'Admin', approver: 'Approver', updater: 'Updater', viewer: 'Viewer' }
const ROLE_BADGE  = {
  admin:    'bg-white text-black',
  approver: 'bg-[#ed6055] text-white',
  updater:  'bg-blue-500 text-white',
  viewer:   'bg-gray-500 text-white',
}

// ── Component ───────────────────────────────────────────────────────────────
export default function Sidebar({ profile, open, onClose }) {
  const navigate = useNavigate()
  const items = NAV[profile?.role] ?? []

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
        {/* Safe-area spacer — clears iOS status bar on PWA */}
        <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

        {/* ── Header: Logo + Close ── */}
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

        {/* ── Navigation ── */}
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

        {/* ── Footer ── */}
        <div className="border-t border-white/5 flex-shrink-0 px-2 pt-3 pb-3 space-y-0.5">
          {/* User info — links to profile page */}
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

// ── Icons ───────────────────────────────────────────────────────────────────
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
