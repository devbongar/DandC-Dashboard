import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '../components/AdminLayout'
import { supabase, fetchAll } from '../lib/supabaseClient'

// Portfolio Gantt: one bar per project, spanning its latest S-curve baseline.
//
// The bar is shaded from the baseline start to today, and labelled with the
// latest actual POC. Those two are different measures -- elapsed time against
// work done -- and the gap between them is the point of the page: a bar that
// is 100% elapsed and 75% complete is a project in trouble.

const UNITS = {
  quarter: { label: 'Quarters', width: 92 },
  month:   { label: 'Months',   width: 46 },
}

// Variance thresholds, in percentage points of actual POC against the
// baseline's planned POC. Anything short of plan is at least at risk.
const BEHIND = -5
const AT_RISK = 0

const STATUS = {
  none:    { bar: 'bg-gray-300',    fill: 'bg-gray-400',    text: 'text-gray-600',    label: 'No progress reported' },
  behind:  { bar: 'bg-[#ed6055]/25', fill: 'bg-[#ed6055]',  text: 'text-white',       label: 'Behind' },
  at_risk: { bar: 'bg-amber-200',   fill: 'bg-amber-500',   text: 'text-white',       label: 'At risk' },
  on_track:{ bar: 'bg-emerald-200', fill: 'bg-emerald-600', text: 'text-white',       label: 'On track' },
}

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const parseDay = (s) => new Date(s + 'T00:00:00')
const fmtMonth = (d) => d.toLocaleDateString('en-US', { month: 'short' })
// Never renders "Invalid Date": a missing or malformed period becomes a dash
const fmtFull = (s) => {
  if (!s) return '—'
  const d = parseDay(String(s).slice(0, 10))
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const pct = (v) => (v === null || v === undefined || isNaN(v) ? '—' : `${v}%`)

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

// Sticky project column. Mobile shows the short name, so it needs far less.
const LABEL_W = { desktop: 200, mobile: 104 }

function useLabelWidth() {
  const [w, setW] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? LABEL_W.mobile : LABEL_W.desktop)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = e => setW(e.matches ? LABEL_W.mobile : LABEL_W.desktop)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return w
}

