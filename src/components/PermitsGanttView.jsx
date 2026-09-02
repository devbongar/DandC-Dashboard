import { useMemo, useRef } from 'react'
import { GanttBar, parseDate, BAR_BORDER } from './GanttModal'
import { computePermitStatus } from '../lib/permitUtils'

const LABEL_W  = 280   // frozen left column px
const ROW_H    = 52    // px per permit row
const GROUP_H  = 32    // px per project group header
const AXIS_H   = 52    // px time axis header (2 rows: 24 year + 28 month)
const YEAR_H   = 24
const MONTH_H  = 28
const COL_PX   = 1    // px per day
const PAD_DAYS = 14    // days padding on each side of date range

const BAR_PLANNED   = '#bfccd9'
const BAR_ACTUAL    = '#a8d5b5'
const BAR_FORECAST  = '#f5e6a3'

const MS_PER_DAY = 86400000

function addDays(date, n) {
  return new Date(date.getTime() + n * MS_PER_DAY)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthsBetween(a, b) {
  const months = []
  let cur = startOfMonth(a)
  const end = startOfMonth(b)
  while (cur < end) {
    months.push(new Date(cur))
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return months
}

const fmtMonthShort = d => d.toLocaleDateString('en-PH', { month: 'short' })

export default function PermitsGanttView({ permits, onSelectPermit, hideGroupHeaders = false }) {
  const scrollRef      = useRef(null)
  const labelScrollRef = useRef(null)
  const axisInnerRef   = useRef(null)
  const syncingRef     = useRef(false)

  function syncScroll(source, target) {
    if (syncingRef.current) return
    syncingRef.current = true
    if (target.current) target.current.scrollTop = source.current.scrollTop
    syncingRef.current = false
  }

  function handleChartScroll() {
    syncScroll(scrollRef, labelScrollRef)
    if (axisInnerRef.current && scrollRef.current) {
      axisInnerRef.current.style.transform = `translateX(-${scrollRef.current.scrollLeft}px)`
    }
  }

  // Collect all valid dates to determine axis range
  const { minDate, maxDate } = useMemo(() => {
    const dates = []
    permits.forEach(p => {
      ['planned_start','planned_finish','actual_start','actual_finish','forecast_start','forecast_finish'].forEach(k => {
        if (p[k]) dates.push(parseDate(p[k]))
      })
    })
    if (dates.length === 0) {
      const now = new Date()
      return { minDate: startOfMonth(now), maxDate: new Date(now.getFullYear(), now.getMonth() + 7, 1) }
    }
    const rawMin = addDays(new Date(Math.min(...dates)), -PAD_DAYS)
    const rawMax = addDays(new Date(Math.max(...dates)),  PAD_DAYS)
    // Snap to month boundaries so toPx(months[0]) === 0 and axis rows align
    return {
      minDate: startOfMonth(rawMin),
      maxDate: new Date(rawMax.getFullYear(), rawMax.getMonth() + 7, 1),
    }
  }, [permits])

  // px from left edge for a given Date
  const toPx = (date) => Math.round((date - minDate) / MS_PER_DAY * COL_PX)

  const chartW = toPx(maxDate)
  const months = useMemo(() => monthsBetween(minDate, maxDate), [minDate, maxDate])

  // Group months by year for the top axis row
  const years = useMemo(() => {
    const map = new Map()
    months.forEach(m => {
      const y = m.getFullYear()
      if (!map.has(y)) map.set(y, [])
      map.get(y).push(m)
    })
    return [...map.entries()].map(([year, ms]) => ({
      year,
      x: toPx(ms[0]),
      w: toPx(new Date(year, ms[ms.length - 1].getMonth() + 1, 1)) - toPx(ms[0]),
    }))
  }, [months])

  function finishSortKey(p) {
    const dates = [p.actual_finish, p.forecast_finish].filter(Boolean).map(d => parseDate(d).getTime())
    return dates.length ? Math.max(...dates) : Infinity
  }

  // Group permits by project, sorted within each group by earliest finish
  const groups = useMemo(() => {
    const map = new Map()
    permits.forEach(p => {
      const key   = p.project_id ?? '__none__'
      const label = p.projects?.name ?? 'No Project'
      if (!map.has(key)) map.set(key, { label, rows: [] })
      map.get(key).rows.push(p)
    })
    return [...map.values()].map(g => ({
      ...g,
      rows: [...g.rows].sort((a, b) => finishSortKey(a) - finishSortKey(b)),
    }))
  }, [permits])

  const today = new Date()
  const todayX = toPx(today)
  const showToday = todayX >= 0 && todayX <= chartW

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
      {/* Floating legend */}
      <div className="absolute right-4 z-20 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/40 backdrop-blur border border-gray-200/40 shadow-md" style={{ top: AXIS_H + 8 }}>
        {[
          { color: BAR_PLANNED,  label: 'Planned' },
          { color: BAR_ACTUAL,   label: 'Actual' },
          { color: BAR_FORECAST, label: 'Forecast' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color, boxShadow: `inset 0 0 0 1.5px ${BAR_BORDER[color] ?? color}` }} />
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* Time axis — outside scroll container so width is correct */}
      <div className="flex flex-shrink-0 bg-gray-700 border-b border-gray-700 select-none" style={{ height: AXIS_H }}>
        {/* Label column spacer */}
        <div className="flex-shrink-0 bg-gray-700 flex items-center px-4" style={{ width: LABEL_W, borderRight: '1px solid #374151' }}>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Permit Name</span>
        </div>
        {/* Axis viewport (clips, never scrolls) */}
        <div className="flex-1 overflow-hidden">
          <div ref={axisInnerRef} style={{ minWidth: chartW, width: '100%' }}>
            {/* Row 1: years */}
            <div className="flex" style={{ height: YEAR_H, borderBottom: '1px solid #e5e7eb' }}>
              {years.map(({ year, w }, i) => {
                const isLast = i === years.length - 1
                return (
                  <div
                    key={year}
                    className={`flex items-center justify-center border-r border-gray-600 text-[10px] font-bold text-gray-200 tracking-widest ${isLast ? 'flex-1' : 'flex-shrink-0'}`}
                    style={isLast ? { minWidth: w } : { width: w }}
                  >
                    {year}
                  </div>
                )
              })}
            </div>
            {/* Row 2: months */}
            <div className="flex" style={{ height: MONTH_H }}>
              {months.map((m, i) => {
                const isLast = i === months.length - 1
                const next   = !isLast ? toPx(months[i + 1]) : chartW
                const w      = next - toPx(m)
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-center border-r border-gray-600 text-[9px] font-semibold text-gray-400 uppercase tracking-widest overflow-hidden ${isLast ? 'flex-1' : 'flex-shrink-0'}`}
                    style={isLast ? { minWidth: w } : { width: w }}
                  >
                    {fmtMonthShort(m)}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Frozen label column */}
        <div className="flex-shrink-0 overflow-hidden flex flex-col" style={{ width: LABEL_W, borderRight: '1px solid #e5e7eb' }}>
          {/* Rows */}
          <div
            ref={labelScrollRef}
            className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onScroll={() => syncScroll(labelScrollRef, scrollRef)}
          >
            {groups.map((g, gi) => (
              <div key={gi}>
                {!hideGroupHeaders && (
                  <div
                    className="flex items-center px-3 gap-2 bg-gray-50 border-b border-gray-200"
                    style={{ height: GROUP_H }}
                  >
                    <div className="w-1 h-3.5 rounded-full bg-[#ed6055] flex-shrink-0" />
                    <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide truncate">{g.label}</span>
                  </div>
                )}
                {g.rows.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPermit(p)}
                    className="w-full flex items-center pl-10 pr-3 gap-2 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
                    style={{ height: ROW_H }}
                  >
                    <span className="text-xs font-medium text-gray-700 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable chart rows */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          onScroll={handleChartScroll}
        >
          <div style={{ minWidth: chartW, width: '100%' }}>
            {/* Rows */}
            <div className="relative">
              {/* Today line */}
              {showToday && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{ left: todayX, width: 1.5, background: '#ed6055', opacity: 0.7 }}
                />
              )}

              {/* Month grid lines */}
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-gray-100 pointer-events-none"
                  style={{ left: toPx(m) }}
                />
              ))}

              {groups.map((g, gi) => (
                <div key={gi}>
                  {/* Group header row (empty, just height spacer) */}
                  {!hideGroupHeaders && <div style={{ height: GROUP_H }} className="border-b border-gray-200" />}

                  {g.rows.map(p => {
                    const status    = computePermitStatus(p)
                    const reqs      = p.permit_requirements ?? []
                    const reqDone   = reqs.filter(r => r.is_complete).length
                    const reqTotal  = reqs.length
                    const hasIssue  = (p.permit_issues ?? []).some(i => i.status === 'open')
                    const isAcquired = status === 'acquired'
                    const todayStr  = today.toISOString().slice(0, 10)
                    const barEnds   = [
                      p.planned_finish,
                      p.actual_finish ?? (p.actual_start ? todayStr : null),
                      !p.actual_finish ? p.forecast_finish : null,
                    ].filter(Boolean).map(d => parseDate(d))
                    const latestEnd  = barEnds.length ? new Date(Math.max(...barEnds)) : null
                    const indicatorX = latestEnd ? toPx(latestEnd) + 8 : null
                    return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPermit(p)}
                      className="relative flex flex-col justify-center w-full border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
                      style={{ height: ROW_H }}
                    >
                      {/* Planned bar */}
                      <div className="relative" style={{ height: 10, marginBottom: 10 }}>
                        <GanttBar start={p.planned_start}  end={p.planned_finish}  color={BAR_PLANNED}  toPx={toPx} />
                      </div>
                      {/* Actual + Forecast on same row */}
                      <div className="relative" style={{ height: 10 }}>
                        {!p.actual_finish && <GanttBar start={todayStr} end={p.forecast_finish} color={BAR_FORECAST} toPx={toPx} />}
                        <GanttBar start={p.actual_start} end={p.actual_finish ?? todayStr} color={BAR_ACTUAL} toPx={toPx} />
                      </div>
                      {/* Right-side indicator */}
                      {indicatorX !== null && (
                        <div className="absolute flex items-center gap-1" style={{ left: indicatorX, top: '50%', transform: 'translateY(-50%)' }}>
                          {isAcquired ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">Acquired</span>
                          ) : (
                            <>
                              {reqTotal > 0 && (
                                <span className="text-[9px] font-semibold text-gray-400 whitespace-nowrap">{reqDone}/{reqTotal}</span>
                              )}
                              {hasIssue && (
                                <svg className="w-3 h-3 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
