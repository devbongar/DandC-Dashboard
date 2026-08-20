import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import LoadingScreen from '../components/LoadingScreen'

const DESTINATIONS = {
  admin:    '/admin/dashboard',
  head:     '/admin/dashboard',
  reviewer: '/admin/dashboard',
  endorser: '/admin/dashboard',
  reporter: '/admin/dashboard',
  viewer:   '/admin/dashboard',
  approver: '/admin/dashboard',
  updater:  '/admin/dashboard',
}

export default function Dashboard() {
  const navigate = useNavigate()

  useEffect(() => {
    const redirect = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/signin', { replace: true }); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, team')
        .eq('id', session.user.id)
        .single()

      if (profile?.team === 'site') { navigate('/projects', { replace: true }); return }
      navigate(DESTINATIONS[profile?.role] ?? '/viewer/dashboard', { replace: true })
    }
    redirect()
  }, [])

  return <LoadingScreen />
}
