import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

export default function Unauthorized() {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="mb-8">
        <Logo size="md" variant="dark" />
      </div>

      <div className="w-20 h-20 rounded-full bg-[#ed6055]/10 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>

      <h1 className="text-3xl font-bold text-black mb-2">Access Denied</h1>
      <p className="text-gray-500 text-sm text-center max-w-xs mb-8">
        You don't have permission to view this page. Contact your administrator if you think this is a mistake.
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="px-5 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Go to Dashboard
        </button>
        <button
          onClick={handleSignOut}
          className="px-5 py-2.5 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
