import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

export default function SignUp() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    setError('')

    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName } },
    })

    setLoading(false)
    if (signUpError) { setError(signUpError.message); return }
    navigate('/signin')
  }

  return (
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
            Already Have<br />An Account?
          </h1>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs">
            Sign in to continue managing your projects and track progress in real time.
          </p>
          <Link
            to="/signin"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-full border border-white/30 text-white/80 text-sm font-medium hover:bg-white/10 hover:border-white/50 hover:text-white transition-all duration-200 active:scale-[0.97]"
          >
            Sign In &nbsp;&rsaquo;
          </Link>
        </div>
      </div>

      {/* ── Right panel (glass form) ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative z-10">
        <div
          className="w-full max-w-xl rounded-2xl px-14 py-16"
          style={{
            background: 'rgba(0,0,0,0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          {/* Mobile logo */}
          <div className="mb-6 lg:hidden flex justify-center">
            <Logo size="md" variant="light" />
          </div>

          {/* Title */}
          <h2 className="text-4xl font-bold text-white mb-10">Sign Up</h2>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-base text-[#f87171] border border-red-500/30 bg-red-500/10">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-9">

            {/* Full Name */}
            <div className="relative">
              <input
                id="fullName" name="fullName" type="text" autoComplete="name" required
                value={form.fullName} onChange={handleChange} placeholder="Full Name"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <span className="absolute right-0 bottom-3 text-white/35 pointer-events-none">
                <UserIcon />
              </span>
            </div>

            {/* Email */}
            <div className="relative">
              <input
                id="email" name="email" type="email" autoComplete="email" required
                value={form.email} onChange={handleChange} placeholder="Email"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <span className="absolute right-0 bottom-3 text-white/35 pointer-events-none">
                <EmailIcon />
              </span>
            </div>

            {/* Password */}
            <div className="relative">
              <input
                id="password" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete="new-password" required value={form.password} onChange={handleChange}
                placeholder="Password"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                className="absolute right-0 bottom-3 text-white/35 hover:text-white/70 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOffIcon /> : <LockIcon />}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <input
                id="confirmPassword" name="confirmPassword" type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password" required value={form.confirmPassword} onChange={handleChange}
                placeholder="Confirm Password"
                className="w-full bg-transparent text-white placeholder-white/40 text-base pb-3 pr-8 focus:outline-none"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                className="absolute right-0 bottom-3 text-white/35 hover:text-white/70 transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? <EyeOffIcon /> : <LockIcon />}
              </button>
            </div>

            {/* Submit row */}
            <div className="flex items-center justify-between pt-1">
              <Link
                to="/signin"
                className="text-sm text-white/45 hover:text-white/70 transition-colors lg:hidden"
              >
                Have an account?
              </Link>
              <button
                type="submit" disabled={loading}
                className="flex items-center gap-2 px-7 py-3 rounded-full border border-white/40 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
              >
                {loading && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {loading ? 'Creating…' : 'Sign Up'} &nbsp;&rsaquo;
              </button>
            </div>
          </form>

          {/* Desktop footer */}
          <p className="mt-8 text-sm text-white/35 hidden lg:block">
            Already have an account?{' '}
            <Link to="/signin" className="text-white/65 hover:text-white transition-colors font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
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
