import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function useProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) { setProfile(null); setLoading(false) }
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, role, avatar_url')
        .eq('id', session.user.id)
        .single()

      if (!cancelled) { setProfile(data); setLoading(false) }
    }

    fetch()
    return () => { cancelled = true }
  }, [])

  return { profile, loading }
}
