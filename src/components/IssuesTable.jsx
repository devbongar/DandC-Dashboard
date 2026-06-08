import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_CONFIG = {
  open:  { label: 'Open',   className: 'bg-[#ed6055] text-white' },
  close: { label: 'Closed', className: 'bg-gray-100 text-gray-500' },
  hold:  { label: 'Hold',   className: 'border border-gray-200 text-gray-500 bg-white' },
}

const GROUPS = ['Commercial', 'Design', 'Construction', 'Compliance']
const MANAGEMENT_LEVELS = ['ESA', 'Management Committee']

const daysAging = (dateStr) => {
  if (!dateStr) return null
  const diff = new Date() - new Date(dateStr)
  return Math.max(0, Math.floor(diff / 86400000))
}

const fmt = (dateStr) => dateStr
  ? new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  : '—'

function TriangleLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="flex items-center gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 12, height: 12, background: '#ed6055',
            clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
            animation: 'ph1-loader-tri 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.22}s`,
          }} />
        ))}
      </div>
      <p className="text-xs text-gray-400">Loading issues…</p>
    </div>
  )
}

function LabelBox({ label, value, light }) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${light ? 'text-white/70' : 'text-gray-400 uppercase tracking-wider'}`}>{label}</p>
      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${light ? 'bg-white text-black' : 'bg-gray-50 text-black'}`}>
        {value || <span className="text-gray-400 italic font-normal">—</span>}
      </div>
    </div>
  )
}

function SectionBlock({ label, value }) {
  return (
    <div>
      <div className="bg-gray-100 px-4 py-1.5 rounded-t-lg">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</p>
      </div>
      <div className="border border-gray-100 border-t-0 rounded-b-lg px-4 py-3 min-h-[72px] text-sm text-black leading-relaxed whitespace-pre-wrap">
        {value || <span className="text-gray-300 italic">—</span>}
      </div>
    </div>
  )
}

