import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { supabase, fetchAll } from '../lib/supabaseClient'
import { computePermitStatus } from '../lib/permitUtils'
import { slugify } from './ProjectDetailPage'
import useProfile from '../hooks/useProfile'

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
  // The bar itself is always grey track + green shading. Status is carried by
  // the marker that sits just right of the today line, so a glance down the
  // column reads as a column of icons rather than four competing bar colours.
  none:    { tone: 'text-gray-500',    disc: 'bg-gray-400',    label: 'No progress reported', glyph: 'dash' },
  behind:  { tone: 'text-[#ed6055]',   disc: 'bg-[#ed6055]',   label: 'Behind',               glyph: 'alert' },
  at_risk: { tone: 'text-amber-600',   disc: 'bg-amber-500',   label: 'At risk',              glyph: 'warn' },
  on_track:{ tone: 'text-emerald-600', disc: 'bg-emerald-600', label: 'On track',             glyph: 'check' },
}

const TRACK = 'bg-gray-200'
const SHADE = 'bg-emerald-600'

// Solid status-coloured disc, white glyph, white ring. The ring is what makes
// it carry over the green shading as well as the grey track -- an unringed
// emerald check on emerald shading disappears.
function StatusMark({ status, title, size = 22, inline = false }) {
  const paths = {
    check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7" />,
    warn:  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v5m0 3.5h.01M10.3 3.9L2.5 17.5A1.9 1.9 0 004.2 20.4h15.6a1.9 1.9 0 001.7-2.9L13.7 3.9a1.9 1.9 0 00-3.4 0z" />,
    alert: <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v6m0 3.5h.01" />,
    dash:  <path strokeLinecap="round" d="M6 12h12" />,
  }
  return (
    <span
      className={[
        'rounded-full ring-2 ring-white flex items-center justify-center flex-shrink-0 pointer-events-auto',
        inline ? 'relative' : 'absolute top-1/2 -translate-y-1/2',
        status.disc,
      ].join(' ')}
      style={{ width: size, height: size, boxShadow: '0 1px 4px rgba(0,0,0,0.28)' }}
      title={title}
    >
      <svg
        className="text-white"
        style={{ width: size * 0.62, height: size * 0.62 }}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
      >
        {paths[status.glyph]}
      </svg>
    </span>
  )
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

  // Clicking a row opens the detail panel. Its queries are cached per project
  // for the session, so rows nobody opens cost nothing.
  const [selected, setSelected] = useState(null)
  const detailCache = useRef({})
  const closePanel = useCallback(() => setSelected(null), [])

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
                    <GanttRow
                      key={r.id}
                      row={r}
                      scale={scale}
                      today={today}
                      index={i}
                      labelW={labelW}
                      selected={selected?.id === r.id}
                      onSelect={() => setSelected(r)}
                    />
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

      <ProjectPanel row={selected} onClose={closePanel} cacheRef={detailCache} today={today} />
    </AdminLayout>
  )
}

// Measured against the baseline's own planned POC, never against elapsed time
function statusFor(row, today) {
  // Running past the baseline finish with work left is behind by definition --
  // the variance can look mild there only because the plan has run out of
  // periods to be measured against
  if (row.poc === null || row.plannedPoc === null) return STATUS.none
  if (today && parseDay(row.finish) < today && row.poc < 100) return STATUS.behind
  const variance = row.poc - row.plannedPoc
  if (variance < BEHIND) return STATUS.behind
  if (variance < AT_RISK) return STATUS.at_risk
  return STATUS.on_track
}

