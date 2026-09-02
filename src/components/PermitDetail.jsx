import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'
import { sendIssueNotification, sendTeamsIssueNotification, sendTeamsPermitAcquired } from '../lib/notifications'
import SearchDropdown from './SearchDropdown'

const DATE_CARD_BG = {
  planned:  'bg-gray-50 dark:bg-gray-800/60',
  forecast: 'bg-blue-50/70 dark:bg-blue-900/20',
  actual:   'bg-emerald-50/70 dark:bg-emerald-900/20',
}
const DATE_LABEL_COLOR = {
  planned:  'text-gray-400',
  forecast: 'text-blue-400 dark:text-blue-400',
  actual:   'text-emerald-500 dark:text-emerald-400',
}

function DateCard({ label, value, variant = 'planned' }) {
  return (
    <div className={`${DATE_CARD_BG[variant]} rounded-lg px-3 py-2.5`}>
      <p className={`text-[10px] font-semibold ${DATE_LABEL_COLOR[variant]} uppercase tracking-wider mb-0.5`}>{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{value ?? '--'}</p>
    </div>
  )
}

const BTN_GHOST = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-[#ed6055] hover:bg-[#ed6055]/10 active:bg-[#ed6055]/20 active:scale-[0.97] [transition:background-color_150ms_ease,color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)] flex items-center'
const BTN_GHOST_GRAY = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 active:scale-[0.97] [transition:background-color_150ms_ease,color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)] flex items-center'
const BTN_DANGER_GHOST = 'min-h-[36px] px-3 text-xs font-medium rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 active:scale-[0.97] [transition:background-color_150ms_ease,color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)] flex items-center'

function SectionHeader({ title, action, icon }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        {icon && (
          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        )}
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</h3>
      </div>
      {action}
    </div>
  )
}

const ICON_PERSON = 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'
const ICON_CALENDAR = 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'
const ICON_CHAT = 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z'
const ICON_CLIPBOARD = 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
const ICON_WARNING = 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

const INPUT_CLS = 'w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 transition-shadow'