export default function IssuesTable() {
  const [issues, setIssues]         = useState([])
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)
  const [active, setActive]         = useState(null)
  const [toast, setToast]           = useState(null)
  const [filterStatus, setFilterStatus]           = useState('all')
  const [filterGroup, setFilterGroup]             = useState('all')
  const [filterMgmtLevel, setFilterMgmtLevel]     = useState('all')
  const [collapsed, setCollapsed]   = useState(new Set())
  const [searchProject, setSearchProject] = useState('')

  const toggleGroup = (pid) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    return next
  })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [issuesRes, projectsRes] = await Promise.all([
      supabase
        .from('issues')
        .select('id, project_id, issue_group, management_level, status, date_presented, details, caused_by, corrective_action, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
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

  const filtered = issues.filter(issue => {
    const matchStatus    = filterStatus    === 'all' || issue.status           === filterStatus
    const matchGroup     = filterGroup     === 'all' || issue.issue_group      === filterGroup
    const matchMgmtLevel = filterMgmtLevel === 'all' || issue.management_level === filterMgmtLevel
    return matchStatus && matchGroup && matchMgmtLevel
  })

  const hasActiveFilter = filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all' || searchProject !== ''
  const clearFilters = () => { setFilterStatus('all'); setFilterGroup('all'); setFilterMgmtLevel('all'); setSearchProject('') }

  const visibleCount = useMemo(() => {
    if (!searchProject.trim()) return filtered.length
    const q = searchProject.trim().toLowerCase()
    return filtered.filter(issue => {
      const name = projectName(issue.project_id).toLowerCase()
      return name.includes(q)
    }).length
  }, [filtered, searchProject, projects])

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent'

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="pl-3 border-l-[3px] border-[#ed6055]">
          <h2 className="text-sm font-bold text-black tracking-tight">Issues &amp; Concerns</h2>
          <p className="text-xs text-gray-400 mt-0.5">Track and manage project issues.</p>
        </div>
      </div>

      {/* Filters */}
      {!loading && issues.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={searchProject}
            onChange={e => setSearchProject(e.target.value)}
            placeholder="Search projects…"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]">
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
          </select>
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]">
            <option value="all">All Groups</option>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterMgmtLevel} onChange={e => setFilterMgmtLevel(e.target.value)} className="flex-1 min-w-[150px] px-3 py-2 rounded-lg border border-gray-200 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]">
            <option value="all">All Mgmt Levels</option>
            {MANAGEMENT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {hasActiveFilter && (
            <button onClick={clearFilters} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 bg-white transition whitespace-nowrap">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? <TriangleLoader /> : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm italic">
            {issues.length === 0 ? 'No issues recorded yet.' : 'No issues match the selected filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                  {['Issue', 'Status', 'Date Presented', 'Days Aging'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  filtered.reduce((acc, issue) => {
                    const pid = issue.project_id ?? '__none__'
                    if (!acc[pid]) acc[pid] = []
                    acc[pid].push(issue)
                    return acc
                  }, {})
                )
                  .sort(([a], [b]) => projectName(a).localeCompare(projectName(b)))
                  .filter(([pid]) => projectName(pid).toLowerCase().includes(searchProject.trim().toLowerCase()))
                  .map(([pid, groupIssues]) => {
                    const isCollapsed = collapsed.has(pid)
                    return (
                      <Fragment key={pid}>
                        {/* Project group header */}
                        <tr
                          className="cursor-pointer select-none bg-gray-50 hover:bg-gray-100 transition border-t border-gray-100 first:border-t-0"
                          onClick={() => toggleGroup(pid)}
                        >
                          <td colSpan={4} className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <ChevronIcon collapsed={isCollapsed} />
                              <span className="text-xs font-bold text-black tracking-tight">{projectName(pid)}</span>
                              <span className="text-[10px] font-semibold text-white bg-[#ed6055] rounded-full px-1.5 py-0.5 leading-none">
                                {groupIssues.length}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Issue rows */}
                        {!isCollapsed && groupIssues.map(issue => {
                          const sc = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.open
                          const aging = daysAging(issue.date_presented)
                          return (
                            <tr
                              key={issue.id}
                              onClick={() => openView(issue)}
                              className="hover:bg-gray-50/60 transition cursor-pointer border-t border-gray-50"
                            >
                              <td className="px-5 py-3 text-gray-600 w-full">
                                <p className="line-clamp-2 text-xs">{issue.details}</p>
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${sc.className}`}>{sc.label}</span>
                              </td>
                              <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">{fmt(issue.date_presented)}</td>
                              <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                                {aging !== null ? `${aging}d` : <span className="text-gray-300 italic">—</span>}
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

      {!loading && issues.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-right">
          {visibleCount} of {issues.length} issue{issues.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && active && (() => {
        const aging = daysAging(active.date_presented)
        const sc = STATUS_CONFIG[active.status] ?? STATUS_CONFIG.open
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
              style={{ borderTop: '4px solid #ed6055' }} onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Issues &amp; Concerns</p>
                  <h3 className="text-base font-bold text-black leading-snug mt-0.5">
                    {projectName(active.project_id) !== '—' ? projectName(active.project_id) : 'No project linked'}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-[#ed6055] transition"><XIcon /></button>
                </div>
              </div>

              {/* Body — two-panel layout */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left panel */}
                <div className="w-44 flex-shrink-0 bg-[#ed6055] px-4 py-5 space-y-4 overflow-y-auto">
                  <LabelBox label="Status" value={sc.label} light />
                  <LabelBox label="Group" value={active.issue_group} light />
                  <LabelBox label="Management Level" value={active.management_level} light />
                  <LabelBox label="Date Presented" value={fmt(active.date_presented)} light />
                  <LabelBox label="Days Aging" value={aging !== null ? `${aging} day${aging !== 1 ? 's' : ''}` : null} light />
                </div>

                {/* Right panel */}
                <div className="flex-1 px-5 py-5 space-y-4 overflow-y-auto">
                  <SectionBlock label="Issue" value={active.details} />
                  <SectionBlock label="Caused By" value={active.caused_by} />
                  <SectionBlock label="Corrective Action" value={active.corrective_action} />
                </div>
              </div>

              <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
                <button onClick={closeModal} className="px-5 py-2 text-sm font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition">Close</button>
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

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)
const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
const ChevronIcon = ({ collapsed }) => (
  <svg
    className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200"
    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
