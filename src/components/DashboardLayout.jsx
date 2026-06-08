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
    <div className="min-h-screen bg-[#e4e7ec]">

      {/* ── Topbar ── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 flex items-center h-16"
        style={{ background: 'rgba(63,63,63,1)', borderBottom: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 1px 0 rgba(0,0,0,0.18)' }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="h-full px-4 flex items-center flex-shrink-0 text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <HamburgerIcon />
        </button>

        {/* Logo */}
        <div className="px-3 flex items-center flex-shrink-0">
          <Logo size="md" variant="white" />
        </div>

        <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }} />

        {/* Title */}
        <div className="px-4 flex items-center min-w-0">
          <span className="text-white text-base font-bold whitespace-nowrap tracking-wide sm:hidden">
            D&amp;C Dashboard
          </span>
          <span className="text-white text-base font-bold whitespace-nowrap tracking-wide hidden sm:inline">
            Design &amp; Construction Dashboard
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
              <p className="text-xs leading-tight mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {roleLabel}
              </p>
            </div>

            {/* Avatar */}
            <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20 ring-1 ring-white/40">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-xs font-bold text-white">{initial}</span>
              }
            </div>

            <ChevronIcon open={menuOpen} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-2xl z-50 overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #444444 0%, #333333 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset',
                animation: 'ph1-dropdown 0.15s ease-out both',
              }}
            >
              {/* User info block */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-white/20" style={{ background: 'rgba(237,96,85,0.25)' }}>
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-[#ed6055]">{initial}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate leading-tight">{profile?.full_name ?? profile?.email}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{profile?.email}</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(237,96,85,0.2)', color: '#ed6055', border: '1px solid rgba(237,96,85,0.3)' }}>
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' }} />

              {/* Actions */}
              <div className="p-2">
                <button
                  onClick={() => { setMenuOpen(false); navigate('/profile') }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition text-left group"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <ProfileIcon />
                  </div>
                  <span className="font-medium">View Profile</span>
                </button>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition text-left group"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/10 transition" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <SignOutIcon />
                  </div>
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar profile={profile} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="pt-16">
        <div className="px-3 sm:px-4 py-3">
          {children}
        </div>
      </div>

    </div>
  )
}

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