function GanttRow({ row, scale, today, index = 0, labelW, selected = false, onSelect }) {
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
  const status = statusFor(row, today)
  const variance = row.poc === null || row.plannedPoc === null ? null : +(row.poc - row.plannedPoc).toFixed(1)

  const tipLines = [row.name]
  if (row.poc === null) {
    tipLines.push('No actual POC reported yet', `Baseline ${fmtFull(row.start)} – ${fmtFull(row.finish)}`)
  } else {
    tipLines.push(`Actual POC   ${pct(row.poc)}`, `Baseline POC ${pct(row.plannedPoc)}`)
    if (variance !== null) {
      tipLines.push(variance > 0 ? `${variance}% ahead of plan`
        : variance < 0 ? `${Math.abs(variance)}% behind plan`
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

  // Marker goes 6px right of where the shading stops -- that is the today line
  // -- and slides past the bar end once the shading runs the full span
  const barEnd = hasOverrun ? right + overrun : right
  const markX = Math.min(left + fillWidth + 7, barEnd + 7)
  const labelFits = fillWidth >= 56

  return (
    <div
      className={`wp-row flex border-t border-gray-100 group cursor-pointer ${selected ? 'bg-[#ed6055]/[0.06]' : ''}`}
      style={{ animationDelay: `${Math.min(index, 14) * 35 + 80}ms` }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.() } }}
    >
      <div
        className={`flex-shrink-0 sticky left-0 z-10 border-r border-gray-200 px-2 sm:px-3 py-3 ${selected ? 'bg-[#fdf0ef]' : 'bg-white group-hover:bg-gray-50'}`}
        style={{ width: labelW }}
      >
        <p className="text-xs font-semibold text-gray-700 truncate" title={row.name}>
          <span className="sm:hidden">{row.shortName}</span>
          <span className="hidden sm:inline">{row.name}</span>
        </p>
        {/* No room at 104px -- the bar tooltip still carries these */}
        <p className="hidden sm:block text-[10px] text-gray-400 truncate">{fmtFull(row.start)} – {fmtFull(row.finish)}</p>
      </div>

      <div className={`relative flex-1 py-3 ${selected ? '' : 'group-hover:bg-gray-50'}`} style={{ height: 58 }}>
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
          className={`wp-animated absolute top-1/2 -translate-y-1/2 h-7 rounded-full overflow-hidden ${TRACK}`}
          style={{ left, width: span, transition: `left 320ms ${EASE}, width 320ms ${EASE}` }}
          title={tip}
        >
          <div
            className={`wp-animated h-full ${SHADE}`}
            style={{ width: grown ? fillWidth : 0, transition: `width 620ms ${EASE}` }}
          />

          {/* POC sits left of the today line -- right-aligned at the end of the
              shading, which is where today falls. Too little shading to hold it
              and it moves onto the grey, past the marker. */}
          {row.poc === null ? (
            <span className="absolute inset-y-0 left-0 flex items-center pl-8 text-[10px] font-bold text-gray-500">
              No POC yet
            </span>
          ) : labelFits ? (
            <span
              className="wp-animated absolute inset-y-0 flex items-center justify-end pr-2.5 text-[10px] font-bold text-white whitespace-nowrap"
              style={{ left: 0, width: grown ? fillWidth : 0, transition: `width 620ms ${EASE}` }}
            >
              {row.poc}% done
            </span>
          ) : (
            <span
              className="wp-animated absolute inset-y-0 flex items-center text-[10px] font-bold text-gray-700 whitespace-nowrap"
              style={{ left: (grown ? fillWidth : 0) + 30, transition: `left 620ms ${EASE}` }}
            >
              {row.poc}% done
            </span>
          )}
        </div>

        {/* Status marker, just right of the today line. Outside the bar so a
            full-length shading or an overrun cannot clip it. */}
        <div
          className="wp-animated absolute top-1/2 -translate-y-1/2"
          style={{ left: grown ? markX : left + 6, height: 0, transition: `left 620ms ${EASE}` }}
        >
          <StatusMark status={status} title={`${status.label}${variance === null ? '' : ` · ${variance > 0 ? '+' : ''}${variance}% vs baseline`}`} />
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
  const Chip = ({ children }) => (
    <span className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-1 pr-2.5 py-1 text-[11px] font-medium text-gray-700">
      {children}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[STATUS.on_track, STATUS.at_risk, STATUS.behind, STATUS.none].map(s => (
        <Chip key={s.label}>
          <StatusMark status={s} size={16} inline />
          {s.label}
        </Chip>
      ))}
      <Chip>
        <span className="ml-1 w-7 h-2.5 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
          <span className="block w-1/2 h-full bg-emerald-600 rounded-full" />
        </span>
        Elapsed / remaining
      </Chip>
      <Chip>
        <span
          className="ml-1 w-3.5 h-3.5 rounded-sm flex-shrink-0"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(237,96,85,0.45) 0 4px, transparent 4px 8px)', border: '1px solid rgba(237,96,85,0.6)' }}
        />
        Past baseline finish
      </Chip>
      <Chip>
        <span className="ml-1.5 mr-0.5 w-0.5 h-3.5 bg-[#ed6055] flex-shrink-0" />
        Today
      </Chip>
      <p className="w-full text-[11px] text-gray-500 mt-0.5">
        Shading shows time elapsed; the marker compares actual POC against the baseline.
      </p>
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

// -- Project panel -----------------------------------------------------------
// Opens on a row click. One small query set per project, cached for the
// session, so rows that are never clicked cost nothing.
// Escalation order: an ESA item outranks a Management Committee item, which
// outranks one sitting with the D&C Head
const LEVEL_RANK = { 'ESA': 0, 'Management Committee': 1, 'D&C Head': 2 }

// A finding still open this long after inspection is the one worth chasing
const NCR_AGING_DAYS = 14
const LEVEL_SHORT = { 'ESA': 'ESA', 'Management Committee': 'MANCOM', 'D&C Head': 'D&C HEAD' }
const LEVEL_TONE = {
  'ESA':                  'bg-[#ed6055]/10 text-[#ed6055]',
  'Management Committee': 'bg-amber-100 text-amber-700',
  'D&C Head':             'bg-sky-100 text-sky-700',
}

const ageInDays = (d) => {
  if (!d) return null
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 86400000))
}

