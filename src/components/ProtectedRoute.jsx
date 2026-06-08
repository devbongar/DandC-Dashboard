import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useIdleTimeout } from '../hooks/useIdleTimeout'
import LoadingScreen from './LoadingScreen'

function IdleWarningBanner({ onStay }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] flex justify-center pb-6 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-4 bg-gray-900 text-white text-sm px-5 py-3.5 rounded-xl shadow-xl">
        <span>You've been idle. You'll be signed out in <strong>1 minute</strong>.</span>
        <button
          onClick={onStay}
          className="px-3 py-1.5 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white text-xs font-semibold transition"
        >
          Stay logged in
        </button>
      </div>
    </div>
  )
}

function AuthenticatedRoute({ children, roles }) {
  const [status, setStatus] = useState('loading')
  const { warning, stayLoggedIn } = useIdleTimeout()

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      let resolved
      if (!session) {
        resolved = 'unauth'
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_active')
          .eq('id', session.user.id)
          .single()

        if (profile?.is_active === false)         resolved = 'disabled'
        else if (!roles)                          resolved = 'ok'
        else resolved = roles.includes(profile?.role) ? 'ok' : 'forbidden'
      }

      if (!cancelled) setStatus(resolved)
    }

    check()
    return () => { cancelled = true }
  }, [])

  if (status === 'loading')   return <LoadingScreen />
  if (status === 'unauth')    return <Navigate to="/signin"      replace />
  if (status === 'forbidden') return <Navigate to="/unauthorized" replace />
  if (status === 'disabled')  return <Navigate to="/disabled"    replace />

  return (
    <>
      {children}
      {warning && <IdleWarningBanner onStay={stayLoggedIn} />}
    </>
  )
}

// roles: string[] — allowed roles. Omit to allow any authenticated user.
export default function ProtectedRoute({ children, roles }) {
  return <AuthenticatedRoute roles={roles}>{children}</AuthenticatedRoute>
}
