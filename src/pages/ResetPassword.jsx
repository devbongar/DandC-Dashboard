import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const TRIANGLES = [
  { size: 28, top: '9%',  left: '18%', anim: 'ph1-tri-a', dur: '14s', delay: '0s',    op: 0.18 },
  { size: 16, top: '5%',  left: '62%', anim: 'ph1-tri-b', dur: '17s', delay: '2.4s',  op: 0.14 },
  { size: 38, top: '28%', left: '76%', anim: 'ph1-tri-c', dur: '13s', delay: '4.1s',  op: 0.12 },
  { size: 20, top: '52%', left: '12%', anim: 'ph1-tri-b', dur: '16s', delay: '1.5s',  op: 0.15 },
  { size: 12, top: '62%', left: '68%', anim: 'ph1-tri-a', dur: '18s', delay: '6s',    op: 0.13 },
  { size: 44, top: '74%', left: '38%', anim: 'ph1-tri-c', dur: '15s', delay: '3.6s',  op: 0.11 },
  { size: 18, top: '38%', left: '90%', anim: 'ph1-tri-a', dur: '13s', delay: '7s',    op: 0.15 },
  { size: 22, top: '20%', left: '44%', anim: 'ph1-tri-b', dur: '16s', delay: '8.4s',  op: 0.12 },
  { size: 50, top: '88%', left: '82%', anim: 'ph1-tri-b', dur: '17s', delay: '3s',    op: 0.10 },
]

export default function ResetPassword() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const token     = state?.token

  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [showPw, setShowPw]   = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!token) return <Navigate to="/forgot-password" replace />

  const mismatch = form.password && form.confirm && form.password !== form.confirm
  const weak     = form.password && form.password.length < 8
  const disabled = loading || !form.password || !form.confirm || !!mismatch || !!weak

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (disabled) return
    setLoading(true)
    setError('')

    const { error: fnErr } = await supabase.functions.invoke('reset-password', {
      body: { token, new_password: form.password },
    })

    setLoading(false)
    if (fnErr) {
      setError(fnErr.message || 'Failed to reset password. The link may have expired.')
      return
    }
    navigate('/signin', { state: { notice: 'Password reset successfully. Please sign in.' } })
  }

  const inputCls = (err) =>
    `w-full pl-4 pr-11 py-3 rounded-lg border text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition ${
      err ? 'border-red-300 focus:ring-red-400 bg-red-50' : 'border-gray-200 focus:ring-[#ed6055] bg-white'
    }`

  return (
    <div className="min-h-screen flex">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col items-center justify-center px-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#ed6055] rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ animation: 'ph1-blob 9s ease-in-out infinite', opacity: 0.08 }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#ed6055] rounded-full translate-y-1/2 -translate-x-1/2"
          style={{ animation: 'ph1-blob 12s ease-in-out infinite 3s', opacity: 0.08 }} />
        {TRIANGLES.map((t, i) => (
          <div key={i} style={{
            position: 'absolute', width: t.size, height: t.size, top: t.top, left: t.left,
            background: '#ed6055', clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
            opacity: t.op, animation: `${t.anim} ${t.dur} ease-in-out infinite ${t.delay}`,
            pointerEvents: 'none',
          }} />
        ))}
        <div style={{ animation: 'ph1-fade-up 0.7s ease-out 0.1s both' }}>
          <Logo size="lg" variant="light" />
          <p className="mt-6 text-white/50 text-sm text-center max-w-xs leading-relaxed">
            Building tomorrow's infrastructure,<br />one project at a time.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          <div className="flex justify-center mb-8 lg:hidden" style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}>
            <Logo size="md" variant="dark" />
          </div>

          <div style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}>
            <h2 className="text-3xl font-bold text-black mb-1">Set new password</h2>
            <p className="text-gray-500 text-sm mb-8">Choose a strong password for your account.</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-[#ed6055]/10 border border-[#ed6055]/30 rounded-lg text-[#ed6055] text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-black mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={form.password}
                    onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError('') }}
                    placeholder="At least 8 characters"
                    className={inputCls(weak)}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {weak && <p className="text-xs text-red-500 mt-1">Must be at least 8 characters.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConf ? 'text' : 'password'}
                    required
                    value={form.confirm}
                    onChange={e => { setForm(f => ({ ...f, confirm: e.target.value })); setError('') }}
                    placeholder="Repeat new password"
                    className={inputCls(mismatch)}
                  />
                  <button type="button" onClick={() => setShowConf(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                    {showConf ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>}
              </div>

              <button
                type="submit"
                disabled={disabled}
                className="w-full py-3 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white font-semibold text-sm transition disabled:opacity-60"
              >
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500" style={{ animation: 'ph1-fade-up 0.5s ease-out 0.2s both' }}>
            <Link to="/signin" className="text-[#ed6055] font-medium hover:underline">Back to Sign In</Link>
          </p>

        </div>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}