export default function WorkProgramPage() {
  const [rows, setRows] = useState(null)
  const [missing, setMissing] = useState([])
  const [unit, setUnit] = useState('quarter')
  const today = useMemo(() => new Date(), [])
  const labelW = useLabelWidth()

  useEffect(() => {
    const load = async () => {
      const [{ data: projects }, { data: baselines }, plannedRows, actualRows] = await Promise.all([
        supabase.from('projects').select('id, name, project_code').order('name'),
        supabase.from('project_scurve_baselines').select('id, project_id, name, created_at').order('created_at'),
        fetchAll(() => supabase.from('scurve_baseline_data').select('baseline_id, period_date, planned_pct').is('building_id', null).order('period_date')),
        fetchAll(() => supabase.from('scurve_actual').select('project_id, period_date, actual_pct').is('building_id', null).order('period_date')),
      ])

      const blByProject = {}
      for (const b of (baselines ?? [])) (blByProject[b.project_id] ??= []).push(b)

      const built = []
      const without = []
      for (const p of (projects ?? [])) {
        const bls = blByProject[p.id]
        const latest = bls?.[bls.length - 1]
        const plan = latest ? plannedRows.filter(r => r.baseline_id === latest.id) : []
        if (!plan.length) { without.push(p.name); continue }

        // POC is the running total of periodic values, and a trailing zero
        // means "not reported" -- same rule as computeChartData in scurveUtils.
        const mine = actualRows.filter(a => a.project_id === p.id)
        let cum = 0
        let pocNow = null
        let asOf = null
        for (const a of mine) {
          const v = a.actual_pct ?? 0
          if (v > 0) { cum = Math.min(100, cum + v); pocNow = cum; asOf = a.period_date }
        }

        // What the baseline said the project should have reached by then.
        // This -- not elapsed time -- is the measure of being behind: an
        // S-curve ramps slowly, so early projects look disastrous against the
        // calendar while sitting exactly on plan.
        let plannedAtAsOf = null
        if (asOf) {
          let pc = 0
          for (const r of plan) {
            if (r.period_date > asOf) break
            const v = r.planned_pct ?? 0
            if (v > 0) pc = Math.min(100, pc + v)
          }
          plannedAtAsOf = +pc.toFixed(1)
        }

        built.push({
          id: p.id,
          name: p.name,
          // project_code is the short name teams actually use (Jab, MEL)
          shortName: p.project_code || p.name,
          baseline: latest.name,
          start: plan[0].period_date,
          finish: plan[plan.length - 1].period_date,
          poc: pocNow === null ? null : +pocNow.toFixed(1),
          plannedPoc: plannedAtAsOf,
          asOf,
        })
      }
      setRows(built.sort((a, b) => a.start.localeCompare(b.start)))
      setMissing(without)
    }
    load()
  }, [])

  // Timeline spans every baseline, and today, so an overrun has somewhere to draw
  const scale = useMemo(() => {
    if (!rows?.length) return null
    const first = startOfMonth(parseDay(rows.reduce((m, r) => r.start < m ? r.start : m, rows[0].start)))
    const lastFinish = parseDay(rows.reduce((m, r) => r.finish > m ? r.finish : m, rows[0].finish))
    const last = addMonths(startOfMonth(lastFinish > today ? lastFinish : today), 1)
    const months = Math.max(1, Math.round((last - first) / 2.628e9))
    const width = unit === 'month' ? months * UNITS.month.width : Math.ceil(months / 3) * UNITS.quarter.width
    const x = (d) => ((d - first) / (last - first)) * width
    return { first, last, months, width, x }
  }, [rows, unit, today])

  const columns = useMemo(() => {
    if (!scale) return []
    const out = []
    for (let i = 0; i < scale.months; i += (unit === 'month' ? 1 : 3)) {
      const d = addMonths(scale.first, i)
      out.push({
        key: d.toISOString().slice(0, 7),
        label: unit === 'month' ? fmtMonth(d) : `Q${Math.floor(d.getMonth() / 3) + 1}`,
        year: d.getFullYear(),
        newYear: d.getMonth() < (unit === 'month' ? 1 : 3),
      })
    }
    return out
  }, [scale, unit])

  const headerActions = (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white/70 p-0.5">
      {Object.entries(UNITS).map(([k, u]) => (
        <button
          key={k}
          onClick={() => setUnit(k)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            unit === k ? 'bg-[#ed6055] text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {u.label}
        </button>
      ))}
    </div>
  )

  return (
    <AdminLayout title="Work Program" actions={headerActions}>
      <div className="max-w-[1600px] mx-auto pt-4 px-3 sm:px-6 pb-10 space-y-4">
        {!rows ? (
          <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
        ) : (
          <>
            <div className="wp-fade">
              <Legend />
            </div>
            <div className="wp-fade bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ animationDelay: '60ms' }}>
              <div className="overflow-x-auto">
                <div className="relative" style={{ minWidth: labelW + (scale?.width ?? 0) }}>
                  <TimelineHeader columns={columns} unit={unit} scale={scale} today={today} labelW={labelW} />
                  {rows.map((r, i) => (
                    <GanttRow key={r.id} row={r} scale={scale} today={today} index={i} labelW={labelW} />
                  ))}

                  {/* Today, drawn once over the whole grid so it reads across
                      rows with no bar. z-5 keeps it above the bars but under
                      the sticky project column (z-10) and header (z-20). */}
                  {scale && (
                    <div
                      className="wp-animated absolute top-0 bottom-0 w-px bg-[#ed6055] z-[5] pointer-events-none"
                      style={{ left: labelW + scale.x(today), transition: `left 320ms ${EASE}` }}
                    />
                  )}
                </div>
              </div>
            </div>
            {missing.length > 0 && <NoBaseline names={missing} />}
          </>
        )}
      </div>
    </AdminLayout>
  )
}

// Measured against the baseline's own planned POC, never against elapsed time
function statusFor(row) {
  if (row.poc === null || row.plannedPoc === null) return STATUS.none
  const variance = row.poc - row.plannedPoc
  if (variance < BEHIND) return STATUS.behind
  if (variance < AT_RISK) return STATUS.at_risk
  return STATUS.on_track
}

function GanttRow({ row, scale, today, index = 0, labelW }) {
  // The shading grows from zero on the first paint; it keeps its width across
  // later renders, so switching Quarters/Months slides instead of replaying.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const start = parseDay(row.start)
  const finish = parseDay(row.finish)
  const left = scale.x(start)
  const right = scale.x(finish)
  const span = Math.max(2, right - left)

  // Elapsed drives the shading only; the status comes from the plan comparison
  const elapsedPct = Math.max(0, Math.min(100, ((today - start) / (finish - start)) * 100))
  const status = statusFor(row)
  const variance = row.poc === null || row.plannedPoc === null ? null : +(row.poc - row.plannedPoc).toFixed(1)

  const tipLines = [row.name]
  if (row.poc === null) {
    tipLines.push('No actual POC reported yet', `Baseline ${fmtFull(row.start)} – ${fmtFull(row.finish)}`)
  } else {
    tipLines.push(`Actual POC   ${pct(row.poc)}`, `Baseline POC ${pct(row.plannedPoc)}`)
    if (variance !== null) {
      tipLines.push(variance > 0 ? `${variance} points ahead of plan`
        : variance < 0 ? `${Math.abs(variance)} points behind plan`
        : 'On plan')
    }
    if (row.asOf) tipLines.push(`as of ${fmtFull(row.asOf)}`)
  }
  tipLines.push(`Baseline: ${row.baseline}`)
  const tip = tipLines.join('\n')

  // No reported progress means nothing is shaded, even where time has passed
  const fillWidth = row.poc === null ? 0 : (span * elapsedPct) / 100
  const overrun = today > finish && (row.poc ?? 0) < 100 ? scale.x(today) - right : 0
  const hasOverrun = overrun > 2

  return (
    <div
      className="wp-row flex border-t border-gray-100 group"
      style={{ animationDelay: `${Math.min(index, 14) * 35 + 80}ms` }}
    >
      <div className="flex-shrink-0 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-200 px-2 sm:px-3 py-3" style={{ width: labelW }}>
        <p className="text-xs font-semibold text-gray-700 truncate" title={row.name}>
          <span className="sm:hidden">{row.shortName}</span>
          <span className="hidden sm:inline">{row.name}</span>
        </p>
        {/* No room at 104px -- the bar tooltip still carries these */}
        <p className="hidden sm:block text-[10px] text-gray-400 truncate">{fmtFull(row.start)} – {fmtFull(row.finish)}</p>
      </div>

      <div className="relative flex-1 py-3 group-hover:bg-gray-50" style={{ height: 58 }}>
        {/* Overrun: baseline finished, work did not. Drawn first, and tucked a
            cap's width behind the bar, so the bar's rounded end paints over its
            start -- a square edge butted against that curve leaves a notch. */}
        {hasOverrun && (
          <div
            className="wp-animated absolute top-1/2 -translate-y-1/2 h-7 rounded-full border border-[#ed6055]/50"
            style={{
              left: right - 14,
              width: overrun + 14,
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(237,96,85,0.28) 0 6px, transparent 6px 12px)',
              transition: `left 320ms ${EASE}, width 320ms ${EASE}`,
            }}
            title={`Past baseline finish by ${Math.round((today - parseDay(row.finish)) / 86400000)} days`}
          />
        )}

        <div
          className={`wp-animated absolute top-1/2 -translate-y-1/2 h-7 rounded-full overflow-hidden ${status.bar}`}
          style={{ left, width: span, transition: `left 320ms ${EASE}, width 320ms ${EASE}` }}
          title={tip}
        >
          <div
            className={`wp-animated h-full ${status.fill}`}
            style={{ width: grown ? fillWidth : 0, transition: `width 620ms ${EASE}` }}
          />

          {/* The label sits just past the shading, on the light remainder.
              Where the shading runs to the end there is no room, so it moves
              inside and flips to white. */}
          {row.poc === null ? (
            <span className={`absolute inset-y-0 left-0 flex items-center px-2.5 text-[10px] font-bold ${status.text}`}>
              No POC yet
            </span>
          ) : span - fillWidth < 58 ? (
            <span className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[10px] font-bold text-white">
              {row.poc}% done
            </span>
          ) : (
            <span
              className="wp-animated absolute inset-y-0 flex items-center text-[10px] font-bold text-gray-700 whitespace-nowrap"
              style={{ left: (grown ? fillWidth : 0) + 6, transition: `left 620ms ${EASE}` }}
            >
              {row.poc}% done
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TimelineHeader({ columns, unit, scale, today, labelW }) {
  return (
    <div className="flex sticky top-0 z-20 bg-gray-600">
      <div className="flex-shrink-0 sticky left-0 bg-gray-600 z-10 border-r border-gray-500 px-2 sm:px-3 py-2" style={{ width: labelW }}>
        <p className="text-[10px] font-bold text-gray-200 uppercase tracking-widest">Project</p>
      </div>
      <div className="relative flex-1" style={{ width: scale?.width }}>
        <div className="flex">
          {columns.map(c => (
            <div
              key={c.key}
              className={`py-2 text-center text-[10px] font-semibold text-gray-300 ${c.newYear ? 'border-l border-gray-400' : ''}`}
              style={{ width: UNITS[unit].width }}
            >
              {c.label}
              {c.newYear && <span className="block text-[9px] text-gray-400">{c.year}</span>}
            </div>
          ))}
        </div>
        {scale && <div className="absolute top-0 bottom-0 w-px bg-[#ed6055]" style={{ left: scale.x(today) }} />}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
      {[STATUS.on_track, STATUS.at_risk, STATUS.behind, STATUS.none].map(s => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-full ${s.fill}`} />{s.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(237,96,85,0.35) 0 4px, transparent 4px 8px)', border: '1px solid rgba(237,96,85,0.5)' }} />
        Past baseline finish
      </span>
      <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-[#ed6055]" />Today</span>
      <span className="text-gray-400">· Shading shows time elapsed; colour compares actual POC against the baseline.</span>
    </div>
  )
}

function NoBaseline({ names }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
        No S-curve baseline ({names.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.map(n => (
          <span key={n} className="text-[11px] text-gray-500 bg-gray-100 rounded-md px-2 py-1">{n}</span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        These projects cannot be plotted until a baseline is set in their S-Curve tab.
      </p>
    </div>
  )
}
