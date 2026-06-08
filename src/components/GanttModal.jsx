import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import TriangleLoader from './TriangleLoader'

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

const PAD     = 7 * 86400000
const LABEL_W = 320
const DEFAULT_COL_PX = { day: 20, week: 20, month: 20 }

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function GanttBar({ start, end, color, toPx }) {
  if (!start || !end) return null
  const s    = parseDate(start)
  const e    = parseDate(end)
  const left = toPx(s)
  const w    = toPx(e) - left
  if (w <= 0) return null
  return (
    <div
      className="absolute rounded"
      style={{ left, width: Math.max(w, 2), backgroundColor: color, top: '50%', transform: 'translateY(-50%)', height: 18 }}
      title={`${start} → ${end}`}
    />
  )
}

function MilestoneRow({ m, seq, toPx, chartPxWidth, gridDates, todayPx, showToday, todayStr, isChild = false, isLastChild = false }) {
  const hasDates = [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end].some(Boolean)
  const bgBase   = isChild ? '#f9fafb' : '#ffffff'

  return (
    <div
      className="flex items-center border-b border-gray-100 transition-colors"
      style={{ backgroundColor: bgBase }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = bgBase }}
    >
      {/* Fixed-width label column — frozen */}
      <div
        style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
        className="sticky left-0 z-30 flex items-center pr-2 flex-shrink-0 self-stretch"
      >
        {isChild ? (
          /* Indent + L-shaped connector */
          <div className="flex items-center flex-shrink-0" style={{ width: 28, alignSelf: 'stretch', position: 'relative' }}>
            {/* Vertical line (full height, cut at midpoint for last child) */}
            <div
              className="absolute left-3.5"
              style={{
                top: 0,
                bottom: isLastChild ? '50%' : 0,
                width: 1.5,
                backgroundColor: '#d1d5db',
              }}
            />
            {/* Horizontal stub */}
            <div
              className="absolute"
              style={{ left: '14px', top: '50%', width: 10, height: 1.5, backgroundColor: '#d1d5db' }}
            />
          </div>
        ) : (
          <div className="flex-shrink-0" style={{ width: 28 }} />
        )}

        <span className={`flex-shrink-0 tabular-nums text-right mr-1.5 ${isChild ? 'text-[10px] text-gray-300 w-10' : 'text-xs font-semibold text-gray-400 w-6'}`}>
          {isChild ? seq : `${seq}.`}
        </span>
        <p
          className={`text-xs truncate leading-tight flex-1 min-w-0 ${
            isChild ? 'text-gray-500 pl-0.5' : 'font-bold text-gray-800'
          }`}
          title={m.milestone_name}
        >
          {m.milestone_name}
        </p>
      </div>

      {/* Bar area */}
      <div style={{ width: chartPxWidth, minWidth: chartPxWidth, position: 'relative' }}>
        {!hasDates ? (
          <div className="px-3 flex items-center" style={{ height: 52 }}>
            <span className="text-xs text-gray-300 italic">No dates set</span>
          </div>
        ) : (
          <div className="relative overflow-hidden" style={{ height: 52, width: chartPxWidth, backgroundColor: 'transparent' }}>
            {/* Grid lines */}
            {gridDates.map((d, j) => {
              const left = toPx(d)
              if (left <= 0) return null
              return <div key={j} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left }} />
            })}

            {/* Today line */}
            {showToday && (
              <div className="absolute top-0 bottom-0 z-10"
                style={{ left: todayPx, width: 1.5, background: '#ed6055', opacity: 0.8 }} />
            )}

            {/* Row 1: Planned */}
            <div className="absolute inset-x-0" style={{ top: 4, height: 20 }}>
              <div className="relative h-full">
                <GanttBar start={m.planned_start} end={m.planned_end} color="#9ca3af" toPx={toPx} />
              </div>
            </div>

            {/* Row 2: Projected then Actual */}
            <div className="absolute inset-x-0" style={{ top: 25, height: 20 }}>
              <div className="relative h-full">
                <GanttBar start={m.projected_start} end={m.projected_end} color="#fde047" toPx={toPx} />
                <GanttBar start={m.actual_start} end={m.actual_end || (m.actual_start ? todayStr : null)} color="#86efac" toPx={toPx} />
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
    const cur = new Date(minDate); cur.setHours(0,0,0,0)
    const dow = cur.getDay()
    cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1))
    while (cur <= maxDate) { if (cur >= minDate) ticks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  } else {
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (cur <= maxDate) { if (cur >= minDate) ticks.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
  }
  return ticks
}

