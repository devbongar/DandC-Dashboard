import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const TRIANGLES = [
  { size: 32, top: '7%',  left: '24%', anim: 'ph1-tri-b', dur: '16s', delay: '0s'   , op: 0.17 },
  { size: 14, top: '12%', left: '70%', anim: 'ph1-tri-a', dur: '18s', delay: '2.8s' , op: 0.14 },
  { size: 42, top: '32%', left: '80%', anim: 'ph1-tri-c', dur: '13s', delay: '1.4s' , op: 0.12 },
  { size: 18, top: '55%', left: '10%', anim: 'ph1-tri-c', dur: '17s', delay: '4.8s' , op: 0.15 },
  { size: 24, top: '48%', left: '58%', anim: 'ph1-tri-a', dur: '15s', delay: '1.8s' , op: 0.13 },
  { size: 36, top: '76%', left: '34%', anim: 'ph1-tri-b', dur: '18s', delay: '3.8s' , op: 0.11 },
  { size: 16, top: '68%', left: '74%', anim: 'ph1-tri-a', dur: '13s', delay: '6.2s' , op: 0.13 },
  { size: 26, top: '22%', left: '40%', anim: 'ph1-tri-c', dur: '15s', delay: '9s'   , op: 0.12 },
  { size: 12, top: '82%', left: '60%', anim: 'ph1-tri-b', dur: '16s', delay: '5.4s' , op: 0.16 },
  { size: 34, top: '18%', left: '86%', anim: 'ph1-tri-a', dur: '18s', delay: '0.6s' , op: 0.13 },
  { size: 20, top: '70%', left: '4%',  anim: 'ph1-tri-b', dur: '14s', delay: '10.6s', op: 0.14 },
  { size: 46, top: '90%', left: '78%', anim: 'ph1-tri-c', dur: '17s', delay: '3.2s' , op: 0.10 },
  { size: 22, top: '40%', left: '28%', anim: 'ph1-tri-a', dur: '13s', delay: '7.2s' , op: 0.12 },
  { size: 18, top: '60%', left: '90%', anim: 'ph1-tri-c', dur: '18s', delay: '12s'  , op: 0.13 },
]

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "What street did you grow up on?",
  "What is the name of your oldest sibling?",
  "What was the make of your first car?",
  "What is your favorite sports team?",
  "What was the name of your best friend growing up?",
]

