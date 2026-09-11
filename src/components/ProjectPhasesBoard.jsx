import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import SearchDropdown from './SearchDropdown'
import TriangleLoader from './TriangleLoader'

const PHASES = [
  {
    key: 'initiation',
    label: 'Initiation',
    shortLabel: 'Init',
    bg: 'linear-gradient(135deg, #3b82f6 0%, #1e1b4b 100%)',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    key: 'planning',
    label: 'Planning',
    shortLabel: 'Plan',
    bg: 'linear-gradient(135deg, #d97706 0%, #451a03 100%)',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  {
    key: 'execution_monitoring',
    label: 'Execution & Monitoring',
    shortLabel: 'Exec',
    bg: 'linear-gradient(135deg, #16a34a 0%, #052e16 100%)',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    key: 'closeout',
    label: 'Close-Out',
    shortLabel: 'Close',
    bg: 'linear-gradient(135deg, #6b7280 0%, #1f2937 100%)',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]
export default function ProjectPhasesBoard({ id }) {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [is4ph, setIs4ph]         = useState('all')
  const [projectId, setProjectId] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  const fetchProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error && data) setProjects(data)
    setLoading(false)
  }

  const filteredProjects = useMemo(() => projects
    .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
    .filter(p => projectId === 'all' || p.id === projectId)
  , [projects, is4ph, projectId])

  const byPhase = (key) => filteredProjects.filter(p => p.phase === key)

  return (
    <section id={id} className="mb-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow p-4">

      {/* -- Section header -- */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Active Projects</h2>
          {!loading && (
            <span className="text-xs font-semibold text-gray-400">{filteredProjects.length} projects</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && (() => {
            const activeFilterCount = [is4ph !== 'all', projectId !== 'all'].filter(Boolean).length
            return (
              <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
              style={{
                background: filterOpen || activeFilterCount > 0 ? '#fff' : '#fafafa',
                borderColor: activeFilterCount > 0 ? '#ed6055' : (filterOpen ? '#ed6055' : '#e5e7eb'),
                color: activeFilterCount > 0 ? '#ed6055' : '#6b7280',
                boxShadow: filterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <div className="absolute top-full right-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64 flex flex-col gap-3">
                {/* Type */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Type</p>
                  <div
                    className="flex items-center gap-0.5 p-0.5 rounded-lg w-full"
                    style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
                  >
                    {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                      <button
                        key={t.key}
                        onClick={() => { setIs4ph(t.key); setProjectId('all') }}
                        className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                        style={is4ph === t.key ? {
                          background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                          color: '#fff',
                          boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                        } : { color: '#6b7280', background: 'transparent' }}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>

                {/* Project */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Project</p>
                  <SearchDropdown
                    fluid
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
                  />
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setIs4ph('all'); setProjectId('all') }}
                    className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
            )
          })()}
        </div>
      </div>

      {loading ? (
        <TriangleLoader label="Loading projects…" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PHASES.map((phase) => {
            const count = byPhase(phase.key).length
            const pct = filteredProjects.length > 0 ? Math.round((count / filteredProjects.length) * 100) : 0
            return (
              <div
                key={phase.key}
                className="rounded-xl px-4 py-2.5 flex flex-col gap-1.5 overflow-hidden"
                style={{
                  background: phase.bg,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                <span className="text-xs font-bold tracking-wide leading-tight block" style={{ color: 'rgba(255,255,255,0.6)', minHeight: '2em' }}>{phase.label}</span>
                <div className="flex flex-row items-center gap-2">
                  <span className="text-xl font-bold tabular-nums leading-tight text-white flex-1">{count}</span>
                  <div className="flex-shrink-0 [&_svg]:w-7 [&_svg]:h-7" style={{ color: 'rgba(255,255,255,0.15)' }}>{phase.icon}</div>
                </div>
                <span className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>{pct}% of total</span>
              </div>
            )
          })}
        </div>
      )}

    </section>
  )
}




