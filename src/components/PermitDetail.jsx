import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'
import { sendIssueNotification, sendTeamsIssueNotification, sendTeamsPermitAcquired } from '../lib/notifications'

function DateCard({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{value ?? '—'}</p>
    </div>
  )
}

const BTN_GHOST = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-[#ed6055] hover:bg-[#ed6055]/10 active:bg-[#ed6055]/20 transition-colors flex items-center'
const BTN_GHOST_GRAY = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors flex items-center'
const BTN_DANGER_GHOST = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 transition-colors flex items-center'

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</h3>
      {action}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

const INPUT_CLS = 'w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 transition-shadow'

export default function PermitDetail({ permit: initialPermit, isAdmin, isHead, currentUserId, onClose, onUpdated }) {
  const [permit,         setPermit]         = useState(initialPermit)
  const [requirements,   setRequirements]   = useState([])
  const [issues,         setIssues]         = useState([])
  const [saving,         setSaving]         = useState(false)
  const [remarksDraft,   setRemarksDraft]   = useState(initialPermit.remarks ?? '')
  const [editingRemarks, setEditingRemarks] = useState(!initialPermit.remarks)

  const [issueText,    setIssueText]    = useState('')
  const [issueDesc,    setIssueDesc]    = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [raisingIssue, setRaisingIssue] = useState(false)
  const [showRaiseForm, setShowRaiseForm] = useState(false)
  const [hoUsers,      setHoUsers]      = useState([])

  const [reqText,    setReqText]    = useState('')
  const [addingReq,  setAddingReq]  = useState(false)
  const [acquiring,  setAcquiring]  = useState(false)

  const [editingResponsible,   setEditingResponsible]   = useState(false)
  const [responsibleDraft,     setResponsibleDraft]     = useState(initialPermit.responsible_person ?? '')
  const [responsibleSuggestions, setResponsibleSuggestions] = useState([])

  const [visible, setVisible] = useState(false)
  const overlayRef = useRef(null)

  useEffect(() => { fetchDetail(); fetchHoUsers(); fetchResponsibleSuggestions() }, [permit.id])
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  async function fetchDetail() {
    const [{ data: rData }, { data: iData }] = await Promise.all([
      supabase.from('permit_requirements').select('*').eq('permit_id', permit.id).order('sort_order'),
      supabase.from('permit_issues').select('*').eq('permit_id', permit.id).order('created_at'),
    ])
    const userIds = [...new Set([
      ...(iData ?? []).map(i => i.raised_by).filter(Boolean),
      ...(iData ?? []).map(i => i.assigned_to).filter(Boolean),
    ])]
    let profileMap = {}
    if (userIds.length) {
      const { data: pData } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
      profileMap = Object.fromEntries((pData ?? []).map(p => [p.id, p]))
    }
    setRequirements(rData ?? [])
    setIssues((iData ?? []).map(i => ({
      ...i,
      raised_profile:   profileMap[i.raised_by]   ?? null,
      assigned_profile: profileMap[i.assigned_to] ?? null,
    })))
  }

  async function fetchResponsibleSuggestions() {
    const [{ data: permitsData }, { data: profilesData }] = await Promise.all([
      supabase.from('permits').select('responsible_person').not('responsible_person', 'is', null),
      supabase.from('profiles').select('full_name').eq('is_active', true),
    ])
    const fromPermits = (permitsData ?? []).map(p => p.responsible_person).filter(Boolean)
    const fromProfiles = (profilesData ?? []).map(p => p.full_name).filter(Boolean)
    setResponsibleSuggestions([...new Set([...fromProfiles, ...fromPermits])])
  }

  async function fetchHoUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('team', 'ho')
      .eq('is_active', true)
      .order('full_name')
    setHoUsers(data ?? [])
  }

  async function markAcquired() {
    setAcquiring(true)
    const patch = { status: 'acquired', actual_finish: permit.actual_finish ?? new Date().toISOString().slice(0, 10) }
    const { data } = await supabase.from('permits').update(patch).eq('id', permit.id).select().single()
    if (data) {
      setPermit(data)
      supabase.from('app_settings').select('value').eq('key', 'teams_webhook_url').single()
        .then(async ({ data: setting }) => {
          if (setting?.value) {
            const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).single()
            sendTeamsPermitAcquired(data, prof?.full_name ?? null, setting.value)
          }
        })
    }
    setAcquiring(false)
  }

  async function saveResponsible() {
    const { data } = await supabase
      .from('permits')
      .update({ responsible_person: responsibleDraft.trim() || null })
      .eq('id', permit.id).select().single()
    if (data) { setPermit(data); setEditingResponsible(false) }
  }

  async function saveRemarks() {
    setSaving(true)
    const { data } = await supabase.from('permits').update({ remarks: remarksDraft }).eq('id', permit.id).select().single()
    setSaving(false)
    if (data) { setPermit(data); setEditingRemarks(false) }
  }

  async function toggleRequirement(req) {
    if (!isAdmin && !isHead) return
    const now = new Date().toISOString()
    const patch = req.is_complete
      ? { is_complete: false, completed_at: null, completed_by: null }
      : { is_complete: true,  completed_at: now,  completed_by: currentUserId }
    const { data } = await supabase.from('permit_requirements').update(patch).eq('id', req.id).select().single()
    if (data) setRequirements(prev => prev.map(r => r.id === data.id ? data : r))
  }

  async function addRequirement(e) {
    e.preventDefault()
    if (!reqText.trim()) return
    setAddingReq(true)
    const { data } = await supabase
      .from('permit_requirements')
      .insert({ permit_id: permit.id, description: reqText.trim(), sort_order: requirements.length, is_complete: false })
      .select().single()
    if (data) { setRequirements(prev => [...prev, data]); setReqText('') }
    setAddingReq(false)
  }

  async function deleteIssue(issue) {
    if (!canManage) return
    await supabase.from('permit_issues').delete().eq('id', issue.id)
    setIssues(prev => prev.filter(i => i.id !== issue.id))
  }

  async function resolveIssue(issue) {
    if (!isAdmin && !isHead) return
    const { data } = await supabase
      .from('permit_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issue.id).select().single()
    if (data) setIssues(prev => prev.map(i => i.id === data.id ? { ...i, ...data } : i))
  }

  async function raiseIssue(e) {
    e.preventDefault()
    if (!issueText.trim() || !assignedToId) return
    setRaisingIssue(true)
    const assignedUser = hoUsers.find(u => u.id === assignedToId) ?? null
    const { data: newIssue, error } = await supabase
      .from('permit_issues')
      .insert({ permit_id: permit.id, issue: issueText.trim(), description: issueDesc.trim() || null, raised_by: currentUserId, assigned_to: assignedToId, status: 'open' })
      .select().single()
    if (!error && newIssue) {
      setIssues(prev => [...prev, newIssue])
      setIssueText(''); setIssueDesc(''); setAssignedToId(''); setShowRaiseForm(false)
      await supabase.from('notifications').insert({ user_id: assignedToId, type: 'issue_raised', payload: { permit_id: permit.id, permit_name: permit.name, issue: newIssue.issue } })
      window.dispatchEvent(new CustomEvent('refetch-notifications'))
      if (assignedUser) sendIssueNotification(newIssue, permit, assignedUser)
      supabase.from('app_settings').select('value').eq('key', 'teams_webhook_url').single()
        .then(({ data: setting }) => {
          if (setting?.value) sendTeamsIssueNotification(newIssue, permit, assignedUser, setting.value)
        })
    }
    setRaisingIssue(false)
  }

  const status = computePermitStatus(permit)
  const canManage = isAdmin || isHead
  const reqDone = requirements.filter(r => r.is_complete).length
  const openIssues = issues.filter(i => i.status === 'open').length

  function handleClose() { onUpdated?.(); onClose() }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={e => { if (e.target === overlayRef.current) handleClose() }}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden"
        style={{
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{permit.id}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug">{permit.name}</h2>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="px-6 py-5 space-y-7">

            {/* Responsible person */}
            <section>
              <SectionHeader
                title="Responsible Person"
                action={canManage && !editingResponsible && (
                  <button onClick={() => setEditingResponsible(true)} className={BTN_GHOST}>
                    {permit.responsible_person ? 'Edit' : 'Set'}
                  </button>
                )}
              />
              {canManage && editingResponsible ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={responsibleDraft}
                    onChange={e => setResponsibleDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveResponsible(); if (e.key === 'Escape') setEditingResponsible(false) }}
                    placeholder="Name or job title..."
                    list="responsible-suggestions"
                    className={INPUT_CLS}
                  />
                  <datalist id="responsible-suggestions">
                    {responsibleSuggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <button onClick={saveResponsible} className="px-3 py-2 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] transition-colors">Save</button>
                  <button onClick={() => { setResponsibleDraft(permit.responsible_person ?? ''); setEditingResponsible(false) }} className="min-h-[40px] px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition-colors">Cancel</button>
                </div>
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {permit.responsible_person || <span className="italic text-gray-400">Not set</span>}
                </p>
              )}
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Schedule */}
            <section>
              <SectionHeader title="Schedule" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <DateCard label="Planned Start"    value={permit.planned_start} />
                <DateCard label="Planned Finish"   value={permit.planned_finish} />
                <DateCard label="Forecast Start"   value={permit.forecast_start} />
                <DateCard label="Forecast Finish"  value={permit.forecast_finish} />
                <DateCard label="Actual Start"     value={permit.actual_start} />
                <DateCard label="Actual Finish"    value={permit.actual_finish} />
              </div>
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Remarks */}
            <section>
              <SectionHeader
                title="Remarks"
                action={canManage && !editingRemarks && (
                  <button onClick={() => setEditingRemarks(true)} className={BTN_GHOST}>Edit</button>
                )}
              />
              {!canManage || !editingRemarks ? (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed min-h-[1.5rem]">
                  {remarksDraft || <span className="italic text-gray-400">No remarks.</span>}
                </p>
              ) : (
                <>
                  <textarea
                    value={remarksDraft}
                    onChange={e => setRemarksDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Add remarks..."
                    className={`${INPUT_CLS} resize-none`}
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveRemarks} disabled={saving} className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition-colors">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => { setRemarksDraft(permit.remarks ?? ''); setEditingRemarks(false) }} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Requirements */}
            <section>
              <SectionHeader
                title={`Requirements · ${reqDone}/${requirements.length}`}
              />
              {requirements.length === 0
                ? <p className="text-sm text-gray-400 italic">No requirements added yet.</p>
                : (
                  <ul className="space-y-1.5 mb-3">
                    {requirements.map(req => (
                      <li
                        key={req.id}
                        onClick={() => toggleRequirement(req)}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${canManage ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800' : ''}`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors duration-150 ${req.is_complete ? 'bg-[#ed6055] border-[#ed6055]' : 'border-gray-300 dark:border-gray-600'}`}>
                          {req.is_complete && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                              <path d="M8.5 2.5L4 7.5 1.5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm leading-snug ${req.is_complete ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {req.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              }
              {canManage && (
                <form onSubmit={addRequirement} className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={reqText}
                    onChange={e => setReqText(e.target.value)}
                    placeholder="Add requirement..."
                    className={INPUT_CLS}
                  />
                  <button type="submit" disabled={addingReq || !reqText.trim()} className="px-3 py-2 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-40 transition-colors whitespace-nowrap">
                    {addingReq ? '...' : 'Add'}
                  </button>
                </form>
              )}
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Issues */}
            <section>
              <SectionHeader
                title={`Issues${openIssues > 0 ? ` · ${openIssues} open` : ''}`}
                action={canManage && !showRaiseForm && (
                  <button onClick={() => setShowRaiseForm(true)} className={BTN_GHOST}>+ Raise Issue</button>
                )}
              />

              {issues.length === 0 && !showRaiseForm && (
                <p className="text-sm text-gray-400 italic">No issues raised.</p>
              )}

              <ul className="space-y-2 mb-3">
                {issues.map(issue => (
                  <li
                    key={issue.id}
                    className={`rounded-xl border-l-4 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-1 ${
                      issue.status === 'resolved'
                        ? 'border-l-emerald-400 dark:border-l-emerald-600'
                        : 'border-l-amber-400 dark:border-l-amber-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">{issue.issue}</p>
                      <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        issue.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {issue.status}
                      </span>
                    </div>
                    {issue.description && <p className="text-xs text-gray-500 dark:text-gray-400">{issue.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-400">
                        {issue.raised_profile?.full_name ?? 'Unknown'}
                        {issue.resolved_at ? ` · Resolved ${new Date(issue.resolved_at).toLocaleDateString()}` : ''}
                      </p>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          {issue.status === 'open' && (
                            <button onClick={() => resolveIssue(issue)} className={BTN_GHOST}>Resolve</button>
                          )}
                          {isAdmin && (
                            <button onClick={() => deleteIssue(issue)} className={BTN_DANGER_GHOST}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Raise issue form */}
              {showRaiseForm && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-2.5">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Raise an Issue</p>
                  <input type="text" value={issueText} onChange={e => setIssueText(e.target.value)} placeholder="Issue title..." required className={INPUT_CLS} />
                  <textarea value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Details (optional)..." rows={2} className={`${INPUT_CLS} resize-none`} />
                  <select required value={assignedToId} onChange={e => setAssignedToId(e.target.value)} className={INPUT_CLS}>
                    <option value="">Assign to...</option>
                    {hoUsers.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={raiseIssue}
                      disabled={raisingIssue || !issueText.trim() || !assignedToId}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-40 transition-colors"
                    >
                      {raisingIssue ? 'Raising...' : 'Raise Issue'}
                    </button>
                    <button onClick={() => { setShowRaiseForm(false); setIssueText(''); setIssueDesc(''); setAssignedToId('') }} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-white dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

          </div>
        </div>

        {/* Sticky footer — Mark Acquired */}
        {canManage && (
          <div className="flex-shrink-0 px-6 pt-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {status === 'acquired' ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold">Permit acquired</span>
              </div>
            ) : (
              <button
                onClick={markAcquired}
                disabled={acquiring}
                style={{ transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms ease' }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acquiring ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
                {acquiring ? 'Saving…' : 'Mark as Acquired'}
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
