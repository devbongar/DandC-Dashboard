import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const AppSettingsContext = createContext({ logoUrl: null, logoWhiteUrl: null, refresh: () => {} })

export function AppSettingsProvider({ children }) {
  const [logoUrl,      setLogoUrl]      = useState(null)
  const [logoWhiteUrl, setLogoWhiteUrl] = useState(null)

  async function load() {
    const { data } = await supabase.from('app_settings').select('key, value')
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]))
      setLogoUrl(map.logo_url ?? null)
      setLogoWhiteUrl(map.logo_white_url ?? null)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <AppSettingsContext.Provider value={{ logoUrl, logoWhiteUrl, refresh: load }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
