import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import TriangleLoader from './TriangleLoader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import SearchDropdown from './SearchDropdown'

// ── Colors ───────────────────────────────────────────────────────────────────
const M4_EXP = '#d1d5db'  // gray-300    (expected = gray)
const M4_ACT = '#16a34a'  // green-600   (actual   = green)
const M5_EXP = '#d1d5db'  // gray-300    (expected = gray)
const M5_ACT = '#16a34a'  // green-600   (actual   = green)

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Time helpers ─────────────────────────────────────────────────────────────
const TIME_MODES = [
  { key: 'monthly',   label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly',    label: 'Yearly' },
]

function toPeriodKey(dateStr, mode) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (mode === 'yearly')    return `${y}`
  if (mode === 'quarterly') return `${y}-Q${Math.ceil(m / 3)}`
  return `${y}-${String(m).padStart(2, '0')}`
}

// ── Data computation ──────────────────────────────────────────────────────────
function buildChartData(floors, completions, mode, availableYears) {
  const years = availableYears.length ? availableYears : [new Date().getFullYear()]

  // Build skeleton across ALL years
  let skeleton = []
  if (mode === 'monthly') {
    years.forEach(year => {
      const yr = String(year).slice(2)
      for (let i = 0; i < 12; i++) {
        const m = String(i + 1).padStart(2, '0')
        skeleton.push({ period: `${year}-${m}`, label: `${MONTH_LABELS[i]} '${yr}`, m4Expected: 0, m4Actual: 0, m5Expected: 0, m5Actual: 0 })
      }
    })
  } else if (mode === 'quarterly') {
    years.forEach(year => {
      const yr = String(year).slice(2)
      ;[1, 2, 3, 4].forEach(q => {
        skeleton.push({ period: `${year}-Q${q}`, label: `Q${q} '${yr}`, m4Expected: 0, m4Actual: 0, m5Expected: 0, m5Actual: 0 })
      })
    })
  }

  const map = skeleton.length
    ? Object.fromEntries(skeleton.map(s => [s.period, { ...s }]))
    : {}

  const get = k => (map[k] ??= { period: k, m4Expected: 0, m4Actual: 0, m5Expected: 0, m5Actual: 0 })

  for (const f of floors) {
    if (f.m4_planned_end) {
      const k = toPeriodKey(f.m4_planned_end, mode)
      if (k && (mode === 'yearly' || k in map)) get(k).m4Expected += f.num_units ?? 0
    }
    if (f.m5_planned_end) {
      const k = toPeriodKey(f.m5_planned_end, mode)
      if (k && (mode === 'yearly' || k in map)) get(k).m5Expected += f.num_units ?? 0
    }
  }

  for (const c of completions) {
    if (c.m4_date) {
      const k = toPeriodKey(c.m4_date, mode)
      if (k && (mode === 'yearly' || k in map)) get(k).m4Actual += 1
    }
    if (c.m5_date) {
      const k = toPeriodKey(c.m5_date, mode)
      if (k && (mode === 'yearly' || k in map)) get(k).m5Actual += 1
    }
  }

  const sorted = Object.values(map).sort((a, b) => a.period.localeCompare(b.period))

  // For yearly mode, attach a label equal to the period string
  if (mode === 'yearly') return sorted.map(d => ({ ...d, label: d.period }))
  return sorted // monthly/quarterly already have labels from skeleton
}

// Collect all years that appear in the raw data
function extractYears(floors, completions) {
  const years = new Set()
  const addDate = d => { if (d) years.add(new Date(d).getFullYear()) }
  floors.forEach(f => { addDate(f.m4_planned_end); addDate(f.m5_planned_end) })
  completions.forEach(c => { addDate(c.m4_date); addDate(c.m5_date) })
  // No fallback — return empty array when there's truly no data
  return [...years].sort((a, b) => a - b)
}

// ── Styles ────────────────────────────────────────────────────────────────────
const selectCls = 'px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent'

