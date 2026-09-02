import ph1Logo from '../assets/ph1Logo.jpg'
import { useAppSettings } from '../contexts/AppSettingsContext'

const heights = { sm: 30, md: 44, lg: 88 }

export default function Logo({ size = 'md' }) {
  const { logoUrl, isLoading } = useAppSettings()
  const h = heights[size] ?? heights.md

  if (isLoading) return <div style={{ height: h, width: 'auto' }} />

  return (
    <img
      src={logoUrl || ph1Logo}
      alt="Logo"
      style={{ height: h, width: 'auto', display: 'block' }}
      draggable={false}
    />
  )
}