export default function PermitDetail({ permit: initialPermit, isAdmin, isHead, isReporter, isViewer, currentUserId, projectName, onClose, onUpdated, onDeleted }) {
  const [permit,         setPermit]         = useState(initialPermit)
  const [requirements,   setRequirements]   = useState([])
  const [issues,         setIssues]         = useState([])
  const [remarks,         setRemarks]         = useState([])
  const [newRemark,       setNewRemark]       = useState('')
  const [addingRemark,    setAddingRemark]    = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')

  const [editingName,  setEditingName]  = useState(false)
  const [nameInput,    setNameInput]    = useState('')
  const nameInputRef = useRef(null)

  const [issueText,    setIssueText]    = useState('')
  const [issueDesc,    setIssueDesc]    = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [raisingIssue, setRaisingIssue] = useState(false)
  const [showRaiseForm, setShowRaiseForm] = useState(false)
  const [hoUsers,      setHoUsers]      = useState([])

  const [toast,          setToast]          = useState(null)
  const [confirmIssue,   setConfirmIssue]   = useState(null)
  const [confirmReq,     setConfirmReq]     = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  const [editingSchedule, setEditingSchedule] = useState(false)
  const [scheduleDraft,   setScheduleDraft]   = useState({})
  const [savingSchedule,  setSavingSchedule]  = useState(false)

  const [reqText,    setReqText]    = useState('')
  const [addingReq,  setAddingReq]  = useState(false)
  const [acquiring,  setAcquiring]  = useState(false)

  const [editingResponsible,   setEditingResponsible]   = useState(false)
  const [responsibleDraft,     setResponsibleDraft]     = useState(initialPermit.responsible_person ?? '')
  const [responsibleSuggestions, setResponsibleSuggestions] = useState([])

  const [visible, setVisible] = useState(false)
  const overlayRef = useRef(null)

  useEffect(() => { fetchDetail(); fetchHoUsers(); fetchResponsibleSuggestions() }, [permit.id])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  async function fetchDetail() {
    const [{ data: rData }, { data: iData }, { data: remData }] = await Promise.all([
      supabase.from('permit_requirements').select('*').eq('permit_id', permit.id).order('sort_order'),
      supabase.from('permit_issues').select('*').eq('permit_id', permit.id).order('created_at'),
      supabase.from('permit_remarks').select('*').eq('permit_id', permit.id).order('created_at'),
    ])
    const userIds = [...new Set([
      ...(iData ?? []).map(i => i.raised_by).filter(Boolean),
      ...(iData ?? []).map(i => i.assigned_to).filter(Boolean),
      ...(remData ?? []).map(r => r.created_by).filter(Boolean),
      currentUserId,
    ].filter(Boolean))]
    let profileMap = {}
    if (userIds.length) {
      const { data: pData } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
      profileMap = Object.fromEntries((pData ?? []).map(p => [p.id, p]))
    }
    if (currentUserId && profileMap[currentUserId]) {
      setCurrentUserName(profileMap[currentUserId].full_name ?? '')
    }
    setRequirements(rData ?? [])
    setIssues((iData ?? []).map(i => ({
      ...i,
      raised_profile:   profileMap[i.raised_by]   ?? null,
      assigned_profile: profileMap[i.assigned_to] ?? null,
    })))
    setRemarks((remData ?? []).map(r => ({ ...r, profile: profileMap[r.created_by] ?? null })))
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
            const { data: prof } = await supabase.from('profiles').select('full_name, email').eq('id', currentUserId).single()
            sendTeamsPermitAcquired(data, prof?.full_name ?? null, prof?.email ?? null, setting.value)
          }
        })
    }
    setAcquiring(false)
  }

  function startEditSchedule() {
    setScheduleDraft({
      planned_start:   permit.planned_start   ?? '',
      planned_finish:  permit.planned_finish  ?? '',
      forecast_start:  permit.forecast_start  ?? '',
      forecast_finish: permit.forecast_finish ?? '',
      actual_start:    permit.actual_start    ?? '',
      actual_finish:   permit.actual_finish   ?? '',
    })
    setEditingSchedule(true)
  }

  async function saveSchedule() {
    setSavingSchedule(true)
    const patch = {
      planned_start:   scheduleDraft.planned_start   || null,
      planned_finish:  scheduleDraft.planned_finish  || null,
      forecast_start:  scheduleDraft.forecast_start  || null,
      forecast_finish: scheduleDraft.forecast_finish || null,
      actual_start:    scheduleDraft.actual_start    || null,
      actual_finish:   scheduleDraft.actual_finish   || null,
    }
    const { data } = await supabase.from('permits').update(patch).eq('id', permit.id).select().single()
    if (data) { setPermit(data); setEditingSchedule(false) }
    setSavingSchedule(false)
  }

  async function saveResponsible() {
    const { data } = await supabase
      .from('permits')
      .update({ responsible_person: responsibleDraft.trim() || null })
      .eq('id', permit.id).select().single()
    if (data) { setPermit(data); setEditingResponsible(false) }
  }

  async function addRemark() {
    if (!newRemark.trim()) return
    setAddingRemark(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingRemark(false); return }
    const { data } = await supabase
      .from('permit_remarks')
      .insert({ permit_id: permit.id, body: newRemark.trim(), created_by: user.id })
      .select().single()
    if (data) {
      setRemarks(prev => [...prev, { ...data, profile: { full_name: currentUserName || 'You' } }])
      setNewRemark('')
    }
    setAddingRemark(false)
  }

  async function toggleRequirement(req) {
    if (!canManage) return
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

  async function deletePermit() {
    if (!isAdmin) return
    setDeleting(true)
    const { error } = await supabase.from('permits').delete().eq('id', permit.id)
    setDeleting(false)
    if (error) { showToast('Failed to delete permit.', 'error'); return }
    onDeleted?.(permit.id)
    onClose()
  }

  async function deleteRequirement(req) {
    if (!isAdmin) return
    const { error } = await supabase.from('permit_requirements').delete().eq('id', req.id)
    if (error) { showToast('Failed to delete requirement.', 'error'); return }
    setRequirements(prev => prev.filter(r => r.id !== req.id))
    showToast('Requirement deleted.')
  }

  async function deleteIssue(issue) {
    if (!canManage) return
    const { error } = await supabase.from('permit_issues').delete().eq('id', issue.id)
    if (error) { showToast('Failed to delete issue.', 'error'); return }
    setIssues(prev => prev.filter(i => i.id !== issue.id))
    showToast('Issue deleted.')
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
        .catch(() => {})
    }
    setRaisingIssue(false)
  }

  const status = computePermitStatus(permit)
  const canManage = isAdmin || isHead || isReporter

  const canEditName = isAdmin || isHead

  function startEditName() {
    setNameInput(permit.name)
    setEditingName(true)
    setTimeout(() => { nameInputRef.current?.select() }, 0)
  }

  async function savePermitName() {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === permit.name) { setEditingName(false); return }
    const { error } = await supabase.from('permits').update({ name: trimmed }).eq('id', permit.id)
    if (!error) {
      setPermit(p => ({ ...p, name: trimmed }))
      if (onUpdated) onUpdated({ ...permit, name: trimmed })
    }
    setEditingName(false)
  }
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Delete issue confirmation */}
      {confirmIssue && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div
            className="w-full max-w-sm bg-white/90 dark:bg-gray-900/90 rounded-3xl shadow-2xl overflow-hidden"
            style={{ animation: 'ios-sheet 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            <div className="px-6 pt-7 pb-5 text-center">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white mb-1">Delete Issue?</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{confirmIssue.issue}</p>
            </div>
            <div className="px-4 pb-5 flex flex-col gap-2.5">
              <button
                onClick={async () => { await deleteIssue(confirmIssue); setConfirmIssue(null) }}
                className="w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white text-sm font-bold transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmIssue(null)}
                className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] text-gray-700 dark:text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
          <style>{`@keyframes ios-sheet { from { opacity:0; transform:scale(0.92) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>
        </div>
      )}

      {/* Delete requirement confirmation */}
      {confirmReq && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm bg-white/90 dark:bg-gray-900/90 rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'ios-sheet 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="px-6 pt-7 pb-5 text-center">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white mb-1">Delete Requirement?</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{confirmReq.description}</p>
            </div>
            <div className="px-4 pb-5 flex flex-col gap-2.5">
              <button
                onClick={async () => { await deleteRequirement(confirmReq); setConfirmReq(null) }}
                className="w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white text-sm font-bold transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmReq(null)}
                className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] text-gray-700 dark:text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete permit confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm bg-white/90 dark:bg-gray-900/90 rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'ios-sheet 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="px-6 pt-7 pb-5 text-center">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white mb-1">Delete Permit?</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{permit.name}</p>
              <p className="text-xs text-gray-400 mt-1">This will also delete all requirements and issues.</p>
            </div>
            <div className="px-4 pb-5 flex flex-col gap-2.5">
              <button
                onClick={deletePermit}
                disabled={deleting}
                className="w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white text-sm font-bold disabled:opacity-50 transition-all"
              >
                {deleting ? 'Deleting...' : 'Delete Permit'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] text-gray-700 dark:text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raise Issue floating panel */}
      {showRaiseForm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm bg-white/90 dark:bg-gray-900/90 rounded-3xl shadow-2xl" style={{ animation: 'ios-sheet 0.28s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="px-6 pt-6 pb-2">
              <p className="text-base font-bold text-gray-900 dark:text-white mb-4">Raise an Issue</p>
              <div className="space-y-2.5">
                <textarea
                  value={issueText}
                  onChange={e => { setIssueText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  placeholder="Issue title..."
                  autoFocus
                  rows={1}
                  className={`${INPUT_CLS} resize-none overflow-hidden`}
                  style={{ minHeight: '2.5rem' }}
                />
                <textarea
                  value={issueDesc}
                  onChange={e => { setIssueDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  placeholder="Details (optional)..."
                  rows={2}
                  className={`${INPUT_CLS} resize-none overflow-hidden`}
                  style={{ minHeight: '5rem' }}
                />
                <SearchDropdown
                  options={hoUsers.map(u => ({ value: u.id, label: u.full_name ?? u.email }))}
                  value={assignedToId}
                  onChange={setAssignedToId}
                  emptyValue=""
                  emptyLabel="Assign to..."
                  placeholder="Search user..."
                  fluid
                />
              </div>
            </div>
            <div className="px-4 pb-5 pt-3 flex flex-col gap-2.5">
              <button
                onClick={raiseIssue}
                disabled={raisingIssue || !issueText.trim() || !assignedToId}
                className="w-full py-3.5 rounded-2xl bg-[#ed6055] hover:bg-[#d94f45] active:scale-[0.98] text-white text-sm font-bold disabled:opacity-40 transition-all"
              >
                {raisingIssue ? 'Raising...' : 'Raise Issue'}
              </button>
              <button
                onClick={() => { setShowRaiseForm(false); setIssueText(''); setIssueDesc(''); setAssignedToId('') }}
                className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] text-gray-700 dark:text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
              {projectName && (
                <p className="text-xs font-semibold text-[#ed6055] uppercase tracking-wide mb-1 truncate">{projectName}</p>
              )}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{permit.id}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
              </div>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={savePermitName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); savePermitName() }
                    if (e.key === 'Escape') { setEditingName(false) }
                  }}
                  className="w-full text-base font-bold text-gray-900 dark:text-white leading-snug bg-transparent border-b-2 border-[#ed6055] focus:outline-none"
                  autoFocus
                />
              ) : (
                <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug break-words">{permit.name}</h2>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canEditName && !editingName && (
                <button onClick={startEditName} className={BTN_GHOST}>Edit</button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 transition-colors"
                  aria-label="Delete permit"
                >
                  <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              )}
              <button
                onClick={handleClose}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="px-6 py-5 space-y-7">

            {/* Responsible person */}
            <section>
              <SectionHeader
                title="Responsible Person"
                icon={ICON_PERSON}
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
                permit.responsible_person ? (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-[#ed6055]/15 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PERSON} />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{permit.responsible_person}</span>
                  </div>
                ) : (
                  <p className="text-sm italic text-gray-400">Not set</p>
                )
              )}
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Schedule */}
            <section>
              <SectionHeader
                title="Schedule"
                icon={ICON_CALENDAR}
                action={(isAdmin || isReporter || isHead) && (
                  editingSchedule
                    ? <div className="flex items-center gap-2">
                        <button
                          onClick={saveSchedule}
                          disabled={savingSchedule}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] active:scale-[0.97] disabled:opacity-40 [transition:background-color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)]"
                        >
                          {savingSchedule ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingSchedule(false)} className={BTN_GHOST_GRAY}>Cancel</button>
                      </div>
                    : <button onClick={startEditSchedule} className={BTN_GHOST}>Edit</button>
                )}
              />
              {editingSchedule ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'planned_start',   label: 'Planned Start',   variant: 'planned'  },
                    { key: 'planned_finish',  label: 'Planned Finish',  variant: 'planned'  },
                    { key: 'forecast_start',  label: 'Forecast Start',  variant: 'forecast' },
                    { key: 'forecast_finish', label: 'Forecast Finish', variant: 'forecast' },
                    { key: 'actual_start',    label: 'Actual Start',    variant: 'actual'   },
                    { key: 'actual_finish',   label: 'Actual Finish',   variant: 'actual'   },
                  ].map(({ key, label, variant }) => (
                    <div key={key} className={`${DATE_CARD_BG[variant]} rounded-lg px-3 py-2`}>
                      <p className={`text-[10px] font-semibold ${DATE_LABEL_COLOR[variant]} uppercase tracking-wider mb-1`}>{label}</p>
                      <input
                        type="date"
                        value={scheduleDraft[key]}
                        onChange={e => setScheduleDraft(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full text-sm font-medium text-gray-900 dark:text-white bg-transparent outline-none [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <DateCard label="Planned Start"    value={permit.planned_start}   variant="planned" />
                  <DateCard label="Planned Finish"   value={permit.planned_finish}  variant="planned" />
                  <DateCard label="Forecast Start"   value={permit.forecast_start}  variant="forecast" />
                  <DateCard label="Forecast Finish"  value={permit.forecast_finish} variant="forecast" />
                  <DateCard label="Actual Start"     value={permit.actual_start}    variant="actual" />
                  <DateCard label="Actual Finish"    value={permit.actual_finish}   variant="actual" />
                </div>
              )}
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Remarks */}
            <section>
              <SectionHeader title="Remarks" icon={ICON_CHAT} />
              <div className="space-y-3">
                {remarks.length === 0 && (
                  <p className="text-sm italic text-gray-400">No remarks yet.</p>
                )}
                {remarks.map(r => {
                  const name = r.profile?.full_name ?? 'Unknown'
                  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const ts = new Date(r.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                    timeZone: 'Asia/Manila',
                  })
                  return (
                    <div key={r.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#ed6055] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-white">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{name}</span>
                          <span className="text-[11px] text-gray-400">{ts}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mt-0.5 break-words">{r.body}</p>
                      </div>
                    </div>
                  )
                })}
                {!isViewer && (
                  <div className="pt-1 space-y-2">
                    <textarea
                      value={newRemark}
                      onChange={e => setNewRemark(e.target.value)}
                      rows={3}
                      placeholder="Add a remark..."
                      className={`${INPUT_CLS} resize-none`}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addRemark() }}
                    />
                    <button
                      onClick={addRemark}
                      disabled={addingRemark || !newRemark.trim()}
                      className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] active:scale-[0.97] disabled:opacity-50 [transition:background-color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)]"
                    >
                      {addingRemark ? 'Adding...' : 'Add Remark'}
                    </button>
                  </div>
                )}
              </div>
            </section>

            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Requirements */}
            <section>
              <SectionHeader
                title={`Requirements · ${reqDone}/${requirements.length}`}
                icon={ICON_CLIPBOARD}
              />
              {requirements.length === 0
                ? <p className="text-sm text-gray-400 italic">No requirements added yet.</p>
                : (
                  <ul className="space-y-1.5 mb-3">
                    {requirements.map(req => (
                      <li
                        key={req.id}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group ${canManage ? 'hover:bg-gray-50 dark:hover:bg-gray-800/60' : ''}`}
                      >
                        <div
                          onClick={() => toggleRequirement(req)}
                          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors duration-150 ${canManage ? 'cursor-pointer' : ''} ${req.is_complete ? 'bg-[#ed6055] border-[#ed6055]' : 'border-gray-300 dark:border-gray-600'}`}
                        >
                          {req.is_complete && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                              <path d="M8.5 2.5L4 7.5 1.5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          )}
                        </div>
                        <span onClick={() => toggleRequirement(req)} className={`flex-1 min-w-0 text-sm leading-snug break-words ${canManage ? 'cursor-pointer' : ''} ${req.is_complete ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {req.description}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => setConfirmReq(req)}
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ml-1 text-gray-300 hover:text-red-500 active:text-red-500 transition-all flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                            </svg>
                          </button>
                        )}
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
                  <button type="submit" disabled={addingReq || !reqText.trim()} className="px-3 py-2 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] active:scale-[0.97] disabled:opacity-40 [transition:background-color_150ms_ease,transform_100ms_cubic-bezier(0.23,1,0.32,1)] whitespace-nowrap">
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
                icon={ICON_WARNING}
                action={!isViewer && !showRaiseForm && (
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
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug break-words min-w-0 flex-1">{issue.issue}</p>
                      <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        issue.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {issue.status}
                      </span>
                    </div>
                    {issue.description && <p className="text-xs text-gray-500 dark:text-gray-400 break-words">{issue.description}</p>}
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
                            <button onClick={() => setConfirmIssue(issue)} className={BTN_DANGER_GHOST}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

            </section>

          </div>
        </div>

        {/* Sticky footer -- Mark Acquired */}
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
