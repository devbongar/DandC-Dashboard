import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase, fetchAll } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toDateStr, toFloat, toInt } from '../lib/excelUtils'
import { PH_PROVINCES, PH_CITIES } from '../lib/philippinesLocations'
import TriangleLoader from './TriangleLoader'
import { GanttContent } from './GanttModal'
import SCurveTab from './SCurveTab'
import useProfile from '../hooks/useProfile'
import ReportBuilderModal from './ReportBuilderModal'
import SearchDropdown from './SearchDropdown'
import PermitsTab from './PermitsTab'

// -- Constants -----------------------------------------------------------------

const PHASES = [
  { key: 'initiation',           label: 'Initiation',            color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  { key: 'planning',             label: 'Planning',              color: '#64748b', badge: 'bg-slate-50 text-slate-600 border-slate-200' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring',color: '#ed6055', badge: 'bg-[#ed6055]/10 text-[#ed6055] border-[#ed6055]/20' },
  { key: 'closeout',             label: 'Close-Out',             color: '#22c55e', badge: 'bg-green-50 text-green-600 border-green-200' },
]
const PHASE_MAP = Object.fromEntries(PHASES.map(p => [p.key, p]))


const BUSINESS_UNITS = [
  { code: 'FPI',    label: 'Famtech Properties Inc.' },
  { code: 'MDRI',   label: 'Megawide Dreamrise Residences Inc.' },
  { code: 'PCI',    label: 'Plushomes Inc.' },
  { code: 'PH1VEL', label: 'PH1VEL Properties Inc.' },
  { code: 'PH1',    label: 'PH1 World Developers Inc.' },
  { code: 'PH1L',   label: 'PH1 World Landscapes Inc.' },
]
const formatBU = code => code || null

const PERMIT_STATUSES = [
  { key: 'done',            label: 'Done',            badge: 'bg-green-50 text-green-600',    dot: 'bg-green-500' },
  { key: 'ongoing',         label: 'Ongoing',         badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  { key: 'not_yet_started', label: 'Not Yet Started', badge: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400' },
]
const PERMIT_STATUS_MAP = Object.fromEntries(PERMIT_STATUSES.map(s => [s.key, s]))


const fmt       = d => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '--'
const getFileName = url => url ? decodeURIComponent(url.split('/').pop().split('?')[0]) : null
const noNeg = (...vals) => vals.filter(v => v !== null && v !== undefined).some(v => v < 0)

const inputCls  = 'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:border-[#ed6055] bg-white transition-colors'

const ISSUE_STATUS_CONFIG = {
  open:  { label: 'Open',  cls: 'bg-[#ed6055] text-white' },
  close: { label: 'Close', cls: 'bg-green-50 text-green-600' },
  hold:  { label: 'Hold',  cls: 'bg-amber-50 text-amber-600' },
}
const ISSUE_GROUPS = ['Commercial', 'Design', 'Construction', 'Compliance']
const MANAGEMENT_LEVELS = ['ESA', 'Management Committee']
const issueAgingDays = (d) => d ? Math.max(0, Math.floor((new Date() - new Date(d)) / 86400000)) : null
const fmtIssueDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '--'
const ISSUE_EMPTY = { issue_group: '', management_level: '', status: 'open', date_presented: '', date_bad: false, details: '', caused_by: '', action_steps: '' }

// -- Combobox ------------------------------------------------------------------

function HighlightMatch({ text, query }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#ed6055]/15 text-[#ed6055] font-semibold not-italic" style={{ borderRadius: '3px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function Combobox({ options = [], value, onChange, placeholder, disabled = false }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [display, setDisplay] = useState(value ?? '')
  const [dropUp, setDropUp] = useState(false)
  const containerRef        = useRef(null)

  const checkFlip = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropUp(window.innerHeight - rect.bottom < 240)
  }

  // Sync display text when value is set externally (e.g. province reset clears city)
  useEffect(() => { setDisplay(value ?? ''); setQuery('') }, [value])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options
  }, [query, options])

  const select = (opt) => {
    onChange(opt)
    setDisplay(opt)
    setQuery('')
    setOpen(false)
  }

  const handleFocus = () => { if (!disabled) { checkFlip(); setQuery(''); setOpen(true) } }
  const handleInput = (e) => { setQuery(e.target.value); setDisplay(e.target.value); setOpen(true) }
  const handleBlur  = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      // If what was typed doesn't match a valid option, revert to last confirmed value
      if (!options.includes(display)) { setDisplay(value ?? ''); setQuery('') }
      setOpen(false)
    }
  }

  const inputCls_ = `w-full px-3 py-2.5 text-sm rounded-xl border text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:border-[#ed6055] bg-white transition-colors ${disabled ? 'opacity-50 cursor-not-allowed border-gray-100' : 'border-gray-200'}`

  const dropdownShadow = { boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }

  const clear = (e) => {
    e.stopPropagation()
    onChange('')
    setDisplay('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <input
        value={open ? query : display}
        onFocus={handleFocus}
        onChange={handleInput}
        placeholder={disabled ? '-- select province first --' : placeholder}
        disabled={disabled}
        className={`${inputCls_} ${value && !disabled ? 'pr-8' : ''}`}
        autoComplete="off"
      />
      {value && !disabled && !open && (
        <button
          type="button"
          onMouseDown={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          tabIndex={-1}
          aria-label="Clear selection"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && filtered.length > 0 && (
        <div
          className={`absolute z-[80] w-full bg-white border border-gray-100 rounded-2xl overflow-hidden ${dropUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          style={{ animation: `${dropUp ? 'menu-in-up' : 'menu-in'} 150ms ease-out forwards`, ...dropdownShadow }}
        >
          <ul className="max-h-52 overflow-y-auto p-1.5 text-sm">
            {filtered.map(opt => (
              <li
                key={opt}
                onMouseDown={() => select(opt)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-100 ${opt === value ? 'bg-[#ed6055]/10 text-[#ed6055] font-medium' : 'text-gray-800 hover:bg-gray-50'}`}
              >
                <span className="flex-1 truncate">
                  <HighlightMatch text={opt} query={query} />
                </span>
                {opt === value && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
          {query && (
            <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/60">
              <p className="text-[11px] text-gray-400">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "<span className="text-gray-500 font-medium">{query}</span>"
              </p>
            </div>
          )}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div
          className={`absolute z-[80] w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-400 ${dropUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          style={dropdownShadow}
        >
          No matches for "{query}"
        </div>
      )}
    </div>
  )
}

function SelectDropdown({ options = [], value, onChange, placeholder = '-- Select --' }) {
  const [open, setOpen]   = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const containerRef      = useRef(null)

  const checkFlip = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropUp(window.innerHeight - rect.bottom < 240)
  }

  const handleToggle = () => { checkFlip(); setOpen(o => !o) }
  const handleBlur   = (e) => { if (!containerRef.current?.contains(e.relatedTarget)) setOpen(false) }

  const dropdownShadow = { boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)' }

  const selected = options.find(o => o.value === value)

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 text-left flex items-center justify-between bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:border-[#ed6055] transition-colors active:scale-[0.97]"
      >
        <span className={selected ? 'text-black' : 'text-gray-400'}>{selected?.label ?? placeholder}</span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={open ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute z-[80] w-full bg-white border border-gray-100 rounded-2xl overflow-hidden ${dropUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          style={{ animation: `${dropUp ? 'menu-in-up' : 'menu-in'} 150ms ease-out forwards`, ...dropdownShadow }}
        >
          <ul className="max-h-52 overflow-y-auto p-1.5 text-sm">
            {options.map(opt => (
              <li
                key={opt.value}
                onMouseDown={() => { onChange(opt.value); setOpen(false) }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-100 ${opt.value === value ? 'bg-[#ed6055]/10 text-[#ed6055] font-medium' : 'text-gray-800 hover:bg-gray-50'}`}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.value === value && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

// -- Helpers -------------------------------------------------------------------

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  )
}

function ReadValue({ value, accent }) {
  return <p className="text-sm font-semibold" style={{ color: accent ?? '#111' }}>{value || '--'}</p>
}

function SectionHeader({ title, action, sticky = false, accent = '#ed6055' }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${sticky ? 'sticky top-0 z-20 bg-white py-3' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-sm font-bold text-black">{title}</h3>
      </div>
      {action}
    </div>
  )
}

function MenuButton({ items, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition active:scale-[0.97] ${open ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
        title="More actions"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4.5" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="15.5" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]" style={{ animation: 'menu-in 150ms ease-out forwards' }}>
          {items.map((item, i) => item === null ? (
            <div key={i} className="my-1 border-t border-gray-100" />
          ) : (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false) }}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs font-medium transition ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {item.icon && <span className="flex-shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyRow({ cols, message }) {
  return (
    <tr><td colSpan={cols} className="px-4 py-6 text-center text-xs text-gray-400 italic">{message}</td></tr>
  )
}

function ImportErrorPanel({ errors, onDismiss }) {
  if (!errors.length) return null
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-2">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-red-700">
          Import blocked -- {errors.length} error{errors.length !== 1 ? 's' : ''} found. Fix the file and try again.
        </p>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition text-xs font-medium flex-shrink-0">Dismiss</button>
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

function ConfirmDeleteModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm" style={{ animation: 'fade-in 200ms ease-out forwards' }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" style={{ animation: 'modal-in 200ms ease-out forwards' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-black mb-1">Delete this entry?</h3>
        <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors active:scale-[0.97]">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition-colors active:scale-[0.97]">Delete</button>
        </div>
      </div>
    </div>
  )
}

function FloorLayoutModal({ url, onClose }) {
  const isPdf = /\.pdf(\?|$)/i.test(url)
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm font-semibold text-black">Floor Layout</p>
          <button onClick={onClose} className="text-gray-400 hover:text-black transition"><XIcon /></button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50/50">
          {isPdf
            ? <iframe src={url} className="w-full h-[70vh] rounded border border-gray-200" title="Floor Layout" />
            : <img src={url} alt="Floor Layout" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
          }
        </div>
      </div>
    </div>
  )
}

function FloorUploadCell({ value, onChange, showToast }) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef(null)

  const upload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}/${safeName}`
    const { error } = await supabase.storage.from('floor-layouts').upload(path, file)
    if (error) { showToast('Upload failed: ' + error.message, 'error'); setUploading(false); return }
    const { data } = supabase.storage.from('floor-layouts').getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-1.5">
      <input ref={ref} type="file" accept="image/*,.pdf" className="hidden" onChange={upload} />
      {uploading
        ? <span className="text-[10px] text-gray-400 italic">Uploading…</span>
        : <button type="button" onClick={() => ref.current?.click()} className="text-[10px] px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-[#ed6055] hover:text-[#ed6055] transition whitespace-nowrap">
            {value ? '✓ Change' : '↑ Upload'}
          </button>
      }
    </div>
  )
}

function InlineInput({ value, onChange, type = 'text', placeholder = '', min, max, error, disabled = false }) {
  const resolvedMin = min !== undefined ? min : (type === 'number' ? 0 : undefined)
  const isNegative = type === 'number' && value !== '' && value !== null && value !== undefined && Number(value) < 0
  const showError = error || isNegative
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
          : showError
            ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-600'
            : 'border-gray-200 focus:ring-[#ed6055]'
      }`}
    />
  )
}

// -- Cover Photo Panel --------------------------------------------------------

function CoverPhotoPanel({ project, isAdmin, onUpdated, showToast, editing = false, onPendingRemove = null, onPendingUpload = null }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview]     = useState(false)
  const inputRef = useRef(null)
  const url = project.cover_photo_url

  useEffect(() => {
    if (!preview) return
    const onKey = (e) => { if (e.key === 'Escape') setPreview(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [preview])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (onPendingUpload) {
      // Edit mode: keep file in memory, no storage write yet
      const previewUrl = URL.createObjectURL(file)
      onPendingUpload(file, previewUrl)
      e.target.value = ''
      return
    }
    setUploading(true)
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `${project.id}/cover.${ext}`
    const { error: upErr } = await supabase.storage.from('project-photos').upload(path, file, { upsert: true })
    if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); setUploading(false); return }
    const { data } = supabase.storage.from('project-photos').getPublicUrl(path)
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`
    let thumbUrl = null
    const thumbBlob = await createThumbnail(file, 800)
    if (thumbBlob) {
      const thumbPath = `thumbs/${path}`
      await supabase.storage.from('project-photos').upload(thumbPath, thumbBlob, { upsert: true, contentType: 'image/jpeg' })
      thumbUrl = `${supabase.storage.from('project-photos').getPublicUrl(thumbPath).data.publicUrl}?t=${Date.now()}`
    }
    const { error: dbErr } = await supabase.from('projects').update({ cover_photo_url: publicUrl, cover_photo_thumb_url: thumbUrl }).eq('id', project.id)
    if (dbErr) { showToast('Failed to save photo.', 'error'); setUploading(false); return }
    onUpdated({ cover_photo_url: publicUrl, cover_photo_thumb_url: thumbUrl })
    showToast('Cover photo updated.', 'success')
    setUploading(false)
    e.target.value = ''
  }

  const handleRemove = async (e) => {
    e.stopPropagation()
    if (!window.confirm('Remove the cover photo?')) return
    if (onPendingRemove) {
      onPendingRemove()
      return
    }
    await supabase.from('projects').update({ cover_photo_url: null }).eq('id', project.id)
    onUpdated({ cover_photo_url: null })
    showToast('Cover photo removed.', 'success')
  }

  return (
    <>
      <div className="relative group h-full sm:min-h-[380px] bg-[#1c1c1e]">
        {url ? (
          <>
            {/* Click image to open preview */}
            <button
              onClick={() => setPreview(true)}
              className="absolute inset-0 w-full h-full flex items-center justify-center cursor-zoom-in"
              aria-label="View full photo"
            >
              <img
                src={url}
                alt={`${project.name} cover photo`}
                className="w-full h-full object-contain cover-reveal"
              />
            </button>

            {/* Admin: change photo -- pill button bottom-left on hover (edit mode only) */}
            {isAdmin && editing && (
              <button
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
                disabled={uploading}
                className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-[opacity,background-color] duration-200 shadow-md backdrop-blur-sm active:scale-[0.97]"
                title="Change cover photo"
                aria-label="Change cover photo"
              >
                {uploading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                )}
                {!uploading && 'Change'}
              </button>
            )}

            {/* Download button -- always visible on hover when photo exists */}
            <button
              onClick={async e => {
                e.stopPropagation()
                try {
                  const res = await fetch(url)
                  const blob = await res.blob()
                  const ext = url.split('?')[0].split('.').pop() || 'jpg'
                  const link = document.createElement('a')
                  link.href = URL.createObjectURL(blob)
                  link.download = `${project.name ?? 'cover'}-cover.${ext}`
                  link.click()
                  URL.revokeObjectURL(link.href)
                } catch { showToast('Download failed.', 'error') }
              }}
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,background-color] duration-200 shadow-md backdrop-blur-sm active:scale-[0.97]"
              title="Download cover photo"
              aria-label="Download cover photo"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>

            {/* Admin: remove photo -- icon button top-right on hover (edit mode only) */}
            {isAdmin && editing && (
              <button
                onClick={handleRemove}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,background-color] duration-200 shadow-md backdrop-blur-sm active:scale-[0.97]"
                title="Remove cover photo"
                aria-label="Remove cover photo"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#2c2c2e] to-[#1c1c1e] gap-3 cover-fade">
            <svg className="w-16 h-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            {isAdmin && editing && (
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 backdrop-blur-sm active:scale-[0.97]"
              >
                {uploading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
                Add cover photo
              </button>
            )}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Lightbox preview */}
      {preview && url && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out"
          style={{ animation: 'fade-in 200ms ease-out forwards' }}
          onClick={() => setPreview(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreview(false) }}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shadow-lg active:scale-[0.97]"
            aria-label="Close preview"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={url}
            alt={`${project.name} cover photo`}
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-2xl shadow-2xl"
            style={{ animation: 'modal-in 250ms ease-out forwards' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// -- iOS 26 Card --------------------------------------------------------------

function IosCard({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_16px_rgba(0,0,0,0.06),0_8px_32px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100/80 rounded-t-2xl" style={{ background: 'linear-gradient(to bottom, #fafafa, #f5f5f5)' }}>
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#ed6055]/15 to-[#ed6055]/8 flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)]">
          {icon}
        </div>
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.07em]">{title}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

// -- Overview Detail Item (editorial style) -----------------------------------
function OverviewDetailItem({ label, value, icon }) {
  if (!value && value !== 0) return null
  return (
    <div className="pl-3 border-l-2 border-transparent hover:border-[#ed6055]/50 transition-all duration-200">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className="text-[10px] tracking-[0.12em] uppercase font-semibold text-gray-400">{label}</p>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

// -- Overview Tab -------------------------------------------------------------

function OverviewTab({ project, isAdmin, onUpdated, showToast, startEditing = false }) {
  const navigate = useNavigate()
  const buildForm = () => ({
    name:             project.name ?? '',
    project_code:     project.project_code ?? '',
    is_4ph_project:   project.is_4ph_project ?? false,
    business_unit:    project.business_unit ?? '',
    province:         project.province ?? '',
    city:             project.city ?? '',
    lot_area:         project.lot_area ?? '',
    developable_area: project.developable_area ?? '',
    development_type: project.development_type ?? '',
    phase:            project.phase ?? '',
    project_brief:    project.project_brief ?? '',
    num_towers:       project.num_towers != null ? String(project.num_towers) : '',
    floors_per_tower: project.floors_per_tower != null ? String(project.floors_per_tower) : '',
    units_per_floor:  project.units_per_floor != null ? String(project.units_per_floor) : '',
    total_units:      project.total_units != null ? String(project.total_units) : '',
  })

  const [editing, setEditing] = useState(startEditing)
  const [form, setForm] = useState(startEditing ? buildForm() : {})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteProject = async () => {
    setDeleting(true)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(false)
    if (error) { showToast('Failed to delete project.', 'error'); setConfirmDelete(false); return }
    navigate('/projects')
  }
  // pendingCoverUrl: undefined = no change | null = removal | string = blob preview URL
  const [pendingCoverUrl, setPendingCoverUrl] = useState(undefined)
  const [pendingFile, setPendingFile] = useState(null)
  const phase = PHASE_MAP[project.phase]

  const cancelEdit = () => {
    if (pendingCoverUrl && typeof pendingCoverUrl === 'string') URL.revokeObjectURL(pendingCoverUrl)
    setPendingCoverUrl(undefined)
    setPendingFile(null)
    setEditing(false)
  }

  const startEdit = () => {
    setForm(buildForm())
    setPendingCoverUrl(undefined)
    setPendingFile(null)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      name:             form.name.trim(),
      project_code:     form.project_code.trim() || null,
      is_4ph_project:   form.is_4ph_project,
      business_unit:    form.business_unit || null,
      province:         form.province || null,
      city:             form.city || null,
      lot_area:         form.lot_area !== '' ? parseFloat(form.lot_area) : null,
      developable_area: form.developable_area !== '' ? parseFloat(form.developable_area) : null,
      development_type: form.development_type || null,
      phase:            form.phase || null,
      project_brief:    form.project_brief.trim() || null,
      num_towers:       String(form.num_towers ?? '').trim() || null,
      floors_per_tower: String(form.floors_per_tower ?? '').trim() || null,
      units_per_floor:  String(form.units_per_floor ?? '').trim() || null,
      total_units:      String(form.total_units ?? '').trim() || null,
    }
    if (pendingFile) {
      const ext  = pendingFile.name.split('.').pop().toLowerCase()
      const path = `${project.id}/cover.${ext}`
      const { error: upErr } = await supabase.storage.from('project-photos').upload(path, pendingFile, { upsert: true })
      if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); setSaving(false); return }
      const { data } = supabase.storage.from('project-photos').getPublicUrl(path)
      payload.cover_photo_url = `${data.publicUrl}?t=${Date.now()}`
      const thumbBlob = await createThumbnail(pendingFile, 800)
      if (thumbBlob) {
        const thumbPath = `thumbs/${path}`
        await supabase.storage.from('project-photos').upload(thumbPath, thumbBlob, { upsert: true, contentType: 'image/jpeg' })
        payload.cover_photo_thumb_url = `${supabase.storage.from('project-photos').getPublicUrl(thumbPath).data.publicUrl}?t=${Date.now()}`
      }
      URL.revokeObjectURL(pendingCoverUrl)
    } else if (pendingCoverUrl === null) {
      payload.cover_photo_url = null
      payload.cover_photo_thumb_url = null
    }
    if (noNeg(payload.lot_area, payload.developable_area)) { showToast('Values cannot be negative.', 'error'); setSaving(false); return }
    const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast('Project updated.', 'success')
    setEditing(false)
    setPendingCoverUrl(undefined)
    setPendingFile(null)
    onUpdated(payload)
  }

  const f = v => form[v]
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (editing) return (
    <div className="h-full flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Cover photo: top on mobile, left half on desktop */}
      <div className="w-full h-52 flex-shrink-0 overflow-hidden sm:h-full sm:w-1/2">
        <CoverPhotoPanel
          project={{ ...project, cover_photo_url: pendingCoverUrl !== undefined ? pendingCoverUrl : project.cover_photo_url }}
          isAdmin={isAdmin}
          onUpdated={onUpdated}
          showToast={showToast}
          editing
          onPendingRemove={() => {
            if (pendingCoverUrl && typeof pendingCoverUrl === 'string') URL.revokeObjectURL(pendingCoverUrl)
            setPendingFile(null)
            setPendingCoverUrl(null)
          }}
          onPendingUpload={(file, previewUrl) => {
            if (pendingCoverUrl && typeof pendingCoverUrl === 'string') URL.revokeObjectURL(pendingCoverUrl)
            setPendingFile(file)
            setPendingCoverUrl(previewUrl)
          }}
        />
      </div>

      {/* Form */}
      <div className="flex-1 min-w-0 px-6 sm:px-8 pt-5 pb-4 space-y-3 sm:overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex justify-end gap-2">
          <button onClick={cancelEdit} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors duration-200 active:scale-[0.97]">Cancel</button>
          <button onClick={save} disabled={saving || !form.name?.trim()} className="px-4 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-40 transition-colors duration-200 active:scale-[0.97]">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        <IosCard icon={<svg className="w-4 h-4 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>} title="Project Brief">
          <textarea
            value={f('project_brief')}
            onChange={e => set('project_brief', e.target.value)}
            rows={4}
            placeholder="Write a summary of the project -- scope, objectives, key details, stakeholders…"
            className={`${inputCls} resize-y rounded-xl`}
          />
        </IosCard>

        <IosCard icon={<svg className="w-4 h-4 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>} title="Project Details">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Project Name *">
              <input value={f('name')} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Project name" />
            </Field>
            <Field label="Project Short Name">
              <input value={f('project_code')} onChange={e => set('project_code', e.target.value)} className={inputCls} placeholder="e.g. PRJ-001" />
            </Field>
            <Field label="Business Unit">
              <SelectDropdown
                value={f('business_unit')}
                onChange={v => set('business_unit', v)}
                placeholder="-- Select --"
                options={BUSINESS_UNITS.map(u => ({ value: u.code, label: u.code }))}
              />
            </Field>
            <Field label="Development Type">
              <SelectDropdown
                value={f('development_type')}
                onChange={v => set('development_type', v)}
                placeholder="-- Select --"
                options={[{ value: 'housing', label: 'Housing' }, { value: 'condominium', label: 'Condominium' }]}
              />
            </Field>
            <Field label="4PH Project">
              <div className="flex items-center gap-2 mt-1">
                <input type="checkbox" id="edit_4ph" checked={f('is_4ph_project')} onChange={e => set('is_4ph_project', e.target.checked)} className="accent-[#ed6055] w-4 h-4" />
                <label htmlFor="edit_4ph" className="text-sm text-gray-600 cursor-pointer select-none">Yes</label>
              </div>
            </Field>
            <Field label="Phase">
              <SelectDropdown
                value={f('phase')}
                onChange={v => set('phase', v)}
                placeholder="-- Select --"
                options={PHASES.map(p => ({ value: p.key, label: p.label }))}
              />
            </Field>
            <Field label="Province">
              <Combobox
                options={PH_PROVINCES}
                value={f('province')}
                onChange={v => { set('province', v); set('city', '') }}
                placeholder="Type to search province…"
              />
            </Field>
            <Field label="City / Municipality">
              <Combobox
                options={PH_CITIES[f('province')] ?? []}
                value={f('city')}
                onChange={v => set('city', v)}
                placeholder="Type to search city…"
                disabled={!f('province')}
              />
            </Field>
            <Field label="Project Lot Area (sqm)">
              <input type="number" min="0" value={f('lot_area')} onChange={e => set('lot_area', e.target.value)} placeholder="0" className={`${inputCls} ${f('lot_area') !== '' && Number(f('lot_area')) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
            </Field>
            <Field label="Project Developable Area (sqm)">
              <input type="number" min="0" value={f('developable_area')} onChange={e => set('developable_area', e.target.value)} placeholder="0" className={`${inputCls} ${f('developable_area') !== '' && Number(f('developable_area')) < 0 ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400' : ''}`} />
            </Field>
          </div>
        </IosCard>

        <IosCard icon={<svg className="w-4 h-4 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>} title="Development Scale">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="No. of Towers">
              <textarea rows={2} value={f('num_towers')} onChange={e => set('num_towers', e.target.value)} placeholder="e.g. 3" className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Floors per Tower">
              <textarea rows={2} value={f('floors_per_tower')} onChange={e => set('floors_per_tower', e.target.value)} placeholder="e.g. 40" className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Units per Floor">
              <textarea rows={2} value={f('units_per_floor')} onChange={e => set('units_per_floor', e.target.value)} placeholder="e.g. 4" className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Total Units">
              <textarea rows={2} value={f('total_units')} onChange={e => set('total_units', e.target.value)} placeholder="e.g. 480" className={`${inputCls} resize-none`} />
            </Field>
          </div>
        </IosCard>

        <IosCard icon={<svg className="w-4 h-4 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>} title="Unit Types">
          <UnitTypesSection projectId={project.id} isAdmin={isAdmin} showToast={showToast} />
        </IosCard>

        <IosCard icon={<svg className="w-4 h-4 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>} title="Project Plans">
          <ProjectPlansSection projectId={project.id} isAdmin={isAdmin} editing={true} showToast={showToast} />
        </IosCard>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Cover photo: top on mobile, left half on desktop */}
      <div className="w-full h-52 flex-shrink-0 overflow-hidden bg-gray-100 sm:h-full sm:w-1/2">
        <CoverPhotoPanel project={project} isAdmin={isAdmin} onUpdated={onUpdated} showToast={showToast} />
      </div>

      {/* Content panel: natural height on mobile, fill+scroll on desktop */}
      <div className="flex-1 min-w-0 flex flex-col sm:overflow-y-auto bg-white relative z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ boxShadow: '-16px 0 48px rgba(0,0,0,0.14)' }}>

        {/* Hero: phase badge + project name + subtitle */}
        <div className="px-8 pt-8 pb-6 border-b border-gray-100" style={{ animation: 'fade-in-up 220ms ease-out both' }}>
          {project.phase && PHASE_MAP[project.phase] && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-shadow duration-200 hover:shadow-sm ${PHASE_MAP[project.phase].badge}`}>
              {PHASE_MAP[project.phase].label}
            </span>
          )}
          <h2 className="mt-3 text-2xl sm:text-[28px] font-light tracking-[0.18em] uppercase leading-snug text-gray-900">
            {project.name || 'Untitled Project'}
          </h2>
          {(project.project_code || project.business_unit) && (
            <p className="mt-2 text-[11px] tracking-[0.14em] uppercase font-medium text-gray-400">
              {[project.project_code, formatBU(project.business_unit)].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Brief */}
        {project.project_brief && (
          <div className="px-8 py-5 border-b border-gray-100" style={{ animation: 'fade-in-up 220ms 60ms ease-out both' }}>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{project.project_brief}</p>
          </div>
        )}

        {/* Details grid */}
        <div className="px-8 py-6 grid grid-cols-2 gap-x-8 gap-y-5" style={{ animation: 'fade-in-up 220ms 120ms ease-out both' }}>
          <OverviewDetailItem
            label="Location"
            value={[project.city, project.province].filter(Boolean).join(', ')}
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
          />
          <OverviewDetailItem
            label="Development Type"
            value={project.development_type ? (project.development_type === 'housing' ? 'Housing' : 'Condominium') : null}
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
          />
          <OverviewDetailItem
            label="Lot Area"
            value={project.lot_area != null ? `${Number(project.lot_area).toLocaleString()} sqm` : null}
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
          />
          <OverviewDetailItem
            label="Developable Area"
            value={project.developable_area != null ? `${Number(project.developable_area).toLocaleString()} sqm` : null}
            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>}
          />
        </div>

        {/* Development Scale */}
        {(project.num_towers != null || project.floors_per_tower != null || project.units_per_floor != null || project.total_units != null) && (() => {
          const devCols = [project.num_towers, project.floors_per_tower, project.units_per_floor, project.total_units].filter(v => v != null).length
          return (
          <div className="px-8 py-6 grid gap-x-8 border-t border-gray-100" style={{ animation: 'fade-in-up 220ms 160ms ease-out both', gridTemplateColumns: `repeat(${devCols}, 1fr)` }}>
            <OverviewDetailItem label="No. of Towers" value={project.num_towers != null ? String(project.num_towers) : null} icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M9 21V7l6-4v18"/><path d="M9 3H5v18h4"/></svg>} />
            <OverviewDetailItem label="Floors per Tower" value={project.floors_per_tower != null ? String(project.floors_per_tower) : null} icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>} />
            <OverviewDetailItem label="Units per Floor" value={project.units_per_floor != null ? String(project.units_per_floor) : null} icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>} />
            <OverviewDetailItem label="Total Units" value={project.total_units != null ? String(project.total_units) : null} icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
          </div>
          )
        })()}

        {/* Unit Types */}
        <UnitTypesSectionView projectId={project.id} />

        {/* Project Plans */}
        <ProjectPlansSection projectId={project.id} isAdmin={isAdmin} editing={editing} showToast={showToast} />

        {/* Edit + Delete buttons pinned to bottom */}
        {isAdmin && (
          <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-end gap-2 mt-auto" style={{ animation: 'fade-in-up 220ms 180ms ease-out both' }}>
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-gray-500 hover:text-[#ed6055] hover:bg-red-50 border border-gray-200 bg-white transition-colors duration-200 text-xs font-semibold shadow-sm active:scale-[0.97]"
              title="Edit project details"
              aria-label="Edit project details"
            >
              <PencilIcon />
              Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 bg-white transition-colors duration-200 text-xs font-semibold shadow-sm active:scale-[0.97]"
              title="Delete project"
            >
              <TrashIcon />
              Delete
            </button>
          </div>
        )}

        {/* Confirm delete project */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
              <h3 className="text-base font-bold text-black mb-1">Delete this project?</h3>
              <p className="text-sm text-gray-500 mb-5">This will permanently delete <span className="font-semibold text-gray-700">{project.name}</span> and all its data. This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handleDeleteProject} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// -- Unit type photo constants -------------------------------------------------

const PHOTO_LABELS = ['Floor Plan', 'Render', '3D View', 'Site Plan', 'Other']

// -- Unit type photo carousel (view mode) -------------------------------------

function UnitTypePhotoCarousel({ photos }) {
  const [idx, setIdx] = useState(0)
  const [activeType, setActiveType] = useState('All')
  const [paused, setPaused] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const directionRef = useRef('next')

  const unitTypes = ['All', ...Array.from(new Set(photos.map(p => p.unit_type))).filter(Boolean)]
  const filtered = activeType === 'All' ? photos : photos.filter(p => p.unit_type === activeType)

  const selectType = type => { directionRef.current = 'next'; setActiveType(type); setIdx(0) }
  const prev = () => { directionRef.current = 'prev'; setIdx(i => (i - 1 + filtered.length) % filtered.length); setPaused(true); setTimeout(() => setPaused(false), 6000) }
  const next = () => { directionRef.current = 'next'; setIdx(i => (i + 1) % filtered.length); setPaused(true); setTimeout(() => setPaused(false), 6000) }

  useEffect(() => {
    if (paused || filtered.length <= 1) return
    const t = setInterval(() => { directionRef.current = 'next'; setIdx(i => (i + 1) % filtered.length) }, 4000)
    return () => clearInterval(t)
  }, [paused, filtered.length, activeType])

  if (!photos.length) return null

  const photo = filtered[Math.min(idx, filtered.length - 1)]
  if (!photo) return null

  return (
    <div>
      <style>{`
        @keyframes carouselInRight { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes carouselInLeft  { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
      {unitTypes.length > 2 && (
        <div className="flex gap-0 p-1 bg-gray-100 rounded-xl mb-3 w-fit">
          {unitTypes.map(type => (
            <button
              key={type}
              onClick={() => selectType(type)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
                activeType === type
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}
      <div
        className="relative rounded-xl overflow-hidden bg-gray-100 shadow-xl"
        style={{ aspectRatio: '16/9' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          key={`${activeType}-${idx}`}
          className="absolute inset-0"
          style={{ animation: `${directionRef.current === 'next' ? 'carouselInRight' : 'carouselInLeft'} 380ms cubic-bezier(0.23, 1, 0.32, 1) both` }}
        >
          <img
            src={photo.url}
            alt={`${photo.unit_type} ${photo.label ?? ''}`}
            className="w-full h-full object-cover cursor-zoom-in"
            loading="lazy"
            onClick={() => setLightbox(true)}
          />
        </div>
        <div className="absolute bottom-4 left-4">
          <div className="px-4 py-3 rounded-xl bg-black/30 backdrop-blur-sm flex flex-col gap-1">
            <span className="text-white text-base font-bold leading-tight">{photo.unit_type}</span>
            <div className="flex items-center gap-3 text-white/75 text-xs leading-tight">
              {photo.saleable_area_sqm != null && <span>{Number(photo.saleable_area_sqm).toLocaleString()} sqm saleable</span>}
              {photo.quantity != null && <span>{photo.quantity} units</span>}
            </div>
          </div>
        </div>
        {filtered.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors text-base leading-none active:scale-95">‹</button>
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors text-base leading-none active:scale-95">›</button>
            <div className="absolute bottom-3 right-3 flex gap-1">
              {filtered.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all duration-200 ${i === idx ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {filtered.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); prev() }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors text-xl leading-none active:scale-95"
            >‹</button>
          )}
          <img
            src={photo.url}
            alt={photo.unit_type}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={e => e.stopPropagation()}
          />
          {filtered.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); next() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors text-xl leading-none active:scale-95"
            >›</button>
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <div className="px-4 py-2 rounded-xl bg-black/40 backdrop-blur-sm text-center">
              <p className="text-white font-bold text-sm">{photo.unit_type}</p>
              <div className="flex items-center justify-center gap-3 text-white/65 text-xs mt-0.5">
                {photo.saleable_area_sqm != null && <span>{Number(photo.saleable_area_sqm).toLocaleString()} sqm saleable</span>}
                {photo.quantity != null && <span>{photo.quantity} units</span>}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// -- Unit type photo manager (admin, inside UnitTypesSection) ------------------

function UnitTypePhotoManager({ unitTypeId, unitTypeName, showToast }) {
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [pendingLabel, setPendingLabel] = useState('Floor Plan')
  const fileRef = useRef(null)

  useEffect(() => { loadPhotos() }, [unitTypeId])

  const loadPhotos = async () => {
    const { data } = await supabase.from('project_unit_type_photos')
      .select('*').eq('unit_type_id', unitTypeId).order('sort_order')
    if (data) setPhotos(data)
  }

  const upload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `unit-type-photos/${unitTypeId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
    const { error } = await supabase.storage.from('floor-layouts').upload(path, file)
    if (error) { showToast('Upload failed: ' + error.message, 'error'); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('floor-layouts').getPublicUrl(path)
    await supabase.from('project_unit_type_photos').insert({
      unit_type_id: unitTypeId,
      url: urlData.publicUrl,
      label: pendingLabel,
      sort_order: photos.length,
    })
    showToast('Photo added.', 'success')
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    loadPhotos()
  }

  const deletePhoto = async (id) => {
    await supabase.from('project_unit_type_photos').delete().eq('id', id)
    loadPhotos()
  }

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-dashed border-gray-200">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Photos — {unitTypeName}</p>
      <div className="flex items-start gap-2 flex-wrap">
        {photos.map(p => (
          <div key={p.id} className="relative group w-24 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/55 text-white text-[9px] truncate leading-tight">{p.label}</div>
            <button
              onClick={() => deletePhoto(p.id)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] items-center justify-center hidden group-hover:flex leading-none"
            >×</button>
          </div>
        ))}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <select
            value={pendingLabel}
            onChange={e => setPendingLabel(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white h-8 focus:outline-none focus:ring-1 focus:ring-[#ed6055]/40"
          >
            {PHOTO_LABELS.map(l => <option key={l}>{l}</option>)}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 h-8 rounded-lg border border-gray-200 bg-white hover:border-[#ed6055] hover:text-[#ed6055] transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '+ Photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        </div>
      </div>
    </div>
  )
}

// -- Unit Types read-only view (Project Info tab) ------------------------------

function UnitTypesSectionView({ projectId }) {
  const [rows, setRows] = useState([])
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: unitTypes } = await supabase.from('project_unit_types').select('*').eq('project_id', projectId).order('sort_order')
      if (!unitTypes) { setLoaded(true); return }
      setRows(unitTypes)
      if (unitTypes.length > 0) {
        const { data: photoData } = await supabase
          .from('project_unit_type_photos')
          .select('*')
          .in('unit_type_id', unitTypes.map(r => r.id))
          .order('sort_order')
        if (photoData) {
          const typeMap = Object.fromEntries(unitTypes.map(r => [r.id, r]))
          setPhotos(photoData.map(p => {
            const ut = typeMap[p.unit_type_id] ?? {}
            return { ...p, unit_type: ut.unit_type ?? '', saleable_area_sqm: ut.saleable_area_sqm ?? null, quantity: ut.quantity ?? null }
          }))
        }
      }
      setLoaded(true)
    }
    load()
  }, [projectId])

  if (!loaded || rows.length === 0) return null

  return (
    <div className="px-8 py-5 border-t border-gray-100" style={{ animation: 'fade-in-up 220ms 180ms ease-out both' }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Unit Types</p>
      {photos.length > 0 && (
        <div className="mb-4">
          <UnitTypePhotoCarousel photos={photos} />
        </div>
      )}
    </div>
  )
}

// -- Development Tab -----------------------------------------------------------

function UnitTypesSection({ projectId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewUrl, setViewUrl] = useState(null)
  const [form, setForm] = useState({})
  const [expandedPhotos, setExpandedPhotos] = useState(new Set())

  const togglePhotos = id => setExpandedPhotos(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  useEffect(() => { load() }, [projectId, refreshKey])

  const load = async () => {
    const { data } = await supabase.from('project_unit_types').select('*').eq('project_id', projectId).order('sort_order')
    if (data) setRows(data)
  }

  const blank = () => ({ unit_type: '', quantity: '', cfa_sqm: '', saleable_area_sqm: '', floor_layout_url: '' })

  const save = async (id) => {
    const payload = {
      project_id: projectId,
      unit_type: form.unit_type?.trim(),
      quantity: form.quantity !== '' ? parseInt(form.quantity) : null,
      cfa_sqm: form.cfa_sqm !== '' ? parseFloat(form.cfa_sqm) : null,
      saleable_area_sqm: form.saleable_area_sqm !== '' ? parseFloat(form.saleable_area_sqm) : null,
      floor_layout_url: form.floor_layout_url?.trim() || null,
    }
    if (!payload.unit_type) return
    if (noNeg(payload.quantity, payload.cfa_sqm, payload.saleable_area_sqm)) { showToast('Values cannot be negative.', 'error'); return }
    const { error } = id
      ? await supabase.from('project_unit_types').update(payload).eq('id', id)
      : await supabase.from('project_unit_types').insert({ ...payload, sort_order: rows.length })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success')
    setAdding(false); setEditId(null); load()
  }

  const del = async (id) => {
    await supabase.from('project_unit_types').delete().eq('id', id)
    load()
  }

  const cols = ['Unit Type', 'Qty', 'CFA (sqm)', 'Saleable Area (sqm)', 'Floor Layout', ...(isAdmin ? [''] : [])]

  return (
    <div className="mb-6">
      <SectionHeader title="Unit Types" action={isAdmin && !adding && (
        <button onClick={() => { setForm(blank()); setAdding(true) }} className="text-xs font-semibold px-3 py-1.5 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1">
          <PlusIcon /> Add
        </button>
      )} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
          <thead><tr className="bg-gray-50/80 border-b border-gray-200">{cols.map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.flatMap(row => editId === row.id ? [
              <tr key={`edit-${row.id}`}>
                <td className="px-4 py-2"><InlineInput value={form.unit_type} onChange={v => setForm(p => ({ ...p, unit_type: v }))} placeholder="Type name" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.saleable_area_sqm} onChange={v => setForm(p => ({ ...p, saleable_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            ] : [
              <tr key={`row-${row.id}`} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-black">{row.unit_type}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.quantity ?? '--'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '--'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.saleable_area_sqm ?? '--'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">--</span>}</td>
                {isAdmin && <td className="px-4 py-2.5"><div className="flex gap-1">
                  <button onClick={() => togglePhotos(row.id)} className={`p-1 transition-colors ${expandedPhotos.has(row.id) ? 'text-[#ed6055]' : 'text-gray-400 hover:text-[#ed6055]'}`} title="Manage photos"><CameraIcon /></button>
                  <button onClick={() => { setForm({ unit_type: row.unit_type, quantity: row.quantity ?? '', cfa_sqm: row.cfa_sqm ?? '', saleable_area_sqm: row.saleable_area_sqm ?? '', floor_layout_url: row.floor_layout_url ?? '' }); setEditId(row.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                  <button onClick={() => setDeleteId(row.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                </div></td>}
              </tr>,
              expandedPhotos.has(row.id) && (
                <tr key={`photos-${row.id}`}>
                  <td colSpan={cols.length} className="p-0">
                    <UnitTypePhotoManager unitTypeId={row.id} unitTypeName={row.unit_type} showToast={showToast} />
                  </td>
                </tr>
              )
            ].filter(Boolean))}
            {adding && (
              <tr>
                <td className="px-4 py-2"><InlineInput value={form.unit_type} onChange={v => setForm(p => ({ ...p, unit_type: v }))} placeholder="Type name" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.saleable_area_sqm} onChange={v => setForm(p => ({ ...p, saleable_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(null)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            )}
            {rows.length === 0 && !adding && <EmptyRow cols={cols.length} message="No unit types yet." />}
          </tbody>
        </table>
      </div>
      {viewUrl && <FloorLayoutModal url={viewUrl} onClose={() => setViewUrl(null)} />}
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
    </div>
  )
}

function ParkingSection({ projectId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewUrl, setViewUrl] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { load() }, [projectId, refreshKey])
  const load = async () => {
    const { data } = await supabase.from('project_parking').select('*').eq('project_id', projectId).order('sort_order')
    if (data) setRows(data)
  }
  const blank = () => ({ parking_type: '', quantity: '', cfa_sqm: '', saleable_area_sqm: '', floor_layout_url: '' })

  const save = async (id) => {
    const payload = { project_id: projectId, parking_type: form.parking_type?.trim(), quantity: form.quantity !== '' ? parseInt(form.quantity) : null, cfa_sqm: form.cfa_sqm !== '' ? parseFloat(form.cfa_sqm) : null, saleable_area_sqm: form.saleable_area_sqm !== '' ? parseFloat(form.saleable_area_sqm) : null, floor_layout_url: form.floor_layout_url?.trim() || null }
    if (!payload.parking_type) return
    if (noNeg(payload.quantity, payload.cfa_sqm, payload.saleable_area_sqm)) { showToast('Values cannot be negative.', 'error'); return }
    const { error } = id ? await supabase.from('project_parking').update(payload).eq('id', id) : await supabase.from('project_parking').insert({ ...payload, sort_order: rows.length })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success'); setAdding(false); setEditId(null); load()
  }
  const del = async (id) => { await supabase.from('project_parking').delete().eq('id', id); load() }

  const cols = ['Parking Type', 'Qty', 'CFA (sqm)', 'Saleable Area (sqm)', 'Floor Layout', ...(isAdmin ? [''] : [])]
  return (
    <div className="mb-6">
      <SectionHeader title="Parking" action={isAdmin && !adding && (
        <button onClick={() => { setForm(blank()); setAdding(true) }} className="text-xs font-semibold px-3 py-1.5 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1"><PlusIcon /> Add</button>
      )} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
          <thead><tr className="bg-gray-50/80 border-b border-gray-200">{cols.map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => editId === row.id ? (
              <tr key={row.id}>
                <td className="px-4 py-2"><InlineInput value={form.parking_type} onChange={v => setForm(p => ({ ...p, parking_type: v }))} placeholder="e.g. Outdoor Car" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.saleable_area_sqm} onChange={v => setForm(p => ({ ...p, saleable_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            ) : (
              <tr key={row.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-black">{row.parking_type}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.quantity ?? '--'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '--'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.saleable_area_sqm ?? '--'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">--</span>}</td>
                {isAdmin && <td className="px-4 py-2.5"><div className="flex gap-1">
                  <button onClick={() => { setForm({ parking_type: row.parking_type, quantity: row.quantity ?? '', cfa_sqm: row.cfa_sqm ?? '', saleable_area_sqm: row.saleable_area_sqm ?? '', floor_layout_url: row.floor_layout_url ?? '' }); setEditId(row.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                  <button onClick={() => setDeleteId(row.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                </div></td>}
              </tr>
            ))}
            {adding && (
              <tr>
                <td className="px-4 py-2"><InlineInput value={form.parking_type} onChange={v => setForm(p => ({ ...p, parking_type: v }))} placeholder="e.g. Outdoor Car" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.saleable_area_sqm} onChange={v => setForm(p => ({ ...p, saleable_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(null)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            )}
            {rows.length === 0 && !adding && <EmptyRow cols={cols.length} message="No parking entries yet." />}
          </tbody>
        </table>
      </div>
      {viewUrl && <FloorLayoutModal url={viewUrl} onClose={() => setViewUrl(null)} />}
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
    </div>
  )
}

function AmenitiesSection({ projectId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewUrl, setViewUrl] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { load() }, [projectId, refreshKey])
  const load = async () => {
    const { data } = await supabase.from('project_amenities').select('*').eq('project_id', projectId).order('sort_order')
    if (data) setRows(data)
  }
  const blank = () => ({ amenity_name: '', cfa_sqm: '', floor_area_sqm: '', floor_layout_url: '' })
  const save = async (id) => {
    const payload = { project_id: projectId, amenity_name: form.amenity_name?.trim(), cfa_sqm: form.cfa_sqm !== '' ? parseFloat(form.cfa_sqm) : null, floor_area_sqm: form.floor_area_sqm !== '' ? parseFloat(form.floor_area_sqm) : null, floor_layout_url: form.floor_layout_url?.trim() || null }
    if (!payload.amenity_name) return
    if (noNeg(payload.cfa_sqm, payload.floor_area_sqm)) { showToast('Values cannot be negative.', 'error'); return }
    const { error } = id ? await supabase.from('project_amenities').update(payload).eq('id', id) : await supabase.from('project_amenities').insert({ ...payload, sort_order: rows.length })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success'); setAdding(false); setEditId(null); load()
  }
  const del = async (id) => { await supabase.from('project_amenities').delete().eq('id', id); load() }

  const cols = ['Amenity', 'CFA (sqm)', 'Floor Area (sqm)', 'Floor Layout', ...(isAdmin ? [''] : [])]
  return (
    <div className="mb-6">
      <SectionHeader title="Amenities" action={isAdmin && !adding && (
        <button onClick={() => { setForm(blank()); setAdding(true) }} className="text-xs font-semibold px-3 py-1.5 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1"><PlusIcon /> Add</button>
      )} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
          <thead><tr className="bg-gray-50/80 border-b border-gray-200">{cols.map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => editId === row.id ? (
              <tr key={row.id}>
                <td className="px-4 py-2"><InlineInput value={form.amenity_name} onChange={v => setForm(p => ({ ...p, amenity_name: v }))} placeholder="e.g. Swimming Pool" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.floor_area_sqm} onChange={v => setForm(p => ({ ...p, floor_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            ) : (
              <tr key={row.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-black">{row.amenity_name}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '--'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.floor_area_sqm ?? '--'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">--</span>}</td>
                {isAdmin && <td className="px-4 py-2.5"><div className="flex gap-1">
                  <button onClick={() => { setForm({ amenity_name: row.amenity_name, cfa_sqm: row.cfa_sqm ?? '', floor_area_sqm: row.floor_area_sqm ?? '', floor_layout_url: row.floor_layout_url ?? '' }); setEditId(row.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                  <button onClick={() => setDeleteId(row.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                </div></td>}
              </tr>
            ))}
            {adding && (
              <tr>
                <td className="px-4 py-2"><InlineInput value={form.amenity_name} onChange={v => setForm(p => ({ ...p, amenity_name: v }))} placeholder="e.g. Swimming Pool" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.floor_area_sqm} onChange={v => setForm(p => ({ ...p, floor_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(null)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            )}
            {rows.length === 0 && !adding && <EmptyRow cols={cols.length} message="No amenities yet." />}
          </tbody>
        </table>
      </div>
      {viewUrl && <FloorLayoutModal url={viewUrl} onClose={() => setViewUrl(null)} />}
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
    </div>
  )
}


// -- Building Selector ---------------------------------------------------------

function BulkAddTowersModal({ projectId, existingNames, onDone, onCancel }) {
  const [rows, setRows]     = useState(['', '', ''])
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const setRow = (i, v) => setRows(r => r.map((x, j) => j === i ? v : x))
  const addRow = () => setRows(r => [...r, ''])
  const removeRow = (i) => setRows(r => r.filter((_, j) => j !== i))

  const handle = async () => {
    const names = rows.map(r => r.trim()).filter(Boolean)
    if (names.length === 0) { setErr('Enter at least one name.'); return }
    const dupeExisting = names.filter(n => existingNames.some(e => e.toLowerCase() === n.toLowerCase()))
    if (dupeExisting.length > 0) { setErr(`Already exists: ${dupeExisting.join(', ')}`); return }
    const dupeInternal = names.filter((n, i) => names.findIndex(x => x.toLowerCase() === n.toLowerCase()) !== i)
    if (dupeInternal.length > 0) { setErr(`Duplicate names in list: ${[...new Set(dupeInternal)].join(', ')}`); return }
    setSaving(true)
    const base = existingNames.length
    const inserts = names.map((name, i) => ({ project_id: projectId, name, sort_order: base + i }))
    const { data, error } = await supabase.from('project_buildings').insert(inserts).select('*')
    setSaving(false)
    if (error) { setErr(error.message); return }
    onDone(data ?? [])
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Add Towers / Locations</h3>
        <div className="space-y-2">
          {rows.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                autoFocus={i === 0}
                value={val}
                onChange={e => setRow(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRow() }}
                placeholder={`e.g. Tower ${String.fromCharCode(65 + i)}`}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
              />
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 transition flex-shrink-0" title="Remove">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-[#ed6055] transition"
        >
          <PlusIcon /> Add Row
        </button>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition disabled:opacity-50">
            {saving ? 'Adding…' : 'Add Towers'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkDeleteTowersModal({ buildings, projectId, onDone, onCancel }) {
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const allChecked = selected.size === buildings.length
  const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(buildings.map(b => b.id)))
  const toggle     = (id) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const handle = async () => {
    if (selected.size === 0) { setErr('Select at least one tower to delete.'); return }
    setSaving(true)
    try {
      for (const id of selected) {
        await supabase.from('project_floors').delete().eq('building_id', id)
        await supabase.from('project_parking_floors').delete().eq('building_id', id)
        await supabase.from('project_buildings').delete().eq('id', id)
      }
      onDone([...selected])
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Bulk Delete Towers / Locations</h3>
        <p className="text-xs text-gray-500 mb-4">Select towers to permanently delete, including all their floor data.</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 mb-3">
          <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 bg-gray-50/80">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[#ed6055]" />
            <span className="text-xs font-semibold text-gray-600">Select all</span>
          </label>
          {buildings.map(b => (
            <label key={b.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 text-xs text-gray-700">
              <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="accent-[#ed6055]" />
              {b.name}
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
            {selected.size} tower{selected.size > 1 ? 's' : ''} and all their floor data will be permanently deleted.
          </p>
        )}
        {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50">
            {saving ? 'Deleting…' : `Delete${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function CopyConfigModal({ buildings, sourceId, projectId, onDone, onCancel }) {
  const [destIds, setDestIds]   = useState(new Set())
  const [copyRes, setCopyRes]   = useState(true)
  const [copyPark, setCopyPark] = useState(true)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const sourceName = buildings.find(b => b.id === sourceId)?.name ?? ''
  const targets    = buildings.filter(b => b.id !== sourceId)

  const toggleDest = (id) => setDestIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handle = async () => {
    if (destIds.size === 0) { setErr('Select at least one destination tower.'); return }
    if (!copyRes && !copyPark) { setErr('Select at least one section to copy.'); return }
    setSaving(true)
    try {
      let srcFloors = null, srcPark = null
      if (copyRes) {
        const { data } = await supabase.from('project_floors').select('*').eq('project_id', projectId).eq('building_id', sourceId)
        srcFloors = data ?? []
      }
      if (copyPark) {
        const { data } = await supabase.from('project_parking_floors').select('*').eq('project_id', projectId).eq('building_id', sourceId)
        srcPark = data ?? []
      }
      for (const did of destIds) {
        if (copyRes) {
          await supabase.from('project_floors').delete().eq('project_id', projectId).eq('building_id', did)
          if (srcFloors.length > 0) await supabase.from('project_floors').insert(srcFloors.map(({ id: _id, building_id: _bid, ...rest }) => ({ ...rest, building_id: did })))
        }
        if (copyPark) {
          await supabase.from('project_parking_floors').delete().eq('project_id', projectId).eq('building_id', did)
          if (srcPark.length > 0) await supabase.from('project_parking_floors').insert(srcPark.map(({ id: _id, building_id: _bid, ...rest }) => ({ ...rest, building_id: did })))
        }
      }
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Copy Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">Copy floor schedule from <span className="font-semibold text-gray-700">{sourceName}</span> to one or more towers.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Copy to</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {targets.map(b => (
                <label key={b.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 text-xs text-gray-700">
                  <input type="checkbox" checked={destIds.has(b.id)} onChange={() => toggleDest(b.id)} className="accent-[#ed6055]" />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-600">What to copy</label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={copyRes} onChange={e => setCopyRes(e.target.checked)} className="accent-[#ed6055]" />
              Residential Floors
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={copyPark} onChange={e => setCopyPark(e.target.checked)} className="accent-[#ed6055]" />
              Parking Floors
            </label>
          </div>
          {destIds.size > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Existing floors in the selected tower{destIds.size > 1 ? 's' : ''} will be replaced.
            </p>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition disabled:opacity-50">
            {saving ? 'Copying…' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BuildingSelector({ projectId, isAdmin, buildingId, onChange, canAdd = true, onCopyDone }) {
  const [buildings, setBuildings]           = useState([])
  const [showAddModal, setShowAddModal]     = useState(false)
  const [editingBuilding, setEditingBuilding] = useState(null)
  const [bulkAdding, setBulkAdding]         = useState(false)
  const [bulkDeleting, setBulkDeleting]     = useState(false)
  const [copying, setCopying]               = useState(false)
  const [deleteId, setDeleteId]             = useState(null)

  useEffect(() => { load() }, [projectId])

  const load = async () => {
    const { data } = await supabase
      .from('project_buildings')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
    if (data) {
      setBuildings(data)
      if (data.length > 0 && !buildingId) onChange(data[0].id)
    }
  }

  const deleteBuilding = async (id) => {
    await supabase.from('project_floors').delete().eq('building_id', id)
    await supabase.from('project_parking_floors').delete().eq('building_id', id)
    await supabase.from('project_buildings').delete().eq('id', id)
    const remaining = buildings.filter(b => b.id !== id)
    setBuildings(remaining)
    if (buildingId === id) onChange(remaining[0]?.id ?? null)
  }

  if (buildings.length === 0 && !isAdmin) return null

  const selectedBuilding = buildings.find(b => b.id === buildingId) ?? null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <div className="w-56">
          <SelectDropdown
            options={buildings.map(b => ({ value: b.id, label: b.name }))}
            value={buildingId}
            onChange={onChange}
            placeholder="Select tower…"
          />
        </div>
        {isAdmin && selectedBuilding && (
          <>
            <button
              onClick={() => setEditingBuilding(selectedBuilding)}
              className="p-1.5 text-gray-400 hover:text-[#ed6055] transition"
              title={`Edit ${selectedBuilding.name}`}
            >
              <PencilIcon />
            </button>
            <button
              onClick={() => setDeleteId(selectedBuilding.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition"
              title={`Delete ${selectedBuilding.name}`}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      {isAdmin && canAdd && (
        <>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-[#ed6055] hover:text-[#ed6055] transition"
          >
            <PlusIcon /> Add Tower/Location
          </button>
          {buildings.length > 0 && (
            <MenuButton items={[
              { label: 'Bulk Add Towers', icon: <PlusIcon />, onClick: () => setBulkAdding(true) },
              ...(buildingId && buildings.length > 1 ? [{ label: 'Copy Config', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 10h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>, onClick: () => setCopying(true) }] : []),
              null,
              { label: 'Bulk Delete', icon: <TrashIcon />, onClick: () => setBulkDeleting(true), danger: true },
            ]} />
          )}
        </>
      )}

      {deleteId !== null && (
        <ConfirmDeleteModal
          onConfirm={() => { deleteBuilding(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {showAddModal && (
        <AddTowerModal
          projectId={projectId}
          existingCount={buildings.length}
          onDone={(building) => {
            setBuildings(b => [...b, building])
            onChange(building.id)
            setShowAddModal(false)
            onCopyDone?.()
          }}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {editingBuilding && (
        <EditTowerModal
          building={editingBuilding}
          projectId={projectId}
          onDone={(updated) => {
            setBuildings(b => b.map(x => x.id === updated.id ? { ...x, name: updated.name } : x))
            setEditingBuilding(null)
            onCopyDone?.()
          }}
          onCancel={() => setEditingBuilding(null)}
        />
      )}

      {bulkAdding && (
        <BulkAddTowersModal
          projectId={projectId}
          existingNames={buildings.map(b => b.name)}
          onDone={(newBuildings) => {
            const updated = [...buildings, ...newBuildings]
            setBuildings(updated)
            if (newBuildings.length > 0) onChange(newBuildings[0].id)
            setBulkAdding(false)
          }}
          onCancel={() => setBulkAdding(false)}
        />
      )}

      {bulkDeleting && (
        <BulkDeleteTowersModal
          buildings={buildings}
          projectId={projectId}
          onDone={(deletedIds) => {
            const remaining = buildings.filter(b => !deletedIds.includes(b.id))
            setBuildings(remaining)
            if (deletedIds.includes(buildingId)) onChange(remaining[0]?.id ?? null)
            setBulkDeleting(false)
          }}
          onCancel={() => setBulkDeleting(false)}
        />
      )}

      {copying && (
        <CopyConfigModal
          buildings={buildings}
          sourceId={buildingId}
          projectId={projectId}
          onDone={() => { setCopying(false); onCopyDone?.() }}
          onCancel={() => setCopying(false)}
        />
      )}
    </div>
  )
}

function TowerFloorRangeFields({ from, setFrom, to, setTo, prefix, setPrefix, count, setCount, countLabel }) {
  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'
  return (
    <div className="mt-2 pl-5 space-y-2 border-l-2 border-gray-100">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>From Floor</label><input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="1" className={fieldCls} /></div>
        <div><label className={labelCls}>To Floor</label><input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="40" className={fieldCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Prefix <span className="font-normal text-gray-400">(opt.)</span></label><input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="F or L" className={fieldCls} /></div>
        <div><label className={labelCls}>{countLabel} / Floor <span className="font-normal text-gray-400">(opt.)</span></label><input type="number" value={count} onChange={e => setCount(e.target.value)} placeholder="0" className={fieldCls} /></div>
      </div>
    </div>
  )
}

function buildTowerFloorRows(from, to, prefix, count, projectId, buildingId) {
  const f = parseInt(from), t = parseInt(to)
  if (isNaN(f) || isNaN(t) || f > t || t - f > 199) return []
  return Array.from({ length: t - f + 1 }, (_, i) => ({
    project_id: projectId,
    building_id: buildingId,
    physical_level: prefix ? `${prefix}${f + i}` : String(f + i),
    marketing_level: null,
    num_units: count !== '' && !isNaN(parseInt(count)) ? parseInt(count) : null,
    m4_planned_start: null, m4_planned_end: null,
    m5_planned_start: null, m5_planned_end: null,
  }))
}

function AddTowerModal({ projectId, existingCount, onDone, onCancel }) {
  const [name, setName]             = useState('')
  const [hasRes, setHasRes]         = useState(true)
  const [hasPark, setHasPark]       = useState(false)
  const [reFrom, setReFrom]         = useState('')
  const [reTo, setReTo]             = useState('')
  const [rePrefix, setRePrefix]     = useState('')
  const [reUnits, setReUnits]       = useState('')
  const [pkFrom, setPkFrom]         = useState('')
  const [pkTo, setPkTo]             = useState('')
  const [pkPrefix, setPkPrefix]     = useState('')
  const [pkSpaces, setPkSpaces]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]               = useState('')

  const handleSubmit = async () => {
    const trimName = name.trim()
    if (!trimName) { setErr('Tower name is required.'); return }
    setSubmitting(true); setErr('')
    const { data: building, error } = await supabase
      .from('project_buildings')
      .insert({ project_id: projectId, name: trimName, sort_order: existingCount })
      .select('*').single()
    if (error) { setErr(error.message); setSubmitting(false); return }
    const ops = []
    if (hasRes) {
      const rows = buildTowerFloorRows(reFrom, reTo, rePrefix, reUnits, projectId, building.id)
      if (rows.length > 0) ops.push(supabase.from('project_floors').insert(rows))
    }
    if (hasPark) {
      const rows = buildTowerFloorRows(pkFrom, pkTo, pkPrefix, pkSpaces, projectId, building.id)
      if (rows.length > 0) ops.push(supabase.from('project_parking_floors').insert(rows))
    }
    await Promise.all(ops)
    onDone(building)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Add Tower / Location</h3>
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            placeholder="e.g. Tower A"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
        </div>
        <div className="space-y-4 mb-5">
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={hasRes} onChange={e => setHasRes(e.target.checked)} className="w-4 h-4 rounded accent-[#ed6055]" />
              <span className="text-sm font-semibold text-gray-800">Residential Units</span>
            </label>
            {hasRes && <TowerFloorRangeFields from={reFrom} setFrom={setReFrom} to={reTo} setTo={setReTo} prefix={rePrefix} setPrefix={setRePrefix} count={reUnits} setCount={setReUnits} countLabel="Units" />}
          </div>
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={hasPark} onChange={e => setHasPark(e.target.checked)} className="w-4 h-4 rounded accent-[#ed6055]" />
              <span className="text-sm font-semibold text-gray-800">Parking</span>
            </label>
            {hasPark && <TowerFloorRangeFields from={pkFrom} setFrom={setPkFrom} to={pkTo} setTo={setPkTo} prefix={pkPrefix} setPrefix={setPkPrefix} count={pkSpaces} setCount={setPkSpaces} countLabel="Spaces" />}
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition disabled:opacity-50">
            {submitting ? 'Adding…' : 'Add Tower'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditTowerModal({ building, projectId, onDone, onCancel }) {
  const [name, setName]             = useState(building.name)
  const [resSummary, setResSummary] = useState({ floors: 0, units: 0 })
  const [pkSummary, setPkSummary]   = useState({ floors: 0, units: 0 })
  const [addRes, setAddRes]         = useState(false)
  const [addPark, setAddPark]       = useState(false)
  const [reFrom, setReFrom]         = useState('')
  const [reTo, setReTo]             = useState('')
  const [rePrefix, setRePrefix]     = useState('')
  const [reUnits, setReUnits]       = useState('')
  const [pkFrom, setPkFrom]         = useState('')
  const [pkTo, setPkTo]             = useState('')
  const [pkPrefix, setPkPrefix]     = useState('')
  const [pkSpaces, setPkSpaces]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')

  useEffect(() => {
    const load = async () => {
      const [rRes, pRes] = await Promise.all([
        supabase.from('project_floors').select('num_units').eq('building_id', building.id),
        supabase.from('project_parking_floors').select('num_units').eq('building_id', building.id),
      ])
      if (rRes.data) setResSummary({ floors: rRes.data.length, units: rRes.data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
      if (pRes.data) setPkSummary({ floors: pRes.data.length, units: pRes.data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
    }
    load()
  }, [building.id])

  const handleSave = async () => {
    const trimName = name.trim()
    if (!trimName) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    const ops = []
    if (trimName !== building.name) ops.push(supabase.from('project_buildings').update({ name: trimName }).eq('id', building.id))
    if (addRes) {
      const rows = buildTowerFloorRows(reFrom, reTo, rePrefix, reUnits, projectId, building.id)
      if (rows.length > 0) ops.push(supabase.from('project_floors').insert(rows))
    }
    if (addPark) {
      const rows = buildTowerFloorRows(pkFrom, pkTo, pkPrefix, pkSpaces, projectId, building.id)
      if (rows.length > 0) ops.push(supabase.from('project_parking_floors').insert(rows))
    }
    await Promise.all(ops)
    onDone({ ...building, name: trimName })
  }

  const StatPill = ({ count, label, color }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {count} {label}
    </span>
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Edit Tower</h3>
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40"
          />
        </div>
        <div className="space-y-3 mb-5">
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800">Residential Units</span>
              <div className="flex gap-1.5">
                <StatPill count={resSummary.floors} label="floors" color="bg-amber-50 text-amber-700" />
                <StatPill count={resSummary.units} label="units" color="bg-amber-50 text-amber-700" />
              </div>
            </div>
            <button onClick={() => setAddRes(v => !v)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] transition">
              {addRes ? '− Hide' : '+ Add more floors'}
            </button>
            {addRes && <TowerFloorRangeFields from={reFrom} setFrom={setReFrom} to={reTo} setTo={setReTo} prefix={rePrefix} setPrefix={setRePrefix} count={reUnits} setCount={setReUnits} countLabel="Units" />}
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800">Parking</span>
              <div className="flex gap-1.5">
                <StatPill count={pkSummary.floors} label="floors" color="bg-blue-50 text-blue-700" />
                <StatPill count={pkSummary.units} label="spaces" color="bg-blue-50 text-blue-700" />
              </div>
            </div>
            <button onClick={() => setAddPark(v => !v)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] transition">
              {addPark ? '− Hide' : '+ Add parking floors'}
            </button>
            {addPark && <TowerFloorRangeFields from={pkFrom} setFrom={setPkFrom} to={pkTo} setTo={setPkTo} prefix={pkPrefix} setPrefix={setPkPrefix} count={pkSpaces} setCount={setPkSpaces} countLabel="Spaces" />}
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkAddFloorsModal({ onConfirm, onCancel, unitLabel = 'Units' }) {
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [prefix, setPrefix]       = useState('')
  const [numUnits, setNumUnits]   = useState('')
  const [err, setErr]             = useState('')

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  const f = parseInt(from), t = parseInt(to)
  const rangeValid = !isNaN(f) && !isNaN(t) && f <= t && (t - f) <= 99
  const count = rangeValid ? t - f + 1 : 0

  const previewLabels = () => {
    if (!rangeValid) return ''
    const labels = Array.from({ length: count }, (_, i) => prefix ? `${prefix}${f + i}` : String(f + i))
    if (labels.length <= 4) return labels.join(', ')
    return `${labels[0]}, ${labels[1]} … ${labels[labels.length - 1]}`
  }

  const handle = () => {
    if (!rangeValid) { setErr(isNaN(f) || isNaN(t) ? 'Enter a valid floor range.' : f > t ? 'From must be ≤ To.' : 'Maximum 100 floors at a time.'); return }
    setErr('')
    const floors = []
    for (let i = f; i <= t; i++) {
      floors.push({
        physical_level:   prefix ? `${prefix}${i}` : String(i),
        marketing_level:  null,
        num_units:        numUnits !== '' ? parseInt(numUnits) || null : null,
        m4_planned_start: null,
        m4_planned_end:   null,
        m5_planned_start: null,
        m5_planned_end:   null,
      })
    }
    onConfirm(floors)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Add Floors</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>From Floor #</label>
              <input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="1" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>To Floor #</label>
              <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="40" className={fieldCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Level Prefix <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. F or L" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>{unitLabel} / Floor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} placeholder="0" className={fieldCls} />
            </div>
          </div>

          {rangeValid && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
              Will generate <span className="font-semibold text-gray-700">{count}</span> floor{count !== 1 ? 's' : ''}:{' '}
              <span className="font-medium text-gray-600">{previewLabels()}</span>
              {numUnits !== '' && parseInt(numUnits) > 0 && (
                <> -- <span className="font-semibold text-gray-700">{numUnits}</span> {unitLabel.toLowerCase()} each</>
              )}
            </p>
          )}

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handle} className="px-4 py-2 text-sm font-semibold bg-[#ed6055] hover:bg-[#d94f45] text-white rounded-lg transition">Add Floors</button>
        </div>
      </div>
    </div>
  )
}

function ProjectFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0, onSummaryChange }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForms, setEditForms] = useState({})
  const [newForm, setNewForm] = useState({})
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { load() }, [projectId, buildingId, refreshKey])
  const load = async () => {
    let q = supabase.from('project_floors').select('*').eq('project_id', projectId)
    if (buildingId) q = q.eq('building_id', buildingId)
    const { data } = await q
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
      onSummaryChange?.({ floors: data.length, units: data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
    }
  }
  const blank = () => ({ physical_level: '', marketing_level: '', num_units: '', m4_planned_start: '', m4_planned_end: '', m5_planned_start: '', m5_planned_end: '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false })
  const toPayload = (f) => ({ project_id: projectId, building_id: buildingId ?? null, physical_level: f.physical_level?.trim(), marketing_level: f.marketing_level?.trim() || null, num_units: f.num_units !== '' ? parseInt(f.num_units) : null, m4_planned_start: f.m4_planned_start || null, m4_planned_end: f.m4_planned_end || null, m5_planned_start: f.m5_planned_start || null, m5_planned_end: f.m5_planned_end || null })
  const validate = (f, label = '') => {
    const p = toPayload(f); const pfx = label ? `${label}: ` : ''
    if (!p.physical_level) { showToast(`${pfx}Physical level is required.`, 'error'); return false }
    if (noNeg(p.num_units)) { showToast(`${pfx}Values cannot be negative.`, 'error'); return false }
    if (f.m4_start_bad || (f.m4_planned_start && !isValidDate(f.m4_planned_start))) { showToast(`${pfx}M4 Start Date is not a valid calendar date.`, 'error'); return false }
    if (f.m4_end_bad   || (f.m4_planned_end   && !isValidDate(f.m4_planned_end)))   { showToast(`${pfx}M4 End Date is not a valid calendar date.`, 'error'); return false }
    if (f.m5_start_bad || (f.m5_planned_start && !isValidDate(f.m5_planned_start))) { showToast(`${pfx}M5 Start Date is not a valid calendar date.`, 'error'); return false }
    if (f.m5_end_bad   || (f.m5_planned_end   && !isValidDate(f.m5_planned_end)))   { showToast(`${pfx}M5 End Date is not a valid calendar date.`, 'error'); return false }
    if (p.m4_planned_start && p.m4_planned_end && p.m4_planned_end < p.m4_planned_start) { showToast(`${pfx}M4 End Date cannot be earlier than M4 Start Date.`, 'error'); return false }
    if (p.m5_planned_start && p.m5_planned_end && p.m5_planned_end < p.m5_planned_start) { showToast(`${pfx}M5 End Date cannot be earlier than M5 Start Date.`, 'error'); return false }
    return true
  }
  const saveAll = async () => {
    for (const row of rows) {
      const f = editForms[row.id] ?? {}
      if (!validate(f, row.physical_level)) return
      const { error } = await supabase.from('project_floors').update(toPayload(f)).eq('id', row.id)
      if (error) { showToast(error.message, 'error'); return }
    }
    showToast('Updated.', 'success'); setEditMode(false); setEditForms({}); load()
  }
  const saveNew = async () => {
    if (!validate(newForm)) return
    const { error } = await supabase.from('project_floors').insert(toPayload(newForm))
    if (error) { showToast(error.message, 'error'); return }
    showToast('Added.', 'success'); setAdding(false); setNewForm({}); load()
  }
  const bulkSave = async (floors) => {
    const rows = floors.map(f => ({ ...f, project_id: projectId, building_id: buildingId ?? null }))
    const { error } = await supabase.from('project_floors').insert(rows)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${floors.length} floor${floors.length !== 1 ? 's' : ''} added.`, 'success')
    setBulkAdding(false); load()
  }
  const del = async (id) => { await supabase.from('project_floors').delete().eq('id', id); load() }
  const enterEdit = () => { setEditForms(Object.fromEntries(rows.map(r => [r.id, { physical_level: r.physical_level, marketing_level: r.marketing_level ?? '', num_units: r.num_units ?? '', m4_planned_start: r.m4_planned_start ?? '', m4_planned_end: r.m4_planned_end ?? '', m5_planned_start: r.m5_planned_start ?? '', m5_planned_end: r.m5_planned_end ?? '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false }]))); setEditMode(true) }
  const cancelEdit = () => { setEditMode(false); setEditForms({}); setAdding(false); setNewForm({}) }
  const setEF = (id, k, v) => setEditForms(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const setEF2 = (id, k1, v1, k2, v2) => setEditForms(p => ({ ...p, [id]: { ...p[id], [k1]: v1, [k2]: v2 } }))

  const isEditing = editMode || adding

  return (
    <div className="mb-6">
      <SectionHeader title="Residential Units" accent="#f59e0b" action={isAdmin && (
        isEditing ? (
          <div className="flex gap-1.5">
            <button onClick={cancelEdit} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={() => editMode ? saveAll() : saveNew()} className="text-xs font-semibold px-2.5 py-1 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition">Save</button>
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            <button onClick={() => { setNewForm(blank()); setAdding(true) }} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"><PlusIcon /> Add Row</button>
            <MenuButton items={[
              { label: 'Bulk Add', icon: <PlusIcon />, onClick: () => setBulkAdding(true) },
              ...(rows.length > 0 ? [{ label: 'Edit Rows', icon: <PencilIcon />, onClick: enterEdit }] : []),
            ]} />
          </div>
        )
      )} />
      <div className="overflow-x-auto">
        <div className={`bg-white rounded-xl border overflow-hidden transition-colors ${editMode ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
          <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 56 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              {isAdmin && <col style={{ width: 40 }} />}
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-2 py-2 font-semibold text-gray-600 leading-tight">Phys.<br/>Level</th>
                <th className="text-left px-2 py-2 font-semibold text-gray-600 leading-tight">Mktg.<br/>Level</th>
                <th className="text-left px-1 py-2 font-semibold text-gray-600">Units</th>
                <th className="text-center px-1 py-2 font-semibold text-gray-600" colSpan={2}>
                  <div>M4 Planned</div>
                  <div className="flex justify-around mt-0.5 font-medium text-[10px] text-gray-400"><span>Start Date</span><span>End Date</span></div>
                </th>
                <th className="text-center px-1 py-2 font-semibold text-gray-600" colSpan={2}>
                  <div>M5 Planned</div>
                  <div className="flex justify-around mt-0.5 font-medium text-[10px] text-gray-400"><span>Start Date</span><span>End Date</span></div>
                </th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => editMode ? (
                <tr key={row.id}>
                  {(() => {
                    const f = editForms[row.id] ?? {}
                    const m4StartErr = f.m4_start_bad || !!(f.m4_planned_start && !isValidDate(f.m4_planned_start))
                    const m4EndErr   = f.m4_end_bad   || !!(f.m4_planned_end   && !isValidDate(f.m4_planned_end))
                    const m5StartErr = f.m5_start_bad || !!(f.m5_planned_start && !isValidDate(f.m5_planned_start))
                    const m5EndErr   = f.m5_end_bad   || !!(f.m5_planned_end   && !isValidDate(f.m5_planned_end))
                    const m4OrderErr = !m4StartErr && !m4EndErr && !!(f.m4_planned_start && f.m4_planned_end && f.m4_planned_end < f.m4_planned_start)
                    const m5OrderErr = !m5StartErr && !m5EndErr && !!(f.m5_planned_start && f.m5_planned_end && f.m5_planned_end < f.m5_planned_start)
                    return <>
                      <td className="px-2 py-1.5"><InlineInput value={f.physical_level} onChange={v => setEF(row.id, 'physical_level', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput value={f.marketing_level} onChange={v => setEF(row.id, 'marketing_level', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="number" value={f.num_units} onChange={v => setEF(row.id, 'num_units', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_start} onChange={(v, bad) => setEF2(row.id, 'm4_planned_start', v, 'm4_start_bad', !!bad)} error={m4StartErr || m4OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_end}   onChange={(v, bad) => setEF2(row.id, 'm4_planned_end',   v, 'm4_end_bad',   !!bad)} error={m4EndErr   || m4OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_start} onChange={(v, bad) => setEF2(row.id, 'm5_planned_start', v, 'm5_start_bad', !!bad)} error={m5StartErr || m5OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_end}   onChange={(v, bad) => setEF2(row.id, 'm5_planned_end',   v, 'm5_end_bad',   !!bad)} error={m5EndErr   || m5OrderErr} /></td>
                      {isAdmin && <td />}
                    </>
                  })()}
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-2 py-1.5 font-semibold text-black">{row.physical_level}</td>
                  <td className="px-2 py-1.5 text-gray-600">{row.marketing_level || '--'}</td>
                  <td className="px-2 py-1.5 text-gray-600">{row.num_units ?? '--'}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m4_planned_start)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m4_planned_end)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m5_planned_start)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m5_planned_end)}</td>
                  {isAdmin && <td className="px-2 py-1.5"><button onClick={() => setDeleteId(row.id)} className="p-0.5 text-gray-400 hover:text-red-500"><TrashIcon /></button></td>}
                </tr>
              ))}
              {adding && (() => {
                const f = newForm
                const m4StartErr = f.m4_start_bad || !!(f.m4_planned_start && !isValidDate(f.m4_planned_start))
                const m4EndErr   = f.m4_end_bad   || !!(f.m4_planned_end   && !isValidDate(f.m4_planned_end))
                const m5StartErr = f.m5_start_bad || !!(f.m5_planned_start && !isValidDate(f.m5_planned_start))
                const m5EndErr   = f.m5_end_bad   || !!(f.m5_planned_end   && !isValidDate(f.m5_planned_end))
                const m4OrderErr = !m4StartErr && !m4EndErr && !!(f.m4_planned_start && f.m4_planned_end && f.m4_planned_end < f.m4_planned_start)
                const m5OrderErr = !m5StartErr && !m5EndErr && !!(f.m5_planned_start && f.m5_planned_end && f.m5_planned_end < f.m5_planned_start)
                return (
                  <tr>
                    <td className="px-2 py-1.5"><InlineInput value={f.physical_level} onChange={v => setNewForm(p => ({ ...p, physical_level: v }))} placeholder="e.g. 1 or Outdoor" /></td>
                    <td className="px-2 py-1.5"><InlineInput value={f.marketing_level} onChange={v => setNewForm(p => ({ ...p, marketing_level: v }))} placeholder="RD" /></td>
                    <td className="px-2 py-1.5"><InlineInput type="number" value={f.num_units} onChange={v => setNewForm(p => ({ ...p, num_units: v }))} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_start} onChange={(v, bad) => setNewForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_end}   onChange={(v, bad) => setNewForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_start} onChange={(v, bad) => setNewForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_end}   onChange={(v, bad) => setNewForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                    {isAdmin && <td />}
                  </tr>
                )
              })()}
              {rows.length === 0 && !adding && <EmptyRow cols={isAdmin ? 8 : 7} message="No floors added yet." />}
            </tbody>
          </table>
        </div>
      </div>
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
      {bulkAdding && <BulkAddFloorsModal unitLabel="Units" onConfirm={bulkSave} onCancel={() => setBulkAdding(false)} />}
    </div>
  )
}

function ParkingFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0, onSummaryChange }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForms, setEditForms] = useState({})
  const [newForm, setNewForm] = useState({})
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { load() }, [projectId, buildingId, refreshKey])
  const load = async () => {
    let q = supabase.from('project_parking_floors').select('*').eq('project_id', projectId)
    if (buildingId) q = q.eq('building_id', buildingId)
    const { data } = await q
    if (data) {
      data.sort((a, b) => {
        const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.physical_level.localeCompare(b.physical_level)
      })
      setRows(data)
      onSummaryChange?.({ floors: data.length, units: data.reduce((s, r) => s + (r.num_units ?? 0), 0) })
    }
  }
  const blank = () => ({ physical_level: '', marketing_level: '', num_units: '', m4_planned_start: '', m4_planned_end: '', m5_planned_start: '', m5_planned_end: '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false })
  const toPayload = (f) => ({ project_id: projectId, building_id: buildingId ?? null, physical_level: f.physical_level?.trim(), marketing_level: f.marketing_level?.trim() || null, num_units: f.num_units !== '' ? parseInt(f.num_units) : null, m4_planned_start: f.m4_planned_start || null, m4_planned_end: f.m4_planned_end || null, m5_planned_start: f.m5_planned_start || null, m5_planned_end: f.m5_planned_end || null })
  const validate = (f, label = '') => {
    const p = toPayload(f); const pfx = label ? `${label}: ` : ''
    if (!p.physical_level) { showToast(`${pfx}Physical level is required.`, 'error'); return false }
    if (noNeg(p.num_units)) { showToast(`${pfx}Values cannot be negative.`, 'error'); return false }
    if (f.m4_start_bad || (f.m4_planned_start && !isValidDate(f.m4_planned_start))) { showToast(`${pfx}M4 Start Date is not a valid calendar date.`, 'error'); return false }
    if (f.m4_end_bad   || (f.m4_planned_end   && !isValidDate(f.m4_planned_end)))   { showToast(`${pfx}M4 End Date is not a valid calendar date.`, 'error'); return false }
    if (f.m5_start_bad || (f.m5_planned_start && !isValidDate(f.m5_planned_start))) { showToast(`${pfx}M5 Start Date is not a valid calendar date.`, 'error'); return false }
    if (f.m5_end_bad   || (f.m5_planned_end   && !isValidDate(f.m5_planned_end)))   { showToast(`${pfx}M5 End Date is not a valid calendar date.`, 'error'); return false }
    if (p.m4_planned_start && p.m4_planned_end && p.m4_planned_end < p.m4_planned_start) { showToast(`${pfx}M4 End Date cannot be earlier than M4 Start Date.`, 'error'); return false }
    if (p.m5_planned_start && p.m5_planned_end && p.m5_planned_end < p.m5_planned_start) { showToast(`${pfx}M5 End Date cannot be earlier than M5 Start Date.`, 'error'); return false }
    return true
  }
  const saveAll = async () => {
    for (const row of rows) {
      const f = editForms[row.id] ?? {}
      if (!validate(f, row.physical_level)) return
      const { error } = await supabase.from('project_parking_floors').update(toPayload(f)).eq('id', row.id)
      if (error) { showToast(error.message, 'error'); return }
    }
    showToast('Updated.', 'success'); setEditMode(false); setEditForms({}); load()
  }
  const saveNew = async () => {
    if (!validate(newForm)) return
    const { error } = await supabase.from('project_parking_floors').insert(toPayload(newForm))
    if (error) { showToast(error.message, 'error'); return }
    showToast('Added.', 'success'); setAdding(false); setNewForm({}); load()
  }
  const bulkSave = async (floors) => {
    const rows = floors.map(f => ({ ...f, project_id: projectId, building_id: buildingId ?? null }))
    const { error } = await supabase.from('project_parking_floors').insert(rows)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${floors.length} parking floor${floors.length !== 1 ? 's' : ''} added.`, 'success')
    setBulkAdding(false); load()
  }
  const del = async (id) => { await supabase.from('project_parking_floors').delete().eq('id', id); load() }
  const enterEdit = () => { setEditForms(Object.fromEntries(rows.map(r => [r.id, { physical_level: r.physical_level, marketing_level: r.marketing_level ?? '', num_units: r.num_units ?? '', m4_planned_start: r.m4_planned_start ?? '', m4_planned_end: r.m4_planned_end ?? '', m5_planned_start: r.m5_planned_start ?? '', m5_planned_end: r.m5_planned_end ?? '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false }]))); setEditMode(true) }
  const cancelEdit = () => { setEditMode(false); setEditForms({}); setAdding(false); setNewForm({}) }
  const setEF = (id, k, v) => setEditForms(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const setEF2 = (id, k1, v1, k2, v2) => setEditForms(p => ({ ...p, [id]: { ...p[id], [k1]: v1, [k2]: v2 } }))

  const isEditing = editMode || adding

  return (
    <div>
      <SectionHeader title="Parking Units" accent="#3b82f6" action={isAdmin && (
        isEditing ? (
          <div className="flex gap-1.5">
            <button onClick={cancelEdit} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={() => editMode ? saveAll() : saveNew()} className="text-xs font-semibold px-2.5 py-1 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition">Save</button>
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            <button onClick={() => { setNewForm(blank()); setAdding(true) }} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"><PlusIcon /> Add Row</button>
            <MenuButton items={[
              { label: 'Bulk Add', icon: <PlusIcon />, onClick: () => setBulkAdding(true) },
              ...(rows.length > 0 ? [{ label: 'Edit Rows', icon: <PencilIcon />, onClick: enterEdit }] : []),
            ]} />
          </div>
        )
      )} />
      <div className="overflow-x-auto">
        <div className={`bg-white rounded-xl border overflow-hidden transition-colors ${editMode ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
          <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 56 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              {isAdmin && <col style={{ width: 40 }} />}
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-2 py-2 font-semibold text-gray-600 uppercase tracking-wider leading-tight">Phys.<br/>Level</th>
                <th className="text-left px-2 py-2 font-semibold text-gray-600 uppercase tracking-wider leading-tight">Mktg.<br/>Level</th>
                <th className="text-left px-1 py-2 font-semibold text-gray-600">Spaces</th>
                <th className="text-center px-1 py-2 font-semibold text-amber-500 uppercase tracking-wider" colSpan={2}>
                  <div>M4 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-amber-400"><span>Start Date</span><span>End Date</span></div>
                </th>
                <th className="text-center px-1 py-2 font-semibold text-green-600 uppercase tracking-wider" colSpan={2}>
                  <div>M5 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-green-500"><span>Start Date</span><span>End Date</span></div>
                </th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => editMode ? (
                <tr key={row.id}>
                  {(() => {
                    const f = editForms[row.id] ?? {}
                    const m4StartErr = f.m4_start_bad || !!(f.m4_planned_start && !isValidDate(f.m4_planned_start))
                    const m4EndErr   = f.m4_end_bad   || !!(f.m4_planned_end   && !isValidDate(f.m4_planned_end))
                    const m5StartErr = f.m5_start_bad || !!(f.m5_planned_start && !isValidDate(f.m5_planned_start))
                    const m5EndErr   = f.m5_end_bad   || !!(f.m5_planned_end   && !isValidDate(f.m5_planned_end))
                    const m4OrderErr = !m4StartErr && !m4EndErr && !!(f.m4_planned_start && f.m4_planned_end && f.m4_planned_end < f.m4_planned_start)
                    const m5OrderErr = !m5StartErr && !m5EndErr && !!(f.m5_planned_start && f.m5_planned_end && f.m5_planned_end < f.m5_planned_start)
                    return <>
                      <td className="px-2 py-1.5"><InlineInput value={f.physical_level} onChange={v => setEF(row.id, 'physical_level', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput value={f.marketing_level} onChange={v => setEF(row.id, 'marketing_level', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="number" value={f.num_units} onChange={v => setEF(row.id, 'num_units', v)} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_start} onChange={(v, bad) => setEF2(row.id, 'm4_planned_start', v, 'm4_start_bad', !!bad)} error={m4StartErr || m4OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_end}   onChange={(v, bad) => setEF2(row.id, 'm4_planned_end',   v, 'm4_end_bad',   !!bad)} error={m4EndErr   || m4OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_start} onChange={(v, bad) => setEF2(row.id, 'm5_planned_start', v, 'm5_start_bad', !!bad)} error={m5StartErr || m5OrderErr} /></td>
                      <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_end}   onChange={(v, bad) => setEF2(row.id, 'm5_planned_end',   v, 'm5_end_bad',   !!bad)} error={m5EndErr   || m5OrderErr} /></td>
                      {isAdmin && <td />}
                    </>
                  })()}
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-2 py-1.5 font-semibold text-black">{row.physical_level}</td>
                  <td className="px-2 py-1.5 text-gray-600">{row.marketing_level || '--'}</td>
                  <td className="px-2 py-1.5 text-gray-600">{row.num_units ?? '--'}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m4_planned_start)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m4_planned_end)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m5_planned_start)}</td>
                  <td className="px-1 py-1.5 text-gray-500 truncate">{fmt(row.m5_planned_end)}</td>
                  {isAdmin && <td className="px-2 py-1.5"><button onClick={() => setDeleteId(row.id)} className="p-0.5 text-gray-400 hover:text-red-500"><TrashIcon /></button></td>}
                </tr>
              ))}
              {adding && (() => {
                const f = newForm
                const m4StartErr = f.m4_start_bad || !!(f.m4_planned_start && !isValidDate(f.m4_planned_start))
                const m4EndErr   = f.m4_end_bad   || !!(f.m4_planned_end   && !isValidDate(f.m4_planned_end))
                const m5StartErr = f.m5_start_bad || !!(f.m5_planned_start && !isValidDate(f.m5_planned_start))
                const m5EndErr   = f.m5_end_bad   || !!(f.m5_planned_end   && !isValidDate(f.m5_planned_end))
                const m4OrderErr = !m4StartErr && !m4EndErr && !!(f.m4_planned_start && f.m4_planned_end && f.m4_planned_end < f.m4_planned_start)
                const m5OrderErr = !m5StartErr && !m5EndErr && !!(f.m5_planned_start && f.m5_planned_end && f.m5_planned_end < f.m5_planned_start)
                return (
                  <tr>
                    <td className="px-2 py-1.5"><InlineInput value={f.physical_level} onChange={v => setNewForm(p => ({ ...p, physical_level: v }))} placeholder="e.g. B1 or Roof Deck" /></td>
                    <td className="px-2 py-1.5"><InlineInput value={f.marketing_level} onChange={v => setNewForm(p => ({ ...p, marketing_level: v }))} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="number" value={f.num_units} onChange={v => setNewForm(p => ({ ...p, num_units: v }))} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_start} onChange={(v, bad) => setNewForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m4_planned_end}   onChange={(v, bad) => setNewForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_start} onChange={(v, bad) => setNewForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                    <td className="px-2 py-1.5"><InlineInput type="date" value={f.m5_planned_end}   onChange={(v, bad) => setNewForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                    {isAdmin && <td />}
                  </tr>
                )
              })()}
              {rows.length === 0 && !adding && <EmptyRow cols={isAdmin ? 8 : 7} message="No parking floors added yet." />}
            </tbody>
          </table>
        </div>
      </div>
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
      {bulkAdding && <BulkAddFloorsModal unitLabel="Spaces" onConfirm={bulkSave} onCancel={() => setBulkAdding(false)} />}
    </div>
  )
}

const DEV_UNIT_COLS    = [{ key: 'unit_type', header: 'Unit Type' }, { key: 'quantity', header: 'Quantity' }, { key: 'cfa_sqm', header: 'CFA (sqm)' }, { key: 'saleable_area_sqm', header: 'Saleable Area (sqm)' }]
const DEV_PARKING_COLS = [{ key: 'parking_type', header: 'Parking Type' }, { key: 'quantity', header: 'Quantity' }, { key: 'cfa_sqm', header: 'CFA (sqm)' }, { key: 'saleable_area_sqm', header: 'Saleable Area (sqm)' }]
const DEV_AMENITY_COLS = [{ key: 'amenity_name', header: 'Amenity Name' }, { key: 'cfa_sqm', header: 'CFA (sqm)' }, { key: 'floor_area_sqm', header: 'Floor Area (sqm)' }]
const DEV_FLOOR_COLS   = [{ key: 'building_name', header: 'Building' }, { key: 'physical_level', header: 'Physical Level' }, { key: 'marketing_level', header: 'Marketing Level' }, { key: 'num_units', header: 'Units' }, { key: 'm4_planned_start', header: 'M4 Planned Start' }, { key: 'm4_planned_end', header: 'M4 Planned End' }, { key: 'm5_planned_start', header: 'M5 Planned Start' }, { key: 'm5_planned_end', header: 'M5 Planned End' }]

function DevelopmentTab({ project, isAdmin, showToast }) {
  const [devRefreshKey, setDevRefreshKey] = useState(0)
  const [importing, setImporting]         = useState(false)
  const [importErrors, setImportErrors]   = useState([])

  const handleExport = async () => {
    const pid = project.id
    const [flRes, pfRes, blRes] = await Promise.all([
      supabase.from('project_floors').select('*').eq('project_id', pid),
      supabase.from('project_parking_floors').select('*').eq('project_id', pid),
      supabase.from('project_buildings').select('id, name').eq('project_id', pid),
    ])
    const buildingMap = Object.fromEntries((blRes.data ?? []).map(b => [b.id, b.name]))
    const sort = rows => [...(rows ?? [])].sort((a, b) => {
      const ba = buildingMap[a.building_id] ?? '', bb = buildingMap[b.building_id] ?? ''
      if (ba !== bb) return ba.localeCompare(bb)
      const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.physical_level.localeCompare(b.physical_level)
    })
    const withBuildingName = rows => sort(rows).map(r => ({ ...r, building_name: buildingMap[r.building_id] ?? '' }))
    const sheets = [
      { sheetName: 'Floor Schedule',         rows: withBuildingName(flRes.data), columns: DEV_FLOOR_COLS },
      { sheetName: 'Parking Floor Schedule', rows: withBuildingName(pfRes.data), columns: DEV_FLOOR_COLS },
    ]
    await downloadWorkbook(sheets, `${project.name}_development.xlsx`)
  }

  const handleImport = async (file) => {
    if (!window.confirm('This will replace all floor schedule data for this project. Continue?')) return
    setImporting(true)
    setImportErrors([])
    try {
      const sheets  = await parseWorkbook(file)
      const pid     = project.id

      // -- 1. Build raw floor rows (building_id resolved after upsert) ----------
      const mapFloor = r => ({
        project_id: pid,
        building_name: String(r['Building'] ?? '').trim(),
        physical_level: String(r['Physical Level'] ?? '').trim(),
        marketing_level: String(r['Marketing Level'] ?? '').trim() || null,
        num_units: toInt(r['Units']),
        m4_planned_start: toDateStr(r['M4 Planned Start']),
        m4_planned_end:   toDateStr(r['M4 Planned End']),
        m5_planned_start: toDateStr(r['M5 Planned Start']),
        m5_planned_end:   toDateStr(r['M5 Planned End']),
      })
      const flRows = (sheets['Floor Schedule'] ?? []).map(mapFloor).filter(r => r.physical_level)
      const pfRows = (sheets['Parking Floor Schedule'] ?? []).map(mapFloor).filter(r => r.physical_level)

      // -- 2. Validate -----------------------------------------------------------
      const errors = []
      const validateFloorSheet = (rawSheet, rows, sheetLabel) => {
        rawSheet.forEach((raw, i) => {
          const level = String(raw['Physical Level'] ?? '').trim()
          if (!level) return
          const lbl = `${sheetLabel} row ${i + 2} (${level})`
          const m4sOk = isValidRawDate(raw['M4 Planned Start'])
          const m4eOk = isValidRawDate(raw['M4 Planned End'])
          const m5sOk = isValidRawDate(raw['M5 Planned Start'])
          const m5eOk = isValidRawDate(raw['M5 Planned End'])
          if (!m4sOk) errors.push(`${lbl}: M4 Planned Start is not a valid calendar date.`)
          if (!m4eOk) errors.push(`${lbl}: M4 Planned End is not a valid calendar date.`)
          if (!m5sOk) errors.push(`${lbl}: M5 Planned Start is not a valid calendar date.`)
          if (!m5eOk) errors.push(`${lbl}: M5 Planned End is not a valid calendar date.`)
          if (m4sOk && m4eOk) {
            const s = toDateStr(raw['M4 Planned Start']), e = toDateStr(raw['M4 Planned End'])
            if (s && e && e < s) errors.push(`${lbl}: M4 Planned End cannot be before M4 Planned Start.`)
          }
          if (m5sOk && m5eOk) {
            const s = toDateStr(raw['M5 Planned Start']), e = toDateStr(raw['M5 Planned End'])
            if (s && e && e < s) errors.push(`${lbl}: M5 Planned End cannot be before M5 Planned Start.`)
          }
        })
        rows.forEach((r, i) => {
          if (r.num_units !== null && r.num_units < 0)
            errors.push(`${sheetLabel} row ${i + 2} (${r.physical_level}): Units cannot be negative.`)
        })
      }
      validateFloorSheet(sheets['Floor Schedule'] ?? [], flRows, 'Floor Schedule')
      validateFloorSheet(sheets['Parking Floor Schedule'] ?? [], pfRows, 'Parking Floor Schedule')
      if (errors.length > 0) { setImportErrors(errors); return }

      // -- 3. Upsert buildings, build name→id map --------------------------------
      const allNames = [...new Set([...flRows, ...pfRows].map(r => r.building_name).filter(Boolean))]
      const { data: existingBuildings } = await supabase.from('project_buildings').select('id, name').eq('project_id', pid)
      const existingByName = Object.fromEntries((existingBuildings ?? []).map(b => [b.name.trim().toLowerCase(), b.id]))
      const missingNames = allNames.filter(n => !existingByName[n.toLowerCase()])
      if (missingNames.length > 0) {
        const { data: created } = await supabase.from('project_buildings').insert(
          missingNames.map((name, i) => ({ project_id: pid, name, sort_order: (existingBuildings?.length ?? 0) + i }))
        ).select('id, name')
        ;(created ?? []).forEach(b => { existingByName[b.name.trim().toLowerCase()] = b.id })
      }
      const resolveBuildingId = name => existingByName[name.trim().toLowerCase()] ?? null

      // -- 4. Commit -------------------------------------------------------------
      await Promise.all([
        supabase.from('project_floors').delete().eq('project_id', pid),
        supabase.from('project_parking_floors').delete().eq('project_id', pid),
      ])
      const toDbRow = r => ({ project_id: r.project_id, building_id: resolveBuildingId(r.building_name), physical_level: r.physical_level, marketing_level: r.marketing_level, num_units: r.num_units, m4_planned_start: r.m4_planned_start, m4_planned_end: r.m4_planned_end, m5_planned_start: r.m5_planned_start, m5_planned_end: r.m5_planned_end })
      await Promise.all([
        flRows.length > 0 && supabase.from('project_floors').insert(flRows.map(toDbRow)),
        pfRows.length > 0 && supabase.from('project_parking_floors').insert(pfRows.map(toDbRow)),
      ].filter(Boolean))

      setDevRefreshKey(k => k + 1)
      showToast('Development data imported.', 'success')
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <CondominiumDevelopmentTab project={project} isAdmin={isAdmin} showToast={showToast} devRefreshKey={devRefreshKey} onExport={handleExport} onImport={handleImport} importing={importing} importErrors={importErrors} onDismissImportErrors={() => setImportErrors([])} />
  )
}

// -- Project Plans Section -----------------------------------------------------

function ProjectPlansSection({ projectId, isAdmin, editing = false, showToast }) {
  const [plans, setPlans]         = useState([])
  const [uploading, setUploading] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [adding, setAdding]       = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewName, setPreviewName] = useState('')
  const [deleteId, setDeleteId]   = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [projectId])

  const load = async () => {
    const { data } = await supabase.from('project_pdf_plans').select('*').eq('project_id', projectId).order('sort_order')
    if (data) setPlans(data)
  }

  const upload = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!nameInput.trim()) { showToast('Enter a plan name first.', 'error'); return }
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `pdf-plans/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
    const { error } = await supabase.storage.from('project-plans').upload(path, file)
    if (error) { showToast('Upload failed: ' + error.message, 'error'); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('project-plans').getPublicUrl(path)
    await supabase.from('project_pdf_plans').insert({ project_id: projectId, name: nameInput.trim(), url: urlData.publicUrl, sort_order: plans.length })
    showToast('Plan uploaded.', 'success')
    setUploading(false)
    setNameInput('')
    setAdding(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  const del = async id => {
    await supabase.from('project_pdf_plans').delete().eq('id', id)
    load()
  }

  if (!isAdmin && plans.length === 0) return null

  return (
    <div className="px-8 py-5 border-t border-gray-100" style={{ animation: 'fade-in-up 220ms 200ms ease-out both' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project Plans</p>
        {isAdmin && editing && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition"
          >
            <PlusIcon /> Upload
          </button>
        )}
      </div>

      {isAdmin && editing && adding && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-gray-50 border border-dashed border-gray-200">
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Plan name (e.g. Master Plan, Typical Floor)"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#ed6055]/40"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !nameInput.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#ed6055] text-white hover:bg-[#d94f45] transition disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Choose PDF'}
          </button>
          <button onClick={() => { setAdding(false); setNameInput('') }} className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={upload} />
        </div>
      )}

      {plans.length === 0 && !adding && (
        <p className="text-xs text-gray-400 py-2">No plans uploaded yet.</p>
      )}

      <div className="space-y-1">
        {plans.map(plan => (
          <div key={plan.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="flex-1 text-xs font-medium text-gray-800 truncate">{plan.name}</span>
            <button
              onClick={() => { setPreviewUrl(plan.url); setPreviewName(plan.name) }}
              className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Preview
            </button>
            {isAdmin && editing && (
              <button
                onClick={() => setDeleteId(plan.id)}
                className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        ))}
      </div>

      {previewUrl && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 bg-black/60 flex-shrink-0">
            <span className="text-white text-sm font-semibold truncate">{previewName}</span>
            <button
              onClick={() => setPreviewUrl(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <iframe src={previewUrl} className="flex-1 w-full border-0" title={previewName} />
        </div>,
        document.body
      )}

      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
    </div>
  )
}

function CondominiumDevelopmentTab({ project, isAdmin, showToast, devRefreshKey = 0, onExport, onImport, importing, importErrors = [], onDismissImportErrors }) {
  const [floorRefreshKey, setFloorRefreshKey]       = useState(0)
  const [buildingId, setBuildingId]                 = useState(null)
  const [resSummary, setResSummary]                 = useState({ floors: 0, units: 0 })
  const [parkSummary, setParkSummary]               = useState({ floors: 0, units: 0 })
  const [forceShowParking, setForceShowParking]     = useState(false)

  useEffect(() => { setForceShowParking(false) }, [buildingId])
  useEffect(() => { if (parkSummary.floors > 0) setForceShowParking(true) }, [parkSummary.floors])

  const showParking = parkSummary.floors > 0 || forceShowParking

  return (
    <div className="max-w-3xl mx-auto pt-4">
      <ImportErrorPanel errors={importErrors} onDismiss={onDismissImportErrors} />

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 mt-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-[#ed6055]" />
            <h3 className="text-sm font-bold text-gray-900">Towers / Locations</h3>
          </div>
          <ExcelButtons onExport={onExport} onImport={onImport} importing={importing} />
        </div>
        <BuildingSelector
          projectId={project.id}
          isAdmin={isAdmin}
          buildingId={buildingId}
          onChange={id => { setBuildingId(id); setResSummary({ floors: 0, units: 0 }); setParkSummary({ floors: 0, units: 0 }) }}
          onCopyDone={() => { setResSummary({ floors: 0, units: 0 }); setParkSummary({ floors: 0, units: 0 }); setFloorRefreshKey(k => k + 1) }}
        />
      </div>

      {buildingId && (resSummary.floors > 0 || parkSummary.floors > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {resSummary.floors > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-gray-500">Residential</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-gray-800">{resSummary.floors} floor{resSummary.floors !== 1 ? 's' : ''}</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-gray-800">{resSummary.units} unit{resSummary.units !== 1 ? 's' : ''}</span>
            </div>
          )}
          {parkSummary.floors > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-gray-500">Parking</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-gray-800">{parkSummary.floors} floor{parkSummary.floors !== 1 ? 's' : ''}</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-gray-800">{parkSummary.units} space{parkSummary.units !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {buildingId && <ProjectFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={Math.max(floorRefreshKey, devRefreshKey)} onSummaryChange={setResSummary} />}

      {/* Always render ParkingFloorSchedule so onSummaryChange fires; hide via CSS when not relevant */}
      {buildingId && (
        <div className={showParking ? '' : 'hidden'}>
          <ParkingFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={Math.max(floorRefreshKey, devRefreshKey)} onSummaryChange={setParkSummary} />
        </div>
      )}

      {buildingId && !showParking && isAdmin && (
        <div className="mt-2">
          <button
            onClick={() => setForceShowParking(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 rounded-lg transition"
          >
            <PlusIcon /> Add Parking Floors
          </button>
        </div>
      )}

    </div>
  )
}

// -- Compliance Tab ------------------------------------------------------------

const COMPLIANCE_STATUS_MAP_IN = { 'Done': 'done', 'Ongoing': 'ongoing', 'Not Yet Started': 'not_yet_started' }
const COMPLIANCE_STATUS_MAP_OUT = { done: 'Done', ongoing: 'Ongoing', not_yet_started: 'Not Yet Started' }

// Free-form combobox for permit names -- allows custom values while suggesting
// all existing permit names (no duplicates) across every project.
function PermitCombobox({ value, onChange, options = [], placeholder = '' }) {
  const [open, setOpen]     = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase()
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : options
    return list.filter(o => o !== value)
  }, [value, options])

  const updateCoords = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    }
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value ?? ''}
        onChange={e => { onChange(e.target.value); updateCoords(); setOpen(true) }}
        onFocus={() => { updateCoords(); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#ed6055] bg-white transition"
      />
      {open && filtered.length > 0 && (
        <ul
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1"
        >
          {filtered.map(opt => (
            <li
              key={opt}
              onMouseDown={() => { onChange(opt); setOpen(false) }}
              className="px-3 py-2 text-xs text-gray-700 hover:bg-[#ed6055]/10 hover:text-[#ed6055] cursor-pointer"
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Derive Level 1 status from its children
function deriveL1Status(children) {
  if (!children || children.length === 0) return null
  const statuses = children.map(c => c.status)
  if (statuses.every(s => s === 'done')) return 'done'
  if (statuses.some(s => s === 'ongoing')) return 'ongoing'
  return 'not_yet_started'
}

function ComplianceTab({ project, isAdmin, showToast }) {
  const [rows, setRows]                     = useState([])
  const [editId, setEditId]                 = useState(null)
  const [deleteId, setDeleteId]             = useState(null)
  const [form, setForm]                     = useState({})
  const [filterStatus, setFilterStatus]     = useState('all')
  const [importing, setImporting]           = useState(false)
  const [importErrors, setImportErrors]     = useState([])
  const [allPermitNames, setAllPermitNames] = useState([])
  // addingTo: null = not adding, 'root' = new L1, <parentId> = new L2 under that parent
  const [addingTo, setAddingTo]             = useState(null)
  const [showAddModal, setShowAddModal]     = useState(false)
  const [standards, setStandards]           = useState([])
  const [loading, setLoading]               = useState(true)
  const [populating, setPopulating]         = useState(false)
  // collapsed L1 ids
  const [collapsed, setCollapsed]           = useState(new Set())

  useEffect(() => { loadAndAutoPopulate() }, [project.id])

  const load = async () => {
    const { data } = await supabase.from('project_permits').select('*').eq('project_id', project.id).order('sort_order')
    if (data) setRows(data)
    return data ?? []
  }

  const fetchAllPermitNames = async () => {
    const { data } = await supabase.from('project_permits').select('permit_name').order('permit_name')
    if (data) {
      const unique = [...new Set(data.map(r => r.permit_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      setAllPermitNames(unique)
    }
  }

  const loadStandards = async () => {
    const { data } = await supabase
      .from('standard_permits')
      .select('*')
      .order('sort_order')
    if (data) setStandards(data)
  }

  const populatingRef = useRef(false)

  const loadAndAutoPopulate = async () => {
    if (populatingRef.current) return
    populatingRef.current = true
    setLoading(true)

    fetchAllPermitNames()
    loadStandards()

    // Always re-check the DB directly -- don't trust cached state
    const { count } = await supabase
      .from('project_permits')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)

    if (count > 0) {
      await load()
      setLoading(false)
      populatingRef.current = false
      return
    }

    // No permits yet -- auto-populate from standard_permits
    const { data: stdList } = await supabase
      .from('standard_permits')
      .select('*')
      .order('sort_order')

    if (!stdList || stdList.length === 0) {
      setLoading(false)
      populatingRef.current = false
      return
    }

    setPopulating(true)
    const l1Standards = stdList.filter(s => !s.parent_id)
    const l2Standards = stdList.filter(s => s.parent_id)
    const idMap = {}
    for (let i = 0; i < l1Standards.length; i++) {
      const s = l1Standards[i]
      const { data: inserted } = await supabase
        .from('project_permits')
        .insert({ project_id: project.id, permit_name: s.permit_name, status: 'not_yet_started', remarks: null, parent_id: null, sort_order: i })
        .select()
        .single()
      if (inserted) idMap[s.id] = inserted.id
    }
    for (let i = 0; i < l2Standards.length; i++) {
      const s = l2Standards[i]
      const newParentId = idMap[s.parent_id]
      if (!newParentId) continue
      await supabase.from('project_permits').insert({ project_id: project.id, permit_name: s.permit_name, status: 'not_yet_started', remarks: null, parent_id: newParentId, sort_order: i })
    }
    setPopulating(false)
    await load()
    setLoading(false)
    populatingRef.current = false
  }

  const blank = (parentId = null) => ({ permit_name: '', status: 'not_yet_started', remarks: '', parent_id: parentId })

  const handleExport = async () => {
    const l1 = rows.filter(r => !r.parent_id)
    const exportRows = []
    l1.forEach(p => {
      exportRows.push({ 'Level': 'L1', 'Permit Name': p.permit_name, 'Status': COMPLIANCE_STATUS_MAP_OUT[p.status] ?? p.status, 'Remarks': p.remarks ?? '' })
      rows.filter(r => r.parent_id === p.id).forEach(c => {
        exportRows.push({ 'Level': 'L2', 'Permit Name': c.permit_name, 'Status': COMPLIANCE_STATUS_MAP_OUT[c.status] ?? c.status, 'Remarks': c.remarks ?? '' })
      })
    })
    await downloadWorkbook([{
      sheetName: 'Compliance',
      rows: exportRows,
      columns: [{ key: 'Level', header: 'Level' }, { key: 'Permit Name', header: 'Permit Name' }, { key: 'Status', header: 'Status' }, { key: 'Remarks', header: 'Remarks' }],
    }], `${project.name}_compliance.xlsx`)
  }

  const handleImport = async (file) => {
    if (!window.confirm('This will replace all Compliance data for this project. Continue?')) return
    setImporting(true)
    setImportErrors([])
    try {
      const sheets = await parseWorkbook(file)
      const pid = project.id
      const sheetRows = sheets['Compliance'] ?? Object.values(sheets)[0] ?? []
      await supabase.from('project_permits').delete().eq('project_id', pid)
      // Two-pass: insert L1s first, then L2s with resolved parent_id
      const l1Rows = sheetRows.filter(r => !r['Level'] || String(r['Level']).trim().toUpperCase() !== 'L2')
      const l2Rows = sheetRows.filter(r => String(r['Level']).trim().toUpperCase() === 'L2')
      const insertedL1 = []
      for (let i = 0; i < l1Rows.length; i++) {
        const r = l1Rows[i]
        const name = String(r['Permit Name'] ?? '').trim()
        if (!name) continue
        const { data } = await supabase.from('project_permits').insert({ project_id: pid, permit_name: name, status: COMPLIANCE_STATUS_MAP_IN[r['Status']] ?? 'not_yet_started', remarks: String(r['Remarks'] ?? '').trim() || null, sort_order: i, parent_id: null }).select().single()
        if (data) insertedL1.push(data)
      }
      // L2s: match to last L1 inserted before them in sheet order
      let lastL1 = null
      for (const r of sheetRows) {
        const isL2 = String(r['Level'] ?? '').trim().toUpperCase() === 'L2'
        if (!isL2) { lastL1 = insertedL1.find(p => p.permit_name === String(r['Permit Name'] ?? '').trim()) ?? lastL1; continue }
        if (!lastL1) continue
        const name = String(r['Permit Name'] ?? '').trim()
        if (!name) continue
        await supabase.from('project_permits').insert({ project_id: pid, permit_name: name, status: COMPLIANCE_STATUS_MAP_IN[r['Status']] ?? 'not_yet_started', remarks: String(r['Remarks'] ?? '').trim() || null, sort_order: 0, parent_id: lastL1.id })
      }
      load()
      showToast('Compliance data imported.', 'success')
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const save = async (id) => {
    const isL2 = form.parent_id !== null && form.parent_id !== undefined
    const payload = {
      project_id:  project.id,
      permit_name: form.permit_name?.trim(),
      status:      isL2 ? form.status : undefined, // L1 with children: derived; L1 without: manual
      remarks:     form.remarks?.trim() || null,
      parent_id:   form.parent_id ?? null,
    }
    if (!payload.permit_name) return
    // For L1 saves, always include status (it may have no children yet)
    if (!isL2) payload.status = form.status
    const { error } = id
      ? await supabase.from('project_permits').update(payload).eq('id', id)
      : await supabase.from('project_permits').insert({ ...payload, sort_order: rows.filter(r => !r.parent_id).length })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success')
    setAddingTo(null); setEditId(null)
    load(); fetchAllPermitNames()
  }

  const del = async (id) => {
    // children are cascade-deleted by DB (ON DELETE CASCADE)
    await supabase.from('project_permits').delete().eq('id', id)
    load(); fetchAllPermitNames()
  }

  const saveAndSync = async (id) => {
    const payload = {
      project_id:  project.id,
      permit_name: form.permit_name?.trim(),
      status:      form.status,
      remarks:     form.remarks?.trim() || null,
      parent_id:   form.parent_id ?? null,
    }
    if (!payload.permit_name) return
    const { error } = id
      ? await supabase.from('project_permits').update(payload).eq('id', id)
      : await supabase.from('project_permits').insert({ ...payload, sort_order: rows.length })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success')
    setAddingTo(null); setEditId(null)
    load(); fetchAllPermitNames()
  }

  // Build tree: L1s with children array
  const l1s = useMemo(() => rows.filter(r => !r.parent_id), [rows])
  const childrenOf = useMemo(() => {
    const map = {}
    rows.filter(r => r.parent_id).forEach(r => {
      if (!map[r.parent_id]) map[r.parent_id] = []
      map[r.parent_id].push(r)
    })
    return map
  }, [rows])

  const displayStatus = (l1) => l1.status

  const filteredL1s = useMemo(() => {
    if (filterStatus === 'all') return l1s
    return l1s.filter(l1 => l1.status === filterStatus)
  }, [l1s, filterStatus])

  const toggleCollapse = (id) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const totalL1 = l1s.length
  const totalL2 = rows.filter(r => r.parent_id).length
  const selectCls = 'text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#ed6055]'
  const COLS = isAdmin ? 4 : 3

  if (loading) {
    return <TriangleLoader label={populating ? 'Setting up permits from standard list…' : 'Loading permits…'} />
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />
        <SectionHeader sticky title="Permits &amp; Licensing" action={
          <div className="flex items-center gap-2">
            <ExcelButtons onExport={handleExport} onImport={handleImport} importing={importing} />
            {isAdmin && (
              <button
                onClick={() => { setForm(blank(null)); setShowAddModal(true) }}
                className="text-xs font-semibold px-3 py-1.5 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1"
              >
                <PlusIcon /> Add Permit
              </button>
            )}
          </div>
        } />
      </div>

      {/* Progress bar + filter pills */}
      {rows.length > 0 && (() => {
        const total      = l1s.length
        const doneCnt    = l1s.filter(l => l.status === 'done').length
        const ongoingCnt = l1s.filter(l => l.status === 'ongoing').length
        const donePct    = total ? (doneCnt / total) * 100 : 0
        const ongoingPct = total ? (ongoingCnt / total) * 100 : 0
        return (
          <>
            <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 mb-3">
              <div className="h-full flex">
                <div style={{ width: donePct + '%' }} className="bg-green-400 transition-all duration-500" />
                <div style={{ width: ongoingPct + '%' }} className="bg-yellow-400 transition-all duration-500" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {[{ key: 'all', label: 'All', dot: null }, ...PERMIT_STATUSES].map(s => {
                const count  = s.key === 'all' ? l1s.length : l1s.filter(l => l.status === s.key).length
                const active = filterStatus === s.key
                return (
                  <button key={s.key} onClick={() => setFilterStatus(s.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition"
                    style={active
                      ? { background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)', color: '#fff' }
                      : { background: '#e5e7eb', color: '#6b7280' }}
                  >
                    {s.dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot} ${active ? 'opacity-70' : ''}`} />}
                    {s.label}
                    <span className={`text-[10px] font-bold px-1 rounded ${active ? 'bg-white/20 text-white' : 'bg-gray-300/60 text-gray-500'}`}>{count}</span>
                  </button>
                )
              })}
              <span className="ml-auto text-[11px] text-gray-400">
                {totalL1} permit{totalL1 !== 1 ? 's' : ''}{totalL2 > 0 ? `, ${totalL2} sub-item${totalL2 !== 1 ? 's' : ''}` : ''}
              </span>
            </div>
          </>
        )
      })()}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#fff', borderTop: '2px solid #ed6055', borderBottom: '1px solid #e5e7eb' }}>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-700 w-72">Permit / Requirement</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-700 w-36">Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-700">Remarks</th>
              {isAdmin && <th className="px-4 py-3 w-20" />}
            </tr>
          </thead>
          <tbody>
            {filteredL1s.length === 0 && addingTo !== 'root' && (
              <tr><td colSpan={COLS} className="text-center py-12 text-sm text-gray-400 italic">
                {rows.length === 0 ? 'No permits recorded yet.' : 'No permits match the selected filter.'}
              </td></tr>
            )}

            {filteredL1s.map(l1 => {
              const children  = childrenOf[l1.id] ?? []
              const hasKids   = children.length > 0
              const isCollapsed = collapsed.has(l1.id)
              const derivedSt = displayStatus(l1)
              const stCfg     = PERMIT_STATUS_MAP[derivedSt] ?? PERMIT_STATUS_MAP['not_yet_started']

              return (
                <Fragment key={l1.id}>
                  {/* -- L1 row -- */}
                  {editId === l1.id ? (
                    <tr className="bg-[#ed6055]/[0.03] border-t border-gray-100">
                      <td className="px-4 py-2">
                        <PermitCombobox value={form.permit_name} onChange={v => setForm(p => ({ ...p, permit_name: v }))} options={allPermitNames} />
                      </td>
                      <td className="px-4 py-2">
                        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={selectCls}>
                          {PERMIT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2"><textarea value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional remarks" rows={2} className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#ed6055] bg-white resize-y" /></td>
                      {isAdmin && <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => saveAndSync(l1.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </td>}
                    </tr>
                  ) : (
                    <tr className="permit-row border-t border-gray-100 hover:bg-gray-50/40 transition" style={{ background: 'rgba(237,96,85,0.025)' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Collapse toggle */}
                          {hasKids ? (
                            <button onClick={() => toggleCollapse(l1.id)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition">
                              <svg className="w-3.5 h-3.5 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          ) : (
                            <span className="w-3.5 flex-shrink-0" />
                          )}
                          <div className="w-1.5 h-1.5 rounded-full bg-[#ed6055] flex-shrink-0" />
                          <span className="text-xs font-bold text-gray-900">{l1.permit_name}</span>
                          {hasKids && (
                            <span className="text-[10px] font-bold text-white bg-[#ed6055] rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">{children.length}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${stCfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stCfg.dot}`} />
                          {stCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{l1.remarks || '--'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="permit-actions flex items-center gap-1">
                            <button
                              title="Add sub-requirement"
                              onClick={() => { setForm(blank(l1.id)); setShowAddModal(true) }}
                              className="p-1 text-gray-400 hover:text-[#ed6055] transition"
                            >
                              <PlusIcon />
                            </button>
                            <button onClick={() => { setForm({ permit_name: l1.permit_name, status: l1.status, remarks: l1.remarks ?? '', parent_id: null }); setEditId(l1.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                            <button onClick={() => setDeleteId(l1.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )}

                  {/* -- L2 rows -- */}
                  {!isCollapsed && children.map((child, idx) => (
                    editId === child.id ? (
                      <tr key={child.id} className="border-t border-gray-100 bg-gray-50/60">
                        <td className="pl-12 pr-4 py-2">
                          <PermitCombobox value={form.permit_name} onChange={v => setForm(p => ({ ...p, permit_name: v }))} options={allPermitNames} />
                        </td>
                        <td className="px-4 py-2">
                          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={selectCls}>
                            {PERMIT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2"><textarea value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional remarks" rows={2} className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#ed6055] bg-white resize-y" /></td>
                        {isAdmin && <td className="px-4 py-2 whitespace-nowrap">
                          <button onClick={() => saveAndSync(child.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </td>}
                      </tr>
                    ) : (
                      <tr key={child.id} className="permit-row border-t border-gray-50 bg-gray-50/40 hover:bg-gray-50 transition">
                        <td className="pl-12 pr-4 py-2.5 border-l-2 border-[#ed6055]/10">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-px bg-gray-300 flex-shrink-0" />
                            <span className="text-xs text-gray-700 font-medium">{child.permit_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${PERMIT_STATUS_MAP[child.status]?.badge ?? 'bg-gray-100 text-gray-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PERMIT_STATUS_MAP[child.status]?.dot ?? 'bg-gray-400'}`} />
                            {PERMIT_STATUS_MAP[child.status]?.label ?? child.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{child.remarks || '--'}</td>
                        {isAdmin && (
                          <td className="px-4 py-2.5">
                            <div className="permit-actions flex items-center gap-1">
                              <button onClick={() => { setForm({ permit_name: child.permit_name, status: child.status, remarks: child.remarks ?? '', parent_id: child.parent_id }); setEditId(child.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                              <button onClick={() => setDeleteId(child.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  ))}

                </Fragment>
              )
            })}

          </tbody>
        </table>
      </div>

      {/* -- Add Permit Modal -- */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-black">Add Permit / Requirement</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            {(() => {
              // Standards not yet in this project
              const existingNames = new Set(rows.map(r => r.permit_name))
              const stdL1s = standards.filter(s => !s.parent_id)
              const stdChildrenOf = {}
              standards.filter(s => s.parent_id).forEach(s => {
                if (!stdChildrenOf[s.parent_id]) stdChildrenOf[s.parent_id] = []
                stdChildrenOf[s.parent_id].push(s)
              })
              // Available: standards whose name is not already in project under same parent context
              const availableL1s = stdL1s.filter(s => !existingNames.has(s.permit_name))
              const selectedStdL1 = form.parent_id
                ? null
                : stdL1s.find(s => s.permit_name === form.permit_name)
              const availableL2s = selectedStdL1
                ? (stdChildrenOf[selectedStdL1.id] ?? []).filter(s => !existingNames.has(s.permit_name))
                : []

              return (
                <div className="px-6 py-5 space-y-4">
                  {/* Select from standard permits */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Select permit</label>
                    <select
                      value={form.parent_id ? '' : form.permit_name ?? ''}
                      onChange={e => {
                        const name = e.target.value
                        setForm(p => ({ ...p, permit_name: name, parent_id: null }))
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] text-black"
                    >
                      <option value="">-- Choose a Level 1 permit --</option>
                      {availableL1s.map(s => (
                        <option key={s.id} value={s.permit_name}>{s.permit_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sub-requirement (only if the selected L1 standard has L2 children available) */}
                  {availableL2s.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                        Add as sub-requirement of <span className="text-black">{form.permit_name}</span> <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <select
                        value={form.parent_id ? form.permit_name : ''}
                        onChange={e => {
                          const name = e.target.value
                          // Find the project L1 row that matches the standard L1
                          const projectL1 = rows.find(r => !r.parent_id && r.permit_name === selectedStdL1.permit_name)
                          setForm(p => ({
                            ...p,
                            permit_name: name || selectedStdL1.permit_name,
                            parent_id: name ? (projectL1?.id ?? null) : null,
                          }))
                        }}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] text-black"
                      >
                        <option value="">-- None (add as Level 1) --</option>
                        {availableL2s.map(s => (
                          <option key={s.id} value={s.permit_name}>{s.permit_name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400">
                    {form.parent_id
                      ? 'This will be added as a sub-requirement (Level 2).'
                      : form.permit_name
                        ? 'This will be added as a top-level permit (Level 1).'
                        : 'Select a permit from the list above.'}
                  </p>

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] text-black"
                    >
                      {PERMIT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Remarks <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea
                      value={form.remarks ?? ''}
                      onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                      placeholder="Add any notes…"
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] text-black placeholder-gray-400 resize-y"
                    />
                  </div>
                </div>
              )
            })()}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition">Cancel</button>
              <button
                onClick={async () => {
                  if (!form.permit_name?.trim()) return
                  await saveAndSync(null)
                  setShowAddModal(false)
                }}
                className="px-4 py-2 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition"
              >
                Add Permit
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <ConfirmDeleteModal
          onConfirm={async () => {
            const target = rows.find(r => r.id === deleteId)
            await del(deleteId)
            // If deleting a L2, sync parent after deletion
            if (target?.parent_id) load()
            setDeleteId(null)
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}


// -- Issues & Concerns Tab -----------------------------------------------------

const ISSUE_STATUS_MAP_OUT = { open: 'Open', close: 'Close', hold: 'Hold' }
const ISSUE_STATUS_MAP_IN  = { Open: 'open', Close: 'close', Hold: 'hold' }

function IssuesTab({ project, isAdmin, profile, showToast, search = '', onSearchChange, filterStatus = 'all', onFilterStatusChange, filterGroup = 'all', onFilterGroupChange, filterMgmtLevel = 'all', onFilterMgmtLevelChange, showAdd = false, onShowAddChange, onRegisterFns }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)   // 'view' | 'add' | 'edit' | 'delete'
  const [active, setActive]   = useState(null)
  const [form, setForm]       = useState(ISSUE_EMPTY)
  const [saving, setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [importing, setImporting]             = useState(false)
  const [importErrors, setImportErrors]       = useState([])
  const [agingFilter, setAgingFilter]         = useState(null)  // null | 15 | 30

  const handleExport = async () => {
    await downloadWorkbook([{
      sheetName: 'Issues',
      rows: rows.map(r => ({
        issue_group:       r.issue_group       ?? '',
        management_level:  r.management_level  ?? '',
        status:            ISSUE_STATUS_MAP_OUT[r.status] ?? r.status,
        date_presented:    r.date_presented    ?? '',
        details:           r.details           ?? '',
        caused_by:         r.caused_by         ?? '',
        action_steps: r.action_steps ?? '',
      })),
      columns: [
        { key: 'issue_group',       header: 'Issue Group' },
        { key: 'management_level',  header: 'Management Level' },
        { key: 'status',            header: 'Status' },
        { key: 'date_presented',    header: 'Date Presented' },
        { key: 'details',           header: 'Details' },
        { key: 'caused_by',         header: 'Caused By' },
        { key: 'action_steps', header: 'Action Steps' },
      ],
    }], `${project.name}_issues.xlsx`)
  }

  const handleImport = async (file) => {
    if (!window.confirm('This will replace all Issues & Concerns for this project. Continue?')) return
    setImporting(true)
    setImportErrors([])
    try {
      const sheets  = await parseWorkbook(file)
      const pid     = project.id
      const rawRows = sheets['Issues'] ?? Object.values(sheets)[0] ?? []
      const newRows = rawRows.map(r => ({
        project_id:        pid,
        issue_group:       String(r['Issue Group']       ?? '').trim() || null,
        management_level:  String(r['Management Level']  ?? '').trim() || null,
        status:            ISSUE_STATUS_MAP_IN[r['Status']] ?? 'open',
        date_presented:    toDateStr(r['Date Presented']),
        details:           String(r['Details']           ?? '').trim(),
        caused_by:         String(r['Caused By']         ?? '').trim() || null,
        action_steps: String(r['Action Steps'] ?? '').trim() || null,
      })).filter(r => r.details)
      const errors = []
      rawRows.forEach((r, i) => {
        if (!String(r['Details'] ?? '').trim()) return
        if (r['Date Presented'] && !isValidRawDate(r['Date Presented'])) errors.push(`Row ${i + 2}: Date Presented is not a valid calendar date.`)
      })
      if (errors.length > 0) { setImportErrors(errors); return }
      await supabase.from('issues').delete().eq('project_id', pid)
      if (newRows.length > 0) await supabase.from('issues').insert(newRows)
      load()
      showToast('Issues imported.', 'success')
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => { onRegisterFns?.({ export: handleExport, import: handleImport }) })

  useEffect(() => { if (showAdd) { openAdd(); onShowAddChange?.(false) } }, [showAdd])

  useEffect(() => { load() }, [project.id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('issues')
      .select('id, issue_group, management_level, status, date_presented, details, caused_by, action_steps, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  const openView = (row) => { setActive(row); setModal('view') }
  const openAdd  = ()    => { setForm(ISSUE_EMPTY); setModal('add') }
  const openEdit = (row) => {
    setActive(row)
    setForm({
      issue_group:       row.issue_group       ?? '',
      management_level:  row.management_level  ?? '',
      status:            row.status            ?? 'open',
      date_presented:    row.date_presented    ?? '',
      date_bad:          false,
      details:           row.details           ?? '',
      caused_by:         row.caused_by         ?? '',
      action_steps: row.action_steps ?? '',
    })
    setModal('edit')
  }
  const close = () => { setModal(null); setActive(null) }

  const save = async () => {
    if (!form.details.trim()) return
    if (form.date_bad || (form.date_presented && !isValidDate(form.date_presented))) {
      showToast('Date Presented is not a valid calendar date.', 'error'); return
    }
    setSaving(true)
    const payload = {
      project_id:        project.id,
      issue_group:       form.issue_group       || null,
      management_level:  form.management_level  || null,
      status:            form.status,
      date_presented:    form.date_presented    || null,
      details:           form.details.trim(),
      caused_by:         form.caused_by.trim()         || null,
      action_steps: form.action_steps.trim() || null,
    }
    const { error } = modal === 'add'
      ? await supabase.from('issues').insert([payload])
      : await supabase.from('issues').update(payload).eq('id', active.id)
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast(modal === 'add' ? 'Issue added.' : 'Issue updated.')
    close(); load()
  }

  const del = async () => {
    setSaving(true)
    const { error } = await supabase.from('issues').delete().eq('id', deleteId)
    setSaving(false)
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return }
    showToast('Issue deleted.')
    setDeleteId(null); load()
  }

  const filtered = rows.filter(r => {
    const matchStatus    = filterStatus    === 'all' || r.status           === filterStatus
    const matchGroup     = filterGroup     === 'all' || r.issue_group      === filterGroup
    const matchMgmtLevel = filterMgmtLevel === 'all' || r.management_level === filterMgmtLevel
    const aging          = issueAgingDays(r.date_presented)
    const matchAging     = agingFilter === null || (aging !== null && aging >= agingFilter)
    const q = search.toLowerCase()
    const matchSearch = !q || (r.details ?? '').toLowerCase().includes(q) || (r.caused_by ?? '').toLowerCase().includes(q) || (r.action_steps ?? '').toLowerCase().includes(q)
    return matchStatus && matchGroup && matchMgmtLevel && matchAging && matchSearch
  })
  const activeFilterCount = [filterStatus !== 'all', filterGroup !== 'all', filterMgmtLevel !== 'all'].filter(Boolean).length
  const hasFilter = activeFilterCount > 0 || search !== ''
  const clearFilters = () => { onFilterStatusChange?.('all'); onFilterGroupChange?.('all'); onFilterMgmtLevelChange?.('all'); onSearchChange?.('') }

  const iCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent'
  const fCls = 'flex-1 min-w-[110px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]'
  const isForm = modal === 'add' || modal === 'edit'

  const total = rows.length
  const countOpen    = rows.filter(r => r.status === 'open').length
  const countClose   = rows.filter(r => r.status === 'close').length
  const countHold    = rows.filter(r => r.status === 'hold').length
  const countAging15 = rows.filter(r => { const d = issueAgingDays(r.date_presented); return d !== null && d >= 15 }).length
  const countAging30 = rows.filter(r => { const d = issueAgingDays(r.date_presented); return d !== null && d >= 30 }).length

  const ISSUE_CARDS = [
    { label: 'Open',      value: countOpen,    color: '#f87171', filterKey: 'open'  },
    { label: 'Closed',    value: countClose,   color: '#34d399', filterKey: 'close' },
    { label: 'On Hold',   value: countHold,    color: '#fbbf24', filterKey: 'hold'  },
    { label: '> 15 Days', value: countAging15, color: '#fb923c', filterKey: 'aging15' },
    { label: '> 30 Days', value: countAging30, color: '#f87171', filterKey: 'aging30' },
  ]

  return (
    <div className="pt-4 px-3 sm:px-6">
      {/* Summary cards */}
      {!loading && rows.length > 0 && (
        <div className="relative -mx-3 sm:mx-0 mb-4 max-w-7xl sm:mx-auto">
          <div className="flex gap-3 overflow-x-auto py-2 px-3 sm:grid sm:grid-cols-5 sm:overflow-visible sm:py-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {ISSUE_CARDS.map(({ label, value, color, filterKey }) => {
              const pct  = total > 0 ? Math.round((value / total) * 100) : 0
              const size = 52, sw = 4, r = (size - sw) / 2
              const circ = 2 * Math.PI * r
              const dash = (pct / 100) * circ
              const isAging  = filterKey === 'aging15' || filterKey === 'aging30'
              const agingVal = filterKey === 'aging15' ? 15 : filterKey === 'aging30' ? 30 : null
              const active   = isAging ? agingFilter === agingVal : filterKey && filterStatus === filterKey
              return (
                <button
                  key={label}
                  onClick={() => {
                    if (isAging) setAgingFilter(active ? null : agingVal)
                    else if (filterKey) onFilterStatusChange?.(active ? 'all' : filterKey)
                  }}
                  className={`flex-none w-36 sm:w-auto text-left rounded-xl border p-4 transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/60 ${
                    active
                      ? 'bg-white border-transparent ring-2 ring-[#ed6055] shadow-xl'
                      : 'bg-white border-gray-100 shadow-md hover:shadow-xl hover:-translate-y-1'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
                    </div>
                    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
                      <text x={size/2} y={size/2} dominantBaseline="middle" textAnchor="middle"
                        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: 10, fontWeight: 700, fill: color }}>
                        {pct}%
                      </text>
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 max-w-7xl mx-auto">
        {importErrors.length > 0 && (
          <div className="px-4 pt-3 pb-0 border-b border-gray-100">
            <ImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />
          </div>
        )}

        <div className="px-4 pt-3 pb-4">

      {loading ? (
        <TriangleLoader label="Loading issues…" />
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 italic">No issues recorded for this project.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-xs text-gray-400 italic">No issues match the selected filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-xl overflow-hidden">
            <thead>
              <tr className="sticky top-0 z-10 bg-gray-600 border-b border-gray-700">
                {['No.', 'Issue', 'Group', 'Management Level', 'Status', 'Date Presented', 'Days Aging'].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-bold text-gray-200 ${h === 'Management Level' || h === 'Group' || h === 'Days Aging' ? 'whitespace-normal text-center' : h === 'Issue' ? 'text-left w-full' : 'text-left whitespace-nowrap'}`}>
                    {h === 'Days Aging' ? <><span>Days</span><br /><span>Aging</span></> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row, idx) => {
                const sc    = ISSUE_STATUS_CONFIG[row.status] ?? ISSUE_STATUS_CONFIG.open
                const aging = issueAgingDays(row.date_presented)
                return (
                  <tr key={row.id} onClick={() => openView(row)} className="hover:bg-gray-50/60 cursor-pointer">
                    <td className="px-4 py-4 text-gray-400 whitespace-nowrap tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-4 text-black w-full"><p className="line-clamp-2">{row.details}</p></td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-center">{row.issue_group || '--'}</td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-center">{row.management_level || '--'}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{fmtIssueDate(row.date_presented)}</td>
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-center tabular-nums">
                      {aging !== null ? `${aging}d` : '--'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-2 text-right">
          {filtered.length} of {rows.length} issue{rows.length !== 1 ? 's' : ''}
        </p>
      )}

        </div>{/* end px-4 pb-4 */}
      </div>{/* end white card */}

      {/* View modal */}
      {modal === 'view' && active && (() => {
        const sc    = ISSUE_STATUS_CONFIG[active.status] ?? ISSUE_STATUS_CONFIG.open
        const aging = issueAgingDays(active.date_presented)
        return createPortal(
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/10 backdrop-blur-sm sm:p-4" onClick={close}>
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl flex flex-col overflow-hidden"
              style={{ maxHeight: '78dvh', borderTop: '4px solid #ed6055' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1 h-5 rounded-full bg-[#ed6055] flex-shrink-0" />
                  <h3 className="text-base font-bold text-black truncate">Issue Detail</h3>
                  <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${sc.cls}`}>{sc.label}</span>
                </div>
                <button onClick={close} className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 active:scale-[0.95] transition flex-shrink-0"><XIcon /></button>
              </div>

              {/* Meta strip */}
              <div className="px-6 py-3 border-b border-gray-100 grid grid-cols-4 gap-4 bg-gray-50 flex-shrink-0">
                {[
                  { label: 'Group',            value: active.issue_group },
                  { label: 'Management Level', value: active.management_level },
                  { label: 'Date Presented',   value: fmtIssueDate(active.date_presented) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{value || <span className="text-gray-300 italic font-normal">--</span>}</p>
                  </div>
                ))}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Days Aging</p>
                  {aging !== null ? (
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                      aging >= 30 ? 'bg-red-50 text-red-600 border border-red-100' :
                      aging >= 15 ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      'text-gray-800'
                    }`}>{aging} day{aging !== 1 ? 's' : ''}</span>
                  ) : <span className="text-sm text-gray-300 italic font-normal">--</span>}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-6">
                {[
                  { label: 'Issue',        value: active.details },
                  { label: 'Caused By',    value: active.caused_by },
                  { label: 'Action Steps', value: active.action_steps },
                ].filter(s => s.value).map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{value}</p>
                  </div>
                ))}
                {!active.details && !active.caused_by && !active.action_steps && (
                  <p className="text-sm text-gray-300 italic">No details recorded.</p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                <div className="flex gap-2">
                  {(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
                    <>
                      <button onClick={() => { openEdit(active) }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition">
                        <PencilIcon /> Edit
                      </button>
                      <button onClick={() => { setDeleteId(active.id); close() }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-red-100 text-red-500 hover:bg-red-50 active:scale-[0.97] transition">
                        <TrashIcon /> Delete
                      </button>
                    </>
                  )}
                </div>
                <button onClick={close}
                  className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-black active:scale-[0.97] transition">
                  Close
                </button>
              </div>
            </div>
          </div>
        , document.body)
      })()}

      {/* Add / Edit modal */}
      {isForm && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[78vh] overflow-hidden"
            style={{ borderTop: '4px solid #ed6055' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold text-black">{modal === 'add' ? 'Add Issue' : 'Edit Issue'}</h3>
              <button onClick={close} className="text-gray-400 hover:text-black transition"><XIcon /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Group</label>
                <SelectDropdown
                  options={[{ value: '', label: '-- Select Group --' }, ...ISSUE_GROUPS.map(g => ({ value: g, label: g }))]}
                  value={form.issue_group}
                  onChange={v => setForm(f => ({ ...f, issue_group: v }))}
                  placeholder="-- Select Group --"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Management Level</label>
                <SelectDropdown
                  options={[{ value: '', label: '-- Select Level --' }, ...MANAGEMENT_LEVELS.map(l => ({ value: l, label: l }))]}
                  value={form.management_level}
                  onChange={v => setForm(f => ({ ...f, management_level: v }))}
                  placeholder="-- Select Level --"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                  <SelectDropdown
                    options={Object.entries(ISSUE_STATUS_CONFIG).map(([val, cfg]) => ({ value: val, label: cfg.label }))}
                    value={form.status}
                    onChange={v => setForm(f => ({ ...f, status: v }))}
                    placeholder="-- Select Status --"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date Presented</label>
                  <input type="date" value={form.date_presented} onChange={e => setForm(f => ({ ...f, date_presented: e.target.value, date_bad: e.target.validity.badInput }))} className={`${iCls} ${(form.date_bad || (form.date_presented && !isValidDate(form.date_presented))) ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400 focus:border-transparent' : ''}`} />
                  {(form.date_bad || (form.date_presented && !isValidDate(form.date_presented))) && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Issue <span className="text-[#ed6055]">*</span></label>
                <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} placeholder="Describe the issue…" className={iCls} style={{ fieldSizing: 'content', minHeight: '80px', resize: 'none' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Caused By</label>
                <textarea value={form.caused_by} onChange={e => setForm(f => ({ ...f, caused_by: e.target.value }))} placeholder="Root cause…" className={iCls} style={{ fieldSizing: 'content', minHeight: '80px', resize: 'none' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Action Steps</label>
                <textarea value={form.action_steps} onChange={e => setForm(f => ({ ...f, action_steps: e.target.value }))} placeholder="Steps taken or planned…" className={iCls} style={{ fieldSizing: 'content', minHeight: '80px', resize: 'none' }} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={close} className="px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={save} disabled={saving || !form.details.trim()}
                className="px-5 py-2 text-sm font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] disabled:opacity-50 disabled:cursor-not-allowed transition">
                {saving ? 'Saving…' : modal === 'add' ? 'Add Issue' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Delete confirm */}
      {deleteId !== null && (
        <ConfirmDeleteModal
          onConfirm={del}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// -- Completion Tab ------------------------------------------------------------

const isValidDate = (str) => {
  if (!str) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
  const d = new Date(str + 'T00:00:00')
  if (isNaN(d.getTime())) return false
  const [y, m, day] = str.split('-').map(Number)
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
}

// Validates a raw Excel cell value (Date object or string) before toDateStr auto-corrects it.
const isValidRawDate = (val) => {
  if (!val && val !== 0) return true
  if (val instanceof Date) return !isNaN(val.getTime())
  if (typeof val !== 'string') return true
  const s = val.trim()
  if (!s) return true
  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, yr, mon, dy] = isoMatch.map(Number)
    const dt = new Date(yr, mon - 1, dy)
    return dt.getFullYear() === yr && dt.getMonth() + 1 === mon && dt.getDate() === dy
  }
  // M/D/YYYY or MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdyMatch) {
    let [, mon, dy, yr] = mdyMatch.map(Number)
    if (yr < 100) yr += 2000
    const dt = new Date(yr, mon - 1, dy)
    return dt.getFullYear() === yr && dt.getMonth() + 1 === mon && dt.getDate() === dy
  }
  return true
}

const cellKey = (type, floorId, unitNum) => `${type}:${floorId}:${unitNum}`

const UNIT_STATUS_CONFIG = {
  none:        { label: 'Not Started',  cell: 'bg-gray-50 text-gray-400 border-gray-200',       dot: 'bg-gray-300' },
  in_progress: { label: 'In Progress',  cell: 'bg-yellow-200 text-yellow-800 border-yellow-300', dot: 'bg-yellow-400' },
  m4:          { label: 'M4 Complete',  cell: 'bg-green-100 text-green-700 border-green-200',    dot: 'bg-green-300' },
  m5:          { label: 'M5 Handover',  cell: 'bg-green-600 text-white border-green-700',        dot: 'bg-green-600' },
}

function UnitGrid({ floorList, cMap, maxU, type, emptyMsg, isAdmin, multiSelectMode, selectedCells, onToggleCell, onOpenCell, onFloorClick }) {
  if (floorList.length === 0) return (
    <p className="text-xs text-gray-400 italic py-4">{emptyMsg}</p>
  )
  return (
    <div className="rounded-xl overflow-hidden">
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-gray-600">
            <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-200 uppercase tracking-widest sticky left-0 bg-gray-600 z-10 min-w-[80px] border-r border-gray-500">Floor</th>
            {Array.from({ length: maxU }, (_, i) => (
              <th key={i} className="py-2 text-center text-[10px] font-semibold text-gray-300 tracking-wide" style={{ width: 44, minWidth: 44 }}>
                {String(i + 1).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {floorList.map(floor => (
            <tr key={floor.id} className="group">
              <td className="px-3 py-0 whitespace-nowrap sticky left-0 bg-gray-100 group-hover:bg-gray-150 z-10 border-t border-gray-200 border-r border-gray-300" style={{ height: 44 }}>
                <span
                  onClick={isAdmin ? () => onFloorClick(type, floor) : undefined}
                  title={isAdmin ? `Set status for ${/^\d+$/.test(floor.physical_level) ? floor.physical_level + 'F' : floor.physical_level}` : undefined}
                  className={`text-xs font-semibold transition-colors duration-150 ${isAdmin ? 'text-gray-600 hover:text-[#ed6055] cursor-pointer select-none' : 'text-gray-600'}`}
                >{/^\d+$/.test(floor.physical_level) ? `${floor.physical_level}F` : floor.physical_level}</span>
              </td>
              {Array.from({ length: maxU }, (_, i) => {
                const unitNum = i + 1
                if (unitNum > (floor.num_units ?? 0)) {
                  return <td key={i} className="p-0 border border-gray-100 bg-gray-100/40" style={{ width: 44, height: 44 }} />
                }
                const c = cMap[`${floor.id}-${unitNum}`]
                const status = c?.status ?? 'none'
                const cfg = UNIT_STATUS_CONFIG[status]
                const key = cellKey(type, floor.id, unitNum)
                const isSelected = multiSelectMode && selectedCells.has(key)
                return (
                  <td key={i} className="p-0 border border-gray-200 relative" style={{ width: 44, height: 44 }}>
                    <button
                      onClick={isAdmin ? (multiSelectMode ? () => onToggleCell(type, floor, unitNum) : () => onOpenCell(type, floor, unitNum)) : undefined}
                      title={`${floor.physical_level}-${String(unitNum).padStart(2, '0')} — ${cfg.label}`}
                      aria-label={`${type === 'parking' ? 'Parking' : 'Unit'} ${floor.physical_level}-${String(unitNum).padStart(2, '0')}: ${cfg.label}`}
                      className={`w-full h-full text-[10px] font-semibold tracking-wide transition-all duration-150 ease-out ${cfg.cell} ${isAdmin ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-2 ring-[#ed6055] ring-inset z-10 relative' : (isAdmin && !multiSelectMode ? 'hover:scale-[1.18] hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)] hover:z-10 hover:relative' : '')}`}
                    >
                      {String(unitNum).padStart(2, '0')}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}

// -- PhotosTab -----------------------------------------------------------------

const PHOTO_TAGS = ['Foundation', 'Structural', 'MEP', 'Finishing', 'Facade', 'Landscaping', 'Issues', 'Progress', 'Inspection']

function createThumbnail(file, maxSize = 400) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(resolve, 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

const fixEncoding = (str) => {
  if (!str) return str
  try { return decodeURIComponent(escape(str)) } catch { return str }
}

const fmtPhotoMonth = (ym) => {
  const d = new Date(ym + '-01T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2)
}

const fmtPhotoDate = (dateStr) => {
  if (!dateStr) return 'Unknown date'
  const d   = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const ymd = (dt) => dt.toISOString().slice(0, 10)
  if (ymd(d) === ymd(now)) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (ymd(d) === ymd(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// -- Upload Screen -------------------------------------------------------------

function UploadScreen({ project, showToast, onBack, onUploaded }) {
  const [files, setFiles]           = useState([])
  const [previews, setPreviews]     = useState([])
  const [uploadDate, setUploadDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [uploadTags, setUploadTags] = useState([])
  const [uploading, setUploading]   = useState(false)
  const [dragging, setDragging]     = useState(false)
  const fileRef = useRef(null)

  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  const addFiles = (fileList) => {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setFiles(prev => [...prev, ...imgs])
    setPreviews(prev => [...prev, ...imgs.map(f => URL.createObjectURL(f))])
  }

  const removeFile = (idx) => {
    URL.revokeObjectURL(previews[idx])
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const toggleTag = (tag) =>
    setUploadTags(t => t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag])

  const doUpload = async () => {
    if (!files.length) return
    setUploading(true)
    let ok = 0
    for (const file of files) {
      const ext  = file.name.split('.').pop().toLowerCase()
      const path = `${project.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('project-photos').upload(path, file)
      if (error) { showToast(`Failed: ${file.name}`, 'error'); continue }
      // Generate and upload thumbnail
      const thumbBlob = await createThumbnail(file)
      if (thumbBlob) {
        await supabase.storage.from('project-photos').upload(`thumbs/${path}`, thumbBlob, { contentType: 'image/jpeg' })
      }
      await supabase.from('project_photos').insert({
        project_id: project.id, storage_path: path, file_name: file.name,
        tags: uploadTags, photo_date: uploadDate,
      })
      ok++
    }
    setUploading(false)
    if (ok) { showToast(`${ok} photo${ok > 1 ? 's' : ''} uploaded`); onUploaded() }
  }

  return (
    <div className="py-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Photos
      </button>

      {/* Settings card */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-5 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Photo Date</p>
          <input type="date" value={uploadDate} max={new Date().toISOString().slice(0, 10)}
            max={new Date().toLocaleDateString('en-CA')}
            onChange={e => setUploadDate(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tags</p>
          <div className="flex flex-wrap gap-2">
            {PHOTO_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition ${uploadTags.includes(tag) ? 'bg-[#ed6055] text-white border-[#ed6055]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 cursor-pointer transition select-none ${dragging ? 'border-[#ed6055] bg-[#ed6055]/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
      >
        <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-medium text-gray-400">Drop photos here or <span className="text-[#ed6055]">browse</span></p>
        <p className="text-xs text-gray-300 mt-1">JPG, PNG, GIF, WebP</p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-3">{files.length} photo{files.length !== 1 ? 's' : ''} selected</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {files.map((file, i) => (
              <div key={i} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={previews[i]} alt={file.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
                <button onClick={() => removeFile(i)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <p className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[9px] text-white/80 bg-black/40 truncate opacity-0 group-hover:opacity-100 transition">{file.name}</p>
              </div>
            ))}
            <div onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 flex flex-col items-center justify-center cursor-pointer transition gap-1">
              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <p className="text-[10px] text-gray-300 font-medium">Add more</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button onClick={doUpload} disabled={!files.length || uploading}
          className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] disabled:opacity-50 transition">
          {uploading ? 'Uploading…' : `Upload ${files.length ? `${files.length} ` : ''}Photo${files.length !== 1 ? 's' : ''}`}
        </button>
        <button onClick={onBack} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
      </div>
    </div>
  )
}

// -- Photos Gallery ------------------------------------------------------------

function PhotosTab({ project, isAdmin, profile, showToast, search = '', onSearchChange, filterTags = [], onFilterTagsChange, filterMonth = '', onFilterMonthChange, sortOrder = 'newest', onSortOrderChange, showUpload = false, onShowUploadChange }) {
  const [photos, setPhotos]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [lightbox, setLightbox]           = useState(null)
  const [lbLoaded, setLbLoaded]           = useState(false)
  const [deletePhoto, setDeletePhoto]     = useState(null)
  const [slideDir, setSlideDir]           = useState('open')
  const [imgKey, setImgKey]               = useState(0)
  const showUploadScreen = showUpload
  const setShowUpload    = onShowUploadChange
  const setFilterMonth   = onFilterMonthChange
  const setFilterTags    = onFilterTagsChange
  const setSortOrder     = onSortOrderChange

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_photos')
      .select('*')
      .eq('project_id', project.id)
      .order('photo_date', { ascending: false })
    setPhotos(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [project.id])

  const getUrl = (path) =>
    supabase.storage.from('project-photos').getPublicUrl(path).data.publicUrl

  const getThumbnailUrl = (path) =>
    supabase.storage.from('project-photos').getPublicUrl(`thumbs/${path}`).data.publicUrl

  const months = useMemo(() => {
    const seen = new Set()
    photos.forEach(p => { const m = (p.photo_date ?? p.created_at)?.slice(0, 7); if (m) seen.add(m) })
    return [...seen].sort().reverse()
  }, [photos])

  const activeFilterCount = [!!filterMonth, filterTags.length > 0].filter(Boolean).length
  const filteredPhotos = useMemo(() => {
    const q = search.toLowerCase()
    const result = photos.filter(p => {
      if (filterMonth && !(p.photo_date ?? p.created_at)?.startsWith(filterMonth)) return false
      if (filterTags.length && !filterTags.every(t => (p.tags ?? []).includes(t))) return false
      if (q && !(p.file_name ?? '').toLowerCase().includes(q) && !(p.tags ?? []).some(t => t.toLowerCase().includes(q))) return false
      return true
    })
    result.sort((a, b) => {
      const da = a.photo_date ?? a.created_at?.slice(0, 10) ?? ''
      const db = b.photo_date ?? b.created_at?.slice(0, 10) ?? ''
      return sortOrder === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
    })
    return result
  }, [photos, filterMonth, filterTags, sortOrder])

  const groupedPhotos = useMemo(() => {
    const map = new Map()
    filteredPhotos.forEach((photo, idx) => {
      const day = photo.photo_date ?? photo.created_at?.slice(0, 10) ?? 'unknown'
      if (!map.has(day)) map.set(day, [])
      map.get(day).push({ ...photo, _flatIdx: idx })
    })
    return [...map.entries()].map(([day, items]) => ({ day, items }))
  }, [filteredPhotos])

  const handleDelete = (photo, e) => {
    e.stopPropagation()
    setDeletePhoto(photo)
  }

  const confirmDeletePhoto = async () => {
    if (!deletePhoto) return
    await supabase.storage.from('project-photos').remove([deletePhoto.storage_path])
    await supabase.from('project_photos').delete().eq('id', deletePhoto.id)
    showToast('Photo deleted')
    setDeletePhoto(null)
    setLightbox(null)
    load()
  }

  if (loading) return <TriangleLoader label="Loading photos…" />

  if (showUploadScreen) return (
    <UploadScreen project={project} showToast={showToast}
      onBack={() => setShowUpload(false)}
      onUploaded={() => { setShowUpload(false); load() }} />
  )

  const hasFilters = !!(filterMonth || filterTags.length || search)

  return (
    <div className="pt-4 px-3 sm:px-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 max-w-7xl mx-auto">
        {/* Grid */}
      <div className="px-4 py-4">
      {filteredPhotos.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
          {hasFilters ? (
            <>
              <p className="text-sm text-gray-400">No photos match the current filters</p>
              <button onClick={() => { setFilterMonth(''); setFilterTags([]); onSearchChange?.('') }} className="mt-2 text-xs text-[#ed6055] hover:underline">Clear filters</button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">No photos yet</p>
              {isAdmin && <p className="text-xs text-gray-400 mt-1">Click "Upload Photos" to get started</p>}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-4">
            {filteredPhotos.length}{hasFilters ? ` of ${photos.length}` : ''} photo{filteredPhotos.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-6">
            {groupedPhotos.map(({ day, items }) => (
              <div key={day}>
                <p className="text-sm font-semibold text-gray-700 mb-2.5">{fmtPhotoDate(day)}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map(photo => (
                    <div key={photo.id}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:-translate-y-1 hover:scale-[1.02] transition-all duration-200 ease-out"
                      style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.18)'; const img = new Image(); img.src = getUrl(photo.storage_path) }}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)'}
                      onClick={() => { setSlideDir('open'); setImgKey(k => k + 1); setLbLoaded(false); setLightbox(photo._flatIdx) }}>
                      <img
                        src={getThumbnailUrl(photo.storage_path)}
                        onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = getUrl(photo.storage_path) }}
                        alt={fixEncoding(photo.file_name)}
                        loading="lazy"
                        className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                      />
                      {(photo.tags ?? []).length > 0 && (
                        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                          {(photo.tags ?? []).slice(0, 2).map(tag => (
                            <span key={tag} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-sm leading-none">{tag}</span>
                          ))}
                          {(photo.tags ?? []).length > 2 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white leading-none">+{(photo.tags ?? []).length - 2}</span>
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-end">
                        <p className="px-2 pb-2 text-[10px] text-white font-medium opacity-0 group-hover:opacity-100 transition truncate w-full drop-shadow">{fixEncoding(photo.file_name)}</p>
                      </div>
                      {(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
                        <button onClick={e => handleDelete(photo, e)}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
                          title="Delete photo">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lightbox */}
      {lightbox !== null && filteredPhotos[lightbox] && createPortal(
        <div className="lb-backdrop fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition"
            onClick={() => setLightbox(null)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {lightbox > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition"
              onClick={e => { e.stopPropagation(); setSlideDir('prev'); setImgKey(k => k + 1); setLbLoaded(false); setLightbox(l => l - 1) }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          {lightbox < filteredPhotos.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition"
              onClick={e => { e.stopPropagation(); setSlideDir('next'); setImgKey(k => k + 1); setLbLoaded(false); setLightbox(l => l + 1) }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
          <div className="relative flex items-center justify-center max-w-[88vw] max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* Thumbnail placeholder — visible until full-size loads */}
            {!lbLoaded && (
              <img
                src={getThumbnailUrl(filteredPhotos[lightbox].storage_path)}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-contain rounded-lg blur-sm scale-105 opacity-60"
              />
            )}
            <img
              key={imgKey}
              src={getUrl(filteredPhotos[lightbox].storage_path)}
              alt={fixEncoding(filteredPhotos[lightbox].file_name)}
              onLoad={() => setLbLoaded(true)}
              className={`relative max-w-[88vw] max-h-[80vh] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${lbLoaded ? 'opacity-100' : 'opacity-0'} ${slideDir === 'next' ? 'lb-slide-next' : slideDir === 'prev' ? 'lb-slide-prev' : 'lb-img-open'}`}
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            {(filteredPhotos[lightbox].tags ?? []).length > 0 && (
              <div className="flex gap-1.5 flex-wrap justify-center">
                {(filteredPhotos[lightbox].tags ?? []).map(tag => (
                  <span key={tag} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#ed6055]/80 text-white backdrop-blur-sm">{tag}</span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-black/40 backdrop-blur-sm">
              <span className="text-xs text-white/70 max-w-[200px] truncate">{fixEncoding(filteredPhotos[lightbox].file_name)}</span>
              <span className="text-xs text-white/40">·</span>
              <span className="text-xs text-white/50">{lightbox + 1} / {filteredPhotos.length}</span>
              {(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
                <>
                  <span className="text-xs text-white/40">·</span>
                  <button onClick={e => handleDelete(filteredPhotos[lightbox], e)}
                    className="text-xs text-red-400 hover:text-red-300 transition font-medium">Delete</button>
                </>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      </div>{/* end grid padding */}
      {deletePhoto && (
        <ConfirmDeleteModal
          onConfirm={confirmDeletePhoto}
          onCancel={() => setDeletePhoto(null)}
        />
      )}
      </div>{/* end white card */}
    </div>
  )
}

function CompletionTab({ project, isAdmin, profile, showToast }) {
  const canEdit = isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser'
  const [buildingId, setBuildingId]                 = useState(null)
  const [floors, setFloors]                         = useState([])
  const [completions, setCompletions]               = useState([])
  const [parkingFloors, setParkingFloors]           = useState([])
  const [parkingCompletions, setParkingCompletions] = useState([])
  const [loading, setLoading]                       = useState(true)
  const [selected, setSelected]                     = useState(null)  // { type:'unit'|'parking', floor, unitNum, existing }
  const [cellForm, setCellForm]                     = useState({ status: 'none', m4_date: '', m5_date: '', m4_bad: false, m5_bad: false })
  const [saving, setSaving]                         = useState(false)
  const [multiSelectMode, setMultiSelectMode]       = useState(false)
  const [selectedCells, setSelectedCells]           = useState(new Set())
  const [bulkModal, setBulkModal]                   = useState(false)
  const [bulkForm, setBulkForm]                     = useState({ status: 'none', m4_date: '', m5_date: '', m4_bad: false, m5_bad: false })
  const [bulkSaving, setBulkSaving]                 = useState(false)
  const [floorModal, setFloorModal]                 = useState(null)  // { type, floor, stats:{none,in_progress,m4,m5}, total }
  const [floorModalStatus, setFloorModalStatus]     = useState('none')
  const [floorModalDate, setFloorModalDate]         = useState('')
  const [floorModalDateBad, setFloorModalDateBad]   = useState(false)
  const [floorModalSaving, setFloorModalSaving]     = useState(false)
  const [productType, setProductType]               = useState(null)  // null=both, 'unit', 'parking'

  const sortFloors = arr =>[...(arr ?? [])].sort((a, b) => {
    const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.physical_level.localeCompare(b.physical_level)
  })

  const loadAll = async () => {
    setLoading(true)
    let fq  = supabase.from('project_floors').select('*').eq('project_id', project.id)
    let pfq = supabase.from('project_parking_floors').select('*').eq('project_id', project.id)
    if (buildingId) { fq = fq.eq('building_id', buildingId); pfq = pfq.eq('building_id', buildingId) }
    const [fData, cData, pfData, pcData] = await Promise.all([
      fetchAll(() => fq),
      fetchAll(() => supabase.from('project_unit_completion').select('*').eq('project_id', project.id)),
      fetchAll(() => pfq),
      fetchAll(() => supabase.from('project_parking_unit_completion').select('*').eq('project_id', project.id)),
    ])
    setFloors(sortFloors(fData))
    setCompletions(cData)
    setParkingFloors(sortFloors(pfData))
    setParkingCompletions(pcData)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [project.id, buildingId])

  const completionMap = useMemo(() => {
    const map = {}
    completions.forEach(c => { map[`${c.floor_id}-${c.unit_number}`] = c })
    return map
  }, [completions])

  const parkingCompletionMap = useMemo(() => {
    const map = {}
    parkingCompletions.forEach(c => { map[`${c.floor_id}-${c.unit_number}`] = c })
    return map
  }, [parkingCompletions])

  const maxUnits        = useMemo(() => floors.reduce((mx, f) => Math.max(mx, f.num_units ?? 0), 0), [floors])
  const maxParkingUnits = useMemo(() => parkingFloors.reduce((mx, f) => Math.max(mx, f.num_units ?? 0), 0), [parkingFloors])
  const unitTotal       = useMemo(() => floors.reduce((s, f) => s + (f.num_units ?? 0), 0), [floors])
  const parkingTotal    = useMemo(() => parkingFloors.reduce((s, f) => s + (f.num_units ?? 0), 0), [parkingFloors])

  const unitStats = useMemo(() => {
    let in_progress = 0, m4 = 0, m5 = 0
    floors.forEach(floor => {
      for (let i = 1; i <= (floor.num_units ?? 0); i++) {
        const s = completionMap[`${floor.id}-${i}`]?.status ?? 'none'
        if (s === 'm5') m5++; else if (s === 'm4') m4++; else if (s === 'in_progress') in_progress++
      }
    })
    return { in_progress, m4, m5 }
  }, [floors, completionMap])

  const parkingStats = useMemo(() => {
    let in_progress = 0, m4 = 0, m5 = 0
    parkingFloors.forEach(floor => {
      for (let i = 1; i <= (floor.num_units ?? 0); i++) {
        const s = parkingCompletionMap[`${floor.id}-${i}`]?.status ?? 'none'
        if (s === 'm5') m5++; else if (s === 'm4') m4++; else if (s === 'in_progress') in_progress++
      }
    })
    return { in_progress, m4, m5 }
  }, [parkingFloors, parkingCompletionMap])

  const stats = useMemo(() => {
    let total = 0, none = 0, in_progress = 0, m4 = 0, m5 = 0
    floors.forEach(floor => {
      const count = floor.num_units ?? 0
      total += count
      for (let i = 1; i <= count; i++) {
        const s = completionMap[`${floor.id}-${i}`]?.status ?? 'none'
        if (s === 'm5') m5++
        else if (s === 'm4') m4++
        else if (s === 'in_progress') in_progress++
        else none++
      }
    })
    parkingFloors.forEach(floor => {
      const count = floor.num_units ?? 0
      total += count
      for (let i = 1; i <= count; i++) {
        const s = parkingCompletionMap[`${floor.id}-${i}`]?.status ?? 'none'
        if (s === 'm5') m5++
        else if (s === 'm4') m4++
        else if (s === 'in_progress') in_progress++
        else none++
      }
    })
    return { total, none, in_progress, m4, m5 }
  }, [floors, parkingFloors, completionMap, parkingCompletionMap])

  const openCell = (type, floor, unitNum) => {
    const cMap = type === 'parking' ? parkingCompletionMap : completionMap
    const existing = cMap[`${floor.id}-${unitNum}`] ?? null
    setSelected({ type, floor, unitNum, existing })
    setCellForm({ status: existing?.status ?? 'none', m4_date: existing?.m4_date ?? '', m5_date: existing?.m5_date ?? '', m4_bad: false, m5_bad: false })
  }

  const saveCell = async () => {
    if (!selected) return
    if (cellForm.status === 'm4') {
      if (cellForm.m4_bad || (cellForm.m4_date && !isValidDate(cellForm.m4_date))) {
        showToast('M4 date is not a valid calendar date.', 'error'); return
      }
      if (!cellForm.m4_date) { showToast('M4 date is required.', 'error'); return }
    }
    if (cellForm.status === 'm5') {
      if (cellForm.m5_bad || (cellForm.m5_date && !isValidDate(cellForm.m5_date))) {
        showToast('M5 date is not a valid calendar date.', 'error'); return
      }
      if (!cellForm.m5_date) { showToast('M5 date is required.', 'error'); return }
      const existingM4 = selected.existing?.m4_date
      if (existingM4 && cellForm.m5_date && cellForm.m5_date < existingM4) {
        showToast('M5 date cannot be before M4 date.', 'error'); return
      }
    }
    setSaving(true)
    const { type, floor, unitNum, existing } = selected
    const table = type === 'parking' ? 'project_parking_unit_completion' : 'project_unit_completion'
    const payload = {
      project_id: project.id, floor_id: floor.id, unit_number: unitNum, status: cellForm.status,
      // M5: preserve existing m4_date; M4: use form date; none: null
      m4_date: cellForm.status === 'm5' ? (existing?.m4_date || null) : (cellForm.status === 'm4' ? (cellForm.m4_date || null) : null),
      m5_date: cellForm.status === 'm5' ? (cellForm.m5_date || null) : null,
      updated_at: new Date().toISOString()
    }
    const { error } = existing
      ? await supabase.from(table).update(payload).eq('id', existing.id)
      : await supabase.from(table).insert(payload)
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast('Saved.', 'success')
    setSelected(null)
    // Use fetchAll to avoid the 1000-row default cap
    const fresh = await fetchAll(() => supabase.from(table).select('*').eq('project_id', project.id))
    if (type === 'parking') setParkingCompletions(fresh)
    else setCompletions(fresh)
  }

  const toggleCell = (type, floor, unitNum) => {
    const key = cellKey(type, floor.id, unitNum)
    setSelectedCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const exitMultiSelect = () => { setMultiSelectMode(false); setSelectedCells(new Set()) }

  const openFloorModal = (type, floor) => {
    const cMap = type === 'parking' ? parkingCompletionMap : completionMap
    const count = floor.num_units ?? 0
    let none = 0, in_progress = 0, m4 = 0, m5 = 0
    for (let i = 1; i <= count; i++) {
      const s = cMap[`${floor.id}-${i}`]?.status ?? 'none'
      if (s === 'm4') m4++
      else if (s === 'm5') m5++
      else if (s === 'in_progress') in_progress++
      else none++
    }
    setFloorModal({ type, floor, stats: { none, in_progress, m4, m5 }, total: count })
    setFloorModalStatus('none')
    setFloorModalDate('')
    setFloorModalDateBad(false)
  }

  const saveFloorModal = async () => {
    if (floorModalStatus === 'm4') {
      if (floorModalDateBad || (floorModalDate && !isValidDate(floorModalDate))) {
        showToast('M4 date is not a valid calendar date.', 'error'); return
      }
      if (!floorModalDate) { showToast('M4 date is required.', 'error'); return }
    }
    if (floorModalStatus === 'm5') {
      if (floorModalDateBad || (floorModalDate && !isValidDate(floorModalDate))) {
        showToast('M5 date is not a valid calendar date.', 'error'); return
      }
      if (!floorModalDate) { showToast('M5 date is required.', 'error'); return }
    }
    setFloorModalSaving(true)
    const { type, floor } = floorModal
    const table = type === 'parking' ? 'project_parking_unit_completion' : 'project_unit_completion'
    const cMap = type === 'parking' ? parkingCompletionMap : completionMap
    const count = floor.num_units ?? 0
    const promises = []
    let skipped = 0
    for (let i = 1; i <= count; i++) {
      const existing = cMap[`${floor.id}-${i}`] ?? null
      if (floorModalStatus === 'm5' && existing?.status !== 'm4') { skipped++; continue }
      const payload = {
        project_id: project.id, floor_id: floor.id, unit_number: i,
        status: floorModalStatus,
        m4_date: floorModalStatus === 'm5' ? existing.m4_date : (floorModalStatus === 'm4' ? (floorModalDate || null) : null),
        m5_date: floorModalStatus === 'm5' ? (floorModalDate || null) : null,
        updated_at: new Date().toISOString(),
      }
      promises.push(existing
        ? supabase.from(table).update(payload).eq('id', existing.id)
        : supabase.from(table).insert(payload)
      )
    }
    if (promises.length === 0) {
      showToast('No eligible units to update. Units must be M4 Complete before setting M5.', 'error')
      setFloorModalSaving(false); return
    }
    try {
      await Promise.all(promises)
      const saved = promises.length
      const msg = skipped > 0
        ? `${saved} unit${saved !== 1 ? 's' : ''} updated. ${skipped} skipped (not yet M4).`
        : `${saved} unit${saved !== 1 ? 's' : ''} updated.`
      showToast(msg, 'success')
      setFloorModal(null)
      loadAll()
    } catch (err) {
      showToast('Some units failed to save. Please try again.', 'error')
    } finally {
      setFloorModalSaving(false)
    }
  }

  const saveBulk = async () => {
    if (bulkForm.status === 'm4') {
      if (bulkForm.m4_bad || (bulkForm.m4_date && !isValidDate(bulkForm.m4_date))) {
        showToast('M4 date is not a valid calendar date.', 'error'); return
      }
      if (!bulkForm.m4_date) { showToast('M4 date is required.', 'error'); return }
    }
    if (bulkForm.status === 'm5') {
      if (bulkForm.m5_bad || (bulkForm.m5_date && !isValidDate(bulkForm.m5_date))) {
        showToast('M5 date is not a valid calendar date.', 'error'); return
      }
      if (!bulkForm.m5_date) { showToast('M5 date is required.', 'error'); return }
    }
    setBulkSaving(true)
    const promises = []
    let skipped = 0
    selectedCells.forEach(key => {
      const [type, floorId, unitNumStr] = key.split(':')
      const unitNum  = parseInt(unitNumStr)
      const cMap     = type === 'parking' ? parkingCompletionMap : completionMap
      const existing = cMap[`${floorId}-${unitNum}`] ?? null
      // M5 can only be applied to units already tagged as M4 -- skip others
      if (bulkForm.status === 'm5' && existing?.status !== 'm4') { skipped++; return }
      const table = type === 'parking' ? 'project_parking_unit_completion' : 'project_unit_completion'
      const payload = {
        project_id: project.id, floor_id: floorId, unit_number: unitNum, status: bulkForm.status,
        // M5: preserve the unit's existing m4_date; M4: use bulk date; none: null
        m4_date: bulkForm.status === 'm5' ? existing.m4_date : (bulkForm.status === 'm4' ? (bulkForm.m4_date || null) : null),
        m5_date: bulkForm.status === 'm5' ? (bulkForm.m5_date || null) : null,
        updated_at: new Date().toISOString()
      }
      promises.push(existing
        ? supabase.from(table).update(payload).eq('id', existing.id)
        : supabase.from(table).insert(payload)
      )
    })
    if (promises.length === 0) {
      showToast('No eligible units to update. Units must be M4 Complete before setting M5.', 'error')
      setBulkSaving(false); return
    }
    try {
      await Promise.all(promises)
      const saved = promises.length
      const msg = skipped > 0
        ? `${saved} unit${saved !== 1 ? 's' : ''} updated. ${skipped} skipped (not yet M4).`
        : `${saved} unit${saved !== 1 ? 's' : ''} updated.`
      showToast(msg, 'success')
      exitMultiSelect()
      loadAll()
    } catch (err) {
      showToast('Some units failed to save. Please try again.', 'error')
    } finally {
      setBulkSaving(false)
      setBulkModal(false)
    }
  }



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="loadingspinner">
          <div id="square1" /><div id="square2" /><div id="square3" /><div id="square4" /><div id="square5" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto pt-4 px-3 sm:px-6 space-y-5">
      {/* Building + product type selector */}
      <div className="grid grid-cols-3 gap-4 items-stretch relative z-10">
        {/* Building card */}
        <div className="bg-white/60 backdrop-blur-md border border-white/80 shadow-md rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Building</span>
          </div>
          <div className="flex-1 flex items-center">
            <BuildingSelector projectId={project.id} isAdmin={isAdmin} buildingId={buildingId} onChange={setBuildingId} canAdd={false} />
          </div>
        </div>

        {/* Residential card */}
        {(() => {
          const active = productType === 'unit'
          return (
            <button
              onClick={() => setProductType(prev => prev === 'unit' ? null : 'unit')}
              className={`text-left rounded-xl p-4 flex flex-col gap-0 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl backdrop-blur-md border shadow-md ${active ? 'bg-[#ed6055]/10 border-[#ed6055]/50' : 'bg-white/60 border-white/80 hover:bg-white/80'}`}
            >
              <div className="grid grid-cols-[1fr_auto] mb-3">
                <svg className={`w-4 h-4 self-start ${active ? 'text-[#ed6055]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                <div className="row-span-2 flex items-end justify-end pl-2">
                  <span className={`text-3xl font-semibold tabular-nums leading-none ${active ? 'text-[#ed6055]' : 'text-gray-800'}`}>{unitTotal}</span>
                  <span className="text-[10px] text-gray-400 mb-1 ml-1">units</span>
                </div>
                <div className="flex items-baseline mt-1">
                  <span className={`text-sm font-semibold ${active ? 'text-[#ed6055]' : 'text-gray-500'}`}>Residential</span>
                </div>
              </div>
              <div className="border-t border-gray-200/60 pt-2.5 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-sm font-bold tabular-nums text-yellow-600">{unitStats.in_progress}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">In Progress</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-green-600">{unitStats.m4}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">M4 Done</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-green-800">{unitStats.m5}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">M5 Done</div>
                </div>
              </div>
            </button>
          )
        })()}

        {/* Parking card */}
        {(() => {
          const active = productType === 'parking'
          return (
            <button
              onClick={() => setProductType(prev => prev === 'parking' ? null : 'parking')}
              className={`text-left rounded-xl p-4 flex flex-col gap-0 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl backdrop-blur-md border shadow-md ${active ? 'bg-[#ed6055]/10 border-[#ed6055]/50' : 'bg-white/60 border-white/80 hover:bg-white/80'}`}
            >
              <div className="grid grid-cols-[1fr_auto] mb-3">
                <svg className={`w-4 h-4 self-start ${active ? 'text-[#ed6055]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
                <div className="row-span-2 flex items-end justify-end pl-2">
                  <span className={`text-3xl font-semibold tabular-nums leading-none ${active ? 'text-[#ed6055]' : 'text-gray-800'}`}>{parkingTotal}</span>
                  <span className="text-[10px] text-gray-400 mb-1 ml-1">slots</span>
                </div>
                <div className="flex items-baseline mt-1">
                  <span className={`text-sm font-semibold ${active ? 'text-[#ed6055]' : 'text-gray-500'}`}>Parking</span>
                </div>
              </div>
              <div className="border-t border-gray-200/60 pt-2.5 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-sm font-bold tabular-nums text-yellow-600">{parkingStats.in_progress}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">In Progress</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-green-600">{parkingStats.m4}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">M4 Done</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums text-green-800">{parkingStats.m5}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide leading-tight mt-0.5">M5 Done</div>
                </div>
              </div>
            </button>
          )
        })()}
      </div>

      {/* Residential floors */}
      {(!productType || productType === 'unit') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <SectionHeader title="Residential Units" action={(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
            <div className="flex items-center gap-2">
              {multiSelectMode && (
                <>
                  <span className="text-xs text-gray-500">{selectedCells.size} selected</span>
                  <button
                    onClick={() => { setBulkForm({ status: 'none', m4_date: '', m5_date: '' }); setBulkModal(true) }}
                    disabled={selectedCells.size === 0}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] disabled:opacity-40 transition"
                  >Set Status</button>
                  <button onClick={exitMultiSelect} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </>
              )}
              {!multiSelectMode && (
                <button onClick={() => setMultiSelectMode(true)} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                  Multi-select
                </button>
              )}
            </div>
          )} />
          <UnitGrid floorList={floors} cMap={completionMap} maxU={maxUnits} type="unit" emptyMsg="No unit floors defined yet. Add them in the Development tab."
            isAdmin={canEdit} multiSelectMode={multiSelectMode} selectedCells={selectedCells}
            onToggleCell={toggleCell} onOpenCell={openCell} onFloorClick={openFloorModal} />
        </div>
      )}

      {/* Parking floors */}
      {(!productType || productType === 'parking') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <SectionHeader title="Parking Slots" action={(isAdmin || profile?.role === 'reporter' || profile?.role === 'endorser') && (
            <div className="flex items-center gap-2">
              {multiSelectMode && (
                <>
                  <span className="text-xs text-gray-500">{selectedCells.size} selected</span>
                  <button
                    onClick={() => { setBulkForm({ status: 'none', m4_date: '', m5_date: '' }); setBulkModal(true) }}
                    disabled={selectedCells.size === 0}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] disabled:opacity-40 transition"
                  >Set Status</button>
                  <button onClick={exitMultiSelect} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </>
              )}
              {!multiSelectMode && (
                <button onClick={() => setMultiSelectMode(true)} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                  Multi-select
                </button>
              )}
            </div>
          )} />
          <UnitGrid floorList={parkingFloors} cMap={parkingCompletionMap} maxU={maxParkingUnits} type="parking" emptyMsg="No parking floors defined yet. Add them in the Development tab."
            isAdmin={canEdit} multiSelectMode={multiSelectMode} selectedCells={selectedCells}
            onToggleCell={toggleCell} onOpenCell={openCell} onFloorClick={openFloorModal} />
        </div>
      )}

      {/* Floor status modal */}
      {floorModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setFloorModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-base font-bold text-black">
                {floorModal.type === 'parking' ? 'Parking' : 'Floor'} {/^\d+$/.test(floorModal.floor.physical_level) ? `${floorModal.floor.physical_level}F` : floorModal.floor.physical_level}
              </h3>
              <button onClick={() => setFloorModal(null)} className="p-1 -mt-0.5 -mr-1 text-gray-300 hover:text-gray-500 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{floorModal.total} units total</p>

            {/* Breakdown */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {floorModal.stats.none > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-sm bg-gray-300 inline-block" />
                  {floorModal.stats.none} Not Started
                </span>
              )}
              {floorModal.stats.in_progress > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-50 text-yellow-700 text-[11px] font-semibold border border-yellow-200">
                  <span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block" />
                  {floorModal.stats.in_progress} In Progress
                </span>
              )}
              {floorModal.stats.m4 > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 text-[11px] font-semibold border border-green-200">
                  <span className="w-2 h-2 rounded-sm bg-green-300 inline-block" />
                  {floorModal.stats.m4} M4
                </span>
              )}
              {floorModal.stats.m5 > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-100 text-green-800 text-[11px] font-semibold border border-green-300">
                  <span className="w-2 h-2 rounded-sm bg-green-600 inline-block" />
                  {floorModal.stats.m5} M5
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Set all units to</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(UNIT_STATUS_CONFIG).map(([val, cfg]) => (
                    <button key={val}
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10)
                        setFloorModalStatus(val)
                        setFloorModalDate(val === 'none' ? '' : today)
                        setFloorModalDateBad(false)
                      }}
                      className={`py-2 px-1 rounded-lg border-2 text-[10px] font-semibold text-center transition leading-tight ${floorModalStatus === val ? (val === 'none' ? 'bg-gray-100 text-gray-700 border-gray-400 shadow-sm' : `${cfg.cell} border-current shadow-sm`) : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {floorModalStatus === 'm4' && (() => {
                const err = floorModalDateBad || !!(floorModalDate && !isValidDate(floorModalDate))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date <span className="text-red-400">*</span></label>
                    <input type="date" value={floorModalDate} onChange={e => { setFloorModalDate(e.target.value); setFloorModalDateBad(e.target.validity.badInput) }} className={err ? errCls : inputCls} />
                    {err && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                  </div>
                )
              })()}

              {floorModalStatus === 'm5' && (() => {
                const err = floorModalDateBad || !!(floorModalDate && !isValidDate(floorModalDate))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M5 Date <span className="text-red-400">*</span></label>
                    <input type="date" value={floorModalDate} onChange={e => { setFloorModalDate(e.target.value); setFloorModalDateBad(e.target.validity.badInput) }} className={err ? errCls : inputCls} />
                    {err && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                    <p className="text-[10px] text-amber-500 mt-1.5">Only units already tagged as M4 will be updated. Others are skipped.</p>
                  </div>
                )
              })()}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setFloorModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={saveFloorModal} disabled={floorModalSaving || floorModalStatus === 'none'} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
                {floorModalSaving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk status modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setBulkModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-0.5">
              <h3 className="text-base font-bold text-black">Set Status</h3>
              <button onClick={() => setBulkModal(false)} className="p-1 -mt-0.5 -mr-1 text-gray-300 hover:text-gray-500 transition" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Apply to {selectedCells.size} selected unit{selectedCells.size !== 1 ? 's' : ''}.</p>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(UNIT_STATUS_CONFIG).map(([val, cfg]) => (
                    <button key={val}
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10)
                        setBulkForm(f => ({
                          ...f,
                          status:  val,
                          m4_date: val === 'none' ? '' : val === 'm4' ? (f.m4_date || today) : f.m4_date,
                          m5_date: val === 'none' ? '' : val === 'm5' ? (f.m5_date || today) : f.m5_date,
                          m4_bad:  val === 'none' || val === 'm5' ? false : f.m4_bad,
                          m5_bad:  val === 'none' ? false : f.m5_bad,
                        }))
                      }}
                      className={`py-2 px-1 rounded-lg border-2 text-[10px] font-semibold text-center transition leading-tight ${bulkForm.status === val ? (val === 'none' ? 'bg-gray-100 text-gray-700 border-gray-400 shadow-sm' : `${cfg.cell} border-current shadow-sm`) : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              {bulkForm.status === 'm4' && (() => {
                const m4DateErr = bulkForm.m4_bad || !!(bulkForm.m4_date && !isValidDate(bulkForm.m4_date))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date <span className="text-red-400">*</span></label>
                    <input type="date" value={bulkForm.m4_date} onChange={e => setBulkForm(f => ({ ...f, m4_date: e.target.value, m4_bad: e.target.validity.badInput }))} className={m4DateErr ? errCls : inputCls} />
                    {m4DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                  </div>
                )
              })()}
              {bulkForm.status === 'm5' && (() => {
                const m5DateErr = bulkForm.m5_bad || !!(bulkForm.m5_date && !isValidDate(bulkForm.m5_date))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M5 Date <span className="text-red-400">*</span></label>
                    <input type="date" value={bulkForm.m5_date} onChange={e => setBulkForm(f => ({ ...f, m5_date: e.target.value, m5_bad: e.target.validity.badInput }))} className={m5DateErr ? errCls : inputCls} />
                    {m5DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                    <p className="text-[10px] text-amber-500 mt-1.5">Only units already tagged as M4 Complete will be updated. Others are skipped.</p>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setBulkModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={saveBulk} disabled={bulkSaving} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
                {bulkSaving ? 'Saving…' : `Apply to ${selectedCells.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared cell edit modal */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-0.5">
              <h3 className="text-base font-bold text-black">
                {selected.type === 'parking' ? 'Parking' : 'Unit'} {selected.floor.physical_level}-{String(selected.unitNum).padStart(2, '0')}
              </h3>
              <button onClick={() => setSelected(null)} className="p-1 -mt-0.5 -mr-1 text-gray-300 hover:text-gray-500 transition" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Set completion status and record date.</p>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(UNIT_STATUS_CONFIG).map(([val, cfg]) => {
                    const m5Locked = val === 'm5' && !['m4', 'in_progress', 'm5'].includes(selected?.existing?.status)
                    return (
                      <button key={val}
                        disabled={m5Locked}
                        title={m5Locked ? 'Unit must be M4 Complete first' : undefined}
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10)
                          setCellForm(f => ({
                            ...f,
                            status:  val,
                            m4_date: val === 'none' ? '' : val === 'm4' ? (f.m4_date || today) : f.m4_date,
                            m5_date: val === 'none' ? '' : val === 'm5' ? (f.m5_date || today) : f.m5_date,
                            m4_bad:  val === 'none' || val === 'm5' ? false : f.m4_bad,
                            m5_bad:  val === 'none' ? false : f.m5_bad,
                          }))
                        }}
                        className={`py-2 px-1 rounded-lg border-2 text-[10px] font-semibold text-center transition leading-tight ${m5Locked ? 'border-gray-100 text-gray-300 cursor-not-allowed opacity-40' : cellForm.status === val ? (val === 'none' ? 'bg-gray-100 text-gray-700 border-gray-400 shadow-sm' : `${cfg.cell} border-current shadow-sm`) : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {cellForm.status === 'm4' && (() => {
                const m4DateErr = cellForm.m4_bad || !!(cellForm.m4_date && !isValidDate(cellForm.m4_date))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date <span className="text-red-400">*</span></label>
                    {selected?.existing?.m4_date && !isAdmin
                      ? <p className="text-sm font-semibold text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">{fmt(selected.existing.m4_date)}</p>
                      : <input type="date" value={cellForm.m4_date} onChange={e => setCellForm(f => ({ ...f, m4_date: e.target.value, m4_bad: e.target.validity.badInput }))} className={m4DateErr ? errCls : inputCls} />
                    }
                    {m4DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                  </div>
                )
              })()}
              {cellForm.status === 'm5' && (() => {
                const m5DateErr = cellForm.m5_bad || !!(cellForm.m5_date && !isValidDate(cellForm.m5_date))
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date</label>
                      <p className="text-sm font-semibold text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">{fmt(selected.existing.m4_date)}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M5 Date <span className="text-red-400">*</span></label>
                      {selected?.existing?.m5_date && !isAdmin
                        ? <p className="text-sm font-semibold text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">{fmt(selected.existing.m5_date)}</p>
                        : <input type="date" value={cellForm.m5_date} onChange={e => setCellForm(f => ({ ...f, m5_date: e.target.value, m5_bad: e.target.validity.badInput }))} className={m5DateErr ? errCls : inputCls} />
                      }
                      {m5DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSelected(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={saveCell} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// -- Main Modal ----------------------------------------------------------------

export default function ProjectDetailModal({ project: initialProject, isAdmin, onClose, onProjectUpdated, startEditing = false, startTab = 'Project Info', onTabChange, onSectionChange, activeSection: controlledSection, reportOpen = false, onReportClose, asPage = false, permitsSearch = '', onPermitsSearchChange, permitsFilter = 'all', onPermitsFilterChange, permitsCreating = false, onPermitsCreatingChange, photosSearch = '', onPhotosSearchChange, photosFilterTags = [], onPhotosFilterTagsChange, photosFilterMonth = '', onPhotosFilterMonthChange, photosSortOrder = 'newest', onPhotosSortOrderChange, photosShowUpload = false, onPhotosShowUploadChange, issuesSearch = '', onIssuesSearchChange, issuesFilterStatus = 'all', onIssuesFilterStatusChange, issuesFilterGroup = 'all', onIssuesFilterGroupChange, issuesFilterMgmtLevel = 'all', onIssuesFilterMgmtLevelChange, issuesShowAdd = false, onIssuesShowAddChange, onIssuesRegisterFns, onGanttRegisterFns, onGanttActiveBLChange }) {
  const { profile } = useProfile()
  const [project, setProject] = useState(initialProject)

  // Local state as fallback when used without controlled activeSection prop
  const [localSection, setLocalSection] = useState(
    startEditing ? null : (startTab === 'Project Info' ? null : startTab)
  )
  // Controlled if parent passes activeSection; otherwise use local state
  const activeSection = controlledSection !== undefined ? controlledSection : localSection

  const navigate = (section) => {
    setLocalSection(section)
    onSectionChange?.(section)
    onTabChange?.(section ?? 'Project Info')
  }

  const [toast, setToast] = useState(null)
  const [toastIn, setToastIn] = useState(false)
  const toastTimerRef = useRef(null)

  useEffect(() => {
    if (asPage) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [asPage])

  const phase = PHASE_MAP[project.phase]

  useEffect(() => {
    if (!toast) return
    const id = requestAnimationFrame(() => setToastIn(true))
    return () => cancelAnimationFrame(id)
  }, [toast])

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastIn(false)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => {
      setToastIn(false)
      setTimeout(() => setToast(null), 280)
    }, 3300)
  }

  const handleUpdated = (patch) => {
    const updated = { ...project, ...patch }
    setProject(updated)
    onProjectUpdated?.(updated)
  }

  return (
    <div className={asPage ? 'w-full flex-1 min-h-0 flex flex-col' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm'}>
      <style>{`
        @keyframes menu-in {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes menu-in-up {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes section-slide-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; }
        }
        @keyframes cover-reveal {
          from { opacity: 0; transform: scale(1.06); filter: blur(8px); }
          to   { opacity: 1; transform: scale(1);    filter: blur(0px); }
        }
        @keyframes cover-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .cover-reveal {
          animation: cover-reveal 600ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .cover-fade {
          animation: cover-fade 400ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .section-slide-in {
          animation: section-slide-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .cover-reveal, .cover-fade, .section-slide-in {
            animation: none;
          }
        }
      `}</style>

      {/* No modal header bar -- navigation lives in DashboardLayout topbar (asPage) or via onClose */}
      <div className={`rounded-none w-full flex flex-col ${asPage && (activeSection === 'Permits' || activeSection === 'Photos' || activeSection === 'Issues & Concerns' || activeSection === 'Unit Completion') ? 'bg-gray-200' : asPage ? 'bg-gray-200 flex-1 min-h-0 overflow-hidden' : 'bg-white shadow-2xl h-full overflow-hidden'}`}>

        {/* Non-page mode: floating close button */}
        {!asPage && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-lg bg-black/60 text-white hover:bg-black/80 active:scale-[0.95] transition-all duration-150"
            aria-label="Close"
          >
            <XIcon />
          </button>
        )}

        {/* Content */}
        {activeSection === null ? (
          <div key="home" className="flex-1 overflow-hidden" style={{ animation: 'fade-in 180ms ease-out both' }}>
            <OverviewTab project={project} isAdmin={isAdmin} showToast={showToast} onUpdated={handleUpdated} startEditing={startEditing} />
          </div>
        ) : activeSection === 'Work Program' ? (
          <div key="Work Program" className="flex-1 overflow-hidden flex flex-col section-slide-in">
            <GanttContent project={project} isAdmin={isAdmin} showToast={showToast} onRegisterFns={onGanttRegisterFns} onActiveBLChange={onGanttActiveBLChange} />
          </div>
        ) : activeSection === 'Permits' ? (
          <div key="Permits" className="section-slide-in">
            <PermitsTab project={project} isAdmin={isAdmin} isHead={profile?.role === 'head'} isReporter={profile?.role === 'reporter'} isViewer={profile?.role === 'viewer'} currentUserId={profile?.id} showToast={showToast} search={permitsSearch} onSearchChange={onPermitsSearchChange} filterStatus={permitsFilter} onFilterStatusChange={onPermitsFilterChange} creating={permitsCreating} onCreatingChange={onPermitsCreatingChange} />
          </div>
        ) : activeSection === 'Photos' ? (
          <div key="Photos" className="section-slide-in">
            <PhotosTab project={project} isAdmin={isAdmin} profile={profile} showToast={showToast} search={photosSearch} onSearchChange={onPhotosSearchChange} filterTags={photosFilterTags} onFilterTagsChange={onPhotosFilterTagsChange} filterMonth={photosFilterMonth} onFilterMonthChange={onPhotosFilterMonthChange} sortOrder={photosSortOrder} onSortOrderChange={onPhotosSortOrderChange} showUpload={photosShowUpload} onShowUploadChange={onPhotosShowUploadChange} />
          </div>
        ) : activeSection === 'Issues & Concerns' ? (
          <div key="Issues & Concerns" className="section-slide-in">
            <IssuesTab project={project} isAdmin={isAdmin} profile={profile} showToast={showToast} search={issuesSearch} onSearchChange={onIssuesSearchChange} filterStatus={issuesFilterStatus} onFilterStatusChange={onIssuesFilterStatusChange} filterGroup={issuesFilterGroup} onFilterGroupChange={onIssuesFilterGroupChange} filterMgmtLevel={issuesFilterMgmtLevel} onFilterMgmtLevelChange={onIssuesFilterMgmtLevelChange} showAdd={issuesShowAdd} onShowAddChange={onIssuesShowAddChange} onRegisterFns={onIssuesRegisterFns} />
          </div>
        ) : activeSection === 'Unit Completion' ? (
          <div key="Unit Completion" className="section-slide-in">
            <CompletionTab project={project} isAdmin={isAdmin} profile={profile} showToast={showToast} />
          </div>
        ) : (
          <div
            key={activeSection}
            className={`section-slide-in flex-1 bg-[#e4e7ec] ${activeSection === 'S-Curve' ? 'overflow-hidden' : 'overflow-y-auto px-3 sm:px-6 pb-4 sm:pb-5'}`}
          >
            {activeSection === 'Planned M4/M5'      && <DevelopmentTab project={project} isAdmin={isAdmin} showToast={showToast} />}
            {activeSection === 'S-Curve'            && <SCurveTab project={project} isAdmin={isAdmin} canEdit={isAdmin || profile?.role === 'reporter'} showToast={showToast} />}
          </div>
        )}
      </div>

      {toast && (
        <div
          aria-live="polite"
          style={{
            transition: 'opacity 250ms ease-out, transform 250ms ease-out',
            opacity: toastIn ? 1 : 0,
            transform: toastIn ? 'translateY(0)' : 'translateY(12px)',
          }}
          className={`fixed bottom-20 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[65] flex items-center gap-2 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}
        >
          {toast.type === 'success'
            ? <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            : <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          }
          {toast.message}
        </div>
      )}

      {reportOpen && (
        <ReportBuilderModal
          onClose={() => onReportClose?.()}
          defaultProject={{ id: project.id, name: project.name }}
          defaultScope="this_project"
        />
      )}
    </div>
  )
}

// -- Icons ---------------------------------------------------------------------

const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)
function ExcelButtons({ onExport, onImport, importing = false }) {
  const ref = useRef(null)
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onExport}
        title="Export to Excel"
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
      >
        <DownloadIcon /> Export
      </button>
      <button
        onClick={() => ref.current?.click()}
        disabled={importing}
        title="Import from Excel"
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
      >
        <UploadIcon /> {importing ? 'Importing…' : 'Import'}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => { const f = e.target.files[0]; if (f) onImport(f); e.target.value = '' }}
      />
    </div>
  )
}
const DownloadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)
const UploadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)
const ChevronIcon = ({ up }) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    style={{ transform: up ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
)
const PencilIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
)
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)
const CameraIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </svg>
)
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

