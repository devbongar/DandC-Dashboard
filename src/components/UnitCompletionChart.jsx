import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { PH_PROVINCES, PH_CITIES } from '../lib/philippinesLocations'

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

  useEffect(() => {
    const load = async () => {
      if (allProjects === null) return
      setLoading(true)

      const filteredIds = allProjects
        .filter(p => is4ph === 'all' || (is4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project))
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
  }, [allProjects, is4ph, province, city])

  // Available years derived from data
  const availableYears = useMemo(() => {
    const years = extractYears(floors, completions)
    return years.length ? years : [new Date().getFullYear()]
  }, [floors, completions])

  const chartData = useMemo(
    () => buildChartData(floors, completions, timeMode, availableYears),
    [floors, completions, timeMode, availableYears],
  )

  // Min visible periods per screen: 12 months, 4 quarters, or 3 years
  const minVisible = timeMode === 'monthly' ? 12 : timeMode === 'quarterly' ? 4 : 3
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
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-2 flex flex-col">
      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 rounded-full bg-[#ed6055]" />
        <h2 className="text-sm font-bold text-black">Unit Completion Overview</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* 4PH */}
        <select
          value={is4ph}
          onChange={e => setIs4ph(e.target.value)}
          className={selectCls}
        >
          <option value="all">All Projects</option>
          <option value="yes">4PH Only</option>
          <option value="no">Non-4PH</option>
        </select>

        {/* Province */}
        <select
          value={province}
          onChange={e => { setProvince(e.target.value); setCity('') }}
          className={selectCls}
        >
          <option value="">All Provinces</option>
          {PH_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* City */}
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          disabled={!province}
          className={`${selectCls} ${!province ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">All Cities</option>
          {(PH_CITIES[province] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>

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

      {/* Charts */}
      {loading || allProjects === null ? (
        <div className="py-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 12, height: 12, background: '#ed6055', clipPath: 'polygon(0 0, 100% 50%, 0 100%)', animation: 'ph1-loader-tri 1.4s ease-in-out infinite', animationDelay: `${i * 0.22}s` }} />
            ))}
          </div>
          <p className="text-xs text-gray-400">Loading chart data…</p>
        </div>
      ) : floors.length === 0 && completions.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400 italic">
          No unit completion data recorded yet.
        </div>
      ) : (
        <div>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* M4 */}
            <div>
              <div className="flex items-center gap-2 mb-1 bg-[#ed6055]/10 border border-[#ed6055]/20 rounded-lg px-3 py-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: '#ed6055' }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ed6055' }}>M4 — Unit Completion</p>
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
              <div className="flex items-center gap-2 mb-1 bg-[#ed6055]/10 border border-[#ed6055]/20 rounded-lg px-3 py-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: '#ed6055' }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ed6055' }}>M5 — Handover Completion</p>
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

          {/* Shared legend */}
          <div className="flex items-center justify-center gap-8 mt-3 bg-gray-50 border border-gray-100 rounded-lg py-2.5 px-8 w-fit mx-auto">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: M4_EXP }} />
              <span className="text-xs text-gray-500 font-medium">Planned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: M4_ACT }} />
              <span className="text-xs text-gray-500 font-medium">Actual</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
