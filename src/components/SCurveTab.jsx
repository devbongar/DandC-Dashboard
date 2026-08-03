import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { buildAllPeriods, computeChartData, parsePeriodDate, detectConflicts, formatPeriod, getScopeConfig } from '../lib/scurveUtils'
import { downloadWorkbook, downloadBaselineTemplate, downloadActualTemplate, parseWorkbook, toFloat } from '../lib/excelUtils'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

const COL_W   = 80
const LABEL_W = 160

const BASELINE_COLORS = ['#9ca3af', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4']

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const THIS_YEAR   = new Date().getFullYear()
const YEARS       = Array.from({ length: 11 }, (_, i) => THIS_YEAR - 3 + i)

function MonthYearPicker({ value, onChange, min, max }) {
  const [selMonth, setSelMonth] = useState('')
  const [selYear,  setSelYear]  = useState('')

  useEffect(() => {
    if (value) { const [y, m] = value.split('-'); setSelYear(y); setSelMonth(m) }
    else { setSelYear(''); setSelMonth('') }
  }, [value])

  const handleChange = (month, year) => {
    if (month && year) onChange(`${year}-${month}`)
    else onChange('')
  }

  const cls = "px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white cursor-pointer"
  return (
    <div className="flex items-center gap-1">
      <select value={selMonth} onChange={e => { setSelMonth(e.target.value); handleChange(e.target.value, selYear) }} className={cls}>
        <option value="">(Month)</option>
        {MONTH_NAMES.map((name, i) => {
          const m = String(i + 1).padStart(2, '0')
          const ym = selYear ? `${selYear}-${m}` : null
          const disabled = (min && ym && ym < min) || (max && ym && ym > max)
          return <option key={m} value={m} disabled={!!disabled}>{name}</option>
        })}
      </select>
      <select value={selYear} onChange={e => { setSelYear(e.target.value); handleChange(selMonth, e.target.value) }} className={cls}>
        <option value="">(Year)</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}

function diagnoseBaselineExcel(wb) {
  const sheetNames = Object.keys(wb)
  const sheet      = wb['Baseline Data'] ?? Object.values(wb)[0] ?? []
  const usedSheet  = wb['Baseline Data'] ? 'Baseline Data' : (sheetNames[0] ?? '(none)')

  if (sheet.length === 0)
    return `Sheet "${usedSheet}" is empty. Sheets found: ${sheetNames.join(', ')}`

  const keys       = Object.keys(sheet[0] ?? {})
  const hasPeriod  = keys.some(k => ['Period', 'Period (locked)', 'period'].includes(k))
  const hasPlanned = keys.some(k => ['Planned %', 'planned_pct', 'planned'].includes(k))

  if (!hasPeriod || !hasPlanned) {
    const missing = [...(!hasPeriod ? ['"Period"'] : []), ...(!hasPlanned ? ['"Planned %"'] : [])]
    return `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Columns found: ${keys.map(k => `"${k}"`).join(', ')}`
  }

  const samples = sheet.slice(0, 5).map(row => {
    const raw    = row['Period'] ?? row['Period (locked)'] ?? row['period']
    const parsed = parsePeriodDate(String(raw ?? ''))
    return `"${raw}" → ${parsed ?? 'unrecognized'}`
  })
  return `Period format not recognized. Samples: ${samples.join(' | ')}. Use m/d/yyyy (e.g. 1/1/2026).`
}

function parseBaselineExcel(wb) {
  const sheet = wb['Baseline Data'] ?? Object.values(wb)[0] ?? []
  const parsed = sheet
    .map(row => {
      const period_date = parsePeriodDate(row['Period'] ?? row['Period (locked)'] ?? row['period'])
      const planned_pct = toFloat(row['Planned %'] ?? row['planned_pct'] ?? row['planned'])
      return period_date ? { period_date, planned_pct } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.period_date.localeCompare(b.period_date))

  // Input is cumulative — convert to periodic increments for storage
  let prevCum = 0
  return parsed.map(r => {
    const cum      = r.planned_pct ?? 0
    const periodic = Math.max(0, cum - prevCum)
    prevCum        = cum
    return { ...r, planned_pct: periodic }
  })
}

function parseActualExcel(wb) {
  const sheet = wb['Actual Data'] ?? wb['Baseline Data'] ?? Object.values(wb)[0] ?? []
  const parsed = sheet
    .map(row => {
      const period_date = parsePeriodDate(row['Period'] ?? row['Period (locked)'] ?? row['period'])
      const actual_pct  = toFloat(row['Actual %'] ?? row['actual_pct'] ?? row['actual'])
      return period_date && actual_pct !== null ? { period_date, actual_pct } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.period_date.localeCompare(b.period_date))

  // Input is cumulative — convert to periodic increments for storage
  let prevCum = 0
  return parsed.map(r => {
    const cum      = r.actual_pct ?? 0
    const periodic = Math.max(0, cum - prevCum)
    prevCum        = cum
    return { ...r, actual_pct: periodic }
  })
}

function NewBaselineForm({ actuals, onSave, onCancel }) {
  const [name,         setName]         = useState('')
  const [cutoffDate,   setCutoffDate]   = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [importedRows, setImportedRows] = useState(null)
  const [importing,    setImporting]    = useState(false)
  const fileRef = useRef(null)

  const pastCount = actuals.filter(a => a.period_date.slice(0, 7) <= cutoffDate).length

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const wb   = await parseWorkbook(file)
      const rows = parseBaselineExcel(wb)
      setImportedRows(rows.length > 0 ? rows : null)
      if (rows.length === 0) alert('Import failed: ' + diagnoseBaselineExcel(wb))
    } catch {
      alert('Failed to read file.')
    }
    setImporting(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name:         name.trim(),
      cutoff_date:  cutoffDate ? cutoffDate + '-01' : null,
      notes:        notes.trim() || null,
      importedRows: importedRows ?? null,
    })
    setSaving(false)
  }

  const inputCls = "w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ed6055]"

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-xs font-bold text-gray-700">New Baseline</p>
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-40">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-1">Name *</label>
          <input type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Original Baseline, Revision 1" className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-1">
            Cutoff Date <span className="normal-case font-normal">(re-baseline only)</span>
          </label>
          <input type="month" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ed6055]" />
          {cutoffDate && !importedRows && (
            <p className="text-[10px] text-gray-500 mt-1">
              Will copy {pastCount} actual period{pastCount !== 1 ? 's' : ''} as planned %
            </p>
          )}
        </div>
        <div className="flex-1 min-w-40">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-1">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional" className={inputCls} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition disabled:opacity-50">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
          </svg>
          {importing ? 'Reading…' : 'Import from Excel'}
        </button>
        {importedRows && (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            ✓ {importedRows.length} periods loaded
            <button type="button" onClick={() => setImportedRows(null)}
              className="text-gray-400 hover:text-[#ed6055] ml-1 font-bold">✕</button>
          </span>
        )}
        <button type="button" onClick={downloadBaselineTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Template
        </button>
        <span className="text-[10px] text-gray-400">Columns: "Period", "Planned %"</span>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving || !name.trim()}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#ed6055] text-white hover:bg-[#c94f45] transition disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Baseline'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition">
          Cancel
        </button>
      </div>
    </form>
  )
}

