import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]

const PHASE_COLORS = {
  initiation:           '#94a3b8',
  planning:             '#3b82f6',
  execution_monitoring: '#ed6055',
  closeout:             '#22c55e',
}

const PAD    = 7 * 86400000
const LABEL_W = 160

// Parse "YYYY-MM-DD" as local midnight to avoid UTC-vs-local timezone shift
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function GanttBar({ start, end, color, minDate, totalMs }) {
  if (!start || !end) return null
  const s = parseDate(start)
  const e = parseDate(end)
  const left  = ((s - minDate) / totalMs) * 100
  const width = ((e - s)      / totalMs) * 100
  if (width <= 0) return null
  return (
    <div
      className="absolute rounded-sm"
      style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: color, top: '50%', transform: 'translateY(-50%)', height: 10 }}
      title={`${start} → ${end}`}
    />
  )
}

function MilestoneRow({ m, minDate, totalMs, gridDates, todayLeft, showToday, isChild = false }) {
  const hasDates = [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end].some(Boolean)

  return (
    <div className={`flex items-center mb-1.5 gap-2 ${isChild ? 'opacity-90' : ''}`}>
      {/* Fixed-width label column */}
      <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex items-center pr-2">
        {isChild && <span className="text-gray-400 mr-1 flex-shrink-0 text-[10px]">└</span>}
        <p className={`text-[10px] truncate leading-tight ${isChild ? 'text-gray-500 font-medium pl-1' : 'font-bold text-gray-600'}`}>{m.milestone_name}</p>
      </div>

      {/* Bar area */}
      <div className="flex-1 min-w-0">
        {!hasDates ? (
          <div className="px-3 py-2 rounded-lg bg-gray-50 text-[10px] text-gray-400 italic">No dates set</div>
        ) : (
          <div className="relative rounded-lg bg-gray-50 overflow-hidden" style={{ height: 48 }}>
            {/* Grid lines */}
            {gridDates.map((mo, j) => (
              <div key={j} className="absolute top-0 bottom-0 w-px bg-gray-200"
                style={{ left: `${((mo - minDate) / totalMs) * 100}%` }} />
            ))}

            {/* Today line */}
            {showToday && (
              <div className="absolute top-0 bottom-0 z-10"
                style={{ left: `${todayLeft}%`, width: 1.5, background: '#ed6055', opacity: 0.8 }} />
            )}

            {/* Row 1: Planned */}
            <div className="absolute inset-x-0" style={{ top: 8, height: 14 }}>
              <div className="relative h-full">
                <GanttBar start={m.planned_start} end={m.planned_end} color="#94a3b8" minDate={minDate} totalMs={totalMs} />
              </div>
            </div>

            {/* Row 2: Projected (behind) then Actual (on top) */}
            <div className="absolute inset-x-0" style={{ top: 27, height: 14 }}>
              <div className="relative h-full">
                <GanttBar start={m.projected_start} end={m.projected_end} color="#22c55e" minDate={minDate} totalMs={totalMs} />
                <GanttBar start={m.actual_start}     end={m.actual_end}     color="#ef4444" minDate={minDate} totalMs={totalMs} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TIME_SCALES = [
  { key: 'day',   label: 'Day' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
]

function buildTicks(minDate, maxDate, timeScale) {
  const ticks = []
  if (timeScale === 'day') {
    const cur = new Date(minDate); cur.setHours(0,0,0,0)
    while (cur <= maxDate) { ticks.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  } else if (timeScale === 'week') {
    // align to nearest Monday on or before minDate
    const cur = new Date(minDate); cur.setHours(0,0,0,0)
    const dow = cur.getDay()
    cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1))
    while (cur <= maxDate) { if (cur >= minDate) ticks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  } else {
    // month: every 7 days starting from 1st of first month
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (cur <= maxDate) { if (cur >= minDate) ticks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  }
  return ticks
}

function tickLabel(d, timeScale) {
  if (timeScale === 'day')  return d.getDate()
  if (timeScale === 'week') return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  return d.getDate()
}

function GanttChart({ milestones, overrideMin, overrideMax, timeScale = 'month' }) {
  const allDates = milestones
    .flatMap(m => [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end])
    .filter(Boolean)
    .map(d => parseDate(d).getTime())

  if (allDates.length === 0) {
    return <div className="text-center py-12 text-sm text-gray-400 italic">No dates set on any milestone.</div>
  }

  // Snap to local day boundaries so bar positions and tick positions use the same reference
  const rawMin = new Date(Math.min(...allDates) - PAD)
  const rawMax = new Date(Math.max(...allDates) + PAD)
  const minDate = overrideMin ?? new Date(rawMin.getFullYear(), rawMin.getMonth(), rawMin.getDate())
  const maxDate = overrideMax ?? new Date(rawMax.getFullYear(), rawMax.getMonth(), rawMax.getDate() + 1)
  const totalMs = maxDate - minDate

  const months = []
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (cur <= maxDate) {
    months.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
  }

  const today     = new Date()
  const todayLeft = ((today - minDate) / totalMs) * 100
  const showToday = todayLeft >= 0 && todayLeft <= 100

  const ticks = buildTicks(minDate, maxDate, timeScale)

  // For day scale with many days, skip labels to avoid overlap
  const tickStep = timeScale === 'day' && ticks.length > 60 ? Math.ceil(ticks.length / 60) : 1

  // Grid lines drawn inside each bar row — match axis ticks for day/week, month boundaries for month
  const gridDates = timeScale === 'month'
    ? months
    : ticks.filter((_, i) => i % tickStep === 0)

  return (
    <div style={{ minWidth: LABEL_W + 480 }}>
      {/* Axis header */}
      <div className="flex gap-2">
        <div style={{ width: LABEL_W, minWidth: LABEL_W }} />
        <div className="flex-1 min-w-0 overflow-hidden">

          {/* Row 1 — month labels */}
          <div className="relative" style={{ height: 22 }}>
            {months.map((mo, i) => {
              const left = ((mo - minDate) / totalMs) * 100
              return (
                <div key={i} className="absolute flex flex-col items-start" style={{ left: `${left}%` }}>
                  <div className="w-px h-2 bg-gray-300" />
                  <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap ml-1">
                    {mo.getMonth() === 0
                      ? mo.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
                      : mo.toLocaleDateString('en-PH', { month: 'short' })}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Row 2 — scale ticks + today label */}
          <div className="relative mb-1" style={{ height: 16 }}>
            {ticks.map((d, i) => {
              const left = ((d - minDate) / totalMs) * 100
              if (left < 0 || left > 100) return null
              const showLabel = i % tickStep === 0
              return (
                <div key={i} className="absolute flex flex-col items-center" style={{ left: `${left}%`, transform: 'translateX(-50%)' }}>
                  <div className="w-px h-1 bg-gray-200" />
                  {showLabel && (
                    <span className={`leading-none ${timeScale === 'week' ? 'text-[8px] text-gray-400 whitespace-nowrap' : 'text-[8px] text-gray-300'}`}>
                      {tickLabel(d, timeScale)}
                    </span>
                  )}
                </div>
              )
            })}
            {showToday && (
              <div className="absolute flex flex-col items-center" style={{ left: `${todayLeft}%`, transform: 'translateX(-50%)' }}>
                <span className="text-[9px] font-bold text-[#ed6055] whitespace-nowrap">today</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Axis divider */}
      <div className="border-b border-gray-200" />

      {/* Milestone rows — parents first, then their children */}
      {(() => {
        const parents  = milestones.filter(m => !m.parent_id)
        const rows = []
        parents.forEach(parent => {
          rows.push({ m: parent, isChild: false })
          milestones.filter(m => m.parent_id === parent.id)
            .forEach(child => rows.push({ m: child, isChild: true }))
        })
        return rows.map(({ m, isChild }) => (
          <MilestoneRow
            key={m.id}
            m={m}
            minDate={minDate}
            totalMs={totalMs}
            gridDates={gridDates}
            todayLeft={todayLeft}
            showToday={showToday}
            isChild={isChild}
          />
        ))
      })()}
    </div>
  )
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const THIS_YEAR   = new Date().getFullYear()
const YEARS       = Array.from({ length: 11 }, (_, i) => THIS_YEAR - 3 + i)

function MonthYearPicker({ value, onChange, min, max }) {
  const [selMonth, setSelMonth] = useState('')
  const [selYear,  setSelYear]  = useState('')

  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-')
      setSelYear(y)
      setSelMonth(m)
    } else {
      setSelYear(''); setSelMonth('')
    }
  }, [value])

  const handleChange = (month, year) => {
    if (month && year) onChange(`${year}-${month}`)
    else onChange('')
  }

  const selectCls = 'px-2 py-1 text-xs rounded-lg border border-gray-200 text-black focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white'

  return (
    <div className="flex items-center gap-1">
      <select
        value={selMonth}
        onChange={e => { setSelMonth(e.target.value); handleChange(e.target.value, selYear) }}
        className={selectCls}
      >
        <option value="">(Month)</option>
        {MONTH_NAMES.map((name, i) => {
          const m = String(i + 1).padStart(2, '0')
          const ym = selYear ? `${selYear}-${m}` : null
          const disabled = (min && ym && ym < min) || (max && ym && ym > max)
          return <option key={m} value={m} disabled={!!disabled}>{name}</option>
        })}
      </select>
      <select
        value={selYear}
        onChange={e => { setSelYear(e.target.value); handleChange(selMonth, e.target.value) }}
        className={selectCls}
      >
        <option value="">(Year)</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}

export default function GanttModal({ project, onClose }) {
  const [baselines, setBaselines]     = useState([])
  const [activeBL, setActiveBL]       = useState(null)
  const [milestones, setMilestones]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [activePhase, setActivePhase] = useState('initiation')
  const [fromMonth, setFromMonth]     = useState('')
  const [toMonth, setToMonth]         = useState('')
  const [timeScale, setTimeScale]     = useState('month')

  useEffect(() => {
    const loadBaselines = async () => {
      const { data } = await supabase
        .from('milestone_baselines')
        .select('id, label, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })
      const bls = data ?? []
      setBaselines(bls)
      setActiveBL(bls.length > 0 ? bls[bls.length - 1].id : null)
    }
    loadBaselines()
  }, [project.id])

  useEffect(() => {
    if (!activeBL) { setMilestones([]); setLoading(false); return }
    const loadMilestones = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', project.id)
        .eq('baseline_id', activeBL)
        .order('sort_order')
      setMilestones(data ?? [])
      setLoading(false)
    }
    loadMilestones()
  }, [project.id, activeBL])

  const phaseColor      = PHASE_COLORS[project.phase] ?? '#ed6055'
  const phaseMilestones = milestones.filter(m => m.phase === activePhase)

  const overrideMin = fromMonth ? (() => { const [y, m] = fromMonth.split('-').map(Number); return new Date(y, m - 1, 1) })() : null
  const overrideMax = toMonth   ? (() => { const [y, m] = toMonth.split('-').map(Number);   return new Date(y, m, 0) })()    : null
  const hasFilter = fromMonth || toMonth

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div
        className="relative bg-white flex flex-col overflow-hidden rounded-xl w-3/4 h-3/4"
        style={{ borderTop: `4px solid ${phaseColor}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-black leading-tight">{project.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Milestone Gantt Chart</p>
          </div>
          <div className="flex items-center gap-5 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-2.5 rounded-sm inline-block bg-slate-400" />Planned
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-2.5 rounded-sm inline-block bg-red-500" />Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-2.5 rounded-sm inline-block bg-green-500" />Projected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-0.5 h-3.5 bg-[#ed6055] rounded-full" />Today
              </span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-black transition">
              <XIcon />
            </button>
          </div>
        </div>

        {/* Phase tabs */}
        <div className="px-6 pt-3 pb-0 flex gap-1 border-b border-gray-100 flex-shrink-0">
          {PHASES.map(p => {
            const count  = milestones.filter(m => m.phase === p.key).length
            const active = activePhase === p.key
            return (
              <button
                key={p.key}
                onClick={() => setActivePhase(p.key)}
                className={`px-3 py-2 text-xs font-semibold transition flex items-center gap-1.5 border-b-2 -mb-px ${
                  active
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {p.label}
                <span className={`text-[10px] font-bold ${active ? 'text-gray-400' : 'text-gray-300'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Month range filter */}
        <div className="px-8 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-4 flex-shrink-0 flex-wrap">
          {baselines.length > 0 && (
            <select
              value={activeBL ?? ''}
              onChange={e => setActiveBL(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] font-semibold"
            >
              {baselines.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          )}
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">Date Range</span>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
            {TIME_SCALES.map(s => (
              <button
                key={s.key}
                onClick={() => setTimeScale(s.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  timeScale === s.key
                    ? 'bg-black text-white'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-gray-500 flex-shrink-0">From</label>
            <MonthYearPicker value={fromMonth} onChange={setFromMonth} max={toMonth} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-gray-500 flex-shrink-0">To</label>
            <MonthYearPicker value={toMonth} onChange={setToMonth} min={fromMonth} />
          </div>
          {hasFilter && (
            <button
              onClick={() => { setFromMonth(''); setToMonth('') }}
              className="text-xs text-gray-400 hover:text-[#ed6055] transition font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>
          ) : activeBL === null ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 italic">
              No milestone data yet. Import milestones from the project detail view.
            </div>
          ) : phaseMilestones.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 italic">
              No milestones for {PHASES.find(p => p.key === activePhase)?.label}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <GanttChart milestones={phaseMilestones} overrideMin={overrideMin} overrideMax={overrideMax} timeScale={timeScale} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

