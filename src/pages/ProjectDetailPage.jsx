import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DashboardLayout from '../components/DashboardLayout'
import useProfile from '../hooks/useProfile'
import LoadingScreen from '../components/LoadingScreen'
import ProjectDetailModal from '../components/ProjectDetailModal'

export const slugify = (str) =>
  str?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? ''

export default function ProjectDetailPage() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile, loading: profileLoading } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || 'Project Info'
    return tab === 'Project Info' ? null : tab
  })
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    const idFromState = location.state?.id
    if (idFromState) {
      supabase.from('projects').select('*').eq('id', idFromState).single()
        .then(({ data }) => { setProject(data); setLoading(false) })
    } else {
      supabase.from('projects').select('*')
        .then(({ data }) => {
          const match = data?.find(p =>
            slugify(p.project_code) === slug || slugify(p.name) === slug
          )
          setProject(match ?? null)
          setLoading(false)
        })
    }
  }, [slug, location.state?.id])

  useEffect(() => {
    if (!project) return
    document.title = `${project.name} -- D&C Dashboard`
    return () => { document.title = 'D&C Dashboard' }
  }, [project?.name])

  if (loading || profileLoading) return <LoadingScreen />
  if (!project) return <LoadingScreen />

  const startTab = searchParams.get('tab') || 'Project Info'

  const navOverride = section ? (
    <button
      onClick={() => setSection(null)}
      aria-label="Back to project home"
      className="h-full px-4 flex items-center flex-shrink-0 text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20 transition"
      style={{ transition: 'background 120ms ease' }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
    </button>
  ) : undefined

  const actions = (
    <button
      onClick={() => setReportOpen(true)}
      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-white/85 bg-white/10 border border-white/[0.15] hover:bg-white/20 active:scale-[0.97] flex-shrink-0 mr-1"
      style={{ transition: 'background 150ms ease, transform 100ms ease-out' }}
      title="Generate report"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      Report
    </button>
  )

  return (
    <DashboardLayout profile={profile} navOverride={navOverride} actions={actions} title={project.name}>
      <div
        className="fixed inset-x-0 bottom-0 overflow-hidden"
        style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
      >
        <ProjectDetailModal
          asPage
          project={project}
          isAdmin={isAdmin}
          onClose={() => navigate('/projects')}
          onProjectUpdated={(updated) => setProject(updated)}
          activeSection={section}
          onSectionChange={setSection}
          onTabChange={(tab) => setSearchParams({ tab })}
          reportOpen={reportOpen}
          onReportClose={() => setReportOpen(false)}
        />
      </div>
    </DashboardLayout>
  )
}
