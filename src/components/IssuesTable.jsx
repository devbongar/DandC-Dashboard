import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabaseClient'
import SearchDropdown from './SearchDropdown'
import TriangleLoader from './TriangleLoader'

const STATUS_CONFIG = {
  open:  { label: 'Open',   className: 'bg-[#ed6055]/10 text-[#ed6055] border border-[#ed6055]/20' },
  close: { label: 'Closed', className: 'bg-green-50 text-green-600 border border-green-100' },
  hold:  { label: 'Hold',   className: 'bg-amber-50 text-amber-600 border border-amber-100' },
}

const GROUPS = ['Commercial', 'Design', 'Construction', 'Compliance']
const MANAGEMENT_LEVELS = ['ESA', 'Management Committee']

const daysAging = (dateStr) => {
  if (!dateStr) return null
  const diff = new Date() - new Date(dateStr)
  return Math.max(0, Math.floor(diff / 86400000))
}

const fmt = (dateStr) => dateStr
  ? new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—'


function LabelBox({ label, value }) {
  return (
    <div>
      <p className="text-xs sm:text-base font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm sm:text-xl font-medium text-gray-900">{value || <span className="text-gray-300 italic font-normal">—</span>}</p>
    </div>
  )
}

function SectionBlock({ label, value }) {
  return (
    <div>
      <p className="text-xs sm:text-base font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 sm:px-5 py-3 sm:py-4 min-h-[60px] sm:min-h-[80px] text-sm sm:text-xl text-gray-800 leading-relaxed whitespace-pre-wrap">
        {value || <span className="text-gray-300 italic">—</span>}
      </div>
    </div>
  )
}

