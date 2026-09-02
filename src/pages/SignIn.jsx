import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

export default function SignIn() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [form, setForm]                 = useState({ email: '', password: '' })
  const [error, setError]               = useState('')
  const [notice, setNotice]             = useState(state?.notice ?? '')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      .select('role, team')
      .eq('id', signInData.user.id)
      .single()

    if (prof?.team === 'site') { navigate('/projects', { replace: true }); return }
    navigate('/admin/dashboard')
  }

  return (
    /*
     * Background: swap the gradient below for a real photo:
     *   backgroundImage: "url('/your-photo.jpg')"
     *   backgroundSize: 'cover', backgroundPosition: 'center'
     */
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{
        backgroundImage: "url('/sign_in_background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Full-screen dark overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.45)' }} />

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-end px-14 pb-16 relative z-10">

        {/* Logo top-left */}
        <div className="absolute top-10 left-14">
          <Logo size="md" variant="light" />
        </div>

        {/* Bottom text */}
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight mb-3">
            Don't Have<br />An Account?
          </h1>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs">
            Register to access all the features of our service.
            Manage your projects in one place.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-full border border-white/30 text-white/80 text-sm font-medium hover:bg-white/10 hover:border-white/50 hover:text-white transition-all duration-200 active:scale-[0.97]"
          >
            Sign Up &nbsp;&rsaquo;
          </Link>
        </div>
      </div>

      {/* ── Right panel (glass form) ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative z-10">
        {/* Glass card */}
        <div
          className="w-full max-w-xl rounded-2xl px-14 py-20"
          style={{
            background: 'rgba(0,0,0,0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden flex justify-center -mt-6">
            <Logo size="md" variant="light" />
          </div>

          {/* Title */}
          <h2 className="text-4xl font-bold text-white mb-10">Sign In</h2>

          {/* Notice */}
          {notice && (
            <div className="mb-5 px-4 py-3 rounded-xl text-sm text-green-300 border border-green-500/30 bg-green-500/10">
              {notice}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-sm text-[#f87171] border border-red-500/30 bg-red-500/10">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-9">

            {/* Email */}
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="Email"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <span className="absolute right-0 bottom-2.5 text-white/35 pointer-events-none">
                <EmailIcon />
              </span>
            </div>

            {/* Password */}
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="Password"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-0 bottom-2.5 text-white/35 hover:text-white/70 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <LockIcon />}
              </button>
            </div>

            {/* Forgot password + Submit on same row */}
            <div className="flex items-center justify-between -mt-3">
              <Link
                to="/forgot-password"
                className="text-xs text-white/45 hover:text-white/70 transition-colors"
              >
                Forgot password?
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-7 py-3 rounded-full border border-white/40 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {loading ? 'Signing in…' : 'Sign In'} &nbsp;&rsaquo;
              </button>

            </div>
          </form>

          {/* Footer link — all screen sizes */}
          <p className="mt-6 text-sm text-white/35">
            Don't have an account?{' '}
            <Link to="/signup" className="text-white/65 hover:text-white transition-colors font-medium">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
