import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'
import { sendIssueNotification, sendTeamsNotification } from '../lib/notifications'

function DateRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-white">{value ?? '—'}</p>
    </div>
  )
}

export default function PermitDetail({ permit: initialPermit, isAdmin, isHead, currentUserId, onClose, onUpdated }) {
  const [permit,       setPermit]       = useState(initialPermit)
  const [requirements, setRequirements] = useState([])
  const [issues,       setIssues]       = useState([])
  const [saving,       setSaving]       = useState(false)
  const [remarksDraft, setRemarksDraft] = useState(initialPermit.remarks ?? '')

  const [issueText,    setIssueText]    = useState('')
  const [issueDesc,    setIssueDesc]    = useState('')
  const [raisingIssue, setRaisingIssue] = useState(false)

  const overlayRef = useRef(null)

  useEffect(() => { fetchDetail() }, [permit.id])

  async function fetchDetail() {
    const [{ data: rData }, { data: iData }] = await Promise.all([
      supabase.from('permit_requirements').select('*').eq('permit_id', permit.id).order('sort_order'),
      supabase.from('permit_issues').select('*, raised_profile:profiles!raised_by(full_name), assigned_profile:profiles!assigned_to(full_name)').eq('permit_id', permit.id).order('created_at'),
    ])
    setRequirements(rData ?? [])
    setIssues(iData ?? [])
  }

  async function saveRemarks() {
    setSaving(true)
    const { data } = await supabase
      .from('permits')
      .update({ remarks: remarksDraft })
      .eq('id', permit.id)
      .select()
      .single()
    setSaving(false)
    if (data) { setPermit(data); onUpdated?.() }
  }

  async function toggleRequirement(req) {
    if (!isAdmin && !isHead) return
    const now = new Date().toISOString()
    const patch = req.is_complete
      ? { is_complete: false, completed_at: null, completed_by: null }
      : { is_complete: true,  completed_at: now,  completed_by: currentUserId }
    const { data } = await supabase
      .from('permit_requirements')
      .update(patch)
      .eq('id', req.id)
      .select()
      .single()
    if (data) setRequirements(prev => prev.map(r => r.id === data.id ? data : r))
  }

  async function resolveIssue(issue) {
    if (!isAdmin && !isHead) return
    const { data } = await supabase
      .from('permit_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issue.id)
      .select()
      .single()
    if (data) setIssues(prev => prev.map(i => i.id === data.id ? { ...i, ...data } : i))
  }

  async function raiseIssue(e) {
    e.preventDefault()
    if (!issueText.trim()) return
    setRaisingIssue(true)

    const { data: newIssue, error } = await supabase
      .from('permit_issues')
      .insert({ permit_id: permit.id, issue: issueText.trim(), description: issueDesc.trim() || null, raised_by: currentUserId, status: 'open' })
      .select()
      .single()

    if (!error && newIssue) {
      setIssues(prev => [...prev, newIssue])
      setIssueText('')
      setIssueDesc('')

      sendIssueNotification(newIssue, permit, {})

      supabase.from('app_settings').select('value').eq('key', 'teams_webhook_url').single()
        .then(({ data: setting }) => {
          if (setting?.value) {
            sendTeamsNotification({
              title: `Issue raised on ${permit.id}`,
              text:  newIssue.issue,
              permitId:   permit.id,
              permitName: permit.name,
            }, setting.value)
          }
        })
    }

    setRaisingIssue(false)
  }

  const status = computePermitStatus(permit)
  const canManage = isAdmin || isHead

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={e => { if (e.target === overlayRef.current) onClose() }}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{permit.id}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white leading-tight">{permit.name}</h2>
            {permit.responsible_person && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{permit.responsible_person}</p>
            )}
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none font-bold">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* Date grid */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DateRow label="Planned Start"    value={permit.planned_start} />
              <DateRow label="Planned Finish"   value={permit.planned_finish} />
              <DateRow label="Forecast Start"   value={permit.forecast_start} />
              <DateRow label="Forecast Finish"  value={permit.forecast_finish} />
              <DateRow label="Actual Start"     value={permit.actual_start} />
              <DateRow label="Actual Finish"    value={permit.actual_finish} />
              <DateRow label="Remaining (days)" value={permit.remaining_duration != null ? String(permit.remaining_duration) : null} />
            </div>
          </section>

          {/* Remarks */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Remarks</h3>
            <textarea
              value={remarksDraft}
              onChange={e => setRemarksDraft(e.target.value)}
              rows={3}
              readOnly={!canManage}
              placeholder={canManage ? 'Add remarks...' : 'No remarks.'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 disabled:opacity-60"
            />
            {canManage && (
              <button
                onClick={saveRemarks}
                disabled={saving}
                className="mt-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : 'Save Remarks'}
              </button>
            )}
          </section>

          {/* Checklist */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Requirements
              <span className="ml-2 text-gray-400 normal-case font-normal">
                {requirements.filter(r => r.is_complete).length}/{requirements.length} complete
              </span>
            </h3>
            {requirements.length === 0 && <p className="text-sm text-gray-400">No requirements added yet.</p>}
            <ul className="space-y-2">
              {requirements.map(req => (
                <li key={req.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={req.is_complete}
                    onChange={() => toggleRequirement(req)}
                    disabled={!canManage}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ed6055] focus:ring-[#ed6055]/40 cursor-pointer disabled:cursor-default"
                  />
                  <span className={`text-sm ${req.is_complete ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {req.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Issues */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Issues</h3>
            {issues.length === 0 && <p className="text-sm text-gray-400 mb-4">No issues raised.</p>}
            <ul className="space-y-3 mb-6">
              {issues.map(issue => (
                <li key={issue.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{issue.issue}</p>
                    <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {issue.status}
                    </span>
                  </div>
                  {issue.description && <p className="text-xs text-gray-500 dark:text-gray-400">{issue.description}</p>}
                  <p className="text-[11px] text-gray-400">
                    Raised by {issue.raised_profile?.full_name ?? 'unknown'}
                    {issue.resolved_at ? ` · Resolved ${new Date(issue.resolved_at).toLocaleDateString()}` : ''}
                  </p>
                  {canManage && issue.status === 'open' && (
                    <button
                      onClick={() => resolveIssue(issue)}
                      className="text-xs text-[#ed6055] hover:underline font-medium"
                    >
                      Mark resolved
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* Raise issue form */}
            <form onSubmit={raiseIssue} className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Raise an Issue</p>
              <input
                type="text"
                value={issueText}
                onChange={e => setIssueText(e.target.value)}
                placeholder="Issue title..."
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
              />
              <textarea
                value={issueDesc}
                onChange={e => setIssueDesc(e.target.value)}
                placeholder="Details (optional)..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
              />
              <button
                type="submit"
                disabled={raisingIssue || !issueText.trim()}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition"
              >
                {raisingIssue ? 'Raising...' : 'Raise Issue'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}
