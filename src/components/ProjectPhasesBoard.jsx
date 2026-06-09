import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import GanttModal from './GanttModal'
import SearchDropdown from './SearchDropdown'
import TriangleLoader from './TriangleLoader'

const PHASES = [
  { key: 'initiation',           label: 'Initiation',            shortLabel: 'Init' },
  { key: 'planning',             label: 'Planning',              shortLabel: 'Plan' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring', shortLabel: 'Exec' },
  { key: 'closeout',             label: 'Close-Out',             shortLabel: 'Close' },
]
export default function ProjectPhasesBoard() {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [selected, setSelected]   = useState(null)
  const [is4ph, setIs4ph]         = useState('all')
  const [projectId, setProjectId] = useState('all')

  useEffect(() => { fetchProjects() }, [])

  const fetchProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error && data) setProjects(data)
    setLoading(false)
  }

  const showToast = (message, type) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filteredProjects = useMemo(() => projects
    .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
    .filter(p => projectId === 'all' || p.id === projectId)
  , [projects, is4ph, projectId])

  const byPhase = (key) => filteredProjects.filter(p => p.phase === key)

  return (
    <section className="mb-0 h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow p-4">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Active Projects</h2>
        </div>
        {!loading && (
          <span className="text-xs font-bold text-[#ed6055]">{filteredProjects.length} projects</span>
        )}
      </div>

      {/* ── Filters ── */}
      {!loading && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Type toggle */}
          <div
            className="flex items-center gap-0.5 flex-shrink-0 p-0.5 rounded-lg"
            style={{
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
              <button
                key={t.key}
                onClick={() => { setIs4ph(t.key); setProjectId('all') }}
                className="relative px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                style={is4ph === t.key ? {
                  background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                  color: '#fff',
                  boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                } : {
                  color: '#6b7280',
                  background: 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Project picker */}
          <SearchDropdown
            options={projects
              .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
              .sort((a, b) => (a.project_code || a.name).localeCompare(b.project_code || b.name))
              .map(p => ({ value: p.id, label: p.project_code || p.name }))
            }
            value={projectId}
            onChange={setProjectId}
            emptyValue="all"
            emptyLabel="All Projects"
            placeholder="Search projects…"
            icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            minWidth={130}
          />
        </div>
      )}

      {loading ? (
        <div className="flex-1"><TriangleLoader label="Loading projects…" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 flex-1">
          {PHASES.map((phase) => {
            const phaseProjects = byPhase(phase.key)
            return (
              <div key={phase.key} className="flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-gray-50 h-full">

                {/* Column header */}
                <div className="px-3 py-2.5 bg-white border-b border-b-gray-100 flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-gray-600 leading-tight truncate">{phase.label}</span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: phaseProjects.length > 0 ? 'rgba(237,96,85,0.10)' : '#f3f4f6', color: phaseProjects.length > 0 ? '#ed6055' : '#9ca3af' }}
                  >
                    {phaseProjects.length}
                  </span>
                </div>

                {/* Cards tray */}
                <div className="p-2 space-y-1.5 min-h-[80px] max-h-[340px] overflow-y-auto">
                  {phaseProjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-16 gap-1">
                      <svg className="w-5 h-5 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                      <p className="text-xs text-gray-300">No projects</p>
                    </div>
                  ) : (
                    phaseProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => setSelected(project)}
                        className="w-full text-left bg-white border border-gray-100 rounded-lg px-3 py-2.5 hover:border-[#ed6055]/30 hover:shadow-sm transition group"
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-[#ed6055] transition-colors">{project.project_code || project.name}</p>
                          <ChevronRightIcon />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {project.business_unit && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">
                              {project.business_unit}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <GanttModal project={selected} onClose={() => setSelected(null)} />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}
          style={{ animation: 'ph1-fade-up 0.2s ease-out both' }}
        >
          {toast.message}
        </div>
      )}
    </section>
  )
}



const ChevronRightIcon = () => (
  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

