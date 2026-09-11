import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import useProfile from '../../hooks/useProfile'
import PermitDetail from '../../components/PermitDetail'
import { computePermitStatus, STATUS_BADGE } from '../../lib/permitUtils'
import SearchDropdown from '../../components/SearchDropdown'
import PermitsGanttView from '../../components/PermitsGanttView'
import AdminLayout from '../../components/AdminLayout'
import * as XLSX from 'xlsx'
import { exportPermitsToSheet, validatePermitImportSheet } from '../../lib/permitExcelUtils'


const CARDS = [
  {
    label: 'Pending', key: 'pending', filterKey: 'pending',
    bg: 'linear-gradient(135deg, #6b7280 0%, #1f2937 100%)',
    icon: <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>,
  },
  {
    label: 'In Progress', key: 'inProgress', filterKey: 'in-progress',
    bg: 'linear-gradient(135deg, #d97706 0%, #451a03 100%)',
    icon: <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l4-4 4 4 4-6 4 2"/></svg>,
  },
  {
    label: 'Acquired', key: 'acquired', filterKey: 'acquired',
    bg: 'linear-gradient(135deg, #16a34a 0%, #052e16 100%)',
    icon: <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  },
  {
    label: 'Overdue', key: 'overdue', filterKey: 'overdue',
    bg: 'linear-gradient(135deg, #dc2626 0%, #1a0000 100%)',
    icon: <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  },
  {
    label: 'With Issues', key: 'withIssues', filterKey: 'with-issues',
    bg: 'linear-gradient(135deg, #ea580c 0%, #431407 100%)',
    icon: <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>,
  },
]

function IssueIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400 drop-shadow-sm flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