function BaselineMultiSelect({ baselines, selectedIds, onChange, colors }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = id => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id))
    else onChange([...selectedIds, id])
  }

  const label = selectedIds.length === 0
    ? 'Select baselines…'
    : selectedIds.length === 1
      ? (baselines.find(b => b.id === selectedIds[0])?.name ?? 'Baseline')
      : `${selectedIds.length} baselines selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-[#ed6055] transition min-w-52"
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {selectedIds.map((id, i) => (
            <span key={id} className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors[i % colors.length] }} />
          ))}
          <span className="truncate ml-1">{label}</span>
        </div>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-52">
          {baselines.length === 0 ? (
            <p className="px-4 py-2 text-xs text-gray-400">No baselines yet</p>
          ) : baselines.map((b, i) => {
            const checked = selectedIds.includes(b.id)
            const color = colors[i % colors.length]
            return (
              <button key={b.id} type="button" onClick={() => toggle(b.id)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition text-left">
                <span className="w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center"
                  style={checked ? { backgroundColor: color, borderColor: color } : { borderColor: '#d1d5db' }}>
                  {checked && (
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                  )}
                </span>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="flex-1 truncate">{b.name}</span>
                {b.cutoff_date && <span className="text-gray-400 text-[10px] whitespace-nowrap">re-baseline</span>}
              </button>
            )
          })}
          {selectedIds.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button type="button" onClick={() => { onChange([]); setOpen(false) }}
                className="w-full text-left px-4 py-1.5 text-xs text-gray-400 hover:text-[#ed6055] transition">
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const PHASE_LABELS = {
  initiation:           'Initiation',
  planning:             'Planning',
  execution_monitoring: 'Execution & Monitoring',
  closeout:             'Closeout',
}

function ActivityMultiSelect({ milestones, selectedIds, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = id => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id))
    else onChange([...selectedIds, id])
  }

  const triggerLabel = selectedIds.length === 0
    ? 'Activities…'
    : selectedIds.length === 1
      ? (milestones.find(m => m.id === selectedIds[0])?.milestone_name ?? 'Activity')
      : `${selectedIds.length} activities`

  const phases = ['initiation', 'planning', 'execution_monitoring', 'closeout']
  const grouped = phases
    .map(phase => ({ phase, items: milestones.filter(m => m.phase === phase) }))
    .filter(g => g.items.length > 0)

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-indigo-400 transition min-w-36"
      >
        <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="truncate flex-1 text-left">{triggerLabel}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-64 max-h-72 overflow-y-auto">
          {grouped.length === 0 ? (
            <p className="px-4 py-2 text-xs text-gray-400">No work program activities with dates</p>
          ) : grouped.map(({ phase, items }) => (
            <div key={phase}>
              <div className="px-4 py-1.5 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100 sticky top-0">
                {PHASE_LABELS[phase] ?? phase}
              </div>
              {items.map(m => {
                const checked = selectedIds.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggle(m.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-700 hover:bg-indigo-50 transition text-left">
                    <span className="w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center"
                      style={checked ? { backgroundColor: '#6366f1', borderColor: '#6366f1' } : { borderColor: '#d1d5db' }}>
                      {checked && (
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">{m.milestone_name}</span>
                    {m.planned_start && (
                      <span className="text-gray-400 whitespace-nowrap font-mono">{m.planned_start.slice(0, 7)}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          {selectedIds.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button type="button" onClick={() => { onChange([]); setOpen(false) }}
                className="w-full text-left px-4 py-1.5 text-xs text-gray-400 hover:text-indigo-500 transition">
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityRefLabel({ viewBox, name, yOffset = 0 }) {
  const { x, y, height } = viewBox
  const tx = x + 3
  const ty = y + height - 10 - yOffset
  const displayName = name.length > 24 ? name.slice(0, 22) + '…' : name
  return (
    <g>
      <text
        x={tx} y={ty}
        fill="#6366f1"
        fontSize={9}
        fontWeight="600"
        textAnchor="start"
        transform={`rotate(-90, ${tx}, ${ty})`}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {displayName}
      </text>
    </g>
  )
}

export default function SCurveTab({ project, isAdmin, canEdit }) {
  const [baselines,            setBaselines]            = useState([])
  const [selectedBaselineIds,  setSelectedBaselineIds]  = useState([])
  const [baselineDataMap,      setBaselineDataMap]      = useState({}) // id → rows[]
  const [actuals,              setActuals]              = useState([])
  const [forecasts,            setForecasts]            = useState([])
  const [loading,              setLoading]              = useState(true)
  const [viewMode,             setViewMode]             = useState('monthly')
  const [editCell,             setEditCell]             = useState(null) // { period_date, type, baselineId? }
  const [editValue,            setEditValue]            = useState('')
  const [saving,               setSaving]               = useState(false)
  const [toast,                setToast]                = useState(null)
  const [showNewBaseline,      setShowNewBaseline]      = useState(false)
  const [importConflict,       setImportConflict]       = useState(null)
  const [showDownloadPicker,   setShowDownloadPicker]   = useState(false)
  const [downloading,          setDownloading]          = useState(false)
  const [importingExisting,    setImportingExisting]    = useState(false)
  const [importingActual,      setImportingActual]      = useState(false)
  const [milestones,           setMilestones]           = useState([])
  const [selectedActivityIds,  setSelectedActivityIds]  = useState([])
  const [buildings,            setBuildings]            = useState([])
  const [selectedBuildingId,   setSelectedBuildingId]   = useState(null) // null = project level
  const [scopeOpen,            setScopeOpen]            = useState(false)
  const [settingsOpen,         setSettingsOpen]         = useState(false)
  const scopeRef = useRef(null)
  const existingImportRef = useRef(null)
  const actualImportRef = useRef(null)

  const dateRangeKey = `scurve_dateRange_${project.id}`
  const [fromMonth, setFromMonthRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dateRangeKey))?.from ?? '' } catch { return '' }
  })
  const [toMonth, setToMonthRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dateRangeKey))?.to ?? '' } catch { return '' }
  })
  const setFromMonth = v => {
    setFromMonthRaw(v)
    try { localStorage.setItem(dateRangeKey, JSON.stringify({ from: v, to: toMonth })) } catch {}
  }
  const setToMonth = v => {
    setToMonthRaw(v)
    try { localStorage.setItem(dateRangeKey, JSON.stringify({ from: fromMonth, to: v })) } catch {}
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Primary baseline = first selected (target for import / add month)
  const primaryBaselineId = selectedBaselineIds[0] ?? null

  const load = async (buildingId = selectedBuildingId) => {
    setLoading(true)
    const { actualTable, forecastTable, scopeFilter } = getScopeConfig(buildingId)
    const [{ data: bl }, { data: bldgs }, actsRes, forsRes] = await Promise.all([
      supabase.from('project_scurve_baselines').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('project_buildings').select('id, name, sort_order').eq('project_id', project.id).order('sort_order'),
      scopeFilter
        ? supabase.from(actualTable).select('*').eq('project_id', project.id).eq('building_id', scopeFilter.building_id).order('period_date')
        : supabase.from(actualTable).select('*').eq('project_id', project.id).order('period_date'),
      scopeFilter
        ? supabase.from(forecastTable).select('*').eq('project_id', project.id).eq('building_id', scopeFilter.building_id).order('period_date')
        : supabase.from(forecastTable).select('*').eq('project_id', project.id).order('period_date'),
    ])
    const bls = bl ?? []
    setBaselines(bls)
    setBuildings(bldgs ?? [])
    setActuals(actsRes.data ?? [])
    setForecasts(forsRes.data ?? [])
    setSelectedBaselineIds(prev => prev.length > 0 ? prev : (bls[0] ? [bls[0].id] : []))
    setLoading(false)
  }

  useEffect(() => { load(null) }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchScope = (buildingId) => {
    setSelectedBuildingId(buildingId)
    setActuals([])
    setForecasts([])
    setBaselineDataMap({})
    load(buildingId)
  }

  // Fetch work program milestones from latest confirmed milestone baseline
  useEffect(() => {
    const fetchMilestones = async () => {
      const { data: mbl } = await supabase
        .from('milestone_baselines')
        .select('id')
        .eq('project_id', project.id)
        .order('confirmed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!mbl) { setMilestones([]); return }
      const { data: ms } = await supabase
        .from('project_milestones')
        .select('id, milestone_name, phase, planned_start')
        .eq('project_id', project.id)
        .eq('baseline_id', mbl.id)
        .not('planned_start', 'is', null)
        .order('planned_start')
      setMilestones(ms ?? [])
    }
    fetchMilestones()
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load baseline data whenever selection or scope changes
  useEffect(() => {
    if (!selectedBaselineIds.length) { setBaselineDataMap({}); return }
    const { baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)
    Promise.all(
      selectedBaselineIds.map(id => {
        let q = supabase.from(baselineTable).select('*').eq('baseline_id', id)
        if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
        return q.order('period_date').then(({ data }) => [id, data ?? []])
      })
    ).then(entries => setBaselineDataMap(Object.fromEntries(entries)))
  }, [JSON.stringify(selectedBaselineIds), selectedBuildingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const baselineMaps = useMemo(() => {
    const result = {}
    for (const [id, data] of Object.entries(baselineDataMap)) {
      result[id] = Object.fromEntries(data.map(r => [r.period_date, r]))
    }
    return result
  }, [baselineDataMap])

  const actualMap   = useMemo(() => Object.fromEntries(actuals.map(r => [r.period_date, r])),   [actuals])
  const forecastMap = useMemo(() => Object.fromEntries(forecasts.map(r => [r.period_date, r])), [forecasts])

  const allPeriods = useMemo(() => {
    const allBd = Object.values(baselineDataMap).flat()
    return buildAllPeriods(allBd, actuals, forecasts)
  }, [baselineDataMap, actuals, forecasts])

  const filteredPeriods = useMemo(() => allPeriods.filter(p => {
    const ym = p.slice(0, 7)
    if (fromMonth && ym < fromMonth) return false
    if (toMonth   && ym > toMonth)   return false
    return true
  }), [allPeriods, fromMonth, toMonth])

  // chartData: { period, actual, forecast, bl_<id>, _date } per period
  const chartData = useMemo(() => {
    if (!allPeriods.length) return []
    // Compute actual + forecast (baseline-independent)
    const afSeries = computeChartData(allPeriods, [], actuals, forecasts)
    // Compute cumulative per selected baseline
    const blSeriesMaps = {}
    for (const id of selectedBaselineIds) {
      const series = computeChartData(allPeriods, baselineDataMap[id] ?? [], [], [])
      blSeriesMaps[id] = Object.fromEntries(series.map(s => [s._date, s.baseline]))
    }
    return afSeries.map((af, i) => {
      const p = allPeriods[i]
      const point = { period: af.period, actual: af.actual, forecast: af.forecast, _date: p }
      for (const id of selectedBaselineIds) {
        point[`bl_${id}`] = blSeriesMaps[id]?.[p] ?? null
      }
      return point
    })
  }, [allPeriods, baselineDataMap, actuals, forecasts, selectedBaselineIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBaseline = async ({ name, cutoff_date, notes, importedRows }) => {
    const { data: bl, error } = await supabase
      .from('project_scurve_baselines')
      .insert({ project_id: project.id, name, cutoff_date, notes })
      .select().single()
    if (error) { showToast(error.message, 'error'); return }

    const { baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)
    if (importedRows?.length > 0) {
      await supabase.from(baselineTable).insert(
        importedRows.map(r => ({ baseline_id: bl.id, period_date: r.period_date, planned_pct: r.planned_pct, ...(scopeFilter ?? {}) }))
      )
    } else if (cutoff_date) {
      const past = actuals.filter(a => a.period_date.slice(0, 7) <= cutoff_date.slice(0, 7))
      if (past.length > 0) {
        await supabase.from(baselineTable).insert(
          past.map(a => ({ baseline_id: bl.id, period_date: a.period_date, planned_pct: a.actual_pct, ...(scopeFilter ?? {}) }))
        )
      }
    }

    setShowNewBaseline(false)
    showToast('Baseline created')
    // Refresh baselines list, then add new ID to selection (triggers data load via useEffect)
    const { data: bls } = await supabase.from('project_scurve_baselines').select('*').eq('project_id', project.id).order('created_at')
    setBaselines(bls ?? [])
    setSelectedBaselineIds(prev => [...prev, bl.id])
  }

  const handleDownloadBaseline = async (baselineId) => {
    setDownloading(true)
    setShowDownloadPicker(false)
    const { baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)
    const bl = baselines.find(b => b.id === baselineId)
    let q = supabase.from(baselineTable).select('period_date, planned_pct').eq('baseline_id', baselineId)
    if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
    const { data: rows } = await q.order('period_date')
    let cumSum = 0
    const data = (rows ?? []).map(r => {
      cumSum = Math.min(100, cumSum + (r.planned_pct ?? 0))
      const d = new Date(r.period_date + 'T00:00:00')
      return { period: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`, planned: cumSum || '' }
    })
    downloadWorkbook(
      [{
        sheetName: 'Baseline Data',
        columns: [
          { key: 'period',  header: 'Period' },
          { key: 'planned', header: 'Planned %' },
        ],
        rows: data,
        lockedCells: data.map(() => [1]),
      }],
      `baseline-${bl?.name ?? baselineId}-${new Date().toISOString().slice(0, 10)}.xlsx`
    )
    setDownloading(false)
  }

  const handleImportExisting = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !primaryBaselineId) return
    const targetId = primaryBaselineId
    e.target.value = ''
    setImportingExisting(true)
    try {
      const wb      = await parseWorkbook(file)
      const parsed  = parseBaselineExcel(wb)
      if (!parsed.length) { showToast('Import failed: ' + diagnoseBaselineExcel(wb), 'error'); setImportingExisting(false); return }
      const pBMap = baselineMaps[targetId] ?? {}
      const { conflicts, newRows } = detectConflicts(parsed, pBMap)
      if (conflicts.length > 0) {
        setImportConflict({ conflicts, newRows, allRows: parsed, targetId })
      } else {
        await applyBaselineImport(newRows, [], targetId)
        showToast(`Imported ${newRows.length} periods`)
      }
    } catch {
      showToast('Failed to read file', 'error')
    }
    setImportingExisting(false)
  }

  const handleImportActual = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportingActual(true)
    try {
      const wb     = await parseWorkbook(file)
      const parsed = parseActualExcel(wb)
      if (!parsed.length) {
        showToast('Import failed: no valid rows found. Check "Period" and "Actual %" columns.', 'error')
        setImportingActual(false)
        return
      }
      const { actualTable, scopeFilter } = getScopeConfig(selectedBuildingId)
      const actualMap = Object.fromEntries(actuals.map(r => [r.period_date, r]))
      await Promise.all(parsed.map(r => {
        const insertRow = { project_id: project.id, period_date: r.period_date, actual_pct: r.actual_pct, ...(scopeFilter ?? {}) }
        const existing  = actualMap[r.period_date]
        return existing
          ? supabase.from(actualTable).update({ actual_pct: r.actual_pct, updated_at: new Date().toISOString() }).eq('id', existing.id)
          : supabase.from(actualTable).insert(insertRow)
      }))
      // Reload actuals
      let q = supabase.from(actualTable).select('*').eq('project_id', project.id)
      if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
      setActuals((await q.order('period_date')).data ?? [])
      showToast(`Imported ${parsed.length} actual periods`)
    } catch {
      showToast('Failed to read file', 'error')
    }
    setImportingActual(false)
  }

  const applyBaselineImport = async (newRows, overwriteRows, targetId) => {
    const { baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)
    const pBMap    = baselineMaps[targetId] ?? {}
    const toInsert = newRows.filter(r => !pBMap[r.period_date])
    const toUpdate = [...newRows.filter(r => pBMap[r.period_date]), ...overwriteRows]

    await Promise.all([
      toInsert.length > 0
        ? supabase.from(baselineTable).insert(
            toInsert.map(r => ({ baseline_id: targetId, period_date: r.period_date, planned_pct: r.planned_pct, ...(scopeFilter ?? {}) }))
          )
        : Promise.resolve(),
      ...toUpdate.map(r =>
        supabase.from(baselineTable).update({ planned_pct: r.planned_pct }).eq('id', pBMap[r.period_date].id)
      ),
    ])
    setImportConflict(null)
    let q = supabase.from(baselineTable).select('*').eq('baseline_id', targetId)
    if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
    const { data } = await q.order('period_date')
    setBaselineDataMap(prev => ({ ...prev, [targetId]: data ?? [] }))
  }

  const handleEdit = async (period_date, type) => {
    const numVal = parseFloat(editValue)
    if (isNaN(numVal) || numVal < 0 || numVal > 100) { showToast('Value must be 0–100', 'error'); return }
    setSaving(true)
    const { actualTable, forecastTable, baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)

    if (type === 'baseline') {
      const targetId = editCell.baselineId
      const bMap     = baselineMaps[targetId] ?? {}
      const existing = bMap[period_date]
      const insertRow = { baseline_id: targetId, period_date, planned_pct: numVal, ...(scopeFilter ?? {}) }
      const { error } = existing
        ? await supabase.from(baselineTable).update({ planned_pct: numVal }).eq('id', existing.id)
        : await supabase.from(baselineTable).insert(insertRow)
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      let q = supabase.from(baselineTable).select('*').eq('baseline_id', targetId)
      if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
      const { data } = await q.order('period_date')
      setBaselineDataMap(prev => ({ ...prev, [targetId]: data ?? [] }))
    } else if (type === 'actual') {
      const existing = actualMap[period_date]
      const insertRow = { project_id: project.id, period_date, actual_pct: numVal, ...(scopeFilter ?? {}) }
      const { error } = existing
        ? await supabase.from(actualTable).update({ actual_pct: numVal, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from(actualTable).insert(insertRow)
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      let q = supabase.from(actualTable).select('*').eq('project_id', project.id)
      if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
      setActuals((await q.order('period_date')).data ?? [])
    } else if (type === 'forecast') {
      const existing = forecastMap[period_date]
      const insertRow = { project_id: project.id, period_date, forecast_pct: numVal, ...(scopeFilter ?? {}) }
      const { error } = existing
        ? await supabase.from(forecastTable).update({ forecast_pct: numVal, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from(forecastTable).insert(insertRow)
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      let q = supabase.from(forecastTable).select('*').eq('project_id', project.id)
      if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
      setForecasts((await q.order('period_date')).data ?? [])
    }

    setSaving(false)
    setEditCell(null)
    setEditValue('')
    showToast('Saved')
  }

  const handleAddMonth = async () => {
    if (!primaryBaselineId) { showToast('Select a baseline first', 'error'); return }
    const primaryData = baselineDataMap[primaryBaselineId] ?? []
    const refPeriods = primaryData.length > 0 ? primaryData : allPeriods.map(p => ({ period_date: p }))
    let period_date
    if (refPeriods.length > 0) {
      const last = refPeriods[refPeriods.length - 1].period_date
      const d = new Date(last + 'T00:00:00')
      d.setMonth(d.getMonth() + 1)
      period_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    } else {
      const now = new Date()
      period_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    }
    const { baselineTable, scopeFilter } = getScopeConfig(selectedBuildingId)
    const { error } = await supabase.from(baselineTable)
      .insert({ baseline_id: primaryBaselineId, period_date, ...(scopeFilter ?? {}) })
    if (error) { showToast(error.message, 'error'); return }
    let q = supabase.from(baselineTable).select('*').eq('baseline_id', primaryBaselineId)
    if (scopeFilter) q = q.eq('building_id', scopeFilter.building_id)
    const { data } = await q.order('period_date')
    setBaselineDataMap(prev => ({ ...prev, [primaryBaselineId]: data ?? [] }))
  }

  const totalW = LABEL_W + COL_W * filteredPeriods.length

  const containerRef   = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const effectiveWidth = Math.max(totalW, containerWidth)

  // Chart + cumulative table: quarterly or monthly columns
  const displayColCount = useMemo(() => {
    if (viewMode !== 'quarterly' || !filteredPeriods.length) return filteredPeriods.length
    const qSet = new Set(filteredPeriods.map(p => {
      const d = new Date(p)
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
    }))
    return qSet.size
  }, [viewMode, filteredPeriods])

  const effectiveColW = displayColCount > 0
    ? (effectiveWidth - LABEL_W) / displayColCount
    : COL_W



  const primaryBaseline = baselines.find(b => b.id === primaryBaselineId)

  // One row per selected baseline + Actual + Forecast
  const INPUT_ROWS = [
    ...selectedBaselineIds.map((id, i) => ({
      label:      baselines.find(b => b.id === id)?.name ?? 'Baseline',
      type:       'baseline',
      baselineId: id,
      color:      BASELINE_COLORS[i % BASELINE_COLORS.length],
      bg:         '#ffffff',
      adminOnly:  true,
    })),
    { label: 'Actual',   type: 'actual',   baselineId: null, color: '#86efac', bg: '#fafbfc', adminOnly: false },
    { label: 'Forecast', type: 'forecast', baselineId: null, color: '#fde047', bg: '#ffffff', adminOnly: false },
  ]

  const CUMULATIVE_ROWS = [
    ...selectedBaselineIds.map((id, i) => ({
      label: baselines.find(b => b.id === id)?.name ?? 'Baseline',
      key:   `bl_${id}`,
      color: BASELINE_COLORS[i % BASELINE_COLORS.length],
      bg:    '#ffffff',
    })),
    { label: 'Actual',   key: 'actual',   color: '#86efac', bg: '#fafbfc' },
    { label: 'Forecast', key: 'forecast', color: '#fde047', bg: '#ffffff' },
  ]

  return (
    <div ref={containerRef} className="py-4 sm:py-5 space-y-3">

      {/* Toolbar: scope + baseline + settings */}
      <div className="flex items-center gap-3 flex-wrap">
        {buildings.length > 0 && (() => {
          const scopeLabel = selectedBuildingId
            ? (buildings.find(b => b.id === selectedBuildingId)?.name ?? 'Tower')
            : 'Project'
          const isProject = selectedBuildingId === null
          return (
            <div ref={scopeRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setScopeOpen(v => !v)
                  const handler = e => { if (scopeRef.current && !scopeRef.current.contains(e.target)) setScopeOpen(false) }
                  document.addEventListener('mousedown', handler, { once: true })
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition min-w-36"
                style={isProject
                  ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff', borderColor: 'transparent' }
                  : { background: '#fff', color: '#374151', borderColor: '#e5e7eb' }}
              >
                <span className="flex-1 text-left truncate">{scopeLabel}</span>
                <svg className="w-3 h-3 flex-shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {scopeOpen && (
                <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-44 max-h-64 overflow-y-auto">
                  <button type="button"
                    onClick={() => { switchScope(null); setScopeOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-xs font-semibold transition flex items-center gap-2 ${selectedBuildingId === null ? 'text-[#ed6055]' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {selectedBuildingId === null && <span className="w-1.5 h-1.5 rounded-full bg-[#ed6055] flex-shrink-0" />}
                    Project
                  </button>
                  {buildings.length > 0 && <div className="border-t border-gray-100 my-1" />}
                  {buildings.map(b => (
                    <button key={b.id} type="button"
                      onClick={() => { switchScope(b.id); setScopeOpen(false) }}
                      className={`w-full text-left px-4 py-2 text-xs transition flex items-center gap-2 ${selectedBuildingId === b.id ? 'text-[#ed6055] font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {selectedBuildingId === b.id && <span className="w-1.5 h-1.5 rounded-full bg-[#ed6055] flex-shrink-0" />}
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
        <BaselineMultiSelect
          baselines={baselines}
          selectedIds={selectedBaselineIds}
          onChange={setSelectedBaselineIds}
          colors={BASELINE_COLORS}
        />
        <input ref={existingImportRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={handleImportExisting} className="hidden" />
        <input ref={actualImportRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={handleImportActual} className="hidden" />
        {(() => {
          const hasActiveFilters = !!(fromMonth || toMonth || selectedActivityIds.length > 0)
          return (
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${settingsOpen ? 'border-[#ed6055] text-[#ed6055] bg-red-50' : 'border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055]'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
              {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[#ed6055] flex-shrink-0" />}
            </button>
          )
        })()}
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          {/* View controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Display</span>
            {['monthly', 'quarterly'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition capitalize"
                style={viewMode === mode
                  ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff' }
                  : { background: '#e5e7eb', color: '#6b7280' }}
              >{mode}</button>
            ))}
            {milestones.length > 0 && (
              <ActivityMultiSelect
                milestones={milestones}
                selectedIds={selectedActivityIds}
                onChange={setSelectedActivityIds}
              />
            )}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">From</span>
              <MonthYearPicker value={fromMonth} onChange={setFromMonth} max={toMonth} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">To</span>
              <MonthYearPicker value={toMonth} onChange={setToMonth} min={fromMonth} />
              {(fromMonth || toMonth) && (
                <button onClick={() => { setFromMonth(''); setToMonth('') }}
                  className="text-xs text-gray-400 hover:text-[#ed6055] transition font-medium">
                  Clear
                </button>
              )}
            </div>
          </div>
          {/* Data actions row (admin) */}
          {(isAdmin || baselines.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap border-t border-gray-200 pt-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Data</span>
              {isAdmin && (
                <button
                  onClick={() => setShowNewBaseline(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition"
                >
                  + New Baseline
                </button>
              )}
              {isAdmin && primaryBaselineId && (
                <>
                  <button
                    onClick={() => existingImportRef.current?.click()}
                    disabled={importingExisting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    {importingExisting ? 'Reading…' : 'Import'}
                  </button>
                  <button
                    onClick={downloadBaselineTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Template
                  </button>
                  {selectedBaselineIds.length > 1 && (
                    <span className="text-[10px] text-gray-400 bg-white border border-gray-200 px-2 py-1 rounded-full">
                      Import/Add Month applies to: {primaryBaseline?.name}
                    </span>
                  )}
                </>
              )}
              {canEdit && (
                <>
                  <button
                    onClick={() => actualImportRef.current?.click()}
                    disabled={importingActual}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    {importingActual ? 'Reading…' : 'Import Actual'}
                  </button>
                  <button
                    onClick={downloadActualTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Actual Template
                  </button>
                </>
              )}
              {baselines.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowDownloadPicker(v => !v)}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {downloading ? 'Downloading…' : 'Download Baseline'}
                  </button>
                  {showDownloadPicker && (
                    <div className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-48">
                      {baselines.map(b => (
                        <button key={b.id} onClick={() => handleDownloadBaseline(b.id)}
                          className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-[#ed6055] transition">
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {primaryBaseline?.cutoff_date && (
                <span className="text-[10px] text-gray-400 bg-white border border-gray-200 px-2 py-1 rounded-full">
                  Re-baseline · cutoff {primaryBaseline.cutoff_date.slice(0, 7)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* New baseline form */}
      {showNewBaseline && isAdmin && (
        <NewBaselineForm
          actuals={actuals}
          onSave={handleCreateBaseline}
          onCancel={() => setShowNewBaseline(false)}
        />
      )}

      {/* Conflict resolution panel */}
      {importConflict && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-bold text-amber-800">
            Import conflicts — {importConflict.conflicts.length} period{importConflict.conflicts.length !== 1 ? 's' : ''} already have data
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {importConflict.conflicts.map(c => (
              <div key={c.period_date} className="flex items-center gap-3 text-xs text-amber-700">
                <span className="font-semibold w-16">{c.period_date.slice(0, 7)}</span>
                <span className="text-amber-500">existing: {c.existing_pct}%</span>
                <span className="text-amber-800">new: {c.planned_pct}%</span>
              </div>
            ))}
          </div>
          {importConflict.newRows.length > 0 && (
            <p className="text-[10px] text-amber-600">
              + {importConflict.newRows.length} new period{importConflict.newRows.length !== 1 ? 's' : ''} will be added regardless
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={async () => {
                await applyBaselineImport(importConflict.newRows, importConflict.conflicts, importConflict.targetId)
                showToast(`Imported ${importConflict.allRows.length} periods (conflicts overwritten)`)
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition">
              Overwrite conflicts
            </button>
            <button
              onClick={async () => {
                await applyBaselineImport(importConflict.newRows, [], importConflict.targetId)
                showToast(`Imported ${importConflict.newRows.length} new periods (conflicts skipped)`)
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition">
              Skip conflicts
            </button>
            <button
              onClick={() => setImportConflict(null)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Chart + tables */}
      {allPeriods.length > 0 && (() => {
        const chartDataByDate = Object.fromEntries(chartData.map(d => [d._date, d]))
        const combinedData    = filteredPeriods.map(p => {
          if (chartDataByDate[p]) return chartDataByDate[p]
          const point = { period: formatPeriod(p), actual: null, forecast: null, _date: p }
          for (const id of selectedBaselineIds) point[`bl_${id}`] = null
          return point
        })
        const hasChartData = chartData.some(d =>
          d.actual != null || d.forecast != null ||
          selectedBaselineIds.some(id => d[`bl_${id}`] != null)
        )

        // Aggregate monthly → quarterly (last non-null cumulative value per series per quarter)
        const quarterMap = new Map()
        combinedData.forEach(d => {
          const dObj = new Date(d._date)
          const q    = Math.floor(dObj.getMonth() / 3) + 1
          const year = dObj.getFullYear()
          const qk   = `${year}-Q${q}`
          if (!quarterMap.has(qk)) {
            const pt = { period: `Q${q} '${String(year).slice(2)}`, _date: d._date, actual: null, forecast: null }
            for (const id of selectedBaselineIds) pt[`bl_${id}`] = null
            quarterMap.set(qk, pt)
          }
          const pt = quarterMap.get(qk)
          if (d.actual   != null) pt.actual   = d.actual
          if (d.forecast != null) pt.forecast = d.forecast
          for (const id of selectedBaselineIds) {
            if (d[`bl_${id}`] != null) pt[`bl_${id}`] = d[`bl_${id}`]
          }
        })
        const displayData = viewMode === 'quarterly' ? [...quarterMap.values()] : combinedData

        // Quarterly grouping for Periodic % table (sum of monthly increments per quarter)
        const periodicQMap = new Map()
        filteredPeriods.forEach(p => {
          const dObj = new Date(p)
          const q    = Math.floor(dObj.getMonth() / 3) + 1
          const year = dObj.getFullYear()
          const qk   = `${year}-Q${q}`
          if (!periodicQMap.has(qk)) periodicQMap.set(qk, { qKey: qk, months: [] })
          periodicQMap.get(qk).months.push(p)
        })
        const periodicGroups = viewMode === 'quarterly' ? [...periodicQMap.values()] : null

        // Map selected activities to their chart period label for ReferenceLine
        const activityMarkers = (() => {
          const slotsByPeriod = new Map()
          return milestones
            .filter(m => selectedActivityIds.includes(m.id) && m.planned_start)
            .map(m => {
              let periodLabel = null
              if (viewMode === 'quarterly') {
                const d    = new Date(m.planned_start)
                const q    = Math.floor(d.getMonth() / 3) + 1
                const year = d.getFullYear()
                const lbl  = `Q${q} '${String(year).slice(2)}`
                if (displayData.some(pt => pt.period === lbl)) periodLabel = lbl
              } else {
                const monthStr = m.planned_start.slice(0, 7) + '-01'
                if (filteredPeriods.includes(monthStr)) periodLabel = formatPeriod(monthStr)
              }
              if (!periodLabel) return null
              const slot = slotsByPeriod.get(periodLabel) ?? 0
              slotsByPeriod.set(periodLabel, slot + 1)
              return { id: m.id, name: m.milestone_name, periodLabel, yOffset: slot * 38 }
            })
            .filter(Boolean)
        })()

        return (
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Legend */}
            <div className="flex items-center gap-4 px-4 pt-3 pb-2 text-xs text-gray-500 flex-wrap border-b border-gray-100">
              {selectedBaselineIds.map((id, i) => {
                const bl    = baselines.find(b => b.id === id)
                const color = BASELINE_COLORS[i % BASELINE_COLORS.length]
                return (
                  <span key={id} className="flex items-center gap-1.5">
                    <span className="w-6 h-0.5 rounded inline-block" style={{ backgroundColor: color }} />
                    <span className="w-2.5 h-2.5 rounded-sm inline-block opacity-30 -ml-4 mr-1" style={{ backgroundColor: color }} />
                    {bl?.name ?? 'Baseline'}
                  </span>
                )
              })}
              <span className="flex items-center gap-1.5">
                <span className="w-6 h-0.5 rounded bg-green-400 inline-block" />
                Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ background: 'repeating-linear-gradient(90deg,#fde047 0,#fde047 5px,transparent 5px,transparent 8px)', height: 2, width: 24, display: 'inline-block', borderRadius: 2 }} />
                Forecast
              </span>
            </div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <div style={{ width: effectiveWidth, minWidth: totalW }}>

                {/* Chart */}
                {hasChartData && (
                  <ComposedChart width={effectiveWidth} height={500} data={displayData}
                    margin={{ top: 50, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={false} tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      padding={{ left: effectiveColW / 2, right: effectiveColW / 2 }} height={8} />
                    <YAxis width={LABEL_W} domain={[0, 100]} tickFormatter={v => v + '%'}
                      tickLine={false} axisLine={false} fontSize={11}
                      label={{ value: '% Complete', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }} />
                    <Tooltip formatter={val => val != null ? val.toFixed(2) + '%' : '—'} />
                    {selectedBaselineIds.map((id, i) => (
                      <Area key={id}
                        dataKey={`bl_${id}`}
                        name={baselines.find(b => b.id === id)?.name ?? 'Baseline'}
                        stroke={BASELINE_COLORS[i % BASELINE_COLORS.length]}
                        fill={BASELINE_COLORS[i % BASELINE_COLORS.length]}
                        fillOpacity={0.12}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                    <Line dataKey="forecast" name="Forecast" stroke="#fde047" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                    <Line dataKey="actual"   name="Actual"   stroke="#86efac" strokeWidth={2.5} dot={{ r: 3, fill: '#86efac', strokeWidth: 0 }} connectNulls />
                    {activityMarkers.map(({ id, name, periodLabel, yOffset }) => (
                      <ReferenceLine key={id} x={periodLabel}
                        stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1.5}
                        label={<ActivityRefLabel name={name} yOffset={yOffset} />}
                      />
                    ))}
                  </ComposedChart>
                )}

                {/* Cumulative % table */}
                {hasChartData && (
                  <table className="text-xs border-t border-gray-100" style={{ width: effectiveWidth, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                          className="text-left px-3 py-2 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Cumulative %</span>
                        </th>
                        {displayData.map(d => (
                          <th key={d._date} style={{ width: effectiveColW }} className="text-center px-1 py-2 font-medium text-gray-400 whitespace-nowrap">
                            {d.period}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CUMULATIVE_ROWS.map(({ label, key, color, bg }) => (
                        <tr key={key} className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                          <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                            className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="font-semibold text-gray-600 truncate">{label}</span>
                            </div>
                          </td>
                          {displayData.map(d => (
                            <td key={d._date} style={{ width: effectiveColW }} className="text-center px-1 py-2 tabular-nums text-gray-700">
                              {d[key] != null ? `${d[key].toFixed(2)}%` : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Periodic input table */}
                <table className="text-xs border-t-2 border-gray-300" style={{ width: effectiveWidth, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9', boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                          className="text-left px-3 py-1.5 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Periodic %</span>
                        </th>
                        {periodicGroups
                          ? periodicGroups.map(({ qKey }) => <th key={qKey} style={{ width: effectiveColW }} />)
                          : filteredPeriods.map(p => <th key={p} style={{ width: effectiveColW }} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {INPUT_ROWS.map(({ label, type, baselineId, color, bg, adminOnly }) => {
                        const canEditRow = adminOnly ? isAdmin : canEdit
                        return (
                          <tr key={type === 'baseline' ? `baseline_${baselineId}` : type}
                            className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                            <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }}
                              className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className="font-semibold text-gray-600 truncate">{label}</span>
                              </div>
                            </td>
                            {periodicGroups
                              ? periodicGroups.map(({ qKey, months }) => {
                                  const sum = months.reduce((s, p) => {
                                    const v = type === 'baseline'
                                      ? ((baselineMaps[baselineId] ?? {})[p]?.planned_pct ?? 0)
                                      : type === 'actual'
                                        ? (actualMap[p]?.actual_pct ?? 0)
                                        : (forecastMap[p]?.forecast_pct ?? 0)
                                    return s + v
                                  }, 0)
                                  return (
                                    <td key={qKey} style={{ width: effectiveColW }} className="text-center px-1 py-2 tabular-nums text-gray-700">
                                      {sum > 0
                                        ? <span className="font-medium">{sum % 1 === 0 ? sum + '%' : sum.toFixed(2) + '%'}</span>
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                  )
                                })
                              : filteredPeriods.map(p => {
                                  const isEditing = editCell?.period_date === p && editCell?.type === type &&
                                    (type !== 'baseline' || editCell?.baselineId === baselineId)
                                  const rawVal = type === 'baseline'
                                    ? ((baselineMaps[baselineId] ?? {})[p]?.planned_pct ?? null)
                                    : type === 'actual'
                                      ? (actualMap[p]?.actual_pct ?? null)
                                      : (forecastMap[p]?.forecast_pct ?? null)
                                  const displayVal = (rawVal ?? 0) > 0 ? rawVal : null
                                  const notEditable = (type === 'forecast' && (actualMap[p]?.actual_pct ?? 0) > 0)
                                    || (type === 'baseline' && !baselineId)

                                  return (
                                    <td key={p} style={{ width: effectiveColW }} className="text-center px-1 py-2 tabular-nums">
                                      {isEditing ? (
                                        <div className="flex items-center gap-0.5 justify-center">
                                          <input
                                            type="number" min={0} max={100} step={0.01}
                                            value={editValue} autoFocus
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') handleEdit(p, type)
                                              if (e.key === 'Escape') { setEditCell(null); setEditValue('') }
                                            }}
                                            className="w-14 px-1 py-0.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#ed6055]"
                                          />
                                          <button onClick={() => handleEdit(p, type)} disabled={saving}
                                            className="text-green-600 hover:text-green-700 font-bold text-sm leading-none">✓</button>
                                          <button onClick={() => { setEditCell(null); setEditValue('') }}
                                            className="text-gray-400 hover:text-gray-600 font-bold text-sm leading-none">✕</button>
                                        </div>
                                      ) : notEditable ? (
                                        <span className="text-gray-400">{displayVal != null ? displayVal + '%' : '—'}</span>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            if (!canEditRow) return
                                            setEditCell({ period_date: p, type, ...(type === 'baseline' ? { baselineId } : {}) })
                                            setEditValue(displayVal != null ? String(displayVal) : '')
                                          }}
                                          className={`transition-colors ${canEditRow ? 'hover:text-[#ed6055] cursor-pointer' : 'cursor-default'} ${displayVal != null ? 'text-gray-700 font-medium' : canEditRow ? 'text-gray-400 hover:text-[#ed6055]' : 'text-gray-200'}`}
                                        >
                                          {displayVal != null ? displayVal + '%' : (canEditRow ? '+ add' : '—')}
                                        </button>
                                      )}
                                    </td>
                                  )
                                })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

              </div>
            </div>
          </div>
        )
      })()}

      {/* Loading state */}
      {loading && allPeriods.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center" style={{ height: 220 }}>
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-xs font-medium">Loading…</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {allPeriods.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">
            {baselines.length === 0 ? 'No baselines yet' : 'No data yet'}
          </p>
          {isAdmin && baselines.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Create a baseline to get started</p>
          )}
          {baselines.length > 0 && !selectedBaselineIds.length && (
            <p className="text-xs text-gray-400 mt-1">Select a baseline to view data</p>
          )}
        </div>
      )}

      {/* Add month (admin only, requires primary baseline) */}
      {isAdmin && primaryBaselineId && (
        <div className="flex items-center gap-2">
          <button onClick={handleAddMonth}
            className="text-xs font-semibold px-4 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition">
            + Add Month
          </button>
          {selectedBaselineIds.length > 1 && (
            <span className="text-[10px] text-gray-400">to {primaryBaseline?.name}</span>
          )}
        </div>
      )}

      {toast && (
        <div aria-live="polite"
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
