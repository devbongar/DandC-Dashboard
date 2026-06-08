import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Cell components ───────────────────────────────────────────────────────────

const DoneCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
      <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  </div>
)

const OngoingCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </span>
  </div>
)

const NotStartedCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-[#ed6055]" />
    </span>
  </div>
)

const NACell = () => (
  <span className="text-[10px] text-gray-300 font-medium select-none">N/A</span>
)

// ── Loader ────────────────────────────────────────────────────────────────────

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
      <p className="text-xs text-gray-400">Loading compliance data…</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComplianceTable() {
  const [permits, setPermits]       = useState([])
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [sortOrder, setSortOrder]   = useState('asc') // 'asc' | 'desc'

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [permitsRes, projectsRes] = await Promise.all([
      supabase.from('project_permits').select('id, project_id, permit_name, status'),
      supabase.from('projects').select('id, name').order('name'),
    ])
    if (permitsRes.data)  setPermits(permitsRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    setLoading(false)
  }

  // All unique permit names across every project, sorted A→Z
  const permitNames = useMemo(() =>
    [...new Set(permits.map(p => p.permit_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [permits]
  )

  // Fast lookup: lookup[projectId][permitName] = 'done' | 'ongoing' | 'not_yet_started' | undefined
  const lookup = useMemo(() => {
    const map = {}
    permits.forEach(p => {
      if (!map[p.project_id]) map[p.project_id] = {}
      map[p.project_id][p.permit_name] = p.status
    })
    return map
  }, [permits])

  // Filtered + sorted projects
  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q ? projects.filter(p => p.name.toLowerCase().includes(q)) : [...projects]
    list.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, search, sortOrder])

  const renderCell = (projectId, permitName) => {
    const status = lookup[projectId]?.[permitName]
    if (status === undefined)      return <NACell />
    if (status === 'done')         return <DoneCell />
    if (status === 'ongoing')      return <OngoingCell />
    return <NotStartedCell />
  }

  const isEmpty = !loading && (projects.length === 0 || permitNames.length === 0)

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="pl-3 border-l-[3px] border-[#ed6055]">
          <h2 className="text-sm font-bold text-black tracking-tight">Compliance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Permit checklist across all projects.</p>
        </div>
      </div>

      {/* Filters */}
      {!loading && !isEmpty && (
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-xs text-black placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent"
          />

          <button
            onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs text-black bg-white hover:bg-gray-50 transition"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M7 12h10M11 17h2" />
            </svg>
            {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? <TriangleLoader /> : isEmpty ? (
          <div className="text-center py-16 text-gray-400 text-sm italic">
            {projects.length === 0 ? 'No projects yet.' : 'No permits recorded yet.'}
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm italic">
            No projects match your search.
          </div>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {/* Top-left sticky corner */}
                  <th
                    className="sticky left-0 top-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-4 py-3 text-left min-w-[180px]"
                  >
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project</span>
                  </th>

                  {/* Permit column headers — rotated vertical text */}
                  {permitNames.map(name => (
                    <th
                      key={name}
                      className="sticky top-0 z-20 bg-gray-50 border-b border-r border-gray-200"
                      style={{ width: 48, minWidth: 48 }}
                    >
                      <div className="flex items-end justify-center h-32 pb-2.5 px-1">
                        <span
                          title={name}
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 112 }}
                          className="text-[10px] font-semibold text-gray-600 leading-tight overflow-hidden"
                        >
                          {name}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleProjects.map((proj, pi) => {
                  const isEven = pi % 2 === 0
                  const rowBg  = isEven ? 'bg-white' : 'bg-gray-50/60'
                  return (
                    <tr key={proj.id}>
                      {/* Project name — sticky left column */}
                      <td
                        className={`sticky left-0 z-10 border-r border-b border-gray-100 px-4 py-2.5 font-medium text-black text-xs ${rowBg}`}
                      >
                        <span className="block truncate max-w-[200px]" title={proj.name}>
                          {proj.name}
                        </span>
                      </td>

                      {/* Permit status cells */}
                      {permitNames.map(name => (
                        <td
                          key={name}
                          className={`border-r border-b border-gray-100 p-1.5 text-center align-middle ${rowBg}`}
                          style={{ width: 48 }}
                        >
                          {renderCell(proj.id, name)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && !isEmpty && (
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span className="text-[10px] text-gray-500">Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span className="text-[10px] text-gray-500">Ongoing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ed6055]" />
            </span>
            <span className="text-[10px] text-gray-500">Not Yet Started</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-300 font-medium">N/A</span>
            <span className="text-[10px] text-gray-500">No permit on record</span>
          </div>
        </div>
      )}
    </section>
  )
}
