import ph1Logo from '../assets/ph1Logo.jpg'
import ph1LogoWhite from '../assets/ph1WorldWhite.png'
import { useAppSettings } from '../contexts/AppSettingsContext'

const heights = { sm: 30, md: 44, lg: 88 }

export default function Logo({ size = 'md', variant = 'light' }) {
  const { logoUrl, logoWhiteUrl, isLoading } = useAppSettings()
  const h = heights[size] ?? heights.md

  if (isLoading) return <div style={{ height: h, width: 'auto' }} />

  const lightSrc = logoUrl      || ph1Logo
  const whiteSrc = logoWhiteUrl || ph1LogoWhite

  if (variant === 'white') {
    return (
      <img
        src={whiteSrc}
        alt="Logo"
        style={{ height: h, width: 'auto', display: 'block' }}
        draggable={false}
      />
    )
  }

  if (variant === 'light') {
    const pad = Math.round(h * 0.12)
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: 10,
          padding: `${pad}px ${Math.round(pad * 1.4)}px`,
        }}
      >
        <img
          src={lightSrc}
          alt="Logo"
          style={{ height: h, width: 'auto', display: 'block' }}
          draggable={false}
        />
      </div>
    )
  }

  return (
    <img
      src={lightSrc}
      alt="Logo"
      style={{ height: h, width: 'auto', display: 'block' }}
      draggable={false}
    />
  )
}