export default function IssuesTable({ id }) {
  const [issues, setIssues]         = useState([])
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)
  const [active, setActive]         = useState(null)
  const [toast, setToast]           = useState(null)
  const [filterStatus, setFilterStatus]       = useState('all')
  const [filterGroup, setFilterGroup]         = useState('all')
  const [filterMgmtLevel, setFilterMgmtLevel] = useState('all')
  const [filterProject, setFilterProject]     = useState('all')
  const [type4ph, setType4ph]                 = useState('all')
  const [collapsed, setCollapsed]   = useState(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef(null)

  const toggleGroup = (pid) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    return next
  })

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const handler = (e) => { if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [issuesRes, projectsRes] = await Promise.all([
      supabase
        .from('issues')
        .select('id, project_id, issue_group, management_level, status, date_presented, details, caused_by, action_steps, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, is_4ph_project'),
    ])
    if (issuesRes.data)   setIssues(issuesRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    setLoading(false)
  }

  const projectName = (id) => projects.find(p => p.id === id)?.name ?? '—'

  const openView   = (issue) => { setActive(issue); setModal('view') }
  const closeModal = () => { setModal(null); setActive(null) }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = useMemo(() => issues.filter(issue => {
    const matchStatus    = filterStatus    === 'all' || issue.status           === filterStatus
    const matchGroup     = filterGroup     === 'all' || issue.issue_group      === filterGroup
    const matchMgmtLevel = filterMgmtLevel === 'all' || issue.management_level === filterMgmtLevel
    const matchProject   = filterProject   === 'all' || issue.project_id       === filterProject
    const proj           = projects.find(p => p.id === issue.project_id)
    const match4ph       = type4ph === 'all' || (proj && (type4ph === 'yes' ? proj.is_4ph_project : !proj.is_4ph_project))
    return matchStatus && matchGroup && matchMgmtLevel && matchProject && match4ph
  }), [issues, filterStatus, filterGroup, filterMgmtLevel, filterProject, type4ph, projects])

  const hasActiveFilter = filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' || filterProject !== 'all' || type4ph !== 'all'
  const clearFilters = () => { setFilterStatus('all'); setFilterGroup('all'); setFilterMgmtLevel('all'); setFilterProject('all'); setType4ph('all') }

  // Projects that actually have issues (for the dropdown)
  const projectOptions = useMemo(() => {
    const ids = [...new Set(issues.map(i => i.project_id).filter(Boolean))]
    return ids
      .map(id => ({ value: id, label: projectName(id), proj: projects.find(p => p.id === id) }))
      .filter(o => type4ph === 'all' || (o.proj && (type4ph === 'yes' ? o.proj.is_4ph_project : !o.proj.is_4ph_project)))
      .map(o => ({ value: o.value, label: o.label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [issues, projects, type4ph])

  return (
    <section id={id} className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col" style={{ height: 600 }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Issues &amp; Concerns</h2>
        </div>
        {!loading && (
          <span className="text-xs font-bold text-[#ed6055]">{filtered.length} issue{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Filters */}
      {!loading && issues.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">

          {/* ── Mobile layout (< sm) ── */}
          <div className="flex flex-col gap-2 sm:hidden">
            {/* Type toggle — full width */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-lg w-full"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
            >
              {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setType4ph(t.key); setFilterProject('all') }}
                  className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                  style={type4ph === t.key ? {
                    background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                    color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                  } : { color: '#6b7280', background: 'transparent' }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Project + Filters button side by side */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <SearchDropdown
                  fluid
                  options={projectOptions}
                  value={filterProject} onChange={setFilterProject}
                  emptyValue="all" emptyLabel="All Projects" placeholder="Search projects…"
                  icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                />
              </div>
              <div ref={filtersRef} className="relative flex-shrink-0">
                <button
                  onClick={() => setFiltersOpen(v => !v)}
                  className="h-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                  style={{
                    background: filtersOpen || filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#fff' : '#fafafa',
                    borderColor: filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#ed6055' : (filtersOpen ? '#ed6055' : '#e5e7eb'),
                    color: filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#ed6055' : '#6b7280',
                    boxShadow: filtersOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                  </svg>
                  Filters
                  {(filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all') && (
                    <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                      {[filterStatus !== 'all', filterGroup !== 'all', filterMgmtLevel !== 'all'].filter(Boolean).length}
                    </span>
                  )}
                </button>
                {filtersOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
                    style={{ width: 240, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                  >
                    <div className="p-3 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
                        <div className="flex flex-wrap gap-1">
                          {[{ value: 'all', label: 'All' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(o => (
                            <button key={o.value} onClick={() => setFilterStatus(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                              style={filterStatus === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Group</p>
                        <div className="flex flex-wrap gap-1">
                          {[{ value: 'all', label: 'All' }, ...GROUPS.map(g => ({ value: g, label: g }))].map(o => (
                            <button key={o.value} onClick={() => setFilterGroup(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                              style={filterGroup === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Management Level</p>
                        <div className="flex flex-wrap gap-1">
                          {[{ value: 'all', label: 'All' }, ...MANAGEMENT_LEVELS.map(l => ({ value: l, label: l }))].map(o => (
                            <button key={o.value} onClick={() => setFilterMgmtLevel(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                              style={filterMgmtLevel === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {hasActiveFilter && (
              <button onClick={clearFilters} className="w-full py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white transition">
                Clear filters
              </button>
            )}
          </div>

          {/* ── Desktop layout (sm+) ── */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <div
              className="flex items-center gap-0.5 flex-shrink-0 p-0.5 rounded-lg"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
            >
              {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setType4ph(t.key); setFilterProject('all') }}
                  className="relative px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                  style={type4ph === t.key ? {
                    background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                    color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                  } : { color: '#6b7280', background: 'transparent' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <SearchDropdown
              options={projectOptions} value={filterProject} onChange={setFilterProject}
              emptyValue="all" emptyLabel="All Projects" placeholder="Search projects…" minWidth={130}
              icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
            <div ref={filtersRef} className="relative flex-shrink-0">
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                style={{
                  background: filtersOpen || filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#fff' : '#fafafa',
                  borderColor: filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#ed6055' : (filtersOpen ? '#ed6055' : '#e5e7eb'),
                  color: filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' ? '#ed6055' : '#6b7280',
                  boxShadow: filtersOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                Filters
                {(filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all') && (
                  <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                    {[filterStatus !== 'all', filterGroup !== 'all', filterMgmtLevel !== 'all'].filter(Boolean).length}
                  </span>
                )}
              </button>
              {filtersOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
                  style={{ width: 240, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)' }}
                >
                  <div className="p-3 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
                      <div className="flex flex-wrap gap-1">
                        {[{ value: 'all', label: 'All' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(o => (
                          <button key={o.value} onClick={() => setFilterStatus(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                            style={filterStatus === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Group</p>
                      <div className="flex flex-wrap gap-1">
                        {[{ value: 'all', label: 'All' }, ...GROUPS.map(g => ({ value: g, label: g }))].map(o => (
                          <button key={o.value} onClick={() => setFilterGroup(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                            style={filterGroup === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Management Level</p>
                      <div className="flex flex-wrap gap-1">
                        {[{ value: 'all', label: 'All' }, ...MANAGEMENT_LEVELS.map(l => ({ value: l, label: l }))].map(o => (
                          <button key={o.value} onClick={() => setFilterMgmtLevel(o.value)} className="px-2.5 py-1 rounded-md text-xs font-semibold border transition-all"
                            style={filterMgmtLevel === o.value ? { background: '#ed6055', color: '#fff', borderColor: '#ed6055' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>{o.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white transition whitespace-nowrap">
                Clear
              </button>
            )}
          </div>

        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col">
        {loading ? <TriangleLoader label="Loading issues…" /> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="w-6 h-6 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
            </svg>
            <p className="text-sm text-gray-400">
              {issues.length === 0 ? 'No issues recorded yet.' : 'No issues match your filters.'}
            </p>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="text-xs text-[#ed6055] underline underline-offset-2 cursor-pointer">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10" style={{ background: '#fff', borderTop: '2px solid #ed6055', borderBottom: '1px solid #e5e7eb' }}>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">Issue</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">Action Steps</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-700 whitespace-nowrap w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(
                  filtered.reduce((acc, issue) => {
                    const pid = issue.project_id ?? '__none__'
                    if (!acc[pid]) acc[pid] = []
                    acc[pid].push(issue)
                    return acc
                  }, {})
                )
                  .sort(([a], [b]) => projectName(a).localeCompare(projectName(b)))
                  .map(([pid, groupIssues]) => {
                    const isCollapsed = collapsed.has(pid)
                    return (
                      <Fragment key={pid}>
                        {/* Project group row */}
                        <tr
                          className="cursor-pointer select-none hover:bg-[#ed6055]/5 transition"
                          style={{ background: 'rgba(237,96,85,0.04)', borderTop: '1px solid #f3f4f6' }}
                          onClick={() => toggleGroup(pid)}
                        >
                          <td colSpan={3} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-[3px] h-3.5 rounded-full bg-[#ed6055] flex-shrink-0" />
                              <ChevronIcon collapsed={isCollapsed} />
                              <span className="text-xs font-bold text-gray-800">{projectName(pid)}</span>
                              <span className="text-xs font-bold text-white bg-[#ed6055] rounded-full px-1.5 py-0.5 leading-none">
                                {groupIssues.length}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Issue rows */}
                        {!isCollapsed && groupIssues.map((issue, idx) => {
                          const sc = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.open
                          return (
                            <tr
                              key={issue.id}
                              onClick={() => openView(issue)}
                              className="hover:bg-[#ed6055]/[0.03] transition cursor-pointer"
                              style={{ borderTop: idx === 0 ? 'none' : '1px solid #f9fafb' }}
                            >
                              <td className="px-4 py-3 w-[45%]">
                                <p className="line-clamp-3 text-xs text-gray-700 leading-relaxed">{issue.details || <span className="italic text-gray-300">—</span>}</p>
                              </td>
                              <td className="px-4 py-3 w-[45%]">
                                <p className="line-clamp-3 text-xs text-gray-500 leading-relaxed">{issue.action_steps || <span className="italic text-gray-300">—</span>}</p>
                              </td>
                              <td className="px-4 py-3 w-20 whitespace-nowrap">
                                <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md ${sc.className}`}>{sc.label}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View Modal ── */}
      {modal === 'view' && active && (() => {
        const aging = daysAging(active.date_presented)
        const sc = STATUS_CONFIG[active.status] ?? STATUS_CONFIG.open
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onClick={closeModal}>
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-7xl overflow-hidden flex flex-col"
              style={{ maxHeight: '88dvh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-shrink-0">
                <div>
                  <p className="text-base font-semibold text-gray-400 uppercase tracking-wider mb-1">Issues &amp; Concerns</p>
                  <h3 className="text-xl sm:text-3xl font-bold text-black leading-snug">
                    {projectName(active.project_id) !== '—' ? projectName(active.project_id) : 'No project linked'}
                  </h3>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 mt-1">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-lg ${sc.className}`}>{sc.label}</span>
                  <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"><XIcon /></button>
                </div>
              </div>

              {/* Meta row */}
              <div className="px-4 sm:px-8 py-4 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 bg-gray-50 flex-shrink-0">
                <LabelBox label="Group"            value={active.issue_group} />
                <LabelBox label="Management Level" value={active.management_level} />
                <LabelBox label="Date Presented"   value={fmt(active.date_presented)} />
                <LabelBox label="Days Aging"       value={aging !== null ? `${aging} day${aging !== 1 ? 's' : ''}` : null} />
              </div>

              {/* Body */}
              <div className="flex-1 px-4 sm:px-8 py-5 sm:py-6 space-y-5 overflow-y-auto">
                <SectionBlock label="Issue"        value={active.details} />
                <SectionBlock label="Action Steps" value={active.action_steps} />
              </div>

              <div className="px-4 sm:px-8 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
                <button onClick={closeModal} className="px-6 py-2.5 text-sm font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[9999] ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}>
          {toast.message}
        </div>
      )}
    </section>
  )
}

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
const ChevronIcon = ({ collapsed }) => (
  <svg
    className="w-3 h-3 text-gray-400 flex-shrink-0 transition-transform duration-200"
    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
