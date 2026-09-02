import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export async function fetchAppSettings(client) {
  try {
    const { data } = await client.from('app_settings').select('key, value')
    if (data && data.length > 0) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]))
      return { logoUrl: map.logo_url ?? null }
    }
    return { logoUrl: null }
  } catch {
    return { logoUrl: null }
  }
}

const AppSettingsContext = createContext({ logoUrl: null, isLoading: true, refresh: () => {} })

export function AppSettingsProvider({ children }) {
  const [logoUrl,   setLogoUrl]   = useState(() => localStorage.getItem('app_logo_url') || null)
  const [isLoading, setIsLoading] = useState(true)

  async function load() {
    const result = await Promise.race([
      fetchAppSettings(supabase),
      new Promise(resolve => setTimeout(() => resolve({ logoUrl: null }), 8000)),
    ])
    if (result.logoUrl) {
      setLogoUrl(result.logoUrl)
      localStorage.setItem('app_logo_url', result.logoUrl)
    }
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <AppSettingsContext.Provider value={{ logoUrl, isLoading, refresh: load }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
