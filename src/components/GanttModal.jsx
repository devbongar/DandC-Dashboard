import { useState, useEffect, useRef, memo } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toDateStr } from '../lib/excelUtils'
import TriangleLoader from './TriangleLoader'
import { buildTree, isViolated, calcArrowPath, parsePredecessors, formatPredecessors, scheduleMilestones, scheduleProjected } from '../lib/ganttDependencies'
import { buildChildAddForm, computeReorder } from '../lib/ganttUtils'
import { copyTemplateToBaseline, copyBaselineToBaseline } from '../lib/templateUtils'

const PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]

const PHASE_COLORS = {
  initiation:           '#94a3b8',
  planning:             '#64748b',
  execution_monitoring: '#ed6055',
  closeout:             '#22c55e',
}

const TASK_ROW_H  = 52   // px — matches min-h-[52px] on MilestoneRow date cells
const PHASE_ROW_H = 36   // px — collapsible phase group header height
const AXIS_H      = 56   // px — sticky month/year axis header height

const PAD     = 7 * 86400000
const LABEL_W = 320
const ROW_NUM_W  = 36   // # column (sequential row number)
const PRED_COL_W = 96   // Predecessors editable column
const DEFAULT_COL_PX = { day: 20, week: 20, month: 20 }
const DUR_COL_W = 72   // Duration column — visible in Auto mode only

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

function GInlineInput({ value, onChange, type = 'text', placeholder = '', min, max, error, disabled = false, onKeyDown, ghost = false, textClassName = '' }) {
  const resolvedMin = min !== undefined ? min : (type === 'number' ? 0 : undefined)
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => !disabled && onChange(e.target.value, type === 'date' ? e.target.validity.badInput : undefined)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      min={resolvedMin}
      max={max}
      disabled={disabled}
      className={ghost
        ? `w-full px-0.5 py-0 text-xs bg-transparent border-0 outline-none focus:outline-none focus:ring-0 truncate ${textClassName}`
        : `w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 bg-white transition ${
            disabled
              ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
              : error
                ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-600'
                : 'border-gray-200 focus:ring-[#ed6055]'
          }`
      }
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

const BAR_BORDER = {
  '#9ca3af': '#6b7280',
  '#22c55e': '#16a34a',
  '#fde047': '#eab308',
}

const BAR_PRESETS = {
  planned:   ['#9ca3af', '#64748b', '#475569', '#3b82f6', '#8b5cf6'],
  actual:    ['#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#ed6055'],
  projected: ['#fde047', '#f59e0b', '#f97316', '#a855f7', '#64748b'],
}

function GBarColorRow({ label, barKey, value, onChange }) {
  return (
    <div className="flex items-center gap-2.5">
      {label && <span className="text-xs text-gray-500 w-16 flex-shrink-0">{label}</span>}
      <div className="flex items-center gap-1.5">
        {BAR_PRESETS[barKey].map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className="w-4 h-4 rounded-full flex-shrink-0 transition-transform duration-100 active:scale-90"
            style={{
              backgroundColor: c,
              outline: value === c ? '2px solid #374151' : '2px solid transparent',
              outlineOffset: 2,
            }}
          />
        ))}
        <label
          title="Custom color"
          className="w-4 h-4 rounded-full flex-shrink-0 cursor-pointer border-2 overflow-hidden"
          style={{ backgroundColor: value, borderColor: BAR_PRESETS[barKey].includes(value) ? 'transparent' : '#374151' }}
        >
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="opacity-0 absolute w-0 h-0"
          />
        </label>
      </div>
    </div>
  )
}

function InlineAddRow({ depth = 0, name, onChange, onSave, onCancel, adding, totalW }) {
  const inputRef = useRef(null)
  const cancelRef = useRef(false)
  const indent = 12 + depth * 16

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div style={{ width: totalW, minWidth: totalW, height: 38, display: 'flex', alignItems: 'center', borderBottom: '1px solid #d1d5db', background: '#f9fafb' }}>
      <div className="sticky left-0 z-10 flex items-center gap-2" style={{ paddingLeft: indent }}>
        {depth > 0 && (
          <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { if (!cancelRef.current) onSave(); cancelRef.current = false }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onSave() }
            if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; onCancel() }
          }}
          placeholder="Activity name…"
          disabled={adding}
          className="px-2 py-1 text-xs rounded border border-[#ed6055]/50 focus:outline-none focus:ring-1 focus:ring-[#ed6055] bg-white disabled:opacity-60"
          style={{ minWidth: 200 }}
        />
        {adding && <span className="text-[11px] text-gray-400">Saving…</span>}
      </div>
    </div>
  )
}

function GanttBar({ start, end, color, toPx }) {
  if (!start || !end) return null
  const s    = parseDate(start)
  const e    = parseDate(end)
  const left = toPx(s)
  const w    = toPx(e) - left
  const borderColor = BAR_BORDER[color] ?? color
  if (w <= 0) {
    // Same-day milestone → diamond (rotated square), centred on the date
    const size = 11
    return (
      <div
        className="absolute"
        style={{
          left: left - size / 2,
          width: size,
          height: size,
          backgroundColor: color,
          border: `1.5px solid ${borderColor}`,
          top: '50%',
          transform: 'translateY(-50%) rotate(45deg)',
          borderRadius: 2,
          flexShrink: 0,
        }}
        title={start}
      />
    )
  }
  return (
    <div
      className="absolute rounded"
      style={{ left, width: Math.max(w, 2), backgroundColor: color, boxShadow: `inset 0 0 0 1.5px ${borderColor}`, top: '50%', transform: 'translateY(-50%)', height: 20 }}
      title={`${start} → ${end}`}
    />
  )
}

function PhaseGroupHeader({ label, phaseColor = '#94a3b8', isCollapsed, onToggle, totalW, frozenW, chartPxWidth, isAutoMode = false, taskCount = 0, completedCount = 0, onAddTopLevel = null }) {
  const [hovered, setHovered] = useState(false)
  const bg = hovered ? '#e5e7eb' : '#edeeef'
  return (
    <div
      className="flex items-center select-none"
      style={{ width: totalW, minWidth: totalW, height: PHASE_ROW_H, backgroundColor: bg, borderBottom: '1px solid #d1d5db', transition: 'background-color 0.15s ease' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        role="button"
        tabIndex={0}
        className="sticky left-0 z-20 flex items-center gap-1.5 self-stretch flex-shrink-0 cursor-pointer"
        style={{ width: frozenW, minWidth: frozenW, paddingLeft: 12, borderRight: '1px solid #d1d5db', borderLeft: `3px solid ${phaseColor}`, backgroundColor: bg, transition: 'background-color 0.15s ease' }}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <svg
          viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.5}
          style={{ width: 10, height: 10, flexShrink: 0, display: 'block', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s ease' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {label}
        </span>
        {taskCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: completedCount === taskCount ? '#16a34a' : '#94a3b8', background: completedCount === taskCount ? '#dcfce7' : '#e2e8f0', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>
            {completedCount}/{taskCount}
          </span>
        )}
        {onAddTopLevel && (
          <button
            onClick={e => { e.stopPropagation(); onAddTopLevel() }}
            aria-label="Add activity to this phase"
            title="Add activity to this phase"
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1 flex-shrink-0 text-gray-400 hover:text-[#ed6055] transition-all duration-150"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1 }}
          >+</button>
        )}
      </div>
      <div style={{ width: chartPxWidth, minWidth: chartPxWidth, height: '100%', backgroundColor: bg, transition: 'background-color 0.15s ease' }} />
    </div>
  )
}

function PredecessorsCell({ predText, onSave, isAdmin }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(predText)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue(predText)
  }, [predText, editing])

  if (!isAdmin) {
    return (
      <div className="text-xs text-gray-700 px-2 flex items-center min-h-[24px]">
        {predText || <span className="text-gray-500">—</span>}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="text-xs text-gray-700 px-2 py-1 rounded cursor-text min-h-[24px] flex items-center hover:bg-blue-50 hover:text-blue-600 transition"
        title="Click to edit predecessors (e.g. 3FS, 2SS+5)"
      >
        {predText || <span className="text-gray-500 select-none">—</span>}
      </div>
    )
  }

  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (cancelRef.current) { cancelRef.current = false; return }
        setEditing(false); onSave(value)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); cancelRef.current = true; setEditing(false); onSave(value) }
        if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; setEditing(false); setValue(predText) }
      }}
      className="text-xs px-2 py-0.5 rounded border border-[#ed6055] focus:outline-none w-full"
      placeholder="e.g. 3FS,2SS+5"
    />
  )
}

function DurationCell({ duration, hasChildren, onSave, isAdmin }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(duration != null ? String(duration) : '')
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue(duration != null ? String(duration) : '')
  }, [duration, editing])

  if (hasChildren) {
    return <div className="text-xs text-gray-300 px-2 flex items-center min-h-[24px]">—</div>
  }

  if (!isAdmin) {
    return (
      <div className="text-xs text-gray-400 px-2 flex items-center min-h-[24px]">
        {duration != null ? duration : <span className="text-gray-200">—</span>}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="text-xs text-gray-400 px-2 py-1 rounded cursor-text min-h-[24px] flex items-center hover:bg-yellow-50 hover:text-yellow-700 transition"
        title="Click to edit duration (calendar days)"
      >
        {duration != null ? duration : <span className="text-gray-400 select-none">—</span>}
      </div>
    )
  }

  return (
    <input
      autoFocus
      type="number"
      min={1}
      step={1}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (cancelRef.current) { cancelRef.current = false; return }
        setEditing(false)
        onSave(value === '' ? null : Math.max(1, parseInt(value, 10)))
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault(); cancelRef.current = true; setEditing(false)
          onSave(value === '' ? null : Math.max(1, parseInt(value, 10)))
        }
        if (e.key === 'Escape') {
          e.preventDefault(); cancelRef.current = true; setEditing(false)
          setValue(duration != null ? String(duration) : '')
        }
      }}
      className="text-xs px-2 py-0.5 rounded border border-[#ed6055] focus:outline-none w-full"
      placeholder="days"
    />
  )
}

