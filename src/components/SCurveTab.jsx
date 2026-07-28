import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import SearchDropdown from './SearchDropdown'
import { buildAllPeriods, computeChartData } from '../lib/scurveUtils'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const COL_W   = 80
const LABEL_W = 88

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

function NewBaselineForm({ actuals, onSave, onCancel }) {
  const [name,       setName]       = useState('')
  const [cutoffDate, setCutoffDate] = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const pastCount = actuals.filter(a => a.period_date.slice(0, 7) <= cutoffDate).length

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name:        name.trim(),
      cutoff_date: cutoffDate ? cutoffDate + '-01' : null,
      notes:       notes.trim() || null,
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
          {cutoffDate && (
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

export default function SCurveTab({ project, isAdmin, canEdit }) {
  const [baselines,          setBaselines]          = useState([])
  const [selectedBaselineId, setSelectedBaselineId] = useState(null)
  const [baselineData,       setBaselineData]       = useState([])
  const [actuals,            setActuals]            = useState([])
  const [forecasts,          setForecasts]          = useState([])
  const [loading,            setLoading]            = useState(true)
  const [viewMode,           setViewMode]           = useState('monthly')
  const [editCell,           setEditCell]           = useState(null)
  const [editValue,          setEditValue]          = useState('')
  const [saving,             setSaving]             = useState(false)
  const [toast,              setToast]              = useState(null)
  const [showNewBaseline,    setShowNewBaseline]    = useState(false)

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

  const load = async () => {
    setLoading(true)
    const [{ data: bl }, { data: acts }, { data: fors }] = await Promise.all([
      supabase.from('project_scurve_baselines').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('project_scurve_actual').select('*').eq('project_id', project.id).order('period_date'),
      supabase.from('project_scurve_forecast').select('*').eq('project_id', project.id).order('period_date'),
    ])
    const bls = bl ?? []
    setBaselines(bls)
    setActuals(acts ?? [])
    setForecasts(fors ?? [])
    setSelectedBaselineId(prev => prev ?? (bls[0]?.id ?? null))
    setLoading(false)
  }

  useEffect(() => { load() }, [project.id])

  useEffect(() => {
    if (!selectedBaselineId) { setBaselineData([]); return }
    supabase.from('project_scurve_baseline_data').select('*')
      .eq('baseline_id', selectedBaselineId).order('period_date')
      .then(({ data }) => setBaselineData(data ?? []))
  }, [selectedBaselineId])

  const baselineMap = useMemo(() => Object.fromEntries(baselineData.map(r => [r.period_date, r])), [baselineData])
  const actualMap   = useMemo(() => Object.fromEntries(actuals.map(r => [r.period_date, r])),     [actuals])
  const forecastMap = useMemo(() => Object.fromEntries(forecasts.map(r => [r.period_date, r])),   [forecasts])

  const allPeriods = useMemo(() => buildAllPeriods(baselineData, actuals, forecasts), [baselineData, actuals, forecasts])

  const filteredPeriods = useMemo(() => allPeriods.filter(p => {
    const ym = p.slice(0, 7)
    if (fromMonth && ym < fromMonth) return false
    if (toMonth   && ym > toMonth)   return false
    return true
  }), [allPeriods, fromMonth, toMonth])

  const chartData = useMemo(() =>
    computeChartData(allPeriods, baselineData, actuals, forecasts),
    [allPeriods, baselineData, actuals, forecasts]
  )

  const chartDataFiltered = useMemo(() => {
    let result = chartData
    if (fromMonth) result = result.filter(d => d._date.slice(0, 7) >= fromMonth)
    if (toMonth)   result = result.filter(d => d._date.slice(0, 7) <= toMonth)
    return result
  }, [chartData, fromMonth, toMonth])

  const handleCreateBaseline = async ({ name, cutoff_date, notes }) => {
    const { data: bl, error } = await supabase
      .from('project_scurve_baselines')
      .insert({ project_id: project.id, name, cutoff_date, notes })
      .select().single()
    if (error) { showToast(error.message, 'error'); return }

    if (cutoff_date) {
      const past = actuals.filter(a => a.period_date.slice(0, 7) <= cutoff_date.slice(0, 7))
      if (past.length > 0) {
        await supabase.from('project_scurve_baseline_data').insert(
          past.map(a => ({ baseline_id: bl.id, period_date: a.period_date, planned_pct: a.actual_pct }))
        )
      }
    }

    setShowNewBaseline(false)
    setSelectedBaselineId(bl.id)
    showToast('Baseline created')
    load()
  }

  const reloadData = async () => {
    const [{ data: acts }, { data: fors }, { data: bd }] = await Promise.all([
      supabase.from('project_scurve_actual').select('*').eq('project_id', project.id).order('period_date'),
      supabase.from('project_scurve_forecast').select('*').eq('project_id', project.id).order('period_date'),
      selectedBaselineId
        ? supabase.from('project_scurve_baseline_data').select('*').eq('baseline_id', selectedBaselineId).order('period_date')
        : Promise.resolve({ data: [] }),
    ])
    setActuals(acts ?? [])
    setForecasts(fors ?? [])
    setBaselineData(bd ?? [])
  }

  const handleEdit = async (period_date, type) => {
    const numVal = parseFloat(editValue)
    if (isNaN(numVal) || numVal < 0 || numVal > 100) { showToast('Value must be 0–100', 'error'); return }
    setSaving(true)

    if (type === 'baseline') {
      const existing = baselineMap[period_date]
      const { error } = existing
        ? await supabase.from('project_scurve_baseline_data').update({ planned_pct: numVal }).eq('id', existing.id)
        : await supabase.from('project_scurve_baseline_data').insert({ baseline_id: selectedBaselineId, period_date, planned_pct: numVal })
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
    } else if (type === 'actual') {
      const existing = actualMap[period_date]
      const { error } = existing
        ? await supabase.from('project_scurve_actual').update({ actual_pct: numVal, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from('project_scurve_actual').insert({ project_id: project.id, period_date, actual_pct: numVal })
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
    } else if (type === 'forecast') {
      const existing = forecastMap[period_date]
      const { error } = existing
        ? await supabase.from('project_scurve_forecast').update({ forecast_pct: numVal, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from('project_scurve_forecast').insert({ project_id: project.id, period_date, forecast_pct: numVal })
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
    }

    setSaving(false)
    setEditCell(null)
    setEditValue('')
    showToast('Saved')
    reloadData()
  }

  const handleAddMonth = async () => {
    if (!selectedBaselineId) { showToast('Select a baseline first', 'error'); return }
    const refPeriods = baselineData.length > 0 ? baselineData : allPeriods.map(p => ({ period_date: p }))
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
    const { error } = await supabase.from('project_scurve_baseline_data')
      .insert({ baseline_id: selectedBaselineId, period_date })
    if (error) { showToast(error.message, 'error'); return }
    const { data } = await supabase.from('project_scurve_baseline_data')
      .select('*').eq('baseline_id', selectedBaselineId).order('period_date')
    setBaselineData(data ?? [])
  }

  const selectedBaseline = baselines.find(b => b.id === selectedBaselineId)
  const totalW           = LABEL_W + COL_W * filteredPeriods.length

  const INPUT_ROWS = [
    { label: 'Planned',  type: 'baseline', color: '#9ca3af', bg: '#ffffff', adminOnly: true },
    { label: 'Actual',   type: 'actual',   color: '#86efac', bg: '#fafbfc', adminOnly: false },
    { label: 'Forecast', type: 'forecast', color: '#fde047', bg: '#ffffff', adminOnly: false },
  ]

  return (
    <div className="py-4 sm:py-5 space-y-5">

      {/* Baseline selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <SearchDropdown
            fluid
            options={baselines.map(b => ({ value: b.id, label: b.name }))}
            value={selectedBaselineId ?? ''}
            onChange={setSelectedBaselineId}
            emptyValue="" emptyLabel="No baseline selected"
            placeholder="Select baseline…"
          />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewBaseline(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition"
          >
            + New Baseline
          </button>
        )}
        {selectedBaseline?.cutoff_date && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            Re-baseline · cutoff {selectedBaseline.cutoff_date.slice(0, 7)}
          </span>
        )}
      </div>

      {/* New baseline form */}
      {showNewBaseline && isAdmin && (
        <NewBaselineForm
          actuals={actuals}
          onSave={handleCreateBaseline}
          onCancel={() => setShowNewBaseline(false)}
        />
      )}

      {/* View mode + legend + date range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {['monthly', 'quarterly'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition capitalize"
                style={viewMode === mode
                  ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }}
              >{mode}</button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 rounded bg-gray-400 inline-block" />
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-gray-400 opacity-30 -ml-4 mr-1" />
              Baseline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded bg-green-400 inline-block" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              <span className="w-3 h-0.5 rounded bg-green-400 inline-block" />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ background: 'repeating-linear-gradient(90deg,#fde047 0,#fde047 5px,transparent 5px,transparent 8px)', height: 2, width: 24, display: 'inline-block', borderRadius: 2 }} />
              Forecast
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

      {/* Chart + tables */}
      {allPeriods.length > 0 && (() => {
        const chartDataByDate    = Object.fromEntries(chartData.map(d => [d._date, d]))
        const combinedData       = filteredPeriods.map(p =>
          chartDataByDate[p] ?? { period: p, baseline: null, actual: null, forecast: null, _date: p }
        )
        const hasChartData = chartData.some(d => d.baseline != null || d.actual != null || d.forecast != null)

        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <div style={{ width: totalW, minWidth: totalW }}>

                {/* Chart */}
                {hasChartData && (
                  <ComposedChart width={totalW} height={280} data={combinedData}
                    margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={false} tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      padding={{ left: COL_W / 2, right: COL_W / 2 }} height={8} />
                    <YAxis width={LABEL_W} domain={[0, 100]} tickFormatter={v => v + '%'}
                      tickLine={false} axisLine={false} fontSize={11}
                      label={{ value: '% Complete', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }} />
                    <Tooltip formatter={val => val != null ? val.toFixed(2) + '%' : '—'} />
                    <Area dataKey="baseline" name="Baseline" stroke="#9ca3af" fill="#9ca3af" fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls />
                    <Line dataKey="actual"   name="Actual"   stroke="#86efac" strokeWidth={2.5} dot={{ r: 3, fill: '#86efac', strokeWidth: 0 }} connectNulls />
                    <Line dataKey="forecast" name="Forecast" stroke="#fde047" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                  </ComposedChart>
                )}

                {/* Cumulative % table */}
                {hasChartData && (
                  <table className="text-xs border-t border-gray-100" style={{ width: totalW, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9' }}
                          className="text-left px-3 py-2 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Cumulative %</span>
                        </th>
                        {combinedData.map(d => (
                          <th key={d._date} style={{ width: COL_W }} className="text-center px-1 py-2 font-medium text-gray-400 whitespace-nowrap">
                            {d.period}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Baseline', key: 'baseline', color: '#9ca3af', bg: '#ffffff' },
                        { label: 'Actual',   key: 'actual',   color: '#86efac', bg: '#fafbfc' },
                        { label: 'Forecast', key: 'forecast', color: '#fde047', bg: '#ffffff' },
                      ].map(({ label, key, color, bg }) => (
                        <tr key={key} className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                          <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg }}
                            className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="font-semibold text-gray-600">{label}</span>
                            </div>
                          </td>
                          {combinedData.map(d => (
                            <td key={d._date} style={{ width: COL_W }} className="text-center px-1 py-2 tabular-nums text-gray-700">
                              {d[key] != null ? `${d[key].toFixed(2)}%` : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Monthly input table */}
                {viewMode === 'monthly' && (
                  <table className="text-xs border-t-2 border-gray-300" style={{ width: totalW, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9' }}
                          className="text-left px-3 py-1.5 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Monthly Input</span>
                        </th>
                        {filteredPeriods.map(p => <th key={p} style={{ width: COL_W }} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {INPUT_ROWS.map(({ label, type, color, bg, adminOnly }) => {
                        const canEditRow = adminOnly ? isAdmin : canEdit
                        return (
                          <tr key={type} className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                            <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg }}
                              className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className="font-semibold text-gray-600">{label}</span>
                              </div>
                            </td>
                            {filteredPeriods.map(p => {
                              const isEditing = editCell?.period_date === p && editCell?.type === type
                              const rawVal = type === 'baseline' ? (baselineMap[p]?.planned_pct ?? null)
                                : type === 'actual' ? (actualMap[p]?.actual_pct ?? null)
                                : (forecastMap[p]?.forecast_pct ?? null)
                              const displayVal = (rawVal ?? 0) > 0 ? rawVal : null
                              const notEditable = (type === 'forecast' && (actualMap[p]?.actual_pct ?? 0) > 0)
                                || (type === 'baseline' && !selectedBaselineId)

                              return (
                                <td key={p} style={{ width: COL_W }} className="text-center px-1 py-2 tabular-nums">
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
                                        setEditCell({ period_date: p, type })
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
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* Empty state */}
      {allPeriods.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">
            {baselines.length === 0 ? 'No baselines yet' : 'No data yet'}
          </p>
          {isAdmin && baselines.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Create a baseline to get started</p>
          )}
          {isAdmin && baselines.length > 0 && !selectedBaselineId && (
            <p className="text-xs text-gray-400 mt-1">Select a baseline then add months</p>
          )}
        </div>
      )}

      {/* Add month (admin only, requires baseline selected) */}
      {isAdmin && selectedBaselineId && (
        <div>
          <button onClick={handleAddMonth}
            className="text-xs font-semibold px-4 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition">
            + Add Month
          </button>
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
