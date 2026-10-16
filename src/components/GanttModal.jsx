import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toDateStr } from '../lib/excelUtils'
import TriangleLoader from './TriangleLoader'
import { buildTree, isViolated, calcArrowPath, parsePredecessors, formatPredecessors, scheduleMilestones, scheduleProjected, expandDependencies } from '../lib/ganttDependencies'
import { buildChildAddForm, computeReorder } from '../lib/ganttUtils'
import { copyTemplateToBaseline } from '../lib/templateUtils'
import SearchDropdown from './SearchDropdown'
import useProfile from '../hooks/useProfile'

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

const TASK_ROW_H  = 52   // px -- matches min-h-[52px] on MilestoneRow date cells
const PHASE_ROW_H = 36   // px -- collapsible phase group header height
const AXIS_H      = 56   // px -- sticky month/year axis header height

const PAD     = 7 * 86400000
const LABEL_W = 320
const ROW_NUM_W  = 36   // # column (sequential row number)
const SEL_W      = 30   // selection tick box, left of the # column
const PRED_COL_W = 96   // Predecessors editable column
const DEFAULT_COL_PX = { day: 20, week: 20, month: 20 }
const MOBILE_DEFAULT_COL_PX = { day: 30, week: 30, month: 30 }
const getDefaultColPx = () => window.innerWidth < 640 ? MOBILE_DEFAULT_COL_PX : DEFAULT_COL_PX
const DUR_COL_W = 72   // Duration column -- visible in Auto mode only

const DATE_COL_W   = 100  // width of each individual date cell (px)
const DATE_GROUP_W = DATE_COL_W * 2  // two cols per group (start + end)
const DATE_COLS_W  = DATE_GROUP_W * 3  // three groups: planned, actual, projected

const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '--'

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

