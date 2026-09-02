import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep]           = useState('email')
  const [email, setEmail]         = useState('')
  const [questions, setQuestions] = useState({ sq1: '', sq2: '', sq3: '' })
  const [answers, setAnswers]     = useState({ a1: '', a2: '', a3: '' })
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const findAccount = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error: rpcErr } = await supabase.rpc('get_security_questions', { p_email: email.trim() })
    setLoading(false)
    if (rpcErr || !data?.length || !data[0]?.sq1) {
      setError('No account found with this email, or security questions have not been set up.')
      return
    }
    setQuestions(data[0])
    setStep('questions')
  }

  const verifyAnswers = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: token, error: rpcErr } = await supabase.rpc('verify_security_answers', {
      p_email: email.trim(),
      p_a1:    answers.a1,
      p_a2:    answers.a2,
      p_a3:    answers.a3,
    })
    setLoading(false)
    if (rpcErr || !token) {
      setError('One or more answers are incorrect. Please try again.')
      return
    }
    navigate('/reset-password', { state: { token } })
  }

  const underlineInput = 'w-full bg-transparent text-white placeholder-white/40 text-base pb-3 focus:outline-none'
  const underlineStyle = { borderBottom: '1px solid rgba(255,255,255,0.25)' }

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
        <div className="absolute top-10 left-14">
          <Logo size="md" variant="light" />
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight mb-3">
            Remember Your<br />Password?
          </h1>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs">
            Go back and sign in to continue managing your projects.
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
          className="w-full max-w-xl rounded-2xl px-14 py-20"
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

          {step === 'email' ? (
            <>
              <h2 className="text-4xl font-bold text-white mb-10">Forgot Password?</h2>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl text-base text-[#f87171] border border-red-500/30 bg-red-500/10">
                  {error}
                </div>
              )}

              <form onSubmit={findAccount} className="space-y-9">
                <div className="relative">
                  <input
                    type="email" required value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="Email"
                    className={underlineInput}
                    style={underlineStyle}
                  />
                  <span className="absolute right-0 bottom-3 text-white/35 pointer-events-none">
                    <EmailIcon />
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <Link to="/signin" className="text-sm text-white/45 hover:text-white/70 transition-colors">
                    Back to Sign In
                  </Link>
                  <button
                    type="submit" disabled={loading}
                    className="flex items-center gap-2 px-7 py-3 rounded-full border border-white/40 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                  >
                    {loading && (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {loading ? 'Looking up…' : 'Continue'} &nbsp;&rsaquo;
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('email'); setError(''); setAnswers({ a1: '', a2: '', a3: '' }) }}
                className="flex items-center gap-1.5 text-sm text-white/45 hover:text-white/70 transition mb-6"
              >
                <BackIcon /> Back
              </button>

              <h2 className="text-4xl font-bold text-white mb-3">Security Questions</h2>
              <p className="text-white/45 text-sm mb-10">Answer all 3 questions to verify your identity.</p>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl text-base text-[#f87171] border border-red-500/30 bg-red-500/10">
                  {error}
                </div>
              )}

              <form onSubmit={verifyAnswers} className="space-y-9">
                {[
                  { q: questions.sq1, key: 'a1', n: 1 },
                  { q: questions.sq2, key: 'a2', n: 2 },
                  { q: questions.sq3, key: 'a3', n: 3 },
                ].map(({ q, key, n }) => (
                  <div key={key}>
                    <p className="text-white/55 text-sm mb-2">
                      <span className="text-white/80 font-semibold mr-1">{n}.</span>{q}
                    </p>
                    <input
                      type="text" required value={answers[key]}
                      onChange={e => { setAnswers(a => ({ ...a, [key]: e.target.value })); setError('') }}
                      placeholder="Your answer"
                      className={underlineInput}
                      style={underlineStyle}
                      autoComplete="off"
                    />
                  </div>
                ))}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={loading || !answers.a1 || !answers.a2 || !answers.a3}
                    className="flex items-center gap-2 px-7 py-3 rounded-full border border-white/40 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                  >
                    {loading && (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {loading ? 'Verifying…' : 'Verify Answers'} &nbsp;&rsaquo;
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="mt-8 text-sm text-white/35 hidden lg:block">
            Remember your password?{' '}
            <Link to="/signin" className="text-white/65 hover:text-white transition-colors font-medium">
              Sign In
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

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}
