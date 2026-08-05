import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import PermitDetail from './PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'

function IssueIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

const SUMMARY = [
  { label: 'Pending',     key: 'pending',    icon: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /> },
  { label: 'In Progress', key: 'inProgress', icon: <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" /> },
  { label: 'Acquired',    key: 'acquired',   icon: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /> },
  { label: 'Overdue',     key: 'overdue',    icon: <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /> },
]

const INPUT = 'w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40'

export default function PermitsTab({ project, isAdmin, isHead, currentUserId, showToast }) {
  const [permits,  setPermits]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form,     setForm]     = useState({ name: '', responsible_person: '', planned_start: '', planned_finish: '', remarks: '' })
  const [saving,   setSaving]   = useState(false)

  useEffect(() => { load() }, [project.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('permits')
      .select('*, permit_requirements(id, is_complete), permit_issues(id, status)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    setPermits(data ?? [])
    setLoading(false)
  }

  async function createPermit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('permits')
      .insert({ ...form, project_id: project.id, status: 'pending', created_by: currentUserId })
    setSaving(false)
    if (error) { showToast?.('Failed to create permit: ' + error.message, 'error'); return }
    setForm({ name: '', responsible_person: '', planned_start: '', planned_finish: '', remarks: '' })
    setCreating(false)
    load()
  }

  async function deletePermit(id) {
    if (!isAdmin) return
    const { error } = await supabase.from('permits').delete().eq('id', id)
    if (error) { showToast?.('Failed to delete permit.', 'error'); return }
    setPermits(prev => prev.filter(p => p.id !== id))
  }

  if (loading) {
    return <div className="py-6 text-sm text-gray-400">Loading permits...</div>
  }

  const counts = {
    pending:    permits.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: permits.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   permits.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    permits.filter(p => computePermitStatus(p) === 'overdue').length,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pt-4">

      {/* Summary strip */}
      {permits.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SUMMARY.map(c => (
            <div key={c.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col items-center gap-1.5 shadow-sm">
              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor">{c.icon}</svg>
              <span className="text-2xl font-bold leading-none text-gray-900 dark:text-white tabular-nums">{counts[c.key]}</span>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 text-center leading-tight">{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {permits.length} permit{permits.length !== 1 ? 's' : ''}
        </p>
        {isAdmin && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="min-h-[36px] px-4 text-xs font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] transition-colors"
          >
            + Add Permit
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={createPermit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Permit</p>
          <input required type="text" placeholder="Permit name (e.g. Building Permit)"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} />
          <input type="text" placeholder="Responsible person"
            value={form.responsible_person} onChange={e => setForm(f => ({ ...f, responsible_person: e.target.value }))} className={INPUT} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Start</label>
              <input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Finish</label>
              <input type="date" value={form.planned_finish} onChange={e => setForm(f => ({ ...f, planned_finish: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)}
              className="min-h-[36px] px-4 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="min-h-[36px] px-4 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {permits.length === 0 && !creating && (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No permits yet for this project.</p>
          {isAdmin && (
            <button onClick={() => setCreating(true)} className="mt-2 text-xs text-[#ed6055] hover:underline">
              Add first permit
            </button>
          )}
        </div>
      )}

      {/* Permit cards — div not button to avoid nested button (delete) */}
      <div className="space-y-2">
        {permits.map(permit => {
          const status   = computePermitStatus(permit)
          const reqs     = permit.permit_requirements ?? []
          const reqTotal = reqs.length
          const reqDone  = reqs.filter(r => r.is_complete).length
          const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
          const delayed  = permit.planned_finish && status !== 'acquired'
            ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000))
            : 0
          return (
            <div
              key={permit.id}
              onClick={() => setSelected(permit)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm hover:shadow-md active:scale-[0.99] transition-[transform,box-shadow] duration-150 cursor-pointer select-none"
            >
              {/* Top row: name + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{permit.name}</span>
                    {hasIssue && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold flex-shrink-0">
                        <IssueIcon />
                        Issue
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">{permit.id}</p>
                </div>
                <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {reqTotal > 0 && (
                  <span className={`text-xs tabular-nums ${reqDone === reqTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {reqDone}/{reqTotal} reqs
                  </span>
                )}
                {permit.planned_finish && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">Planned {permit.planned_finish}</span>
                )}
                {delayed > 0 && (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">{delayed}d delayed</span>
                )}
                {permit.responsible_person && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{permit.responsible_person}</span>
                )}
              </div>

              {/* Admin delete — separated from card click area */}
              {isAdmin && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                  <button
                    onClick={e => { e.stopPropagation(); deletePermit(permit.id) }}
                    className="min-h-[32px] px-3 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={isHead}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
