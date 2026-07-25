import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toFloat } from '../lib/excelUtils'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts'

const COL_W   = 80  // px per data column — shared by chart x-axis and table
const LABEL_W = 88  // px for Y-axis / sticky Series column

const FIELD_LABELS = { target_pct: 'Planned %', actual_pct: 'Actual %', projected_pct: 'Projected %' }


const formatPeriod = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const yr  = String(d.getFullYear()).slice(2)
  return `${mon} '${yr}`
}

const toQuarter = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
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

  const selectCls = "px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white cursor-pointer"

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

export default function SCurveTab({ project, isAdmin, canEdit }) {
  const [pocData, setPocData]     = useState([])
  const [pending, setPending]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [viewMode, setViewMode]   = useState('monthly')
  const [editCell, setEditCell]   = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [importing, setImporting] = useState(false)
  const importRef                 = useRef(null)

  const dateRangeKey = `scurve_dateRange_${project.id}`
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
  const hasDateFilter = fromMonth || toMonth

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    const [{ data: poc }, { data: pend }] = await Promise.all([
      supabase.from('project_poc').select('*').eq('project_id', project.id).order('period_date', { ascending: true }),
      supabase.from('project_poc_pending').select('*').eq('project_id', project.id).eq('status', 'pending').order('created_at', { ascending: true }),
    ])
    setPocData(poc ?? [])
    setPending(pend ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [project.id])

  const pendingMap = useMemo(() => {
    const map = {}
    for (const row of pending) {
      if (!map[row.period_date]) map[row.period_date] = {}
      map[row.period_date][row.field] = row
    }
    return map
  }, [pending])

  const tableRows = useMemo(() => {
    return pocData.map(row => ({
      ...row,
      projected_display:  row.actual_pct > 0 ? row.actual_pct : row.projected_pct,
      projected_editable: !(row.actual_pct > 0),
    }))
  }, [pocData])

  const chartRows = useMemo(() => {
    const lastIdx = tableRows.reduce((last, r, i) => {
      const hasAny = r.target_pct != null || r.actual_pct != null || r.projected_pct != null
      return hasAny ? i : last
    }, -1)
    return lastIdx >= 0 ? tableRows.slice(0, lastIdx + 1) : []
  }, [tableRows])

  const inputTableRows = useMemo(() => {
    if (!fromMonth && !toMonth) return tableRows
    return tableRows.filter(r => {
      const ym = r.period_date.slice(0, 7)
      if (fromMonth && ym < fromMonth) return false
      if (toMonth && ym > toMonth) return false
      return true
    })
  }, [tableRows, fromMonth, toMonth])

  const chartData = useMemo(() => {
    // "has data" means a positive value was recorded — 0 and null both mean "no data for display"
    const lastTargetIdx    = chartRows.reduce((last, r, i) => r.target_pct    > 0 ? i : last, -1)
    const lastActualIdx    = chartRows.reduce((last, r, i) => r.actual_pct    > 0 ? i : last, -1)
    const lastProjectedIdx = chartRows.reduce((last, r, i) =>
      (r.actual_pct > 0 || r.projected_pct > 0) ? i : last, -1)

    // Compute full cumulative series first (all months), then slice to date range.
    // This keeps cumulative values correct even when a From date is set.
    let full
    if (viewMode === 'monthly') {
      let cumTarget = 0, cumActual = 0, cumProjected = 0
      full = chartRows.map((r, i) => {
        if (r.target_pct > 0) cumTarget = Math.min(100, cumTarget + r.target_pct)
        if (r.actual_pct > 0) { cumActual = Math.min(100, cumActual + r.actual_pct); cumProjected = cumActual }
        else if (r.projected_pct > 0) cumProjected = Math.min(100, cumProjected + r.projected_pct)

        const showTarget   = r.target_pct    > 0 && i <= lastTargetIdx
        const showActual   = r.actual_pct    > 0 && i <= lastActualIdx
        const showForecast = r.projected_pct > 0 && !r.actual_pct && i <= lastProjectedIdx

        return {
          period:    formatPeriod(r.period_date),
          target:    showTarget                   ? cumTarget    : null,
          actual:    showActual                   ? cumActual    : null,
          projected: (showActual || showForecast) ? cumProjected : null,
          _date:     r.period_date,
        }
      })
    } else {
      // Quarterly: sum positive monthly increments per quarter, then accumulate across quarters
      const lastTargetDate    = lastTargetIdx    >= 0 ? chartRows[lastTargetIdx].period_date    : null
      const lastActualDate    = lastActualIdx    >= 0 ? chartRows[lastActualIdx].period_date    : null
      const lastProjectedDate = lastProjectedIdx >= 0 ? chartRows[lastProjectedIdx].period_date : null

      const qMap = {}, qOrder = []
      for (const r of chartRows) {
        const q = toQuarter(r.period_date)
        if (!qMap[q]) { qMap[q] = { period: q, tSum: 0, aSum: 0, pSum: 0, hasT: false, hasA: false, hasP: false, firstDate: r.period_date }; qOrder.push(q) }
        if (r.target_pct > 0    && (!lastTargetDate    || r.period_date <= lastTargetDate))    { qMap[q].tSum += r.target_pct;    qMap[q].hasT = true }
        if (r.actual_pct > 0    && (!lastActualDate    || r.period_date <= lastActualDate))    { qMap[q].aSum += r.actual_pct;    qMap[q].hasA = true }
        if (r.projected_pct > 0 && !r.actual_pct && (!lastProjectedDate || r.period_date <= lastProjectedDate)) { qMap[q].pSum += r.projected_pct; qMap[q].hasP = true }
      }

      let cumT = 0, cumA = 0, cumP = 0
      full = qOrder.map(q => {
        const d = qMap[q]
        if (d.hasT) cumT = Math.min(100, cumT + d.tSum)
        if (d.hasA) { cumA = Math.min(100, cumA + d.aSum); cumP = cumA }
        if (d.hasP) cumP = Math.min(100, cumP + d.pSum)
        return {
          period:    q,
          target:    d.hasT              ? cumT : null,
          actual:    d.hasA              ? cumA : null,
          projected: (d.hasA || d.hasP)  ? cumP : null,
          _date:     d.firstDate,
        }
      })
    }

    let result = full
    if (fromMonth) result = result.filter(d => d._date.slice(0, 7) >= fromMonth)
    if (toMonth)   result = result.filter(d => d._date.slice(0, 7) <= toMonth)
    return result
  }, [chartRows, viewMode, fromMonth, toMonth])

  const handleSubmit = async (period_date, field) => {
    const numVal = parseFloat(editValue)
    if (isNaN(numVal) || numVal < 0 || numVal > 100) {
      showToast('Value must be between 0 and 100', 'error')
      return
    }
    setSaving(true)
    const pocRow = pocData.find(r => r.period_date === period_date)
    const old_value = pocRow?.[field] ?? null
    const { error } = await supabase.from('project_poc_pending').insert({
      project_id: project.id,
      period_date,
      field,
      old_value,
      new_value: numVal,
    })
    setSaving(false)
    if (error) { showToast(error.message, 'error'); return }
    setEditCell(null)
    setEditValue('')
    showToast('Submitted for approval')
    load()
  }

  const handleApprove = async (pendingRow) => {
    const { error: upsertErr } = await supabase.from('project_poc').upsert(
      {
        project_id:  project.id,
        period_date: pendingRow.period_date,
        [pendingRow.field]: pendingRow.new_value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,period_date' }
    )
    if (upsertErr) { showToast(upsertErr.message, 'error'); return }
    const { error: updErr } = await supabase.from('project_poc_pending').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }).eq('id', pendingRow.id)
    if (updErr) { showToast(updErr.message, 'error'); return }
    showToast('Approved')
    load()
  }

  const handleReject = async (pendingRow) => {
    const { error } = await supabase.from('project_poc_pending').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    }).eq('id', pendingRow.id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Rejected')
    load()
  }

  const handleExport = () => {
    const columns = [
      { key: 'period',    header: 'Period (locked)' },
      { key: 'target',    header: 'Target %' },
      { key: 'actual',    header: 'Actual % (locked)' },
      { key: 'projected', header: 'Projected %' },
    ]
    const rows = pocData.map(r => ({
      period:    formatPeriod(r.period_date),
      target:    r.target_pct    ?? '',
      actual:    r.actual_pct    ?? '',
      projected: r.projected_pct ?? '',
    }))
    // Lock Period (col 1) and Actual % (col 3) — only Target and Projected are editable
    const lockedCells = rows.map(() => [1, 3])
    downloadWorkbook(
      [{ sheetName: 'S-Curve POC', columns, rows, protectSheet: true, lockedCells }],
      `s-curve-${project.project_code || project.name}-${new Date().toISOString().slice(0,10)}.xlsx`
    )
  }

  const parsePeriodDate = (val) => {
    if (!val) return null
    const s = String(val).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7) + '-01'
    const d = new Date(s + ' 01')
    if (!isNaN(d)) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      return `${y}-${m}-01`
    }
    return null
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const wb   = await parseWorkbook(file)
      const rows = wb['S-Curve POC'] ?? Object.values(wb)[0] ?? []
      if (!rows.length) { showToast('No rows found in file', 'error'); setImporting(false); return }

      const upserts = []
      for (const row of rows) {
        const period_date   = parsePeriodDate(row['Period (locked)'] ?? row['Period'] ?? row['period'])
        if (!period_date) continue
        const target_pct    = toFloat(row['Target %']    ?? row['target_pct']    ?? row['target'])
        const projected_pct = toFloat(row['Projected %'] ?? row['projected_pct'] ?? row['projected'])
        // actual_pct is intentionally excluded — actual values are never overwritten by import
        upserts.push({ project_id: project.id, period_date, target_pct, projected_pct })
      }

      if (!upserts.length) { showToast('No valid rows parsed', 'error'); setImporting(false); return }

      const { error } = await supabase.from('project_poc')
        .upsert(upserts, { onConflict: 'project_id,period_date' })
      if (error) { showToast(error.message, 'error'); setImporting(false); return }

      showToast(`Imported ${upserts.length} rows`)
      load()
    } catch {
      showToast('Failed to read file', 'error')
    }
    setImporting(false)
  }

  const handleAddMonth = async () => {
    let period_date
    if (pocData.length > 0) {
      const last = pocData[pocData.length - 1].period_date
      const d = new Date(last + 'T00:00:00')
      d.setMonth(d.getMonth() + 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      period_date = `${y}-${m}-01`
    } else {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      period_date = `${y}-${m}-01`
    }
    const { error } = await supabase.from('project_poc').insert({ project_id: project.id, period_date })
    if (error) { showToast(error.message, 'error'); return }
    load()
  }

  return (
    <div className="py-4 sm:py-5 space-y-5">

      {isAdmin && pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-700 mb-3">{pending.length} pending approval</p>
          <div className="space-y-2">
            {pending.map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-amber-800">
                  <span className="font-semibold">{formatPeriod(row.period_date)}</span>
                  {' · '}{FIELD_LABELS[row.field]}
                  {' · '}{row.old_value ?? '—'}{'% → '}{row.new_value}%
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(row)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(row)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {['monthly', 'quarterly'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition capitalize"
                style={viewMode === mode
                  ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }
                }
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 rounded bg-gray-400 inline-block" />
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-gray-400 opacity-30 -ml-4 mr-1" />
              Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded bg-green-400 inline-block" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              <span className="w-3 h-0.5 rounded bg-green-400 inline-block" />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ background: 'repeating-linear-gradient(90deg,#fde047 0,#fde047 5px,transparent 5px,transparent 8px)', height: 2, width: 24, display:'inline-block', borderRadius: 2 }} />
              Projected
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">From</span>
          <MonthYearPicker value={fromMonth} onChange={setFromMonth} max={toMonth} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">To</span>
          <MonthYearPicker value={toMonth} onChange={setToMonth} min={fromMonth} />
          {hasDateFilter && (
            <button
              onClick={() => { setFromMonth(''); setToMonth('') }}
              className="text-xs text-gray-400 hover:text-[#ed6055] transition font-medium"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition bg-white"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>

          {isAdmin && (
            <>
              <input
                ref={importRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImport}
                className="hidden"
              />
              <button
                onClick={() => importRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-[#ed6055] hover:text-[#ed6055] transition bg-white disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>

      {inputTableRows.length > 0 && (() => {
        // Master column list: all months including empty ones (so Add Month always shows)
        const cols = inputTableRows
        const chartDataByDate = Object.fromEntries(chartData.map(d => [d._date, d]))
        // Extend chart data to cover all cols — empty months get null cumulative values
        const combinedData = cols.map(r =>
          chartDataByDate[r.period_date] ?? {
            period: formatPeriod(r.period_date), target: null, actual: null, projected: null, _date: r.period_date,
          }
        )
        const totalW = LABEL_W + COL_W * cols.length
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
              <div style={{ width: totalW, minWidth: totalW }}>

                {/* Chart */}
                {chartData.length > 0 && (
                  <ComposedChart
                    width={totalW}
                    height={280}
                    data={combinedData}
                    margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="period"
                      tick={false}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                      padding={{ left: COL_W / 2, right: COL_W / 2 }}
                      height={8}
                    />
                    <YAxis
                      width={LABEL_W}
                      domain={[0, 100]}
                      tickFormatter={v => v + '%'}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      label={{ value: '% Complete', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }}
                    />
                    <Tooltip formatter={(val) => val != null ? val.toFixed(2) + '%' : '—'} />
                    <Area dataKey="target" name="Planned" stroke="#9ca3af" fill="#9ca3af" fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls />
                    <Line dataKey="actual" name="Actual" stroke="#86efac" strokeWidth={2.5} dot={{ r: 3, fill: '#86efac', strokeWidth: 0 }} connectNulls />
                    <Line dataKey="projected" name="Projected" stroke="#fde047" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                  </ComposedChart>
                )}

                {/* Cumulative % table */}
                {chartData.length > 0 && (
                  <table className="text-xs border-t border-gray-100" style={{ width: totalW, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9' }} className="text-left px-3 py-2 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Cumulative %</span>
                        </th>
                        {combinedData.map(d => (
                          <th key={d._date} style={{ width: COL_W }} className="text-center px-1 py-2 font-medium text-gray-400 whitespace-nowrap">{d.period}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Planned',   key: 'target',    color: '#9ca3af', bg: '#ffffff' },
                        { label: 'Actual',    key: 'actual',    color: '#86efac', bg: '#fafbfc' },
                        { label: 'Projected', key: 'projected', color: '#fde047', bg: '#ffffff' },
                      ].map(({ label, key, color, bg }) => (
                        <tr key={key} className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                          <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg }} className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
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

                {/* Monthly Input table — same scroll container, columns aligned with chart */}
                {viewMode === 'monthly' && (
                  <table className="text-xs border-t-2 border-gray-300" style={{ width: totalW, tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }} className="border-b border-gray-200">
                        <th style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: '#f1f5f9' }} className="text-left px-3 py-1.5 sticky left-0 z-10 border-r border-gray-200">
                          <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Monthly Input</span>
                        </th>
                        {cols.map(r => <th key={r.period_date} style={{ width: COL_W }} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Planned',   field: 'target_pct',    color: '#9ca3af', bg: '#ffffff' },
                        { label: 'Actual',    field: 'actual_pct',    color: '#86efac', bg: '#fafbfc' },
                        { label: 'Projected', field: 'projected_pct', color: '#fde047', bg: '#ffffff' },
                      ].map(({ label, field, color, bg }) => (
                        <tr key={field} className="border-b border-gray-50 last:border-b-0 hover:bg-[#f0f4f8]" style={{ backgroundColor: bg }}>
                          <td style={{ width: LABEL_W, minWidth: LABEL_W, backgroundColor: bg }} className="px-3 py-2 sticky left-0 z-10 border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="font-semibold text-gray-600">{label}</span>
                            </div>
                          </td>
                          {cols.map(row => {
                            const isEditing  = editCell?.period_date === row.period_date && editCell?.field === field
                            const hasPending = pendingMap[row.period_date]?.[field]
                            const notEditable = field === 'projected_pct' && !row.projected_editable
                            const rawVal = field === 'projected_pct' ? row.projected_display : row[field]
                            const displayVal = rawVal > 0 ? rawVal : null
                            return (
                              <td key={row.period_date} style={{ width: COL_W }} className="text-center px-1 py-2 tabular-nums">
                                {isEditing ? (
                                  <div className="flex items-center gap-0.5 justify-center">
                                    <input
                                      type="number" min={0} max={100} step={0.01}
                                      value={editValue} autoFocus
                                      onChange={e => setEditValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSubmit(row.period_date, field)
                                        if (e.key === 'Escape') { setEditCell(null); setEditValue('') }
                                      }}
                                      className="w-14 px-1 py-0.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#ed6055]"
                                    />
                                    <button onClick={() => handleSubmit(row.period_date, field)} disabled={saving} className="text-green-600 hover:text-green-700 font-bold text-sm leading-none">✓</button>
                                    <button onClick={() => { setEditCell(null); setEditValue('') }} className="text-gray-400 hover:text-gray-600 font-bold text-sm leading-none">✕</button>
                                  </div>
                                ) : hasPending ? (
                                  <span className="text-amber-600 font-medium">{hasPending.new_value}% ⏳</span>
                                ) : notEditable ? (
                                  <span className="text-gray-400">{displayVal != null ? displayVal + '%' : '—'}</span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (!canEdit) return
                                      setEditCell({ period_date: row.period_date, field })
                                      setEditValue(displayVal != null ? String(displayVal) : '')
                                    }}
                                    className={`transition-colors ${canEdit ? 'hover:text-[#ed6055] cursor-pointer' : 'cursor-default'} ${displayVal != null ? 'text-gray-700 font-medium' : canEdit ? 'text-gray-400 hover:text-[#ed6055]' : 'text-gray-200'}`}
                                  >
                                    {displayVal != null ? displayVal + '%' : (canEdit ? '+ add' : '—')}
                                  </button>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {pocData.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No POC data yet</p>
          {canEdit && <p className="text-xs text-gray-400 mt-1">Add a month below to get started</p>}
        </div>
      )}

      {canEdit && (
        <div>
          <button
            onClick={handleAddMonth}
            className="text-xs font-semibold px-4 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition"
          >
            + Add Month
          </button>
        </div>
      )}

      {toast && (
        <div
          aria-live="polite"
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
