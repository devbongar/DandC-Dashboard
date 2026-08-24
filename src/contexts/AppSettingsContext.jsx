import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export async function fetchAppSettings(client) {
  try {
    const { data } = await client.from('app_settings').select('key, value')
    if (data && data.length > 0) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]))
      return { logoUrl: map.logo_url ?? null, logoWhiteUrl: map.logo_white_url ?? null }
    }
    return { logoUrl: null, logoWhiteUrl: null }
  } catch {
    return { logoUrl: null, logoWhiteUrl: null }
  }
}

const AppSettingsContext = createContext({ logoUrl: null, logoWhiteUrl: null, isLoading: true, refresh: () => {} })

export function AppSettingsProvider({ children }) {
  const [logoUrl,      setLogoUrl]      = useState(() => localStorage.getItem('app_logo_url') || null)
  const [logoWhiteUrl, setLogoWhiteUrl] = useState(() => localStorage.getItem('app_logo_white_url') || null)
  const [isLoading,    setIsLoading]    = useState(true)

  const FALLBACK = { logoUrl: null, logoWhiteUrl: null }

  async function load() {
    const result = await Promise.race([
      fetchAppSettings(supabase),
      new Promise(resolve => setTimeout(() => resolve(FALLBACK), 8000)),
    ])
    setLogoUrl(result.logoUrl)
    setLogoWhiteUrl(result.logoWhiteUrl)
    if (result.logoUrl)      localStorage.setItem('app_logo_url',       result.logoUrl)
    if (result.logoWhiteUrl) localStorage.setItem('app_logo_white_url', result.logoWhiteUrl)
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <AppSettingsContext.Provider value={{ logoUrl, logoWhiteUrl, isLoading, refresh: load }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
