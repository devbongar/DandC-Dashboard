import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import useProfile from '../hooks/useProfile'
import AdminLayout from '../components/AdminLayout'
import { ROLE_LABELS } from '../lib/roles'

export default function ProfilePage() {
  const { profile } = useProfile()
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <AdminLayout title="My Profile">
      <main className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-12">
        <div className="max-w-lg mx-auto space-y-5">
          <AvatarSection profile={profile} showToast={showToast} />
          <PasswordSection showToast={showToast} />
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}>
          {toast.message}
        </div>
      )}
    </AdminLayout>
  )
}

// ── Section components ────────────────────────────────────────────────────────

function AvatarSection({ profile, showToast }) {
  const [avatarUrl, setAvatarUrl]     = useState(profile?.avatar_url ?? null)
  const [uploading, setUploading]     = useState(false)
  const [name, setName]               = useState(profile?.full_name ?? '')
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
              {savingName ? '...' : 'Save'}
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
  const [form, setForm]               = useState({ current: '', password: '', confirm: '' })
  const [saving, setSaving]           = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [showConf, setShowConf]       = useState(false)
  const [currentErr, setCurrentErr]   = useState('')

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
          {saving ? 'Verifying...' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

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