const TAB = {
  scurve:  'S-Curve',
  permits: 'Permits',
  units:   'Unit Completion',
  issues:  'Issues & Concerns',
  qa:      'Quality Assurance',
}

async function loadDetail(projectId) {
  const [permits, issues, ncr, groups] = await Promise.all([
    // 'permits' is the tracked permit register the Permits tab reads.
    // 'project_permits' is a different thing -- a compliance checklist with no
    // dates -- and running computePermitStatus over it returns 'pending' for
    // every row.
    supabase.from('permits').select('id, status, actual_start, actual_finish, planned_finish').eq('project_id', projectId),
    supabase.from('issues').select('id, status, management_level, details, issue_group, date_presented, created_at').eq('project_id', projectId),
    supabase.from('project_ncr_reports').select('id, status, date_of_inspection, created_at').eq('project_id', projectId),
    supabase.from('project_location_groups').select('id').eq('project_id', projectId).eq('type', 'residential'),
  ])

  const groupIds = (groups.data ?? []).map(g => g.id)
  const [floors, completions] = await Promise.all([
    groupIds.length
      ? fetchAll(() => supabase.from('project_location_floors').select('num_units').in('group_id', groupIds))
      : Promise.resolve([]),
    fetchAll(() => supabase.from('project_unit_completion').select('m4_date, m5_date').eq('project_id', projectId)),
  ])

  // Permit status comes from the shared helper, so the panel and the Permits
  // tab can never disagree about what counts as overdue
  const pRows = permits.data ?? []
  const pStatus = pRows.map(p => computePermitStatus(p))

  const iRows = issues.data ?? []
  const openIssues = iRows.filter(i => i.status === 'open')
  const nRows = ncr.data ?? []
  const openNcr = nRows.filter(r => r.status === 'open')
  const openAges = openNcr.map(r => ageInDays(r.date_of_inspection ?? r.created_at)).filter(a => a !== null)
  const totalUnits = (floors ?? []).reduce((n, f) => n + (f.num_units ?? 0), 0)

  return {
    permits: {
      total:    pRows.length,
      acquired: pStatus.filter(s => s === 'acquired').length,
      overdue:  pStatus.filter(s => s === 'overdue').length,
      pending:  pStatus.filter(s => s === 'pending').length,
    },
    issues: {
      total: iRows.length,
      open:  openIssues.length,
      hold:  iRows.filter(i => i.status === 'hold').length,
      // Escalation first, then whatever has been sitting longest
      top:   openIssues
        .map(i => ({
          id:    i.id,
          level: i.management_level || '—',
          age:   ageInDays(i.date_presented ?? i.created_at),
          text:  (i.details || i.issue_group || 'Untitled issue').trim(),
        }))
        .sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) || (b.age ?? -1) - (a.age ?? -1))
        .slice(0, 3),
    },
    qa: {
      total: nRows.length,
      open:  openNcr.length,
      // Aging is counted from the inspection date, which is when the finding
      // was actually raised on site -- created_at only says when it was typed in
      aging:  openAges.filter(a => a >= NCR_AGING_DAYS).length,
      oldest: openAges.length ? Math.max(...openAges) : null,
    },
    units: {
      total: totalUnits,
      m4:    (completions ?? []).filter(c => c.m4_date).length,
      m5:    (completions ?? []).filter(c => c.m5_date).length,
    },
  }
}

