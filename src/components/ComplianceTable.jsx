import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import SearchDropdown from './SearchDropdown'
import TriangleLoader from './TriangleLoader'

// ── Multi-select searchable dropdown ─────────────────────────────────────────

function MultiSearchDropdown({ options, values, onChange, emptyLabel, placeholder, icon, minWidth = 130, fluid = false }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef(null)
  const inputRef          = useRef(null)

  const allSelected = values.length === 0

  const triggerLabel = allSelected
    ? emptyLabel
    : values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? emptyLabel)
      : `${values.length} selected`

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = () => {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const toggle = (val) => {
    if (values.includes(val)) onChange(values.filter(v => v !== val))
    else onChange([...values, val])
  }

  const clearAll = () => { onChange([]); setOpen(false); setQuery('') }

  return (
    <div ref={ref} className={`relative ${fluid ? 'w-full' : 'flex-shrink-0'}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => open ? setOpen(false) : openDropdown()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (open ? setOpen(false) : openDropdown())}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all select-none"
        style={{
          background: open ? '#fff' : '#fafafa',
          borderColor: open ? '#ed6055' : (!allSelected ? '#ed6055' : '#e5e7eb'),
          color: allSelected ? '#9ca3af' : '#111827',
          boxShadow: open ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          minWidth: fluid ? undefined : minWidth,
          maxWidth: fluid ? undefined : 220,
          width: fluid ? '100%' : undefined,
          cursor: 'pointer',
        }}
      >
        {icon && (
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        )}
        <span className="flex-1 text-left truncate font-medium">{triggerLabel}</span>
        {!allSelected && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); clearAll() }}
            className="flex-shrink-0 text-gray-400 hover:text-[#ed6055] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {allSelected && (
          <svg
            className="w-3 h-3 flex-shrink-0 text-gray-400 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            width: 240,
            background: '#fff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          }}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-xs text-black placeholder-gray-400 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {/* Clear all / select all */}
            {!allSelected && (
              <button
                type="button"
                onClick={clearAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50 border-b border-gray-50"
                style={{ color: '#ed6055' }}
              >
                <span className="font-semibold italic">Clear all</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center italic">No results found</p>
            ) : (
              filtered.map(o => {
                const checked = values.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50"
                    style={{ color: checked ? '#ed6055' : '#111827' }}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors"
                      style={{
                        background: checked ? '#ed6055' : '#fff',
                        borderColor: checked ? '#ed6055' : '#d1d5db',
                      }}
                    >
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span className={checked ? 'font-semibold' : 'font-medium'}>{o.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status cells ──────────────────────────────────────────────────────────────

const DoneCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  </div>
)

const OngoingCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </span>
  </div>
)

const NotStartedCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
      <svg className="w-3.5 h-3.5 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    </span>
  </div>
)

const NACell = () => (
  <span className="text-xs text-gray-300 font-medium select-none">—</span>
)


// ── Main component ────────────────────────────────────────────────────────────

export default function ComplianceTable({ id }) {
  const [permits, setPermits]     = useState([])
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterProjects, setFilterProjects] = useState([])
  const [standardNames, setStandardNames]   = useState([])
  const [highlightedNames, setHighlightedNames] = useState(new Set())
  const [sortOrder, setSortOrder] = useState('asc')
  const [type4ph, setType4ph]     = useState('all')
  const [tooltip, setTooltip]     = useState(null) // { x, y, text }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [permitsRes, projectsRes, standardsRes] = await Promise.all([
      supabase.from('project_permits').select('id, project_id, permit_name, status, remarks, parent_id'),
      supabase.from('projects').select('id, name, is_4ph_project').order('name'),
      supabase.from('standard_permits').select('id, permit_name, parent_id, is_highlighted').is('parent_id', null).order('sort_order'),
    ])
    if (permitsRes.data)   setPermits(permitsRes.data)
    if (projectsRes.data)  setProjects(projectsRes.data)
    if (standardsRes.data) {
      setStandardNames(standardsRes.data.map(s => s.permit_name))
      setHighlightedNames(new Set(standardsRes.data.filter(s => s.is_highlighted).map(s => s.permit_name)))
    }
    setLoading(false)
  }

  const permitNames = standardNames

  const lookup = useMemo(() => {
    const map = {}
    permits.filter(p => !p.parent_id).forEach(p => {
      if (!map[p.project_id]) map[p.project_id] = {}
      map[p.project_id][p.permit_name] = { status: p.status, remarks: p.remarks ?? null }
    })
    return map
  }, [permits])

  const visibleProjects = useMemo(() => {
    let list = [...projects]
    if (type4ph !== 'all') list = list.filter(p => type4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project)
    if (filterProjects.length > 0) list = list.filter(p => filterProjects.includes(p.id))
    list.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, filterProjects, sortOrder, type4ph])

  const projectOptions = useMemo(() => {
    const list = type4ph === 'all' ? projects : projects.filter(p => type4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project)
    return list.map(p => ({ value: p.id, label: p.name }))
  }, [projects, type4ph])

  const showTooltip = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top, text })
  }
  const hideTooltip = () => setTooltip(null)

  const renderCell = (projectId, permitName) => {
    const entry = lookup[projectId]?.[permitName]
    if (!entry) return <NACell />
    const { status, remarks } = entry
    const icon = status === 'done' ? <DoneCell /> : status === 'ongoing' ? <OngoingCell /> : <NotStartedCell />
    if (!remarks) return icon
    return (
      <div
        className="cursor-pointer relative"
        onMouseEnter={e => showTooltip(e, remarks)}
        onMouseLeave={hideTooltip}
        onClick={e => { e.stopPropagation(); tooltip?.text === remarks ? hideTooltip() : showTooltip(e, remarks) }}
      >
        {icon}
        {/* dot indicator for cells with remarks */}
        <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-blue-400 ring-1 ring-white" />
      </div>
    )
  }

  const isEmpty = !loading && (projects.length === 0 || standardNames.length === 0)

  return (
    <section id={id} className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col h-[600px]">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Permits &amp; Licensing</h2>
        </div>
        {!loading && !isEmpty && (
          <span className="text-xs font-bold text-[#ed6055]">
            {visibleProjects.length}{filterProjects.length > 0 ? ` / ${projects.length}` : ''} project{projects.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filters */}
      {!loading && !isEmpty && (
        <div className="flex flex-col gap-2 mb-4">

          {/* ── Mobile layout (< sm) ── */}
          <div className="flex flex-col gap-2 sm:hidden">
            {/* Type toggle — full width */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-lg w-full"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
            >
              {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setType4ph(t.key); setFilterProjects([]) }}
                  className="relative flex-1 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                  style={type4ph === t.key ? {
                    background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                    color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                  } : { color: '#6b7280', background: 'transparent' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Project + Sort side by side */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <MultiSearchDropdown
                  fluid
                  options={projectOptions} values={filterProjects} onChange={setFilterProjects}
                  emptyLabel="All Projects" placeholder="Search projects…"
                  icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                />
              </div>
              <button
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M7 12h10M11 17h2" />
                </svg>
                {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
              </button>
            </div>
          </div>

          {/* ── Desktop layout (sm+) ── */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <div
              className="flex items-center gap-0.5 flex-shrink-0 p-0.5 rounded-lg"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
            >
              {[{ key: 'all', label: 'All' }, { key: 'yes', label: '4PH' }, { key: 'no', label: 'Non-4PH' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => { setType4ph(t.key); setFilterProjects([]) }}
                  className="relative px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-200 rounded-md"
                  style={type4ph === t.key ? {
                    background: 'linear-gradient(135deg, #ed6055 0%, #c94f45 100%)',
                    color: '#fff', boxShadow: '0 1px 4px rgba(237,96,85,0.35)',
                  } : { color: '#6b7280', background: 'transparent' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <MultiSearchDropdown
              options={projectOptions} values={filterProjects} onChange={setFilterProjects}
              emptyLabel="All Projects" placeholder="Search projects…" minWidth={130}
              icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M7 12h10M11 17h2" />
              </svg>
              {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
            </button>
          </div>

        </div>
      )}

      {/* Legend */}
      {!loading && !isEmpty && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-2 sm:gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Ongoing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Not Yet Started</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-gray-300 font-medium">—</span>
            </span>
            <span className="text-xs text-gray-500 font-medium">Not Applicable</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col">
        {loading ? <TriangleLoader label="Loading permits…" /> : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <svg className="w-5 h-5 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-xs text-gray-300 italic">
              {projects.length === 0 ? 'No projects yet.' : 'No permits recorded yet.'}
            </p>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="w-6 h-6 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
            </svg>
            <p className="text-sm text-gray-400">No projects match your filters.</p>
            <button onClick={() => setFilterProjects([])} className="text-xs text-[#ed6055] underline underline-offset-2 cursor-pointer">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-auto flex-1" onClick={hideTooltip}>
            <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {/* Top-left sticky corner */}
                  <th
                    className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 min-w-[130px] sm:min-w-[200px]"
                    style={{ background: '#fff', borderTop: '3px solid #ed6055' }}
                  >
                    <div className="flex items-end h-32 px-4 pb-3">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Project</span>
                    </div>
                  </th>

                  {/* Permit column headers — rotated */}
                  {permitNames.map(name => {
                    const hl = highlightedNames.has(name)
                    return (
                      <th
                        key={name}
                        className="sticky top-0 z-20 border-b border-r border-gray-200"
                        style={{
                          width: 52, minWidth: 52,
                          background: hl ? '#fffbeb' : '#fafafa',
                          borderTop: `3px solid ${hl ? '#f59e0b' : '#e5e7eb'}`,
                        }}
                      >
                        <div className="flex flex-col items-center justify-end h-32 pb-2.5 px-1 gap-0.5">
                          {hl && (
                            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth={1}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                            </svg>
                          )}
                          <span
                            title={name}
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 108 }}
                            className={`leading-tight overflow-hidden ${hl ? 'text-[11px] font-bold text-amber-700' : 'text-[11px] font-medium text-gray-500'}`}
                          >
                            {name}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {visibleProjects.map(proj => (
                  <tr key={proj.id} className="hover:bg-[#ed6055]/[0.02] transition">
                    <td className="sticky left-0 z-10 border-r border-b border-gray-100 px-3 sm:px-4 py-3 bg-white">
                      <span className="block truncate max-w-[130px] sm:max-w-[200px] text-xs font-semibold text-gray-800" title={proj.name}>
                        {proj.name}
                      </span>
                    </td>
                    {permitNames.map(name => (
                      <td
                        key={name}
                        className="border-r border-b border-gray-100 p-1.5 text-center align-middle"
                        style={{ width: 52, background: highlightedNames.has(name) ? '#fffbeb' : '#fff' }}
                      >
                        {renderCell(proj.id, name)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tooltip && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <div className="bg-gray-900 text-white rounded-lg px-3 py-2 shadow-xl max-w-[240px] break-words text-left leading-relaxed whitespace-pre-wrap" style={{ fontSize: 16 }}>
            {tooltip.text}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </section>
  )
}
