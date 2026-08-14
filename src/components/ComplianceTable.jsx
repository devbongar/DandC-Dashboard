import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { computePermitStatus } from '../lib/permitUtils'
import { slugify } from '../pages/ProjectDetailPage'
import SearchDropdown from './SearchDropdown'
import TriangleLoader from './TriangleLoader'

// -- Multi-select searchable dropdown -----------------------------------------

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

// -- Status cells --------------------------------------------------------------

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

const OverdueCell = () => (
  <div className="flex items-center justify-center">
    <span className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
      <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    </span>
  </div>
)

const NACell = () => (
  <span className="text-xs text-gray-300 font-medium select-none">--</span>
)


// -- Main component ------------------------------------------------------------

export default function ComplianceTable({ id }) {
  const navigate = useNavigate()
  const [permits, setPermits]     = useState([])
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filterProjects, setFilterProjects] = useState([])
  const [sortOrder, setSortOrder] = useState('asc')
  const [type4ph, setType4ph]     = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef(null)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (!filtersOpen) return
    const handler = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filtersOpen])

  const fetchAll = async () => {
    setLoading(true)
    const [permitsRes, projectsRes] = await Promise.all([
      supabase.from('permits').select('id, project_id, name, status, actual_start, actual_finish, planned_finish'),
      supabase.from('projects').select('id, name, is_4ph_project').order('name'),
    ])
    if (permitsRes.data)  setPermits(permitsRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    setLoading(false)
  }

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

  const lookup = useMemo(() => {
    const map = {}
    permits.forEach(p => {
      if (!map[p.project_id]) map[p.project_id] = {}
      map[p.project_id][p.name] = computePermitStatus(p)
    })
    return map
  }, [permits])

  const permitNames = useMemo(() => {
    const visibleIds = new Set(visibleProjects.map(p => p.id))
    const seen = new Set()
    permits.filter(p => visibleIds.has(p.project_id)).forEach(p => seen.add(p.name))
    return [...seen].sort()
  }, [permits, visibleProjects])

  const projectOptions = useMemo(() => {
    const list = type4ph === 'all' ? projects : projects.filter(p => type4ph === 'yes' ? p.is_4ph_project : !p.is_4ph_project)
    return list.map(p => ({ value: p.id, label: p.name }))
  }, [projects, type4ph])

  const renderCell = (projectId, permitName) => {
    const status = lookup[projectId]?.[permitName]
    if (!status) return <NACell />
    if (status === 'acquired')    return <DoneCell />
    if (status === 'in-progress') return <OngoingCell />
    if (status === 'overdue')     return <OverdueCell />
    return <NotStartedCell />
  }

  const isEmpty = !loading && (projects.length === 0 || permitNames.length === 0)

  return (
    <section id={id} className="mb-0 bg-white rounded-xl border border-gray-200 shadow p-4 flex flex-col h-[600px]">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-[#ed6055]" />
          <h2 className="text-sm font-bold text-black">Permits &amp; Licensing</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {!loading && !isEmpty && (() => {
          const activeCount = [type4ph !== 'all', filterProjects.length > 0, sortOrder !== 'asc'].filter(Boolean).length
          return (
            <div ref={filtersRef} className="relative flex-shrink-0">
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
                style={{
                  background: filtersOpen || activeCount > 0 ? '#fff' : '#fafafa',
                  borderColor: activeCount > 0 ? '#ed6055' : (filtersOpen ? '#ed6055' : '#e5e7eb'),
                  color: activeCount > 0 ? '#ed6055' : '#6b7280',
                  boxShadow: filtersOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                Filters
                {activeCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                    {activeCount}
                  </span>
                )}
              </button>
              {filtersOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl"
                  style={{ width: 260, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)' }}
                >
                  <div className="p-3 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Type</p>
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
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Project</p>
                      <MultiSearchDropdown
                        fluid
                        options={projectOptions} values={filterProjects} onChange={setFilterProjects}
                        emptyLabel="All Projects" placeholder="Search projects…"
                        icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Sort</p>
                      <button
                        onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 transition"
                        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M7 12h10M11 17h2" />
                        </svg>
                        {sortOrder === 'asc' ? 'A → Z' : 'Z → A'}
                      </button>
                    </div>
                    {activeCount > 0 && (
                      <button
                        onClick={() => { setType4ph('all'); setFilterProjects([]); setSortOrder('asc') }}
                        className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
          <button
            onClick={() => navigate('/permits')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            title="Open Permits Dashboard"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Legend */}
      {!loading && !isEmpty && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-2 sm:gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Acquired</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-[#ed6055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </span>
            <span className="text-xs text-gray-500 font-medium">Overdue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-gray-300 font-medium">--</span>
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
          <div className="overflow-auto flex-1">
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

                  {/* Permit column headers -- rotated */}
                  {permitNames.map(name => (
                    <th
                      key={name}
                      className="sticky top-0 z-20 border-b border-r border-gray-200"
                      style={{ width: 52, minWidth: 52, background: '#fafafa', borderTop: '3px solid #e5e7eb' }}
                    >
                      <div className="flex flex-col items-center justify-end h-32 pb-2.5 px-1">
                        <span
                          title={name}
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 108 }}
                          className="text-[11px] font-medium text-gray-500 leading-tight overflow-hidden"
                        >
                          {name}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {visibleProjects.map(proj => (
                  <tr key={proj.id} className="hover:bg-[#ed6055]/[0.02] transition">
                    <td className="sticky left-0 z-10 border-r border-b border-gray-100 px-3 sm:px-4 py-3 bg-white">
                      <button
                        onClick={() => navigate(`/projects/${slugify(proj.name)}?tab=Permits`, { state: { id: proj.id } })}
                        className="block truncate max-w-[130px] sm:max-w-[200px] text-xs font-semibold text-gray-800 hover:text-[#ed6055] transition-colors text-left"
                        title={proj.name}
                      >
                        {proj.name}
                      </button>
                    </td>
                    {permitNames.map(name => (
                      <td
                        key={name}
                        className="border-r border-b border-gray-100 p-1.5 text-center align-middle"
                        style={{ width: 52, background: '#fff' }}
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

    </section>
  )
}
