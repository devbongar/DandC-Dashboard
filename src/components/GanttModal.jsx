import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toDateStr } from '../lib/excelUtils'
import TriangleLoader from './TriangleLoader'
import { buildTree } from '../lib/ganttDependencies'

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

const TASK_ROW_H  = 52   // px — matches min-h-[52px] on MilestoneRow date cells
const PHASE_ROW_H = 36   // px — collapsible phase group header height
const AXIS_H      = 56   // px — sticky month/year axis header height

const PAD     = 7 * 86400000
const LABEL_W = 320
const DEFAULT_COL_PX = { day: 20, week: 20, month: 20 }

const DATE_COL_W   = 100  // width of each individual date cell (px)
const DATE_GROUP_W = DATE_COL_W * 2  // two cols per group (start + end)
const DATE_COLS_W  = DATE_GROUP_W * 3  // three groups: planned, actual, projected

const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const isValidDate = (str) => {
  if (!str) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
  const d = new Date(str + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const [y, m, day] = str.split('-').map(Number)
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
}

const isValidRawDate = (val) => {
  if (!val && val !== 0) return true
  if (val instanceof Date) return !isNaN(val.getTime())
  const str = String(val).trim()
  if (!str) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00')
    if (isNaN(d.getTime())) return false
    const [y, m, day] = str.split('-').map(Number)
    return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
  }
  return !isNaN(Date.parse(str))
}

const MILESTONE_PHASE_MAP_OUT = {
  initiation: 'Initiation',
  planning: 'Planning',
  execution_monitoring: 'Execution & Monitoring',
  closeout: 'Close-Out',
}
const MILESTONE_PHASE_MAP_IN = Object.fromEntries(
  Object.entries(MILESTONE_PHASE_MAP_OUT).map(([k, v]) => [v, k])
)

