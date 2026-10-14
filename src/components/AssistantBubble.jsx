import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import useProfile from '../hooks/useProfile'
import { supabase } from '../lib/supabaseClient'
// DECO is a 3D-rendered character, so it ships as artwork rather than vector
// animation. INTERIM: this is cropped from the character sheet -- replace with
// a proper transparent export before release.
import decoAvatar from '../assets/deco-avatar.png'
import decoGreeting from '../assets/deco-greeting.png'
import decoThinking from '../assets/deco-thinking.png'

// Floating assistant. The panel is portalled to the body so the transformed
// ancestors around the project pages cannot break its fixed positioning.
//
// NOTE: the answers below are canned so the panel can be reviewed before an
// Anthropic API key exists. They use real figures pulled from the database on
// 2026-10-08 so the layout is judged against realistic content. Replacing
// `answerFor` with a call to /api/assistant is the only change needed.

// -- DECO's voice -------------------------------------------------------------
const TAGLINE     = 'Your D&C buddy, from design to delivery.'
const ATTRIBUTION = 'PH1 World Developers · Design & Construction AI Assistant'
const WELCOME =
  "Hi! I'm DECO, your D&C project buddy at PH1! 👋 I can help you track project " +
  'progress, check deadlines, find project information, and coordinate your daily ' +
  'tasks. What are we working on today?'

const SUGGESTIONS = [
  'Which projects are delayed?',
  'Overdue permits',
  'Open issues for D&C Head',
  'Quality findings summary',
  'Unit completion status',
  'Latest photos for Jab',
]

// Photo answers show the real thumbnails the Photos tab serves, so the panel is
// judged against actual site photography rather than grey boxes.
const thumbUrl = (path) =>
  supabase.storage.from('project-photos').getPublicUrl(`thumbs/${path}`).data.publicUrl

// Same transform the Photos tab lightbox uses: contained inside a 1600 box so
// the photo keeps its aspect ratio, instead of the stored original which runs
// to several MB.
const previewUrl = (path) =>
  supabase.storage.from('project-photos').getPublicUrl(path, {
    transform: { width: 1600, height: 1600, resize: 'contain', quality: 75 },
  }).data.publicUrl

const originalUrl = (path) =>
  supabase.storage.from('project-photos').getPublicUrl(path).data.publicUrl