function DateCell({ value, onSave, isAdmin, min, max }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!editing) setVal(value ?? '')
  }, [value, editing])

  if (!isAdmin) {
    return <span className={`whitespace-nowrap text-[11px] ${value ? 'text-gray-700' : 'text-gray-500'}`}>{value ? fmtDate(value) : '—'}</span>
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="text-[11px] whitespace-nowrap px-0.5 rounded cursor-text flex items-center hover:bg-blue-50 transition select-none w-full group"
        title="Click to edit date"
      >
        {value
          ? <span className="text-gray-500 group-hover:text-blue-600 group-hover:underline group-hover:underline-offset-2 group-hover:decoration-dotted transition-colors">{fmtDate(value)}</span>
          : <span className="text-[10px] text-gray-300 group-hover:text-blue-400 transition-colors">+ set date</span>}
      </div>
    )
  }

  return (
    <input
      autoFocus
      type="date"
      value={val}
      min={min}
      max={max}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        if (cancelRef.current) { cancelRef.current = false; return }
        setEditing(false)
        onSave(val || null)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); cancelRef.current = true; setEditing(false); onSave(val || null) }
        if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; setEditing(false); setVal(value ?? '') }
      }}
      className="text-[11px] px-1 py-0.5 rounded border border-[#ed6055] focus:outline-none w-full"
    />
  )
}