function computeParentDates(children) {
  if (!children.length) return {}
  const minStr = vals => vals.filter(Boolean).sort()[0] ?? null
  const maxStr = vals => vals.filter(Boolean).sort().at(-1) ?? null
  return {
    planned_start:   minStr(children.map(c => c.planned_start)),
    planned_end:     maxStr(children.map(c => c.planned_end)),
    actual_start:    minStr(children.map(c => c.actual_start)),
    actual_end:      children.every(c => c.actual_end) ? maxStr(children.map(c => c.actual_end)) : null,
    projected_start: children.every(c => !c.actual_start) ? minStr(children.map(c => c.projected_start)) : null,
    projected_end:   maxStr(children.map(c => c.projected_end)),
  }
}

function GanttChart({ milestones, overrideMin, overrideMax, timeScale = 'month', colPx = 20 }) {
  const headerScrollRef = useRef(null)
  const bodyScrollRef   = useRef(null)
  const syncingRef      = useRef(false)

  const onBodyScroll = () => {
    if (syncingRef.current) return
    syncingRef.current = true
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    syncingRef.current = false
  }
  const allDates = milestones
    .flatMap(m => [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end])
    .filter(Boolean)
    .map(d => parseDate(d).getTime())

  if (allDates.length === 0) {
    return <div className="text-center py-12 text-sm text-gray-400 italic">No dates set on any milestone.</div>
  }

  const rawMin  = new Date(Math.min(...allDates) - PAD)
  const rawMax  = new Date(Math.max(...allDates) + PAD)
  const minDate = overrideMin ?? new Date(rawMin.getFullYear(), rawMin.getMonth(), rawMin.getDate())
  const maxDate = overrideMax ?? new Date(rawMax.getFullYear(), rawMax.getMonth(), rawMax.getDate() + 1)

  const months = []
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (cur <= maxDate) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1) }

  const years = []
  const seenYears = new Set()
  months.forEach(mo => {
    const y = mo.getFullYear()
    if (!seenYears.has(y)) { seenYears.add(y); years.push(new Date(mo)) }
  })

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const ticks  = buildTicks(minDate, maxDate, timeScale)

  const tickStep = 1

  const gridDates = timeScale === 'month'
    ? months
    : ticks.filter((_, i) => i % tickStep === 0)

  const COL_PX = colPx

  const MS_PER_COL = timeScale === 'day'
    ? 86400000
    : timeScale === 'week'
      ? 7 * 86400000
      : 30.4375 * 86400000

  const chartPxWidth = timeScale === 'month'
    ? Math.max(480, months.length * COL_PX)
    : Math.max(480, ticks.length * COL_PX)

  const toPx       = (d) => ((d - minDate) / MS_PER_COL) * COL_PX
  const todayPx    = toPx(today)
  const showToday  = todayPx >= 0 && todayPx <= chartPxWidth

  const totalW = LABEL_W + chartPxWidth

  const axisHeader = (
    <>
      <div className="flex" style={{ width: totalW, minWidth: totalW, backgroundColor: '#f8fafc' }}>
        <div
          style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: '1px solid #e5e7eb', backgroundColor: '#f8fafc', position: 'sticky', left: 0, zIndex: 10 }}
          className="flex-shrink-0 flex items-center pl-3"
        >
          <span className="text-xs font-bold text-gray-700">Activity</span>
        </div>
        <div style={{ width: chartPxWidth, minWidth: chartPxWidth, position: 'relative', overflow: 'hidden' }}>
          {/* Row 1 */}
          <div className="relative" style={{ height: 22 }}>
            {timeScale === 'month' ? (
              years.map((yr, i) => {
                const left = toPx(yr)
                return (
                  <div key={i} className="absolute flex flex-col items-start" style={{ left }}>
                    <div className="w-px h-2 bg-gray-300" />
                    <span className="text-xs font-semibold text-gray-800 whitespace-nowrap ml-1">{yr.getFullYear()}</span>
                  </div>
                )
              })
            ) : (
              months.map((mo, i) => {
                const left = toPx(mo)
                return (
                  <div key={i} className="absolute flex flex-col items-start" style={{ left }}>
                    <div className="w-px h-2 bg-gray-300" />
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap ml-1">
                      {mo.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          {/* Row 2 */}
          <div className="relative mb-1" style={{ height: 28 }}>
            {timeScale === 'month' ? (
              months.map((mo, i) => {
                const left = toPx(mo)
                if (left < 0 || left > chartPxWidth) return null
                return (
                  <div key={i} className="absolute flex flex-col items-center" style={{ left, top: 0, transform: 'translateX(-50%)' }}>
                    <div className="w-px h-1 bg-gray-200" />
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap leading-none">
                      {mo.toLocaleDateString('en-PH', { month: 'short' })}
                    </span>
                  </div>
                )
              })
            ) : (
              <>
                {ticks.map((d, i) => {
                  const left = toPx(d)
                  if (left < 0 || left > chartPxWidth) return null
                  const showLabel = i % tickStep === 0
                  const isWeekend = (d.getDay() === 0 || d.getDay() === 6)
                  return (
                    <div key={i} className="absolute flex flex-col items-center" style={{ left, top: 0, transform: 'translateX(-50%)' }}>
                      <div className={`w-px bg-gray-200 ${timeScale === 'day' ? 'h-2' : 'h-1'}`} />
                      {showLabel && (
                        <span className={`leading-none ${isWeekend ? 'text-xs font-bold text-[#ed6055]' : 'text-xs font-medium text-gray-700'}`}>
                          {d.getDate()}
                        </span>
                      )}
                    </div>
                  )
                })}
                {showToday && (
                  <div className="absolute flex items-center justify-center" style={{ left: todayPx, top: 14, transform: 'translateX(-50%)' }}>
                    <span className="text-[10px] font-bold text-[#ed6055] whitespace-nowrap">today</span>
                  </div>
                )}
              </>
            )}
            {timeScale === 'month' && showToday && (
              <div className="absolute flex items-center justify-center" style={{ left: todayPx, top: 14, transform: 'translateX(-50%)' }}>
                <span className="text-[10px] font-bold text-[#ed6055] whitespace-nowrap">today</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="border-b-2 border-gray-200" style={{ width: totalW, minWidth: totalW }} />
    </>
  )

  const milestoneRows = (() => {
    const parents = milestones.filter(m => !m.parent_id)
    const rows = []
    parents.forEach((parent, pi) => {
      const parentSeq = pi + 1
      const children  = milestones.filter(m => m.parent_id === parent.id)
      const m = children.length ? { ...parent, ...computeParentDates(children) } : parent
      rows.push({ m, isChild: false, isLastChild: false, seq: String(parentSeq) })
      children.forEach((child, ci) => rows.push({ m: child, isChild: true, isLastChild: ci === children.length - 1, seq: `${parentSeq}.${ci + 1}` }))
    })
    return rows.map(({ m, isChild, isLastChild, seq }) => (
      <MilestoneRow
        key={m.id}
        m={m}
        seq={seq}
        toPx={toPx}
        chartPxWidth={chartPxWidth}
        gridDates={gridDates}
        todayPx={todayPx}
        showToday={showToday}
        todayStr={todayStr}
        isChild={isChild}
        isLastChild={isLastChild}
      />
    ))
  })()

  return (
    <div style={{ position: 'relative' }}>
      {/* Sticky header — scrolls in sync with body via ref */}
      <div
        className="sticky top-0 z-40 overflow-x-auto"
        ref={headerScrollRef}
        style={{ overflowY: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div style={{ width: totalW, minWidth: totalW }}>
          {axisHeader}
        </div>
      </div>

      {/* Scrollable rows */}
      <div className="overflow-x-auto" ref={bodyScrollRef} onScroll={onBodyScroll}>
        <div style={{ width: totalW, minWidth: totalW }}>
          {milestoneRows}
        </div>
      </div>
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
      setSelYear(y); setSelMonth(m)
    } else {
      setSelYear(''); setSelMonth('')
    }
  }, [value])

  const handleChange = (month, year) => {
    if (month && year) onChange(`${year}-${month}`)
    else onChange('')
  }

  const selectCls = 'px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white cursor-pointer'

  return (
    <div className="flex items-center gap-1">
      <select value={selMonth} onChange={e => { setSelMonth(e.target.value); handleChange(e.target.value, selYear) }} className={selectCls}>
        <option value="">(Month)</option>
        {MONTH_NAMES.map((name, i) => {
          const m = String(i + 1).padStart(2, '0')
          const ym = selYear ? `${selYear}-${m}` : null
          const disabled = (min && ym && ym < min) || (max && ym && ym > max)
          return <option key={m} value={m} disabled={!!disabled}>{name}</option>
        })}
      </select>
      <select value={selYear} onChange={e => { setSelYear(e.target.value); handleChange(selMonth, e.target.value) }} className={selectCls}>
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
  const dateRangeKey = `gantt_dateRange_${project.id}`
  const [fromMonth, setFromMonthRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dateRangeKey))?.from ?? '' } catch { return '' }
  })
  const [toMonth, setToMonthRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dateRangeKey))?.to ?? '' } catch { return '' }
  })
  const setFromMonth = (v) => {
    setFromMonthRaw(v)
    try { localStorage.setItem(dateRangeKey, JSON.stringify({ from: v, to: toMonth })) } catch {}
  }
  const setToMonth = (v) => {
    setToMonthRaw(v)
    try { localStorage.setItem(dateRangeKey, JSON.stringify({ from: fromMonth, to: v })) } catch {}
  }
  const [timeScale, setTimeScale]     = useState('month')
  const [colPxMap, setColPxMap] = useState(() => {
    try {
      const saved = localStorage.getItem('gantt_colPxMap')
      if (saved) return { ...DEFAULT_COL_PX, ...JSON.parse(saved) }
    } catch {}
    return { ...DEFAULT_COL_PX }
  })
  const colPx    = colPxMap[timeScale]
  const isDefaultWidth = colPx === DEFAULT_COL_PX[timeScale]
  const setColPx = (fn) => setColPxMap(prev => {
    const next = { ...prev, [timeScale]: typeof fn === 'function' ? fn(prev[timeScale]) : fn }
    try { localStorage.setItem('gantt_colPxMap', JSON.stringify(next)) } catch {}
    return next
  })
  const resetColPx = () => setColPxMap(prev => {
    const next = { ...prev, [timeScale]: DEFAULT_COL_PX[timeScale] }
    try { localStorage.setItem('gantt_colPxMap', JSON.stringify(next)) } catch {}
    return next
  })

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

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const phaseColor      = PHASE_COLORS[project.phase] ?? '#ed6055'
  const phaseMilestones = milestones.filter(m => m.phase === activePhase)

  const overrideMin = fromMonth ? (() => { const [y, m] = fromMonth.split('-').map(Number); return new Date(y, m - 1, 1) })() : null
  const overrideMax = toMonth   ? (() => { const [y, m] = toMonth.split('-').map(Number);   return new Date(y, m, 0) })()    : null
  const hasFilter   = fromMonth || toMonth

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="relative bg-white flex flex-col overflow-hidden rounded-xl w-3/4 h-[90vh] shadow-2xl"
        style={{ borderTop: `4px solid ${phaseColor}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-black leading-tight truncate">{project.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Milestone Gantt Chart</p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Close — proper touch target */}
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition"
              aria-label="Close"
            >
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
                    ? 'border-[#ed6055] text-[#ed6055]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {p.label}
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                  active ? 'bg-[#ed6055]/10 text-[#ed6055]' : 'text-gray-300'
                }`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-shrink-0 flex-wrap">

          {/* Baseline selector */}
          {baselines.length > 0 && (
            <>
              <select
                value={activeBL ?? ''}
                onChange={e => setActiveBL(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] font-semibold cursor-pointer"
              >
                {baselines.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
            </>
          )}

          {/* Time scale toggle */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
            {TIME_SCALES.map(s => (
              <button
                key={s.key}
                onClick={() => setTimeScale(s.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  timeScale === s.key
                    ? 'bg-[#ed6055] text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          {/* Column width control */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Width</span>
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setColPx(v => Math.max(10, v - 5))}
                className="px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50 hover:text-black transition leading-none"
                aria-label="Decrease column width"
              >−</button>
              <span className="px-2 text-[11px] font-semibold text-gray-700 tabular-nums border-x border-gray-200 min-w-[42px] text-center">
                {colPx}px
              </span>
              <button
                onClick={() => setColPx(v => Math.min(120, v + 5))}
                className="px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50 hover:text-black transition leading-none"
                aria-label="Increase column width"
              >+</button>
            </div>
            {!isDefaultWidth && (
              <button
                onClick={resetColPx}
                className="text-[10px] text-gray-400 hover:text-[#ed6055] transition font-medium underline underline-offset-2"
              >
                reset
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

          {/* Date range */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">From</label>
            <MonthYearPicker value={fromMonth} onChange={setFromMonth} max={toMonth} />
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">To</label>
            <MonthYearPicker value={toMonth} onChange={setToMonth} min={fromMonth} />
            {hasFilter && (
              <button
                onClick={() => { setFromMonth(''); setToMonth('') }}
                className="text-xs text-gray-400 hover:text-[#ed6055] transition font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Legend — fixed strip, never scrolls */}
        <div className="flex items-center justify-end gap-3 px-6 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-4 h-3 rounded inline-block bg-gray-400" />Planned
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-4 h-3 rounded inline-block" style={{ backgroundColor: '#86efac' }} />Actual
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-4 h-3 rounded inline-block" style={{ backgroundColor: '#fde047' }} />Projected
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="inline-block w-0.5 h-3.5 bg-[#ed6055] rounded-full" />Today
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-3">
          {loading ? (
            <TriangleLoader label="Loading milestones…" />
          ) : activeBL === null ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 italic">
              No milestone data yet. Import milestones from the project detail view.
            </div>
          ) : phaseMilestones.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 italic">
              No milestones for {PHASES.find(p => p.key === activePhase)?.label}.
            </div>
          ) : (
            <GanttChart
              milestones={phaseMilestones}
              overrideMin={overrideMin}
              overrideMax={overrideMax}
              timeScale={timeScale}
              colPx={colPx}
            />
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
