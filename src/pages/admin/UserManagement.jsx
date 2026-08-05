import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../../lib/roles'

function RoleBadge({ role }) {
  if (!role) return <span className="text-gray-400 text-xs italic">No role</span>
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[role] ?? 'bg-gray-200 text-gray-700'}`}>
      {role}
    </span>
  )
}

function AvatarCircle({ name, email, size = 'md' }) {
  const initial = ((name?.[0] ?? email?.[0]) || '?').toUpperCase()
  const sizeClass = size === 'lg'
    ? 'w-14 h-14 text-xl font-bold'
    : size === 'sm'
    ? 'w-7 h-7 text-xs font-semibold'
    : 'w-9 h-9 text-sm font-semibold'
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center flex-shrink-0 bg-[#ed6055]/10 border border-[#ed6055]/20 text-[#ed6055]`}>
      {initial}
    </div>
  )
}

export default function UserManagement() {
  const { profile, loading: profileLoading } = useProfile()

  // Data
  const [users,   setUsers]   = useState([])
  const [projects, setProjects] = useState([])
  const [members,  setMembers]  = useState([]) // all project_members rows

  // UI state
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState('')
  const [filterTab,       setFilterTab]       = useState('all') // 'all' | 'ho' | 'site'
  const [selectedUser,    setSelectedUser]    = useState(null)
  const [toast,           setToast]           = useState(null)
  const [confirmTarget,   setConfirmTarget]   = useState(null)
  const [togglingId,      setTogglingId]      = useState(null)

  // Right panel edit state
  const [positionDraft,   setPositionDraft]   = useState('')
  const [savingPosition,  setSavingPosition]  = useState(false)
  const [savingRole,      setSavingRole]      = useState(false)

  // Project assignment
  const [addProjectId,    setAddProjectId]    = useState('')
  const [addingMember,    setAddingMember]    = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState(null)

  useEffect(() => { fetchAll() }, [])

  // Keep right panel in sync when users array updates
  useEffect(() => {
    if (selectedUser) {
      const updated = users.find(u => u.id === selectedUser.id)
      if (updated) setSelectedUser(updated)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: usersData,    error: e1 },
      { data: projectsData, error: e2 },
      { data: membersData,  error: e3 },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, role, team, is_active, created_at, avatar_url, position, user_code')
        .order('full_name', { ascending: true }),
      supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true }),
      supabase
        .from('project_members')
        .select('id, project_id, user_id'),
    ])
    if (e1 || e2 || e3) { showToast('Failed to load data.', 'error'); setLoading(false); return }
    if (usersData)    setUsers(usersData)
    if (projectsData) setProjects(projectsData)
    if (membersData)  setMembers(membersData)
    setLoading(false)
  }

  const toastTimer = useRef(null)
  const showToast = (message, type) => {
    clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch =
      (u.full_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    const matchTab =
      filterTab === 'all'  ? true :
      filterTab === 'ho'   ? u.team === 'ho' :
      filterTab === 'site' ? u.team === 'site' : true
    return matchSearch && matchTab
  })

  // ── Project membership helpers ────────────────────────────────────────────
  const userMemberships = (userId) => members.filter(m => m.user_id === userId)
  const memberCount     = (userId) => userMemberships(userId).length
  const projectName     = (pid)    => projects.find(p => p.id === pid)?.name ?? pid
  const assignedProjectIds = (userId) => userMemberships(userId).map(m => m.project_id)
  const availableProjects  = (userId) => projects.filter(p => !assignedProjectIds(userId).includes(p.id))

  // ── Select user ──────────────────────────────────────────────────────────
  const selectUser = (user) => {
    setSelectedUser(user)
    setPositionDraft(user.position ?? '')
    setAddProjectId('')
  }

  // ── Save position ─────────────────────────────────────────────────────────
  const savePosition = async () => {
    if (!selectedUser) return
    setSavingPosition(true)
    const { error } = await supabase
      .from('profiles')
      .update({ position: positionDraft })
      .eq('id', selectedUser.id)
    setSavingPosition(false)
    if (error) { showToast('Failed to save position: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, position: positionDraft } : u))
    showToast('Position updated.', 'success')
  }

  // ── Update team ───────────────────────────────────────────────────────────
  const updateTeam = async (newTeam) => {
    if (!selectedUser) return
    const { error } = await supabase
      .from('profiles')
      .update({ team: newTeam })
      .eq('id', selectedUser.id)
    if (error) { showToast('Failed to update team: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, team: newTeam } : u))
    showToast('Team updated.', 'success')
  }

  // ── Update global role ────────────────────────────────────────────────────
  const updateRole = async (newRole) => {
    if (!selectedUser) return
    setSavingRole(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', selectedUser.id)
    setSavingRole(false)
    if (error) { showToast('Failed to update role: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u))
    showToast('Role updated.', 'success')
  }

  // ── Add project member ────────────────────────────────────────────────────
  const addMember = async () => {
    if (!selectedUser || !addProjectId) return
    setAddingMember(true)
    const { data, error } = await supabase
      .from('project_members')
      .insert({ project_id: addProjectId, user_id: selectedUser.id })
      .select('id, project_id, user_id')
      .single()
    setAddingMember(false)
    if (error) { showToast('Failed to add assignment: ' + error.message, 'error'); return }
    setMembers(prev => [...prev, data])
    setAddProjectId('')
    showToast('Project assignment added.', 'success')
  }

  // ── Remove project member ─────────────────────────────────────────────────
  const removeMember = async (memberId) => {
    setRemovingMemberId(memberId)
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', memberId)
    setRemovingMemberId(null)
    if (error) { showToast('Failed to remove assignment: ' + error.message, 'error'); return }
    setMembers(prev => prev.filter(m => m.id !== memberId))
    showToast('Assignment removed.', 'success')
  }

  // ── Disable / Enable (with confirm) ──────────────────────────────────────
  const toggleActive = async () => {
    if (!confirmTarget) return
    setTogglingId(confirmTarget.id)
    const newState = !confirmTarget.is_active
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: newState })
      .eq('id', confirmTarget.id)
    setTogglingId(null)
    setConfirmTarget(null)
    if (error) { showToast('Failed to update status: ' + error.message, 'error'); return }
    setUsers(prev => prev.map(u => u.id === confirmTarget.id ? { ...u, is_active: newState } : u))
    showToast(newState ? 'User has been enabled.' : 'User has been disabled.', 'success')
  }

  const showLoading = useMinLoading(profileLoading || loading)
  if (showLoading) return <LoadingScreen />

  const isDisabling = confirmTarget && confirmTarget.is_active !== false
  const avail = selectedUser ? availableProjects(selectedUser.id) : []

  return (
    <DashboardLayout profile={profile}>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 rounded-full bg-[#ed6055]" />
        <div>
          <h1 className="text-2xl font-bold text-black">User Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage users, roles, and project assignments.</p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Left panel: user list ─────────────────────────────────────────── */}
        <div className="lg:w-[40%] flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Search */}
            <div className="p-4 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
              />
            </div>

            {/* Filter strip */}
            <div className="flex border-b border-gray-100">
              {[
                { key: 'all',  label: 'All', count: users.length },
                { key: 'ho',   label: 'HO Users',   count: users.filter(u => u.team === 'ho').length },
                { key: 'site', label: 'Site Users',  count: users.filter(u => u.team === 'site').length },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterTab(tab.key)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition border-b-2 ${
                    filterTab === tab.key
                      ? 'text-[#ed6055] border-[#ed6055]'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                    filterTab === tab.key ? 'bg-[#ed6055]/10 text-[#ed6055]' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* User rows */}
            <div className="divide-y divide-gray-50 max-h-[calc(100vh-280px)] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  {users.length === 0 ? 'No users found.' : 'No users match your search.'}
                </div>
              ) : (
                filtered.map(user => {
                  const isSelected = selectedUser?.id === user.id
                  const disabled   = user.is_active === false
                  const count      = memberCount(user.id)
                  return (
                    <button
                      key={user.id}
                      onClick={() => selectUser(user)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition ${
                        isSelected
                          ? 'bg-[#ed6055]/5 border-l-4 border-l-[#ed6055]'
                          : 'hover:bg-gray-50/70 border-l-4 border-l-transparent'
                      } ${disabled ? 'opacity-50' : ''}`}
                    >
                      <AvatarCircle name={user.full_name} email={user.email} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold truncate ${disabled ? 'text-gray-400' : 'text-black'}`}>
                            {user.full_name || '—'}
                          </span>
                          {!user.is_active && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                        {user.user_code && (
                          <p className="text-xs text-gray-500 font-mono font-semibold truncate mt-1">{user.user_code}</p>
                        )}
                        {user.position && (
                          <p className="text-xs text-gray-400 italic truncate">{user.position}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <RoleBadge role={user.role} />
                        {count > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            {count} project{count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400 text-right">
              {filtered.length} of {users.length} users
            </div>
          </div>
        </div>

        {/* ── Right panel: user detail ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedUser ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center h-64 lg:h-full min-h-[260px]">
              <div className="text-center px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-500">Select a user to view details</p>
                <p className="text-xs text-gray-400 mt-1">Click any user in the list on the left.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-4">
                <AvatarCircle name={selectedUser.full_name} email={selectedUser.email} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-black truncate">{selectedUser.full_name || '—'}</h2>
                    {/* Active toggle */}
                    <button
                      onClick={() => setConfirmTarget(selectedUser)}
                      disabled={togglingId === selectedUser?.id}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
                        selectedUser.is_active === false
                          ? 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                          : 'bg-green-50 text-green-600 border-green-200 hover:bg-[#ed6055]/5 hover:text-[#ed6055] hover:border-[#ed6055]/30'
                      }`}
                    >
                      {selectedUser.is_active === false ? 'Disabled' : 'Active'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{selectedUser.email}</p>
                  {selectedUser.user_code && (
                    <p className="text-xs text-gray-600 font-mono font-semibold truncate mt-1">{selectedUser.user_code}</p>
                  )}
                </div>
                {/* Close on mobile */}
                <button
                  onClick={() => setSelectedUser(null)}
                  className="lg:hidden flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">

                {/* Position */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Position</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={positionDraft}
                      onChange={e => setPositionDraft(e.target.value)}
                      placeholder="e.g. Project Director"
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
                    />
                    <button
                      onClick={savePosition}
                      disabled={savingPosition || positionDraft === (selectedUser.position ?? '')}
                      className="px-4 py-2.5 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 whitespace-nowrap"
                    >
                      {savingPosition ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Saving
                        </span>
                      ) : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Team */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Team</label>
                  <div className="flex gap-2">
                    {['ho', 'site'].map(t => (
                      <button
                        key={t}
                        onClick={() => updateTeam(t)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                          selectedUser.team === t
                            ? 'bg-[#ed6055] text-white border-[#ed6055]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#ed6055]/40 hover:text-[#ed6055]'
                        }`}
                      >
                        {t === 'ho' ? 'HO' : 'Site'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role section */}
                <div>
                  {selectedUser.team === 'ho' ? (
                    /* HO user */
                    <>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">HO Role</label>
                      <div className="flex items-center gap-3">
                        <select
                          value={selectedUser.role ?? ''}
                          onChange={e => updateRole(e.target.value)}
                          disabled={savingRole}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent disabled:opacity-50 transition"
                        >
                          {ROLES.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {savingRole && (
                          <span className="w-4 h-4 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        )}
                        <RoleBadge role={selectedUser.role} />
                      </div>
                    </>
                  ) : (
                    /* Site user */
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Site User</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                          No global role
                        </span>
                      </div>

                      {/* Project assignments */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Project Assignments</p>

                        {userMemberships(selectedUser.id).length === 0 ? (
                          <p className="text-sm text-gray-400 italic mb-3">No project assignments yet.</p>
                        ) : (
                          <div className="space-y-2 mb-3">
                            {userMemberships(selectedUser.id).map(m => (
                              <div key={m.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                                <span className="flex-1 text-sm text-black font-medium truncate">
                                  {projectName(m.project_id)}
                                </span>
                                <button
                                  onClick={() => removeMember(m.id)}
                                  disabled={removingMemberId === m.id}
                                  className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-[#ed6055] hover:bg-[#ed6055]/5 transition disabled:opacity-40"
                                  title="Remove assignment"
                                >
                                  {removingMemberId === m.id ? (
                                    <span className="w-3.5 h-3.5 border-2 border-[#ed6055] border-t-transparent rounded-full animate-spin block" />
                                  ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add to project */}
                        {avail.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={addProjectId}
                              onChange={e => setAddProjectId(e.target.value)}
                              disabled={addingMember}
                              className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent disabled:opacity-50 transition"
                            >
                              <option value="" disabled>Select project…</option>
                              {avail.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={addMember}
                              disabled={!addProjectId || addingMember}
                              className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 whitespace-nowrap flex items-center gap-2"
                            >
                              {addingMember ? (
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                              )}
                              Add
                            </button>
                          </div>
                        )}

                        {avail.length === 0 && userMemberships(selectedUser.id).length > 0 && (
                          <p className="text-xs text-gray-400 italic mt-2">Assigned to all available projects.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Disable / Enable account */}
                {selectedUser.id !== profile?.id && (
                  <div className="pt-2 border-t border-gray-100">
                    <button
                      onClick={() => setConfirmTarget(selectedUser)}
                      disabled={togglingId === selectedUser.id}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition disabled:opacity-50 ${
                        selectedUser.is_active === false
                          ? 'border-green-200 text-green-600 bg-green-50 hover:bg-green-100'
                          : 'border-gray-200 text-gray-500 bg-white hover:border-[#ed6055]/30 hover:text-[#ed6055] hover:bg-[#ed6055]/5'
                      }`}
                    >
                      {selectedUser.is_active === false ? 'Enable Account' : 'Disable Account'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm modal ─────────────────────────────────────────────────────── */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${isDisabling ? 'bg-[#ed6055]/10' : 'bg-green-50'}`}>
              {isDisabling ? (
                <svg className="w-5 h-5 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-base font-bold text-black mb-1">
              {isDisabling ? 'Disable account?' : 'Enable account?'}
            </h3>
            <p className="text-sm text-gray-500 mb-1 truncate font-medium">
              {confirmTarget.full_name || confirmTarget.email}
            </p>
            <p className="text-sm text-gray-400 mb-5">
              {isDisabling
                ? 'This user will immediately lose access to the platform. You can re-enable them at any time.'
                : 'This user will regain full access to the platform based on their assigned role.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
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

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${
          toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  )
}
