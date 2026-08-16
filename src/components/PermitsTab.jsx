import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import PermitDetail from './PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../lib/permitUtils'

function IssueIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400 drop-shadow-sm flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

function RequirementsRing({ done, total }) {
  const size = 48
  const sw   = 4
  const r    = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const pct  = total > 0 ? done / total : 0
  const dash = pct * circ
  const color = done === total ? '#10b981' : '#ed6055'
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }} />
      <text x={size/2} y={size/2} dominantBaseline="middle" textAnchor="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: 13, fontWeight: 700, fill: color }}>
        {done}
      </text>
    </svg>
  )
}

const CARDS = [
  { label: 'Pending',     key: 'pending',    filterKey: 'pending',     color: '#6b7280' },
  { label: 'In Progress', key: 'inProgress', filterKey: 'in-progress', color: '#fbbf24' },
  { label: 'Acquired',    key: 'acquired',   filterKey: 'acquired',    color: '#34d399' },
  { label: 'Overdue',     key: 'overdue',    filterKey: 'overdue',     color: '#f87171' },
  { label: 'With Issues', key: 'withIssues', filterKey: 'with-issues', color: '#fb923c' },
]

const INPUT = 'w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40'

export default function PermitsTab({ project, isAdmin, isHead, isReporter, isViewer, currentUserId, showToast, search = '', onSearchChange, filterStatus = 'all', onFilterStatusChange, creating = false, onCreatingChange }) {
  const [permits,      setPermits]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selected,     setSelected]     = useState(null)
  const [form,         setForm]         = useState({ name: '', responsible_person: '', planned_start: '', planned_finish: '' })
  const [saving,       setSaving]       = useState(false)
  const cardScrollRef = useRef(null)
  const [cardScrollPos, setCardScrollPos] = useState(0)

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
    setForm({ name: '', responsible_person: '', planned_start: '', planned_finish: '' })
    onCreatingChange?.(false)
    load()
  }

  if (loading) {
    return <div className="py-6 text-sm text-gray-400 px-4">Loading permits...</div>
  }

  const rows = permits.filter(p => {
    const status   = computePermitStatus(p)
    const hasIssue = (p.permit_issues ?? []).some(i => i.status === 'open')
    const matchStatus = filterStatus === 'all' ? true
      : filterStatus === 'with-issues' ? hasIssue
      : status === filterStatus
    const q = search.toLowerCase()
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.responsible_person?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const counts = {
    pending:    permits.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: permits.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   permits.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    permits.filter(p => computePermitStatus(p) === 'overdue').length,
    withIssues: permits.filter(p => (p.permit_issues ?? []).some(i => i.status === 'open')).length,
  }

  const hasActiveFilter = filterStatus !== 'all' || search !== ''

  return (
    <div className="bg-gray-200">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">

        {/* Summary cards */}
        {permits.length > 0 && (
          <div className="relative -mx-4 sm:mx-0">
            <div
              ref={cardScrollRef}
              onScroll={() => setCardScrollPos(cardScrollRef.current?.scrollLeft ?? 0)}
              className="flex gap-3 overflow-x-auto py-2 px-4 sm:grid sm:grid-cols-5 sm:overflow-visible sm:py-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {CARDS.map(c => {
                const active = filterStatus === c.filterKey
                const total  = permits.length
                const pct    = total > 0 ? Math.round((counts[c.key] / total) * 100) : 0
                const size   = 52
                const sw     = 4
                const r      = (size - sw) / 2
                const circ   = 2 * Math.PI * r
                const dash   = (pct / 100) * circ
                return (
                  <button
                    key={c.label}
                    onClick={() => onFilterStatusChange?.(active ? 'all' : c.filterKey)}
                    className={`flex-none w-36 sm:w-auto text-left rounded-xl border p-4 transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/60 ${
                      active
                        ? 'bg-white border-transparent ring-2 ring-[#ed6055] shadow-xl'
                        : 'bg-white border-gray-100 shadow-md hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                        <p className="text-2xl font-bold tabular-nums text-gray-900">{counts[c.key]}</p>
                      </div>
                      <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
                        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c.color} strokeWidth={sw}
                          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
                        <text x={size/2} y={size/2} dominantBaseline="middle" textAnchor="middle"
                          style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: 10, fontWeight: 700, fill: c.color }}>
                          {pct}%
                        </text>
                      </svg>
                    </div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => cardScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })} aria-label="Scroll left"
              className={`sm:hidden absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-r from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollPos > 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button onClick={() => cardScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })} aria-label="Scroll right"
              className={`sm:hidden absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-l from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollRef.current && cardScrollPos < cardScrollRef.current.scrollWidth - cardScrollRef.current.clientWidth - 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Create form */}
        {creating && (
          <form onSubmit={createPermit} className="bg-white rounded-xl border border-gray-200 shadow-md p-4 space-y-3">
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
              <button type="button" onClick={() => onCreatingChange?.(false)}
                className="min-h-[36px] px-4 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
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
          <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
            <p className="text-sm font-medium text-gray-500">No permits yet for this project.</p>
            {isAdmin && (
              <button onClick={() => onCreatingChange?.(true)} className="mt-2 text-xs text-[#ed6055] hover:underline">
                Add first permit
              </button>
            )}
          </div>
        )}

        {/* No results (filtered) */}
        {permits.length > 0 && rows.length === 0 && (
          <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
            <p className="text-sm font-medium text-gray-500">No permits match filter.</p>
            <button onClick={() => { onFilterStatusChange?.('all'); onSearchChange?.('') }} className="mt-2 text-xs text-[#ed6055] hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {/* Count label */}
        {permits.length > 0 && (
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-500">
              {rows.length} permit{rows.length !== 1 ? 's' : ''}
              {hasActiveFilter && permits.length !== rows.length && (
                <span className="text-gray-400 font-normal"> of {permits.length}</span>
              )}
            </p>
            {hasActiveFilter && (
              <button
                onClick={() => { onFilterStatusChange?.('all'); onSearchChange?.('') }}
                className="text-xs text-[#ed6055] hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Mobile: list */}
        {rows.length > 0 && (
          <div className="md:hidden space-y-2">
            {rows.map(permit => {
              const status   = computePermitStatus(permit)
              const reqs     = permit.permit_requirements ?? []
              const reqDone  = reqs.filter(r => r.is_complete).length
              const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
              const delayed  = permit.planned_finish && status !== 'acquired'
                ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000)) : 0
              return (
                <button key={permit.id} onClick={() => setSelected(permit)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 active:scale-[0.99] transition-[transform,box-shadow] shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{permit.name}</span>
                        {hasIssue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold flex-shrink-0">
                            <IssueIcon />Issue
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-gray-400 mt-0.5">{permit.id}</p>
                    </div>
                    <span className={`flex-shrink-0 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {reqs.length > 0 && (
                      <span className={`text-xs ${reqDone === reqs.length ? 'text-emerald-600' : 'text-gray-500'}`}>{reqDone}/{reqs.length} reqs</span>
                    )}
                    {permit.planned_finish && <span className="text-xs text-gray-400">Planned {permit.planned_finish}</span>}
                    {delayed > 0 && <span className="text-xs font-semibold text-red-600">{delayed}d delayed</span>}
                    {permit.responsible_person && <span className="text-xs text-gray-400 truncate">{permit.responsible_person}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Desktop: glass 2-col grid */}
        {rows.length > 0 && (
          <div className="hidden md:grid grid-cols-2 gap-3">
            {rows.map(permit => {
              const status   = computePermitStatus(permit)
              const reqs     = permit.permit_requirements ?? []
              const reqDone  = reqs.filter(r => r.is_complete).length
              const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
              const delayed  = permit.planned_finish && status !== 'acquired'
                ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000)) : 0

              return (
                <button
                  key={permit.id}
                  onClick={() => setSelected(permit)}
                  className="text-left rounded-xl p-4 transition-all duration-200 ease-out flex flex-col gap-3 hover:-translate-y-1 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/50"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'}
                >
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2">

                    {/* Row 1 Col 1: icon + name + issue */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.06)' }}>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{permit.name}</p>
                        {hasIssue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold w-fit mt-0.5">
                            <IssueIcon />Issue
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 1 Col 2: requirements ring */}
                    <div className="flex items-center justify-center">
                      {reqs.length > 0 && (
                        <div className="flex items-center gap-2">
                          <RequirementsRing done={reqDone} total={reqs.length} />
                          <div>
                            <p className="text-[10px] text-gray-400 leading-tight">out of {reqs.length}</p>
                            <p className="text-[11px] font-semibold leading-tight mt-0.5 text-gray-500">reqt completed</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Row 1 Col 3: status badge */}
                    <div className="flex items-start justify-end">
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                    </div>

                    {/* Row 2: full-width divider */}
                    <div className="col-span-3" style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

                    {/* Row 2 Col 1: planned finish */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wide">Planned</span>
                      <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.planned_finish ?? '--'}</span>
                    </div>

                    {/* Row 2 Col 2: forecast finish */}
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wide">Forecast</span>
                      <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.forecast_finish ?? '--'}</span>
                    </div>

                    {/* Row 2 Col 3: delay */}
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wide">Delay</span>
                      {delayed > 0
                        ? <span className="text-[10px] font-semibold text-red-500">{delayed}d</span>
                        : <span className="text-[10px] font-semibold text-emerald-600">On track</span>
                      }
                    </div>

                  </div>

                </button>
              )
            })}
          </div>
        )}

      </div>

      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={isHead}
          isReporter={isReporter}
          isViewer={isViewer}
          currentUserId={currentUserId}
          projectName={project?.name}
          onClose={() => setSelected(null)}
          onUpdated={load}
          onDeleted={(id) => { setSelected(null); setPermits(prev => prev.filter(p => p.id !== id)) }}
        />
      )}
    </div>
  )
}
