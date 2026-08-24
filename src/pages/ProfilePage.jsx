import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import useProfile from '../hooks/useProfile'
import useMinLoading from '../hooks/useMinLoading'
import LoadingScreen from '../components/LoadingScreen'
import Logo from '../components/Logo'
import NotificationBell from '../components/NotificationBell'
import { ROLE_LABELS } from '../lib/roles'

const NAV_GROUPS = [
  [
    { label: 'Dashboard',         path: '/admin/dashboard', Icon: HomeIcon },
    { label: 'Unit Completion',   path: '/unit-completion', Icon: ChartBarIcon },
    { label: 'Permits Dashboard', path: '/permits',         Icon: ClipboardListIcon },
    { label: 'Projects',          path: '/projects',        Icon: FolderIcon },
  ],
  [
    { label: 'User Management', path: '/admin/users',    Icon: UsersIcon },
    { label: 'Settings',        path: '/admin/settings', Icon: SettingsIcon },
  ],
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

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const isSite  = profile?.team === 'site'

  const navGroups = NAV_GROUPS.map(group =>
    group.filter(item => !isSite || item.path === '/projects')
  ).filter(group => group.length > 0)

  const [expanded,         setExpanded]         = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [showLabels,       setShowLabels]       = useState(() => localStorage.getItem('sidebar_expanded') === 'true')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [menuOpen,         setMenuOpen]         = useState(false)
  const menuRef = useRef(null)

  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initial   = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? ''

  const showLoading = useMinLoading(profileLoading)
  if (showLoading) return <LoadingScreen />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-200" style={{ minHeight: '100dvh' }}>

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 sm:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed sm:relative inset-y-0 left-0 z-40 sm:z-auto flex-shrink-0 flex flex-col py-3 gap-1 transition-transform duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0`}
        style={{
          width: expanded ? 240 : 80,
          background: 'rgba(18,18,18,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transition: 'transform 220ms cubic-bezier(0.4,0,0.2,1), width 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 flex-shrink-0 border-b border-white/5 mb-1"
          style={{ paddingLeft: expanded ? 16 : 0, justifyContent: expanded ? 'flex-start' : 'center', overflow: 'hidden' }}
        >
          <div style={{ flexShrink: 0, overflow: 'hidden', maxWidth: expanded ? 'none' : 56 }}>
            <Logo size="md" variant="white" />
          </div>
          {showLabels && (
            <span className="ml-3 text-white font-bold text-base tracking-wide whitespace-nowrap overflow-hidden">D&amp;C Dashboard</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1 w-full px-2 gap-0.5">
          {navGroups.map((group, gi) => (
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
                      onClick={() => setMobileSidebarOpen(false)}
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

          <div className="flex-1" />

          {isAdmin && <div className="my-1 mx-1" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />}
          {isAdmin && (
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
          )}

          {/* Collapse toggle */}
          <div className="mt-1 relative group">
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
              {showLabels && <span className="ml-3 text-xs font-medium whitespace-nowrap">Collapse</span>}
            </button>
            {!showLabels && <SidebarTooltip label="Expand" />}
          </div>
        </nav>
      </aside>

      {/* Floating hamburger (mobile) */}
      {!mobileSidebarOpen && (
        <button
          className="sm:hidden fixed z-50 flex items-center justify-center w-9 h-9 rounded-xl shadow-lg transition-all"
          style={{ top: 110, left: 12, background: 'rgba(240,240,240,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}
          onClick={() => setMobileSidebarOpen(v => !v)}
          aria-label="Open menu"
        >
          <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      )}

      {/* Right column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex items-center h-14 px-5 gap-4"
          style={{ background: 'transparent', borderBottom: 'none', boxShadow: 'none' }}
        >
          <span className="text-lg font-bold text-gray-800 tracking-wide">My Profile</span>
          <div className="flex-1" />
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
                style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
              >
                <button
                  onClick={() => { setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#ed6055] bg-[#ed6055]/5 text-left"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <span>My Profile</span>
                </button>
                <div style={{ height: 1, background: '#f3f4f6', margin: '0 12px' }} />
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-12">
          <div className="max-w-lg mx-auto space-y-5">
            <AvatarSection profile={profile} showToast={showToast} />
            <PasswordSection showToast={showToast} />
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── Section components (unchanged) ──────────────────────────────────────────

function AvatarSection({ profile, showToast }) {
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null)
  const [uploading, setUploading]   = useState(false)
  const [name, setName]             = useState(profile?.full_name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName]   = useState(false)
  const fileRef = useRef(null)

  const initial = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const ext = file.name.split('.').pop()
    const path = `${session.user.id}/avatar.${ext}`
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadErr) { showToast('Upload failed: ' + uploadErr.message, 'error'); setUploading(false); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${data.publicUrl}?t=${Date.now()}`
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', session.user.id)
    setAvatarUrl(url)
    setUploading(false)
    showToast('Profile picture updated.', 'success')
    e.target.value = ''
  }

  const saveName = async () => {
    if (!name.trim()) return
    setSavingName(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session.user.id)
    setSavingName(false)
    if (error) { showToast('Failed to save name.', 'error'); return }
    showToast('Name updated.', 'success')
    setEditingName(false)
  }

  const inputCls = 'flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1 h-4 rounded-full bg-[#ed6055] inline-block" />
        <h2 className="text-sm font-bold text-black">Profile</h2>
      </div>
      <div className="flex items-center gap-5 mb-6">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-100 bg-[#ed6055]/10 flex items-center justify-center">
            {avatarUrl
              ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              : <span className="text-2xl font-bold text-[#ed6055]">{initial}</span>
            }
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#ed6055] text-white flex items-center justify-center shadow-md hover:bg-[#d94f45] transition disabled:opacity-60"
            title="Change photo"
          >
            {uploading ? <SpinnerIcon /> : <CameraIcon />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
        </div>
        <div>
          <p className="text-base font-bold text-black leading-tight">{profile?.full_name ?? '--'}</p>
          <p className="text-sm text-gray-400 mt-0.5">{profile?.email}</p>
          <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-500 text-white">
            {ROLE_LABELS[profile?.role] ?? profile?.role}
          </span>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Display Name</label>
        {editingName ? (
          <div className="flex gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              placeholder="Your name"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setName(profile?.full_name ?? '') } }}
            />
            <button onClick={saveName} disabled={savingName || !name.trim()} className="px-3 py-2 rounded-lg bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
              {savingName ? '…' : 'Save'}
            </button>
            <button onClick={() => { setEditingName(false); setName(profile?.full_name ?? '') }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm text-black font-medium">{profile?.full_name ?? '--'}</p>
            <button onClick={() => setEditingName(true)} className="text-[11px] text-[#ed6055] hover:text-[#d94f45] font-semibold transition">Edit</button>
          </div>
        )}
      </div>
    </div>
  )
}

function PasswordSection({ showToast }) {
  const [form, setForm]           = useState({ current: '', password: '', confirm: '' })
  const [saving, setSaving]       = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [currentErr, setCurrentErr] = useState('')

  const mismatch = form.password && form.confirm && form.password !== form.confirm
  const weak     = form.password && form.password.length < 8
  const disabled = saving || !form.current || !form.password || !form.confirm || !!mismatch || !!weak

  const save = async (e) => {
    e.preventDefault()
    if (disabled) return
    setSaving(true)
    setCurrentErr('')
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: form.current })
    if (authErr) { setCurrentErr('Current password is incorrect.'); setSaving(false); return }
    const { error } = await supabase.auth.updateUser({ password: form.password })
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Password updated successfully.', 'success')
    setForm({ current: '', password: '', confirm: '' })
  }

  const inputCls = (err) =>
    `w-full pl-3 pr-10 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent bg-white text-black placeholder-gray-400 transition ${
      err ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-[#ed6055]'
    }`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1 h-4 rounded-full bg-[#ed6055] inline-block" />
        <h2 className="text-sm font-bold text-black">Change Password</h2>
      </div>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Current Password</label>
          <div className="relative">
            <input type={showCurrent ? 'text' : 'password'} value={form.current} onChange={e => { setForm(f => ({ ...f, current: e.target.value })); setCurrentErr('') }} placeholder="Enter your current password" className={inputCls(currentErr)} />
            <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">{showCurrent ? <EyeOffIcon /> : <EyeIcon />}</button>
          </div>
          {currentErr && <p className="text-xs text-red-500 mt-1">{currentErr}</p>}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="mb-4">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">New Password</label>
            <div className="relative">
              <input type={showNew ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" className={inputCls(weak)} />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">{showNew ? <EyeOffIcon /> : <EyeIcon />}</button>
            </div>
            {weak && <p className="text-xs text-red-500 mt-1">Must be at least 8 characters.</p>}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input type={showConf ? 'text' : 'password'} value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat new password" className={inputCls(mismatch)} />
              <button type="button" onClick={() => setShowConf(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">{showConf ? <EyeOffIcon /> : <EyeIcon />}</button>
            </div>
            {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>}
          </div>
        </div>
        <button type="submit" disabled={disabled} className="w-full py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
          {saving ? 'Verifying…' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
function CameraIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