function MilestoneRow({ m, rowNum = 0, predText = '', onSavePreds = () => {}, toPx, chartPxWidth, gridDates, todayPx, showToday, todayStr, isChild = false, isLastChild = false, labelW = LABEL_W, durColW = DUR_COL_W, predColW = PRED_COL_W, dateColWidths = { plnStart: DATE_COL_W, plnEnd: DATE_COL_W, actStart: DATE_COL_W, actEnd: DATE_COL_W, projStart: DATE_COL_W, projEnd: DATE_COL_W }, showDuration = true, showPredecessor = true, showPlanned = true, showActual = true, showProjected = true, showPlannedBar = true, showActualBar = true, showProjectedBar = true, draftName = '', onDraftChange = () => {}, onDelete = () => {}, isAdmin = false, depth = 0, hasChildren = false, isCollapsed = false, onToggleCollapse = () => {}, onAddChild = null, isAutoMode = false, isBLConfirmed = false, onSaveDuration = () => {}, onSaveDate = () => {}, barColors = { planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' }, showDragHandle = false }) {
  const hasDates   = [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end].some(Boolean)
  const hasActual  = !!(m.actual_start || m.actual_end)
  const bgBase     = '#ffffff'

  const frozenW = ROW_NUM_W + labelW
    + (showDuration ? durColW : 0)
    + (showPredecessor ? predColW : 0)
    + (showPlanned ? dateColWidths.plnStart + dateColWidths.plnEnd : 0)
    + (showActual ? dateColWidths.actStart + dateColWidths.actEnd : 0)
    + (showProjected ? dateColWidths.projStart + dateColWidths.projEnd : 0)

  const dateCell = (content, w, bg, bl) => (
    <div style={{ width: w, minWidth: w, ...(bg && { backgroundColor: bg }), ...(bl && { borderLeft: bl }) }} className="px-1.5 py-1 text-xs border-r border-gray-200 flex items-center min-h-[52px]">
      {content}
    </div>
  )

  return (
    <div
      className="flex items-center border-b border-gray-200 transition-colors group"
      style={{ backgroundColor: bgBase }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e5e7eb' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = bgBase }}
    >
      {/* Frozen panel: # col + label + optional columns */}
      <div
        style={{ width: frozenW, minWidth: frozenW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
        className="sticky left-0 z-30 flex items-center flex-shrink-0 self-stretch"
      >
        {/* # column */}
        <div
          style={{ width: ROW_NUM_W, minWidth: ROW_NUM_W, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
          className={`flex items-center justify-center flex-shrink-0 self-stretch${showDragHandle ? ' cursor-grab' : ''}`}
          title={showDragHandle ? 'Drag to reorder' : undefined}
        >
          <span className="text-[10px] font-mono text-gray-700 tabular-nums select-none">{rowNum}</span>
        </div>
        {/* Activity name */}
        <div
          style={{ width: labelW, minWidth: labelW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
          className="flex items-center pr-2 flex-shrink-0 self-stretch"
        >
          {/* Depth indent + expand/collapse toggle */}
          <div className="flex items-center flex-shrink-0" style={{ width: 16 + depth * 16 }}>
            {hasChildren ? (
              <button
                onClick={e => { e.stopPropagation(); onToggleCollapse(m.id) }}
                className="flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150"
                style={{ width: 24, height: 24, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4 }}
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                  style={{ width: 10, height: 10, display: 'block', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            ) : (
              <span style={{ width: 24, flexShrink: 0, display: 'inline-block' }} />
            )}
          </div>
          {isAdmin ? (
            <GInlineInput
              value={draftName}
              onChange={onDraftChange}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onRevertDraft() } }}
              ghost
              textClassName={depth > 0 ? 'text-gray-700 pl-0.5' : 'font-bold text-gray-700'}
            />
          ) : (
            <p className={`text-xs truncate leading-tight flex-1 min-w-0 ${depth > 0 ? 'text-gray-700 pl-0.5' : 'font-bold text-gray-700'}`}>
              {m.milestone_name}
            </p>
          )}
          {isAdmin && onAddChild && buildChildAddForm({ id: m.id, phase: m.phase, depth }) !== null && (
            <button
              onClick={e => { e.stopPropagation(); onAddChild(buildChildAddForm({ id: m.id, phase: m.phase, depth })) }}
              aria-label="Add sub-activity"
              title="Add sub-activity here"
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1 flex-shrink-0 text-gray-400 hover:text-[#ed6055] transition-all duration-150"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1 }}
            >+</button>
          )}
          {isAdmin && (
            <button onClick={() => onDelete(m.id)} aria-label="Delete milestone" className="ml-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150 p-2 text-gray-400 hover:text-red-500 transition-colors rounded">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
        {/* Duration column */}
        {showDuration && (
          <div
            style={{ width: durColW, minWidth: durColW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center flex-shrink-0 self-stretch px-1"
          >
            <DurationCell
              duration={m.duration ?? null}
              hasChildren={hasChildren}
              onSave={onSaveDuration}
              isAdmin={isAdmin && !hasActual && !isBLConfirmed}
            />
          </div>
        )}
        {/* Predecessors column */}
        {showPredecessor && (
          <div
            style={{ width: predColW, minWidth: predColW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center flex-shrink-0 self-stretch px-1"
          >
            <PredecessorsCell predText={predText} onSave={onSavePreds} isAdmin={isAdmin && !hasActual && !isBLConfirmed} />
          </div>
        )}

        {/* Date columns — each individually toggled */}
        {(showPlanned || showActual || showProjected) && (
          <div className="flex self-stretch">
            {showPlanned && dateCell(isAutoMode || hasActual || isBLConfirmed
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.planned_start)}</span>
              : <DateCell value={m.planned_start} onSave={v => onSaveDate('planned_start', v)} isAdmin={isAdmin} max={m.planned_end || undefined} />
            , dateColWidths.plnStart)}
            {showPlanned && dateCell(isAutoMode || hasActual || isBLConfirmed
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.planned_end)}</span>
              : <DateCell value={m.planned_end} onSave={v => onSaveDate('planned_end', v)} isAdmin={isAdmin} min={m.planned_start || undefined} />
            , dateColWidths.plnEnd)}
            {showActual && dateCell(
              <DateCell value={m.actual_start} onSave={v => onSaveDate('actual_start', v)} isAdmin={isAdmin} max={m.actual_end || undefined} />
            , dateColWidths.actStart)}
            {showActual && dateCell(
              <DateCell value={m.actual_end} onSave={v => onSaveDate('actual_end', v)} isAdmin={isAdmin} min={m.actual_start || undefined} />
            , dateColWidths.actEnd)}
            {showProjected && dateCell(m.actual_start
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.actual_start)}</span>
              : <DateCell value={m.projected_start} onSave={v => onSaveDate('projected_start', v)} isAdmin={isAdmin} max={m.projected_end || undefined} />
            , dateColWidths.projStart)}
            {showProjected && dateCell(m.actual_end
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.actual_end)}</span>
              : <DateCell value={m.projected_end} onSave={v => onSaveDate('projected_end', v)} isAdmin={isAdmin} min={m.projected_start || undefined} />
            , dateColWidths.projEnd)}
          </div>
        )}
      </div>

      {/* Bar area */}
      <div style={{ width: chartPxWidth, minWidth: chartPxWidth, position: 'relative' }}>
        {!hasDates ? (
          <div className="px-3 flex items-center" style={{ height: 52 }}>
            <span className="text-xs text-gray-400 italic">No dates set</span>
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
            {showPlannedBar && (
              <div className="absolute inset-x-0" style={{ top: 4, height: 20 }}>
                <div className="relative h-full">
                  <GanttBar start={m.planned_start} end={m.planned_end} color={barColors.planned} toPx={toPx} />
                </div>
              </div>
            )}

            {/* Row 2: Projected then Actual */}
            {(showProjectedBar || showActualBar) && (
              <div className="absolute inset-x-0" style={{ top: showPlannedBar ? 25 : 16, height: 20 }}>
                <div className="relative h-full">
                  {showProjectedBar && <GanttBar start={m.projected_start} end={m.projected_end} color={barColors.projected} toPx={toPx} />}
                  {showActualBar && <GanttBar start={m.actual_start} end={m.actual_end || (m.actual_start ? todayStr : null)} color={barColors.actual} toPx={toPx} />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Memoized so SortableMilestoneRow re-renders (from useSortable) don't cascade into the expensive row content
const MilestoneRowMemo = memo(MilestoneRow)

function SortableMilestoneRow({ id, isAdmin, isSelected, onSelect, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        touchAction: isAdmin ? 'none' : undefined,
        boxShadow: isSelected ? 'inset 0 0 0 2px #3b82f6' : undefined,
      }}
      {...(isAdmin ? listeners : {})}
      {...(isAdmin ? attributes : {})}
      onClick={() => onSelect?.(id)}
    >
      <MilestoneRowMemo {...props} isAdmin={isAdmin} showDragHandle={isAdmin} />
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
    while (cur <= maxDate) { if (cur >= minDate) ticks.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1) }
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
    projected_start: minStr(children.map(c => c.actual_start ?? c.projected_start)),
    projected_end:   maxStr(children.map(c => c.projected_end)),
  }
}

function ColsDropdown({ colVisibility, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { key: 'duration',    label: 'Duration' },
    { key: 'predecessor', label: 'Predecessors' },
    { key: 'planned',     label: 'Planned dates' },
    { key: 'actual',      label: 'Actual dates' },
    { key: 'projected',   label: 'Projected dates' },
    { key: 'gantt',       label: 'Gantt chart' },
  ]
  const hiddenCount = items.filter(i => !colVisibility[i.key]).length

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition flex-shrink-0 ${hiddenCount > 0 ? 'border-[#ed6055] text-[#ed6055] bg-red-50 hover:bg-red-100' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Filter Columns
        {hiddenCount > 0 && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none">{hiddenCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 w-48">
          {items.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={colVisibility[key]}
                onChange={e => onChange(prev => ({ ...prev, [key]: e.target.checked }))}
                className="w-3.5 h-3.5 rounded cursor-pointer"
                style={{ accentColor: '#ed6055' }}
              />
              <span className="text-xs text-gray-700 font-medium">{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function BarsDropdown({ barVisibility, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { key: 'planned',   label: 'Planned',   color: '#9ca3af' },
    { key: 'actual',    label: 'Actual',    color: '#22c55e' },
    { key: 'projected', label: 'Projected', color: '#fde047' },
  ]
  const hiddenCount = items.filter(i => !barVisibility[i.key]).length

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition flex-shrink-0 ${hiddenCount > 0 ? 'border-[#ed6055] text-[#ed6055] bg-red-50 hover:bg-red-100' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        Bars
        {hiddenCount > 0 && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none">{hiddenCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 w-40">
          {items.map(({ key, label, color }) => (
            <label key={key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={barVisibility[key]}
                onChange={e => onChange(prev => ({ ...prev, [key]: e.target.checked }))}
                className="w-3.5 h-3.5 rounded cursor-pointer"
                style={{ accentColor: '#ed6055' }}
              />
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-700 font-medium">{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function GToolbarSelect({ options = [], value, onChange, fullWidth = false }) {
  const [open, setOpen]   = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const containerRef      = useRef(null)

  const checkFlip = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropUp(window.innerHeight - rect.bottom < 180)
  }

  const handleToggle = () => { checkFlip(); setOpen(o => !o) }
  const handleBlur   = (e) => { if (!containerRef.current?.contains(e.relatedTarget)) setOpen(false) }

  const dropdownShadow = { boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }
  const selected = options.find(o => o.value === value)

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${fullWidth ? 'w-full' : ''}`} onBlur={handleBlur}>
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center justify-between gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/30 transition-colors cursor-pointer active:scale-[0.97] ${fullWidth ? 'w-full' : ''}`}
      >
        <span>{selected?.label ?? '—'}</span>
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute z-[80] min-w-full bg-white border border-gray-100 rounded-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}
          style={{ animation: 'gmenu-in 150ms ease-out forwards', ...dropdownShadow }}
        >
          <ul className="py-1 text-xs">
            {options.map(opt => (
              <li
                key={opt.value}
                onMouseDown={() => { onChange(opt.value); setOpen(false) }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-100 whitespace-nowrap ${opt.value === value ? 'bg-[#ed6055]/10 text-[#ed6055] font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span className="flex-1">{opt.label}</span>
                {opt.value === value && (
                  <svg className="w-3 h-3 flex-shrink-0 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ColResizeButton({ id, activeId, onToggle, value, presets, onSelect }) {
  return (
    <div style={{ position: 'relative' }} className="flex-shrink-0 ml-1">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(id === activeId ? null : id) }}
        className={`flex items-center justify-center p-0.5 rounded transition-colors ${id === activeId ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
        title="Adjust column width"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
        </svg>
      </button>
      {id === activeId && (
        <div
          style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 200, marginTop: 4, minWidth: 88 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {presets.map(({ label, v }) => (
            <button
              key={v}
              onClick={() => { onSelect(v); onToggle(null) }}
              className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${Math.round(value) === v ? 'bg-blue-500 text-white font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GanttChart({ milestones, overrideMin, overrideMax, timeScale = 'month', colPx = 20, labelW = LABEL_W, setLabelW = () => {}, colVisibility = { duration: true, predecessor: true, planned: true, actual: true, projected: true, gantt: true }, barVisibility = { planned: true, actual: true, projected: true }, barColors = { planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' }, drafts = {}, setDrafts = () => {}, onSave = () => {}, onDelete = () => {}, isAdmin = false, showToast = () => {}, collapsedPhases = new Set(), onTogglePhase = () => {}, inlineAdd = null, inlineAddName = '', onInlineNameChange = () => {}, onInlineSave = () => {}, onInlineCancel = () => {}, inlineAdding = false, onSetInlineAdd = () => {}, activeBL = null, collapsedIds = new Set(), onToggleCollapse = () => {}, dependencies = [], onSavePreds = () => {}, isAutoMode = false, isBLConfirmed = false, onSaveDuration = () => {}, onSaveDate = () => {}, onReorder = () => {}, selectedId = null, onSelect = () => {} }) {
  const [durColW,  setDurColW]  = useState(DUR_COL_W)
  const [predColW, setPredColW] = useState(PRED_COL_W)
  const [dateColWidths, setDateColWidths] = useState({ plnStart: DATE_COL_W, plnEnd: DATE_COL_W, actStart: DATE_COL_W, actEnd: DATE_COL_W, projStart: DATE_COL_W, projEnd: DATE_COL_W })
  const [activeResizeCol, setActiveResizeCol] = useState(null)
  useEffect(() => {
    if (!activeResizeCol) return
    const close = () => setActiveResizeCol(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [activeResizeCol])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 2 } }))
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }

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

  const { duration: showDuration, predecessor: showPredecessor, planned: showPlanned, actual: showActual, projected: showProjected, gantt: showGantt } = colVisibility
  const frozenW = ROW_NUM_W + labelW
    + (showDuration ? durColW : 0)
    + (showPredecessor ? predColW : 0)
    + (showPlanned ? dateColWidths.plnStart + dateColWidths.plnEnd : 0)
    + (showActual ? dateColWidths.actStart + dateColWidths.actEnd : 0)
    + (showProjected ? dateColWidths.projStart + dateColWidths.projEnd : 0)
  const totalW = frozenW + (showGantt ? chartPxWidth : 0)

  // Sequential row numbers for visible task rows (collapsed rows excluded)
  const idToRowNum = new Map()
  {
    let n = 0
    PHASES.forEach(({ key }) => {
      if (!collapsedPhases.has(key)) {
        const phaseMils = milestones.filter(m => m.phase === key)
        buildTree(phaseMils, collapsedIds).forEach(node => {
          n++
          idToRowNum.set(node.id, n)
        })
      }
    })
  }

  const axisHeader = (
    <>
      <div className="flex" style={{ width: totalW, minWidth: totalW, backgroundColor: '#f3f4f6' }}>
        <div
          style={{ width: frozenW, minWidth: frozenW, borderRight: '1px solid #d1d5db', backgroundColor: '#f3f4f6', position: 'sticky', left: 0, zIndex: 10 }}
          className="flex-shrink-0 flex items-center"
        >
          {/* # column header */}
          <div style={{ width: ROW_NUM_W, minWidth: ROW_NUM_W }} className="flex items-center justify-center self-stretch border-r border-gray-300 flex-shrink-0">
            <span className="text-[10px] font-bold text-gray-500">#</span>
          </div>
          {/* Activity name column */}
          <div style={{ width: labelW, minWidth: labelW }} className="flex items-center pl-3 pr-1 self-stretch border-r border-gray-300 flex-shrink-0 gap-1">
            <span className="text-xs font-bold text-gray-700 flex-1 min-w-0">Activity</span>
            <ColResizeButton id="activity" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={labelW}
              presets={[{ label: 'Narrow', v: 200 }, { label: 'Default', v: 320 }, { label: 'Wide', v: 440 }]}
              onSelect={setLabelW} />
          </div>
          {/* Duration — always its own column */}
          {showDuration && (
            <div style={{ width: durColW, minWidth: durColW }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
              <span className="text-xs font-bold text-gray-600">Dur.</span>
              <ColResizeButton id="dur" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={durColW}
                presets={[{ label: 'Narrow', v: 56 }, { label: 'Default', v: 72 }, { label: 'Wide', v: 100 }]}
                onSelect={setDurColW} />
            </div>
          )}
          {/* Predecessors — always its own column */}
          {showPredecessor && (
            <div style={{ width: predColW, minWidth: predColW }} className="flex items-center gap-1 px-2 self-stretch border-r border-gray-300 flex-shrink-0">
              <span className="text-xs font-bold text-gray-600">Pred.</span>
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                title={"Format: <row>FS|SS|FF|SF[+/-days]\nExamples: 3FS (row 3 finish→start), 2SS+5 (row 2 start→start +5 days)\nSeparate multiple predecessors with commas."}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
              </svg>
              <ColResizeButton id="pred" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={predColW}
                presets={[{ label: 'Narrow', v: 72 }, { label: 'Default', v: 96 }, { label: 'Wide', v: 128 }]}
                onSelect={setPredColW} />
            </div>
          )}
          {/* Planned date columns */}
          {showPlanned && (
            <>
              <div style={{ width: dateColWidths.plnStart, minWidth: dateColWidths.plnStart }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Pln. Start</span>
                <ColResizeButton id="plnStart" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.plnStart}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, plnStart: v }))} />
              </div>
              <div style={{ width: dateColWidths.plnEnd, minWidth: dateColWidths.plnEnd }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Pln. End</span>
                <ColResizeButton id="plnEnd" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.plnEnd}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, plnEnd: v }))} />
              </div>
            </>
          )}
          {/* Actual date columns */}
          {showActual && (
            <>
              <div style={{ width: dateColWidths.actStart, minWidth: dateColWidths.actStart }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Act. Start</span>
                <ColResizeButton id="actStart" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.actStart}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, actStart: v }))} />
              </div>
              <div style={{ width: dateColWidths.actEnd, minWidth: dateColWidths.actEnd }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Act. End</span>
                <ColResizeButton id="actEnd" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.actEnd}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, actEnd: v }))} />
              </div>
            </>
          )}
          {/* Projected date columns */}
          {showProjected && (
            <>
              <div style={{ width: dateColWidths.projStart, minWidth: dateColWidths.projStart }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Proj. Start</span>
                <ColResizeButton id="projStart" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.projStart}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, projStart: v }))} />
              </div>
              <div style={{ width: dateColWidths.projEnd, minWidth: dateColWidths.projEnd }} className="flex items-center justify-center gap-1 self-stretch border-r border-gray-300 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-600">Proj. End</span>
                <ColResizeButton id="projEnd" activeId={activeResizeCol} onToggle={setActiveResizeCol} value={dateColWidths.projEnd}
                  presets={[{ label: 'Narrow', v: 80 }, { label: 'Default', v: 100 }, { label: 'Wide', v: 130 }]}
                  onSelect={v => setDateColWidths(w => ({ ...w, projEnd: v }))} />
              </div>
            </>
          )}
        </div>
        {showGantt && <div style={{ width: chartPxWidth, minWidth: chartPxWidth, position: 'relative', overflow: 'hidden' }}>
          {/* Row 1 */}
          <div className="relative" style={{ height: 22 }}>
            {timeScale === 'month' ? (
              years.map((yr, i) => {
                const left = toPx(yr)
                return (
                  <div key={i} className="absolute flex flex-col items-start" style={{ left }}>
                    <div className="w-px h-2 bg-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 whitespace-nowrap ml-1">{yr.getFullYear()}</span>
                  </div>
                )
              })
            ) : (
              months.map((mo, i) => {
                const left = toPx(mo)
                return (
                  <div key={i} className="absolute flex flex-col items-start" style={{ left }}>
                    <div className="w-px h-2 bg-gray-400" />
                    <span className="text-xs font-medium text-gray-600 whitespace-nowrap ml-1">
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
                    <div className="w-px h-1 bg-gray-400" />
                    <span className="text-xs font-medium text-gray-600 whitespace-nowrap leading-none">
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
                      <div className={`w-px bg-gray-400 ${timeScale === 'day' ? 'h-2' : 'h-1'}`} />
                      {showLabel && (
                        <span className={`leading-none ${isWeekend ? 'text-xs font-bold text-[#ed6055]' : 'text-xs font-medium text-gray-600'}`}>
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
        </div>}
      </div>
      <div style={{ width: totalW, minWidth: totalW, borderBottom: '2px solid #d1d5db' }} />
    </>
  )

  // Single flat ID list for the one SortableContext that spans all phases.
  // Must be computed before milestoneRows so it's ready for the JSX below.
  const allSortableIds = []

  const milestoneRows = PHASES.flatMap(({ key, label }) => {
    const phaseMils   = milestones.filter(m => m.phase === key)
    const isCollapsed = collapsedPhases.has(key)
    const rows = []

    // Phase group header — leaf-task completion counts
    const parentIdsInPhase = new Set(phaseMils.filter(m => m.parent_id != null).map(m => m.parent_id))
    const leafMils         = phaseMils.filter(m => !parentIdsInPhase.has(m.id))
    const taskCount        = leafMils.length
    const completedCount   = leafMils.filter(m => m.actual_end).length

    rows.push(
      <PhaseGroupHeader
        key={`phase-${key}`}
        label={label}
        phaseColor={PHASE_COLORS[key] ?? '#94a3b8'}
        isCollapsed={isCollapsed}
        onToggle={() => onTogglePhase(key)}
        totalW={totalW}
        frozenW={frozenW}
        chartPxWidth={showGantt ? chartPxWidth : 0}
        isAutoMode={isAutoMode}
        taskCount={taskCount}
        completedCount={completedCount}
        onAddTopLevel={isAdmin && activeBL ? () => onSetInlineAdd({ phase: key, parentId: null, depth: 0 }) : null}
      />
    )

    if (!isCollapsed) {
      const flatNodes = buildTree(phaseMils, collapsedIds)
      allSortableIds.push(...flatNodes.map(n => n.id))

      rows.push(
        ...flatNodes.flatMap(node => {
          const displayM = (node.hasChildren && node.children.length)
            ? { ...node, ...computeParentDates(node.children) }
            : node
          const rowProps = {
            m: displayM,
            rowNum: idToRowNum.get(node.id) ?? 0,
            predText: formatPredecessors(dependencies.filter(d => d.to_id === node.id), idToRowNum),
            onSavePreds: (text) => onSavePreds(node.id, text),
            depth: node.depth,
            hasChildren: node.hasChildren,
            isCollapsed: collapsedIds.has(node.id),
            onToggleCollapse,
            onAddChild: isAdmin ? (form) => onSetInlineAdd(form) : null,
            toPx, chartPxWidth: showGantt ? chartPxWidth : 0, gridDates,
            todayPx, showToday, todayStr,
            isChild: node.depth > 0, isLastChild: false,
            labelW, durColW, predColW, dateColWidths, showDuration, showPredecessor, showPlanned, showActual, showProjected,
            showPlannedBar: barVisibility.planned, showActualBar: barVisibility.actual, showProjectedBar: barVisibility.projected,
            draftName: drafts[node.id] ?? displayM.milestone_name,
            onDraftChange: (v) => setDrafts(p => ({ ...p, [node.id]: v })),
            onDelete,
            isAdmin,
            isAutoMode,
            isBLConfirmed,
            onSaveDuration: (dur) => onSaveDuration(node.id, dur),
            onSaveDate: (field, value) => onSaveDate(node.id, field, value),
            barColors,
          }
          const items = [<SortableMilestoneRow key={node.id} id={node.id} isAdmin={isAdmin} isSelected={selectedId === node.id} onSelect={onSelect} {...rowProps} />]
          if (inlineAdd?.parentId === node.id) {
            items.push(
              <InlineAddRow key={`inline-${node.id}`} depth={node.depth + 1} name={inlineAddName}
                onChange={onInlineNameChange} onSave={onInlineSave} onCancel={onInlineCancel}
                adding={inlineAdding} totalW={totalW} />
            )
          }
          return items
        }),
        inlineAdd?.parentId === null && inlineAdd?.phase === key
          ? <InlineAddRow key={`inline-top-${key}`} depth={0} name={inlineAddName}
              onChange={onInlineNameChange} onSave={onInlineSave} onCancel={onInlineCancel}
              adding={inlineAdding} totalW={totalW} />
          : null
      )
    }

    return rows
  })

  // Compute y-center of each milestone row for SVG arrow anchoring.
  // Walk the same order that milestoneRows renders: phase header, then flatNodes, then add rows.
  // AXIS_H is NOT included here — the SVG is positioned with top=AXIS_H, so y=0 in SVG = top of first row.
  const yCenterById = {}
  let yAcc = 0
  PHASES.forEach(({ key }) => {
    yAcc += PHASE_ROW_H  // phase group header
    if (!collapsedPhases.has(key)) {
      const phaseMils = milestones.filter(m => m.phase === key)
      const flatNodes = buildTree(phaseMils, collapsedIds)
      flatNodes.forEach(node => {
        yCenterById[node.id] = yAcc + TASK_ROW_H / 2
        yAcc += TASK_ROW_H
        if (inlineAdd?.parentId === node.id) yAcc += 38
      })
      if (inlineAdd?.parentId === null && inlineAdd?.phase === key) yAcc += 38
    }
  })
  const svgH = yAcc

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ width: totalW, minWidth: totalW, position: 'relative' }}>
          {/* Sticky axis header — only when there are dates to show */}
          {allDates.length > 0 && (
            <div className="sticky top-0 z-40" style={{ backgroundColor: '#f3f4f6' }}>
              {axisHeader}
            </div>
          )}
          {/* Rows — phase headers and sortable milestone rows (single SortableContext spans all phases for correct cross-phase collision detection) */}
          <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
            {milestoneRows}
          </SortableContext>
          {allDates.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              Add milestones above to see the Gantt chart.
            </div>
          )}
        </div>
      </DndContext>
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

function BaselineStartDateField({ startDate, isAutoMode, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(startDate ?? '')
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue(startDate ?? '')
  }, [startDate, editing])

  // Start date is useful in both modes — shown always

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">Start</span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-gray-600 hover:text-[#ed6055] transition underline underline-offset-2"
          title="Click to set project start date"
        >
          {startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : <span className="text-gray-400">Not set</span>}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">Start</span>
      <input
        autoFocus
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => {
          if (cancelRef.current) { cancelRef.current = false; return }
          setEditing(false)
          onSave(value)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); cancelRef.current = true; setEditing(false); onSave(value) }
          if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; setEditing(false); setValue(startDate ?? '') }
        }}
        className="text-xs px-2 py-0.5 rounded border border-[#ed6055] focus:outline-none"
      />
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
  const [collapsedIds,     setCollapsedIds]     = useState(new Set())
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

  const [drafts, setDrafts] = useState(() => {
    try { const s = sessionStorage.getItem(`gantt-drafts-${project.id}`); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  useEffect(() => {
    if (Object.keys(drafts).length > 0) sessionStorage.setItem(`gantt-drafts-${project.id}`, JSON.stringify(drafts))
    else sessionStorage.removeItem(`gantt-drafts-${project.id}`)
  }, [drafts])
  const [deleteId, setDeleteId]   = useState(null)
  const [colVisibility, setColVisibility] = useState({ duration: true, predecessor: true, planned: true, actual: true, projected: true, gantt: true })
  const [barVisibility, setBarVisibility] = useState({ planned: true, actual: true, projected: true })
  const [barColors, setBarColors]         = useState({ planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' })
  const [activeTab, setActiveTab]         = useState('gantt')
  const [showSettings, setShowSettings]   = useState(false)
  const [inlineAdd, setInlineAdd]       = useState(null)
  const [inlineAddName, setInlineAddName] = useState('')
  const [inlineAdding, setInlineAdding] = useState(false)
  const [orderDirty, setOrderDirty]     = useState(false)
  const [savingOrder, setSavingOrder]   = useState(false)
  const [selectedId,  setSelectedId]    = useState(null)
  const [dependencies, setDependencies] = useState([])
  const [newBLName, setNewBLName]     = useState('')
  const [showNewBLModal, setShowNewBLModal] = useState(false)
  const [templateCount,  setTemplateCount]  = useState(0)
  const [loadTemplate,   setLoadTemplate]   = useState(true)
  const [creatingBL,     setCreatingBL]     = useState(false)
  const [importing, setImporting]               = useState(false)
  const [importErrors, setImportErrors]         = useState([])
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [deleteBLId, setDeleteBLId]             = useState(null)
  const schedulerRunning = useRef(false)
  const settingsWrapRef  = useRef(null)

  useEffect(() => {
    const loadBaselines = async () => {
      const { data } = await supabase
        .from('milestone_baselines')
        .select('id, label, created_at, scheduling_mode, start_date, confirmed_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })
      const bls = data ?? []
      setBaselines(bls)
      setActiveBL(bls.length > 0 ? bls[bls.length - 1].id : null)
      setInlineAdd(null); setInlineAddName('')
    }
    loadBaselines()
  }, [project.id])

  const loadMilestones = async (blId) => {
    setLoading(true)
    const resolvedId = blId ?? activeBL
    const [{ data: ms }, { data: deps }] = await Promise.all([
      supabase.from('project_milestones').select('*').eq('project_id', project.id).eq('baseline_id', resolvedId).order('sort_order'),
      supabase.from('milestone_dependencies').select('*').eq('baseline_id', resolvedId),
    ])
    const msArr   = ms   ?? []
    const depsArr = deps ?? []

    // Restore any pending sort_order changes from session storage
    const applySessionOrder = (arr) => {
      try {
        const saved = sessionStorage.getItem(`milestone-order-${resolvedId}`)
        if (!saved) return { ms: arr, dirty: false }
        const orderMap = new Map(JSON.parse(saved).map(({ id, sort_order, phase, parent_id }) => [id, { sort_order, phase, parent_id }]))
        return { ms: arr.map(m => orderMap.has(m.id) ? { ...m, ...orderMap.get(m.id) } : m), dirty: true }
      } catch { return { ms: arr, dirty: false } }
    }

    // Auto-recalculate projected dates whenever any row has actual dates
    const hasActuals = msArr.some(m => m.actual_start || m.actual_end)
    if (hasActuals) {
      const projected = scheduleProjected(msArr, depsArr)
      if (projected && !projected.error) {
        const entries = Object.entries(projected)
        if (entries.length) {
          entries.forEach(([id, dates]) =>
            supabase.from('project_milestones')
              .update({ projected_start: dates.projected_start, projected_end: dates.projected_end })
              .eq('id', id)
          )
          const projMap = new Map(entries)
          const merged = msArr.map(m => projMap.has(m.id) ? { ...m, ...projMap.get(m.id) } : m)
          const { ms: finalMs, dirty } = applySessionOrder(merged)
          setMilestones(finalMs)
          setOrderDirty(dirty)
          setDependencies(depsArr)
          setLoading(false)
          return
        }
      }
    }

    const { ms: finalMs, dirty } = applySessionOrder(msArr)
    setMilestones(finalMs)
    setOrderDirty(dirty)
    setDependencies(depsArr)
    setLoading(false)
  }

  useEffect(() => {
    if (!activeBL) { setMilestones([]); setLoading(false); return }
    loadMilestones()
  }, [project.id, activeBL])

  const handleSave = async () => {
    const dirty = Object.entries(drafts).filter(([id, name]) => {
      const m = milestones.find(x => x.id === id)
      return m && name.trim() && name.trim() !== m.milestone_name
    })
    if (!dirty.length) return
    const results = await Promise.all(
      dirty.map(([id, name]) => supabase.from('project_milestones').update({ milestone_name: name.trim() }).eq('id', id))
    )
    const failed = results.filter(r => r.error)
    if (failed.length) { showToast(`${failed.length} error(s) saving.`, 'error'); return }
    setDrafts({})
    showToast(`Saved ${dirty.length} change${dirty.length !== 1 ? 's' : ''}.`, 'success')
    loadMilestones()
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('project_milestones').delete().eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Deleted.', 'success')
    loadMilestones()
  }

  const handleSaveDate = async (milestoneId, field, value) => {
    const updates = { [field]: value || null }
    // When actual start/end is set, sync projected if not already filled
    if (field === 'actual_start' && value) {
      const m = milestones.find(x => x.id === milestoneId)
      if (!m?.projected_start) updates.projected_start = value
    }
    if (field === 'actual_end' && value) {
      const m = milestones.find(x => x.id === milestoneId)
      if (!m?.projected_end) updates.projected_end = value
    }
    const { error } = await supabase.from('project_milestones').update(updates).eq('id', milestoneId)
    if (error) { showToast(error.message, 'error'); return }
    if (field === 'actual_start' || field === 'actual_end') {
      // loadMilestones will recalculate projected dates for all downstream tasks
      loadMilestones()
    } else if (isAutoMode && blStartDate) {
      await runScheduler()
    } else {
      loadMilestones()
    }
  }

  const handleInlineSave = async () => {
    if (!activeBL || !inlineAdd?.phase || !inlineAddName.trim()) {
      setInlineAdd(null); setInlineAddName(''); return
    }
    setInlineAdding(true)
    try {
      const parentId = inlineAdd.parentId ?? null
      let sort_order = 0
      if (parentId) {
        const { data: sibs } = await supabase
          .from('project_milestones').select('sort_order')
          .eq('parent_id', parentId).order('sort_order', { ascending: false }).limit(1)
        sort_order = sibs?.length ? (sibs[0].sort_order ?? 0) + 1 : 0
      } else {
        const { data: sibs } = await supabase
          .from('project_milestones').select('sort_order')
          .eq('baseline_id', activeBL).eq('phase', inlineAdd.phase).is('parent_id', null)
          .order('sort_order', { ascending: false }).limit(1)
        sort_order = sibs?.length ? (sibs[0].sort_order ?? 0) + 1 : 0
      }
      const { error } = await supabase.from('project_milestones').insert({
        project_id:     project.id,
        baseline_id:    activeBL,
        phase:          inlineAdd.phase,
        parent_id:      parentId,
        milestone_name: inlineAddName.trim(),
        sort_order,
      })
      if (error) { showToast(error.message, 'error'); return }
      setInlineAdd(null); setInlineAddName('')
      showToast('Activity added.', 'success')
      await loadMilestones()
    } finally {
      setInlineAdding(false)
    }
  }

  const handleInlineCancel = () => { setInlineAdd(null); setInlineAddName('') }

  const applyReorderState = (newMs) => {
    setMilestones(newMs)
    setOrderDirty(true)
    try {
      sessionStorage.setItem(
        `milestone-order-${activeBL}`,
        JSON.stringify(newMs.map(m => ({ id: m.id, sort_order: m.sort_order, phase: m.phase, parent_id: m.parent_id })))
      )
    } catch {}
  }

  const handleReorder = (activeId, overId) => {
    const activeNode = milestones.find(m => m.id === activeId)
    const overNode   = milestones.find(m => m.id === overId)
    if (!activeNode || !overNode || activeId === overId) return

    const samePhase  = activeNode.phase === overNode.phase
    const sameParent = activeNode.parent_id === overNode.parent_id
    let newMs

    if (samePhase && sameParent) {
      // Same parent group: reorder siblings
      const reordered = computeReorder(milestones, activeId, overId)
      if (!reordered) return
      const orderMap = new Map(reordered.map((m, i) => [m.id, i]))
      newMs = milestones.map(m => orderMap.has(m.id) ? { ...m, sort_order: orderMap.get(m.id) } : m)

    } else if (samePhase && !sameParent) {
      // Same phase, different parent: reparent active to over's parent
      const newParentId = overNode.parent_id
      const srcSiblings = milestones
        .filter(m => m.phase === activeNode.phase && m.parent_id === activeNode.parent_id && m.id !== activeId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const destSiblings = milestones
        .filter(m => m.phase === overNode.phase && m.parent_id === newParentId && m.id !== activeId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const overIdx = destSiblings.findIndex(m => m.id === overId)
      const insertAt = overIdx === -1 ? destSiblings.length : overIdx
      const newDestOrder = [
        ...destSiblings.slice(0, insertAt),
        activeNode,
        ...destSiblings.slice(insertAt),
      ]
      const updateMap = new Map()
      newDestOrder.forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: newParentId, phase: activeNode.phase }))
      srcSiblings.forEach((m, i)  => updateMap.set(m.id, { sort_order: i, parent_id: activeNode.parent_id, phase: m.phase }))
      newMs = milestones.map(m => {
        const upd = updateMap.get(m.id)
        return upd ? { ...m, ...upd } : m
      })

    } else if (!samePhase && activeNode.parent_id === null) {
      // Cross-phase: top-level rows only; cascade phase to all descendants
      const getDescendants = (id) => {
        const children = milestones.filter(m => m.parent_id === id)
        return children.flatMap(c => [c, ...getDescendants(c.id)])
      }
      const descendants = getDescendants(activeId)
      const destPhase   = overNode.phase
      const destSiblings = milestones
        .filter(m => m.phase === destPhase && m.parent_id === null && m.id !== activeId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const overIdx  = destSiblings.findIndex(m => m.id === overId)
      const insertAt = overIdx === -1 ? destSiblings.length : overIdx
      const newDestOrder = [
        ...destSiblings.slice(0, insertAt),
        activeNode,
        ...destSiblings.slice(insertAt),
      ]
      const srcSiblings = milestones
        .filter(m => m.phase === activeNode.phase && m.parent_id === null && m.id !== activeId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const updateMap = new Map()
      newDestOrder.forEach((m, i) => updateMap.set(m.id, { sort_order: i, phase: destPhase, parent_id: null }))
      srcSiblings.forEach((m, i)  => updateMap.set(m.id, { sort_order: i, phase: m.phase, parent_id: null }))
      descendants.forEach(d       => updateMap.set(d.id, { sort_order: d.sort_order, phase: destPhase, parent_id: d.parent_id }))
      newMs = milestones.map(m => {
        const upd = updateMap.get(m.id)
        return upd ? { ...m, ...upd } : m
      })

    } else {
      return // child cross-phase: not supported
    }

    applyReorderState(newMs)
  }

  const handleIndent = (id) => {
    const node = milestones.find(m => m.id === id)
    if (!node || !isAdmin || !activeBL) return
    // Build flat visible order to find the row immediately above
    const flatNodes = PHASES.flatMap(({ key }) => {
      if (collapsedPhases.has(key)) return []
      return buildTree(milestones.filter(m => m.phase === key), collapsedIds)
    })
    const idx = flatNodes.findIndex(n => n.id === id)
    if (idx <= 0) return
    const above = flatNodes[idx - 1]
    if (above.phase !== node.phase) return   // don't indent across phases
    if (above.depth >= 3) return             // MAX_DEPTH
    const newParentId = above.id
    const oldSiblings = milestones
      .filter(m => m.phase === node.phase && m.parent_id === node.parent_id && m.id !== id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const newSortOrder = milestones.filter(m => m.parent_id === newParentId).length
    const updateMap = new Map()
    updateMap.set(id, { parent_id: newParentId, sort_order: newSortOrder, phase: node.phase })
    oldSiblings.forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: m.parent_id, phase: m.phase }))
    applyReorderState(milestones.map(m => { const u = updateMap.get(m.id); return u ? { ...m, ...u } : m }))
  }

  const handleOutdent = (id) => {
    const node = milestones.find(m => m.id === id)
    if (!node || !isAdmin || !activeBL || node.parent_id === null) return
    const parent = milestones.find(m => m.id === node.parent_id)
    if (!parent) return
    const newParentId = parent.parent_id
    const oldSiblings = milestones
      .filter(m => m.parent_id === node.parent_id && m.id !== id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const newSiblings = milestones
      .filter(m => m.parent_id === newParentId && m.id !== id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const parentIdx = newSiblings.findIndex(m => m.id === parent.id)
    const newOrder = [
      ...newSiblings.slice(0, parentIdx + 1),
      node,
      ...newSiblings.slice(parentIdx + 1),
    ]
    const updateMap = new Map()
    newOrder.forEach((m, i)    => updateMap.set(m.id, { sort_order: i, parent_id: newParentId, phase: node.phase }))
    oldSiblings.forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: node.parent_id, phase: m.phase }))
    applyReorderState(milestones.map(m => { const u = updateMap.get(m.id); return u ? { ...m, ...u } : m }))
  }

  // Tab / Shift+Tab to indent / outdent the selected row
  useEffect(() => {
    if (!selectedId || !isAdmin || !activeBL) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setSelectedId(null); return }
      if (e.key !== 'Tab') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      e.preventDefault()
      e.shiftKey ? handleOutdent(selectedId) : handleIndent(selectedId)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, milestones, collapsedPhases, collapsedIds, isAdmin, activeBL])

  const handleSaveOrder = async () => {
    setSavingOrder(true)
    try {
      const { error } = await Promise.all(
        milestones.map(m =>
          supabase.from('project_milestones').update({ sort_order: m.sort_order, phase: m.phase, parent_id: m.parent_id }).eq('id', m.id)
        )
      ).then(results => results.find(r => r.error) ?? {})
      if (error) { showToast(error.message, 'error'); return }
      try { sessionStorage.removeItem(`milestone-order-${activeBL}`) } catch {}
      setOrderDirty(false)
      showToast('Row order saved.', 'success')
    } finally {
      setSavingOrder(false)
    }
  }

  const handleDiscardOrder = () => {
    try { sessionStorage.removeItem(`milestone-order-${activeBL}`) } catch {}
    setOrderDirty(false)
    loadMilestones()
  }

  const handleOpenNewBLModal = async () => {
    setNewBLName('')
    setLoadTemplate(true)
    setShowNewBLModal(true)
    // Template option is only relevant when creating the very first baseline
    if (baselines.length === 0) {
      const { count } = await supabase
        .from('work_program_template_tasks')
        .select('*', { count: 'exact', head: true })
      setTemplateCount(count ?? 0)
    }
  }

  const handleCreateBaseline = async () => {
    const label = newBLName.trim()
    if (!label || creatingBL) return
    setCreatingBL(true)
    const { data, error } = await supabase
      .from('milestone_baselines')
      .insert({ project_id: project.id, label, scheduling_mode: 'auto', start_date: null })
      .select('id, label, created_at, scheduling_mode, start_date')
      .single()
    if (error) { showToast(error.message, 'error'); setCreatingBL(false); return }
    if (!data) { showToast('Failed to create baseline.', 'error'); setCreatingBL(false); return }

    if (baselines.length > 0) {
      // BL1+: copy everything from the currently active baseline
      const sourceLabel = baselines.find(b => b.id === activeBL)?.label ?? 'previous baseline'
      const { error: copyErr } = await copyBaselineToBaseline(activeBL, data.id, supabase, project.id)
      if (copyErr) {
        showToast(`Baseline created but copy failed: ${copyErr}`, 'error')
      } else {
        showToast(`"${label}" created from ${sourceLabel}. Edit as needed.`, 'success')
      }
    } else if (loadTemplate && templateCount > 0) {
      // BL0 with template: copy from the standard work program template
      const { error: copyErr } = await copyTemplateToBaseline(data.id, supabase, project.id, null)
      if (copyErr) {
        showToast(`Baseline created but template copy failed: ${copyErr}`, 'error')
      } else {
        showToast(`"${label}" created with standard work program.`, 'success')
      }
    } else {
      showToast(`"${label}" created.`, 'success')
    }

    setBaselines(prev => [...prev, data])
    setActiveBL(data.id)
    setInlineAdd(null); setInlineAddName('')
    setNewBLName('')
    setShowNewBLModal(false)
    setCreatingBL(false)
    // No explicit loadMilestones here — setActiveBL triggers the useEffect which loads milestones
  }

  const handleExport = async () => {
    const allVisible = buildTree(milestones, new Set())

    const buildSeqForExport = (node, allNodes) => {
      const siblings = allNodes.filter(x => x.parent_id === node.parent_id && x.phase === node.phase)
      const idx = siblings.indexOf(node) + 1
      if (!node.parent_id) return String(idx)
      const parentNode = allNodes.find(x => x.id === node.parent_id)
      return parentNode ? `${buildSeqForExport(parentNode, allNodes)}.${idx}` : String(idx)
    }

    const exportRows = allVisible.map(node => {
      const parentNode = node.parent_id ? allVisible.find(x => x.id === node.parent_id) : null
      return {
        seq:             buildSeqForExport(node, allVisible),
        phase:           MILESTONE_PHASE_MAP_OUT?.[node.phase] ?? node.phase,
        milestone_name:  node.milestone_name,
        parent_name:     parentNode?.milestone_name ?? '',
        planned_start:   node.planned_start   ?? '',
        planned_end:     node.planned_end     ?? '',
        actual_start:    node.actual_start    ?? '',
        actual_end:      node.actual_end      ?? '',
        projected_start: node.projected_start ?? '',
        projected_end:   node.projected_end   ?? '',
      }
    })

    const blLabel = baselines.find(b => b.id === activeBL)?.label ?? ''
    downloadWorkbook([{
      rows: exportRows,
      columns: [
        { key: 'seq',             header: 'Seq' },
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
        .select('id, label, created_at, scheduling_mode, start_date, confirmed_at')
        .eq('project_id', pid)
        .order('created_at', { ascending: true })
      if (newBLs) { setBaselines(newBLs); setActiveBL(blId); setInlineAdd(null); setInlineAddName('') }
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
    setInlineAdd(null); setInlineAddName('')
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

  const handleToggleCollapse = (id) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const computeRowNumToId = () => {
    const map = new Map()
    let n = 0
    PHASES.forEach(({ key }) => {
      if (!collapsedPhases.has(key)) {
        const phaseMils = milestones.filter(m => m.phase === key)
        buildTree(phaseMils, collapsedIds).forEach(node => {
          n++
          map.set(n, node.id)
        })
      }
    })
    return map
  }

  const handleSavePreds = async (milestoneId, text) => {
    const rowNumToId = computeRowNumToId()
    const parsed = parsePredecessors(text, rowNumToId)
    if (parsed === null) {
      showToast('Invalid format — use row numbers and types, e.g. 3FS or 2SS+5', 'error')
      return
    }
    if (parsed.some(p => p.fromId === milestoneId)) {
      showToast('A task cannot be its own predecessor.', 'error')
      return
    }
    const current = dependencies.filter(d => d.to_id === milestoneId)
    const toDelete = current.filter(c =>
      !parsed.some(p => p.fromId === c.from_id && p.type === c.type && (c.lag_days ?? 0) === p.lagDays)
    )
    const toInsert = parsed.filter(p =>
      !current.some(c => c.from_id === p.fromId && c.type === p.type && (c.lag_days ?? 0) === p.lagDays)
    )
    if (!toDelete.length && !toInsert.length) return
    for (const dep of toDelete) {
      const { error } = await supabase.from('milestone_dependencies').delete().eq('id', dep.id)
      if (error) { showToast(error.message, 'error'); await loadMilestones(activeBL); return }
    }
    for (const p of toInsert) {
      const { error } = await supabase.from('milestone_dependencies').insert({
        project_id:  project.id,
        baseline_id: activeBL,
        from_id:     p.fromId,
        to_id:       milestoneId,
        type:        p.type,
        lag_days:    p.lagDays,
      })
      if (error) { showToast(error.message, 'error'); await loadMilestones(activeBL); return }
    }
    if (isAutoMode && blStartDate) {
      await runScheduler()
    } else if (!isBLConfirmed) {
      // Manual mode, unconfirmed BL — cascade planned dates just like a duration change
      const schedStart = blStartDate
        || milestones.map(m => m.planned_start).filter(Boolean).sort()[0]
        || null
      if (schedStart) {
        await runScheduler(schedStart)
      } else {
        await loadMilestones(activeBL)
        showToast('Predecessors updated.', 'success')
      }
    } else {
      await loadMilestones(activeBL)
      showToast('Predecessors updated.', 'success')
    }
  }

  const activeBLObj    = baselines.find(b => b.id === activeBL) ?? null
  const isAutoMode     = activeBLObj?.scheduling_mode === 'auto'
  const blStartDate    = activeBLObj?.start_date ?? null
  const isBLConfirmed  = !!(activeBLObj?.confirmed_at)

  const handleSaveStartDate = async (isoDate) => {
    const val = isoDate || null
    const { error } = await supabase
      .from('milestone_baselines')
      .update({ start_date: val })
      .eq('id', activeBL)
    if (error) { showToast(error.message, 'error'); return }
    setBaselines(prev => prev.map(b => b.id === activeBL ? { ...b, start_date: val } : b))
    if (val) {
      await runScheduler(val)
    }
  }

  const handleConfirmBaseline = async () => {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('milestone_baselines')
      .update({ confirmed_at: now })
      .eq('id', activeBL)
    if (error) { showToast(error.message, 'error'); return }
    setBaselines(prev => prev.map(b => b.id === activeBL ? { ...b, confirmed_at: now } : b))
    const label = activeBLObj?.label ?? 'Baseline'
    showToast(`"${label}" locked and finalised. Planning fields are now read-only.`, 'success')
  }

  const handleSaveMode = async (newMode) => {
    const { error } = await supabase
      .from('milestone_baselines')
      .update({ scheduling_mode: newMode })
      .eq('id', activeBL)
    if (error) { showToast(error.message, 'error'); return }
    setBaselines(prev => prev.map(b => b.id === activeBL ? { ...b, scheduling_mode: newMode } : b))
    if (newMode === 'auto') {
      if (!blStartDate) {
        showToast('Set a start date to generate the schedule.', 'info')
        return
      }
      await runScheduler(blStartDate)
    }
  }

  const runScheduler = async (startDateOverride) => {
    if (schedulerRunning.current) return false
    schedulerRunning.current = true
    try {
      const startDate = startDateOverride ?? blStartDate
      if (!startDate || !activeBL) return false

      const [{ data: ms }, { data: deps }] = await Promise.all([
        supabase.from('project_milestones').select('*').eq('project_id', project.id).eq('baseline_id', activeBL).order('sort_order'),
        supabase.from('milestone_dependencies').select('*').eq('baseline_id', activeBL),
      ])

      const result = scheduleMilestones(ms ?? [], deps ?? [], startDate)

      if (result?.error === 'circular') {
        showToast('Circular dependency detected — schedule not updated.', 'error')
        return false
      }

      const entries = Object.entries(result)
      if (!entries.length) {
        loadMilestones()
        return true
      }

      const results = await Promise.all(
        entries.map(([id, dates]) =>
          supabase.from('project_milestones')
            .update({ planned_start: dates.planned_start, planned_end: dates.planned_end })
            .eq('id', id)
        )
      )
      const failed = results.filter(r => r.error)
      if (failed.length) {
        showToast(`Schedule partially failed (${failed.length} row${failed.length > 1 ? 's' : ''} not updated).`, 'error')
      } else {
        showToast('Schedule updated.', 'success')
      }
      loadMilestones()
      return !failed.length
    } finally {
      schedulerRunning.current = false
    }
  }

  const handleSaveDuration = async (milestoneId, duration) => {
    const { error } = await supabase
      .from('project_milestones')
      .update({ duration: duration ?? null })
      .eq('id', milestoneId)
    if (error) { showToast(error.message, 'error'); return }
    // Use baseline start date, or fall back to earliest planned_start already set
    const schedStart = blStartDate
      || milestones.map(m => m.planned_start).filter(Boolean).sort()[0]
      || null
    if (schedStart) {
      await runScheduler(schedStart)
    } else {
      loadMilestones()
      showToast('Set a project start date to auto-calculate planned dates.', 'info')
    }
  }

  const overrideMin = fromMonth ? (() => { const [y, m] = fromMonth.split('-').map(Number); return new Date(y, m - 1, 1) })() : null
  const overrideMax = toMonth   ? (() => { const [y, m] = toMonth.split('-').map(Number);   return new Date(y, m, 0) })()    : null
  const hasFilter   = fromMonth || toMonth

  useEffect(() => {
    if (!showSettings) return
    const handler = (e) => {
      if (settingsWrapRef.current && !settingsWrapRef.current.contains(e.target)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  return (
    <>
      <style>{`
        @keyframes gmenu-in { from { opacity:0; transform:scale(0.95) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes gsettings-in { from { opacity:0; transform:scale(0.97) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
      <GImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 flex-shrink-0">

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
            <GToolbarSelect
              fullWidth
              value={activeBL ?? ''}
              onChange={v => { setActiveBL(v); setInlineAdd(null); setInlineAddName('') }}
              options={baselines.map(b => ({ value: b.id, label: b.label }))}
            />
          )}

          {/* Start date — always visible (used by scheduler in both Auto and Manual mode) */}
          {activeBL && (
            <div className="flex items-center gap-2">
              <BaselineStartDateField
                startDate={blStartDate}
                isAutoMode={isAutoMode}
                onSave={handleSaveStartDate}
              />
            </div>
          )}
          {activeBL && (
            <GToolbarSelect
              fullWidth
              value={activeBLObj?.scheduling_mode ?? 'auto'}
              onChange={v => handleSaveMode(v)}
              options={[{ value: 'auto', label: 'Auto schedule' }, { value: 'manual', label: 'Manual dates' }]}
            />
          )}

          {/* Date range — From / To on one row */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">From</label>
            <div className="flex-1 min-w-0">
              <MonthYearPicker fluid value={fromMonth} onChange={setFromMonth} max={toMonth} />
            </div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex-shrink-0">To</label>
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

        {/* ── Desktop layout (sm+) — settings button + status ── */}
        <div className="hidden sm:flex items-center justify-between px-6 py-2 relative" ref={settingsWrapRef}>

          {/* Left: active baseline status pill */}
          <div className="flex items-center gap-2 min-w-0">
            {activeBLObj ? (
              <span className="text-xs font-semibold text-gray-700 truncate max-w-[240px]">{activeBLObj.label}</span>
            ) : (
              <span className="text-xs text-gray-400 italic">No baseline selected</span>
            )}
            {isBLConfirmed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold flex-shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                Locked
              </span>
            )}
          </div>

          {/* Right: Settings button */}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-150 active:scale-[0.97] flex-shrink-0 ${
              showSettings
                ? 'bg-[#ed6055] text-white border-[#ed6055] shadow-sm'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            aria-label="Toggle settings"
          >
            {/* Sliders icon */}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Settings
          </button>

          {/* ── Settings panel ── */}
          {showSettings && (
            <div
              className="absolute right-4 top-full mt-2 z-50 bg-white rounded-2xl border border-gray-100 overflow-hidden"
              style={{
                width: 348,
                boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                animation: 'gsettings-in 180ms cubic-bezier(0.23,1,0.32,1) both',
                transformOrigin: 'top right',
              }}
            >
              {/* ── Baseline ── */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Baseline</p>
                {baselines.length > 0 ? (
                  <GToolbarSelect
                    fullWidth
                    value={activeBL ?? ''}
                    onChange={v => { setActiveBL(v); setInlineAdd(null); setInlineAddName('') }}
                    options={baselines.map(b => ({ value: b.id, label: b.label }))}
                  />
                ) : (
                  <p className="text-xs text-gray-400 italic">No baselines yet</p>
                )}
              </div>

              {/* ── Scheduling (only if baseline active) ── */}
              {activeBL && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2.5">Scheduling</p>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0">Start date</span>
                      <BaselineStartDateField
                        startDate={blStartDate}
                        isAutoMode={isAutoMode}
                        onSave={handleSaveStartDate}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0">Mode</span>
                      <GToolbarSelect
                        fullWidth
                        value={activeBLObj?.scheduling_mode ?? 'auto'}
                        onChange={v => handleSaveMode(v)}
                        options={[{ value: 'auto', label: 'Auto schedule' }, { value: 'manual', label: 'Manual dates' }]}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Display ── */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2.5">Display</p>

                {/* Time scale */}
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Time scale</span>
                  <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-1">
                    {TIME_SCALES.map(s => (
                      <button
                        key={s.key}
                        onClick={() => setTimeScale(s.key)}
                        className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all duration-150 active:scale-[0.97] ${
                          timeScale === s.key
                            ? 'bg-[#ed6055] text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date range */}
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Date range</span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="flex-1 min-w-0"><MonthYearPicker fluid value={fromMonth} onChange={setFromMonth} max={toMonth} /></div>
                    <span className="text-[10px] text-gray-300 flex-shrink-0">→</span>
                    <div className="flex-1 min-w-0"><MonthYearPicker fluid value={toMonth} onChange={setToMonth} min={fromMonth} /></div>
                    {hasFilter && (
                      <button
                        onClick={() => { setFromMonth(''); setToMonth('') }}
                        className="text-xs text-gray-400 hover:text-[#ed6055] transition font-medium flex-shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Column width */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 flex-shrink-0">Col width</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setColPx(v => Math.max(10, v - 5))}
                        className="px-2.5 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50 hover:text-black transition leading-none"
                        aria-label="Decrease column width"
                      >−</button>
                      <span className="px-2 text-[11px] font-semibold text-gray-700 tabular-nums border-x border-gray-200 min-w-[42px] text-center">{colPx}px</span>
                      <button
                        onClick={() => setColPx(v => Math.min(120, v + 5))}
                        className="px-2.5 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50 hover:text-black transition leading-none"
                        aria-label="Increase column width"
                      >+</button>
                    </div>
                    {!isDefaultWidth && (
                      <button
                        onClick={resetColPx}
                        className="text-[11px] text-gray-400 hover:text-[#ed6055] transition-colors font-medium underline underline-offset-2"
                      >
                        reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Column visibility ── */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Columns</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {[
                    { key: 'duration',    label: 'Duration' },
                    { key: 'predecessor', label: 'Predecessors' },
                    { key: 'planned',     label: 'Planned' },
                    { key: 'actual',      label: 'Actual' },
                    { key: 'projected',   label: 'Projected' },
                    { key: 'gantt',       label: 'Gantt chart' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 py-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={colVisibility[key]}
                        onChange={e => setColVisibility(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded cursor-pointer flex-shrink-0"
                        style={{ accentColor: '#ed6055' }}
                      />
                      <span className="text-xs text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Bar visibility + colors ── */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Bars</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { key: 'planned',   label: 'Planned',  colorKey: 'planned'   },
                    { key: 'actual',    label: 'Actual',   colorKey: 'actual'    },
                    { key: 'projected', label: 'Forecast', colorKey: 'projected' },
                  ].map(({ key, label, colorKey }) => (
                    <div key={key} className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={barVisibility[key]}
                          onChange={e => setBarVisibility(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-3.5 h-3.5 rounded cursor-pointer flex-shrink-0"
                          style={{ accentColor: '#ed6055' }}
                        />
                        <span className="text-xs text-gray-700">{label}</span>
                      </label>
                      <GBarColorRow
                        label=""
                        barKey={colorKey}
                        value={barColors[colorKey]}
                        onChange={c => setBarColors(p => ({ ...p, [colorKey]: c }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Baseline actions (admin only) ── */}
              {isAdmin && (
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2.5">Baseline actions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeBL && !isBLConfirmed && (
                      <button
                        onClick={handleConfirmBaseline}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 transition active:scale-[0.97]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Lock & Finalise BL
                      </button>
                    )}
                    <button
                      onClick={handleOpenNewBLModal}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition active:scale-[0.97]"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      New Baseline
                    </button>
                    {activeBL && (
                      <GExcelButtons
                        onExport={handleExport}
                        onImport={handleImportRequest}
                        importing={importing}
                      />
                    )}
                    {activeBL && (
                      <button
                        onClick={() => setDeleteBLId(activeBL)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition active:scale-[0.97]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete BL
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>


      {/* Save strip — unsaved name edits */}
      {Object.keys(drafts).length > 0 && (
        <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-[#ed6055]/20 border-l-4 border-l-[#ed6055] flex-shrink-0" style={{ background: 'rgba(237,96,85,0.06)' }}>
          <svg className="w-3.5 h-3.5 text-[#ed6055] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-xs text-gray-500 flex-1 min-w-0">
            <span className="font-semibold text-gray-800">{Object.keys(drafts).length}</span> unsaved change{Object.keys(drafts).length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#ed6055] text-white text-xs font-semibold hover:bg-[#d94f45] transition-colors active:scale-[0.97] flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Save all
          </button>
          <button
            onClick={() => setDrafts({})}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors active:scale-[0.97] flex-shrink-0"
          >
            Discard
          </button>
        </div>
      )}

      {/* Save strip — unsaved row order */}
      {orderDirty && (
        <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-blue-200 border-l-4 border-l-blue-400 flex-shrink-0" style={{ background: 'rgba(59,130,246,0.05)' }}>
          <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          <span className="text-xs text-gray-500 flex-1 min-w-0">Row order has unsaved changes</span>
          <button
            onClick={handleSaveOrder}
            disabled={savingOrder}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition-colors active:scale-[0.97] disabled:opacity-60 flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {savingOrder ? 'Saving…' : 'Save order'}
          </button>
          <button
            onClick={handleDiscardOrder}
            disabled={savingOrder}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors active:scale-[0.97] disabled:opacity-60 flex-shrink-0"
          >
            Discard
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col px-0 sm:px-6">
        {loading ? (
          <TriangleLoader label="Loading milestones…" />
        ) : activeBL === null ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No work program yet</p>
              <p className="text-xs text-gray-400">Create a baseline to start building the schedule.</p>
            </div>
            {isAdmin && (
              <button
                onClick={handleOpenNewBLModal}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition-colors duration-200 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                New Baseline
              </button>
            )}
          </div>
        ) : (
          <GanttChart
            milestones={milestones}
            overrideMin={overrideMin}
            overrideMax={overrideMax}
            timeScale={timeScale}
            colPx={colPx}
            labelW={labelW}
            setLabelW={setLabelW}
            colVisibility={colVisibility}
            barVisibility={barVisibility}
            barColors={barColors}
            drafts={drafts}
            setDrafts={setDrafts}
            onSave={handleSave}
            onDelete={(id) => setDeleteId(id)}
            isAdmin={isAdmin}
            showToast={showToast}
            collapsedPhases={collapsedPhases}
            onTogglePhase={handleTogglePhase}
            inlineAdd={inlineAdd}
            inlineAddName={inlineAddName}
            onInlineNameChange={setInlineAddName}
            onInlineSave={handleInlineSave}
            onInlineCancel={handleInlineCancel}
            inlineAdding={inlineAdding}
            onSetInlineAdd={setInlineAdd}
            activeBL={activeBL}
            collapsedIds={collapsedIds}
            onToggleCollapse={handleToggleCollapse}
            dependencies={dependencies}
            onSavePreds={handleSavePreds}
            isAutoMode={isAutoMode}
            isBLConfirmed={isBLConfirmed}
            onSaveDuration={handleSaveDuration}
            onSaveDate={handleSaveDate}
            onReorder={handleReorder}
            selectedId={selectedId}
            onSelect={setSelectedId}
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
            <h3 className="text-base font-bold text-black mb-1">
              {baselines.length > 0 ? 'Update Baseline' : 'New Baseline'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {baselines.length > 0
                ? `Give the revised baseline a name. It will be a copy of "${baselines.find(b => b.id === activeBL)?.label ?? 'current baseline'}" that you can then edit.`
                : 'Give a name to identify this baseline (e.g. BL0, Initial, Revised).'}
            </p>
            <input
              autoFocus
              type="text"
              value={newBLName}
              onChange={e => setNewBLName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newBLName.trim()) handleCreateBaseline() }}
              placeholder={baselines.length > 0 ? 'e.g. BL1' : 'e.g. BL0'}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] mb-4"
            />
            {/* Template option — only when creating the very first baseline */}
            {baselines.length === 0 && templateCount > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-700 mb-2">Load standard work program?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLoadTemplate(true)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${loadTemplate ? 'border-[#ed6055] bg-red-50 text-[#ed6055]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Yes — Pre-fill with template
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoadTemplate(false)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${!loadTemplate ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                  >
                    No — Start blank
                  </button>
                </div>
              </div>
            )}
            {/* Reminder note — updating an existing baseline */}
            {baselines.length > 0 && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-800 leading-relaxed">
                Only update the baseline when there are actual schedule revisions. If the current baseline still reflects the approved plan, a new baseline is not needed.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowNewBLModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                disabled={!newBLName.trim() || creatingBL}
                onClick={handleCreateBaseline}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >{creatingBL ? 'Creating…' : 'Create'}</button>
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

export default function GanttModal({ project, onClose, isAdmin = false, showToast = () => {} }) {
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
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition"
              aria-label="Close"
            >
              <XIcon />
            </button>
          </div>
        </div>
        <GanttContent project={project} isAdmin={isAdmin} showToast={showToast} />
      </div>
    </div>
  )
}

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