const CANNED = [
  {
    match: /\b(delay(ed|s)?|late|behind|s-?curve|poc|progress)\b/i,
    reply: {
      text: '**6 of 8 projects are behind plan.** One Lancaster Park T1 & T2 is furthest back, 24.9 points under its baseline.',
      table: {
        columns: ['Project', 'POC', 'Plan', 'Var'],
        align: ['left', 'right', 'right', 'right'],
        rows: [
          ['One Lancaster Park T1 & T2', '75.1%', '100%', '-24.9'],
          ['Modan Lofts T1 & Parking', '78.2%', '91.5%', '-13.3'],
          ['4PH Avesta', '19.8%', '26.0%', '-6.2'],
          ['4PH Jenara', '6.1%', '9.6%', '-3.4'],
          ['Southscapes Trece Martires', '24.7%', '27.0%', '-2.3'],
          ['Northscapes SJDM', '99.6%', '100%', '-0.4'],
        ],
      },
      note: 'Counted as: cumulative actual POC against the latest baseline’s planned POC, at each project’s last reported period (Sep 2026). My Enso (+0.1) and Jab (+5.2) are on or ahead of plan.',
    },
  },
  {
    match: /\bpermits?\b/i,
    reply: {
      text: '**14 projects have overdue permits.** Lykke Kondo is the worst at 973 days.',
      table: {
        columns: ['Project', 'Overdue', 'Worst'],
        align: ['left', 'right', 'right'],
        rows: [
          ['Lykke Kondo', '3', '973d'],
          ['One Lancaster Park T3', '4', '412d'],
          ['One Lancaster Park T4', '3', '412d'],
          ['Montescapes SJDM', '2', '354d'],
          ['4PH Avesta', '4', '106d'],
        ],
        more: '9 more',
      },
      note: 'Counted as: planned finish passed, no actual finish recorded.',
    },
  },
  {
    match: /\b(issues?|d&c|head|concerns?)\b/i,
    reply: {
      text: '**8 open issues for D&C Head.** Three are My Enso Lofts waiting on MCC — one supplier blocking one project three ways.',
      table: {
        columns: ['Project', 'Group', 'Issue'],
        align: ['left', 'left', 'left'],
        rows: [
          ['Montescapes SJDM', 'Compliance', 'Fencing stopped by adjacent lot owner'],
          ['Southscapes Trece', 'Compliance', 'Meralco and telco poles need relocation'],
          ['4PH Jenara', 'Compliance', 'ISF relocation — 13 families'],
          ['4PH Jab', 'Construction', 'Permanent power and water for handover'],
          ['My Enso Lofts', 'Construction', 'FCD for landscaping — awaiting MCC'],
        ],
        more: '3 more',
      },
    },
  },
  {
    match: /\b(quality|findings?|ncr|defects?|workmanship)\b/i,
    reply: {
      text: '**51 quality findings, 50 still open.** Only one has ever been marked closed. Workmanship is the root cause on 41 of 51 (80%).',
      table: {
        columns: ['Project', 'Total', 'Open', '>14d'],
        align: ['left', 'right', 'right', 'right'],
        rows: [
          ['4PH Jenara', '22', '21', '0'],
          ['4PH Avesta', '12', '12', '0'],
          ['4PH Jab', '7', '7', '0'],
          ['Modan Lofts', '6', '6', '6'],
          ['My Enso Lofts', '3', '3', '3'],
        ],
        more: '1 more',
      },
      note: 'The nine findings open past 14 days are all Modan Lofts and My Enso. Oldest is 638 days.',
    },
  },
  {
    match: /\b(units?|completion|m4|m5|handover|turnover)\b/i,
    reply: {
      text: '**No units have reached M4 or M5 yet.** 723 units are in progress across 3 projects; no M4 or M5 dates are recorded anywhere.',
      table: {
        columns: ['Project', 'Units', 'In progress', 'M4'],
        align: ['left', 'right', 'right', 'right'],
        rows: [
          ['Modan Lofts', '345', '345', '0'],
          ['One Lancaster T1 & T2', '384', '192', '0'],
          ['My Enso Lofts', '1,204', '186', '0'],
        ],
      },
      note: 'Counted as: M4 date recorded and not in the future. No project has one.',
    },
  },
  {
    match: /\b(photos?|pictures?|images?|drone)\b/i,
    live: 'photos',   // answered from the database, for whichever project is named
  },
]

// -- Photos: answered live, not canned -------------------------------------
// The browser's Supabase client is already scoped by RLS, so this is a preview
// of exactly what the latest_photos tool will do server-side.

const normalize = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Words that appear in most project names and so identify nothing
const GENERIC = new Set(['4ph', 'residences', 'residence', 'lofts', 'loft', 'the', 'and', 'project', 'projects', 'photo', 'photos'])

// Score each project by how many of its distinctive words the question uses,
// so "One Lancaster T3" beats "One Lancaster Park T1 & T2" on the T3 token.
function resolveProject(question, projects) {
  const q = ' ' + normalize(question).replace(/[^a-z0-9]+/g, ' ') + ' '
  let best = null
  for (const p of projects) {
    const words = normalize(p.name).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 1 && !GENERIC.has(w))
    let score = words.filter(w => q.includes(` ${w} `)).length
    if (p.project_code && q.includes(` ${normalize(p.project_code)} `)) score += 2
    if (score > 0 && (!best || score > best.score || (score === best.score && p.name.length > best.p.name.length))) best = { p, score }
  }
  return best?.p ?? null
}