function GInlineInput({ value, onChange, type = 'text', placeholder = '', min, max, error, disabled = false }) {
  const resolvedMin = min !== undefined ? min : (type === 'number' ? 0 : undefined)
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => !disabled && onChange(e.target.value, type === 'date' ? e.target.validity.badInput : undefined)}
      placeholder={placeholder}
      min={resolvedMin}
      max={max}
      disabled={disabled}
      className={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 bg-white transition ${
        disabled
          ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
          : error
            ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-600'
            : 'border-gray-200 focus:ring-[#ed6055]'
      }`}
    />
  )
}

function GConfirmDeleteModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-black mb-1">Delete this milestone?</h3>
        <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition">Delete</button>
        </div>
      </div>
    </div>
  )
}

function GImportErrorPanel({ errors, onDismiss }) {
  if (!errors.length) return null
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-2 mx-6">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-red-700">
          Import blocked — {errors.length} error{errors.length !== 1 ? 's' : ''} found. Fix the file and try again.
        </p>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-xs font-medium flex-shrink-0">Dismiss</button>
      </div>
      <ul className="space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
            <span className="flex-shrink-0 mt-0.5">•</span><span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GExcelButtons({ onExport, onImport, importing = false }) {
  const ref = useRef(null)
  return (
    <div className="flex items-center gap-1">
      <button onClick={onExport} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
        Export
      </button>
      <button onClick={() => ref.current?.click()} disabled={importing} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
        {importing ? 'Importing…' : 'Import'}
      </button>
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files[0]; if (f) onImport(f); e.target.value = '' }} />
    </div>
  )
}

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

function PhaseGroupHeader({ label, isCollapsed, onToggle, totalW, labelW, showDates, chartPxWidth }) {
  return (
    <div
      className="flex items-center cursor-pointer select-none"
      style={{ width: totalW, minWidth: totalW, height: PHASE_ROW_H, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
      onClick={onToggle}
    >
      <div
        className="sticky left-0 z-20 flex items-center gap-1.5 self-stretch flex-shrink-0"
        style={{ width: labelW + (showDates ? DATE_COLS_W : 0), minWidth: labelW + (showDates ? DATE_COLS_W : 0), paddingLeft: 12, borderRight: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
      >
        <span
          style={{
            fontSize: 9, color: '#94a3b8', display: 'inline-block',
            transform: isCollapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform .2s',
          }}
        >▼</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label}
        </span>
      </div>
      <div style={{ width: chartPxWidth, minWidth: chartPxWidth, height: '100%', backgroundColor: '#f8fafc' }} />
    </div>
  )
}

function MilestoneRow({ m, seq, toPx, chartPxWidth, gridDates, todayPx, showToday, todayStr, isChild = false, isLastChild = false, labelW = LABEL_W, showDates = true, isEditing = false, form = {}, setForm = () => {}, onSave = () => {}, onCancelEdit = () => {}, onEdit = () => {}, onDelete = () => {}, isAdmin = false }) {
  const hasDates = [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end].some(Boolean)
  const bgBase   = isChild ? '#f9fafb' : '#ffffff'

  const hasActualStart = isEditing ? !!form.actual_start : false
  const hasActualEnd   = isEditing ? !!form.actual_end   : false
  const projStartVal   = isEditing ? (hasActualStart ? form.actual_start : form.projected_start) : undefined
  const projEndVal     = isEditing ? (hasActualEnd   ? form.actual_end   : form.projected_end)   : undefined

  const plannedStartErr   = isEditing && (form.planned_start_bad   || !!(form.planned_start   && !isValidDate(form.planned_start)))
  const plannedEndErr     = isEditing && (form.planned_end_bad     || !!(form.planned_end     && !isValidDate(form.planned_end)))
  const actualStartErr    = isEditing && (form.actual_start_bad    || !!(form.actual_start    && !isValidDate(form.actual_start)))
  const actualEndErr      = isEditing && (form.actual_end_bad      || !!(form.actual_end      && !isValidDate(form.actual_end)))
  const projectedStartErr = isEditing && !hasActualStart && (form.projected_start_bad || !!(form.projected_start && !isValidDate(form.projected_start)))
  const projectedEndErr   = isEditing && !hasActualEnd   && (form.projected_end_bad   || !!(form.projected_end   && !isValidDate(form.projected_end)))

  const dateCell = (content) => (
    <div style={{ width: DATE_COL_W, minWidth: DATE_COL_W }} className="px-1.5 py-1 text-xs border-r border-gray-100 flex items-center min-h-[52px]">
      {content}
    </div>
  )

  return (
    <div
      className="flex items-center border-b border-gray-100 transition-colors group"
      style={{ backgroundColor: bgBase }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = bgBase }}
    >
      {/* Frozen panel: label + date columns */}
      <div
        style={{ width: labelW + (showDates ? DATE_COLS_W : 0), minWidth: labelW + (showDates ? DATE_COLS_W : 0), borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
        className="sticky left-0 z-30 flex items-center flex-shrink-0 self-stretch"
      >
        {/* Activity name */}
        <div
          style={{ width: labelW, minWidth: labelW, borderRight: showDates ? '1px solid #e5e7eb' : 'none', backgroundColor: 'inherit' }}
          className="flex items-center pr-2 flex-shrink-0 self-stretch"
        >
          {isChild ? (
            <div className="flex items-center flex-shrink-0" style={{ width: 28, alignSelf: 'stretch', position: 'relative' }}>
              <div className="absolute left-3.5" style={{ top: 0, bottom: isLastChild ? '50%' : 0, width: 1.5, backgroundColor: '#d1d5db' }} />
              <div className="absolute" style={{ left: '14px', top: '50%', width: 10, height: 1.5, backgroundColor: '#d1d5db' }} />
            </div>
          ) : (
            <div className="flex-shrink-0" style={{ width: 28 }} />
          )}
          <span className={`flex-shrink-0 tabular-nums text-right mr-1.5 ${isChild ? 'text-[10px] text-gray-300 w-10' : 'text-xs font-semibold text-gray-400 w-6'}`}>
            {isChild ? seq : `${seq}.`}
          </span>
          {isEditing ? (
            <GInlineInput value={form.milestone_name} onChange={v => setForm(p => ({ ...p, milestone_name: v }))} />
          ) : (
            <p
              className={`text-xs truncate leading-tight flex-1 min-w-0 ${isChild ? 'text-gray-500 pl-0.5' : 'font-bold text-gray-800'}`}
              title={m.milestone_name}
            >
              {m.milestone_name}
            </p>
          )}
          {isAdmin && !isEditing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition ml-1 flex-shrink-0">
              <button onClick={() => onEdit(m)} className="p-1 text-gray-300 hover:text-blue-500 transition">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => onDelete(m.id)} className="p-1 text-gray-300 hover:text-red-500 transition">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          )}
          {isEditing && (
            <div className="flex items-center gap-1 ml-1 flex-shrink-0">
              <button onClick={() => onSave(m.id)} className="text-[10px] font-bold text-[#ed6055] hover:text-[#d94f45] whitespace-nowrap">Save</button>
              <button onClick={onCancelEdit} className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
            </div>
          )}
        </div>

        {/* Date columns */}
        {showDates && (
          <div className="flex self-stretch">
            {dateCell(isEditing
              ? <GInlineInput type="date" value={form.planned_start} onChange={(v, bad) => setForm(p => ({ ...p, planned_start: v, planned_start_bad: !!bad }))} max={form.planned_end || undefined} error={plannedStartErr} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.planned_start)}</span>
            )}
            {dateCell(isEditing
              ? <GInlineInput type="date" value={form.planned_end} onChange={(v, bad) => setForm(p => ({ ...p, planned_end: v, planned_end_bad: !!bad }))} min={form.planned_start || undefined} error={plannedEndErr} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.planned_end)}</span>
            )}
            {dateCell(isEditing
              ? <GInlineInput type="date" value={form.actual_start} onChange={(v, bad) => setForm(p => ({ ...p, actual_start: v, actual_start_bad: !!bad, projected_start: v || p.projected_start }))} max={form.actual_end || undefined} error={actualStartErr} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.actual_start)}</span>
            )}
            {dateCell(isEditing
              ? <GInlineInput type="date" value={form.actual_end} onChange={(v, bad) => setForm(p => ({ ...p, actual_end: v, actual_end_bad: !!bad, projected_end: v || p.projected_end }))} min={form.actual_start || undefined} error={actualEndErr} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.actual_end)}</span>
            )}
            {dateCell(isEditing
              ? <GInlineInput type="date" value={projStartVal} onChange={(v, bad) => setForm(p => ({ ...p, projected_start: v, projected_start_bad: !!bad }))} max={projEndVal || undefined} error={projectedStartErr} disabled={hasActualStart} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.actual_start ?? m.projected_start)}</span>
            )}
            {dateCell(isEditing
              ? <GInlineInput type="date" value={projEndVal} onChange={(v, bad) => setForm(p => ({ ...p, projected_end: v, projected_end_bad: !!bad }))} min={projStartVal || undefined} error={projectedEndErr} disabled={hasActualEnd} />
              : <span className="text-gray-500 whitespace-nowrap text-[11px]">{fmtDate(m.actual_end ?? m.projected_end)}</span>
            )}
          </div>
        )}
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

function GanttChart({ milestones, overrideMin, overrideMax, timeScale = 'month', colPx = 20, labelW = LABEL_W, showDates = true, editId = null, form = {}, setForm = () => {}, onSave = () => {}, onCancelEdit = () => {}, onEdit = () => {}, onDelete = () => {}, isAdmin = false, showToast = () => {}, collapsedPhases = new Set(), onTogglePhase = () => {}, addForm = null, onAddFormChange = () => {}, onAdd = () => {}, adding = false, activeBL = null }) {
  const allDates = milestones
    .flatMap(m => [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end])
    .filter(Boolean)
    .map(d => parseDate(d).getTime())

  const hasDatesFallback = allDates.length === 0
  const rawMin  = hasDatesFallback ? new Date() : new Date(Math.min(...allDates) - PAD)
  const rawMax  = hasDatesFallback ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)) : new Date(Math.max(...allDates) + PAD)
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

  const totalW = labelW + (showDates ? DATE_COLS_W : 0) + chartPxWidth

  const axisHeader = (
    <>
      <div className="flex" style={{ width: totalW, minWidth: totalW, backgroundColor: '#f8fafc' }}>
        <div
          style={{ width: labelW + (showDates ? DATE_COLS_W : 0), minWidth: labelW + (showDates ? DATE_COLS_W : 0), borderRight: '1px solid #e5e7eb', backgroundColor: '#f8fafc', position: 'sticky', left: 0, zIndex: 10 }}
          className="flex-shrink-0 flex items-center"
        >
          {/* Activity name column */}
          <div style={{ width: labelW, minWidth: labelW }} className="flex items-center pl-3 pr-2 self-stretch border-r border-gray-200">
            <span className="text-xs font-bold text-gray-700">Activity</span>
          </div>
          {/* Date group headers — only when visible */}
          {showDates && (
            <div className="flex" style={{ width: DATE_COLS_W }}>
              <div style={{ width: DATE_GROUP_W }} className="flex flex-col items-center justify-center border-r border-gray-200 py-1">
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Planned</span>
                <div className="flex w-full mt-0.5">
                  <span className="flex-1 text-center text-[9px] text-blue-400 border-r border-gray-100">Start</span>
                  <span className="flex-1 text-center text-[9px] text-blue-400">End</span>
                </div>
              </div>
              <div style={{ width: DATE_GROUP_W }} className="flex flex-col items-center justify-center border-r border-gray-200 py-1">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Actual</span>
                <div className="flex w-full mt-0.5">
                  <span className="flex-1 text-center text-[9px] text-red-400 border-r border-gray-100">Start</span>
                  <span className="flex-1 text-center text-[9px] text-red-400">End</span>
                </div>
              </div>
              <div style={{ width: DATE_GROUP_W }} className="flex flex-col items-center justify-center py-1">
                <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Projected</span>
                <div className="flex w-full mt-0.5">
                  <span className="flex-1 text-center text-[9px] text-green-500 border-r border-gray-100">Start</span>
                  <span className="flex-1 text-center text-[9px] text-green-500">End</span>
                </div>
              </div>
            </div>
          )}
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

  const milestoneRows = PHASES.flatMap(({ key, label }) => {
    const phaseMils   = milestones.filter(m => m.phase === key)
    const isCollapsed = collapsedPhases.has(key)
    const rows = []

    // Phase group header
    rows.push(
      <PhaseGroupHeader
        key={`phase-${key}`}
        label={label}
        isCollapsed={isCollapsed}
        onToggle={() => onTogglePhase(key)}
        totalW={totalW}
        labelW={labelW}
        showDates={showDates}
        chartPxWidth={chartPxWidth}
      />
    )

    if (!isCollapsed) {
      const parents = phaseMils.filter(m => !m.parent_id)
      parents.forEach((parent, pi) => {
        const children  = phaseMils.filter(m => m.parent_id === parent.id)
        const m         = children.length ? { ...parent, ...computeParentDates(children) } : parent
        const parentSeq = pi + 1
        rows.push(
          <MilestoneRow
            key={m.id} m={m} seq={String(parentSeq)}
            toPx={toPx} chartPxWidth={chartPxWidth} gridDates={gridDates}
            todayPx={todayPx} showToday={showToday} todayStr={todayStr}
            isChild={false} isLastChild={false} labelW={labelW} showDates={showDates}
            isEditing={editId === m.id} form={form} setForm={setForm}
            onSave={onSave} onCancelEdit={onCancelEdit} onEdit={onEdit} onDelete={onDelete}
            isAdmin={isAdmin}
          />
        )
        children.forEach((child, ci) => rows.push(
          <MilestoneRow
            key={child.id} m={child} seq={`${parentSeq}.${ci + 1}`}
            toPx={toPx} chartPxWidth={chartPxWidth} gridDates={gridDates}
            todayPx={todayPx} showToday={showToday} todayStr={todayStr}
            isChild={true} isLastChild={ci === children.length - 1} labelW={labelW} showDates={showDates}
            isEditing={editId === child.id} form={form} setForm={setForm}
            onSave={onSave} onCancelEdit={onCancelEdit} onEdit={onEdit} onDelete={onDelete}
            isAdmin={isAdmin}
          />
        ))
      })

      // Add-milestone row per phase
      if (isAdmin && activeBL) {
        if (addForm?.phase === key) {
          rows.push(
            <div key={`add-${key}`} className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-gray-100 bg-gray-50"
                 style={{ width: totalW, minWidth: totalW }}>
              <div className="sticky left-0 flex items-center gap-2 flex-wrap bg-gray-50" style={{ minWidth: labelW }}>
                <input
                  autoFocus type="text"
                  value={addForm.milestone_name ?? ''}
                  onChange={e => onAddFormChange(f => ({ ...f, milestone_name: e.target.value }))}
                  placeholder="Milestone name…"
                  className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#ed6055]"
                />
                <button
                  onClick={onAdd} disabled={adding}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-50"
                >{adding ? '…' : 'Save'}</button>
                <button
                  onClick={() => onAddFormChange(null)}
                  className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                >Cancel</button>
              </div>
            </div>
          )
        } else {
          rows.push(
            <div key={`add-btn-${key}`}
                 style={{ width: totalW, minWidth: totalW, height: 32, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f9fafb' }}>
              <div className="sticky left-0" style={{ paddingLeft: 16 }}>
                <button
                  onClick={() => onAddFormChange({ phase: key, milestone_name: '' })}
                  className="text-[11px] font-semibold text-gray-400 hover:text-[#ed6055] transition flex items-center gap-1"
                >
                  <span className="text-base leading-none">+</span> Add milestone
                </button>
              </div>
            </div>
          )
        }
      }
    }

    return rows
  })

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div style={{ width: totalW, minWidth: totalW }}>
        {/* Sticky axis header — only when there are dates to show */}
        {allDates.length > 0 && (
          <div className="sticky top-0 z-40" style={{ backgroundColor: '#f8fafc' }}>
            {axisHeader}
          </div>
        )}
        {/* Rows — phase headers and add buttons always render */}
        {milestoneRows}
        {/* No-dates placeholder — only when baseline is empty */}
        {allDates.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            Add milestones above to see the Gantt chart.
          </div>
        )}
      </div>
    </div>
  )
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const THIS_YEAR   = new Date().getFullYear()
const YEARS       = Array.from({ length: 11 }, (_, i) => THIS_YEAR - 3 + i)

function MonthYearPicker({ value, onChange, min, max, fluid = false }) {
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

  const selectCls = `${fluid ? 'flex-1 min-w-0' : ''} px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white cursor-pointer`

  return (
    <div className={`flex items-center gap-1${fluid ? ' w-full' : ''}`}>
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

export function GanttContent({ project, isAdmin = false, showToast = () => {} }) {
  const [labelW, setLabelW] = useState(() => window.innerWidth < 640 ? 160 : LABEL_W)
  const [baselines, setBaselines]     = useState([])
  const [activeBL, setActiveBL]       = useState(null)
  const [milestones, setMilestones]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [collapsedPhases, setCollapsedPhases] = useState(new Set())
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

  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState({})
  const [deleteId, setDeleteId]   = useState(null)
  const [showDates, setShowDates] = useState(true)
  const [addForm, setAddForm]         = useState(null)  // null = hidden; {} = showing add row
  const [adding, setAdding]           = useState(false)
  const [newBLName, setNewBLName]     = useState('')
  const [showNewBLModal, setShowNewBLModal] = useState(false)
  const [importing, setImporting]               = useState(false)
  const [importErrors, setImportErrors]         = useState([])
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [deleteBLId, setDeleteBLId]             = useState(null)

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
      setAddForm(null)
    }
    loadBaselines()
  }, [project.id])

  const loadMilestones = async (blId) => {
    setLoading(true)
    const { data } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', project.id)
      .eq('baseline_id', blId ?? activeBL)
      .order('sort_order')
    setMilestones(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!activeBL) { setMilestones([]); setLoading(false); return }
    loadMilestones()
  }, [project.id, activeBL])

  const handleSave = async (id) => {
    const actual_start = form.actual_start || null
    const actual_end   = form.actual_end   || null
    const payload = {
      project_id:      project.id,
      phase:           form.phase,
      milestone_name:  form.milestone_name?.trim(),
      planned_start:   form.planned_start   || null,
      planned_end:     form.planned_end     || null,
      actual_start,
      actual_end,
      projected_start: actual_start ?? (form.projected_start || null),
      projected_end:   actual_end   ?? (form.projected_end   || null),
      parent_id:       form.parent_id ?? null,
    }
    if (!payload.milestone_name) return
    if (form.planned_start_bad   || (form.planned_start   && !isValidDate(form.planned_start)))   { showToast('Planned Start is not a valid date.',   'error'); return }
    if (form.planned_end_bad     || (form.planned_end     && !isValidDate(form.planned_end)))     { showToast('Planned End is not a valid date.',     'error'); return }
    if (form.actual_start_bad    || (form.actual_start    && !isValidDate(form.actual_start)))    { showToast('Actual Start is not a valid date.',    'error'); return }
    if (form.actual_end_bad      || (form.actual_end      && !isValidDate(form.actual_end)))      { showToast('Actual End is not a valid date.',      'error'); return }
    if (form.projected_start_bad || (form.projected_start && !isValidDate(form.projected_start))) { showToast('Projected Start is not a valid date.', 'error'); return }
    if (form.projected_end_bad   || (form.projected_end   && !isValidDate(form.projected_end)))   { showToast('Projected End is not a valid date.',   'error'); return }
    if (payload.planned_start   && payload.planned_end   && payload.planned_end   < payload.planned_start)   { showToast('Planned end must be on or after planned start.',   'error'); return }
    if (payload.actual_start    && payload.actual_end    && payload.actual_end    < payload.actual_start)    { showToast('Actual end must be on or after actual start.',     'error'); return }
    if (payload.projected_start && payload.projected_end && payload.projected_end < payload.projected_start) { showToast('Projected end must be on or after projected start.','error'); return }
    const { error } = await supabase.from('project_milestones').update(payload).eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Updated.', 'success')
    setEditId(null)
    loadMilestones()
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('project_milestones').delete().eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Deleted.', 'success')
    loadMilestones()
  }

  const handleEdit = (m) => {
    setForm({
      milestone_name:  m.milestone_name,
      phase:           m.phase,
      planned_start:   m.planned_start   ?? '',
      planned_end:     m.planned_end     ?? '',
      actual_start:    m.actual_start    ?? '',
      actual_end:      m.actual_end      ?? '',
      projected_start: m.actual_start    ?? m.projected_start ?? '',
      projected_end:   m.actual_end      ?? m.projected_end   ?? '',
      parent_id:       m.parent_id       ?? null,
      planned_start_bad: false, planned_end_bad: false,
      actual_start_bad:  false, actual_end_bad:  false,
      projected_start_bad: false, projected_end_bad: false,
    })
    setEditId(m.id)
  }

  const handleAdd = async () => {
    if (!activeBL) { showToast('No baseline selected.', 'error'); return }
    if (!addForm?.phase) return
    if (!addForm?.milestone_name?.trim()) return
    setAdding(true)
    const actual_start = addForm.actual_start || null
    const actual_end   = addForm.actual_end   || null
    const payload = {
      project_id:      project.id,
      baseline_id:     activeBL,
      phase:           addForm.phase,
      milestone_name:  addForm.milestone_name.trim(),
      planned_start:   addForm.planned_start   || null,
      planned_end:     addForm.planned_end     || null,
      actual_start,
      actual_end,
      projected_start: actual_start ?? (addForm.projected_start || null),
      projected_end:   actual_end   ?? (addForm.projected_end   || null),
      sort_order:      milestones.filter(m => m.phase === addForm.phase).length,
    }
    const { error } = await supabase.from('project_milestones').insert(payload)
    setAdding(false)
    if (error) { showToast(error.message, 'error'); return }
    setAddForm(null)
    showToast('Milestone added.', 'success')
    loadMilestones()
  }

  const handleCreateBaseline = async () => {
    const label = newBLName.trim()
    if (!label) return
    const { data, error } = await supabase
      .from('milestone_baselines')
      .insert({ project_id: project.id, label })
      .select('id, label, created_at')
      .single()
    if (error) { showToast(error.message, 'error'); return }
    if (!data) { showToast('Failed to create baseline.', 'error'); return }
    setBaselines(prev => [...prev, data])
    setActiveBL(data.id)
    setAddForm(null)
    setNewBLName('')
    setShowNewBLModal(false)
    showToast(`Baseline "${label}" created.`, 'success')
  }

  const handleExport = async () => {
    const exportRows = []
    PHASES.forEach(({ key: phase }) => {
      const pRows   = milestones.filter(r => r.phase === phase)
      const parents = pRows.filter(r => !r.parent_id)
      parents.forEach(parent => {
        const children = pRows.filter(r => r.parent_id === parent.id)
        if (children.length > 0) {
          children.forEach(c => exportRows.push({ ...c, _parentName: parent.milestone_name }))
        } else {
          exportRows.push({ ...parent, _parentName: null })
        }
      })
    })
    const blLabel = baselines.find(b => b.id === activeBL)?.label ?? ''
    downloadWorkbook([{
      rows: exportRows.map(r => ({
        phase:            MILESTONE_PHASE_MAP_OUT[r.phase] ?? r.phase,
        milestone_name:   r.milestone_name,
        parent_name:      r._parentName ?? '',
        planned_start:    r.planned_start    ?? '',
        planned_end:      r.planned_end      ?? '',
        actual_start:     r.actual_start     ?? '',
        actual_end:       r.actual_end       ?? '',
        projected_start:  r.projected_start  ?? '',
        projected_end:    r.projected_end    ?? '',
      })),
      columns: [
        { key: 'phase',           header: 'Phase' },
        { key: 'milestone_name',  header: 'Milestone Name' },
        { key: 'parent_name',     header: 'Parent Milestone' },
        { key: 'planned_start',   header: 'Planned Start' },
        { key: 'planned_end',     header: 'Planned End' },
        { key: 'actual_start',    header: 'Actual Start' },
        { key: 'actual_end',      header: 'Actual End' },
        { key: 'projected_start', header: 'Projected Start' },
        { key: 'projected_end',   header: 'Projected End' },
      ],
      sheetName: 'Milestones',
    }], `${project.name}_milestones${blLabel ? `_${blLabel}` : ''}.xlsx`)
  }

  const handleImportRequest = (file) => {
    setPendingImportFile(file)
    setNewBLName('')
  }

  const handleImport = async (file, label) => {
    setImporting(true); setImportErrors([])
    try {
      const sheets  = await parseWorkbook(file)
      const pid     = project.id
      const rawRows = sheets['Milestones'] ?? Object.values(sheets)[0] ?? []

      const newRows = []
      let legacyParentName = null
      rawRows.forEach((r, i) => {
        const rawName   = String(r['Milestone Name'] ?? '').trim()
        const parentCol = String(r['Parent Milestone'] ?? '').trim()
        const legacySub = rawName.startsWith('- ')
        const name      = legacySub ? rawName.slice(2).trim() : rawName
        if (!name) return
        const parentName = parentCol || (legacySub ? legacyParentName : null)
        if (!legacySub) legacyParentName = name
        newRows.push({
          project_id:      pid,
          phase:           MILESTONE_PHASE_MAP_IN[r['Phase']] ?? 'initiation',
          milestone_name:  name,
          planned_start:   toDateStr(r['Planned Start']),
          planned_end:     toDateStr(r['Planned End']),
          actual_start:    toDateStr(r['Actual Start']),
          actual_end:      toDateStr(r['Actual End']),
          projected_start: toDateStr(r['Projected Start']),
          projected_end:   toDateStr(r['Projected End']),
          sort_order:      i,
          _parentName:     parentName,
        })
      })

      const errors = []
      rawRows.forEach((r, i) => {
        const rawName = String(r['Milestone Name'] ?? '').trim()
        const name    = rawName.startsWith('- ') ? rawName.slice(2).trim() : rawName
        if (!name) return
        const lbl = `Row ${i + 2} "${name}"`
        if (r['Planned Start']   && !isValidRawDate(r['Planned Start']))   errors.push(`${lbl}: Planned Start is not a valid date.`)
        if (r['Planned End']     && !isValidRawDate(r['Planned End']))     errors.push(`${lbl}: Planned End is not a valid date.`)
        if (r['Actual Start']    && !isValidRawDate(r['Actual Start']))    errors.push(`${lbl}: Actual Start is not a valid date.`)
        if (r['Actual End']      && !isValidRawDate(r['Actual End']))      errors.push(`${lbl}: Actual End is not a valid date.`)
        if (r['Projected Start'] && !isValidRawDate(r['Projected Start'])) errors.push(`${lbl}: Projected Start is not a valid date.`)
        if (r['Projected End']   && !isValidRawDate(r['Projected End']))   errors.push(`${lbl}: Projected End is not a valid date.`)
      })
      if (errors.length === 0) {
        newRows.forEach((r, i) => {
          const lbl = `Row ${i + 2} "${r.milestone_name}"`
          if (r.planned_start   && r.planned_end   && r.planned_end   < r.planned_start)   errors.push(`${lbl}: Planned End cannot be before Planned Start.`)
          if (r.actual_start    && r.actual_end    && r.actual_end    < r.actual_start)    errors.push(`${lbl}: Actual End cannot be before Actual Start.`)
          if (r.projected_start && r.projected_end && r.projected_end < r.projected_start) errors.push(`${lbl}: Projected End cannot be before Projected Start.`)
        })
      }
      if (errors.length > 0) { setImportErrors(errors); return }

      const { data: blData, error: blErr } = await supabase
        .from('milestone_baselines')
        .insert({ project_id: pid, label })
        .select('id').single()
      if (blErr) throw blErr
      const blId = blData.id

      const uniqueParentNames = [...new Set(newRows.map(r => r._parentName).filter(Boolean))]
      const parentNameToDbId = {}
      if (uniqueParentNames.length > 0) {
        const { data: ins, error: pErr } = await supabase
          .from('project_milestones')
          .insert(uniqueParentNames.map((name, i) => ({
            project_id: pid, baseline_id: blId,
            phase: newRows.find(r => r._parentName === name)?.phase ?? 'initiation',
            milestone_name: name, sort_order: -(uniqueParentNames.length - i),
          })))
          .select('id')
        if (pErr) throw pErr
        uniqueParentNames.forEach((name, i) => { parentNameToDbId[name] = ins[i].id })
      }

      const { error: cErr } = await supabase.from('project_milestones').insert(
        newRows.map(({ _parentName, ...rest }) => ({
          ...rest, baseline_id: blId,
          parent_id: _parentName ? (parentNameToDbId[_parentName] ?? null) : null,
        }))
      )
      if (cErr) throw cErr

      const { data: newBLs } = await supabase
        .from('milestone_baselines')
        .select('id, label, created_at')
        .eq('project_id', pid)
        .order('created_at', { ascending: true })
      if (newBLs) { setBaselines(newBLs); setActiveBL(blId); setAddForm(null) }
      showToast(`Imported as "${label}".`, 'success')
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleDeleteBaseline = async (blId) => {
    const { error: mErr } = await supabase.from('project_milestones').delete().eq('baseline_id', blId)
    if (mErr) { showToast(mErr.message, 'error'); return }
    const { error } = await supabase.from('milestone_baselines').delete().eq('id', blId)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Baseline deleted.', 'success')
    const remaining = baselines.filter(b => b.id !== blId)
    setBaselines(remaining)
    setActiveBL(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
    setAddForm(null)
  }

  useEffect(() => {
    const update = () => setLabelW(window.innerWidth < 640 ? 160 : LABEL_W)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const handleTogglePhase = (key) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const overrideMin = fromMonth ? (() => { const [y, m] = fromMonth.split('-').map(Number); return new Date(y, m - 1, 1) })() : null
  const overrideMax = toMonth   ? (() => { const [y, m] = toMonth.split('-').map(Number);   return new Date(y, m, 0) })()    : null
  const hasFilter   = fromMonth || toMonth

  return (
    <>
      <GImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />

      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-100 flex-shrink-0">

        {/* ── Mobile layout (< sm) ── */}
        <div className="flex flex-col gap-2 px-3 py-2.5 sm:hidden">

          {/* Time scale toggle — full width */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg w-full"
            style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
          >
            {TIME_SCALES.map(s => (
              <button
                key={s.key}
                onClick={() => setTimeScale(s.key)}
                className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                style={timeScale === s.key ? {
                  background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                  color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                } : { color: '#6b7280', background: 'transparent' }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Baseline selector — full width (if present) */}
          {baselines.length > 0 && (
            <select
              value={activeBL ?? ''}
              onChange={e => { setActiveBL(e.target.value); setAddForm(null) }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] font-semibold cursor-pointer"
            >
              {baselines.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          )}

          {/* Date range — From / To on one row */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">From</label>
            <div className="flex-1 min-w-0">
              <MonthYearPicker fluid value={fromMonth} onChange={setFromMonth} max={toMonth} />
            </div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">To</label>
            <div className="flex-1 min-w-0">
              <MonthYearPicker fluid value={toMonth} onChange={setToMonth} min={fromMonth} />
            </div>
            {hasFilter && (
              <button
                onClick={() => { setFromMonth(''); setToMonth('') }}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-[#ed6055] transition font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Desktop layout (sm+) ── */}
        <div className="hidden sm:flex items-center gap-3 px-6 py-2.5 flex-wrap">

          {/* Baseline selector */}
          {baselines.length > 0 && (
            <>
              <select
                value={activeBL ?? ''}
                onChange={e => { setActiveBL(e.target.value); setAddForm(null) }}
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

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Show/hide date columns toggle */}
            <button
              onClick={() => setShowDates(v => !v)}
              title={showDates ? 'Hide date columns' : 'Show date columns'}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showDates
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                }
              </svg>
              {showDates ? 'Hide dates' : 'Show dates'}
            </button>

            <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

            {/* Delete baseline */}
            {isAdmin && activeBL && (
              <button
                onClick={() => setDeleteBLId(activeBL)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Del BL
              </button>
            )}

            {/* New BL button */}
            {isAdmin && (
              <button
                onClick={() => { setNewBLName(''); setShowNewBLModal(true) }}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                New BL
              </button>
            )}

            {/* Export/Import */}
            {activeBL && (
              <GExcelButtons
                onExport={handleExport}
                onImport={handleImportRequest}
                importing={importing}
              />
            )}
          </div>
        </div>

      </div>

      {/* Legend — fixed strip, never scrolls */}
      <div className="grid grid-cols-2 sm:flex sm:justify-end gap-x-3 gap-y-1.5 sm:gap-3 px-3 sm:px-6 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 h-3 rounded inline-block flex-shrink-0 bg-gray-400" />Planned
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 h-3 rounded inline-block flex-shrink-0" style={{ backgroundColor: '#86efac' }} />Actual
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 h-3 rounded inline-block flex-shrink-0" style={{ backgroundColor: '#fde047' }} />Projected
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-0.5 h-3.5 flex-shrink-0 bg-[#ed6055] rounded-full" />Today
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col px-0 sm:px-6">
        {loading ? (
          <TriangleLoader label="Loading milestones…" />
        ) : activeBL === null ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 italic">
            No milestone data yet. Import milestones from the project detail view.
          </div>
        ) : (
          <GanttChart
            milestones={milestones}
            overrideMin={overrideMin}
            overrideMax={overrideMax}
            timeScale={timeScale}
            colPx={colPx}
            labelW={labelW}
            showDates={showDates}
            editId={editId}
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancelEdit={() => setEditId(null)}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
            isAdmin={isAdmin}
            showToast={showToast}
            collapsedPhases={collapsedPhases}
            onTogglePhase={handleTogglePhase}
            addForm={addForm}
            onAddFormChange={setAddForm}
            onAdd={handleAdd}
            adding={adding}
            activeBL={activeBL}
          />
        )}
      </div>
      {deleteId !== null && (
        <GConfirmDeleteModal
          onConfirm={() => { handleDelete(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
      {showNewBLModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={() => setShowNewBLModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Name this baseline</h3>
            <p className="text-sm text-gray-500 mb-4">Give a name to identify this baseline (e.g. BL0, Initial, Revised).</p>
            <input
              autoFocus
              type="text"
              value={newBLName}
              onChange={e => setNewBLName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newBLName.trim()) handleCreateBaseline() }}
              placeholder="e.g. BL0"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNewBLModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                disabled={!newBLName.trim()}
                onClick={handleCreateBaseline}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >Create</button>
            </div>
          </div>
        </div>
      )}
      {/* Pending import — name the baseline */}
      {pendingImportFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={() => setPendingImportFile(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Name this baseline</h3>
            <p className="text-sm text-gray-500 mb-4">Give a name to identify this baseline (e.g. BL0, Initial, Revised).</p>
            <input
              autoFocus
              type="text"
              value={newBLName}
              onChange={e => setNewBLName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newBLName.trim()) {
                  const f = pendingImportFile; const l = newBLName.trim()
                  setPendingImportFile(null); handleImport(f, l)
                }
              }}
              placeholder="e.g. BL0"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setPendingImportFile(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                disabled={!newBLName.trim()}
                onClick={() => { const f = pendingImportFile; const l = newBLName.trim(); setPendingImportFile(null); handleImport(f, l) }}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >Import</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete baseline confirm */}
      {deleteBLId !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={() => setDeleteBLId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Delete baseline?</h3>
            <p className="text-sm text-gray-500 mb-1">
              You are about to delete <span className="font-semibold text-gray-700">{baselines.find(b => b.id === deleteBLId)?.label}</span>.
            </p>
            <p className="text-sm text-gray-500 mb-5">All milestones in this baseline will be permanently removed. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteBLId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                onClick={() => { handleDeleteBaseline(deleteBLId); setDeleteBLId(null) }}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function GanttModal({ project, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const phaseColor = PHASE_COLORS[project.phase] ?? '#ed6055'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="relative bg-white flex flex-col overflow-hidden w-full h-full rounded-none sm:rounded-xl sm:w-3/4 sm:h-[90vh] shadow-2xl"
        style={{ borderTop: `4px solid ${phaseColor}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-black leading-tight truncate">{project.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Work Program</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              disabled
              title="Coming soon"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ed6055] text-white cursor-not-allowed select-none opacity-70"
              style={{ boxShadow: '0 2px 8px rgba(237,96,85,0.45), 0 1px 2px rgba(0,0,0,0.1)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M3 21l6.75-6.75M6.75 14.25L3 21m15.75-3.75L21 21M16.5 12a4.5 4.5 0 01-9 0m9 0V9a4.5 4.5 0 00-9 0v3m9 0H7.5" />
              </svg>
              S-Curve
              <span className="text-[9px] font-bold bg-white/25 text-white px-1 py-0.5 rounded leading-none">Soon</span>
            </button>
            <button
              disabled
              title="Coming soon"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#ed6055] text-white cursor-not-allowed select-none opacity-70"
              style={{ boxShadow: '0 2px 8px rgba(237,96,85,0.45), 0 1px 2px rgba(0,0,0,0.1)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Progress Photos
              <span className="text-[9px] font-bold bg-white/25 text-white px-1 py-0.5 rounded leading-none">Soon</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition"
              aria-label="Close"
            >
              <XIcon />
            </button>
          </div>
        </div>
        <GanttContent project={project} />
      </div>
    </div>
  )
}

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