export default function PermitsDashboard() {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [filterOpen,     setFilterOpen]     = useState(false)
  const [permits,        setPermits]        = useState([])
  const [projects,       setProjects]       = useState([])
  const [dataLoading,    setDataLoading]    = useState(true)
  const [filterProjects,  setFilterProjects]  = useState(new Set())
  const [projectSearch,   setProjectSearch]   = useState('')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [search,         setSearch]         = useState('')
  const [selected,       setSelected]       = useState(null)
  const [view,           setView]           = useState('card')
  const [importPreview,  setImportPreview]  = useState(null) // { valid, skipped }
  const [importing,      setImporting]      = useState(false)

  const filterRef       = useRef(null)
  const cardScrollRef   = useRef(null)
  const mobileActionsRef = useRef(null)
  const [cardScrollPos, setCardScrollPos]     = useState(0)
  const [showMobileActions, setShowMobileActions] = useState(false)


  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target)) setShowMobileActions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setDataLoading(true)
    const [{ data: pData }, { data: projData }] = await Promise.all([
      supabase
        .from('permits')
        .select('*, projects(name), permit_requirements(id, is_complete), permit_issues(id, status)')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('projects').select('id, name').order('name'),
    ])
    setPermits(pData ?? [])
    setProjects(projData ?? [])
    setDataLoading(false)
  }

  function scrollCards(dir) {
    cardScrollRef.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  }

  const rows = permits.filter(p => {
    const effectiveStatus = computePermitStatus(p)
    const hasIssue = (p.permit_issues ?? []).some(i => i.status === 'open')
    const matchProject = filterProjects.size === 0 || filterProjects.has(p.project_id)
    const matchStatus  = filterStatus === 'all' ? true
      : filterStatus === 'with-issues' ? hasIssue
      : effectiveStatus === filterStatus
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.id?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      (p.projects?.name ?? '').toLowerCase().includes(q) ||
      (p.responsible_person ?? '').toLowerCase().includes(q)
    return matchProject && matchStatus && matchSearch
  })

  const counts = {
    pending:    rows.filter(p => computePermitStatus(p) === 'pending').length,
    inProgress: rows.filter(p => computePermitStatus(p) === 'in-progress').length,
    acquired:   rows.filter(p => computePermitStatus(p) === 'acquired').length,
    overdue:    rows.filter(p => computePermitStatus(p) === 'overdue').length,
    withIssues: rows.filter(p => (p.permit_issues ?? []).some(i => i.status === 'open')).length,
  }

  const hasActiveFilter = filterStatus !== 'all' || filterProjects.size > 0 || search !== ''

  function clearFilters() {
    setFilterStatus('all')
    setFilterProjects(new Set())
    setSearch('')
  }

  function toggleFilterProject(id) {
    setFilterProjects(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const importInputRef = useRef(null)

  function handleExport() {
    const sheetRows = exportPermitsToSheet(rows)
    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Permits')
    XLSX.writeFile(wb, 'permits.xlsx')
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const existingIds = new Set(permits.map(p => p.id))
    const preview = validatePermitImportSheet(sheetRows, existingIds)
    if (!preview.valid.length && !preview.skipped.length) return
    setImportPreview(preview)
  }

  async function confirmImport() {
    if (!importPreview?.valid.length) { setImportPreview(null); return }
    setImporting(true)
    for (const { id, ...fields } of importPreview.valid) {
      await supabase.from('permits').update(fields).eq('id', id)
    }
    setImportPreview(null)
    setImporting(false)
    await fetchAll()
  }

  const headerActions = (
    <div className="hidden sm:contents">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search permits or projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-1.5 text-sm rounded-lg bg-black/[0.05] text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/30 focus:bg-black/[0.07] transition w-96"
        />
      </div>

      {/* Filter button + popover */}
      <div className="relative" ref={filterRef}>
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
          style={{
            background: filterOpen || filterStatus !== 'all' || filterProjects.size > 0 ? '#fff' : '#f9fafb',
            borderColor: filterStatus !== 'all' || filterProjects.size > 0 ? '#ed6055' : filterOpen ? '#ed6055' : '#e5e7eb',
            color: filterStatus !== 'all' || filterProjects.size > 0 ? '#ed6055' : '#6b7280',
            boxShadow: filterOpen ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          {(filterStatus !== 'all' || filterProjects.size > 0) && (
            <span className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
              {[filterStatus !== 'all', filterProjects.size > 0].filter(Boolean).length}
            </span>
          )}
        </button>
        {filterOpen && (
          <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64 flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Status</p>
              <div className="flex flex-wrap gap-1">
                {[{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'in-progress', label: 'In Progress' }, { key: 'acquired', label: 'Acquired' }, { key: 'overdue', label: 'Overdue' }, { key: 'with-issues', label: 'With Issues' }].map(s => (
                  <button key={s.key} onClick={() => setFilterStatus(s.key)}
                    className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={filterStatus === s.key
                      ? { background: '#ed6055', color: '#fff' }
                      : { background: '#f3f4f6', color: '#6b7280' }}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Project</p>
                {filterProjects.size > 0 && (
                  <button onClick={() => setFilterProjects(new Set())} className="text-[10px] text-[#ed6055] hover:underline">Clear</button>
                )}
              </div>
              <div className="relative mb-1.5">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  className="w-full pl-6 pr-2 py-1 text-xs rounded-lg bg-gray-100 border-none outline-none focus:ring-1 focus:ring-[#ed6055]"
                />
              </div>
              <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                {projects.filter(proj => proj.name.toLowerCase().includes(projectSearch.toLowerCase())).map(proj => {
                  const checked = filterProjects.has(proj.id)
                  return (
                    <button
                      key={proj.id}
                      onClick={() => toggleFilterProject(proj.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left w-full"
                    >
                      <div className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${checked ? 'bg-[#ed6055] border-[#ed6055]' : 'border-gray-300'}`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-gray-700 truncate">{proj.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {(filterStatus !== 'all' || filterProjects.size > 0) && (
              <button onClick={clearFilters}
                className="w-full py-1.5 text-xs font-semibold text-[#ed6055] border border-[#ed6055]/30 rounded-lg hover:bg-[#ed6055]/5 transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Export / Import */}
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all border-gray-200 text-gray-600 bg-gray-50 hover:bg-white hover:border-gray-300"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export
      </button>
      <button
        onClick={() => importInputRef.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all border-gray-200 text-gray-600 bg-gray-50 hover:bg-white hover:border-gray-300"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5V21" />
        </svg>
        Import
      </button>
      <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
    </div>
  )

  const activeFilterCount = [filterStatus !== 'all', filterProjects.size > 0].filter(Boolean).length

  const mobileSearchRow = (
    <div className="flex items-stretch gap-2 px-0">
      <div className="relative flex-1">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search permits..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-9 py-4 text-sm rounded-lg text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ed6055]/40 transition"
          style={{ background: '#ffffff' }}
        />
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded transition-all"
          style={{ color: activeFilterCount > 0 ? '#ed6055' : filterOpen ? '#ed6055' : '#9ca3af' }}
        >
          <span className="relative flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-[#ed6055] text-white text-[7px] font-bold flex items-center justify-center leading-none">{activeFilterCount}</span>
            )}
          </span>
        </button>
      </div>
    </div>
  )

  const mobileTitleActionsBtn = (
    <div className="relative" ref={mobileActionsRef}>
      <button
        onClick={() => setShowMobileActions(v => !v)}
        className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
        style={{ background: 'transparent', color: showMobileActions ? '#ed6055' : 'rgba(255,255,255,0.85)' }}
      >
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" stroke="none">
          <path d="M12 7.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM12 19.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>
      {showMobileActions && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-xl z-50 overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', animation: 'ph1-dropdown 0.15s ease-out both' }}>
          <button onClick={() => { setShowMobileActions(false); handleExport() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="font-medium">Export</span>
          </button>
          <div style={{ height: 1, background: '#f3f4f6', margin: '0 12px' }} />
          <button onClick={() => { setShowMobileActions(false); importInputRef.current?.click() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5V21" />
            </svg>
            <span className="font-medium">Import</span>
          </button>
        </div>
      )}
    </div>
  )

  return (
    <AdminLayout title="Permits Monitoring" actions={headerActions} mobileActionsRow={mobileSearchRow} mobileTitleActions={mobileTitleActionsBtn} mobileBg="linear-gradient(180deg, #2e2e2e 0%, #636363 100%)">
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-5">

            {/* Summary cards */}
            <div className="relative -mx-4 sm:mx-0">
              <div
                ref={cardScrollRef}
                onScroll={() => setCardScrollPos(cardScrollRef.current?.scrollLeft ?? 0)}
                className="flex gap-3 overflow-x-auto py-2 px-4 sm:grid sm:grid-cols-5 sm:overflow-visible sm:py-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {CARDS.map(c => {
                  const active = filterStatus === c.filterKey
                  const total  = permits.length
                  const pct    = total > 0 ? Math.round((counts[c.key] / total) * 100) : 0
                  return (
                    <button
                      key={c.label}
                      onClick={() => setFilterStatus(active ? 'all' : c.filterKey)}
                      className="flex-none w-36 sm:w-auto text-left rounded-xl border px-4 py-3 flex flex-col gap-2 overflow-hidden transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none"
                      style={{
                        background: c.bg,
                        borderColor: active ? 'rgba(255,255,255,0.6)' : 'transparent',
                        boxShadow: active
                          ? '0 0 0 2px rgba(255,255,255,0.5), 0 4px 16px rgba(0,0,0,0.25)'
                          : '0 2px 8px rgba(0,0,0,0.2)',
                        transform: active ? 'translateY(-2px)' : undefined,
                      }}
                    >
                      <span className="text-xs font-bold tracking-wide leading-tight block" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.label}</span>
                      <div className="flex flex-row items-center gap-3">
                        <span className="text-2xl font-bold tabular-nums leading-tight text-white flex-1">{counts[c.key]}</span>
                        <div className="flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }}>{c.icon}</div>
                      </div>
                      <span className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {pct}% of total
                      </span>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => scrollCards(-1)} aria-label="Scroll left"
                className={`sm:hidden absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-r from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollPos > 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              <button onClick={() => scrollCards(1)} aria-label="Scroll right"
                className={`sm:hidden absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-gradient-to-l from-gray-50 to-transparent transition-opacity duration-200 ${cardScrollRef.current && cardScrollPos < cardScrollRef.current.scrollWidth - cardScrollRef.current.clientWidth - 8 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </div>


            {/* View toggle */}
            <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('card')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'card' ? 'bg-white shadow border border-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Cards
              </button>
              <button
                onClick={() => setView('gantt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'gantt' ? 'bg-white shadow border border-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h12M3 12h8M3 18h16" />
                </svg>
                Gantt
              </button>
            </div>

            {/* Gantt view */}
            {view === 'gantt' && (
              <div style={{ position: 'sticky', top: 24, height: 'calc(100dvh - 24px)' }}>
                <PermitsGanttView permits={rows} onSelectPermit={setSelected} />
              </div>
            )}

            {/* Card view: mobile list + desktop table */}
            {view === 'card' && (
            <>
            <div className="space-y-6">
              {rows.length === 0 && (
                <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
                  <p className="text-sm font-medium text-gray-500">No permits found</p>
                  {hasActiveFilter && (
                    <button onClick={clearFilters} className="mt-2 text-xs text-[#ed6055] hover:underline">Clear filters</button>
                  )}
                </div>
              )}
              {(() => {
                const map = {}
                for (const p of rows) {
                  const key = p.project_id
                  if (!map[key]) map[key] = { name: p.projects?.name ?? p.project_id, permits: [] }
                  map[key].permits.push(p)
                }
                return Object.entries(map).map(([pid, group]) => (
                  <div key={pid}>
                    {/* Project header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{group.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">{group.permits.length}</span>
                    </div>
                    {/* Card grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.permits.map(permit => {
                        const status   = computePermitStatus(permit)
                        const reqs     = permit.permit_requirements ?? []
                        const reqDone  = reqs.filter(r => r.is_complete).length
                        const hasIssue = (permit.permit_issues ?? []).some(i => i.status === 'open')
                        const delayed  = permit.planned_finish && status !== 'acquired'
                          ? Math.max(0, Math.floor((Date.now() - new Date(permit.planned_finish).getTime()) / 86400000)) : 0
                        const reqPct   = reqs.length > 0 ? Math.round((reqDone / reqs.length) * 100) : null

                        return (
                          <button
                            key={permit.id}
                            onClick={() => setSelected(permit)}
                            className="text-left rounded-xl p-4 transition-all duration-200 ease-out flex flex-col gap-3 hover:-translate-y-1 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6055]/50"
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e5e7eb',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.10)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'}
                          >
                            {/* 3-col 2-row layout */}
                            <div className="grid grid-cols-3 gap-x-3 gap-y-2">

                              {/* Row 1 */}
                              {/* Col 1: icon + name + issue flag */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{permit.name}</p>
                                  {hasIssue && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold w-fit mt-0.5">
                                      <IssueIcon />Issue
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Col 2: requirement ring */}
                              <div className="flex items-center justify-center">
                                {reqs.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <RequirementsRing done={reqDone} total={reqs.length} />
                                    <div>
                                      <p className="text-[10px] text-gray-400 leading-tight">out of {reqs.length}</p>
                                      <p className="text-[11px] font-semibold leading-tight mt-0.5 text-gray-500">reqt completed</p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Col 3: status badge */}
                              <div className="flex items-start justify-end">
                                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                              </div>

                              {/* Row 2 divider */}
                              <div className="col-span-3" style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

                              {/* Col 1: planned finish */}
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Planned</span>
                                <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.planned_finish ?? '--'}</span>
                              </div>

                              {/* Col 2: forecast finish */}
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Forecast</span>
                                <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{permit.forecast_finish ?? '--'}</span>
                              </div>

                              {/* Col 3: days delayed / on track */}
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-[9px] text-gray-400 uppercase tracking-wide">Delay</span>
                                {delayed > 0
                                  ? <span className="text-[10px] font-semibold text-red-500">{delayed}d</span>
                                  : <span className="text-[10px] font-semibold text-emerald-600">On track</span>
                                }
                              </div>

                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>

            </>
            )}

        </div>
      </div>

      {selected && (
        <PermitDetail
          permit={selected}
          isAdmin={isAdmin}
          isHead={profile?.role === 'head'}
          isReporter={profile?.role === 'reporter'}
          isViewer={profile?.role === 'viewer'}
          currentUserId={profile?.id}
          projectName={selected?.projects?.name}
          onClose={() => setSelected(null)}
          onUpdated={fetchAll}
        />
      )}

      {/* Import preview modal */}
      {importPreview && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]" style={{ animation: 'ph1-dropdown 0.15s ease-out both' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Import Preview</h2>
                <p className="text-xs text-gray-400 mt-0.5">Review before applying changes</p>
              </div>
              <button onClick={() => setImportPreview(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stats */}
            <div className="flex gap-3 px-5 py-3 flex-shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-emerald-700">{importPreview.valid.length} will import</span>
              </div>
              {importPreview.skipped.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs font-semibold text-red-600">{importPreview.skipped.length} skipped</span>
                </div>
              )}
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1 px-5 pb-3 flex flex-col gap-1.5">
              {importPreview.valid.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium text-emerald-800 truncate">{p.id}</span>
                </div>
              ))}
              {importPreview.skipped.map((p, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-px" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-red-700 truncate block">{p.permitId || '(no ID)'}{p.permitName ? ` â€” ${p.permitName}` : ''}</span>
                    <span className="text-[10px] text-red-400">{p.reason}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setImportPreview(null)} disabled={importing}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40">
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={!importPreview.valid.length || importing}
                className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: '#ed6055' }}
              >
                {importing ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>Import {importPreview.valid.length} {importPreview.valid.length === 1 ? 'permit' : 'permits'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// -- Helper components ---------------------------------------------------------
function RequirementsRing({ done, total }) {
  const size = 48
  const strokeWidth = 4
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  const dash = pct * circ
  const color = done === total ? '#10b981' : '#ed6055'
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        dominantBaseline="middle" textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px`, fontSize: 13, fontWeight: 700, fill: color }}
      >
        {done}
      </text>
    </svg>
  )
}

