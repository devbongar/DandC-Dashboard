import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toFloat } from '../lib/excelUtils'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const FIELD_LABELS = { target_pct: 'Target %', actual_pct: 'Actual %', projected_pct: 'Projected %' }

const formatPeriod = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const toQuarter = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
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
      projected_display:  row.actual_pct != null ? row.actual_pct : row.projected_pct,
      projected_editable: row.actual_pct == null,
    }))
  }, [pocData])

  const chartData = useMemo(() => {
    if (viewMode === 'monthly') {
      return tableRows.map(r => ({
        period:    formatPeriod(r.period_date),
        target:    r.target_pct,
        actual:    r.actual_pct,
        projected: r.projected_display,
      }))
    }
    const quarters = {}
    for (const r of tableRows) {
      const q = toQuarter(r.period_date)
      if (!quarters[q]) quarters[q] = { period: q, target: null, actual: null, projected: null }
      if (r.target_pct    != null) quarters[q].target    = r.target_pct
      if (r.actual_pct    != null) quarters[q].actual    = r.actual_pct
      if (r.projected_display != null) quarters[q].projected = r.projected_display
    }
    return Object.values(quarters)
  }, [tableRows, viewMode])

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
      { key: 'period',    header: 'Period' },
      { key: 'target',    header: 'Target %' },
      { key: 'actual',    header: 'Actual %' },
      { key: 'projected', header: 'Projected %' },
    ]
    const rows = pocData.map(r => ({
      period:    formatPeriod(r.period_date),
      target:    r.target_pct    ?? '',
      actual:    r.actual_pct    ?? '',
      projected: r.projected_pct ?? '',
    }))
    downloadWorkbook(
      [{ sheetName: 'S-Curve POC', columns, rows }],
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
        const period_date = parsePeriodDate(row['Period'] ?? row['period'])
        if (!period_date) continue
        const target_pct    = toFloat(row['Target %']    ?? row['target_pct']    ?? row['target'])
        const actual_pct    = toFloat(row['Actual %']    ?? row['actual_pct']    ?? row['actual'])
        const projected_pct = toFloat(row['Projected %'] ?? row['projected_pct'] ?? row['projected'])
        upserts.push({ project_id: project.id, period_date, target_pct, actual_pct, projected_pct })
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

      {pocData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={v => v + '%'}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                label={{ value: '% Complete', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }}
              />
              <Tooltip formatter={(val) => val != null ? val + '%' : '—'} />
              <Legend />
              <Area
                dataKey="target"
                name="Target"
                stroke="#9ca3af"
                fill="#9ca3af"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                dataKey="actual"
                name="Actual"
                stroke="#86efac"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#86efac', strokeWidth: 0 }}
                connectNulls
              />
              <Line
                dataKey="projected"
                name="Projected"
                stroke="#fde047"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {pocData.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">No POC data yet</p>
          {canEdit && <p className="text-xs text-gray-400 mt-1">Add a month below to get started</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Period', 'Target %', 'Actual %', 'Projected %'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 font-bold text-gray-600 uppercase tracking-wider text-xs border-r border-gray-200 last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.map(row => (
              <tr key={row.period_date} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-black border-r border-gray-100">
                  {formatPeriod(row.period_date)}
                </td>
                {['target_pct', 'actual_pct', 'projected_pct'].map(field => {
                  const isEditing  = editCell?.period_date === row.period_date && editCell?.field === field
                  const hasPending = pendingMap[row.period_date]?.[field]
                  const notEditable = field === 'projected_pct' && !row.projected_editable

                  const displayVal = field === 'projected_pct'
                    ? row.projected_display
                    : row[field]

                  return (
                    <td key={field} className="px-4 py-2 border-r border-gray-100 last:border-r-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={editValue}
                            autoFocus
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSubmit(row.period_date, field)
                              if (e.key === 'Escape') { setEditCell(null); setEditValue('') }
                            }}
                            className="w-20 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#ed6055]"
                          />
                          <button
                            onClick={() => handleSubmit(row.period_date, field)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-700 font-bold text-sm leading-none"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => { setEditCell(null); setEditValue('') }}
                            className="text-gray-400 hover:text-gray-600 font-bold text-sm leading-none"
                          >
                            ✕
                          </button>
                        </div>
                      ) : hasPending ? (
                        <span className="text-amber-600 font-medium">
                          {hasPending.new_value}% ⏳
                        </span>
                      ) : notEditable ? (
                        <span className="text-gray-400">
                          {displayVal != null ? displayVal + '%' : '—'}
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            if (!canEdit) return
                            setEditCell({ period_date: row.period_date, field })
                            setEditValue(displayVal != null ? String(displayVal) : '')
                          }}
                          className={`text-left ${canEdit ? 'hover:text-[#ed6055] cursor-pointer' : 'cursor-default'} text-gray-700`}
                        >
                          {displayVal != null ? displayVal + '%' : '—'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400 italic">
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