// ── Custom X Tick ─────────────────────────────────────────────────────────────
function CustomXTick({ x, y, payload }) {
  const label = payload?.value ?? ''
  const apos  = label.indexOf("'")
  const main  = apos > 0 ? label.slice(0, apos).trim() : label
  const yr    = apos > 0 ? '20' + label.slice(apos + 1) : ''
  const isYearStart = main === 'Jan' || main === 'Q1'
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={10} fill="#6b7280">{main}</text>
      {isYearStart && yr && (
        <text x={0} y={0} dy={24} textAnchor="middle" fontSize={9} fill="#9ca3af">{yr}</text>
      )}
    </g>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }} className="font-semibold">
          {p.name}: <span className="text-black">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UnitCompletionChart() {
  const [allProjects, setAllProjects]   = useState(null)
  const [floors, setFloors]             = useState([])
  const [completions, setCompletions]   = useState([])
  const [loading, setLoading]           = useState(true)

  // Filters
  const [is4ph, setIs4ph]           = useState('all')
  const [projectId, setProjectId]   = useState('all')
  const [province, setProvince]     = useState('')
  const [city, setCity]             = useState('')
  const [timeMode, setTimeMode]     = useState('monthly')

  const m4Ref = useRef(null)
  const m5Ref = useRef(null)

  // Load projects once on mount
  useEffect(() => {
    supabase.from('projects')
      .select('id, name, is_4ph_project, province, city')
      .then(({ data }) => setAllProjects(data ?? []))
  }, [])

  // Derive province list from actual project data (respects type filter)
  const availableProvinces = useMemo(() => {
    if (!allProjects) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .map(p => p.province)
        .filter(Boolean)
    )].sort()
  }, [allProjects, is4ph])

  // Derive city list from projects matching the selected province (and type filter)
  const availableCities = useMemo(() => {
    if (!allProjects || !province) return []
    return [...new Set(
      allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .filter(p => p.province === province)
        .map(p => p.city)
        .filter(Boolean)
    )].sort()
  }, [allProjects, is4ph, province])

  useEffect(() => {
    const load = async () => {
      if (allProjects === null) return
      setLoading(true)

      const filteredIds = allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
        .filter(p => projectId === 'all' || p.id === projectId)
        .filter(p => !province  || p.province === province)
        .filter(p => !city      || p.city === city)
        .map(p => p.id)

      if (filteredIds.length === 0) {
        setFloors([]); setCompletions([]); setLoading(false); return
      }

      const [fRes, cRes] = await Promise.all([
        supabase.from('project_floors')
          .select('project_id, num_units, m4_planned_end, m5_planned_end')
          .in('project_id', filteredIds),
        supabase.from('project_unit_completion')
          .select('project_id, m4_date, m5_date')
          .in('project_id', filteredIds),
      ])

      setFloors(fRes.data ?? [])
      setCompletions(cRes.data ?? [])
      setLoading(false)
    }

    load()
  }, [allProjects, is4ph, projectId, province, city])

  // Available years derived from data
  const availableYears = useMemo(() => {
    const years = extractYears(floors, completions)
    return years.length ? years : [new Date().getFullYear()]
  }, [floors, completions])

  const chartData = useMemo(
    () => buildChartData(floors, completions, timeMode, availableYears),
    [floors, completions, timeMode, availableYears],
  )

  const totals = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    const m4Actual       = completions.filter(c => c.m4_date).length
    const m5Actual       = completions.filter(c => c.m5_date).length

    const m4PlannedToday = floors.filter(f => f.m4_planned_end && new Date(f.m4_planned_end) <= today).reduce((s, f) => s + (f.num_units ?? 0), 0)
    const m5PlannedToday = floors.filter(f => f.m5_planned_end && new Date(f.m5_planned_end) <= today).reduce((s, f) => s + (f.num_units ?? 0), 0)

    const m4Total        = floors.reduce((s, f) => s + (f.num_units ?? 0), 0)
    const m5Total        = floors.reduce((s, f) => s + (f.num_units ?? 0), 0)

    const m4Rate   = m4PlannedToday > 0 ? Math.round((m4Actual / m4PlannedToday) * 100) : null
    const m5Rate   = m5PlannedToday > 0 ? Math.round((m5Actual / m5PlannedToday) * 100) : null
    const m4Status = m4PlannedToday === 0 ? null : m4Actual > m4PlannedToday ? 'ahead' : m4Actual === m4PlannedToday ? 'on-track' : 'delayed'
    const m5Status = m5PlannedToday === 0 ? null : m5Actual > m5PlannedToday ? 'ahead' : m5Actual === m5PlannedToday ? 'on-track' : 'delayed'

    return { m4Actual, m4PlannedToday, m4Total, m4Rate, m4Status, m5Actual, m5PlannedToday, m5Total, m5Rate, m5Status }
  }, [floors, completions])

  // Min visible periods per screen: 12 months, 4 quarters, or 3 years
  const minVisible = timeMode === 'monthly' ? 12 : timeMode === 'quarterly' ? 4 : 4
  const chartWidthPct = `${Math.max(100, (chartData.length / minVisible) * 100)}%`

  // Scroll both charts to the current (or latest) year on load / mode change
  useEffect(() => {
    if (!availableYears.length) return
    const currentYear = new Date().getFullYear()
    const targetYear  = availableYears.includes(currentYear) ? currentYear : availableYears[availableYears.length - 1]
    const yearIndex   = availableYears.indexOf(targetYear)
    const fraction    = availableYears.length > 1 ? yearIndex / availableYears.length : 0
    const scroll = (ref) => {
      if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth * fraction
    }
    scroll(m4Ref)
    scroll(m5Ref)
  }, [availableYears, timeMode])

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
        <h2 className="text-sm font-bold text-black">Unit Completion Overview</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Row 1: Type toggle + Project picker + Province + City */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type toggle — styled to match card context */}
          <div
            className="flex items-center gap-0.5 flex-shrink-0 p-0.5 rounded-lg"
            style={{
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
              <button
                key={t.key}
                onClick={() => { setIs4ph(t.key); setProjectId('all'); setProvince(''); setCity('') }}
                className="relative px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                style={is4ph === t.key ? {
                  background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                  color: '#fff',
                  boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                } : {
                  color: '#6b7280',
                  background: 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Project picker — scoped by type */}
          <SearchDropdown
            options={(allProjects ?? [])
              .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => ({ value: p.id, label: p.name }))
            }
            value={projectId}
            onChange={setProjectId}
            emptyValue="all"
            emptyLabel="All Projects"
            placeholder="Search projects…"
            icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            minWidth={130}
          />

          {/* Province */}
          <SearchDropdown
            options={availableProvinces.map(p => ({ value: p, label: p }))}
            value={province}
            onChange={v => { setProvince(v); setCity('') }}
            emptyValue=""
            emptyLabel="All Provinces"
            placeholder="Search provinces…"
            icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            minWidth={120}
          />

          {/* City */}
          <SearchDropdown
            options={availableCities.map(c => ({ value: c, label: c }))}
            value={city}
            onChange={setCity}
            emptyValue=""
            emptyLabel="All Cities"
            placeholder="Search cities…"
            icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
            minWidth={110}
            disabled={!province || availableCities.length === 0}
          />

          {/* Time mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {TIME_MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setTimeMode(m.key)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                timeMode === m.key
                  ? 'bg-[#ed6055] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m.label}
            </button>
          ))}
          </div>
        </div>
      </div>


      {/* Summary pills */}
      {!loading && allProjects !== null && (floors.length > 0 || completions.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'M4 — Unit Completion',    actual: totals.m4Actual, planned: totals.m4PlannedToday, total: totals.m4Total, rate: totals.m4Rate, status: totals.m4Status },
            { label: 'M5 — Handover to PMO', actual: totals.m5Actual, planned: totals.m5PlannedToday, total: totals.m5Total, rate: totals.m5Rate, status: totals.m5Status },
          ].map(({ label, actual, planned, total, rate, status }) => (
            <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-1.5">{label}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: M4_EXP }} />
                      <span className="text-xs text-gray-400 font-medium">Planned</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: M4_ACT }} />
                      <span className="text-xs text-gray-400 font-medium">Actual</span>
                    </div>
                  </div>
                </div>
                {status !== null ? (
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${
                      status === 'ahead'    ? 'bg-green-100 text-green-700 border border-green-200' :
                      status === 'on-track' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                             'bg-red-100 text-red-600 border border-red-200'
                    }`}
                  >
                    {rate}% &bull; {status === 'ahead' ? 'Ahead' : status === 'on-track' ? 'On Track' : 'Delayed'}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic flex-shrink-0">no plan set</span>
                )}
              </div>
              {/* Three stats */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{planned.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-snug">Planned today</p>
                </div>
                <div className="border-l border-gray-200 pl-3">
                  <p className="text-xl font-bold text-green-600 leading-none">{actual.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-snug">Actual</p>
                </div>
                <div className="border-l border-gray-200 pl-3">
                  <p className="text-xl font-bold text-gray-400 leading-none">{total.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-snug">Total units</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {loading || allProjects === null ? (
        <TriangleLoader label="Loading chart data…" />
      ) : floors.length === 0 && completions.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400 italic">
          No unit completion data recorded yet.
        </div>
      ) : (
        <div>
          <div className="grid lg:grid-cols-2 gap-4">
            {/* M4 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">M4</span>
                <span className="text-xs text-gray-400">Unit Completion</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="flex">
                {/* Fixed Y-axis */}
                <div style={{ width: 45, flexShrink: 0 }}>
                  <ResponsiveContainer width={45} height={240}>
                    <BarChart data={chartData} margin={{ top: 4, right: 0, left: -10, bottom: 36 }}>
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Bar dataKey="m4Expected" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="m4Actual"   fill="transparent" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Scrollable bars */}
                <div className="overflow-x-auto flex-1" ref={m4Ref}>
                  <div style={{ width: chartWidthPct }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="label" tick={<CustomXTick />} interval={0} height={36} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(237, 96, 85, 0.08)' }} />
                        <Bar dataKey="m4Expected" name="Planned" fill={M4_EXP} radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="m4Actual"   name="Actual"   fill={M4_ACT} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* M5 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">M5</span>
                <span className="text-xs text-gray-400">Handover to PMO</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="flex">
                {/* Fixed Y-axis */}
                <div style={{ width: 45, flexShrink: 0 }}>
                  <ResponsiveContainer width={45} height={240}>
                    <BarChart data={chartData} margin={{ top: 4, right: 0, left: -10, bottom: 36 }}>
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Bar dataKey="m5Expected" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="m5Actual"   fill="transparent" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Scrollable bars */}
                <div className="overflow-x-auto flex-1" ref={m5Ref}>
                  <div style={{ width: chartWidthPct }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="label" tick={<CustomXTick />} interval={0} height={36} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(237, 96, 85, 0.08)' }} />
                        <Bar dataKey="m5Expected" name="Planned" fill={M5_EXP} radius={[3, 3, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="m5Actual"   name="Actual"   fill={M5_ACT} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </section>
  )
}
