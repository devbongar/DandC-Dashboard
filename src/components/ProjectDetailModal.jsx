import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { supabase, fetchAll } from '../lib/supabaseClient'
import { downloadWorkbook, parseWorkbook, toDateStr, toFloat, toInt } from '../lib/excelUtils'
import { PH_PROVINCES, PH_CITIES } from '../lib/philippinesLocations'
import TriangleLoader from './TriangleLoader'

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASES = [
  { key: 'initiation',           label: 'Initiation',            color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  { key: 'planning',             label: 'Planning',              color: '#3b82f6', badge: 'bg-blue-50 text-blue-600 border-blue-200' },
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
  { key: 'done',             label: 'Done',            badge: 'bg-green-50 text-green-600' },
  { key: 'ongoing',          label: 'Ongoing',         badge: 'bg-yellow-100 text-yellow-700' },
  { key: 'not_yet_started',  label: 'Not Yet Started', badge: 'bg-gray-100 text-gray-500' },
]
const PERMIT_STATUS_MAP = Object.fromEntries(PERMIT_STATUSES.map(s => [s.key, s]))


const fmt       = d => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const getFileName = url => url ? decodeURIComponent(url.split('/').pop().split('?')[0]) : null
const noNeg = (...vals) => vals.filter(v => v !== null && v !== undefined).some(v => v < 0)

const inputCls  = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white'

const BASE_TABS = ['Overview', 'Development', 'Permits', 'Milestones', 'Issues & Concerns']

const ISSUE_STATUS_CONFIG = {
  open:  { label: 'Open',  cls: 'bg-[#ed6055] text-white' },
  close: { label: 'Close', cls: 'bg-green-50 text-green-600' },
  hold:  { label: 'Hold',  cls: 'bg-amber-50 text-amber-600' },
}
const ISSUE_GROUPS = ['Commercial', 'Design', 'Construction', 'Compliance']
const MANAGEMENT_LEVELS = ['ESA', 'Management Committee']
const issueAgingDays = (d) => d ? Math.max(0, Math.floor((new Date() - new Date(d)) / 86400000)) : null
const fmtIssueDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
const ISSUE_EMPTY = { issue_group: '', management_level: '', status: 'open', date_presented: '', date_bad: false, details: '', caused_by: '', action_steps: '' }

// ── Combobox ──────────────────────────────────────────────────────────────────

function Combobox({ options = [], value, onChange, placeholder, disabled = false }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [display, setDisplay] = useState(value ?? '')
  const containerRef        = useRef(null)

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

  const handleFocus = () => { if (!disabled) { setQuery(''); setOpen(true) } }
  const handleInput = (e) => { setQuery(e.target.value); setDisplay(e.target.value); setOpen(true) }
  const handleBlur  = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      // If what was typed doesn't match a valid option, revert to last confirmed value
      if (!options.includes(display)) { setDisplay(value ?? ''); setQuery('') }
      setOpen(false)
    }
  }

  const inputCls_ = `w-full px-3 py-2 text-sm rounded-lg border text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent bg-white ${disabled ? 'opacity-50 cursor-not-allowed border-gray-100' : 'border-gray-200'}`

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <input
        value={open ? query : display}
        onFocus={handleFocus}
        onChange={handleInput}
        placeholder={disabled ? '— select province first —' : placeholder}
        disabled={disabled}
        className={inputCls_}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-[80] mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
          {filtered.map(opt => (
            <li
              key={opt}
              onMouseDown={() => select(opt)}
              className="px-3 py-2 cursor-pointer hover:bg-[#ed6055]/10 hover:text-[#ed6055] truncate"
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-[80] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400 italic">
          No matches
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  )
}

function ReadValue({ value, accent }) {
  return <p className="text-sm font-semibold" style={{ color: accent ?? '#111' }}>{value || '—'}</p>
}

function SectionHeader({ title, action, sticky = false }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${sticky ? 'sticky top-0 z-20 bg-white py-3' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-[#ed6055]" />
        <h3 className="text-sm font-bold text-black">{title}</h3>
      </div>
      {action}
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
          Import blocked — {errors.length} error{errors.length !== 1 ? 's' : ''} found. Fix the file and try again.
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-black mb-1">Delete this entry?</h3>
        <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition">Delete</button>
        </div>
      </div>
    </div>
  )
}

function FloorLayoutModal({ url, onClose }) {
  const isPdf = /\.pdf(\?|$)/i.test(url)
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60" onClick={onClose}>
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

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, isAdmin, onUpdated, showToast, startEditing = false }) {
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
  })

  const [editing, setEditing] = useState(startEditing)
  const [form, setForm] = useState(startEditing ? buildForm() : {})
  const [saving, setSaving] = useState(false)
  const phase = PHASE_MAP[project.phase]

  const startEdit = () => {
    setForm(buildForm())
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
    }
    if (noNeg(payload.lot_area, payload.developable_area)) { showToast('Values cannot be negative.', 'error'); setSaving(false); return }
    const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast('Project updated.', 'success')
    setEditing(false)
    onUpdated(payload)
  }

  const f = v => form[v]
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  if (editing) return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project Name *">
          <input value={f('name')} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Project name" />
        </Field>
        <Field label="Project Code">
          <input value={f('project_code')} onChange={e => set('project_code', e.target.value)} className={inputCls} placeholder="e.g. PRJ-001" />
        </Field>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input type="checkbox" id="edit_4ph" checked={f('is_4ph_project')} onChange={e => set('is_4ph_project', e.target.checked)} className="accent-[#ed6055] w-4 h-4" />
          <label htmlFor="edit_4ph" className="text-sm text-gray-600 cursor-pointer select-none">4PH Project</label>
        </div>
        <Field label="Business Unit">
          <select value={f('business_unit')} onChange={e => set('business_unit', e.target.value)} className={inputCls}>
            <option value="">— Select Business Unit —</option>
            {BUSINESS_UNITS.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
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
        <Field label="Development Type">
          <select value={f('development_type')} onChange={e => set('development_type', e.target.value)} className={inputCls}>
            <option value="">— Select —</option>
            <option value="housing">Housing</option>
            <option value="condominium">Condominium</option>
          </select>
        </Field>
        <Field label="Phase">
          <select value={f('phase')} onChange={e => set('phase', e.target.value)} className={inputCls}>
            <option value="">— Select —</option>
            {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
        <button onClick={save} disabled={saving || !form.name?.trim()} className="flex-1 py-2 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="col-span-2 sm:col-span-3 bg-gray-50 rounded-xl px-4 py-3 flex items-start justify-between gap-2">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Project Name"><ReadValue value={project.name} /></Field>
            <Field label="Project Code"><ReadValue value={project.project_code} /></Field>
          </div>
          {isAdmin && (
            <button onClick={startEdit} className="flex-shrink-0 flex items-center gap-1.5 mt-0.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#ed6055] hover:bg-[#d94f45] transition">
              <PencilIcon /> Edit Details
            </button>
          )}
        </div>
        <Field label="4PH Project">
          <ReadValue value={project.is_4ph_project ? 'Yes' : 'No'} accent={project.is_4ph_project ? '#ed6055' : undefined} />
        </Field>
        <Field label="Business Unit"><ReadValue value={formatBU(project.business_unit)} /></Field>
        <Field label="Development Type">
          <ReadValue value={project.development_type ? (project.development_type === 'housing' ? 'Housing' : 'Condominium') : null} />
        </Field>
        <Field label="Province"><ReadValue value={project.province} /></Field>
        <Field label="City / Municipality"><ReadValue value={project.city} /></Field>
        <Field label="Project Lot Area">
          <ReadValue value={project.lot_area != null ? `${Number(project.lot_area).toLocaleString()} sqm` : null} />
        </Field>
        <Field label="Project Developable Area">
          <ReadValue value={project.developable_area != null ? `${Number(project.developable_area).toLocaleString()} sqm` : null} />
        </Field>
      </div>
    </div>
  )
}

// ── Development Tab ───────────────────────────────────────────────────────────

