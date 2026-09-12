import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
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

  const filteredProjects = projects
  const byPhase = (key) => projects.filter(p => p.phase === key)

  return (
    <section id={id} className="mb-0 flex flex-col bg-white border border-gray-200 shadow p-4" style={{ borderRadius: 30 }}>

      {/* -- Section header -- */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Active Projects</h2>
          {!loading && (
            <span className="text-xs font-semibold text-gray-400">{filteredProjects.length} projects</span>
          )}
        </div>
        <div />
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




