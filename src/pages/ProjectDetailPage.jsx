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
        className="fixed inset-x-0 bottom-0 overflow-hidden"
        style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
      >
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
    </DashboardLayout>
  )
}