function UnitTypesSection({ projectId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewUrl, setViewUrl] = useState(null)
  const [form, setForm] = useState({})

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
            {rows.map(row => editId === row.id ? (
              <tr key={row.id}>
                <td className="px-4 py-2"><InlineInput value={form.unit_type} onChange={v => setForm(p => ({ ...p, unit_type: v }))} placeholder="Type name" /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.quantity} onChange={v => setForm(p => ({ ...p, quantity: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.cfa_sqm} onChange={v => setForm(p => ({ ...p, cfa_sqm: v }))} /></td>
                <td className="px-4 py-2"><InlineInput type="number" value={form.saleable_area_sqm} onChange={v => setForm(p => ({ ...p, saleable_area_sqm: v }))} /></td>
                <td className="px-4 py-2"><FloorUploadCell value={form.floor_layout_url} onChange={v => setForm(p => ({ ...p, floor_layout_url: v }))} showToast={showToast} /></td>
                <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
              </tr>
            ) : (
              <tr key={row.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-black">{row.unit_type}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.quantity ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.saleable_area_sqm ?? '—'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">—</span>}</td>
                {isAdmin && <td className="px-4 py-2.5"><div className="flex gap-1">
                  <button onClick={() => { setForm({ unit_type: row.unit_type, quantity: row.quantity ?? '', cfa_sqm: row.cfa_sqm ?? '', saleable_area_sqm: row.saleable_area_sqm ?? '', floor_layout_url: row.floor_layout_url ?? '' }); setEditId(row.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                  <button onClick={() => setDeleteId(row.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                </div></td>}
              </tr>
            ))}
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
                <td className="px-4 py-2.5 text-gray-600">{row.quantity ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.saleable_area_sqm ?? '—'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">—</span>}</td>
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
                <td className="px-4 py-2.5 text-gray-600">{row.cfa_sqm ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{row.floor_area_sqm ?? '—'}</td>
                <td className="px-4 py-2.5">{row.floor_layout_url ? <button onClick={() => setViewUrl(row.floor_layout_url)} className="text-[#ed6055] hover:underline text-xs font-medium max-w-[140px] truncate block text-left" title={getFileName(row.floor_layout_url)}>{getFileName(row.floor_layout_url)}</button> : <span className="text-gray-400">—</span>}</td>
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


// ── Building Selector ─────────────────────────────────────────────────────────

function BuildingSelector({ projectId, isAdmin, buildingId, onChange }) {
  const [buildings, setBuildings] = useState([])
  const [adding, setAdding]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [deleteId, setDeleteId]   = useState(null)

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

  const addBuilding = async () => {
    const name = nameInput.trim()
    if (!name) return
    const { data } = await supabase
      .from('project_buildings')
      .insert({ project_id: projectId, name, sort_order: buildings.length })
      .select('*').single()
    if (data) { setBuildings(b => [...b, data]); onChange(data.id) }
    setAdding(false); setNameInput('')
  }

  const renameBuilding = async (id) => {
    const name = nameInput.trim()
    if (!name) return
    await supabase.from('project_buildings').update({ name }).eq('id', id)
    setBuildings(b => b.map(x => x.id === id ? { ...x, name } : x))
    setEditId(null); setNameInput('')
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

  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {buildings.map(b => (
        editId === b.id ? (
          <div key={b.id} className="flex items-center gap-1">
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameBuilding(b.id); if (e.key === 'Escape') { setEditId(null); setNameInput('') } }}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-[#ed6055]"
            />
            <button onClick={() => renameBuilding(b.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45]">Save</button>
            <button onClick={() => { setEditId(null); setNameInput('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <div key={b.id} className="flex items-center gap-0.5 group">
            <button
              onClick={() => onChange(b.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${buildingId === b.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {b.name}
            </button>
            {isAdmin && buildingId === b.id && (
              <>
                <button onClick={() => { setEditId(b.id); setNameInput(b.name) }} className="p-1 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition"><PencilIcon /></button>
                <button onClick={() => setDeleteId(b.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><TrashIcon /></button>
              </>
            )}
          </div>
        )
      ))}

      {isAdmin && !adding && (
        <button
          onClick={() => { setAdding(true); setNameInput('') }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-[#ed6055] hover:text-[#ed6055] transition"
        >
          <PlusIcon /> Add Building
        </button>
      )}

      {adding && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBuilding(); if (e.key === 'Escape') { setAdding(false); setNameInput('') } }}
            placeholder="e.g. Tower A"
            className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-[#ed6055]"
          />
          <button onClick={addBuilding} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45]">Add</button>
          <button onClick={() => { setAdding(false); setNameInput('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}

      {deleteId !== null && (
        <ConfirmDeleteModal
          onConfirm={() => { deleteBuilding(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

function BulkAddFloorsModal({ onConfirm, onCancel, unitLabel = 'Units' }) {
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [prefix, setPrefix] = useState('')
  const [numUnits, setNumUnits] = useState('')
  const [err, setErr]       = useState('')

  const handle = () => {
    const f = parseInt(from), t = parseInt(to)
    if (isNaN(f) || isNaN(t) || f > t) { setErr('Enter a valid floor range (From ≤ To).'); return }
    if (t - f > 99) { setErr('Maximum 100 floors at a time.'); return }
    setErr('')
    const floors = []
    for (let i = f; i <= t; i++) {
      floors.push({
        physical_level: prefix ? `${prefix}${i}` : String(i),
        marketing_level: null,
        num_units: numUnits !== '' ? parseInt(numUnits) || null : null,
        m4_planned_start: null,
        m4_planned_end:   null,
        m5_planned_start: null,
        m5_planned_end:   null,
      })
    }
    onConfirm(floors)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Add Floors</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Floor #</label>
              <input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Floor #</label>
              <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="40" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Level Prefix <span className="font-normal text-gray-400">(optional)</span></label>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. F or L" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{unitLabel} / Floor <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="number" value={numUnits} onChange={e => setNumUnits(e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40" />
            </div>
          </div>
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

function ProjectFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [form, setForm] = useState({})

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
    }
  }
  const blank = () => ({ physical_level: '', marketing_level: '', num_units: '', m4_planned_start: '', m4_planned_end: '', m5_planned_start: '', m5_planned_end: '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false })
  const save = async (id) => {
    const payload = { project_id: projectId, building_id: buildingId ?? null, physical_level: form.physical_level?.trim(), marketing_level: form.marketing_level?.trim() || null, num_units: form.num_units !== '' ? parseInt(form.num_units) : null, m4_planned_start: form.m4_planned_start || null, m4_planned_end: form.m4_planned_end || null, m5_planned_start: form.m5_planned_start || null, m5_planned_end: form.m5_planned_end || null }
    if (!payload.physical_level) return
    if (noNeg(payload.num_units)) { showToast('Values cannot be negative.', 'error'); return }
    if (form.m4_start_bad || (form.m4_planned_start && !isValidDate(form.m4_planned_start))) { showToast('M4 Start Date is not a valid calendar date.', 'error'); return }
    if (form.m4_end_bad   || (form.m4_planned_end   && !isValidDate(form.m4_planned_end)))   { showToast('M4 End Date is not a valid calendar date.', 'error'); return }
    if (form.m5_start_bad || (form.m5_planned_start && !isValidDate(form.m5_planned_start))) { showToast('M5 Start Date is not a valid calendar date.', 'error'); return }
    if (form.m5_end_bad   || (form.m5_planned_end   && !isValidDate(form.m5_planned_end)))   { showToast('M5 End Date is not a valid calendar date.', 'error'); return }
    if (payload.m4_planned_start && payload.m4_planned_end && payload.m4_planned_end < payload.m4_planned_start) { showToast('M4 End Date cannot be earlier than M4 Start Date.', 'error'); return }
    if (payload.m5_planned_start && payload.m5_planned_end && payload.m5_planned_end < payload.m5_planned_start) { showToast('M5 End Date cannot be earlier than M5 Start Date.', 'error'); return }
    const { error } = id ? await supabase.from('project_floors').update(payload).eq('id', id) : await supabase.from('project_floors').insert(payload)
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success'); setAdding(false); setEditId(null); load()
  }
  const bulkSave = async (floors) => {
    const rows = floors.map(f => ({ ...f, project_id: projectId, building_id: buildingId ?? null }))
    const { error } = await supabase.from('project_floors').insert(rows)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${floors.length} floor${floors.length !== 1 ? 's' : ''} added.`, 'success')
    setBulkAdding(false)
    load()
  }
  const del = async (id) => { await supabase.from('project_floors').delete().eq('id', id); load() }

  return (
    <div className="mb-6">
      <SectionHeader title="Floor Schedule (M4 / M5)" action={isAdmin && !adding && (
        <div className="flex gap-1.5">
          <button onClick={() => { setForm(blank()); setAdding(true) }} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"><PlusIcon /> Add One</button>
          <button onClick={() => setBulkAdding(true)} className="text-xs font-semibold px-2.5 py-1 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1"><PlusIcon /> Bulk Add</button>
        </div>
      )} />
      <div className="overflow-x-auto">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[900px]">
          <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 72 }}>Phys. Level</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 72 }}>Mktg. Level</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 64 }}>Units</th>
                <th className="text-center px-3 py-2 font-semibold text-amber-500 uppercase tracking-wider" colSpan={2} style={{ minWidth: 120 }}>
                  <div>M4 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-amber-400"><span>Start Date</span><span>End Date</span></div>
                </th>
                <th className="text-center px-3 py-2 font-semibold text-green-600 uppercase tracking-wider" colSpan={2} style={{ minWidth: 120 }}>
                  <div>M5 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-green-500"><span>Start Date</span><span>End Date</span></div>
                </th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => editId === row.id ? (
                <tr key={row.id}>
                  {(() => {
                    const m4StartErr = form.m4_start_bad || !!(form.m4_planned_start && !isValidDate(form.m4_planned_start))
                    const m4EndErr   = form.m4_end_bad   || !!(form.m4_planned_end   && !isValidDate(form.m4_planned_end))
                    const m5StartErr = form.m5_start_bad || !!(form.m5_planned_start && !isValidDate(form.m5_planned_start))
                    const m5EndErr   = form.m5_end_bad   || !!(form.m5_planned_end   && !isValidDate(form.m5_planned_end))
                    const m4OrderErr = !m4StartErr && !m4EndErr && !!(form.m4_planned_start && form.m4_planned_end && form.m4_planned_end < form.m4_planned_start)
                    const m5OrderErr = !m5StartErr && !m5EndErr && !!(form.m5_planned_start && form.m5_planned_end && form.m5_planned_end < form.m5_planned_start)
                    return <>
                      <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput value={form.physical_level} onChange={v => setForm(p => ({ ...p, physical_level: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ width: 72 }}><InlineInput value={form.marketing_level} onChange={v => setForm(p => ({ ...p, marketing_level: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ width: 64 }}><InlineInput type="number" value={form.num_units} onChange={v => setForm(p => ({ ...p, num_units: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap" style={{ width: 80 }}><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
                    </>
                  })()}
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-semibold text-black">{row.physical_level}</td>
                  <td className="px-3 py-2 text-gray-600">{row.marketing_level || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.num_units ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m4_planned_start)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m4_planned_end)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m5_planned_start)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m5_planned_end)}</td>
                  {isAdmin && <td className="px-3 py-2"><div className="flex gap-1">
                    <button onClick={() => { setForm({ physical_level: row.physical_level, marketing_level: row.marketing_level ?? '', num_units: row.num_units ?? '', m4_planned_start: row.m4_planned_start ?? '', m4_planned_end: row.m4_planned_end ?? '', m5_planned_start: row.m5_planned_start ?? '', m5_planned_end: row.m5_planned_end ?? '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false }); setEditId(row.id) }} className="p-0.5 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                    <button onClick={() => setDeleteId(row.id)} className="p-0.5 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                  </div></td>}
                </tr>
              ))}
              {adding && (() => {
                const m4StartErr = form.m4_start_bad || !!(form.m4_planned_start && !isValidDate(form.m4_planned_start))
                const m4EndErr   = form.m4_end_bad   || !!(form.m4_planned_end   && !isValidDate(form.m4_planned_end))
                const m5StartErr = form.m5_start_bad || !!(form.m5_planned_start && !isValidDate(form.m5_planned_start))
                const m5EndErr   = form.m5_end_bad   || !!(form.m5_planned_end   && !isValidDate(form.m5_planned_end))
                const m4OrderErr = !m4StartErr && !m4EndErr && !!(form.m4_planned_start && form.m4_planned_end && form.m4_planned_end < form.m4_planned_start)
                const m5OrderErr = !m5StartErr && !m5EndErr && !!(form.m5_planned_start && form.m5_planned_end && form.m5_planned_end < form.m5_planned_start)
                return (
                  <tr>
                    <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput value={form.physical_level} onChange={v => setForm(p => ({ ...p, physical_level: v }))} placeholder="e.g. 1 or Outdoor" /></td>
                    <td className="px-2 py-1.5" style={{ width: 72 }}><InlineInput value={form.marketing_level} onChange={v => setForm(p => ({ ...p, marketing_level: v }))} placeholder="RD" /></td>
                    <td className="px-2 py-1.5" style={{ width: 64 }}><InlineInput type="number" value={form.num_units} onChange={v => setForm(p => ({ ...p, num_units: v }))} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ width: 80 }}><button onClick={() => save(null)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
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

function ParkingFloorSchedule({ projectId, buildingId, isAdmin, showToast, refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [adding, setAdding] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [form, setForm] = useState({})

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
    }
  }
  const blank = () => ({ physical_level: '', marketing_level: '', num_units: '', m4_planned_start: '', m4_planned_end: '', m5_planned_start: '', m5_planned_end: '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false })
  const save = async (id) => {
    const payload = { project_id: projectId, physical_level: form.physical_level?.trim(), marketing_level: form.marketing_level?.trim() || null, num_units: form.num_units !== '' ? parseInt(form.num_units) : null, m4_planned_start: form.m4_planned_start || null, m4_planned_end: form.m4_planned_end || null, m5_planned_start: form.m5_planned_start || null, m5_planned_end: form.m5_planned_end || null }
    if (!payload.physical_level) return
    if (noNeg(payload.num_units)) { showToast('Values cannot be negative.', 'error'); return }
    if (form.m4_start_bad || (form.m4_planned_start && !isValidDate(form.m4_planned_start))) { showToast('M4 Start Date is not a valid calendar date.', 'error'); return }
    if (form.m4_end_bad   || (form.m4_planned_end   && !isValidDate(form.m4_planned_end)))   { showToast('M4 End Date is not a valid calendar date.', 'error'); return }
    if (form.m5_start_bad || (form.m5_planned_start && !isValidDate(form.m5_planned_start))) { showToast('M5 Start Date is not a valid calendar date.', 'error'); return }
    if (form.m5_end_bad   || (form.m5_planned_end   && !isValidDate(form.m5_planned_end)))   { showToast('M5 End Date is not a valid calendar date.', 'error'); return }
    if (payload.m4_planned_start && payload.m4_planned_end && payload.m4_planned_end < payload.m4_planned_start) { showToast('M4 End Date cannot be earlier than M4 Start Date.', 'error'); return }
    if (payload.m5_planned_start && payload.m5_planned_end && payload.m5_planned_end < payload.m5_planned_start) { showToast('M5 End Date cannot be earlier than M5 Start Date.', 'error'); return }
    const { error } = id ? await supabase.from('project_parking_floors').update(payload).eq('id', id) : await supabase.from('project_parking_floors').insert({ ...payload, building_id: buildingId ?? null })
    if (error) { showToast(error.message, 'error'); return }
    showToast(id ? 'Updated.' : 'Added.', 'success'); setAdding(false); setEditId(null); load()
  }
  const bulkSave = async (floors) => {
    const rows = floors.map(f => ({ ...f, project_id: projectId, building_id: buildingId ?? null }))
    const { error } = await supabase.from('project_parking_floors').insert(rows)
    if (error) { showToast(error.message, 'error'); return }
    showToast(`${floors.length} parking floor${floors.length !== 1 ? 's' : ''} added.`, 'success')
    setBulkAdding(false)
    load()
  }
  const del = async (id) => { await supabase.from('project_parking_floors').delete().eq('id', id); load() }

  return (
    <div>
      <SectionHeader title="Parking Floor Schedule (M4 / M5)" action={isAdmin && !adding && (
        <div className="flex gap-1.5">
          <button onClick={() => { setForm(blank()); setAdding(true) }} className="text-xs font-semibold px-2.5 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"><PlusIcon /> Add One</button>
          <button onClick={() => setBulkAdding(true)} className="text-xs font-semibold px-2.5 py-1 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1"><PlusIcon /> Bulk Add</button>
        </div>
      )} />
      <div className="overflow-x-auto">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[900px]">
          <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 72 }}>Phys. Level</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 72 }}>Mktg. Level</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 64 }}>Slots</th>
                <th className="text-center px-3 py-2 font-semibold text-amber-500 uppercase tracking-wider" colSpan={2} style={{ minWidth: 120 }}>
                  <div>M4 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-amber-400"><span>Start Date</span><span>End Date</span></div>
                </th>
                <th className="text-center px-3 py-2 font-semibold text-green-600 uppercase tracking-wider" colSpan={2} style={{ minWidth: 120 }}>
                  <div>M5 Planned</div>
                  <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-green-500"><span>Start Date</span><span>End Date</span></div>
                </th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => editId === row.id ? (
                <tr key={row.id}>
                  {(() => {
                    const m4StartErr = form.m4_start_bad || !!(form.m4_planned_start && !isValidDate(form.m4_planned_start))
                    const m4EndErr   = form.m4_end_bad   || !!(form.m4_planned_end   && !isValidDate(form.m4_planned_end))
                    const m5StartErr = form.m5_start_bad || !!(form.m5_planned_start && !isValidDate(form.m5_planned_start))
                    const m5EndErr   = form.m5_end_bad   || !!(form.m5_planned_end   && !isValidDate(form.m5_planned_end))
                    const m4OrderErr = !m4StartErr && !m4EndErr && !!(form.m4_planned_start && form.m4_planned_end && form.m4_planned_end < form.m4_planned_start)
                    const m5OrderErr = !m5StartErr && !m5EndErr && !!(form.m5_planned_start && form.m5_planned_end && form.m5_planned_end < form.m5_planned_start)
                    return <>
                      <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput value={form.physical_level} onChange={v => setForm(p => ({ ...p, physical_level: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ width: 72 }}><InlineInput value={form.marketing_level} onChange={v => setForm(p => ({ ...p, marketing_level: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ width: 64 }}><InlineInput type="number" value={form.num_units} onChange={v => setForm(p => ({ ...p, num_units: v }))} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                      <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap" style={{ width: 80 }}><button onClick={() => save(row.id)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
                    </>
                  })()}
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-semibold text-black">{row.physical_level}</td>
                  <td className="px-3 py-2 text-gray-600">{row.marketing_level || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.num_units ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m4_planned_start)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m4_planned_end)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m5_planned_start)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(row.m5_planned_end)}</td>
                  {isAdmin && <td className="px-3 py-2"><div className="flex gap-1">
                    <button onClick={() => { setForm({ physical_level: row.physical_level, marketing_level: row.marketing_level ?? '', num_units: row.num_units ?? '', m4_planned_start: row.m4_planned_start ?? '', m4_planned_end: row.m4_planned_end ?? '', m5_planned_start: row.m5_planned_start ?? '', m5_planned_end: row.m5_planned_end ?? '', m4_start_bad: false, m4_end_bad: false, m5_start_bad: false, m5_end_bad: false }); setEditId(row.id) }} className="p-0.5 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                    <button onClick={() => setDeleteId(row.id)} className="p-0.5 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                  </div></td>}
                </tr>
              ))}
              {adding && (() => {
                const m4StartErr = form.m4_start_bad || !!(form.m4_planned_start && !isValidDate(form.m4_planned_start))
                const m4EndErr   = form.m4_end_bad   || !!(form.m4_planned_end   && !isValidDate(form.m4_planned_end))
                const m5StartErr = form.m5_start_bad || !!(form.m5_planned_start && !isValidDate(form.m5_planned_start))
                const m5EndErr   = form.m5_end_bad   || !!(form.m5_planned_end   && !isValidDate(form.m5_planned_end))
                const m4OrderErr = !m4StartErr && !m4EndErr && !!(form.m4_planned_start && form.m4_planned_end && form.m4_planned_end < form.m4_planned_start)
                const m5OrderErr = !m5StartErr && !m5EndErr && !!(form.m5_planned_start && form.m5_planned_end && form.m5_planned_end < form.m5_planned_start)
                return (
                  <tr>
                    <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput value={form.physical_level} onChange={v => setForm(p => ({ ...p, physical_level: v }))} placeholder="e.g. B1 or Roof Deck" /></td>
                    <td className="px-2 py-1.5" style={{ width: 72 }}><InlineInput value={form.marketing_level} onChange={v => setForm(p => ({ ...p, marketing_level: v }))} /></td>
                    <td className="px-2 py-1.5" style={{ width: 64 }}><InlineInput type="number" value={form.num_units} onChange={v => setForm(p => ({ ...p, num_units: v }))} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_start: v, m4_start_bad: !!bad }))} error={m4StartErr || m4OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m4_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m4_planned_end:   v, m4_end_bad:   !!bad }))} error={m4EndErr   || m4OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_start} onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_start: v, m5_start_bad: !!bad }))} error={m5StartErr || m5OrderErr} /></td>
                    <td className="px-2 py-1.5" style={{ minWidth: 100 }}><InlineInput type="date" value={form.m5_planned_end}   onChange={(v, bad) => setForm(p => ({ ...p, m5_planned_end:   v, m5_end_bad:   !!bad }))} error={m5EndErr   || m5OrderErr} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ width: 80 }}><button onClick={() => save(null)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button><button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button></td>
                  </tr>
                )
              })()}
              {rows.length === 0 && !adding && <EmptyRow cols={isAdmin ? 8 : 7} message="No parking floors added yet." />}
            </tbody>
          </table>
        </div>
      </div>
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
      {bulkAdding && <BulkAddFloorsModal unitLabel="Slots" onConfirm={bulkSave} onCancel={() => setBulkAdding(false)} />}
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

  if (!project.development_type) return (
    <div className="text-center py-16 text-gray-400 text-sm">
      <p className="mb-2">No development type set.</p>
      <p className="text-xs">Set it in the <span className="font-semibold text-gray-500">Overview</span> tab to unlock this section.</p>
    </div>
  )

  const handleExport = async () => {
    const pid = project.id
    const isCondo = project.development_type === 'condominium'
    if (!isCondo) { showToast('Export is only available for condominium projects.', 'error'); return }
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
      const isCondo = project.development_type === 'condominium'
      if (!isCondo) { showToast('Import is only available for condominium projects.', 'error'); return }

      // ── 1. Build raw floor rows (building_id resolved after upsert) ──────────
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

      // ── 2. Validate ───────────────────────────────────────────────────────────
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

      // ── 3. Upsert buildings, build name→id map ────────────────────────────────
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

      // ── 4. Commit ─────────────────────────────────────────────────────────────
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

  const typeBadge = project.development_type === 'housing'
    ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">Housing</span>
    : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-200">Condominium</span>

  if (project.development_type === 'housing') {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-white">
          <div className="py-3">{typeBadge}</div>
        </div>
        <div className="py-8 text-center text-gray-400 text-sm">
          Floor schedule is not available for housing projects.
        </div>
      </div>
    )
  }

  return (
    <CondominiumDevelopmentTab project={project} isAdmin={isAdmin} showToast={showToast} devRefreshKey={devRefreshKey} typeBadge={typeBadge} onExport={handleExport} onImport={handleImport} importing={importing} importErrors={importErrors} onDismissImportErrors={() => setImportErrors([])} />
  )
}

function CondominiumDevelopmentTab({ project, isAdmin, showToast, devRefreshKey = 0, typeBadge, onExport, onImport, importing, importErrors = [], onDismissImportErrors }) {
  const [floorRefreshKey, setFloorRefreshKey] = useState(0)
  const [buildingId, setBuildingId]           = useState(null)

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={onDismissImportErrors} />
        <div className="py-3 flex items-center justify-between gap-2 flex-wrap">
          {typeBadge}
          <ExcelButtons onExport={onExport} onImport={onImport} importing={importing} />
        </div>
      </div>

      <BuildingSelector
        projectId={project.id}
        isAdmin={isAdmin}
        buildingId={buildingId}
        onChange={setBuildingId}
      />

      <ProjectFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={Math.max(floorRefreshKey, devRefreshKey)} />
      <ParkingFloorSchedule projectId={project.id} buildingId={buildingId} isAdmin={isAdmin} showToast={showToast} refreshKey={devRefreshKey} />
    </div>
  )
}

// ── Compliance Tab ────────────────────────────────────────────────────────────

const COMPLIANCE_STATUS_MAP_IN = { 'Done': 'done', 'Ongoing': 'ongoing', 'Not Yet Started': 'not_yet_started' }
const COMPLIANCE_STATUS_MAP_OUT = { done: 'Done', ongoing: 'Ongoing', not_yet_started: 'Not Yet Started' }

// Free-form combobox for permit names — allows custom values while suggesting
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

    // Always re-check the DB directly — don't trust cached state
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

    // No permits yet — auto-populate from standard_permits
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

      {/* Filter bar */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
            <option value="all">All Statuses</option>
            {PERMIT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {filterStatus !== 'all' && (
            <button onClick={() => setFilterStatus('all')} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 bg-white transition">Clear</button>
          )}
          <span className="ml-auto text-[11px] text-gray-400">
            {totalL1} permit{totalL1 !== 1 ? 's' : ''}{totalL2 > 0 ? `, ${totalL2} sub-requirement${totalL2 !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      )}

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
                  {/* ── L1 row ── */}
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
                    <tr className="border-t border-gray-100 hover:bg-gray-50/40 transition" style={{ background: 'rgba(237,96,85,0.025)' }}>
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
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${stCfg.badge}`}>
                          {stCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{l1.remarks || '—'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
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

                  {/* ── L2 rows ── */}
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
                      <tr key={child.id} className="border-t border-gray-50 bg-gray-50/40 hover:bg-gray-50 transition">
                        <td className="pl-12 pr-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                            <span className="text-xs text-gray-700 font-medium">{child.permit_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PERMIT_STATUS_MAP[child.status]?.badge ?? 'bg-gray-100 text-gray-500'}`}>
                            {PERMIT_STATUS_MAP[child.status]?.label ?? child.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{child.remarks || '—'}</td>
                        {isAdmin && (
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
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

      {/* ── Add Permit Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddModal(false)}>
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
                      <option value="">— Choose a Level 1 permit —</option>
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
                        <option value="">— None (add as Level 1) —</option>
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

// ── Milestones Tab ────────────────────────────────────────────────────────────

const MILESTONE_PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]

const MILESTONE_PHASE_MAP_OUT = { initiation: 'Initiation', planning: 'Planning', execution_monitoring: 'Execution & Monitoring', closeout: 'Close-Out' }
const MILESTONE_PHASE_MAP_IN  = Object.fromEntries(Object.entries(MILESTONE_PHASE_MAP_OUT).map(([k, v]) => [v, k]))

function MilestonesTab({ project, isAdmin, showToast }) {
  const [baselines, setBaselines]     = useState([])   // [{id, label, created_at}]
  const [activeBL, setActiveBL]       = useState(null) // baseline id or null (no data yet)
  const [rows, setRows]               = useState([])
  const [activePhase, setActivePhase] = useState('initiation')
  const [editId, setEditId]           = useState(null)
  const [deleteId, setDeleteId]       = useState(null)
  const [form, setForm]               = useState({})
  const [importing, setImporting]     = useState(false)
  const [importErrors, setImportErrors] = useState([])
  const [deleteBLId, setDeleteBLId]   = useState(null)
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [blNameInput, setBlNameInput] = useState('')

  // Load baselines on mount; set activeBL to the latest one
  useEffect(() => {
    loadBaselines()
  }, [project.id])

  // Load rows whenever activeBL changes
  useEffect(() => {
    if (activeBL) load(activeBL)
    else setRows([])
  }, [activeBL])

  const loadBaselines = async () => {
    const { data } = await supabase
      .from('milestone_baselines')
      .select('id, label, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setBaselines(data)
      setActiveBL(data[data.length - 1].id)
    } else {
      setBaselines([])
      setActiveBL(null)
    }
  }

  const deleteBaseline = async (blId) => {
    await supabase.from('project_milestones').delete().eq('baseline_id', blId)
    await supabase.from('milestone_baselines').delete().eq('id', blId)
    showToast('Baseline deleted.', 'success')
    loadBaselines()
  }

  const load = async (blId) => {
    const { data } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', project.id)
      .eq('baseline_id', blId)
      .order('sort_order')
    if (data) setRows(data)
  }

  const switchPhase = (phase) => { setActivePhase(phase); setEditId(null) }

  const save = async (id) => {
    const actual_start    = form.actual_start    || null
    const actual_end      = form.actual_end      || null
    const payload = {
      project_id: project.id, phase: activePhase,
      milestone_name:  form.milestone_name?.trim(),
      planned_start:   form.planned_start   || null, planned_end:   form.planned_end || null,
      actual_start,    actual_end,
      projected_start: actual_start ?? (form.projected_start || null),
      projected_end:   actual_end   ?? (form.projected_end   || null),
      parent_id:       form.parent_id ?? null,
    }
    if (!payload.milestone_name) return
    if (form.planned_start_bad   || (form.planned_start   && !isValidDate(form.planned_start)))   { showToast('Planned Start Date is not a valid calendar date.',   'error'); return }
    if (form.planned_end_bad     || (form.planned_end     && !isValidDate(form.planned_end)))     { showToast('Planned End Date is not a valid calendar date.',     'error'); return }
    if (form.actual_start_bad    || (form.actual_start    && !isValidDate(form.actual_start)))    { showToast('Actual Start Date is not a valid calendar date.',    'error'); return }
    if (form.actual_end_bad      || (form.actual_end      && !isValidDate(form.actual_end)))      { showToast('Actual End Date is not a valid calendar date.',      'error'); return }
    if (form.projected_start_bad || (form.projected_start && !isValidDate(form.projected_start))) { showToast('Projected Start Date is not a valid calendar date.', 'error'); return }
    if (form.projected_end_bad   || (form.projected_end   && !isValidDate(form.projected_end)))   { showToast('Projected End Date is not a valid calendar date.',   'error'); return }
    if (payload.planned_start   && payload.planned_end   && payload.planned_end   < payload.planned_start)   { showToast('Planned end must be on or after planned start.',   'error'); return }
    if (payload.actual_start    && payload.actual_end    && payload.actual_end    < payload.actual_start)    { showToast('Actual end must be on or after actual start.',     'error'); return }
    if (payload.projected_start && payload.projected_end && payload.projected_end < payload.projected_start) { showToast('Projected end must be on or after projected start.','error'); return }
    const { error } = await supabase.from('project_milestones').update(payload).eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Updated.', 'success')
    setEditId(null); load(activeBL)
  }

  const del = async (id) => { await supabase.from('project_milestones').delete().eq('id', id); load(activeBL) }

  const handleExport = async () => {
    // Only export child rows (and parentless standalone rows).
    // Parent rows are grouping headers — their dates are auto-computed, so we omit them.
    const exportRows = []
    MILESTONE_PHASES.forEach(({ key: phase }) => {
      const pRows   = rows.filter(r => r.phase === phase)
      const parents = pRows.filter(r => !r.parent_id)
      const idToName = Object.fromEntries(pRows.map(r => [r.id, r.milestone_name]))
      parents.forEach(parent => {
        const children = pRows.filter(r => r.parent_id === parent.id)
        if (children.length > 0) {
          // Parent has children — export only children, parent name goes in Parent Milestone column
          children.forEach(c => exportRows.push({ ...c, _parentName: parent.milestone_name }))
        } else {
          // Standalone (no children) — export as a regular row with no parent
          exportRows.push({ ...parent, _parentName: '' })
        }
      })
    })

    const blLabel = baselines.find(b => b.id === activeBL)?.label ?? ''

    await downloadWorkbook([{
      sheetName: 'Milestones',
      rows: exportRows.map(r => ({
        phase:           MILESTONE_PHASE_MAP_OUT[r.phase] ?? r.phase,
        milestone_name:  r.milestone_name,
        parent_name:     r._parentName ?? '',
        planned_start:   r.planned_start   ?? '',
        planned_end:     r.planned_end     ?? '',
        actual_start:    r.actual_start ?? '',
        actual_end:      r.actual_end   ?? '',
        projected_start: r.actual_start ?? r.projected_start ?? '',
        projected_end:   r.actual_end   ?? r.projected_end   ?? '',
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
    }], `${project.name}_milestones${blLabel ? `_${blLabel}` : ''}.xlsx`)
  }

  const handleImportRequest = (file) => {
    setPendingImportFile(file)
    setBlNameInput('')
  }

  const handleImport = async (file, label) => {
    setImporting(true); setImportErrors([])
    try {
      const sheets  = await parseWorkbook(file)
      const pid     = project.id
      const rawRows = sheets['Milestones'] ?? Object.values(sheets)[0] ?? []

      // ── 1. Parse rows ─────────────────────────────────────────────────────────
      // New format: "Parent Milestone" column holds parent name; parent rows are not in the file.
      // Legacy fallback: "- " prefix on Milestone Name.
      const newRows = []
      // Track legacy sequential parent for "- " prefix fallback
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
          project_id: pid,
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

      // ── 2. Validate ───────────────────────────────────────────────────────────
      const errors = []
      rawRows.forEach((r, i) => {
        const rawName = String(r['Milestone Name'] ?? '').trim()
        const name    = rawName.startsWith('- ') ? rawName.slice(2).trim() : rawName
        if (!name) return
        const lbl = `Row ${i + 2} "${name}"`
        if (r['Planned Start']   && !isValidRawDate(r['Planned Start']))   errors.push(`${lbl}: Planned Start is not a valid calendar date.`)
        if (r['Planned End']     && !isValidRawDate(r['Planned End']))     errors.push(`${lbl}: Planned End is not a valid calendar date.`)
        if (r['Actual Start']    && !isValidRawDate(r['Actual Start']))    errors.push(`${lbl}: Actual Start is not a valid calendar date.`)
        if (r['Actual End']      && !isValidRawDate(r['Actual End']))      errors.push(`${lbl}: Actual End is not a valid calendar date.`)
        if (r['Projected Start'] && !isValidRawDate(r['Projected Start'])) errors.push(`${lbl}: Projected Start is not a valid calendar date.`)
        if (r['Projected End']   && !isValidRawDate(r['Projected End']))   errors.push(`${lbl}: Projected End is not a valid calendar date.`)
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

      // ── 3. Create new baseline ────────────────────────────────────────────────
      const { data: blData, error: blErr } = await supabase
        .from('milestone_baselines')
        .insert({ project_id: pid, label })
        .select('id')
        .single()
      if (blErr) throw blErr
      const blId = blData.id

      // ── 4. Insert synthetic parents, then children ───────────────────────────
      // Collect unique parent names referenced by children (order-preserving)
      const uniqueParentNames = [...new Set(newRows.map(r => r._parentName).filter(Boolean))]
      const parentNameToDbId = {}

      if (uniqueParentNames.length > 0) {
        const { data: ins, error: pErr } = await supabase
          .from('project_milestones')
          .insert(uniqueParentNames.map((name, i) => ({
            project_id: pid,
            baseline_id: blId,
            phase: newRows.find(r => r._parentName === name)?.phase ?? 'initiation',
            milestone_name: name,
            sort_order: -(uniqueParentNames.length - i),
          })))
          .select('id')
        if (pErr) throw pErr
        uniqueParentNames.forEach((name, i) => { parentNameToDbId[name] = ins[i].id })
      }

      // Insert all rows (children reference their synthetic parent; standalones have no parent)
      const { error: cErr } = await supabase.from('project_milestones').insert(
        newRows.map(({ _parentName, ...rest }) => ({
          ...rest,
          baseline_id: blId,
          parent_id: _parentName ? (parentNameToDbId[_parentName] ?? null) : null,
        }))
      )
      if (cErr) throw cErr

      // Refresh baselines list then switch to the new BL
      const { data: newBLs } = await supabase
        .from('milestone_baselines')
        .select('id, label, created_at')
        .eq('project_id', pid)
        .order('created_at', { ascending: true })
      if (newBLs) {
        setBaselines(newBLs)
        setActiveBL(blId)
      }
      showToast(`Imported as ${label}.`, 'success')
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const phaseRows = rows.filter(r => r.phase === activePhase)
  const totalCols = isAdmin ? 8 : 7

  // Derive parent dates from children per the agreed rules
  const computeParentDates = (children) => {
    if (!children.length) return {}
    const minStr = (vals) => vals.filter(Boolean).sort()[0] ?? null
    const maxStr = (vals) => vals.filter(Boolean).sort().at(-1) ?? null
    const planned_start   = minStr(children.map(c => c.planned_start))
    const planned_end     = maxStr(children.map(c => c.planned_end))
    const actual_start    = minStr(children.map(c => c.actual_start))
    // actual_end: only if ALL children have actual_end
    const actual_end      = children.every(c => c.actual_end)
      ? maxStr(children.map(c => c.actual_end))
      : null
    // projected_start: only if NO child has actual_start
    const projected_start = children.every(c => !c.actual_start)
      ? minStr(children.map(c => c.projected_start))
      : null
    const projected_end   = maxStr(children.map(c => c.projected_end))
    return { planned_start, planned_end, actual_start, actual_end, projected_start, projected_end }
  }

  const editCells = (rowId, onCancel) => {
    const hasActualStart  = !!form.actual_start
    const hasActualEnd    = !!form.actual_end
    const nameLocked      = hasActualStart || hasActualEnd

    const plannedStartErr   = form.planned_start_bad   || !!(form.planned_start   && !isValidDate(form.planned_start))
    const plannedEndErr     = form.planned_end_bad     || !!(form.planned_end     && !isValidDate(form.planned_end))
    const actualStartErr    = form.actual_start_bad    || !!(form.actual_start    && !isValidDate(form.actual_start))
    const actualEndErr      = form.actual_end_bad      || !!(form.actual_end      && !isValidDate(form.actual_end))
    const projectedStartErr = !hasActualStart && (form.projected_start_bad || !!(form.projected_start && !isValidDate(form.projected_start)))
    const projectedEndErr   = !hasActualEnd   && (form.projected_end_bad   || !!(form.projected_end   && !isValidDate(form.projected_end)))
    const plannedOrderErr   = !plannedStartErr   && !plannedEndErr   && !!(form.planned_start   && form.planned_end   && form.planned_end   < form.planned_start)
    const actualOrderErr    = !actualStartErr    && !actualEndErr    && !!(form.actual_start    && form.actual_end    && form.actual_end    < form.actual_start)
    const projectedOrderErr = !hasActualStart && !hasActualEnd && !projectedStartErr && !projectedEndErr && !!(form.projected_start && form.projected_end && form.projected_end < form.projected_start)

    const projStartVal = hasActualStart ? form.actual_start : form.projected_start
    const projEndVal   = hasActualEnd   ? form.actual_end   : form.projected_end

    return (
      <>
        <td className="px-3 py-1.5"><InlineInput value={form.milestone_name} onChange={v => setForm(p => ({ ...p, milestone_name: v }))} disabled={nameLocked} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={form.planned_start}   onChange={(v, bad) => setForm(p => ({ ...p, planned_start:   v, planned_start_bad:   !!bad }))} max={form.planned_end    || undefined} error={plannedStartErr   || plannedOrderErr} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={form.planned_end}     onChange={(v, bad) => setForm(p => ({ ...p, planned_end:     v, planned_end_bad:     !!bad }))} min={form.planned_start  || undefined} error={plannedEndErr     || plannedOrderErr} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={form.actual_start}    onChange={(v, bad) => setForm(p => ({ ...p, actual_start: v, actual_start_bad: !!bad, projected_start: v || p.projected_start }))} max={form.actual_end     || undefined} error={actualStartErr    || actualOrderErr} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={form.actual_end}      onChange={(v, bad) => setForm(p => ({ ...p, actual_end:   v, actual_end_bad:   !!bad, projected_end:   v || p.projected_end   }))} min={form.actual_start   || undefined} error={actualEndErr      || actualOrderErr} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={projStartVal} onChange={(v, bad) => setForm(p => ({ ...p, projected_start: v, projected_start_bad: !!bad }))} max={projEndVal || undefined} error={projectedStartErr || projectedOrderErr} disabled={hasActualStart} /></td>
        <td className="px-2 py-1.5" style={{ minWidth: 120 }}><InlineInput type="date" value={projEndVal}   onChange={(v, bad) => setForm(p => ({ ...p, projected_end:   v, projected_end_bad:   !!bad }))} min={projStartVal || undefined} error={projectedEndErr   || projectedOrderErr} disabled={hasActualEnd} /></td>
        <td className="px-3 py-1.5 whitespace-nowrap sticky right-0 bg-white border-l border-gray-100">
          <button onClick={() => save(rowId)} className="text-xs font-semibold text-[#ed6055] hover:text-[#d94f45] mr-2">Save</button>
          <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </td>
      </>
    )
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />
        {/* Phase tabs + BL selector */}
        <div className="py-3 flex gap-1 flex-wrap items-center">
          {MILESTONE_PHASES.map(p => {
            const count  = rows.filter(r => r.phase === p.key).length
            const active = activePhase === p.key
            return (
              <button key={p.key} onClick={() => switchPhase(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {p.label}
                <span className={`text-[10px] font-bold ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            {/* BL dropdown + delete */}
            {baselines.length > 0 && (
              <>
                <select
                  value={activeBL ?? ''}
                  onChange={e => { setActiveBL(e.target.value); setEditId(null) }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ed6055] font-semibold"
                >
                  {baselines.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
                {isAdmin && activeBL && (
                  <button
                    onClick={() => setDeleteBLId(activeBL)}
                    title="Delete selected baseline"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs font-semibold transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete BL
                  </button>
                )}
              </>
            )}
            <ExcelButtons onExport={handleExport} onImport={handleImportRequest} importing={importing} />
          </div>
        </div>
      </div>

      {activeBL === null ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-sm font-medium">No milestone data yet.</p>
          <p className="text-xs mt-1">Import an Excel file to create the first baseline (BL0).</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[1200px]">
            <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-gray-200 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-gray-100">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 160 }}>Milestone</th>
                  <th className="text-center px-3 py-2 font-semibold text-blue-500 uppercase tracking-wider" colSpan={2} style={{ minWidth: 260 }}>
                    <div>Planned</div>
                    <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-blue-400"><span>Start Date</span><span>End Date</span></div>
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-red-500 uppercase tracking-wider" colSpan={2} style={{ minWidth: 260 }}>
                    <div>Actual</div>
                    <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-red-400"><span>Start Date</span><span>End Date</span></div>
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-green-600 uppercase tracking-wider" colSpan={2} style={{ minWidth: 260 }}>
                    <div>Projected</div>
                    <div className="flex justify-around mt-0.5 normal-case tracking-normal font-medium text-[10px] text-green-500"><span>Start Date</span><span>End Date</span></div>
                  </th>
                  {isAdmin && <th className="sticky right-0 bg-gray-50 z-10" style={{ width: 96 }} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  const parents = phaseRows.filter(r => !r.parent_id)
                  const childrenOf = id => phaseRows.filter(r => r.parent_id === id)
                  if (parents.length === 0) return <EmptyRow cols={totalCols} message={`No milestones for ${MILESTONE_PHASES.find(p => p.key === activePhase)?.label}.`} />
                  return (
                    <>
                      {parents.map(parent => {
                        const children = childrenOf(parent.id)
                        const pd = children.length ? computeParentDates(children) : parent
                        return (
                          <Fragment key={parent.id}>
                            {/* Parent row — dates computed from children */}
                            {editId === parent.id ? (
                              <tr>{editCells(parent.id, () => setEditId(null))}</tr>
                            ) : (
                              <tr className="hover:bg-gray-50/50">
                                <td className="px-4 py-2.5 font-semibold text-black">{parent.milestone_name}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.planned_start)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.planned_end)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.actual_start)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.actual_end)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.projected_start)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{fmt(pd.projected_end)}</td>
                                {isAdmin && (
                                  <td className="px-3 py-2.5 sticky right-0 bg-white border-l border-gray-100">
                                    <div className="flex gap-1 items-center">
                                      <button onClick={() => { setForm({ milestone_name: parent.milestone_name, planned_start: parent.planned_start ?? '', planned_end: parent.planned_end ?? '', actual_start: parent.actual_start ?? '', actual_end: parent.actual_end ?? '', projected_start: parent.actual_start ?? parent.projected_start ?? '', projected_end: parent.actual_end ?? parent.projected_end ?? '', parent_id: null, planned_start_bad: false, planned_end_bad: false, actual_start_bad: false, actual_end_bad: false, projected_start_bad: false, projected_end_bad: false }); setEditId(parent.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                                      <button onClick={() => setDeleteId(parent.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )}

                            {/* Child rows */}
                            {children.map(child => (
                              editId === child.id ? (
                                <tr key={child.id} className="bg-gray-50/40">{editCells(child.id, () => setEditId(null))}</tr>
                              ) : (
                                <tr key={child.id} className="bg-gray-50/40 hover:bg-gray-100/60">
                                  <td className="py-2 pr-3" style={{ paddingLeft: 28 }}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-300 text-[11px] flex-shrink-0">└</span>
                                      <span className="text-gray-600 font-medium">{child.milestone_name}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.planned_start)}</td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.planned_end)}</td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.actual_start)}</td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.actual_end)}</td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.projected_start)}</td>
                                  <td className="px-3 py-2 text-gray-400">{fmt(child.projected_end)}</td>
                                  {isAdmin && (
                                    <td className="px-3 py-2 sticky right-0 bg-gray-50/40 border-l border-gray-100">
                                      <div className="flex gap-1">
                                        <button onClick={() => { setForm({ milestone_name: child.milestone_name, planned_start: child.planned_start ?? '', planned_end: child.planned_end ?? '', actual_start: child.actual_start ?? '', actual_end: child.actual_end ?? '', projected_start: child.actual_start ?? child.projected_start ?? '', projected_end: child.actual_end ?? child.projected_end ?? '', parent_id: child.parent_id, planned_start_bad: false, planned_end_bad: false, actual_start_bad: false, actual_end_bad: false, projected_start_bad: false, projected_end_bad: false }); setEditId(child.id) }} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
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
                    </>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {deleteId !== null && <ConfirmDeleteModal onConfirm={() => { del(deleteId); setDeleteId(null) }} onCancel={() => setDeleteId(null)} />}
      {pendingImportFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={() => setPendingImportFile(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-1">Name this baseline</h3>
            <p className="text-sm text-gray-500 mb-4">Give a name to identify this baseline (e.g. BL0, Initial, Revised).</p>
            <input
              autoFocus
              type="text"
              value={blNameInput}
              onChange={e => setBlNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && blNameInput.trim()) {
                  const file = pendingImportFile
                  const label = blNameInput.trim()
                  setPendingImportFile(null)
                  handleImport(file, label)
                }
              }}
              placeholder="e.g. BL0"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] mb-5"
            />
            <div className="flex gap-3">
              <button onClick={() => setPendingImportFile(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button
                disabled={!blNameInput.trim()}
                onClick={() => {
                  const file = pendingImportFile
                  const label = blNameInput.trim()
                  setPendingImportFile(null)
                  handleImport(file, label)
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >Import</button>
            </div>
          </div>
        </div>
      )}
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
                onClick={() => { deleteBaseline(deleteBLId); setDeleteBLId(null) }}
                className="flex-1 py-2.5 rounded-xl bg-[#ed6055] text-white text-sm font-semibold hover:bg-[#d94f45] transition"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issues & Concerns Tab ─────────────────────────────────────────────────────

const ISSUE_STATUS_MAP_OUT = { open: 'Open', close: 'Close', hold: 'Hold' }
const ISSUE_STATUS_MAP_IN  = { Open: 'open', Close: 'close', Hold: 'hold' }

function IssuesTab({ project, isAdmin, showToast }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)   // 'view' | 'add' | 'edit' | 'delete'
  const [active, setActive]   = useState(null)
  const [form, setForm]       = useState(ISSUE_EMPTY)
  const [saving, setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [filterStatus, setFilterStatus]       = useState('all')
  const [filterGroup, setFilterGroup]         = useState('all')
  const [filterMgmtLevel, setFilterMgmtLevel] = useState('all')
  const [importing, setImporting]             = useState(false)
  const [importErrors, setImportErrors]       = useState([])

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
      // Validate dates against raw Excel values before toDateStr auto-corrects overflow
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
    return matchStatus && matchGroup && matchMgmtLevel
  })
  const hasFilter = filterStatus !== 'all' || filterGroup !== 'all' || filterMgmtLevel !== 'all'
  const clearFilters = () => { setFilterStatus('all'); setFilterGroup('all'); setFilterMgmtLevel('all') }

  const iCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-black bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055] focus:border-transparent'
  const fCls = 'flex-1 min-w-[110px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055]'
  const isForm = modal === 'add' || modal === 'edit'

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white">
        <ImportErrorPanel errors={importErrors} onDismiss={() => setImportErrors([])} />
        <SectionHeader sticky title="Issues & Concerns" action={
          <div className="flex items-center gap-2">
            <ExcelButtons onExport={handleExport} onImport={handleImport} importing={importing} />
            {isAdmin && (
              <button onClick={openAdd} className="text-xs font-semibold px-3 py-1.5 bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition flex items-center gap-1">
                <PlusIcon /> Add Issue
              </button>
            )}
          </div>
        } />
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={fCls}>
            <option value="all">All Statuses</option>
            {Object.entries(ISSUE_STATUS_CONFIG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
          </select>
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} className={fCls}>
            <option value="all">All Groups</option>
            {ISSUE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterMgmtLevel} onChange={e => setFilterMgmtLevel(e.target.value)} className={fCls}>
            <option value="all">All Mgmt Levels</option>
            {MANAGEMENT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {hasFilter && (
            <button onClick={clearFilters} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 bg-white transition whitespace-nowrap">
              Clear
            </button>
          )}
        </div>
      )}

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
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Issue', 'Group', 'Management Level', 'Status', 'Date Presented', 'Days Aging', ...(isAdmin ? [''] : [])].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(row => {
                const sc    = ISSUE_STATUS_CONFIG[row.status] ?? ISSUE_STATUS_CONFIG.open
                const aging = issueAgingDays(row.date_presented)
                return (
                  <tr key={row.id} onClick={() => openView(row)} className="hover:bg-gray-50/60 cursor-pointer" style={{ boxShadow: 'inset 3px 0 0 #ed6055' }}>
                    <td className="px-4 py-2.5 text-black max-w-[260px]"><p className="line-clamp-2">{row.details}</p></td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.issue_group || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.management_level || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtIssueDate(row.date_presented)}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {aging !== null ? `${aging}d` : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(row)} className="p-1 text-gray-400 hover:text-blue-600"><PencilIcon /></button>
                          <button onClick={() => setDeleteId(row.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon /></button>
                        </div>
                      </td>
                    )}
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

      {/* View modal */}
      {modal === 'view' && active && (() => {
        const sc    = ISSUE_STATUS_CONFIG[active.status] ?? ISSUE_STATUS_CONFIG.open
        const aging = issueAgingDays(active.date_presented)
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={close}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
              style={{ borderTop: '4px solid #ed6055' }} onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <p className="text-sm font-bold text-black">Issue Detail</p>
                <button onClick={close} className="p-1.5 text-gray-400 hover:text-black transition"><XIcon /></button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                {/* Left — red panel */}
                <div className="w-44 flex-shrink-0 bg-[#ed6055] px-4 py-5 space-y-4 overflow-y-auto">
                  {[
                    { label: 'Status',            value: sc.label },
                    { label: 'Group',             value: active.issue_group },
                    { label: 'Management Level',  value: active.management_level },
                    { label: 'Date Presented',    value: fmtIssueDate(active.date_presented) },
                    { label: 'Days Aging',        value: aging !== null ? `${aging} day${aging !== 1 ? 's' : ''}` : null },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-white/70 mb-1">{label}</p>
                      <div className="bg-white rounded-lg px-3 py-2 text-sm font-medium text-black">
                        {value || <span className="text-gray-400 italic font-normal">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Right — content */}
                <div className="flex-1 px-5 py-5 space-y-4 overflow-y-auto">
                  {[
                    { label: 'Issue',             value: active.details },
                    { label: 'Caused By',         value: active.caused_by },
                    { label: 'Action Steps', value: active.action_steps },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="bg-gray-100 px-4 py-1.5 rounded-t-lg">
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</p>
                      </div>
                      <div className="border border-gray-100 border-t-0 rounded-b-lg px-4 py-3 min-h-[60px] text-sm text-black leading-relaxed whitespace-pre-wrap">
                        {value || <span className="text-gray-300 italic">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
                <button onClick={close} className="px-4 py-2 text-sm font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition">Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add / Edit modal */}
      {isForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden"
            style={{ borderTop: '4px solid #ed6055' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold text-black">{modal === 'add' ? 'Add Issue' : 'Edit Issue'}</h3>
              <button onClick={close} className="text-gray-400 hover:text-black transition"><XIcon /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Group</label>
                <select value={form.issue_group} onChange={e => setForm(f => ({ ...f, issue_group: e.target.value }))} className={iCls}>
                  <option value="">— Select Group —</option>
                  {ISSUE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Management Level</label>
                <select value={form.management_level} onChange={e => setForm(f => ({ ...f, management_level: e.target.value }))} className={iCls}>
                  <option value="">— Select Level —</option>
                  {MANAGEMENT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={iCls}>
                  {Object.entries(ISSUE_STATUS_CONFIG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date Presented</label>
                <input type="date" value={form.date_presented} onChange={e => setForm(f => ({ ...f, date_presented: e.target.value, date_bad: e.target.validity.badInput }))} className={`${iCls} ${(form.date_bad || (form.date_presented && !isValidDate(form.date_presented))) ? 'border-red-400 bg-red-50 text-red-600 focus:ring-red-400 focus:border-transparent' : ''}`} />
                {(form.date_bad || (form.date_presented && !isValidDate(form.date_presented))) && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Issue <span className="text-[#ed6055]">*</span></label>
                <textarea rows={3} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} placeholder="Describe the issue…" className={iCls + ' resize-none'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Caused By</label>
                <textarea rows={3} value={form.caused_by} onChange={e => setForm(f => ({ ...f, caused_by: e.target.value }))} placeholder="Root cause…" className={iCls + ' resize-none'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Action Steps</label>
                <textarea rows={3} value={form.action_steps} onChange={e => setForm(f => ({ ...f, action_steps: e.target.value }))} placeholder="Steps taken or planned…" className={iCls + ' resize-none'} />
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
      )}

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

// ── Completion Tab ────────────────────────────────────────────────────────────

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
  none: { label: 'Not Started',              cell: 'bg-white text-gray-600 border-gray-200',      dot: 'bg-gray-300' },
  m4:   { label: 'M4 – Construction Complete', cell: 'bg-yellow-300 text-yellow-900 border-yellow-400', dot: 'bg-yellow-400' },
  m5:   { label: 'M5 – Handover Complete',    cell: 'bg-green-500 text-white border-green-600',   dot: 'bg-green-500' },
}

function UnitGrid({ floorList, cMap, maxU, type, emptyMsg, isAdmin, multiSelectMode, selectedCells, onToggleCell, onOpenCell, onToggleRow }) {
  if (floorList.length === 0) return (
    <p className="text-xs text-gray-400 italic py-4">{emptyMsg}</p>
  )
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[64px]">Floor</th>
            {Array.from({ length: maxU }, (_, i) => (
              <th key={i} className="px-1 py-1.5 text-center text-[10px] font-semibold text-gray-400 min-w-[44px]">
                {String(i + 1).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {floorList.map(floor => (
            <tr key={floor.id} className="border-t border-gray-100">
              <td
                onClick={isAdmin ? () => onToggleRow(type, floor) : undefined}
                title={isAdmin ? `Select all in ${floor.physical_level}F` : undefined}
                className={`px-3 py-1 font-semibold whitespace-nowrap sticky left-0 bg-white z-10 transition ${isAdmin ? 'text-gray-700 hover:text-[#ed6055] cursor-pointer select-none' : 'text-gray-700'}`}
              >{floor.physical_level}F</td>
              {Array.from({ length: maxU }, (_, i) => {
                const unitNum = i + 1
                if (unitNum > (floor.num_units ?? 0)) {
                  return <td key={i} className="px-1 py-1 opacity-0 pointer-events-none"><span className="w-10 h-8 block" /></td>
                }
                const c = cMap[`${floor.id}-${unitNum}`]
                const status = c?.status ?? 'none'
                const cfg = UNIT_STATUS_CONFIG[status]
                const key = cellKey(type, floor.id, unitNum)
                const isSelected = multiSelectMode && selectedCells.has(key)
                return (
                  <td key={i} className="px-1 py-1">
                    <button
                      onClick={isAdmin ? (multiSelectMode ? () => onToggleCell(type, floor, unitNum) : () => onOpenCell(type, floor, unitNum)) : undefined}
                      title={`${floor.physical_level}-${String(unitNum).padStart(2, '0')} — ${cfg.label}`}
                      className={`w-10 h-8 rounded border text-[9px] font-bold transition ${cfg.cell} ${isAdmin ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-2 ring-[#ed6055] ring-offset-1' : (isAdmin && !multiSelectMode ? 'hover:opacity-75 hover:shadow-md' : '')}`}
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
  )
}

function CompletionTab({ project, isAdmin, showToast }) {
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

  const sortFloors = arr => [...(arr ?? [])].sort((a, b) => {
    const na = parseFloat(a.physical_level), nb = parseFloat(b.physical_level)
    if (!isNaN(na) && !isNaN(nb)) return nb - na
    return b.physical_level.localeCompare(a.physical_level)
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

  const openCell = (type, floor, unitNum) => {
    const cMap = type === 'parking' ? parkingCompletionMap : completionMap
    const existing = cMap[`${floor.id}-${unitNum}`] ?? null
    setSelected({ type, floor, unitNum, existing })
    setCellForm({ status: existing?.status ?? 'none', m4_date: existing?.m4_date ?? '', m5_date: existing?.m5_date ?? '', m4_bad: false, m5_bad: false })
  }

  const saveCell = async () => {
    if (!selected) return
    if (cellForm.m4_bad || (cellForm.m4_date && !isValidDate(cellForm.m4_date))) {
      showToast('M4 date is not a valid calendar date.', 'error'); return
    }
    if (cellForm.m5_bad || (cellForm.m5_date && !isValidDate(cellForm.m5_date))) {
      showToast('M5 date is not a valid calendar date.', 'error'); return
    }
    if (cellForm.status === 'm5' && cellForm.m4_date && cellForm.m5_date && cellForm.m5_date < cellForm.m4_date) {
      showToast('M5 date cannot be before M4 date.', 'error')
      return
    }
    setSaving(true)
    const { type, floor, unitNum, existing } = selected
    const table = type === 'parking' ? 'project_parking_unit_completion' : 'project_unit_completion'
    const payload = { project_id: project.id, floor_id: floor.id, unit_number: unitNum, status: cellForm.status, m4_date: cellForm.m4_date || null, m5_date: cellForm.m5_date || null, updated_at: new Date().toISOString() }
    const { error } = existing
      ? await supabase.from(table).update(payload).eq('id', existing.id)
      : await supabase.from(table).insert(payload)
    setSaving(false)
    if (error) { showToast('Failed to save: ' + error.message, 'error'); return }
    showToast('Saved.', 'success')
    setSelected(null)
    const { data } = await supabase.from(table).select('*').eq('project_id', project.id)
    if (type === 'parking') setParkingCompletions(data ?? [])
    else setCompletions(data ?? [])
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

  const toggleRow = (type, floor) => {
    const count = floor.num_units ?? 0
    if (count === 0) return
    if (!multiSelectMode) setMultiSelectMode(true)
    const keys = Array.from({ length: count }, (_, i) => cellKey(type, floor.id, i + 1))
    setSelectedCells(prev => {
      const next = new Set(prev)
      const allSelected = keys.every(k => next.has(k))
      keys.forEach(k => allSelected ? next.delete(k) : next.add(k))
      return next
    })
  }

  const saveBulk = async () => {
    if (bulkForm.m4_bad || (bulkForm.m4_date && !isValidDate(bulkForm.m4_date))) {
      showToast('M4 date is not a valid calendar date.', 'error'); return
    }
    if (bulkForm.m5_bad || (bulkForm.m5_date && !isValidDate(bulkForm.m5_date))) {
      showToast('M5 date is not a valid calendar date.', 'error'); return
    }
    if (bulkForm.status === 'm5' && bulkForm.m4_date && bulkForm.m5_date && bulkForm.m5_date < bulkForm.m4_date) {
      showToast('M5 date cannot be before M4 date.', 'error'); return
    }
    setBulkSaving(true)
    const promises = []
    selectedCells.forEach(key => {
      const [type, floorId, unitNumStr] = key.split(':')
      const unitNum  = parseInt(unitNumStr)
      const cMap     = type === 'parking' ? parkingCompletionMap : completionMap
      const existing = cMap[`${floorId}-${unitNum}`] ?? null
      const table    = type === 'parking' ? 'project_parking_unit_completion' : 'project_unit_completion'
      const payload  = { project_id: project.id, floor_id: floorId, unit_number: unitNum, status: bulkForm.status, m4_date: bulkForm.m4_date || null, m5_date: bulkForm.m5_date || null, updated_at: new Date().toISOString() }
      promises.push(existing
        ? supabase.from(table).update(payload).eq('id', existing.id)
        : supabase.from(table).insert(payload)
      )
    })
    await Promise.all(promises)
    setBulkSaving(false)
    setBulkModal(false)
    showToast(`${selectedCells.size} unit${selectedCells.size !== 1 ? 's' : ''} updated.`, 'success')
    exitMultiSelect()
    loadAll()
  }

  if (project.development_type !== 'condominium') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <p className="text-sm text-gray-400 italic">This tab is only available for condominium projects.</p>
      </div>
    )
  }

  if (loading) {
    return <TriangleLoader label="Loading milestones…" />
  }

  return (
    <div>
      <BuildingSelector projectId={project.id} isAdmin={false} buildingId={buildingId} onChange={setBuildingId} />

      {/* Legend + multi-select toolbar — sticky within the scrollable tab panel */}
      <div className="sticky top-0 z-20 bg-white py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          {Object.entries(UNIT_STATUS_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-3.5 h-3.5 rounded-sm inline-block ${cfg.dot}`} />
              {cfg.label}
            </span>
          ))}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {multiSelectMode ? (
              <>
                <span className="text-xs text-gray-500">{selectedCells.size} selected</span>
                <button
                  onClick={() => { setBulkForm({ status: 'none', m4_date: '', m5_date: '' }); setBulkModal(true) }}
                  disabled={selectedCells.size === 0}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] disabled:opacity-40 transition"
                >
                  Set Status
                </button>
                <button onClick={exitMultiSelect} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setMultiSelectMode(true)}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
              >
                Multi-select
              </button>
            )}
          </div>
        )}
      </div>

      {/* Residential floors */}
      <div className="mt-8">
        <SectionHeader title="Unit Floors" />
        <UnitGrid floorList={floors} cMap={completionMap} maxU={maxUnits} type="unit" emptyMsg="No unit floors defined yet. Add them in the Development tab."
          isAdmin={isAdmin} multiSelectMode={multiSelectMode} selectedCells={selectedCells}
          onToggleCell={toggleCell} onOpenCell={openCell} onToggleRow={toggleRow} />
      </div>

      {/* Parking floors */}
      <div className="mt-8">
        <SectionHeader title="Parking Floors" />
        <UnitGrid floorList={parkingFloors} cMap={parkingCompletionMap} maxU={maxParkingUnits} type="parking" emptyMsg="No parking floors defined yet. Add them in the Development tab."
          isAdmin={isAdmin} multiSelectMode={multiSelectMode} selectedCells={selectedCells}
          onToggleCell={toggleCell} onOpenCell={openCell} onToggleRow={toggleRow} />
      </div>

      {/* Bulk status modal */}
      {bulkModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setBulkModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-0.5">Set Status</h3>
            <p className="text-xs text-gray-400 mb-4">Apply to {selectedCells.size} selected unit{selectedCells.size !== 1 ? 's' : ''}.</p>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(UNIT_STATUS_CONFIG).map(([val, cfg]) => (
                    <button key={val}
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10)
                        setBulkForm(f => ({
                          ...f,
                          status:  val,
                          m4_date: (val === 'm4' || val === 'm5') ? (f.m4_date || today) : f.m4_date,
                          m5_date: val === 'm5' ? (f.m5_date || today) : f.m5_date,
                        }))
                      }}
                      className={`py-2 px-1 rounded-lg border-2 text-[10px] font-semibold text-center transition leading-tight ${bulkForm.status === val ? `${cfg.cell} border-current shadow-sm` : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              {(bulkForm.status === 'm4' || bulkForm.status === 'm5') && (() => {
                const m4DateErr = bulkForm.m4_bad || !!(bulkForm.m4_date && !isValidDate(bulkForm.m4_date))
                const m5DateErr = bulkForm.m5_bad || !!(bulkForm.m5_date && !isValidDate(bulkForm.m5_date))
                const m5Err = !!(bulkForm.status === 'm5' && bulkForm.m4_date && bulkForm.m5_date && !m4DateErr && !m5DateErr && bulkForm.m5_date < bulkForm.m4_date)
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date</label>
                      <input type="date" value={bulkForm.m4_date} onChange={e => setBulkForm(f => ({ ...f, m4_date: e.target.value, m4_bad: e.target.validity.badInput }))} className={m4DateErr ? errCls : inputCls} />
                      {m4DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                    </div>
                    {bulkForm.status === 'm5' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M5 Date</label>
                        <input type="date" value={bulkForm.m5_date} onChange={e => setBulkForm(f => ({ ...f, m5_date: e.target.value, m5_bad: e.target.validity.badInput }))} className={(m5DateErr || m5Err) ? errCls : inputCls} />
                        {m5DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                        {m5Err && <p className="text-xs text-red-500 mt-1">M5 date cannot be before M4 date.</p>}
                      </div>
                    )}
                  </>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-black mb-0.5">
              {selected.type === 'parking' ? 'Parking' : 'Unit'} {selected.floor.physical_level}-{String(selected.unitNum).padStart(2, '0')}
            </h3>
            <p className="text-xs text-gray-400 mb-4">Set completion status and record date.</p>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(UNIT_STATUS_CONFIG).map(([val, cfg]) => (
                    <button key={val} onClick={() => {
                        const today = new Date().toISOString().slice(0, 10)
                        setCellForm(f => ({
                          ...f,
                          status:   val,
                          m4_date:  (val === 'm4' || val === 'm5') ? (f.m4_date || today) : f.m4_date,
                          m5_date:  val === 'm5' ? (f.m5_date || today) : f.m5_date,
                        }))
                      }}
                      className={`py-2 px-1 rounded-lg border-2 text-[10px] font-semibold text-center transition leading-tight ${cellForm.status === val ? `${cfg.cell} border-current shadow-sm` : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              {(cellForm.status === 'm4' || cellForm.status === 'm5') && (() => {
                const m4DateErr = cellForm.m4_bad || !!(cellForm.m4_date && !isValidDate(cellForm.m4_date))
                const m5DateErr = cellForm.m5_bad || !!(cellForm.m5_date && !isValidDate(cellForm.m5_date))
                const m5Err = !!(cellForm.status === 'm5' && cellForm.m4_date && cellForm.m5_date && !m4DateErr && !m5DateErr && cellForm.m5_date < cellForm.m4_date)
                const errCls = `${inputCls} !border-red-400 !bg-red-50 !text-red-600 focus:!ring-red-400`
                return (
                  <>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M4 Date</label>
                      {selected?.existing?.m4_date && !isAdmin
                        ? <p className="text-sm font-semibold text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">{fmt(selected.existing.m4_date)}</p>
                        : <input type="date" value={cellForm.m4_date} onChange={e => setCellForm(f => ({ ...f, m4_date: e.target.value, m4_bad: e.target.validity.badInput }))} className={m4DateErr ? errCls : inputCls} />
                      }
                      {m4DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                    </div>
                    {cellForm.status === 'm5' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">M5 Date</label>
                        {selected?.existing?.m5_date && !isAdmin
                          ? <p className="text-sm font-semibold text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">{fmt(selected.existing.m5_date)}</p>
                          : <input type="date" value={cellForm.m5_date} onChange={e => setCellForm(f => ({ ...f, m5_date: e.target.value, m5_bad: e.target.validity.badInput }))} className={(m5DateErr || m5Err) ? errCls : inputCls} />
                        }
                        {m5DateErr && <p className="text-xs text-red-500 mt-1">This date does not exist in the calendar.</p>}
                        {m5Err && <p className="text-xs text-red-500 mt-1">M5 date cannot be before M4 date.</p>}
                      </div>
                    )}
                  </>
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

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function ProjectDetailModal({ project: initialProject, isAdmin, onClose, onProjectUpdated, startEditing = false, startTab = 'Overview' }) {
  const [project, setProject] = useState(initialProject)
  const [tab, setTab] = useState(startTab)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const phase = PHASE_MAP[project.phase]
  const tabs = project.development_type === 'condominium'
    ? [...BASE_TABS, 'Completion (M4/M5)']
    : BASE_TABS

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleUpdated = (patch) => {
    const updated = { ...project, ...patch }
    setProject(updated)
    onProjectUpdated?.(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-7xl h-full sm:max-h-[92vh] flex flex-col overflow-hidden"
        style={{ borderTop: `4px solid ${phase?.color ?? '#ed6055'}` }}>

        {/* Modal header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-xl font-bold text-black leading-tight truncate">{project.name}</h2>
              {project.is_4ph_project && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ed6055]/10 text-[#ed6055] border border-[#ed6055]/20 flex-shrink-0">4PH</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {project.development_type && <span className="text-xs text-gray-400 capitalize">{project.development_type}</span>}
              {(project.city || project.province) && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">{[project.city, project.province].filter(Boolean).join(', ')}</span></>}
              {phase && <><span className="text-gray-300">·</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${phase.badge}`}>{phase.label}</span></>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition flex-shrink-0"
          >
            <XIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto bg-gray-50/50 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
                tab === t
                  ? 'border-[#ed6055] text-[#ed6055] bg-white'
                  : 'border-transparent text-gray-400 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={`flex-1 overflow-y-auto px-3 sm:px-6 ${tab === 'Overview' ? 'py-4 sm:py-5' : 'pb-4 sm:pb-5'}`}>
          {tab === 'Overview'          && <OverviewTab    project={project} isAdmin={isAdmin} onUpdated={handleUpdated} showToast={showToast} startEditing={startEditing} />}
          {tab === 'Development'       && <DevelopmentTab project={project} isAdmin={isAdmin} showToast={showToast} />}
          {tab === 'Permits'           && <ComplianceTab  project={project} isAdmin={isAdmin} showToast={showToast} />}
          {tab === 'Milestones'        && <MilestonesTab  project={project} isAdmin={isAdmin} showToast={showToast} />}
          {tab === 'Issues & Concerns' && <IssuesTab      project={project} isAdmin={isAdmin} showToast={showToast} />}
          {tab === 'Completion (M4/M5)' && <CompletionTab  project={project} isAdmin={isAdmin} showToast={showToast} />}
        </div>
      </div>

      {toast && (
        <div
          aria-live="polite"
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[60] flex items-center gap-2 ${toast.type === 'success' ? 'bg-black text-white' : 'bg-[#ed6055] text-white'}`}
        >
          {toast.type === 'success'
            ? <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            : <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