async function photoAnswer(question) {
  const { data: projects } = await supabase.from('projects').select('id, name, project_code').order('name')
  if (!projects?.length) return { text: 'I could not read the project list.' }

  const project = resolveProject(question, projects)
  if (!project) {
    return { text: `**Which project?** Ask again naming one — for example "latest photos for ${projects[0].name}".` }
  }

  const [{ data: rows }, { count }] = await Promise.all([
    supabase.from('project_photos')
      .select('storage_path, photo_date, tags, project_buildings(name)')
      .eq('project_id', project.id)
      .order('photo_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('project_photos').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
  ])

  if (!rows?.length) return { text: `**No photos yet for ${project.name}.**` }

  const day = rows[0].photo_date
  const onDay = rows.filter(r => r.photo_date === day)
  const tally = {}
  for (const r of onDay) for (const t of (r.tags ?? [])) tally[t] = (tally[t] ?? 0) + 1
  const breakdown = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ')

  return {
    text: `**${onDay.length} photo${onDay.length === 1 ? '' : 's'} for ${project.name} on ${fmtDay(day)}**${breakdown ? ` — ${breakdown}.` : '.'}`,
    photos: onDay.map(r => ({
      path: r.storage_path,
      caption: r.project_buildings?.name ?? (r.tags ?? [])[0] ?? 'Site',
    })),
    note: `Most recent upload day. ${count ?? rows.length} photos on this project in total.`,
  }
}

const fmtDay = (d) => {
  const dt = new Date(d + 'T00:00:00')
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

const answerFor = async (q) => {
  const hit = CANNED.find(c => c.match.test(q))
  if (hit?.live === 'photos') return photoAnswer(q)
  return hit?.reply ?? {
    text: "I can answer questions about permits, issues, quality findings and photos across your projects. Try one of the suggestions above.",
  }
}

// Minimal bold renderer -- the real answers will come back as markdown
const renderText = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>)

// Three photos to begin with, the rest behind a button -- a long answer should
// not push the composer off screen before it has been read.
const PHOTO_PREVIEW_COUNT = 3

function PhotoStrip({ photos, onOpen }) {
  const [expanded, setExpanded] = useState(false)
  const usable = photos.filter(p => p?.path)
  if (!usable.length) return null
  const shown = expanded ? usable : usable.slice(0, PHOTO_PREVIEW_COUNT)
  const hidden = usable.length - shown.length

  return (
    <div className="mt-2.5">
      <div className={expanded ? 'grid grid-cols-3 gap-1.5' : 'flex gap-1.5'}>
        {shown.map((p, i) => (
          <button
            key={p.path}
            type="button"
            onClick={() => onOpen(usable, i)}
            aria-label={`Open ${p.caption ?? 'photo'}`}
            className="flex-1 min-w-0 group"
          >
            <img
              src={thumbUrl(p.path)}
              alt={p.caption ?? ''}
              loading="lazy"
              onError={e => { e.currentTarget.style.visibility = 'hidden' }}
              className="w-full aspect-[4/3] object-cover rounded-lg border border-gray-200 bg-gray-100 cursor-zoom-in transition group-hover:brightness-95 group-hover:border-[#ed6055]"
            />
            <p className="text-[10px] text-gray-400 mt-1 text-center truncate">{p.caption}</p>
          </button>
        ))}
      </div>

      {(hidden > 0 || expanded) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 w-full text-[11px] font-semibold text-gray-500 hover:text-[#ed6055] border border-gray-200 hover:border-[#ed6055] rounded-lg py-1.5 transition-colors"
        >
          {expanded ? 'Show fewer' : `Show all ${usable.length} photos`}
        </button>
      )}
    </div>
  )
}

function AnswerTable({ table }) {
  return (
    <div className="mt-2.5 -mx-1 overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {table.columns.map((c, i) => (
              <th key={c} className={`py-1.5 px-1.5 font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap ${table.align[i] === 'right' ? 'text-right' : 'text-left'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-b border-gray-100 last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={`py-1.5 px-1.5 text-gray-700 ${table.align[i] === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.more && <p className="px-1.5 pt-1.5 text-[11px] text-gray-400">… {table.more}</p>}
    </div>
  )
}

// The transcript is kept in the browser, which costs nothing: no API call, no
// row written. Sending earlier turns back to the model is what would cost, and
// that is a separate decision made server-side when the real route lands.
// Per-device and per-browser by design -- it never leaves this machine.
// Bump this whenever a stored message's shape changes -- a saved transcript
// written against the old shape would otherwise render broken. v2: photo
// answers hold {path, caption} objects, not plain caption strings.
const STORE_KEY = 'assistant-chat-v2'
const MAX_KEPT  = 40

const loadChat = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }   // private window, blocked storage, bad JSON
}

