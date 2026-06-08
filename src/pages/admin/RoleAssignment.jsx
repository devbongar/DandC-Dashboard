import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'

const ROLES = ['admin', 'approver', 'updater', 'viewer']

const ROLE_LABELS = {
  admin:    'Admin',
  approver: 'Approver',
  updater:  'Updater',
  viewer:   'Viewer',
}

const ROLE_COLORS = {
  admin:    'bg-black text-white',
  approver: 'bg-[#ed6055] text-white',
  updater:  'bg-blue-600 text-white',
  viewer:   'bg-gray-500 text-white',
}

const ROLE_ACCENT = {
  admin:    '#111111',
  approver: '#ed6055',
  updater:  '#2563eb',
  viewer:   '#6b7280',
}

export default function RoleAssignment() {
  const { profile, loading: profileLoading } = useProfile()
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(null)
  const [search, setSearch]         = useState('')
  const [toast, setToast]           = useState(null)
  const [filter, setFilter]         = useState('all')
  const [togglingId, setTogglingId] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null) // user to disable/enable

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('created_at', { ascending: false })
    if (!error && data) setUsers(data)
    setLoading(false)
  }

  const updateRole = async (userId, newRole) => {
    setSaving(userId)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    setSaving(null)
    if (error) { showToast('Failed to update role: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    showToast('Role updated successfully.', 'success')
  }

  const toggleActive = async () => {
    if (!confirmTarget) return
    setTogglingId(confirmTarget.id)
    const newState = !confirmTarget.is_active
    const { error } = await supabase.from('profiles').update({ is_active: newState }).eq('id', confirmTarget.id)
    setTogglingId(null)
    setConfirmTarget(null)
    if (error) { showToast('Failed to update status: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === confirmTarget.id ? { ...u, is_active: newState } : u))
    showToast(newState ? 'User has been enabled.' : 'User has been disabled.', 'success')
  }

  const showToast = (message, type) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = users.filter(u => {
    const matchSearch =
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filter === 'all' || u.role === filter)
  })

  const showLoading = useMinLoading(profileLoading || loading)
  if (showLoading) return <LoadingScreen />

  const isDisabling = confirmTarget && confirmTarget.is_active !== false

  return (
    <DashboardLayout profile={profile}>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 rounded-full bg-[#ed6055]" />
        <div>
          <h1 className="text-2xl font-bold text-black">Role Assignment</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage user access levels across the platform.</p>
        </div>
      </div>

      {/* Role filter strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {ROLES.map((role) => {
          const count  = users.filter(u => u.role === role).length
          const accent = ROLE_ACCENT[role]
          const active = filter === role
          return (
            <button
              key={role}
              onClick={() => setFilter(active ? 'all' : role)}
              className={`rounded-xl px-4 py-3 text-left transition shadow-sm border ${
                active ? 'bg-white border-gray-200' : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
              style={{ borderLeft: `4px solid ${active ? '#ed6055' : '#e5e7eb'}` }}
            >
              <p className="text-xs font-semibold" style={{ color: active ? '#ed6055' : '#9ca3af' }}>
                {ROLE_LABELS[role]}
              </p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: active ? '#ed6055' : '#111111' }}>
                {count}
              </p>
            </button>
          )
        })}
      </div>

      {/* Search + clear */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
        />
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="text-sm px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 bg-white transition"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {users.length === 0 ? 'No users found.' : 'No users match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['User', 'Status', 'Current Role', 'Assign Role', 'Joined', ''].map(h => (
                    <th key={h} className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(user => {
                  const disabled = user.is_active === false
                  const isSelf   = user.id === profile?.id
                  return (
                    <tr
                      key={user.id}
                      className={`transition ${disabled ? 'opacity-50' : 'hover:bg-gray-50/50'}`}
                      style={{ boxShadow: `inset 3px 0 0 ${disabled ? '#d1d5db' : (ROLE_ACCENT[user.role] ?? '#e5e7eb')}` }}
                    >
                      <td className="px-6 py-4">
                        <p className={`font-medium ${disabled ? 'text-gray-400' : 'text-black'}`}>{user.full_name || '—'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{user.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        {isSelf ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Active
                          </span>
                        ) : disabled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {user.role ? (
                          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] ?? 'bg-gray-200 text-gray-700'}`}>
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            defaultValue={user.role || ''}
                            onChange={e => updateRole(user.id, e.target.value)}
                            disabled={saving === user.id || disabled}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent disabled:opacity-50 transition"
                          >
                            <option value="" disabled>Select role…</option>
                            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                          {saving === user.id && (
                            <div className="w-4 h-4 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        {!isSelf && (
                          <button
                            onClick={() => setConfirmTarget(user)}
                            disabled={togglingId === user.id}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition disabled:opacity-50 whitespace-nowrap ${
                              disabled
                                ? 'border-green-200 text-green-600 bg-green-50 hover:bg-green-100'
                                : 'border-gray-200 text-gray-500 bg-white hover:border-[#ed6055]/30 hover:text-[#ed6055] hover:bg-[#ed6055]/5'
                            }`}
                          >
                            {disabled ? 'Enable Account' : 'Disable Account'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-right">{filtered.length} of {users.length} users shown</p>

      {/* Disable / Enable confirm modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${isDisabling ? 'bg-[#ed6055]/10' : 'bg-green-50'}`}>
              {isDisabling
                ? <svg className="w-5 h-5 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                : <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              }
            </div>
            <h3 className="text-base font-bold text-black mb-1">
              {isDisabling ? 'Disable account?' : 'Enable account?'}
            </h3>
            <p className="text-sm text-gray-500 mb-1 truncate font-medium">{confirmTarget.full_name || confirmTarget.email}</p>
            <p className="text-sm text-gray-400 mb-5">
              {isDisabling
                ? 'This user will immediately lose access to the platform. You can re-enable them at any time.'
                : 'This user will regain full access to the platform based on their assigned role.'
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={toggleActive}
                disabled={togglingId === confirmTarget.id}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition ${
                  isDisabling ? 'bg-[#ed6055] hover:bg-[#d94f45]' : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {togglingId === confirmTarget.id ? '…' : isDisabling ? 'Yes, Disable' : 'Yes, Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  )
}
