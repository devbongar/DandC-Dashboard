import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import GanttModal from './GanttModal'

const PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]
export default function ProjectPhasesBoard() {
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)
  const [selected, setSelected]     = useState(null)

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

  const byPhase = (key) => projects.filter(p => p.phase === key)

  return (
    <section className="mb-0 h-full flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm p-2">

      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="pl-3 border-l-[3px] border-[#ed6055]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-black tracking-tight">Project Phases</h2>
            <span className="w-5 h-5 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {projects.length}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Overview of all tracked projects</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1"><TriangleLoader /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-1">
          {PHASES.map((phase) => {
            const phaseProjects = byPhase(phase.key)
            return (
              <div key={phase.key} className="flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm h-full">

                {/* Column header */}
                <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider leading-tight">{phase.label}</span>
                  <span className="w-5 h-5 rounded-full border border-[#ed6055]/40 text-[#ed6055]/60 text-[10px] font-bold flex items-center justify-center flex-shrink-0 leading-none">
                    {phaseProjects.length}
                  </span>
                </div>

                {/* Cards tray */}
                <div className="p-2 space-y-1.5 min-h-[80px] max-h-[340px] overflow-y-auto">
                  {phaseProjects.length === 0 ? (
                    <div className="flex items-center justify-center h-16">
                      <p className="text-xs text-gray-300 italic">No projects</p>
                    </div>
                  ) : (
                    phaseProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => setSelected(project)}
                        className="w-full text-left bg-white border border-gray-100 rounded-lg px-3 py-2 hover:border-gray-300 hover:shadow-sm transition"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold text-black leading-snug line-clamp-2">{project.name}</p>
                          <ChevronRightIcon />
                        </div>
                        {project.location && (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{project.location}</p>
                        )}
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
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}>
          {toast.message}
        </div>
      )}
    </section>
  )
}


function TriangleLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="flex items-center gap-3">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 12, height: 12,
              background: '#ed6055',
              clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
              animation: 'ph1-loader-tri 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">Loading projects…</p>
    </div>
  )
}

const ChevronRightIcon = () => (
  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

