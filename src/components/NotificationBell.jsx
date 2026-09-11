import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clipRule="evenodd" />
    </svg>
  )
}

export default function NotificationBell({ userId, variant = 'dark' }) {
  const [notifications, setNotifications] = useState([])
  const [open,          setOpen]          = useState(false)
  const panelRef = useRef(null)

  const unread = notifications.filter(n => !n.read_at)

  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
  }

  async function markRead(notification) {
    if (notification.read_at) return
    const { data } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notification.id)
      .select()
      .single()
    if (data) setNotifications(prev => prev.map(n => n.id === data.id ? data : n))
  }

  async function markAllRead() {
    const ids = unread.map(n => n.id)
    if (!ids.length) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
  }

  function formatPayload(n) {
    if (n.payload?.message) return n.payload.message
    if (n.type === 'issue_raised')   return `Issue raised on ${n.payload?.permit_name ?? n.payload?.permit_id}`
    if (n.type === 'issue_resolved') return `Issue resolved on ${n.payload?.permit_name ?? n.payload?.permit_id}`
    if (n.type === 'permit_overdue') return `Permit overdue: ${n.payload?.permit_name ?? n.payload?.permit_id}`
    return n.type ?? 'Notification'
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition ${variant === 'light' ? 'text-gray-500 hover:text-gray-800 hover:bg-black/[0.05]' : 'text-white hover:bg-white/[0.08]'}`}
        aria-label="Notifications"
      >
        <BellIcon className="w-5 h-5" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ed6055] text-[9px] font-bold text-white leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</p>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#ed6055] hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">No notifications yet.</li>
            )}
            {notifications.map(n => (
              <li
                key={n.id}
                onClick={() => markRead(n)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${!n.read_at ? 'bg-[#ed6055]/5' : ''}`}
              >
                <p className={`text-sm leading-snug ${!n.read_at ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                  {formatPayload(n)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
