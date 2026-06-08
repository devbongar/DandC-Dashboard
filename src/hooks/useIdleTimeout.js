import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const IDLE_MS = 30 * 60 * 1000  // 30 minutes
const WARN_MS = 29 * 60 * 1000  // warn at 29 min (1 min before sign-out)

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export function useIdleTimeout() {
  const navigate  = useNavigate()
  const idleTimer = useRef(null)
  const warnTimer = useRef(null)
  const [warning, setWarning] = useState(false)

  const reset = useCallback(() => {
    setWarning(false)
    clearTimeout(idleTimer.current)
    clearTimeout(warnTimer.current)
    warnTimer.current = setTimeout(() => setWarning(true), WARN_MS)
    idleTimer.current = setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/signin', { replace: true })
    }, IDLE_MS)
  }, [navigate])

  useEffect(() => {
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, reset))
      clearTimeout(idleTimer.current)
      clearTimeout(warnTimer.current)
    }
  }, [reset])

  return { warning, stayLoggedIn: reset }
}
