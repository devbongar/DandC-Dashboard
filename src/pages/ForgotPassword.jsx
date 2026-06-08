import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  { size: 10, top: '85%', left: '55%', anim: 'ph1-tri-a', dur: '14s', delay: '5.6s',  op: 0.16 },
  { size: 30, top: '15%', left: '88%', anim: 'ph1-tri-c', dur: '18s', delay: '0.8s',  op: 0.13 },
  { size: 14, top: '72%', left: '6%',  anim: 'ph1-tri-a', dur: '13s', delay: '10.2s', op: 0.14 },
  { size: 50, top: '88%', left: '82%', anim: 'ph1-tri-b', dur: '17s', delay: '3s',    op: 0.10 },
]

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep]       = useState('email')
  const [email, setEmail]     = useState('')
  const [questions, setQuestions] = useState({ sq1: '', sq2: '', sq3: '' })
  const [answers, setAnswers] = useState({ a1: '', a2: '', a3: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

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

  const inputCls = 'w-full px-4 py-3 rounded-lg border border-gray-200 text-black placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent transition'

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

          {step === 'email' ? (
            <div style={{ animation: 'ph1-fade-up 0.5s ease-out both' }}>
              <h2 className="text-3xl font-bold text-black mb-1">Forgot password?</h2>
              <p className="text-gray-500 text-sm mb-8">Enter your email to find your account.</p>

              {error && (
                <div className="mb-4 px-4 py-3 bg-[#ed6055]/10 border border-[#ed6055]/30 rounded-lg text-[#ed6055] text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={findAccount} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-black mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="you@company.com"
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white font-semibold text-sm transition disabled:opacity-60"
                >
                  {loading ? 'Looking up…' : 'Continue'}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ animation: 'ph1-fade-up 0.4s ease-out both' }}>
              <button
                onClick={() => { setStep('email'); setError(''); setAnswers({ a1: '', a2: '', a3: '' }) }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition mb-6"
              >
                <BackIcon /> Back
              </button>
              <h2 className="text-3xl font-bold text-black mb-1">Security questions</h2>
              <p className="text-gray-500 text-sm mb-8">Answer all 3 questions to verify your identity.</p>

              {error && (
                <div className="mb-4 px-4 py-3 bg-[#ed6055]/10 border border-[#ed6055]/30 rounded-lg text-[#ed6055] text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={verifyAnswers} className="space-y-5">
                {[
                  { q: questions.sq1, key: 'a1', n: 1 },
                  { q: questions.sq2, key: 'a2', n: 2 },
                  { q: questions.sq3, key: 'a3', n: 3 },
                ].map(({ q, key, n }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-black mb-1.5">
                      <span className="text-[#ed6055] font-bold mr-1">{n}.</span> {q}
                    </label>
                    <input
                      type="text"
                      required
                      value={answers[key]}
                      onChange={e => { setAnswers(a => ({ ...a, [key]: e.target.value })); setError('') }}
                      placeholder="Your answer"
                      className={inputCls}
                      autoComplete="off"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={loading || !answers.a1 || !answers.a2 || !answers.a3}
                  className="w-full py-3 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white font-semibold text-sm transition disabled:opacity-60"
                >
                  {loading ? 'Verifying…' : 'Verify Answers'}
                </button>
              </form>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-gray-500" style={{ animation: 'ph1-fade-up 0.5s ease-out 0.2s both' }}>
            Remember your password?{' '}
            <Link to="/signin" className="text-[#ed6055] font-medium hover:underline">Sign in</Link>
          </p>

        </div>
      </div>
    </div>
  )
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}