function GInlineInput({ value, onChange, type = 'text', placeholder = '', min, max, error, disabled = false, onKeyDown, ghost = false, textClassName = '', dataRow }) {
  const resolvedMin = min !== undefined ? min : (type === 'number' ? 0 : undefined)
  return (
    <input
      type={type}
      data-name-cell={dataRow}
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={onCancel}>
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
          Import blocked -- {errors.length} error{errors.length !== 1 ? 's' : ''} found. Fix the file and try again.
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

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const BAR_BORDER = {
  '#9ca3af': '#d1d5db',
  '#22c55e': '#86efac',
  '#fde047': '#fef08a',
  '#bfccd9': '#a8bbc9',
  '#a8d5b5': '#86c49a',
  '#f5e6a3': '#ead87a',
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

// Collapse/expand to a chosen depth. Rendered through a portal: the grid
// scrolls horizontally, and a dropdown inside that container gets clipped.
function GLevelMenu({ maxLevel, onPick }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // The menu is in a portal, so it is not inside the button -- without
    // checking it too, mousedown on an item closed the menu before its click
    const close = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 170) })
    setOpen(v => !v)
  }

  const pick = (level) => { onPick(level); setOpen(false) }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Collapse or expand to a level"
        aria-label="Collapse or expand to a level"
        className="flex-shrink-0 px-1 text-gray-300 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 170 }}
          className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden py-1"
        >
          <button onClick={() => pick('all')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition">
            Expand all
          </button>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map(lvl => (
            <button key={lvl} onClick={() => pick(lvl)} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition">
              Show level {lvl}{lvl === 1 ? ' only' : ' and above'}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
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

export function GanttBar({ start, end, color, toPx }) {
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
        {predText || <span className="text-gray-500">--</span>}
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
        {predText || <span className="text-gray-500 select-none">--</span>}
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
    return <div className="text-xs text-gray-300 px-2 flex items-center min-h-[24px]">--</div>
  }

  if (!isAdmin) {
    return (
      <div className="text-xs text-gray-400 px-2 flex items-center min-h-[24px]">
        {duration != null ? duration : <span className="text-gray-200">--</span>}
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
        {duration != null ? duration : <span className="text-gray-400 select-none">--</span>}
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
    return <span className={`whitespace-nowrap text-[11px] ${value ? 'text-gray-700' : 'text-gray-500'}`}>{value ? fmtDate(value) : '--'}</span>
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
          : <span className="text-[10px] text-gray-300 group-hover:text-blue-400 transition-colors">--</span>}
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

function RemDurCell({ remDur, plannedStart, plannedEnd, projectedEnd, projectedStart, actualStart, hasChildren, isAdmin, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const cancelRef = useRef(false)

  // Compute display value: stored rem_dur, else derive from proj dates, else BL dur
  const displayVal = (() => {
    if (remDur != null) return remDur
    const ps = projectedStart || actualStart
    if (ps && projectedEnd) return Math.round((new Date(projectedEnd + 'T00:00:00') - new Date(ps + 'T00:00:00')) / 86400000)
    if (plannedStart && plannedEnd) return Math.round((new Date(plannedEnd + 'T00:00:00') - new Date(plannedStart + 'T00:00:00')) / 86400000)
    return null
  })()

  useEffect(() => {
    if (!editing) setValue(displayVal != null ? String(displayVal) : '')
  }, [displayVal, editing])

  if (hasChildren) {
    return <span className="text-xs tabular-nums text-gray-400">--</span>
  }

  if (!isAdmin) {
    return <span className="text-xs tabular-nums text-gray-700">{displayVal != null ? displayVal : <span className="text-gray-200">--</span>}</span>
  }

  if (!editing) {
    return (
      <div
        onClick={() => { setValue(displayVal != null ? String(displayVal) : ''); setEditing(true) }}
        className="text-xs tabular-nums px-0.5 rounded cursor-text flex items-center justify-center hover:bg-blue-50 transition select-none w-full group"
        title="Click to edit remaining duration (calendar days)"
      >
        {displayVal != null
          ? <span className="text-gray-700 group-hover:text-blue-600 group-hover:underline group-hover:underline-offset-2 group-hover:decoration-dotted transition-colors">{displayVal}</span>
          : <span className="text-gray-300 group-hover:text-blue-400 transition-colors text-[10px]">--</span>}
      </div>
    )
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (cancelRef.current) { cancelRef.current = false; return }
        setEditing(false)
        const parsed = value.trim() === '' ? null : parseInt(value, 10)
        onSave(isNaN(parsed) ? null : parsed)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); cancelRef.current = true; setEditing(false); const parsed = value.trim() === '' ? null : parseInt(value, 10); onSave(isNaN(parsed) ? null : parsed) }
        if (e.key === 'Escape') { cancelRef.current = true; setEditing(false); setValue(displayVal != null ? String(displayVal) : '') }
      }}
      className="text-xs px-1 py-0.5 rounded border border-[#ed6055] focus:outline-none w-full tabular-nums text-center"
    />
  )
}

function MilestoneRow({ m, rowNum = 0, isSelected = false, onToggleSelect = null, predText = '', onSavePreds = () => {}, toPx, chartPxWidth, gridDates, todayPx, showToday, todayStr, isChild = false, isLastChild = false, rowNumW = ROW_NUM_W, labelW = LABEL_W, durColW = DUR_COL_W, remDurColW = DUR_COL_W, predColW = PRED_COL_W, dateColWidths = { plnStart: DATE_COL_W, plnEnd: DATE_COL_W, actStart: DATE_COL_W, actEnd: DATE_COL_W, projStart: DATE_COL_W, projEnd: DATE_COL_W }, showDuration = true, showRemDur = true, showPredecessor = true, showPlanned = true, showActual = true, showProjected = true, showPlannedBar = true, showActualBar = true, showProjectedBar = true, showBarLabels = true, draftName = '', onDraftChange = () => {}, onDelete = () => {}, isAdmin = false, canEdit = false, depth = 0, hasChildren = false, isCollapsed = false, onToggleCollapse = () => {}, onAddChild = null, isAutoMode = false, isBLConfirmed = false, onSaveDuration = () => {}, onSaveDate = () => {}, onSaveRemDur = () => {}, barColors = { planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' }, showDragHandle = false, dataDate = '', rowIndex = 0, selCols = null, inSelRange = false, onCellMouseDown = null, onCellMouseEnter = null }) {
  const hasDates   = [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end].some(Boolean)
  const hasActual  = !!(m.actual_start || m.actual_end)

  const hasViolation = !!dataDate && (
    (m.actual_start    && m.actual_start    > dataDate) ||
    (m.actual_end      && m.actual_end      > dataDate) ||
    (!m.actual_start   && m.projected_start && m.projected_start < dataDate) ||
    (!m.actual_end     && m.projected_end   && m.projected_end   < dataDate)
  )

  const bgBase     = hasViolation ? '#fff1f2' : '#ffffff'
  const bgHover    = hasViolation ? '#fecdd3' : '#e5e7eb'

  const frozenW = (onToggleSelect ? SEL_W : 0) + rowNumW + labelW
    + (showDuration ? durColW : 0)
    + (showRemDur ? remDurColW : 0)
    + (showPredecessor ? predColW : 0)
    + (showPlanned ? dateColWidths.plnStart + dateColWidths.plnEnd : 0)
    + (showActual ? dateColWidths.actStart + dateColWidths.actEnd : 0)
    + (showProjected ? dateColWidths.projStart + dateColWidths.projEnd : 0)

  // A cell is lit when its column falls inside the selected span and its row
  // is in range -- selCols is [from, to] as indexes into PASTEABLE_ORDER
  const cellSelected = (col) => {
    if (!col || !inSelRange || !selCols) return false
    const i = PASTEABLE_ORDER.indexOf(col)
    return i >= selCols[0] && i <= selCols[1]
  }
  const dateCell = (content, w, bg, bl, col = null) => (
    <div
      data-cell-col={col ?? undefined}
      data-cell-row={col ? rowIndex : undefined}
      style={{
        width: w, minWidth: w,
        ...(bg && { backgroundColor: bg }),
        ...(bl && { borderLeft: bl }),
        ...(cellSelected(col) && {
          backgroundColor: 'rgba(237,96,85,0.12)',
          boxShadow: 'inset 0 0 0 1px rgba(237,96,85,0.45)',
        }),
      }}
      className="px-1.5 py-1 text-xs border-r border-gray-200 flex items-center min-h-[52px]"
      onPointerDown={col && onCellMouseDown ? (e) => e.stopPropagation() : undefined}
      onClick={col && onCellMouseDown ? (e) => e.stopPropagation() : undefined}
      onMouseDown={col && onCellMouseDown ? () => onCellMouseDown(col, rowIndex) : undefined}
      onMouseEnter={col && onCellMouseEnter ? () => onCellMouseEnter(col, rowIndex) : undefined}
    >
      {content}
    </div>
  )

  return (
    <div
      className="flex items-center border-b border-gray-200 transition-colors group"
      style={{ backgroundColor: isSelected ? '#eff6ff' : bgBase, ...(hasViolation && { borderLeft: '3px solid #f43f5e' }) }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = bgHover }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = bgBase }}
    >
      {/* Frozen panel: # col + label + optional columns */}
      <div
        style={{ width: frozenW, minWidth: frozenW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
        className="sticky left-0 z-30 flex items-center flex-shrink-0 self-stretch"
      >
        {/* Selection column -- always present so rows can be picked without
            first entering a mode, and so the tick boxes line up as a column */}
        {onToggleSelect && (
          <div
            style={{ width: SEL_W, minWidth: SEL_W, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center justify-center flex-shrink-0 self-stretch"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="w-3.5 h-3.5 accent-[#ed6055] cursor-pointer"
              aria-label={`Select row ${rowNum}`}
            />
          </div>
        )}
        {/* # column */}
        {rowNumW > 0 && (
          <div
            style={{ width: rowNumW, minWidth: rowNumW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className={`flex items-center justify-center flex-shrink-0 self-stretch${showDragHandle ? ' cursor-grab' : ''}`}
            title={showDragHandle ? 'Drag to reorder' : undefined}
          >
            <span className="text-[10px] font-mono text-gray-700 tabular-nums select-none">{rowNum}</span>
          </div>
        )}
        {/* Activity name */}
        {labelW > 0 && (
        <div
          data-cell-col="name"
          data-cell-row={rowIndex}
          style={{
            width: labelW, minWidth: labelW, borderRight: '1px solid #e5e7eb',
            backgroundColor: cellSelected('name') ? 'rgba(237,96,85,0.12)' : 'inherit',
            boxShadow: cellSelected('name') ? 'inset 0 0 0 1px rgba(237,96,85,0.45)' : undefined,
          }}
          className="flex items-center pr-2 flex-shrink-0 self-stretch"
          // keep dnd-kit (listeners live on the whole row) from turning a cell
          // drag-select into a row reorder -- the # column stays the drag handle
          onPointerDown={onCellMouseDown ? (e) => e.stopPropagation() : undefined}
          onClick={onCellMouseDown ? (e) => e.stopPropagation() : undefined}
          onMouseDown={onCellMouseDown ? () => onCellMouseDown('name', rowIndex) : undefined}
          onMouseEnter={onCellMouseEnter ? () => onCellMouseEnter('name', rowIndex) : undefined}
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
              dataRow={rowIndex}
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
        )}
        {/* Duration column */}
        {showDuration && (
          <div
            style={{ width: durColW, minWidth: durColW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center justify-center flex-shrink-0 self-stretch px-1"
          >
            {(() => {
              if (!m.planned_start || !m.planned_end) return <span className="text-xs text-gray-200">--</span>
              const days = Math.round((new Date(m.planned_end) - new Date(m.planned_start)) / 86400000)
              return <span className="text-xs tabular-nums text-gray-700">{days}</span>
            })()}
          </div>
        )}
        {/* Rem. Dur. column */}
        {showRemDur && (
          <div
            style={{ width: remDurColW, minWidth: remDurColW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center justify-center flex-shrink-0 self-stretch px-1"
          >
            <RemDurCell
              remDur={m.rem_dur}
              plannedStart={m.planned_start}
              plannedEnd={m.planned_end}
              projectedEnd={m.projected_end}
              projectedStart={m.projected_start}
              actualStart={m.actual_start}
              hasChildren={hasChildren}
              isAdmin={canEdit}
              onSave={onSaveRemDur}
            />
          </div>
        )}
        {/* Predecessors column */}
        {showPredecessor && (
          <div
            style={{ width: predColW, minWidth: predColW, borderRight: '1px solid #e5e7eb', backgroundColor: 'inherit' }}
            className="flex items-center flex-shrink-0 self-stretch px-1"
          >
            <PredecessorsCell predText={predText} onSave={onSavePreds} isAdmin={canEdit && !hasActual && !isBLConfirmed} />
          </div>
        )}

        {/* Date columns -- each individually toggled */}
        {(showPlanned || showActual || showProjected) && (
          <div className="flex self-stretch">
            {showPlanned && dateCell(
              <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.planned_start)}</span>
            , dateColWidths.plnStart)}
            {showPlanned && dateCell(
              <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.planned_end)}</span>
            , dateColWidths.plnEnd)}
            {showActual && dateCell(
              <DateCell value={m.actual_start} onSave={v => onSaveDate('actual_start', v)} isAdmin={canEdit} max={m.actual_end || undefined} />
            , dateColWidths.actStart, undefined, undefined, canEdit ? 'actual_start' : null)}
            {showActual && dateCell(
              <DateCell value={m.actual_end} onSave={v => onSaveDate('actual_end', v)} isAdmin={canEdit} min={m.actual_start || undefined} />
            , dateColWidths.actEnd, undefined, undefined, canEdit ? 'actual_end' : null)}
            {showProjected && dateCell(m.actual_start
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.actual_start)}</span>
              : <DateCell value={m.projected_start} onSave={v => onSaveDate('projected_start', v)} isAdmin={canEdit} max={m.projected_end || undefined} />
            , dateColWidths.projStart, undefined, undefined, (canEdit && !m.actual_start) ? 'projected_start' : null)}
            {showProjected && dateCell(m.actual_end
              ? <span className="text-gray-700 whitespace-nowrap text-[11px]">{fmtDate(m.actual_end)}</span>
              : <DateCell value={m.projected_end} onSave={v => onSaveDate('projected_end', v)} isAdmin={canEdit} min={m.projected_start || undefined} />
            , dateColWidths.projEnd, undefined, undefined, (canEdit && !m.actual_end) ? 'projected_end' : null)}
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
                  {/* Once the activity has actually finished the forecast is moot --
                      drop the bar rather than leaving a stale tail past the actual end */}
                  {/* Once work has actually started the forecast runs from that date
                      (matching the Projected Start column), and once it has actually
                      finished the forecast is moot so the bar drops entirely */}
                  {showProjectedBar && !m.actual_end && <GanttBar start={m.actual_start || m.projected_start} end={m.projected_end} color={barColors.projected} toPx={toPx} />}
                  {showActualBar && <GanttBar start={m.actual_start} end={m.actual_end || (m.actual_start ? todayStr : null)} color={barColors.actual} toPx={toPx} />}
                </div>
              </div>
            )}

            {/* Activity label to the right of the rightmost bar */}
            {showBarLabels && (() => {
              const ends = [
                showPlannedBar   && m.planned_end,
                showActualBar    && (m.actual_end || (m.actual_start ? todayStr : null)),
                showProjectedBar && !m.actual_end && m.projected_end,
              ].filter(Boolean)
              if (!ends.length) return null
              const rightmostPx = Math.max(...ends.map(d => toPx(parseDate(d))))
              return (
                <span
                  className="absolute text-[10px] text-gray-500 whitespace-nowrap leading-none pointer-events-none select-none"
                  style={{ left: rightmostPx + 5, top: '50%', transform: 'translateY(-50%)' }}
                >
                  {m.milestone_name}
                </span>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// Memoized so SortableMilestoneRow re-renders (from useSortable) don't cascade into the expensive row content
const MilestoneRowMemo = memo(MilestoneRow)

function SortableMilestoneRow({ id, isAdmin, canEdit, isSelected, onSelect, disableDrag = false, ...props }) {
  // Modifier keys decide whether a click replaces the selection, adds to it,
  // or extends from the anchor -- the row itself does not need to know which
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const dragActive = isAdmin && !disableDrag
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        touchAction: dragActive ? 'none' : undefined,
        boxShadow: isSelected ? 'inset 0 0 0 2px #3b82f6' : undefined,
      }}
      {...(dragActive ? listeners : {})}
      {...(dragActive ? attributes : {})}
      onClick={(e) => onSelect?.(id, { additive: e.ctrlKey || e.metaKey, range: e.shiftKey })}
    >
      <MilestoneRowMemo
        {...props}
        isAdmin={isAdmin}
        canEdit={canEdit}
        showDragHandle={dragActive}
        isSelected={isSelected}
        onToggleSelect={isAdmin ? () => onSelect?.(id, { additive: true }) : null}
      />
    </div>
  )
}

// Columns that support drag-select + spreadsheet paste. Planned dates are derived,
// so they stay read-only here.
// Left-to-right display order. A drag across columns selects everything
// between two of these, so the order has to match what the eye sees.
const PASTEABLE_ORDER = ['name', 'actual_start', 'actual_end', 'projected_start', 'projected_end']
const PASTEABLE_COLS = new Set(PASTEABLE_ORDER)
const colIdx = (c) => PASTEABLE_ORDER.indexOf(c)

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
  // Recursively resolve each child's effective dates bottom-up before rolling up
  const resolved = children.map(c =>
    c.children?.length ? { ...c, ...computeParentDates(c.children) } : c
  )
  return {
    planned_start:   minStr(resolved.map(c => c.planned_start)),
    planned_end:     maxStr(resolved.map(c => c.planned_end)),
    actual_start:    minStr(resolved.map(c => c.actual_start)),
    actual_end:      resolved.every(c => c.actual_end) ? maxStr(resolved.map(c => c.actual_end)) : null,
    projected_start: minStr(resolved.map(c => c.actual_start ?? c.projected_start)),
    projected_end:   maxStr(resolved.map(c => c.projected_end)),
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
    { key: 'duration',    label: 'BL Duration' },
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

function GToolbarSelect({ options = [], value, onChange, fullWidth = false, ghost = false }) {
  const [open, setOpen]     = useState(false)
  const [dropStyle, setDropStyle] = useState({})
  const containerRef        = useRef(null)

  const handleToggle = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropUp = spaceBelow < 180
      setDropStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 999999,
        ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      })
    }
    setOpen(o => !o)
  }
  const handleBlur = (e) => { if (!containerRef.current?.contains(e.relatedTarget)) setOpen(false) }

  const dropdownShadow = { boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }
  const selected = options.find(o => o.value === value)

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${fullWidth ? 'w-full' : ''}`} onBlur={handleBlur}>
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center justify-between gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:outline-none transition-colors cursor-pointer active:scale-[0.97] ${fullWidth ? 'w-full' : ''} ${ghost ? 'border border-white/10 text-white hover:bg-white/5' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-[#ed6055]/30'}`}
        style={ghost ? { background: 'rgba(255,255,255,0.02)' } : undefined}
      >
        <span className="truncate">{selected?.label ?? '--'}</span>
        <svg className={`w-3 h-3 flex-shrink-0 ${ghost ? 'text-white/60' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      </button>
      {open && createPortal(
        <div
          className="bg-white border border-gray-100 rounded-xl overflow-hidden"
          style={{ animation: 'gmenu-in 150ms ease-out forwards', ...dropdownShadow, ...dropStyle }}
        >
          <ul className="py-1 text-xs max-h-48 overflow-y-auto">
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
        </div>,
        document.body
      )}
    </div>
  )
}

function DragResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }}
      className="hover:bg-blue-400/50 transition-colors"
    />
  )
}

function GanttChart({ milestones, overrideMin, overrideMax, timeScale = 'month', colPx = 20, labelW = LABEL_W, setLabelW = () => {}, rowNumW = ROW_NUM_W, disableDrag = false, colVisibility = { duration: true, remDur: true, predecessor: true, planned: true, actual: true, projected: true, gantt: true }, barVisibility = { planned: true, actual: true, projected: true }, barColors = { planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' }, showBarLabels = true, drafts = {}, setDrafts = () => {}, onSave = () => {}, onDelete = () => {}, isAdmin = false, canEdit = false, showToast = () => {}, inlineAdd = null, inlineAddName = '', onInlineNameChange = () => {}, onInlineSave = () => {}, onInlineCancel = () => {}, inlineAdding = false, onSetInlineAdd = () => {}, activeBL = null, collapsedIds = new Set(), onToggleCollapse = () => {}, dependencies = [], onSavePreds = () => {}, isAutoMode = false, isBLConfirmed = false, onSaveDuration = () => {}, onSaveDate = () => {}, onSaveRemDur = () => {}, onReorder = () => {}, selectedIds = new Set(), onSelect = () => {}, onSelectAll = () => {}, onSetCollapseLevel = () => {}, maxLevel = 1, rowPasteArmed = false, dataDate = '' }) {
  const [durColW,    setDurColW]    = useState(DUR_COL_W)
  const [remDurColW, setRemDurColW] = useState(DUR_COL_W)
  const [predColW,   setPredColW]   = useState(PRED_COL_W)
  const [dateColWidths, setDateColWidths] = useState({ plnStart: DATE_COL_W, plnEnd: DATE_COL_W, actStart: DATE_COL_W, actEnd: DATE_COL_W, projStart: DATE_COL_W, projEnd: DATE_COL_W })
  const dragRef = useRef(null)
  const ganttScrollRef = useRef(null)
  const mobileStickyInnerRef = useRef(null)

  // -- Cell range selection + spreadsheet paste (activity name + date columns) --
  // cellSel is a rectangle: two corners, in rows and in columns.
  const [cellSel, setCellSel] = useState(null)
  const cellDragRef = useRef(null)
  const selRange = cellSel
    ? {
        from:    Math.min(cellSel.rowA, cellSel.rowB),
        to:      Math.max(cellSel.rowA, cellSel.rowB),
        colFrom: Math.min(colIdx(cellSel.colA), colIdx(cellSel.colB)),
        colTo:   Math.max(colIdx(cellSel.colA), colIdx(cellSel.colB)),
        // the leftmost column, kept for the single-column callers
        col:     PASTEABLE_ORDER[Math.min(colIdx(cellSel.colA), colIdx(cellSel.colB))],
      }
    : null

  const handleCellMouseDown = useCallback((col, idx) => {
    setCellSel(null)
    cellDragRef.current = { col, startIdx: idx, dragging: false }
  }, [])

  const handleCellMouseEnter = useCallback((col, idx) => {
    const st = cellDragRef.current
    if (!st) return
    if (col === st.col && idx === st.startIdx) return
    if (colIdx(col) === -1) return
    if (!st.dragging) {
      st.dragging = true
      // drop the caret so dragging highlights cells instead of selecting text
      document.activeElement?.blur?.()
    }
    window.getSelection?.()?.removeAllRanges?.()
    setCellSel({ colA: st.col, colB: col, rowA: st.startIdx, rowB: idx })
  }, [])

  useEffect(() => {
    const endDrag = () => { cellDragRef.current = null }
    const onKeyDown = (e) => { if (e.key === 'Escape') setCellSel(null) }
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin || !canEdit) return
    const onPaste = async (e) => {
      const targetCell = e.target?.closest?.('[data-cell-col]')
      // Row paste is handled on keydown. Only stand aside when this paste is
      // not aimed at the grid -- a paste into a cell is always a cell paste,
      // whether or not rows happen to be on the clipboard.
      if (rowPasteArmed && !targetCell && !selRange) return
      const editingElsewhere = !targetCell && /^(INPUT|TEXTAREA)$/.test(e.target?.tagName ?? '')
      if (!targetCell && (!selRange || editingElsewhere)) return
      const col = selRange?.col ?? targetCell?.dataset.cellCol
      if (!col || !PASTEABLE_COLS.has(col)) return

      const raw = e.clipboardData?.getData('text/plain') ?? ''
      // Keep every column of the clipboard, not just the first: a block copied
      // from Excel lands as a block
      const grid = raw.replace(/\r\n?/g, '\n').split('\n').map(l => l.split('\t').map(c => c.trim()))
      while (grid.length && grid[grid.length - 1].every(c => c === '')) grid.pop()
      const oneCell = grid.length === 1 && grid[0].length === 1

      // Rows selected and a single value: fill that column in every selected
      // row. A cell rectangle still wins -- it is the more specific gesture.
      const rowFill = !selRange && selectedIds.size > 0 && oneCell
      if (!grid.length || (oneCell && !selRange && !rowFill)) return

      e.preventDefault()
      const order = buildTree(milestones, collapsedIds)
      const ids = order.map(n => n.id)
      setCellSel(null)

      const applyCell = async (id, column, text) => {
        if (!id || !column || !PASTEABLE_COLS.has(column) || !text) return 'empty'
        if (column === 'name') { setDrafts(p => ({ ...p, [id]: text })); return 'ok' }
        const iso = toDateStr(text)
        if (!iso) return 'bad'
        await onSaveDate(id, column, iso)
        return 'ok'
      }

      let ok = 0, bad = 0, overflow = 0

      if (rowFill) {
        const targets = order.filter(n => selectedIds.has(n.id)).map(n => n.id)
        for (const id of targets) {
          const r = await applyCell(id, col, grid[0][0])
          if (r === 'ok') ok++; else if (r === 'bad') bad++
        }
      } else {
        // Anchor at the rectangle's top-left, or at the clicked cell
        const startRow = selRange ? selRange.from : Number(targetCell.dataset.cellRow)
        const startCol = selRange ? selRange.colFrom : colIdx(col)

        // One value into a rectangle fills it; otherwise the block lands as-is
        const fillRect = selRange && oneCell
        const rowCount = fillRect ? (selRange.to - selRange.from + 1) : grid.length
        const colCount = fillRect ? (selRange.colTo - selRange.colFrom + 1) : Math.max(...grid.map(r => r.length))

        for (let r = 0; r < rowCount; r++) {
          const id = ids[startRow + r]
          if (!id) { overflow++; continue }
          for (let c = 0; c < colCount; c++) {
            const column = PASTEABLE_ORDER[startCol + c]
            if (!column) continue
            const text = fillRect ? grid[0][0] : (grid[r]?.[c] ?? '')
            const res = await applyCell(id, column, text)
            if (res === 'ok') ok++; else if (res === 'bad') bad++
          }
        }
      }

      if (!ok && !bad && !overflow) return
      showToast(
        `Pasted ${ok} cell${ok !== 1 ? 's' : ''}`
          + (bad ? ` (${bad} unrecognised)` : '')
          + (overflow ? `; ${overflow} row${overflow !== 1 ? 's' : ''} had nowhere to land` : '')
          + (ok ? '. Names need Save to apply.' : '.'),
        (!ok || overflow) ? 'error' : 'success',
      )
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isAdmin, canEdit, selRange, selectedIds, rowPasteArmed, milestones, collapsedIds, setDrafts, showToast, onSaveDate])

  useEffect(() => {
    const scrollEl = ganttScrollRef.current
    if (!scrollEl) return
    const onScroll = () => {
      if (mobileStickyInnerRef.current) {
        mobileStickyInnerRef.current.style.transform = `translateX(-${scrollEl.scrollLeft}px)`
      }
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [])

  const startColDrag = (e, currentW, setter, minW = 40) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: currentW, setter, minW }
    const onMove = (ev) => {
      if (!dragRef.current) return
      const { startX, startW, setter: set, minW: mn } = dragRef.current
      set(Math.max(mn, startW + (ev.clientX - startX)))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: disableDrag ? 999999 : 2 } }))
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }

  const allDates = milestones
    .flatMap(m => [m.planned_start, m.planned_end, m.actual_start, m.actual_end, m.projected_start, m.projected_end])
    .filter(Boolean)
    .map(d => parseDate(d).getTime())

  const hasDatesFallback = allDates.length === 0
  const rawMin  = hasDatesFallback ? new Date() : new Date(Math.min(...allDates) - PAD)
  const rawMax  = hasDatesFallback ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)) : new Date(Math.max(...allDates))
  const minDate = overrideMin ?? new Date(rawMin.getFullYear(), rawMin.getMonth(), rawMin.getDate())
  const maxDate = (() => {
    if (overrideMax) return overrideMax
    const base = new Date(rawMax.getFullYear(), rawMax.getMonth(), rawMax.getDate() + 1)
    if (timeScale === 'month') { base.setMonth(base.getMonth() + 12); return base }
    if (timeScale === 'week')  { base.setDate(base.getDate() + 12 * 7); return base }
    base.setDate(base.getDate() + 12)
    return base
  })()

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

  // Data date line — only shown when explicitly set; no today fallback
  const refDateStr   = dataDate || todayStr
  const refDate      = dataDate ? new Date(dataDate + 'T00:00:00') : null
  const refDatePx    = refDate ? toPx(refDate) : -1
  const showToday    = !!dataDate && refDatePx >= 0 && refDatePx <= chartPxWidth
  const todayPx      = refDatePx

  const { duration: showDuration, remDur: showRemDur, predecessor: showPredecessor, planned: showPlanned, actual: showActual, projected: showProjected, gantt: showGantt } = colVisibility
  const frozenW = (isAdmin ? SEL_W : 0) + rowNumW + labelW
    + (showDuration ? durColW : 0)
    + (showRemDur ? remDurColW : 0)
    + (showPredecessor ? predColW : 0)
    + (showPlanned ? dateColWidths.plnStart + dateColWidths.plnEnd : 0)
    + (showActual ? dateColWidths.actStart + dateColWidths.actEnd : 0)
    + (showProjected ? dateColWidths.projStart + dateColWidths.projEnd : 0)
  const totalW = frozenW + (showGantt ? chartPxWidth : 0)

  // Sequential row numbers for visible task rows (collapsed rows excluded)
  const idToRowNum = new Map()
  {
    let n = 0
    buildTree(milestones, collapsedIds).forEach(node => {
      n++
      idToRowNum.set(node.id, n)
    })
  }

  // Built before axisHeader, which reads it for the select-all tick box
  const _flatNodes = buildTree(milestones, collapsedIds)

  const axisHeader = (
    <>
      <div className="flex" style={{ width: totalW, minWidth: totalW, backgroundColor: '#4b5563' }}>
        <div
          style={{ width: frozenW, minWidth: frozenW, borderRight: '1px solid #d1d5db', backgroundColor: '#4b5563', position: 'sticky', left: 0, zIndex: 10 }}
          className="flex-shrink-0 flex items-center"
        >
          {/* Selection column header -- select or clear every visible row */}
          {isAdmin && (
            <div style={{ width: SEL_W, minWidth: SEL_W }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0">
              <input
                type="checkbox"
                checked={_flatNodes.length > 0 && _flatNodes.every(n => selectedIds.has(n.id))}
                onChange={e => onSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#ed6055] cursor-pointer"
                aria-label="Select all rows"
              />
            </div>
          )}
          {/* # column header */}
          {rowNumW > 0 && (
            <div style={{ width: rowNumW, minWidth: rowNumW }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0">
              <span className="text-[10px] font-bold text-gray-300">#</span>
            </div>
          )}
          {/* Activity name column */}
          {labelW > 0 && (
            <div style={{ width: labelW, minWidth: labelW, position: 'relative' }} className="flex items-center pl-3 pr-1 self-stretch border-r border-gray-500 flex-shrink-0">
              <span className="text-xs font-bold text-gray-200 flex-1 min-w-0">Activity</span>
              <GLevelMenu maxLevel={maxLevel} onPick={onSetCollapseLevel} />
              <DragResizeHandle onMouseDown={e => startColDrag(e, labelW, setLabelW, 120)} />
            </div>
          )}
          {/* Duration -- always its own column */}
          {showDuration && (
            <div style={{ width: durColW, minWidth: durColW, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
              <span className="text-xs font-bold text-gray-300">BL Dur.</span>
              <DragResizeHandle onMouseDown={e => startColDrag(e, durColW, setDurColW, 40)} />
            </div>
          )}
          {showRemDur && (
            <div style={{ width: remDurColW, minWidth: remDurColW, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
              <span className="text-xs font-bold text-gray-300">Rem. Dur.</span>
              <DragResizeHandle onMouseDown={e => startColDrag(e, remDurColW, setRemDurColW, 40)} />
            </div>
          )}
          {/* Predecessors -- always its own column */}
          {showPredecessor && (
            <div style={{ width: predColW, minWidth: predColW, position: 'relative' }} className="flex items-center gap-1 px-2 self-stretch border-r border-gray-500 flex-shrink-0">
              <span className="text-xs font-bold text-gray-300">Pred.</span>
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                title={"Format: <row>FS|SS|FF|SF[+/-days]\nExamples: 3FS (row 3 finish→start), 2SS+5 (row 2 start→start +5 days)\nSeparate multiple predecessors with commas."}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
              </svg>
              <DragResizeHandle onMouseDown={e => startColDrag(e, predColW, setPredColW, 48)} />
            </div>
          )}
          {/* Planned date columns */}
          {showPlanned && (
            <>
              <div style={{ width: dateColWidths.plnStart, minWidth: dateColWidths.plnStart, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">BL Start</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.plnStart, v => setDateColWidths(w => ({ ...w, plnStart: v })), 60)} />
              </div>
              <div style={{ width: dateColWidths.plnEnd, minWidth: dateColWidths.plnEnd, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">BL End</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.plnEnd, v => setDateColWidths(w => ({ ...w, plnEnd: v })), 60)} />
              </div>
            </>
          )}
          {/* Actual date columns */}
          {showActual && (
            <>
              <div style={{ width: dateColWidths.actStart, minWidth: dateColWidths.actStart, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">Act. Start</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.actStart, v => setDateColWidths(w => ({ ...w, actStart: v })), 60)} />
              </div>
              <div style={{ width: dateColWidths.actEnd, minWidth: dateColWidths.actEnd, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">Act. End</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.actEnd, v => setDateColWidths(w => ({ ...w, actEnd: v })), 60)} />
              </div>
            </>
          )}
          {/* Projected date columns */}
          {showProjected && (
            <>
              <div style={{ width: dateColWidths.projStart, minWidth: dateColWidths.projStart, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">Proj. Start</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.projStart, v => setDateColWidths(w => ({ ...w, projStart: v })), 60)} />
              </div>
              <div style={{ width: dateColWidths.projEnd, minWidth: dateColWidths.projEnd, position: 'relative' }} className="flex items-center justify-center self-stretch border-r border-gray-500 flex-shrink-0 px-1">
                <span className="text-xs font-bold text-gray-300">Proj. End</span>
                <DragResizeHandle onMouseDown={e => startColDrag(e, dateColWidths.projEnd, v => setDateColWidths(w => ({ ...w, projEnd: v })), 60)} />
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
                    <span className="text-xs font-semibold text-gray-200 whitespace-nowrap ml-1">{yr.getFullYear()}</span>
                  </div>
                )
              })
            ) : (
              months.map((mo, i) => {
                const left = toPx(mo)
                return (
                  <div key={i} className="absolute flex flex-col items-start" style={{ left }}>
                    <div className="w-px h-2 bg-gray-400" />
                    <span className="text-xs font-medium text-gray-300 whitespace-nowrap ml-1">
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
                    <span className="text-xs font-medium text-gray-300 whitespace-nowrap leading-none">
                      <span className="hidden sm:inline">{mo.toLocaleDateString('en-PH', { month: 'short' })}</span>
                      <span className="sm:hidden">{'JFMAMJJASOND'[mo.getMonth()]}</span>
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
                        <span className={`leading-none ${isWeekend ? 'text-xs font-bold text-[#ed6055]' : 'text-xs font-medium text-gray-300'}`}>
                          {d.getDate()}
                        </span>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>}
      </div>
      <div style={{ width: totalW, minWidth: totalW, borderBottom: '2px solid #4b5563' }} />
    </>
  )

  // Single flat ID list for the SortableContext spanning all tasks.
  const allSortableIds = []
  allSortableIds.push(..._flatNodes.map(n => n.id))

  const milestoneRows = [
    ..._flatNodes.flatMap((node, nodeIdx) => {
      const displayM = (node.hasChildren && node.children.length)
        ? { ...node, ...computeParentDates(node.children) }
        : node
      const rowProps = {
        m: displayM,
        rowIndex: nodeIdx,
        selCols: selRange ? [selRange.colFrom, selRange.colTo] : null,
        inSelRange: !!selRange && nodeIdx >= selRange.from && nodeIdx <= selRange.to,
        onCellMouseDown: isAdmin && canEdit ? handleCellMouseDown : null,
        onCellMouseEnter: isAdmin && canEdit ? handleCellMouseEnter : null,
        rowNum: idToRowNum.get(node.id) ?? 0,
        predText: formatPredecessors(dependencies.filter(d => d.to_id === node.id), idToRowNum),
        onSavePreds: (text) => onSavePreds(node.id, text),
        depth: node.depth,
        hasChildren: node.hasChildren,
        isCollapsed: collapsedIds.has(node.id),
        onToggleCollapse,
        onAddChild: isAdmin ? (form) => onSetInlineAdd(form) : null,
        toPx, chartPxWidth: showGantt ? chartPxWidth : 0, gridDates,
        todayPx, showToday, todayStr: refDateStr,
        isChild: node.depth > 0, isLastChild: false,
        rowNumW,
        labelW, durColW, remDurColW, predColW, dateColWidths, showDuration, showRemDur, showPredecessor, showPlanned, showActual, showProjected,
        showPlannedBar: barVisibility.planned, showActualBar: barVisibility.actual, showProjectedBar: barVisibility.projected, showBarLabels,
        draftName: drafts[node.id] ?? displayM.milestone_name,
        onDraftChange: (v) => setDrafts(p => ({ ...p, [node.id]: v })),
        onDelete,
        isAdmin,
        canEdit,
        isAutoMode,
        isBLConfirmed,
        onSaveDuration: (dur) => onSaveDuration(node.id, dur),
        onSaveDate: (field, value) => onSaveDate(node.id, field, value),
        onSaveRemDur: (remDur) => onSaveRemDur(node.id, remDur),
        barColors,
        dataDate,
      }
      const items = [<SortableMilestoneRow key={node.id} id={node.id} isAdmin={isAdmin} disableDrag={disableDrag} isSelected={selectedIds.has(node.id)} onSelect={onSelect} {...rowProps} />]
      if (inlineAdd?.parentId === node.id) {
        items.push(
          <InlineAddRow key={`inline-${node.id}`} depth={node.depth + 1} name={inlineAddName}
            onChange={onInlineNameChange} onSave={onInlineSave} onCancel={onInlineCancel}
            adding={inlineAdding} totalW={totalW} />
        )
      }
      return items
    }),
    ...(inlineAdd?.parentId === null
      ? [<InlineAddRow key="inline-top" depth={0} name={inlineAddName}
          onChange={onInlineNameChange} onSave={onInlineSave} onCancel={onInlineCancel}
          adding={inlineAdding} totalW={totalW} />]
      : []),
  ]

  // Compute y-center of each milestone row for SVG arrow anchoring.
  // AXIS_H is NOT included here -- the SVG is positioned with top=AXIS_H, so y=0 in SVG = top of first row.
  const yCenterById = {}
  let yAcc = 0
  _flatNodes.forEach(node => {
    yCenterById[node.id] = yAcc + TASK_ROW_H / 2
    yAcc += TASK_ROW_H
    if (inlineAdd?.parentId === node.id) yAcc += 38
  })
  if (inlineAdd?.parentId === null) yAcc += 38
  const svgH = yAcc

  return (
    <>
    {/* Mobile sticky axis header — outside gantt-scroll so CSS sticky works relative to main */}
    <div
      className="sm:hidden flex-shrink-0"
      style={{
        position: 'sticky',
        top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        zIndex: 9,
        backgroundColor: '#4b5563',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <div style={{ overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
        <div ref={mobileStickyInnerRef} style={{ width: totalW, minWidth: totalW }}>
          {axisHeader}
        </div>
      </div>
    </div>
    <div className="flex-1 min-h-0 rounded-xl overflow-hidden shadow-lg">
    <div ref={ganttScrollRef} className="gantt-scroll h-full overflow-auto" style={{ scrollbarWidth: 'none' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ width: totalW, minWidth: totalW, position: 'relative' }}>
          {/* Desktop-only axis header inside gantt-scroll (sticky within gantt-scroll) */}
          <div className="hidden sm:block sticky top-0 z-40" style={{ backgroundColor: '#4b5563' }}>
            {axisHeader}
          </div>
          {/* Rows -- phase headers and sortable milestone rows (single SortableContext spans all phases for correct cross-phase collision detection) */}
          <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
            {milestoneRows}
          </SortableContext>
          {isAdmin && activeBL && !isBLConfirmed && (
            <button
              onClick={() => {
                // Continue the list rather than always starting a new top-level
                // row: the new activity takes the parent, level and phase of the
                // last row above it, which is where the eye expects it to land
                const above = _flatNodes[_flatNodes.length - 1]
                onSetInlineAdd(above
                  ? { phase: above.phase, parentId: above.parent_id ?? null, depth: above.depth }
                  : { phase: 'execution_monitoring', parentId: null, depth: 0 })
              }}
              style={{ width: totalW, minWidth: totalW, height: TASK_ROW_H }}
              className="flex items-center gap-1.5 px-4 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors text-left border-b border-gray-100"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add activity
            </button>
          )}
          {allDates.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              Add milestones above to see the Gantt chart.
            </div>
          )}
        </div>
      </DndContext>
    </div>
    </div>
    </>
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

  // Start date is useful in both modes -- shown always

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

export function GanttContent({ project, isAdmin = false, showToast = () => {}, onRegisterFns, onActiveBLChange }) {
  const { profile } = useProfile()
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [labelW, setLabelW] = useState(() => window.innerWidth < 640 ? 160 : LABEL_W)
  const [baselines, setBaselines]     = useState([])
  const [activeBL, setActiveBL]       = useState(null)
  const [milestones, setMilestones]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [collapsedIds, setCollapsedIds] = useState(new Set())
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
  const isMobileGantt = window.innerWidth < 640
  const [colPxMap, setColPxMap] = useState(() => {
    if (isMobileGantt) return { ...MOBILE_DEFAULT_COL_PX }
    try {
      const saved = localStorage.getItem('gantt_colPxMap')
      if (saved) return { ...DEFAULT_COL_PX, ...JSON.parse(saved) }
    } catch {}
    return { ...DEFAULT_COL_PX }
  })
  const colPx    = isMobileGantt ? MOBILE_DEFAULT_COL_PX[timeScale] : colPxMap[timeScale]
  const isDefaultWidth = colPx === getDefaultColPx()[timeScale]
  const setColPx = (fn) => {
    if (isMobileGantt) return
    setColPxMap(prev => {
      const next = { ...prev, [timeScale]: typeof fn === 'function' ? fn(prev[timeScale]) : fn }
      try { localStorage.setItem('gantt_colPxMap', JSON.stringify(next)) } catch {}
      return next
    })
  }
  const resetColPx = () => {
    if (isMobileGantt) return
    setColPxMap(prev => {
      const next = { ...prev, [timeScale]: DEFAULT_COL_PX[timeScale] }
      try { localStorage.setItem('gantt_colPxMap', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const [drafts, setDrafts] = useState(() => {
    try { const s = sessionStorage.getItem(`gantt-drafts-${project.id}`); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  useEffect(() => {
    if (Object.keys(drafts).length > 0) sessionStorage.setItem(`gantt-drafts-${project.id}`, JSON.stringify(drafts))
    else sessionStorage.removeItem(`gantt-drafts-${project.id}`)
  }, [drafts])
  const [deleteId, setDeleteId]   = useState(null)
  const [colVisibility, setColVisibility] = useState(() => {
    const mobile = window.innerWidth < 640
    return mobile
      ? { duration: false, remDur: false, predecessor: false, planned: false, actual: false, projected: false, gantt: true }
      : { duration: true, remDur: true, predecessor: true, planned: true, actual: true, projected: true, gantt: true }
  })
  const [barVisibility, setBarVisibility] = useState({ planned: true, actual: true, projected: true })
  const [barColors, setBarColors]         = useState({ planned: '#9ca3af', actual: '#22c55e', projected: '#fde047' })
  const [showBarLabels, setShowBarLabels] = useState(true)
  const [dataDate, setDataDate]           = useState('')
  const [activeTab, setActiveTab]         = useState('gantt')
  const [showSettings, setShowSettings]   = useState(false)
  const [inlineAdd, setInlineAdd]       = useState(null)
  const [inlineAddName, setInlineAddName] = useState('')
  const [inlineAdding, setInlineAdding] = useState(false)
  const [pendingEdits, setPendingEdits]  = useState({}) // milestoneId → { projected_start?, projected_end?, rem_dur? }
  const pendingLoadedFor = useRef(null) // baseline whose staged edits have been restored
  const [orderDirty, setOrderDirty]     = useState(false)
  const [savingOrder, setSavingOrder]   = useState(false)
  const [savingAll,   setSavingAll]     = useState(false)
  const [selectedIds, setSelectedIds]   = useState(() => new Set())
  const [selectAnchor, setSelectAnchor] = useState(null)   // for shift-click ranges
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [rowClipboard, setRowClipboard] = useState([])  // ids held by Ctrl+C
  const [dependencies, setDependencies] = useState([])
  const [newBLName, setNewBLName]     = useState('')
  const [newBLNum,  setNewBLNum]      = useState('')
  const [showNewBLModal, setShowNewBLModal] = useState(false)
  const [templateCount,  setTemplateCount]  = useState(0)
  const [loadTemplate,   setLoadTemplate]   = useState(true)
  const [sourceBLId,     setSourceBLId]     = useState(null)
  const [creatingBL,     setCreatingBL]     = useState(false)
  const [importing, setImporting]               = useState(false)
  const [importErrors, setImportErrors]         = useState([])
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [deleteBLId, setDeleteBLId]             = useState(null)
  const schedulerRunning = useRef(false)
  const settingsWrapRef  = useRef(null)

  const [scurveBaselines, setScurveBaselines] = useState([])

  // Paired baselines take the S-curve name; unpaired ones keep their own and
  // say so, which is how PRJ-000008's duplicates stay visible
  const blLabel = (b) => {
    if (!b) return ''
    const sc = scurveBaselines.find(x => x.id === b.scurve_baseline_id)
    return sc ? sc.name : `${b.name} · unlinked`
  }

  useEffect(() => {
    const loadBaselines = async () => {
      const { data } = await supabase
        .from('workprogram_baselines')
        .select('id, name, created_at, start_date, confirmed_at, scurve_baseline_id')
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })
      const bls = data ?? []
      setBaselines(bls)
      setActiveBL(bls.length > 0 ? bls[bls.length - 1].id : null)
      setInlineAdd(null); setInlineAddName('')

      // A baseline is named by the S-curve baseline it is paired with, so the
      // two modules cannot show different names for the same revision
      const { data: sc } = await supabase
        .from('project_scurve_baselines')
        .select('id, name')
        .eq('project_id', project.id)
      setScurveBaselines(sc ?? [])
    }
    loadBaselines()
  }, [project.id])

  // Load saved view from DB on mount — applies to all users
  useEffect(() => {
    supabase
      .from('project_workprogram_view')
      .select('settings')
      .eq('project_id', project.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return
        const s = data.settings ?? {}
        if (s.colVisibility !== undefined) {
          const merged = { ...s.colVisibility }
          if (window.innerWidth < 640) {
            merged.duration = false; merged.remDur = false; merged.predecessor = false
            merged.planned = false; merged.actual = false; merged.projected = false
          }
          setColVisibility(prev => ({ ...prev, ...merged }))
        }
        if (s.barVisibility  !== undefined) setBarVisibility(s.barVisibility)
        if (s.barColors      !== undefined) setBarColors(s.barColors)
        if (s.showBarLabels  !== undefined) setShowBarLabels(s.showBarLabels)
        if (s.timeScale     !== undefined) setTimeScale(s.timeScale)
        if (s.colPxMap      !== undefined) setColPxMap(s.colPxMap)
        if (s.labelW        !== undefined) setLabelW(s.labelW)
        if (s.fromMonth     !== undefined) setFromMonthRaw(s.fromMonth)
        if (s.toMonth       !== undefined) setToMonthRaw(s.toMonth)
        if (s.dataDate      !== undefined) setDataDate(s.dataDate ?? '')
      })
  }, [project.id])

  const dataDateInitialized = useRef(false)
  useEffect(() => {
    if (!dataDateInitialized.current) { dataDateInitialized.current = true; return }
    const t = setTimeout(() => {
      const settings = { colVisibility, barVisibility, barColors, timeScale, colPxMap, labelW, fromMonth, toMonth, showBarLabels, dataDate }
      supabase
        .from('project_workprogram_view')
        .upsert({ project_id: project.id, settings, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    }, 600)
    return () => clearTimeout(t)
  }, [dataDate])

  const [savingView, setSavingView] = useState(false)
  const handleSaveView = async () => {
    setSavingView(true)
    const settings = { colVisibility, barVisibility, barColors, timeScale, colPxMap, labelW, fromMonth, toMonth, showBarLabels, dataDate }
    const { error } = await supabase
      .from('project_workprogram_view')
      .upsert({ project_id: project.id, settings, updated_at: new Date().toISOString(), updated_by: profile?.id ?? null }, { onConflict: 'project_id' })
    setSavingView(false)
    if (error) { showToast('Failed to save view', 'error') } else { showToast('View saved for all users') }
  }

  // silent = refresh the rows in place. The full-screen loader unmounts the grid,
  // which throws away its scroll position, so only the initial load / baseline
  // switch uses it -- refetching after an edit keeps the list where it was.
  const loadMilestones = async (blId, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const resolvedId = blId ?? activeBL
    if (!resolvedId) { setMilestones([]); setDependencies([]); if (!silent) setLoading(false); return }

    const [{ data: rawTasks }, { data: rawDeps }] = await Promise.all([
      supabase
        .from('workprogram_activities')
        .select('*')
        .eq('project_id', project.id)
        .eq('baseline_id', resolvedId)
        .order('sort_order'),
      supabase
        .from('workprogram_dependencies')
        .select('from_id, to_id, type, lag')
        .eq('baseline_id', resolvedId),
    ])

    // Build dependencies array on each task so expandDependencies() works unchanged
    const depsByToId = {}
    for (const d of rawDeps ?? []) {
      if (!depsByToId[d.to_id]) depsByToId[d.to_id] = []
      depsByToId[d.to_id].push({ id: d.from_id, type: d.type, lag: d.lag ?? 0 })
    }

    const tasks = (rawTasks ?? []).map(t => ({
      ...t,
      dependencies: depsByToId[t.id] ?? [],
    }))

    // Re-apply unsaved row order / nesting, so reloading the rows (adding an
    // activity, for instance) doesn't silently throw those changes away.
    let finalTasks = tasks
    try {
      const raw = sessionStorage.getItem(`milestone-order-${resolvedId}`)
      const pendingOrder = raw ? JSON.parse(raw) : null
      if (pendingOrder?.length) {
        const byId = new Map(pendingOrder.map(p => [p.id, p]))
        finalTasks = tasks.map(t => {
          const p = byId.get(t.id)
          return p ? { ...t, sort_order: p.sort_order, phase: p.phase, parent_id: p.parent_id } : t
        })
        setOrderDirty(true)
      }
    } catch { /* unreadable snapshot -- fall back to the stored order */ }

    const depRows = expandDependencies(finalTasks)
    setMilestones(finalTasks)
    setDependencies(depRows)
    // Staged forecast edits live only in memory until "Update" writes them, so
    // restore them here -- otherwise a refetch/refresh silently drops them.
    let restoredPending = {}
    try {
      const rawPending = sessionStorage.getItem(`gantt-pending-${resolvedId}`)
      if (rawPending) restoredPending = JSON.parse(rawPending) ?? {}
    } catch { /* unreadable snapshot -- start clean */ }
    pendingLoadedFor.current = resolvedId
    setPendingEdits(restoredPending)
    if (!silent) setLoading(false)
  }

  // Persist staged forecast edits so they survive a refresh, mirroring how name
  // drafts and pending row order are kept. Gated on the restore having run for
  // this baseline -- otherwise the empty initial state would clear the snapshot
  // before loadMilestones reads it back.
  useEffect(() => {
    if (!activeBL || pendingLoadedFor.current !== activeBL) return
    try {
      if (Object.keys(pendingEdits).length > 0) {
        sessionStorage.setItem(`gantt-pending-${activeBL}`, JSON.stringify(pendingEdits))
      } else {
        sessionStorage.removeItem(`gantt-pending-${activeBL}`)
      }
    } catch { /* storage unavailable -- edits just won't survive a refresh */ }
  }, [pendingEdits, activeBL])

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
      dirty.map(([id, name]) => {
        const updates = { milestone_name: name.trim() }
        return supabase.from('workprogram_activities').update(updates).eq('id', id)
      })
    )
    const failed = results.filter(r => r.error)
    if (failed.length) { showToast(`${failed.length} error(s) saving.`, 'error'); return }
    setDrafts({})
    showToast(`Saved ${dirty.length} change${dirty.length !== 1 ? 's' : ''}.`, 'success')
    loadMilestones(undefined, { silent: true })
  }

  const handleDelete = async (id) => {
    const [{ error }] = await Promise.all([
      supabase.from('workprogram_activities').delete().eq('id', id),
      supabase.from('workprogram_dependencies').delete().eq('baseline_id', activeBL).or(`from_id.eq.${id},to_id.eq.${id}`),
    ])
    if (error) { showToast(error.message, 'error'); return }
    showToast('Deleted.', 'success')
    loadMilestones(undefined, { silent: true })
  }

  const computeProjStart = (milestoneId) => {
    const m = milestones.find(x => x.id === milestoneId)
    if (!m) return null
    if (m.projected_start) return m.projected_start
    if (m.actual_start) return m.actual_start
    const preds = dependencies.filter(d => d.to_id === milestoneId)
    if (preds.length) {
      const predEnds = preds.map(d => {
        const p = milestones.find(x => x.id === d.from_id)
        return p?.projected_end ?? p?.actual_end ?? p?.planned_end ?? null
      }).filter(Boolean)
      if (predEnds.length) return predEnds.sort().at(-1)
    }
    return dataDate || null
  }

  const addDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }

  // Rem. Dur. and projected date edits are local-only — persisted on Update button click
  const handleSaveRemDur = (milestoneId, remDur) => {
    const projStart = computeProjStart(milestoneId)
    const projEnd = (remDur != null && projStart) ? addDays(projStart, remDur) : undefined
    setPendingEdits(prev => ({
      ...prev,
      [milestoneId]: { ...prev[milestoneId], rem_dur: remDur, ...(projEnd !== undefined && { projected_end: projEnd }) },
    }))
  }

  const handleSaveDate = async (milestoneId, field, value) => {
    // Projected date edits are local-only
    if (field === 'projected_start' || field === 'projected_end') {
      setPendingEdits(prev => ({
        ...prev,
        [milestoneId]: { ...prev[milestoneId], [field]: value || null },
      }))
      return
    }
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
    const { error } = await supabase.from('workprogram_activities').update(updates).eq('id', milestoneId)
    if (error) { showToast(error.message, 'error'); return }
    if (isAutoMode && blStartDate && field !== 'actual_start' && field !== 'actual_end') {
      await runScheduler()
    } else {
      setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, ...updates } : m))
    }
  }

  const handleAddActivity = async ({ parentId = null, phase = 'execution_monitoring' } = {}) => {
    if (!activeBL) return
    setInlineAdding(true)
    try {
      // Sort order within the parent context
      let sort_order = 0
      if (parentId) {
        const { data: sibs } = await supabase
          .from('workprogram_activities').select('sort_order')
          .eq('parent_id', parentId).eq('baseline_id', activeBL)
          .order('sort_order', { ascending: false }).limit(1)
        sort_order = sibs?.length ? (sibs[0].sort_order ?? 0) + 1 : 0
      } else {
        const { data: sibs } = await supabase
          .from('workprogram_activities').select('sort_order')
          .eq('project_id', project.id).eq('baseline_id', activeBL).is('parent_id', null)
          .order('sort_order', { ascending: false }).limit(1)
        sort_order = sibs?.length ? (sibs[0].sort_order ?? 0) + 1 : 0
      }
      // Global N for default name: max sort_order across all activities in this baseline + 1
      const { data: allActs } = await supabase
        .from('workprogram_activities').select('sort_order')
        .eq('project_id', project.id).eq('baseline_id', activeBL)
        .order('sort_order', { ascending: false }).limit(1)
      const N = allActs?.length ? (allActs[0].sort_order ?? 0) + 1 : 1
      const rawTaskId = crypto.randomUUID()
      const { error } = await supabase.from('workprogram_activities').insert({
        id:             `${rawTaskId}_${activeBL}`,
        task_id:        rawTaskId,
        baseline_id:    activeBL,
        project_id:     project.id,
        phase,
        parent_id:      parentId,
        milestone_name: `Activity ${N}`,
        sort_order,
      })
      if (error) { showToast(error.message, 'error'); return }
      showToast('Activity added.', 'success')
      await loadMilestones(undefined, { silent: true })
    } finally {
      setInlineAdding(false)
    }
  }

  const handleInlineSave = async () => {
    setInlineAdd(null); setInlineAddName('')
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

    // Dragging a selected row carries the rest of the selection with it, as one
    // block, keeping its relative order. Only rows sharing the dragged row's
    // parent come along -- yanking a child out from under its summary because a
    // cousin was dragged would be a surprise.
    const block = selectedIds.has(activeId)
      ? milestones
          .filter(m => selectedIds.has(m.id) && m.parent_id === activeNode.parent_id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [activeNode]
    const moving = block.length > 1 && !selectedIds.has(overId) ? block : [activeNode]
    const movingIds = new Set(moving.map(m => m.id))
    if (movingIds.has(overId)) return

    // Where the rows land decides their level: they take the parent of whatever
    // row ends up directly above them, which is what the drop looks like.
    const order = buildTree(milestones, collapsedIds)
    const aIdx = order.findIndex(n => n.id === activeId)
    const oIdx = order.findIndex(n => n.id === overId)
    if (aIdx === -1 || oIdx === -1) return
    const rest = order.filter(n => !movingIds.has(n.id))
    const overPos = rest.findIndex(n => n.id === overId)
    if (overPos === -1) return
    const insertPos = aIdx < oIdx ? overPos + 1 : overPos
    const above = insertPos > 0 ? rest[insertPos - 1] : null

    // `above` is a sibling of the row's new home by construction: the new
    // parent is its parent. Dropping at the very top means top level.
    const newParentId = above ? (above.parent_id ?? null) : null
    const newPhase    = above ? above.phase : overNode.phase
    const oldParentId = activeNode.parent_id ?? null

    const destSiblings = milestones
      .filter(m => (m.parent_id ?? null) === newParentId && !movingIds.has(m.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const afterIdx = above ? destSiblings.findIndex(m => m.id === above.id) : -1
    const at = afterIdx === -1 ? 0 : afterIdx + 1
    const newDest = [...destSiblings.slice(0, at), ...moving, ...destSiblings.slice(at)]

    const updateMap = new Map()
    newDest.forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: newParentId, phase: newPhase }))
    if (newParentId !== oldParentId) {
      milestones
        .filter(m => (m.parent_id ?? null) === oldParentId && !movingIds.has(m.id))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: oldParentId, phase: m.phase }))
    }

    applyReorderState(milestones.map(m => { const u = updateMap.get(m.id); return u ? { ...m, ...u } : m }))
  }

  // Plain click selects one row; ctrl/cmd adds or removes; shift takes
  // everything between the anchor and this row in display order
  const handleSelectRow = (id, { additive = false, range = false } = {}) => {
    setSelectedIds(prev => {
      if (range && selectAnchor) {
        const order = buildTree(milestones, collapsedIds).map(n => n.id)
        const a = order.indexOf(selectAnchor)
        const b = order.indexOf(id)
        if (a === -1 || b === -1) return new Set([id])
        const [from, to] = a < b ? [a, b] : [b, a]
        return new Set(order.slice(from, to + 1))
      }
      if (additive) {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      }
      // Clicking the only selected row clears it, so there is a way out
      return prev.size === 1 && prev.has(id) ? new Set() : new Set([id])
    })
    if (!range) setSelectAnchor(id)
  }

  const clearSelection = () => { setSelectedIds(new Set()); setSelectAnchor(null) }

  // "Show level N" means every row down to depth N-1 stays open and anything
  // deeper is folded away. Depths come from the fully expanded tree, not the
  // current view, or collapsing twice would keep finding fewer rows.
  const fullTree = buildTree(milestones, new Set())
  const maxLevel = Math.max(1, ...fullTree.map(n => (n.depth ?? 0) + 1))

  const handleSetCollapseLevel = (level) => {
    if (level === 'all') { setCollapsedIds(new Set()); return }
    setCollapsedIds(new Set(
      fullTree.filter(n => n.hasChildren && (n.depth ?? 0) >= level - 1).map(n => n.id)
    ))
  }

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? new Set(buildTree(milestones, collapsedIds).map(n => n.id)) : new Set())
    setSelectAnchor(null)
  }

  // Pure: takes the list, returns the list. Bulk indent folds over the result
  // of the previous row, which a handler reading `milestones` could not do.
  const indentOne = (ms, id) => {
    const node = ms.find(m => m.id === id)
    if (!node) return ms
    // Indent under the previous *sibling* so the row always drops exactly one
    // level, however deeply nested the rows displayed in between happen to be.
    const siblings = ms
      .filter(m => m.parent_id === node.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const sibIdx = siblings.findIndex(x => x.id === id)
    if (sibIdx <= 0) return ms               // first sibling has nothing to indent under
    const newParentId = siblings[sibIdx - 1].id
    const flatNodes = buildTree(ms, collapsedIds)
    const newParentDepth = flatNodes.find(n => n.id === newParentId)?.depth ?? 0
    if (newParentDepth >= 3) return ms       // MAX_DEPTH
    const oldSiblings = ms
      .filter(m => m.parent_id === node.parent_id && m.id !== id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const newSortOrder = ms.filter(m => m.parent_id === newParentId).length
    const updateMap = new Map()
    updateMap.set(id, { parent_id: newParentId, sort_order: newSortOrder, phase: node.phase })
    oldSiblings.forEach((m, i) => updateMap.set(m.id, { sort_order: i, parent_id: m.parent_id, phase: m.phase }))
    return ms.map(m => { const u = updateMap.get(m.id); return u ? { ...m, ...u } : m })
  }

  const outdentOne = (ms, id) => {
    const node = ms.find(m => m.id === id)
    if (!node || node.parent_id === null) return ms
    const parent = ms.find(m => m.id === node.parent_id)
    if (!parent) return ms
    const newParentId = parent.parent_id
    const oldSiblings = ms
      .filter(m => m.parent_id === node.parent_id && m.id !== id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const newSiblings = ms
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
    return ms.map(m => { const u = updateMap.get(m.id); return u ? { ...m, ...u } : m })
  }

  // Outdent runs deepest-first and indent shallowest-first, so a parent never
  // moves out from under a child that is still waiting its turn
  const shiftLevel = (dir) => {
    if (!isAdmin || !activeBL || selectedIds.size === 0) return
    const order = buildTree(milestones, collapsedIds)
    const ids = order
      .filter(n => selectedIds.has(n.id))
      .sort((a, b) => dir === 'in' ? a.depth - b.depth : b.depth - a.depth)
      .map(n => n.id)
    const next = ids.reduce((ms, id) => dir === 'in' ? indentOne(ms, id) : outdentOne(ms, id), milestones)
    if (next !== milestones) applyReorderState(next)
  }

  const handleIndent  = (id) => { const n = indentOne(milestones, id);  if (n !== milestones) applyReorderState(n) }
  const handleOutdent = (id) => { const n = outdentOne(milestones, id); if (n !== milestones) applyReorderState(n) }

  // Tab / Shift+Tab indents or outdents everything selected; Ctrl+A takes the
  // visible rows; Escape clears
  useEffect(() => {
    if (!isAdmin || !activeBL) return
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (e.key === 'Escape') { clearSelection(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault()
        setSelectedIds(new Set(buildTree(milestones, collapsedIds).map(n => n.id)))
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'c' && !typing && selectedIds.size > 0) {
        setRowClipboard([...selectedIds])
        showToast(`${selectedIds.size} ${selectedIds.size === 1 ? 'activity' : 'activities'} copied.`, 'success')
        return
      }
      if (mod && e.key.toLowerCase() === 'v' && !typing && rowClipboard.length > 0) {
        e.preventDefault()
        pasteRows()
        return
      }
      const blLocked = !!baselines.find(b => b.id === activeBL)?.confirmed_at
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedIds.size > 0 && !blLocked) {
        e.preventDefault()
        setConfirmBulkDelete(true)
        return
      }
      if (e.key !== 'Tab' || selectedIds.size === 0 || typing) return
      e.preventDefault()
      shiftLevel(e.shiftKey ? 'out' : 'in')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedIds, rowClipboard, milestones, collapsedIds, isAdmin, activeBL, baselines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+C remembers the rows; Ctrl+V inserts copies of them. Copying a
  // summary takes its whole subtree, selected or not -- a summary without its
  // children is not a useful copy. Planned dates and duration carry over;
  // actuals and forecast do not, since the copy has not happened yet.
  const pasteRows = async () => {
    if (!rowClipboard.length || !activeBL) return

    const present = rowClipboard.filter(id => milestones.some(m => m.id === id))
    if (!present.length) { showToast('The copied activities are no longer here.', 'error'); return }

    const childrenOf = (id) => milestones.filter(m => (m.parent_id ?? null) === id)
    const withDescendants = (id, acc = []) => {
      acc.push(id)
      childrenOf(id).forEach(c => withDescendants(c.id, acc))
      return acc
    }
    const order = buildTree(milestones, collapsedIds).map(n => n.id)
    const copySet = new Set(present)
    const roots = present.filter(id => {
      let p = milestones.find(m => m.id === id)?.parent_id ?? null
      while (p) { if (copySet.has(p)) return false; p = milestones.find(m => m.id === p)?.parent_id ?? null }
      return true
    }).sort((a, b) => order.indexOf(a) - order.indexOf(b))

    const copyIds = roots.flatMap(id => withDescendants(id))
    const newTaskId = new Map(copyIds.map(id => [id, crypto.randomUUID()]))
    const newRowId = (oldId) => newTaskId.has(oldId) ? `${newTaskId.get(oldId)}_${activeBL}` : null

    // Land below the selected row, at its level -- the same rule a drag
    // follows. With nothing selected, go to the end of the top level.
    const anchorId = [...selectedIds].sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ?? null
    const anchor = anchorId ? milestones.find(m => m.id === anchorId) : null
    const destParent = anchor ? (anchor.parent_id ?? null) : null
    const destPhase  = anchor ? anchor.phase : (milestones[0]?.phase ?? 'execution_monitoring')

    const sibs = milestones
      .filter(m => (m.parent_id ?? null) === destParent)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const at = anchor ? sibs.findIndex(m => m.id === anchor.id) + 1 : sibs.length
    const merged = [
      ...sibs.slice(0, at),
      ...roots.map(id => ({ id: newRowId(id) })),
      ...sibs.slice(at),
    ]
    const reorders = new Map(merged.map((m, i) => [m.id, i]))

    const rows = copyIds.map(oldId => {
      const src = milestones.find(m => m.id === oldId)
      const isRoot = roots.includes(oldId)
      return {
        id:             newRowId(oldId),
        task_id:        newTaskId.get(oldId),
        baseline_id:    activeBL,
        project_id:     project.id,
        parent_id:      isRoot ? destParent : newRowId(src.parent_id),
        phase:          isRoot ? destPhase : src.phase,
        milestone_name: src.milestone_name,
        duration:       src.duration ?? null,
        planned_start:  src.planned_start ?? null,
        planned_end:    src.planned_end ?? null,
        sort_order:     isRoot ? (reorders.get(newRowId(oldId)) ?? 0) : (src.sort_order ?? 0),
      }
    })

    const { error } = await supabase.from('workprogram_activities').insert(rows)
    if (error) { showToast(error.message, 'error'); return }

    // Only links with both ends inside the copied set: a predecessor pointing
    // at an original row would silently tie the copy to the thing it copied
    const inside = new Set(copyIds)
    const depCopies = dependencies
      .filter(d => inside.has(d.from_id) && inside.has(d.to_id))
      .map(d => ({
        project_id: project.id, baseline_id: activeBL,
        from_id: newRowId(d.from_id), to_id: newRowId(d.to_id),
        type: d.type, lag: d.lag ?? 0,
      }))
    if (depCopies.length) await supabase.from('workprogram_dependencies').insert(depCopies)

    // Push the rows now sitting below the inserted ones down to match
    for (const [id, sort_order] of reorders) {
      const existing = milestones.find(m => m.id === id)
      if (existing && (existing.sort_order ?? 0) !== sort_order) {
        await supabase.from('workprogram_activities').update({ sort_order }).eq('id', id)
      }
    }

    clearSelection()
    showToast(`${rows.length} ${rows.length === 1 ? 'activity' : 'activities'} pasted.`, 'success')
    loadMilestones(undefined, { silent: true })
  }

  // Deleting several rows is one statement, not a loop of round trips
  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    const list = ids.map(id => `"${id}"`).join(',')
    const [{ error }] = await Promise.all([
      supabase.from('workprogram_activities').delete().in('id', ids),
      supabase.from('workprogram_dependencies').delete().eq('baseline_id', activeBL)
        .or(`from_id.in.(${list}),to_id.in.(${list})`),
    ])
    if (error) { showToast(error.message, 'error'); return }
    clearSelection()
    setConfirmBulkDelete(false)
    showToast(`${ids.length} ${ids.length === 1 ? 'activity' : 'activities'} deleted.`, 'success')
    loadMilestones(undefined, { silent: true })
  }

  const handleSaveOrder = async () => {
    setSavingOrder(true)
    try {
      const { error } = await Promise.all(
        milestones.map(m =>
          supabase.from('workprogram_activities').update({ sort_order: m.sort_order, phase: m.phase, parent_id: m.parent_id }).eq('id', m.id)
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

  // What "unsaved" means, in one place
  const dirtyNames = Object.entries(drafts).filter(([id, name]) => {
    const m = milestones.find(x => x.id === id)
    return m && name.trim() && name.trim() !== m.milestone_name
  }).length
  const dirtyForecast = Object.entries(pendingEdits).filter(([id, p]) => {
    const m = milestones.find(x => x.id === id)
    if (!m) return false
    return (p.projected_start !== undefined && p.projected_start !== m.projected_start)
        || (p.projected_end   !== undefined && p.projected_end   !== m.projected_end)
        || (p.rem_dur         !== undefined && p.rem_dur         !== m.rem_dur)
  }).length

  // One button, applied in dependency order: names and order first, then the
  // forecast run, which reads the rows back out of the database
  const handleSaveEverything = async () => {
    setSavingAll(true)
    try {
      if (dirtyNames > 0) await handleSave()
      if (orderDirty) await handleSaveOrder()
      if (dirtyForecast > 0) await handleUpdate()
    } finally {
      setSavingAll(false)
    }
  }

  const handleDiscardEverything = () => {
    setDrafts({})
    setPendingEdits({})
    try { sessionStorage.removeItem(`gantt-pending-${activeBL}`) } catch {}
    if (orderDirty) handleDiscardOrder()
  }

  const handleDiscardOrder = () => {
    try { sessionStorage.removeItem(`milestone-order-${activeBL}`) } catch {}
    setOrderDirty(false)
    loadMilestones(undefined, { silent: true })
  }

  const handleOpenNewBLModal = async () => {
    setNewBLName('')
    setNewBLNum(String(nextBLNumber))
    setLoadTemplate(true)
    setSourceBLId(activeBL)
    setShowNewBLModal(true)
    // Template option is only relevant when creating the very first baseline
    if (baselines.length === 0) {
      const { count } = await supabase
        .from('work_program_template_tasks')
        .select('*', { count: 'exact', head: true })
      setTemplateCount(count ?? 0)
    }
  }

  // Baselines are named "Baseline <n>" and nothing else. Free text produced
  // "BL", "BL02", "Baseline 02" and "Initial" across projects, which is why
  // nothing could be matched between modules by name.
  const BL_NAME = (n) => `Baseline ${n}`
  const blNumberOf = (name) => {
    const m = String(name ?? '').match(/(\d+)\s*$/)
    return m ? parseInt(m[1], 10) : null
  }
  const usedBLNumbers = baselines.map(b => blNumberOf(b.name)).filter(n => n !== null)
  const usedBLSet = new Set(usedBLNumbers)
  const nextBLNumber = usedBLNumbers.length ? Math.max(...usedBLNumbers) + 1 : 1

  // A number belongs to a baseline until that baseline is deleted, so the
  // steppers walk past the taken ones instead of landing on them
  const stepBLNumber = (from, dir) => {
    let n = (parseInt(from, 10) || 0) + dir
    while (n >= 0 && usedBLSet.has(n)) n += dir
    return n < 0 ? null : n
  }
  const blNumTaken = newBLNum !== '' && usedBLSet.has(parseInt(newBLNum, 10))
  const blNumOwner = blNumTaken
    ? baselines.find(b => blNumberOf(b.name) === parseInt(newBLNum, 10))
    : null

  const handleCreateBaseline = async () => {
    const num = parseInt(newBLNum, 10)
    if (!Number.isInteger(num) || num < 0) {
      showToast('Enter a baseline number.', 'error')
      return
    }
    const label = BL_NAME(num)
    // The copy reads from the database, so anything still staged locally would be
    // silently left out of the new baseline
    if (Object.keys(pendingEdits).length > 0) {
      showToast('Unsaved forecast edits — click Update first so the new baseline picks them up.', 'error')
      return
    }
    if (orderDirty) {
      showToast('Unsaved row order — save it first so the new baseline picks it up.', 'error')
      return
    }
    // Two baselines with the same name are indistinguishable in every dropdown
    // Matches on the number, so a legacy "BL02" still blocks "Baseline 2"
    const clash = baselines.find(b =>
      blNumberOf(b.name) === num ||
      (b.name ?? '').trim().toLowerCase() === label.toLowerCase())
    if (clash) {
      showToast(`Number ${num} is already used by "${clash.name}" — pick another.`, 'error')
      return
    }

    // Copy from the baseline on screen unless another is picked, not from
    // whichever happens to be newest
    const srcBL = baselines.find(b => b.id === (sourceBLId ?? activeBL)) ?? null

    // Decided before anything is written, so the empty-source case cannot end
    // as a silent success
    let srcActs = []
    if (srcBL) {
      const { data } = await supabase.from('workprogram_activities').select('*').eq('baseline_id', srcBL.id)
      srcActs = data ?? []
      if (!srcActs.length) {
        showToast(`"${srcBL.name}" has no activities to copy — pick another baseline to copy from.`, 'error')
        return
      }
    }

    setCreatingBL(true)
    let newBlId = null
    try {
      const { data, error: blErr } = await supabase
        .from('workprogram_baselines')
        .insert({ project_id: project.id, name: label })
        .select('id')
        .single()
      if (blErr || !data) { showToast(blErr?.message ?? 'Failed to create baseline', 'error'); return }
      newBlId = data.id

      if (!srcBL) {
        // First baseline: the modal's template choice decides, nothing else
        if (loadTemplate && templateCount > 0) {
          const { error: copyErr } = await copyTemplateToBaseline(newBlId, project.id, supabase)
          if (copyErr) { console.error('[baseline] template copy error:', copyErr); showToast(copyErr, 'error'); return }
        }
      } else {
        // parent_id points at the source baseline's row ids -- remap it onto the
        // copies, otherwise children lose their summary parent in the new baseline
        const taskIdByOldId = Object.fromEntries(srcActs.map(a => [a.id, a.task_id]))
        const copies = srcActs.map(({ id: _id, ...rest }) => ({
          ...rest,
          id:            `${rest.task_id}_${newBlId}`,
          baseline_id:   newBlId,
          parent_id:     rest.parent_id && taskIdByOldId[rest.parent_id]
            ? `${taskIdByOldId[rest.parent_id]}_${newBlId}`
            : null,
          // Re-baseline onto what the grid actually shows: actuals for work
          // already started/finished, forecast for the rest. The stored
          // projected_* can be a stale forecast once an actual date exists.
          planned_start: rest.actual_start ?? rest.projected_start ?? rest.planned_start,
          planned_end:   rest.actual_end   ?? rest.projected_end   ?? rest.planned_end,
        }))
        const { error: copyErr } = await supabase.from('workprogram_activities').insert(copies)
        if (copyErr) { console.error('[baseline] copy error:', copyErr); showToast(copyErr.message, 'error'); return }

        // Carry predecessor links over, remapped onto the copied activity ids
        const newId = (oldId) => taskIdByOldId[oldId] ? `${taskIdByOldId[oldId]}_${newBlId}` : null
        const { data: srcDeps } = await supabase
          .from('workprogram_dependencies')
          .select('from_id, to_id, type, lag')
          .eq('baseline_id', srcBL.id)
        const depCopies = (srcDeps ?? [])
          .map(d => ({
            project_id:  project.id,
            baseline_id: newBlId,
            from_id:     newId(d.from_id),
            to_id:       newId(d.to_id),
            type:        d.type,
            lag:         d.lag ?? 0,
          }))
          .filter(d => d.from_id && d.to_id)
        if (depCopies.length) {
          const { error: depErr } = await supabase.from('workprogram_dependencies').insert(depCopies)
          if (depErr) { console.error('[baseline] dependency copy error:', depErr); showToast(depErr.message, 'error'); return }
        }
      }

      const { data: newBLs } = await supabase
        .from('workprogram_baselines')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at')
      if (newBLs) { setBaselines(newBLs); setActiveBL(newBlId) }
      newBlId = null // created and populated; nothing to roll back
      setNewBLNum('')
      setShowNewBLModal(false)
      showToast('Baseline created.', 'success')
    } finally {
      // Anything that returned early above left a named baseline with no
      // activities behind it. Drop it, or the list fills with empty baselines
      // every time someone retries.
      if (newBlId) {
        await supabase.from('workprogram_activities').delete().eq('baseline_id', newBlId)
        await supabase.from('workprogram_dependencies').delete().eq('baseline_id', newBlId)
        await supabase.from('workprogram_baselines').delete().eq('id', newBlId)
      }
      setCreatingBL(false)
    }
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

    // Predecessors are written as display row numbers (same notation as the grid),
    // numbered over the fully expanded tree so they line up with the sheet's rows
    const exportRowNums = new Map()
    allVisible.forEach((node, i) => exportRowNums.set(node.id, i + 1))

    const exportRows = allVisible.map(node => {
      const parentNode = node.parent_id ? allVisible.find(x => x.id === node.parent_id) : null
      return {
        seq:             buildSeqForExport(node, allVisible),
        phase:           MILESTONE_PHASE_MAP_OUT?.[node.phase] ?? node.phase,
        milestone_name:  node.milestone_name,
        parent_name:     parentNode?.milestone_name ?? '',
        predecessors:    formatPredecessors(dependencies.filter(d => d.to_id === node.id), exportRowNums),
        planned_start:   node.planned_start   ?? '',
        planned_end:     node.planned_end     ?? '',
        actual_start:    node.actual_start    ?? '',
        actual_end:      node.actual_end      ?? '',
        projected_start: node.projected_start ?? '',
        projected_end:   node.projected_end   ?? '',
      }
    })

    const blName = baselines.find(b => b.id === activeBL)?.name ?? ''
    downloadWorkbook([{
      rows: exportRows,
      columns: [
        { key: 'seq',             header: 'Seq' },
        { key: 'phase',           header: 'Phase' },
        { key: 'milestone_name',  header: 'Milestone Name' },
        { key: 'parent_name',     header: 'Parent Milestone' },
        { key: 'predecessors',    header: 'Predecessors' },
        { key: 'planned_start',   header: 'Planned Start' },
        { key: 'planned_end',     header: 'Planned End' },
        { key: 'actual_start',    header: 'Actual Start' },
        { key: 'actual_end',      header: 'Actual End' },
        { key: 'projected_start', header: 'Projected Start' },
        { key: 'projected_end',   header: 'Projected End' },
      ],
      sheetName: 'Milestones',
    }], `${project.name}_milestones${blName ? `_${blName}` : ''}.xlsx`)
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
      const predTexts = [] // predecessor cell per row, index-aligned with newRows
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
        predTexts.push(String(r['Predecessors'] ?? '').trim())
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
        .from('workprogram_baselines')
        .insert({ project_id: pid, name: label })
        .select('id').single()
      if (blErr) throw blErr
      const blId = blData.id

      // Summary rows are exported as rows in their own right, so link rows to each
      // other by name. Synthesising a parent per "Parent Milestone" value instead
      // would duplicate every summary (once empty holding the children, once with
      // the real dates but childless) and flatten anything deeper than one level.
      const parentNameToDbId = {}
      const prepared = newRows.map(r => {
        const rawId = crypto.randomUUID()
        const actId = `${rawId}_${blId}`
        if (!(r.milestone_name in parentNameToDbId)) parentNameToDbId[r.milestone_name] = actId
        return { ...r, _rawId: rawId, _actId: actId }
      })

      // A parent named in the sheet but never listed as its own row still needs one
      const missingParents = [...new Set(
        prepared.map(r => r._parentName).filter(n => n && !(n in parentNameToDbId))
      )]
      if (missingParents.length > 0) {
        const parentRows = missingParents.map((name, i) => {
          const rawId = crypto.randomUUID()
          const actId = `${rawId}_${blId}`
          parentNameToDbId[name] = actId
          return {
            id:             actId,
            task_id:        rawId,
            baseline_id:    blId,
            project_id:     pid,
            phase:          prepared.find(r => r._parentName === name)?.phase ?? 'initiation',
            milestone_name: name,
            sort_order:     -(missingParents.length - i),
          }
        })
        const { error: pErr } = await supabase.from('workprogram_activities').insert(parentRows)
        if (pErr) throw pErr
      }

      const childRows = prepared.map(({ _parentName, _rawId, _actId, ...rest }) => {
        const parentId = _parentName ? (parentNameToDbId[_parentName] ?? null) : null
        return {
          ...rest,
          id:          _actId,
          task_id:     _rawId,
          baseline_id: blId,
          // guard against a row naming itself as its own parent
          parent_id:   parentId === _actId ? null : parentId,
        }
      })
      const { error: cErr } = await supabase.from('workprogram_activities').insert(childRows)
      if (cErr) throw cErr

      // Predecessors reference sheet row numbers, which match the order rows were read
      const rowNumToId = new Map(prepared.map((r, i) => [i + 1, r._actId]))
      const depRows = []
      prepared.forEach((r, i) => {
        if (!predTexts[i]) return
        const parsed = parsePredecessors(predTexts[i], rowNumToId)
        if (!parsed) return // unresolvable reference -- skip rather than fail the import
        parsed.forEach(d => {
          if (d.fromId === r._actId) return
          depRows.push({
            project_id:  pid,
            baseline_id: blId,
            from_id:     d.fromId,
            to_id:       r._actId,
            type:        d.type,
            lag:         d.lagDays ?? 0,
          })
        })
      })
      if (depRows.length) {
        const { error: dErr } = await supabase.from('workprogram_dependencies').insert(depRows)
        if (dErr) throw dErr
      }

      const { data: newBLs } = await supabase
        .from('workprogram_baselines')
        .select('*')
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
    const { error } = await supabase.from('workprogram_baselines').delete().eq('id', blId)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Baseline deleted.', 'success')
    const remaining = baselines.filter(b => b.id !== blId)
    setBaselines(remaining)
    setActiveBL(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
    setInlineAdd(null); setInlineAddName('')
  }

  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      setLabelW(mobile ? 160 : LABEL_W)
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const effectiveLabelW = isMobile ? 0 : labelW
  const effectiveRowNumW = isMobile ? 0 : ROW_NUM_W

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
    buildTree(milestones, collapsedIds).forEach(node => {
      n++
      map.set(n, node.id)
    })
    return map
  }

  const handleSavePreds = async (milestoneId, text) => {
    const rowNumToId = computeRowNumToId()
    const parsed = parsePredecessors(text, rowNumToId)
    if (parsed === null) {
      showToast('Invalid format -- use row numbers and types, e.g. 3FS or 2SS+5', 'error')
      return
    }
    if (parsed.some(p => p.fromId === milestoneId)) {
      showToast('A task cannot be its own predecessor.', 'error')
      return
    }
    // Delete existing outbound deps for this task in this baseline, then reinsert
    await supabase.from('workprogram_dependencies')
      .delete().eq('to_id', milestoneId).eq('baseline_id', activeBL)
    if (parsed.length > 0) {
      const depRows = parsed.map(d => ({
        project_id:  project.id,
        baseline_id: activeBL,
        from_id:     d.fromId,
        to_id:       milestoneId,
        type:        d.type,
        lag:         d.lagDays ?? 0,
      }))
      const { error } = await supabase.from('workprogram_dependencies').insert(depRows)
      if (error) { showToast(error.message, 'error'); return }
    }
    const newDeps = parsed.map(d => ({ id: d.fromId, type: d.type, lag: d.lagDays ?? 0 }))
    const updatedMilestones = milestones.map(m => m.id === milestoneId ? { ...m, dependencies: newDeps } : m)
    setMilestones(updatedMilestones)
    setDependencies(expandDependencies(updatedMilestones))
    showToast('Predecessors updated.', 'success')
    if (isAutoMode && blStartDate) {
      await runScheduler()
    } else if (!isBLConfirmed) {
      const schedStart = blStartDate
        || milestones.map(m => m.planned_start).filter(Boolean).sort()[0]
        || null
      if (schedStart) await runScheduler(schedStart)
    }
  }

  const activeBLObj    = baselines.find(b => b.id === activeBL) ?? null
  const isAutoMode     = false
  const blStartDate    = activeBLObj?.start_date ?? null
  const isBLConfirmed  = !!(activeBLObj?.confirmed_at)

  const handleSaveStartDate = async (isoDate) => {
    const val = isoDate || null
    const { error } = await supabase
      .from('workprogram_baselines')
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
      .from('workprogram_baselines')
      .update({ confirmed_at: now })
      .eq('id', activeBL)
    if (error) { showToast(error.message, 'error'); return }
    setBaselines(prev => prev.map(b => b.id === activeBL ? { ...b, confirmed_at: now } : b))
    const label = activeBLObj?.name ?? 'Baseline'
    showToast(`"${label}" locked and finalised. Planning fields are now read-only.`, 'success')
  }

  const runScheduler = async (startDateOverride) => {
    if (schedulerRunning.current) return false
    schedulerRunning.current = true
    try {
      const startDate = startDateOverride ?? blStartDate
      if (!startDate || !activeBL) return false

      const [{ data: msRaw }, { data: depsRaw }] = await Promise.all([
        supabase.from('workprogram_activities').select('*')
          .eq('project_id', project.id).eq('baseline_id', activeBL).order('sort_order'),
        supabase.from('workprogram_dependencies').select('from_id, to_id, type, lag')
          .eq('baseline_id', activeBL),
      ])
      const dByTo = {}
      for (const d of depsRaw ?? []) {
        if (!dByTo[d.to_id]) dByTo[d.to_id] = []
        dByTo[d.to_id].push({ id: d.from_id, type: d.type, lag: d.lag ?? 0 })
      }
      const ms = (msRaw ?? []).map(t => ({ ...t, dependencies: dByTo[t.id] ?? [] }))
      const deps = expandDependencies(ms).map(d => ({ ...d, lag_days: d.lag ?? 0 }))

      const result = scheduleMilestones(ms ?? [], deps, startDate)

      if (result?.error === 'circular') {
        showToast('Circular dependency detected -- schedule not updated.', 'error')
        return false
      }

      const entries = Object.entries(result)
      if (!entries.length) {
        loadMilestones(undefined, { silent: true })
        return true
      }

      const results = await Promise.all(
        entries.map(([id, dates]) =>
          supabase.from('workprogram_activities')
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
      loadMilestones(undefined, { silent: true })
      return !failed.length
    } finally {
      schedulerRunning.current = false
    }
  }

  const handleSaveDuration = async (milestoneId, duration) => {
    const { error } = await supabase
      .from('workprogram_activities')
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
      loadMilestones(undefined, { silent: true })
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

  const handleUpdate = async () => {
    if (!dataDate || !activeBL) { showToast('Set a data date first.', 'error'); return }

    // Leaf nodes = rows that are not a parent of any other row
    const parentIds = new Set(milestones.map(m => m.parent_id).filter(Boolean))
    const isLeaf = m => !parentIds.has(m.id)

    // Build mutable working copy — merge pending local edits first
    const proj = {}
    for (const m of milestones) {
      const p = pendingEdits[m.id] ?? {}
      proj[m.id] = {
        projected_start: p.projected_start !== undefined ? p.projected_start : m.projected_start,
        projected_end:   p.projected_end   !== undefined ? p.projected_end   : m.projected_end,
        rem_dur:         p.rem_dur         !== undefined ? p.rem_dur         : m.rem_dur,
      }
    }

    const blDurDays = m => {
      if (!m.planned_start || !m.planned_end) return null
      return Math.round((new Date(m.planned_end + 'T00:00:00') - new Date(m.planned_start + 'T00:00:00')) / 86400000)
    }

    // Step 1a: unstarted leaf tasks — ensure proj_start >= dataDate, fill in proj_end if missing
    for (const m of milestones) {
      if (!isLeaf(m)) continue
      if (m.actual_start) continue
      // Push projected_start forward to dataDate if it's in the past or unset
      if (!proj[m.id].projected_start || proj[m.id].projected_start < dataDate) {
        proj[m.id].projected_start = dataDate
      }
      // Always fill in projected_end if missing (needed so BFS can cascade from this task)
      if (!proj[m.id].projected_end) {
        const anchor = proj[m.id].projected_start
        if (proj[m.id].rem_dur != null) {
          proj[m.id].projected_end = addDays(anchor, proj[m.id].rem_dur)
        } else {
          const dur = blDurDays(m)
          if (dur != null) proj[m.id].projected_end = addDays(anchor, dur)
        }
      }
      // Clamp: end must not be before start
      if (proj[m.id].projected_end && proj[m.id].projected_end < proj[m.id].projected_start) {
        proj[m.id].projected_end = proj[m.id].projected_start
      }
    }

    // Step 1b: in-progress leaf tasks (actual_start set, no actual_end) — compute proj_end if missing
    for (const m of milestones) {
      if (!isLeaf(m)) continue
      if (!m.actual_start || m.actual_end) continue
      if (proj[m.id].projected_end) continue
      const anchor = m.actual_start
      let computed = null
      if (proj[m.id].rem_dur != null) {
        computed = addDays(anchor, proj[m.id].rem_dur)
      } else {
        const dur = blDurDays(m)
        if (dur != null) computed = addDays(anchor, dur)
      }
      if (computed) proj[m.id].projected_end = computed < dataDate ? dataDate : computed
    }

    // Step 2: cascade forward through dependency chain (BFS)
    // Store full dep objects (not just to_id) so lag can be applied.
    const depsByFrom = {}
    for (const d of dependencies) {
      if (!depsByFrom[d.from_id]) depsByFrom[d.from_id] = []
      depsByFrom[d.from_id].push(d)
    }
    // Seed from ALL leaf tasks that have a projected_end (not just ones modified in Step 1a)
    // so every predecessor constraint is evaluated, not only constraints downstream of Step 1a changes.
    const queue = milestones
      .filter(m => isLeaf(m) && (proj[m.id].projected_start || proj[m.id].projected_end || m.actual_start || m.actual_end))
      .map(m => m.id)
    const visited = new Set(queue)
    while (queue.length) {
      const fromId = queue.shift()
      const fromM = milestones.find(x => x.id === fromId)
      const fromStart = proj[fromId].projected_start || fromM?.actual_start
      const fromEnd   = proj[fromId].projected_end   || fromM?.actual_end
      for (const dep of (depsByFrom[fromId] ?? [])) {
        const toId = dep.to_id
        const lag = dep.lag ?? 0
        const type = dep.type ?? 'FS'
        // Compute constraint date based on dependency type
        let constraintDate
        if (type === 'SS') {
          if (!fromStart) continue
          constraintDate = addDays(fromStart, lag)
        } else if (type === 'FF') {
          if (!fromEnd) continue
          // FF constrains successor END, not start — skip start scheduling here
          continue
        } else {
          // FS (default) and SF
          if (!fromEnd) continue
          constraintDate = addDays(fromEnd, lag)
        }
        const toM = milestones.find(x => x.id === toId)
        if (!toM || toM.actual_start || !isLeaf(toM)) continue
        const newStart = constraintDate >= dataDate ? constraintDate : dataDate
        // Multiple predecessors: latest constraint governs — only update if this pushes date later
        if (proj[toId].projected_start && newStart <= proj[toId].projected_start) continue
        proj[toId].projected_start = newStart
        // Recompute projected_end to maintain duration
        if (proj[toId].rem_dur != null) {
          proj[toId].projected_end = addDays(newStart, proj[toId].rem_dur)
        } else {
          const dur = blDurDays(toM)
          if (dur != null) proj[toId].projected_end = addDays(newStart, dur)
        }
        // Clamp: end must not be before start (e.g. stale projected_end with no duration info)
        if (proj[toId].projected_end && proj[toId].projected_end < newStart) {
          proj[toId].projected_end = newStart
        }
        // Always re-queue successor (even if visited) so downstream tasks cascade correctly
        // when a later predecessor pushes this task further out
        visited.add(toId)
        queue.push(toId)
      }
    }

    // Step 3: save changed rows (projected dates + rem_dur from pending edits)
    const changed = milestones.filter(m => {
      const p = proj[m.id]
      const pe = pendingEdits[m.id] ?? {}
      return p.projected_start !== m.projected_start
          || p.projected_end   !== m.projected_end
          || (pe.rem_dur !== undefined && pe.rem_dur !== m.rem_dur)
    })
    if (!changed.length) {
      // Staged edits that compute to what is already stored are not pending
      // work -- leaving them would keep the save strip up for ever
      setPendingEdits({})
      try { sessionStorage.removeItem(`gantt-pending-${activeBL}`) } catch { /* ignore */ }
      showToast('Already up to date.')
      return
    }

    const results = await Promise.all(changed.map(m => {
      const p = proj[m.id]
      const pe = pendingEdits[m.id] ?? {}
      const updates = { projected_start: p.projected_start, projected_end: p.projected_end }
      if (pe.rem_dur !== undefined) updates.rem_dur = pe.rem_dur
      return supabase.from('workprogram_activities').update(updates).eq('id', m.id)
    }))
    const failed = results.filter(r => r.error)
    if (failed.length) { showToast('Update partially failed.', 'error') } else { showToast(`Updated ${changed.length} activit${changed.length === 1 ? 'y' : 'ies'}.`) }
    // Written through -- drop the staged copy so the reload doesn't restore it
    setPendingEdits({})
    try { sessionStorage.removeItem(`gantt-pending-${activeBL}`) } catch { /* ignore */ }
    loadMilestones(undefined, { silent: true })
  }

  useEffect(() => {
    onRegisterFns?.({ toggleSettings: () => setShowSettings(v => !v), update: handleUpdate })
  })

  useEffect(() => {
    const name = baselines.find(b => b.id === activeBL)?.name ?? null
    onActiveBLChange?.(name)
  }, [activeBL, baselines])

  return (
    <>
      <style>{`
        @keyframes gmenu-in { from { opacity:0; transform:scale(0.95) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes gsettings-in { from { opacity:0; transform:scale(0.97) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .gantt-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <GImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />

      {/* Mobile hero card */}
      <div className="sm:hidden flex-shrink-0" style={{ boxShadow: 'rgba(0,0,0,0.15) 2px 3px 8px' }}>
        <div className="relative flex flex-col w-full" style={{ background: 'linear-gradient(115deg, #6b7280 0%, #4b5563 50%, #374151 100%)' }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute rounded-full" style={{ background: 'rgba(255,255,255,0.12)', width: 300, height: 300, top: '-40%', right: '-50%' }} />
            <div className="absolute rounded-full" style={{ background: 'rgba(255,255,255,0.12)', width: 210, height: 210, top: '-30%', right: '-30%' }} />
            <div className="absolute rounded-full" style={{ background: 'rgba(255,255,255,0.20)', width: 100, height: 100, top: '10%',  right: '-8%'  }} />
          </div>
          <div className="flex-shrink-0" style={{ height: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }} />
          <div className="relative z-10 pl-5 pb-1">
            <span className="text-2xl font-bold text-white tracking-wide">Work Program</span>
          </div>
          {baselines.length > 0 && (
            <div className="relative z-10 px-5 pb-4">
              <GToolbarSelect
                fullWidth
                ghost
                value={activeBL ?? ''}
                onChange={v => { setActiveBL(v); setInlineAdd(null); setInlineAddName('') }}
                options={baselines.map(b => ({ value: b.id, label: blLabel(b) }))}
              />
            </div>
          )}
          {baselines.length === 0 && <div className="pb-4" />}
        </div>
        <div className="flex items-stretch w-full rounded-b-3xl overflow-hidden" style={{ height: 52, background: '#1f2937' }}>
          {TIME_SCALES.map(s => (
            <button
              key={s.key}
              onClick={() => setTimeScale(s.key)}
              className="flex-1 flex flex-col items-center justify-center transition-all duration-200"
              style={timeScale === s.key ? { background: 'rgba(255,255,255,0.18)' } : { background: 'transparent' }}
            >
              <span className="font-bold leading-none" style={{ fontSize: 14, color: timeScale === s.key ? '#fff' : 'rgba(255,255,255,0.55)' }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 relative">

        {/* -- Desktop layout (sm+) -- settings panel anchor only -- */}
        <div className="hidden sm:block relative" ref={settingsWrapRef}>


          {/* -- Settings panel -- */}
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
              {/* -- Baseline -- */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Baseline</p>
                {baselines.length > 0 ? (
                  <GToolbarSelect
                    fullWidth
                    value={activeBL ?? ''}
                    onChange={v => { setActiveBL(v); setInlineAdd(null); setInlineAddName('') }}
                    options={baselines.map(b => ({ value: b.id, label: blLabel(b) }))}
                  />
                ) : (
                  <p className="text-xs text-gray-400 italic">No baselines yet</p>
                )}
              </div>

              {/* -- Scheduling (only if baseline active) -- */}
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
                  </div>
                </div>
              )}

              {/* -- Display -- */}
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

              {/* -- Column visibility -- */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Columns</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {[
                    { key: 'duration',    label: 'BL Duration' },
                    { key: 'remDur',      label: 'Rem. Duration' },
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

              {/* -- Bar visibility + colors -- */}
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
                  <label className="flex items-center gap-2 cursor-pointer select-none mt-0.5">
                    <input
                      type="checkbox"
                      checked={showBarLabels}
                      onChange={e => setShowBarLabels(e.target.checked)}
                      className="w-3.5 h-3.5 rounded cursor-pointer flex-shrink-0"
                      style={{ accentColor: '#ed6055' }}
                    />
                    <span className="text-xs text-gray-700">Activity labels</span>
                  </label>
                </div>
              </div>

              {/* -- Data Date -- */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">Data Date</p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dataDate}
                    onChange={e => setDataDate(e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white"
                  />
                  {dataDate && (
                    <button
                      onClick={() => setDataDate('')}
                      className="text-[11px] text-gray-400 hover:text-[#ed6055] transition-colors font-medium underline underline-offset-2 whitespace-nowrap"
                    >
                      clear
                    </button>
                  )}
                </div>
                {!dataDate && (
                  <p className="text-[10px] text-gray-400 mt-1.5">Showing today's line. Set a date to override.</p>
                )}
              </div>

              {/* -- Save view (admin only) -- */}
              {isAdmin && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-400 mb-2">View</p>
                  <button
                    onClick={handleSaveView}
                    disabled={savingView}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#ed6055]/40 text-[#ed6055] bg-[#ed6055]/5 hover:bg-[#ed6055]/10 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    {savingView ? 'Saving…' : 'Save view for all users'}
                  </button>
                </div>
              )}

              {/* -- Baseline actions (admin only) -- */}
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


      {/* One save strip for every kind of pending change -- names, row order
          and forecast edits each used to have their own button and their own
          colour, which made "have I saved?" a three-part question */}
      {(dirtyNames > 0 || orderDirty || dirtyForecast > 0) && (
        <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-[#ed6055]/20 border-l-4 border-l-[#ed6055] flex-shrink-0" style={{ background: 'rgba(237,96,85,0.06)' }}>
          <svg className="w-3.5 h-3.5 text-[#ed6055] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">
            Unsaved: {[
              dirtyNames > 0 && `${dirtyNames} name${dirtyNames !== 1 ? 's' : ''}`,
              orderDirty && 'row order',
              dirtyForecast > 0 && `${dirtyForecast} forecast edit${dirtyForecast !== 1 ? 's' : ''}`,
            ].filter(Boolean).join(' · ')}
          </span>
          <button
            onClick={handleSaveEverything}
            disabled={savingAll}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#ed6055] text-white text-xs font-semibold hover:bg-[#d94f45] transition-colors active:scale-[0.97] disabled:opacity-60 flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {savingAll ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleDiscardEverything}
            disabled={savingAll}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors active:scale-[0.97] disabled:opacity-60 flex-shrink-0"
          >
            Discard
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col px-0 sm:px-6 pb-6 pt-4">
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
          <div className="relative flex-1 min-h-0 flex flex-col">
            <GanttChart
              milestones={milestones.map(m => pendingEdits[m.id] ? { ...m, ...pendingEdits[m.id] } : m)}
              overrideMin={overrideMin}
              overrideMax={overrideMax}
              timeScale={timeScale}
              colPx={colPx}
              labelW={effectiveLabelW}
              setLabelW={setLabelW}
              rowNumW={effectiveRowNumW}
              disableDrag={isMobile}
              colVisibility={colVisibility}
              barVisibility={barVisibility}
              barColors={barColors}
              showBarLabels={showBarLabels}
              drafts={drafts}
              setDrafts={setDrafts}
              onSave={handleSave}
              onDelete={(id) => setDeleteId(id)}
              isAdmin={isAdmin}
              canEdit={isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser'}
              showToast={showToast}
              inlineAdd={inlineAdd}
              inlineAddName={inlineAddName}
              onInlineNameChange={setInlineAddName}
              onInlineSave={handleInlineSave}
              onInlineCancel={handleInlineCancel}
              inlineAdding={inlineAdding}
              onSetInlineAdd={({ parentId, phase }) => handleAddActivity({ parentId, phase })}
              activeBL={activeBL}
              collapsedIds={collapsedIds}
              onToggleCollapse={handleToggleCollapse}
              dependencies={dependencies}
              onSavePreds={handleSavePreds}
              isAutoMode={isAutoMode}
              isBLConfirmed={isBLConfirmed}
              onSaveDuration={handleSaveDuration}
              onSaveDate={handleSaveDate}
              onSaveRemDur={handleSaveRemDur}
              onReorder={handleReorder}
              selectedIds={selectedIds}
              onSelect={handleSelectRow}
              onSelectAll={handleSelectAll}
              rowPasteArmed={rowClipboard.length > 0}
              onSetCollapseLevel={handleSetCollapseLevel}
              maxLevel={maxLevel}
              dataDate={dataDate}
            />
            {/* Floating legend card */}
            {[{ key: 'planned', label: 'Planned' }, { key: 'actual', label: 'Actual' }, { key: 'projected', label: 'Forecast' }].some(b => barVisibility[b.key]) && (
              <div className="absolute top-16 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 px-3 py-2.5 flex flex-col gap-1.5 pointer-events-none select-none">
                {[
                  { key: 'planned',   label: 'Planned' },
                  { key: 'actual',    label: 'Actual' },
                  { key: 'projected', label: 'Forecast' },
                ].filter(b => barVisibility[b.key]).map(b => (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="w-5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: barColors[b.key] }} />
                    <span className="text-[11px] text-gray-600 leading-none">{b.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {deleteId !== null && (
        <GConfirmDeleteModal
          onConfirm={() => { handleDelete(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setConfirmBulkDelete(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Delete {selectedIds.size} {selectedIds.size === 1 ? 'activity' : 'activities'}?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Their predecessor links go too. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulkDelete(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleDeleteSelected} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {showNewBLModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setShowNewBLModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">
              {baselines.length > 0 ? 'Update Baseline' : 'New Baseline'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {baselines.length > 0
                ? `Pick the revision number. It will be a copy of "${baselines.find(b => b.id === activeBL)?.name ?? 'current baseline'}" that you can then edit.`
                : 'Pick the number for this first baseline.'}
            </p>

            {/* Number only -- the name is always "Baseline <n>". Free text gave
                us BL, BL02, Baseline 02 and Initial across projects. */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-600 select-none">Baseline</span>
                <button
                  type="button"
                  onClick={() => setNewBLNum(n => { const v = stepBLNumber(n, -1); return v === null ? n : String(v) })}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition flex-shrink-0"
                  aria-label="Lower the number"
                >
                  &minus;
                </button>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={newBLNum}
                  onChange={e => setNewBLNum(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && newBLNum !== '' && !blNumTaken) handleCreateBaseline() }}
                  className={`w-16 px-3 py-2.5 rounded-xl border text-base sm:text-sm text-center text-black focus:outline-none focus:ring-2 focus:ring-[#ed6055] ${blNumTaken ? 'border-[#ed6055] bg-red-50' : 'border-gray-200'}`}
                />
                <button
                  type="button"
                  onClick={() => setNewBLNum(n => String(stepBLNumber(n, 1)))}
                  className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition flex-shrink-0"
                  aria-label="Raise the number"
                >
                  +
                </button>
              </div>
              {blNumTaken ? (
                <p className="text-[11px] text-[#ed6055] font-medium mt-1.5">
                  Number {newBLNum} is already used by "{blNumOwner?.name}". Delete it first, or pick another.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Will be saved as <span className="font-semibold text-gray-600">{newBLNum === '' ? 'Baseline —' : BL_NAME(parseInt(newBLNum, 10))}</span>
                  {usedBLNumbers.length > 0 && <span className="text-gray-400"> · {[...usedBLSet].sort((a, b) => a - b).join(', ')} taken</span>}
                </p>
              )}
            </div>
            {/* Template option -- only when creating the very first baseline */}
            {baselines.length === 0 && templateCount > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-700 mb-2">Load standard work program?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLoadTemplate(true)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${loadTemplate ? 'border-[#ed6055] bg-red-50 text-[#ed6055]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Yes -- Pre-fill with template
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoadTemplate(false)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${!loadTemplate ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                  >
                    No -- Start blank
                  </button>
                </div>
              </div>
            )}
            {/* Which baseline the activities are copied from. Defaults to the
                one on screen -- silently copying the newest overrides whatever
                the user deliberately opened. */}
            {baselines.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Copy activities from</p>
                <SearchDropdown
                  options={baselines.map(b => ({ value: b.id, label: blLabel(b) }))}
                  value={sourceBLId ?? ''}
                  onChange={v => setSourceBLId(v || null)}
                  emptyValue=""
                  emptyLabel="Select baseline"
                  placeholder="Select baseline"
                  fluid
                />
              </div>
            )}

            {/* Reminder note -- updating an existing baseline */}
            {baselines.length > 0 && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-800 leading-relaxed">
                Only update the baseline when there are actual schedule revisions. If the current baseline still reflects the approved plan, a new baseline is not needed.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowNewBLModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                disabled={newBLNum === '' || blNumTaken || creatingBL}
                onClick={handleCreateBaseline}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >{creatingBL ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Pending import -- name the baseline */}
      {pendingImportFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setPendingImportFile(null)}>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setDeleteBLId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Delete baseline?</h3>
            <p className="text-sm text-gray-500 mb-1">
              You are about to delete <span className="font-semibold text-gray-700">{blLabel(baselines.find(b => b.id === deleteBLId))}</span>.
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
    <div className="fixed inset-0 z-50 bg-black/10 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
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