function Meter({ value, total, className = 'bg-gray-400' }) {
  const w = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${w}%`, transition: `width 420ms ${EASE}` }} />
    </div>
  )
}

function Card({ title, onOpen, children }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
        <div className="flex-1" />
        <span className="text-gray-300 group-hover:text-gray-500 transition-colors">&rsaquo;</span>
      </div>
      {children}
    </button>
  )
}

function Skeleton() {
  return (
    <div className="space-y-1.5">
      <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
      <div className="h-1.5 rounded-full bg-gray-100 animate-pulse" />
    </div>
  )
}

function ProjectPanel({ row, onClose, cacheRef, today }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!row) return
    const cached = cacheRef.current[row.id]
    if (cached) { setDetail(cached); return }
    setDetail(null)
    let live = true
    loadDetail(row.id).then(d => {
      cacheRef.current[row.id] = d
      if (live) setDetail(d)
    })
    return () => { live = false }
  }, [row, cacheRef])

  useEffect(() => {
    if (!row) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [row, onClose])

  const go = (tab) =>
    navigate(`/projects/${slugify(row.name)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`, { state: { id: row.id } })

  const open = !!row
  const status = row ? statusFor(row, today) : STATUS.none
  const variance = !row || row.poc === null || row.plannedPoc === null
    ? null : +(row.poc - row.plannedPoc).toFixed(1)

  return (
    <>
      {/* Tap-out dismiss, mobile only -- on desktop the chart stays usable */}
      <div
        className={`sm:hidden fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside
        className={[
          'fixed z-[61] bg-white shadow-2xl flex flex-col',
          'inset-x-0 bottom-0 max-h-[78vh] rounded-t-2xl',
          // No sm:bottom-auto here -- it would cancel inset-y-0's bottom and
          // leave the drawer as tall as its content, with nothing to scroll in
          'sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[380px] sm:max-h-none sm:rounded-t-none sm:border-l sm:border-gray-200',
          open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
        ].join(' ')}
        style={{ transition: `transform 280ms ${EASE}` }}
        aria-hidden={!open}
      >
        {/* Drag handle: a mobile affordance, hidden on the desktop drawer */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-4 pt-3 pb-3 flex-shrink-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-800 leading-snug">{row?.name ?? ''}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {row?.shortName} &middot; {row?.baseline} &middot; {fmtFull(row?.start)} &ndash; {fmtFull(row?.finish)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 mt-2 pl-1 pr-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-[11px] font-semibold text-gray-700">
            <StatusMark status={status} size={16} inline />
            {status.label}
            {variance !== null && (
              <span className={`font-semibold ${status.tone}`}>{variance > 0 ? '+' : ''}{variance}%</span>
            )}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
          <Card title="S-Curve" onOpen={() => go(TAB.scurve)}>
            {row?.poc === null ? (
              <p className="text-xs text-gray-400">No actual POC reported yet</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-gray-800 leading-none">{pct(row?.poc)}</span>
                  <span className="text-[11px] text-gray-400">actual &middot; baseline {pct(row?.plannedPoc)}</span>
                </div>
                <Meter value={row?.poc ?? 0} total={100} className={SHADE} />
                {row?.asOf && <p className="text-[10px] text-gray-400">as of {fmtFull(row.asOf)}</p>}
              </div>
            )}
          </Card>

          <Card title="Permits" onOpen={() => go(TAB.permits)}>
            {!detail ? <Skeleton /> : (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-gray-800 leading-none">
                    {detail.permits.acquired} <span className="text-xs font-medium text-gray-400">of {detail.permits.total} secured</span>
                  </span>
                </div>
                <Meter value={detail.permits.acquired} total={detail.permits.total} className="bg-emerald-500" />
                {/* Always shown, zero included -- "no overdue permits" is a
                    fact worth reading, not an absence */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${detail.permits.overdue > 0 ? 'bg-[#ed6055]' : 'bg-gray-300'}`} />
                  <span className={`text-[11px] font-semibold ${detail.permits.overdue > 0 ? 'text-[#ed6055]' : 'text-gray-400'}`}>
                    {detail.permits.overdue} overdue
                  </span>
                  {detail.permits.pending > 0 && (
                    <span className="text-[11px] text-gray-400">&middot; {detail.permits.pending} not started</span>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="Unit Completion" onOpen={() => go(TAB.units)}>
            {!detail ? <Skeleton /> : detail.units.total === 0 ? (
              <p className="text-xs text-gray-400">No residential units recorded</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] font-semibold text-gray-500">M4</span>
                    <span className="text-[11px] text-gray-400">{detail.units.m4} / {detail.units.total}</span>
                  </div>
                  <Meter value={detail.units.m4} total={detail.units.total} className="bg-sky-500" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] font-semibold text-gray-500">M5</span>
                    <span className="text-[11px] text-gray-400">{detail.units.m5} / {detail.units.total}</span>
                  </div>
                  <Meter value={detail.units.m5} total={detail.units.total} className="bg-indigo-500" />
                </div>
              </div>
            )}
          </Card>

          <Card title="Quality Assurance" onOpen={() => go(TAB.qa)}>
            {!detail ? <Skeleton /> : detail.qa.total === 0 ? (
              <p className="text-xs text-gray-400">No findings raised</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-gray-800 leading-none">
                    {detail.qa.total - detail.qa.open}{' '}
                    <span className="text-xs font-medium text-gray-400">
                      of {detail.qa.total} finding{detail.qa.total === 1 ? '' : 's'} closed
                    </span>
                  </span>
                </div>
                <Meter value={detail.qa.total - detail.qa.open} total={detail.qa.total} className="bg-emerald-500" />
                <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                  <span className={`w-1.5 h-1.5 rounded-full ${detail.qa.open > 0 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <span className={`text-[11px] font-semibold ${detail.qa.open > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {detail.qa.open} still open
                  </span>
                  {detail.qa.aging > 0 && (
                    <span className="text-[11px] font-semibold text-[#ed6055]">
                      &middot; {detail.qa.aging} aging {NCR_AGING_DAYS}d+
                    </span>
                  )}
                  {detail.qa.oldest !== null && detail.qa.open > 0 && (
                    <span className="text-[11px] text-gray-400">&middot; oldest {detail.qa.oldest}d</span>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="Issues &amp; Concerns" onOpen={() => go(TAB.issues)}>
            {!detail ? <Skeleton /> : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-gray-800 leading-none">{detail.issues.open}</span>
                  <span className="text-[11px] text-gray-400">
                    open of {detail.issues.total}
                    {detail.issues.hold > 0 && ` · ${detail.issues.hold} on hold`}
                  </span>
                </div>
                {detail.issues.top.length > 0 && (
                  <ul className="mt-2 space-y-2.5">
                    {detail.issues.top.map(i => (
                      <li key={i.id}>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${LEVEL_TONE[i.level] ?? 'bg-gray-100 text-gray-500'}`}>
                            {LEVEL_SHORT[i.level] ?? i.level}
                          </span>
                          <div className="flex-1" />
                          {i.age !== null && (
                            <span className={`text-[10px] font-semibold tabular-nums ${i.age >= 30 ? 'text-[#ed6055]' : i.age >= 14 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {i.age}d
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-600 leading-snug whitespace-pre-wrap break-words mt-0.5">{i.text}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {detail.issues.open > detail.issues.top.length && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    +{detail.issues.open - detail.issues.top.length} more open
                  </p>
                )}
              </>
            )}
          </Card>

          {row && <Discussion projectId={row.id} />}
        </div>

        <div className="p-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => go(null)}
            className="w-full py-2 rounded-lg bg-[#ed6055] text-white text-xs font-semibold hover:bg-[#d9544a] transition-colors"
          >
            Open project
          </button>
        </div>
      </aside>
    </>
  )
}

// -- Project discussion ------------------------------------------------------
// A flat thread per project. Author names come from a second profiles query:
// project_comments.created_by points at auth.users, which PostgREST cannot
// embed profiles through.
const relTime = (iso) => {
  const t = new Date(iso)
  if (isNaN(t)) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Discussion({ projectId }) {
  const { profile } = useProfile()
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const endRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('project_comments')
      .select('id, body, created_by, created_at, edited_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    const list = data ?? []
    setRows(list)

    const ids = [...new Set(list.map(r => r.created_by))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
      setNames(Object.fromEntries((profs ?? []).map(p => [p.id, p.full_name || p.email || 'Unknown'])))
    }
  }, [projectId])

  useEffect(() => { setRows(null); setDraft(''); setConfirmId(null); load() }, [load])

  // Newest message is the one worth seeing when the thread first paints
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [rows])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const { error } = await supabase.from('project_comments').insert({
      project_id: projectId,
      body,
      created_by: profile?.id,
    })
    setSending(false)
    if (!error) { setDraft(''); load() }
  }

  // Inline confirm rather than window.confirm, matching the baseline delete
  // in SCurveTab -- a deleted message is not recoverable
  const remove = async (id) => {
    setConfirmId(null)
    await supabase.from('project_comments').delete().eq('id', id)
    load()
  }

  return (
    <div className="border-t border-gray-100">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Discussion</p>
        {rows?.length > 0 && (
          <span className="text-[10px] font-semibold text-gray-400">{rows.length}</span>
        )}
      </div>

      <div className="px-4 pb-2 space-y-2.5">
        {rows === null ? (
          <Skeleton />
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400">No messages yet. Start the thread.</p>
        ) : rows.map(r => {
          const mine = r.created_by === profile?.id
          return (
            <div key={r.id} className="group/msg">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-700">
                  {mine ? 'You' : (names[r.created_by] ?? '…')}
                </span>
                <span className="text-[10px] text-gray-400">{relTime(r.created_at)}</span>
                <div className="flex-1" />
                {(mine || profile?.role === 'admin') && (
                  confirmId === r.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">Delete?</span>
                      <button
                        onClick={() => remove(r.id)}
                        className="text-[10px] font-semibold text-[#ed6055] hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                  <button
                    onClick={() => setConfirmId(r.id)}
                    className="opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition-opacity text-[10px] text-gray-400 hover:text-[#ed6055]"
                    aria-label="Delete message"
                  >
                    Delete
                  </button>
                  )
                )}
              </div>
              <p className="text-[11px] text-gray-600 leading-snug whitespace-pre-wrap break-words mt-0.5">{r.body}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="px-3 pb-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          className="flex-1 resize-none rounded-lg bg-black/[0.05] px-3 py-2 text-base sm:text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 max-h-24"
          style={{ height: 'auto' }}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px` }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-[#ed6055] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d9544a] transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