export default function SignUp() {
  const navigate = useNavigate()
  const [step, setStep] = useState('account')
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [sq, setSq] = useState({ sq1: '', sa1: '', sq2: '', sa2: '', sq3: '', sa3: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setError('')
  }

  const goToQuestions = (e) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setStep('questions')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (new Set([sq.sq1, sq.sq2, sq.sq3]).size < 3) {
      setError('Please choose 3 different questions.')
      return
    }
    setLoading(true)
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName } },
    })

    if (signUpError) {
      setLoading(false)
      setError(signUpError.message)
      return
    }

    // Get a session to write security questions — sign in if not already provided
    let session = data.session
    if (!session) {
      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      session = signInData?.session
    }

    if (session) {
      await supabase.from('profiles').update({
        sq1: sq.sq1, sa1: sq.sa1.trim().toLowerCase(),
        sq2: sq.sq2, sa2: sq.sa2.trim().toLowerCase(),
        sq3: sq.sq3, sa3: sq.sa3.trim().toLowerCase(),
      }).eq('id', session.user.id)

      await supabase.auth.signOut()
    }

    setLoading(false)
    navigate('/signin')
  }

  const usedQuestions = (slot) =>
    [sq.sq1, sq.sq2, sq.sq3].filter((_, i) => ['sq1', 'sq2', 'sq3'][i] !== slot)

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col items-center justify-center px-12 relative overflow-hidden">

        {/* Animated background blobs */}
        <div
          className="absolute top-0 right-0 w-64 h-64 bg-[#ed6055] rounded-full -translate-y-1/2 translate-x-1/2"
          style={{ animation: 'ph1-blob 10s ease-in-out infinite', opacity: 0.08 }}
        />
        <div
          className="absolute bottom-0 left-0 w-96 h-96 bg-[#ed6055] rounded-full translate-y-1/2 -translate-x-1/2"
          style={{ animation: 'ph1-blob 13s ease-in-out infinite 4s', opacity: 0.08 }}
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

        {/* Logo + tagline — entrance */}
        <div style={{ animation: 'ph1-fade-up 0.7s ease-out 0.1s both' }}>
          <Logo size="lg" variant="light" />
          <p className="mt-6 text-white/50 text-sm text-center max-w-xs leading-relaxed">
            Join our platform to manage your<br />construction projects efficiently.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div
            className="flex justify-center mb-8 lg:hidden"
            style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}
          >
            <Logo size="md" variant="dark" />
          </div>

          {step === 'account' ? (
            <>
              <div style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}>
                <h2 className="text-3xl font-bold text-black mb-1">Create an account</h2>
                <p className="text-gray-500 text-sm mb-8">Step 1 of 2 — Account details</p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 bg-[#ed6055]/10 border border-[#ed6055]/30 rounded-lg text-[#ed6055] text-sm"
                  style={{ animation: 'ph1-fade-in 0.3s ease-out both' }}>
                  {error}
                </div>
              )}

              <div style={{ animation: 'ph1-fade-up 0.5s ease-out 0.1s both' }}>
                <form onSubmit={goToQuestions} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1.5" htmlFor="fullName">Full Name</label>
                    <input id="fullName" name="fullName" type="text" autoComplete="name" required
                      value={form.fullName} onChange={handleChange} placeholder="Juan dela Cruz"
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1.5" htmlFor="email">Email address</label>
                    <input id="email" name="email" type="email" autoComplete="email" required
                      value={form.email} onChange={handleChange} placeholder="you@company.com"
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1.5" htmlFor="password">Password</label>
                    <div className="relative">
                      <input id="password" name="password" type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" required value={form.password} onChange={handleChange}
                        placeholder="Min. 6 characters"
                        className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition" />
                      <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1.5" htmlFor="confirmPassword">Confirm Password</label>
                    <div className="relative">
                      <input id="confirmPassword" name="confirmPassword" type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password" required value={form.confirmPassword} onChange={handleChange}
                        placeholder="Re-enter your password"
                        className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition" />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                        {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <button type="submit"
                    className="w-full py-3 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white font-semibold text-sm transition mt-2 flex items-center justify-center gap-2">
                    Continue <ChevronRightIcon />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <div style={{ animation: 'ph1-fade-up 0.4s ease-out both' }}>
                <button onClick={() => { setStep('account'); setError('') }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition mb-6">
                  <ChevronLeftIcon /> Back
                </button>
                <h2 className="text-3xl font-bold text-black mb-1">Security questions</h2>
                <p className="text-gray-500 text-sm mb-8">Step 2 of 2 — Choose 3 questions and remember your answers.</p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 bg-[#ed6055]/10 border border-[#ed6055]/30 rounded-lg text-[#ed6055] text-sm"
                  style={{ animation: 'ph1-fade-in 0.3s ease-out both' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5" style={{ animation: 'ph1-fade-up 0.4s ease-out both' }}>
                {[
                  { qKey: 'sq1', aKey: 'sa1', n: 1 },
                  { qKey: 'sq2', aKey: 'sa2', n: 2 },
                  { qKey: 'sq3', aKey: 'sa3', n: 3 },
                ].map(({ qKey, aKey, n }) => (
                  <div key={qKey} className="space-y-2">
                    <label className="block text-sm font-medium text-black">Question {n}</label>
                    <select required value={sq[qKey]}
                      onChange={e => { setSq(s => ({ ...s, [qKey]: e.target.value })); setError('') }}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-black text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white transition">
                      <option value="">— Select a question —</option>
                      {SECURITY_QUESTIONS.map(q => (
                        <option key={q} value={q} disabled={usedQuestions(qKey).includes(q)}>{q}</option>
                      ))}
                    </select>
                    <input required type="text" value={sq[aKey]}
                      onChange={e => setSq(s => ({ ...s, [aKey]: e.target.value }))}
                      placeholder="Your answer" autoComplete="off"
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition" />
                  </div>
                ))}

                <p className="text-[11px] text-gray-400 italic">Answers are case-insensitive. Make sure you remember them — they'll be used to recover your account.</p>

                <button type="submit" disabled={loading || !sq.sq1 || !sq.sa1 || !sq.sq2 || !sq.sa2 || !sq.sq3 || !sq.sa3}
                  className="w-full py-3 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white font-semibold text-sm transition disabled:opacity-60 disabled:cursor-not-allowed mt-2">
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-gray-500" style={{ animation: 'ph1-fade-up 0.5s ease-out 0.2s both' }}>
            Already have an account?{' '}
            <Link to="/signin" className="text-[#ed6055] font-medium hover:underline">Sign in</Link>
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

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}
