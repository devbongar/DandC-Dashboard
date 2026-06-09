import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const TRIANGLES = [
  { size: 28, top: '9%',  left: '18%', anim: 'ph1-tri-a', dur: '14s', delay: '0s'   , op: 0.18 },
  { size: 16, top: '5%',  left: '62%', anim: 'ph1-tri-b', dur: '17s', delay: '2.4s' , op: 0.14 },
  { size: 38, top: '28%', left: '76%', anim: 'ph1-tri-c', dur: '13s', delay: '4.1s' , op: 0.12 },
  { size: 20, top: '52%', left: '12%', anim: 'ph1-tri-b', dur: '16s', delay: '1.5s' , op: 0.15 },
  { size: 12, top: '62%', left: '68%', anim: 'ph1-tri-a', dur: '18s', delay: '6s'   , op: 0.13 },
  { size: 44, top: '74%', left: '38%', anim: 'ph1-tri-c', dur: '15s', delay: '3.6s' , op: 0.11 },
  { size: 18, top: '38%', left: '90%', anim: 'ph1-tri-a', dur: '13s', delay: '7s'   , op: 0.15 },
  { size: 22, top: '20%', left: '44%', anim: 'ph1-tri-b', dur: '16s', delay: '8.4s' , op: 0.12 },
  { size: 10, top: '85%', left: '55%', anim: 'ph1-tri-a', dur: '14s', delay: '5.6s' , op: 0.16 },
  { size: 30, top: '15%', left: '88%', anim: 'ph1-tri-c', dur: '18s', delay: '0.8s' , op: 0.13 },
  { size: 14, top: '72%', left: '6%',  anim: 'ph1-tri-a', dur: '13s', delay: '10.2s', op: 0.14 },
  { size: 50, top: '88%', left: '82%', anim: 'ph1-tri-b', dur: '17s', delay: '3s'   , op: 0.10 },
  { size: 26, top: '45%', left: '30%', anim: 'ph1-tri-c', dur: '15s', delay: '7.6s' , op: 0.11 },
  { size: 20, top: '58%', left: '92%', anim: 'ph1-tri-b', dur: '18s', delay: '12.4s', op: 0.13 },
]

export default function SignIn() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [form, setForm]             = useState({ email: '', password: '' })
  const [error, setError]           = useState('')
  const [notice, setNotice]         = useState(state?.notice ?? '')
  const [loading, setLoading]       = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard', { replace: true })
    })
  }, [])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (signInError) {
      setLoading(false)
      setError(signInError.message)
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', signInData.user.id)
      .single()

    const destinations = {
      admin:    '/admin/dashboard',
      approver: '/approver/dashboard',
      updater:  '/updater/dashboard',
      viewer:   '/viewer/dashboard',
    }
    navigate(destinations[prof?.role] ?? '/viewer/dashboard')
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#f8fafc' }}>

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col items-center justify-center px-12 relative overflow-hidden">

        {/* Animated background blobs */}
        <div
          className="absolute top-0 right-0 w-64 h-64 bg-[#ed6055] rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ animation: 'ph1-blob 9s ease-in-out infinite', opacity: 0.08 }}
        />
        <div
          className="absolute bottom-0 left-0 w-96 h-96 bg-[#ed6055] rounded-full translate-y-1/2 -translate-x-1/2"
          style={{ animation: 'ph1-blob 12s ease-in-out infinite 3s', opacity: 0.08 }}
        />

        {/* Floating triangles */}
        {TRIANGLES.map((t, i) => (
          <div
            key={i}
            style={{
              position:  'absolute',
              width:     t.size,
              height:    t.size,
              top:       t.top,
              left:      t.left,
              background:'#ed6055',
              clipPath:  'polygon(0 0, 100% 50%, 0 100%)',
              opacity:   t.op,
              animation: `${t.anim} ${t.dur} ease-in-out infinite ${t.delay}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Vertical divider on right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Logo + tagline */}
        <div className="flex flex-col items-center" style={{ animation: 'ph1-fade-up 0.7s ease-out 0.1s both' }}>
          <Logo size="lg" variant="light" />
          <p className="mt-6 text-white/65 text-sm text-center max-w-xs leading-relaxed">
            Building tomorrow's infrastructure,<br />one project at a time.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12" style={{ background: '#f8fafc' }}>
        <div className="w-full max-w-md">

          {/* Mobile logo + tagline */}
          <div
            className="flex flex-col items-center mb-8 lg:hidden"
            style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}
          >
            <Logo size="md" variant="dark" />
            <p className="mt-3 text-gray-400 text-xs text-center leading-relaxed">
              Building tomorrow's infrastructure,<br />one project at a time.
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-8">

            {/* Heading */}
            <div style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}>
              <h2 className="text-2xl font-bold text-black mb-1">Welcome back</h2>
              <p className="text-gray-500 text-sm mb-6">Sign in to your account to continue</p>
            </div>

            {/* Notice */}
            {notice && (
              <div
                className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-start gap-2.5"
                style={{ animation: 'ph1-fade-in 0.3s ease-out both' }}
              >
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{notice}</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="mb-4 px-4 py-3 bg-[#ed6055]/8 border border-[#ed6055]/25 rounded-xl text-[#ed6055] text-sm flex items-start gap-2.5"
                style={{ animation: 'ph1-fade-in 0.3s ease-out both' }}
              >
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <div style={{ animation: 'ph1-fade-up 0.5s ease-out 0.1s both' }}>
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Email */}
                <div>
                  <label
                    className="block text-sm font-medium mb-1.5 transition-colors"
                    htmlFor="email"
                    style={{ color: focusedField === 'email' ? '#ed6055' : '#111827' }}
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition bg-white"
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      className="block text-sm font-medium transition-colors"
                      htmlFor="password"
                      style={{ color: focusedField === 'password' ? '#ed6055' : '#111827' }}
                    >
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-sm text-[#ed6055] hover:text-[#d94f45] hover:underline transition-colors font-medium"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={form.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                  style={{
                    background: loading
                      ? '#ed6055'
                      : 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                    boxShadow: loading ? 'none' : '0 2px 8px rgba(237,96,85,0.35)',
                  }}
                >
                  {loading && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </div>

          </div>

          {/* Footer link */}
          <p
            className="mt-5 text-center text-sm text-gray-500"
            style={{ animation: 'ph1-fade-up 0.5s ease-out 0.2s both' }}
          >
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#ed6055] font-semibold hover:underline">
              Create one
            </Link>
          </p>

        </div>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
