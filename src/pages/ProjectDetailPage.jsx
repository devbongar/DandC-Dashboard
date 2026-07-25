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

  useEffect(() => {
    const idFromState = location.state?.id
    if (idFromState) {
      supabase.from('projects').select('*').eq('id', idFromState).single()
        .then(({ data }) => { setProject(data); setLoading(false) })
    } else {
      // Direct URL access — find project by matching slug against name / project_code
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
    document.title = `${project.name} — D&C Dashboard`
    return () => { document.title = 'D&C Dashboard' }
  }, [project?.name])

  if (loading || profileLoading) return <LoadingScreen />
  if (!project) return <LoadingScreen />

  const startTab = searchParams.get('tab') || 'Project Info'

  return (
    <DashboardLayout profile={profile}>
      <div
        className="-mx-3 sm:-mx-4 flex flex-col overflow-hidden"
        style={{ height: 'calc(100dvh - 4rem - env(safe-area-inset-top, 0px) - 1.5rem)' }}
      >
        {/* Breadcrumb */}
        <nav className="px-4 py-2 flex items-center gap-1.5 text-xs flex-shrink-0 bg-[#e4e7ec]">
          <button
            onClick={() => navigate('/projects')}
            className="text-gray-500 hover:text-[#ed6055] transition font-medium"
          >
            Projects
          </button>
          <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-gray-800 font-semibold truncate">{project.name}</span>
        </nav>

        {/* Project detail panel */}
        <div className="flex-1 overflow-hidden">
          <ProjectDetailModal
            asPage
            project={project}
            isAdmin={isAdmin}
            onClose={() => navigate('/projects')}
            onProjectUpdated={(updated) => setProject(updated)}
            startTab={startTab}
            onTabChange={(tab) => setSearchParams({ tab })}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
