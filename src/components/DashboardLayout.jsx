import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Logo from './Logo'
import { supabase } from '../lib/supabaseClient'

const ROLE_LABELS = {
  admin:    'Admin',
  approver: 'Approver',
  updater:  'Updater',
  viewer:   'Viewer',
}


export default function DashboardLayout({ profile, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''
  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Topbar ── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 flex items-center h-12"
        style={{ background: '#ed6055', borderBottom: '1px solid rgba(0,0,0,0.10)' }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="h-full px-4 flex items-center flex-shrink-0 text-white/70 hover:text-white hover:bg-black/10 transition"
        >
          <HamburgerIcon />
        </button>

        {/* Logo */}
        <div className="px-3 flex items-center flex-shrink-0">
          <Logo size="sm" variant="white" />
        </div>

        <div className="w-px h-5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.30)' }} />

        {/* Company + division */}
        <div className="px-4 flex items-center gap-2 min-w-0">
          <span className="text-white text-xs font-semibold whitespace-nowrap tracking-wide">
            PH1 World Developers
          </span>
          <span className="text-white/40 text-xs flex-shrink-0 hidden sm:inline">|</span>
          <span className="text-xs whitespace-nowrap hidden sm:inline" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Design &amp; Construction Division
          </span>
        </div>

        <div className="flex-1" />

        {/* User menu */}
        <div className="relative flex-shrink-0 px-5" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-black/10 transition"
          >
            <div className="text-right hidden sm:block">
              <p className="text-white text-xs font-semibold leading-tight">{profile?.full_name ?? ''}</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {roleLabel}
              </p>
            </div>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20 ring-1 ring-white/40">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-[10px] font-bold text-white">{initial}</span>
              }
            </div>

            <ChevronIcon open={menuOpen} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-black truncate">{profile?.full_name ?? profile?.email}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{profile?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile') }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-black transition text-left"
              >
                <ProfileIcon />
                View Profile
              </button>
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-black transition text-left"
              >
                <SignOutIcon />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar profile={profile} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="pt-12">
        <div className="px-3 sm:px-4 py-3">
          {children}
        </div>
      </div>

    </div>
  )
}

function HamburgerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className="w-3 h-3 flex-shrink-0 transition-transform"
      style={{ color: 'rgba(255,255,255,0.75)', transform: open ? 'rotate(180deg)' : 'none' }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}
