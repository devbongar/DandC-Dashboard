import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import PermitDetail from './PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'

export default function PermitsTab({ project, isAdmin, isHead, currentUserId, showToast }) {
  const [permits,  setPermits]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)

  const [form, setForm] = useState({ name: '', responsible_person: '', planned_start: '', planned_finish: '', remarks: '' })
  const [saving, setSaving] = useState(false)

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
    return <div className="p-6 text-sm text-gray-400">Loading permits...</div>
  }

  const counts = {
    total:      permits.length,
    pending:    permits.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: permits.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   permits.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    permits.filter(p => computePermitStatus(p) === 'overdue').length,
  }

  return (
    <div className="p-4 space-y-4">

      {/* Summary cards */}
      {permits.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Total',       value: counts.total,      num: 'text-gray-800 dark:text-gray-100',    bg: 'bg-gray-50 dark:bg-gray-800/60',      border: 'border-gray-200 dark:border-gray-700' },
            { label: 'Pending',     value: counts.pending,    num: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-50 dark:bg-gray-800/60',      border: 'border-gray-200 dark:border-gray-700' },
            { label: 'In Progress', value: counts.inProgress, num: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50/60 dark:bg-blue-900/20',   border: 'border-blue-100 dark:border-blue-800/40' },
            { label: 'Acquired',    value: counts.acquired,   num: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/60 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800/40' },
            { label: 'Overdue',     value: counts.overdue,    num: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50/60 dark:bg-red-900/20',     border: 'border-red-100 dark:border-red-800/40' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border ${c.bg} ${c.border} px-3 py-2.5 flex flex-col items-center gap-0.5`}>
              <span className={`text-xl font-bold leading-none ${c.num}`}>{c.value}</span>
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 text-center leading-tight">{c.label}</span>
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
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] transition"
          >
            + Add Permit
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={createPermit} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Permit</p>
          <input
            required
            type="text"
            placeholder="Permit name (e.g. Building Permit)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <input
            type="text"
            placeholder="Responsible person (job title or name)"
            value={form.responsible_person}
            onChange={e => setForm(f => ({ ...f, responsible_person: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Start</label>
              <input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-0.5 block">Planned Finish</label>
              <input type="date" value={form.planned_finish} onChange={e => setForm(f => ({ ...f, planned_finish: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50 transition">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Permits list */}
      {permits.length === 0 && !creating && (
        <p className="text-sm text-gray-400 py-4 text-center">No permits yet for this project.</p>
      )}
      <ul className="space-y-2">
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
            <li
              key={permit.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer transition-colors"
              onClick={() => setSelected(permit)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-gray-400">{permit.id}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                  {hasIssue && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      ⚠ issue
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 truncate">{permit.name}</p>
                {permit.responsible_person && (
                  <p className="text-xs text-gray-400 truncate">{permit.responsible_person}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Req: <span className={reqTotal > 0 && reqDone === reqTotal ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'font-semibold text-gray-700 dark:text-gray-300'}>{reqDone}/{reqTotal}</span>
                  </span>
                  {status !== 'acquired' && permit.planned_finish && (
                    <span className={`text-[11px] font-semibold ${delayed > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                      {delayed > 0 ? `${delayed}d delayed` : 'on time'}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 space-y-0.5">
                {permit.planned_finish && (
                  <p className="text-[11px] text-gray-400">Plan: {permit.planned_finish}</p>
                )}
                {permit.forecast_finish && (
                  <p className="text-[11px] text-gray-500">Fcst: {permit.forecast_finish}</p>
                )}
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); deletePermit(permit.id) }}
                    className="text-[11px] text-red-400 hover:text-red-600 hover:underline mt-1 block"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* PermitDetail drawer */}
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
