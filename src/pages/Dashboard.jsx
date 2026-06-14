import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import LoadingScreen from '../components/LoadingScreen'

const DESTINATIONS = {
  admin:    '/admin/dashboard',
  approver: '/approver/dashboard',
  updater:  '/updater/dashboard',
  viewer:   '/viewer/dashboard',
}

export default function Dashboard() {
  const navigate = useNavigate()

  useEffect(() => {
    const redirect = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/signin', { replace: true }); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      navigate(DESTINATIONS[profile?.role] ?? '/viewer/dashboard', { replace: true })
    }
    redirect()
  }, [])

  return <LoadingScreen />
}
