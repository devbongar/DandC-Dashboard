import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'

const DASHBOARD_PATHS = {
  admin:    '/admin/dashboard',
  head:     '/ho/dashboard',
  reviewer: '/ho/dashboard',
  endorser: '/reporter/dashboard',
  reporter: '/reporter/dashboard',
  viewer:   '/viewer/dashboard',
  approver: '/viewer/dashboard',
  updater:  '/viewer/dashboard',
}

export default function MobileBottomNav({ profile }) {
  const isSite        = profile?.team === 'site'
  const dashboardPath = DASHBOARD_PATHS[profile?.role] ?? '/viewer/dashboard'

  const [visible, setVisible] = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById('main-scroll')
      const currentY = el ? el.scrollTop : window.scrollY
      const delta = currentY - lastY.current
      if (Math.abs(delta) < 8) return
      setVisible(delta < 0 || currentY < 40)
      lastY.current = currentY
    }

    const el = document.getElementById('main-scroll')
    const target = el ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [])

  const items = [
    { label: 'Dashboard',  path: dashboardPath,       Icon: HomeIcon },
    ...(!isSite ? [
      { label: 'Units',    path: '/unit-completion',  Icon: ChartBarIcon },
      { label: 'Permits',  path: '/permits',          Icon: ClipboardListIcon },
    ] : []),
    { label: 'Projects',   path: '/projects',         Icon: FolderIcon },
    ...(!isSite ? [
      { label: 'Settings', path: '/admin/settings',   Icon: SettingsIcon },
    ] : []),
  ]

  return (
    <nav
      className="fixed bottom-4 left-1/2 z-50 sm:hidden flex items-center gap-0.5 px-2 py-1.5"
      style={{
        background: 'rgba(30, 30, 40, 0.28)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 9999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
        transform: `translateX(-50%) translateY(${visible ? '0' : 'calc(100% + 1.5rem)'})`,
        transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {items.map(({ label, path, Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === dashboardPath}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-full transition-all duration-150 ${
              isActive ? 'bg-[#ed6055]' : 'hover:bg-white/[0.07]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className="w-5 h-5 flex-shrink-0"
                style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.55)' }}
              />
              <span
                className="text-[9px] font-semibold leading-none tracking-wide"
                style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.45)' }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function HomeIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function ChartBarIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

function ClipboardListIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  )
}

function FolderIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function SettingsIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