const saveChat = (messages) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_KEPT))) } catch { /* not worth failing over */ }
}

export default function AssistantBubble() {
  const { profile } = useProfile()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(loadChat)
  const [thinking, setThinking] = useState(false)
  const [preview, setPreview] = useState(null)   // { photos, i }
  const [showSuggestions, setShowSuggestions] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  // On open: a fresh panel starts at the top so the greeting is read, an
  // existing conversation starts at the latest message. Positioned instantly --
  // animating a scroll the moment the panel appears looks like a glitch -- and
  // after a frame, so the artwork has laid out and scrollHeight is final.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = messages.length === 0 ? 0 : el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only: this
    // positions on open, the effect below follows new messages
  }, [open])

  // While open: follow new answers down. Scrolling the container rather than
  // scrollIntoView keeps the page behind the panel still.
  useEffect(() => {
    const el = listRef.current
    if (!open || !el || messages.length === 0) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking, open, showSuggestions])

  useEffect(() => { saveChat(messages) }, [messages])

  // Escape closes the photo preview first, the panel only once it is gone.
  // Arrows step through the photos in the answer being previewed.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { preview ? setPreview(null) : setOpen(false); return }
      if (!preview) return
      if (e.key === 'ArrowRight') setPreview(p => ({ ...p, i: (p.i + 1) % p.photos.length }))
      if (e.key === 'ArrowLeft') setPreview(p => ({ ...p, i: (p.i - 1 + p.photos.length) % p.photos.length }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, preview])

  // Every hook must sit above this line: the early return below is conditional,
  // so a hook after it is skipped on the renders that bail out.
  // Signed out, or on an auth screen -- nothing to ask about
  const authScreen = ['/signin', '/signup', '/forgot-password', '/reset-password'].includes(location.pathname)
  if (!profile || authScreen) return null

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || thinking) return
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    setThinking(true)
    try {
      // Canned answers resolve instantly, so hold the thinking state briefly --
      // an answer that appears with no pause reads as a canned answer, which
      // most of these still are.
      const [reply] = await Promise.all([
        answerFor(q),
        new Promise(r => setTimeout(r, 650)),
      ])
      setMessages(prev => [...prev, { role: 'assistant', ...reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Something went wrong reading that: ${err.message}` }])
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  return (
    <>
      {/* Launcher -- sits above the floating mobile nav pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open DECO"
          title="Ask DECO"
          className="fixed z-40 bottom-24 right-4 sm:bottom-6 sm:right-6 w-16 h-16 rounded-full overflow-hidden shadow-lg shadow-black/25 ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all deco-float"
        >
          <img src={decoAvatar} alt="" className="w-full h-full object-cover" />
        </button>
      )}

      {open && createPortal(
        <>
          {/* Backdrop: mobile only, so the desktop page stays usable behind the panel */}
          <div className="fixed inset-0 z-[9989] bg-black/30 sm:hidden" onClick={() => setOpen(false)} />

          <div className="fixed z-[9990] inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px] h-[78vh] sm:h-[600px] sm:max-h-[calc(100vh-3rem)] bg-white rounded-t-3xl sm:rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden assistant-pop">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden ring-1 ring-black/5">
                <img src={decoAvatar} alt="" className="w-full h-full object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 leading-tight">DECO</p>
                <p className="text-[11px] text-gray-400 leading-tight truncate">
                  {thinking ? 'Checking your data…' : TAGLINE}
                </p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setThinking(false) }}
                  title="Start a new chat"
                  aria-label="Start a new chat"
                  className="w-8 h-8 rounded-full text-gray-400 hover:text-[#ed6055] hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Conversation */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div>
                  {/* DECO waves hello, then opens the conversation */}
                  <img
                    src={decoGreeting}
                    alt=""
                    className="w-[132px] h-auto mx-auto -mt-1 mb-1 deco-float select-none pointer-events-none"
                  />
                  <p className="text-[13px] text-gray-700 leading-relaxed bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2.5 mb-4">
                    {WELCOME}
                  </p>

                  <p className="text-[11px] text-gray-400 mb-2">Ask in your own words — these are just examples.</p>
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-[12px] text-gray-600 px-3 py-2 rounded-xl border border-gray-200 hover:border-[#ed6055] hover:text-[#ed6055] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-gray-300 mt-4">{ATTRIBUTION}</p>
                </div>
              )}

              {messages.map((m, i) => m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] text-[13px] bg-[#ed6055] text-white rounded-2xl rounded-br-sm px-3 py-2">{m.text}</p>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[92%] text-[13px] text-gray-700 bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5">
                    <p className="leading-relaxed">{renderText(m.text)}</p>
                    {m.table && <AnswerTable table={m.table} />}
                    {/* Tolerates a transcript saved before photos carried a path */}
                    {m.photos?.some(p => p?.path) && (
                      <PhotoStrip photos={m.photos} onOpen={(photos, i) => setPreview({ photos, i })} />
                    )}
                    {m.note && <p className="mt-2 text-[11px] text-gray-400 italic">{m.note}</p>}
                  </div>
                </div>
              ))}

              {/* The suggestions only exist in the empty state, so offer a way
                  back to them once a conversation has started. */}
              {messages.length > 0 && !thinking && (
                showSuggestions ? (
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Suggested questions</p>
                      <button onClick={() => setShowSuggestions(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Hide</button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => { setShowSuggestions(false); send(s) }}
                          className="text-left text-[12px] text-gray-600 px-3 py-2 rounded-xl border border-gray-200 hover:border-[#ed6055] hover:text-[#ed6055] transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSuggestions(true)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-[#ed6055] border border-gray-200 hover:border-[#ed6055] rounded-full px-3 py-1.5 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                    Suggested questions
                  </button>
                )
              )}

              {thinking && (
                <div className="flex justify-start items-end gap-1.5">
                  <img src={decoThinking} alt="" className="w-11 h-auto select-none pointer-events-none" />
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-3 flex gap-1 mb-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 assistant-dot" style={{ animationDelay: `${i * 140}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-100 p-3 flex items-end gap-2 flex-shrink-0">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask about permits, issues, photos…"
                className="flex-1 min-w-0 resize-none max-h-24 px-3 py-2 text-base sm:text-[13px] rounded-xl bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 transition"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                aria-label="Send"
                className="w-9 h-9 rounded-xl bg-[#ed6055] text-white flex items-center justify-center flex-shrink-0 hover:bg-[#d94f45] disabled:opacity-40 disabled:hover:bg-[#ed6055] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Photo preview, above the panel */}
          {preview && (() => {
            const p = preview.photos[preview.i]
            const step = (d) => (e) => {
              e.stopPropagation()
              setPreview(v => ({ ...v, i: (v.i + d + v.photos.length) % v.photos.length }))
            }
            return (
              <div
                className="fixed inset-0 z-[9995] bg-black/90 flex items-center justify-center cursor-zoom-out"
                onClick={() => setPreview(null)}
              >
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Close photo"
                  className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 flex items-center justify-center transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {preview.photos.length > 1 && ['prev', 'next'].map(dir => (
                  <button
                    key={dir}
                    onClick={step(dir === 'next' ? 1 : -1)}
                    aria-label={dir === 'next' ? 'Next photo' : 'Previous photo'}
                    className={`absolute ${dir === 'next' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 flex items-center justify-center transition`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'next' ? 'M8.25 4.5l7.5 7.5-7.5 7.5' : 'M15.75 19.5L8.25 12l7.5-7.5'} />
                    </svg>
                  </button>
                ))}

                <img
                  key={p.path}
                  src={previewUrl(p.path)}
                  alt={p.caption ?? ''}
                  // The transformer refuses sources over ~25MB or ~50MP
                  onError={e => { e.currentTarget.src = originalUrl(p.path) }}
                  onClick={e => e.stopPropagation()}
                  className="max-w-[92vw] max-h-[82vh] object-contain rounded-xl shadow-2xl"
                />
                {p.caption && (
                  <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1">
                    {p.caption}
                    {preview.photos.length > 1 && <span className="text-white/40"> · {preview.i + 1}/{preview.photos.length}</span>}
                  </p>
                )}
              </div>
            )
          })()}
        </>,
        document.body,
      )}
    </>
  )
}

